import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const BOT_PROCESS = "Kekse-Bot";
const SELF_PROCESS = "Kekse-Restore";
const TIMEZONE = "Europe/Berlin";
const BACKUP_DIR = path.join(__dirname, "backups");
const BACKUP_PATTERN = /^database-backup-\d{2}-\d{2}-\d{4}\.json\.gz$/;
const SAFETY_PREFIX = "pre-restore-";
const SAFETY_KEEP = 2;
const LOG_DIR = path.join(__dirname, "logs");
const { EJSON } = mongoose.mongo.BSON;

function botLogDay(date) {
  return date
    .toLocaleDateString("de-DE", {
      timeZone: TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\./g, "-");
}

function botLog(type, message) {
  (type === "error" ? console.error : console.log)(message);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(LOG_DIR, `${botLogDay(new Date())}.log`),
      JSON.stringify({ t: Date.now(), type, m: message }) + "\n",
    );
  } catch {}
}

function pm2(args) {
  return new Promise(function (resolve, reject) {
    execFile("pm2", args, function (error, stdout, stderr) {
      if (error) reject(new Error((stderr || stdout || error.message).trim()));
      else resolve(stdout);
    });
  });
}

async function notify(text) {
  const token = process.env.BOT_TOKEN;
  if (!token) return;
  try {
    const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
    const dm = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers,
      body: JSON.stringify({ recipient_id: config.users.sysadmin }),
    }).then(function (r) {
      return r.json();
    });
    if (!dm.id) return;
    await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: text.slice(0, 1900) }),
    });
  } catch {}
}

function readBackup(filePath) {
  const raw = zlib.gunzipSync(fs.readFileSync(filePath)).toString("utf8");
  const parsed = EJSON.parse(raw, { relaxed: false });
  const collections = parsed && parsed.collections;
  if (!collections || typeof collections !== "object") {
    throw new Error("Die Backup-Datei hat kein gültiges Format.");
  }
  let documents = 0;
  for (const [name, docs] of Object.entries(collections)) {
    if (!Array.isArray(docs)) throw new Error(`Collection ${name} ist ungültig.`);
    documents += docs.length;
  }
  if (!documents) throw new Error("Das Backup enthält keine Dokumente.");
  return { collections, documents };
}

async function readAll(db) {
  const list = await db.listCollections({}, { nameOnly: true }).toArray();
  const result = {};
  for (const { name } of list) {
    if (name.startsWith("system.")) continue;
    result[name] = await db.collection(name).find({}).toArray();
  }
  return result;
}

async function writeAll(db, collections) {
  for (const [name, docs] of Object.entries(collections)) {
    if (name.startsWith("system.")) continue;
    const collection = db.collection(name);
    await collection.deleteMany({});
    for (let i = 0; i < docs.length; i += 500) {
      await collection.insertMany(docs.slice(i, i + 500), { ordered: false });
    }
    const count = await collection.countDocuments();
    if (count !== docs.length) {
      throw new Error(`Collection ${name}: ${count} statt ${docs.length} Dokumente.`);
    }
  }
}

function saveSafety(snapshot) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${SAFETY_PREFIX}${stamp}.json.gz`;
  const payload = EJSON.stringify(
    { createdAt: new Date().toISOString(), collections: snapshot },
    { relaxed: false },
  );
  fs.writeFileSync(path.join(BACKUP_DIR, name), zlib.gzipSync(payload), { mode: 0o600 });
  return name;
}

function pruneSafety() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter(function (f) {
      return f.startsWith(SAFETY_PREFIX) && f.endsWith(".json.gz");
    })
    .sort()
    .reverse();
  for (const old of files.slice(SAFETY_KEEP)) fs.unlinkSync(path.join(BACKUP_DIR, old));
}

async function main(fileName) {
  if (!fileName || !BACKUP_PATTERN.test(fileName)) throw new Error("Ungültiger Backup-Dateiname.");
  const filePath = path.join(BACKUP_DIR, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Die Datei ${fileName} existiert nicht.`);
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI fehlt in der .env");
  botLog("info", `Backup-Wiederherstellung gestartet: ${fileName}`);
  const backup = readBackup(filePath);
  let stopAttempted = false;
  let safety = null;
  let startError = null;
  try {
    stopAttempted = true;
    await pm2(["stop", BOT_PROCESS]);
    botLog("info", `${BOT_PROCESS} gestoppt.`);
    const connection = await mongoose
      .createConnection(uri, { serverSelectionTimeoutMS: 10000 })
      .asPromise();
    try {
      const db = connection.db;
      const snapshot = await readAll(db);
      safety = saveSafety(snapshot);
      pruneSafety();
      botLog("info", `Sicherung des aktuellen Stands erstellt: ${safety}`);
      try {
        await writeAll(db, backup.collections);
      } catch (error) {
        botLog("error", `Wiederherstellung fehlgeschlagen, stelle vorherigen Stand wieder her: ${error.message}`);
        await writeAll(db, snapshot);
        throw new Error(`${error.message} (der vorherige Stand wurde wiederhergestellt)`);
      }
    } finally {
      await connection.close().catch(function () {});
    }
  } finally {
    if (stopAttempted) {
      try {
        await pm2(["restart", BOT_PROCESS]);
        botLog("info", `${BOT_PROCESS} neu gestartet.`);
      } catch (error) {
        startError = error;
        botLog("error", `Start von ${BOT_PROCESS} fehlgeschlagen: ${error.message}`);
      }
    }
  }
  if (startError) {
    throw new Error(`Das Backup wurde geladen, aber der Bot konnte nicht gestartet werden: ${startError.message}`);
  }
  return {
    safety,
    collections: Object.keys(backup.collections).length,
    documents: backup.documents,
  };
}

const fileName = process.argv[2];
let exitCode = 0;
try {
  const result = await main(fileName);
  const message = `Backup \`${fileName}\` wurde geladen (${result.collections} Collections, ${result.documents} Dokumente). Der vorherige Stand wurde als \`${result.safety}\` gesichert. Der Bot wurde neu gestartet.`;
  botLog("info", message);
  await notify(message);
} catch (error) {
  exitCode = 1;
  const message = `Das Laden von \`${fileName}\` ist fehlgeschlagen: ${error.message}`;
  botLog("error", message);
  await notify(message);
}
execFile("pm2", ["delete", SELF_PROCESS], function () {
  process.exit(exitCode);
});
setTimeout(function () {
  process.exit(exitCode);
}, 10000);
