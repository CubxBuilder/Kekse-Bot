import {Client, ModalBuilder, REST, Routes, SlashCommandBuilder, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, EmbedBuilder, Events, AuditLogEvent, MessageFlags, MessageType, PermissionsBitField, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextInputBuilder, TextInputStyle, ComponentType} from "discord.js";
import https from "https";
import "dotenv/config";
if (!process.env.DASHBOARD_CODE_SECRET) {
  throw new Error("DASHBOARD_CODE_SECRET fehlt in der .env");
}
import path from "path";
import mongoose from "mongoose";
import express from "express";
import util from "util";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
import compression from "compression";
const app = express();
app.use(compression());
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1d",
    setHeaders(res, file) {
      if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    },
  }),
);
app.get("/permission", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "permission", "index.html"));
});
app.get("/401", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "401", "index.html"));
});
app.get("/400", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "400", "index.html"));
});
app.get(["/Datenschutzerklärung", "/datenschutz"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "datenschutz", "index.html"));
});
const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/kekse-bot.de/privkey.pem"),
  cert: fs.readFileSync(
    "/etc/letsencrypt/live/kekse-bot.de/fullchain.pem",
  ),
};
const port = 5000;
https.createServer(options, app).listen(port, "0.0.0.0", () => {
  console.log(`Dashboard läuft auf Port ${port}`);
});
const GUILD_ID = "1423413347168157718"; // Cookieverse: https://discord.gg/pU9zyJRFGn
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember,
  ],
});
setInterval(async () => {
  if (client && client.ws) {
    const currentPing = client.ws.ping;
    if (currentPing && currentPing > 0) {
      globalBotStats.pingNow = currentPing;
      if (
        globalBotStats.pingMinimum === 0 ||
        currentPing < globalBotStats.pingMinimum
      ) {
        globalBotStats.pingMinimum = currentPing;
      }
      if (currentPing > globalBotStats.pingMaximum) {
        globalBotStats.pingMaximum = currentPing;
      }
      try {
        const StorageModel = mongoose.model("BotStorage");
        await StorageModel.updateOne(
          { namespace: "system", key: "ping_history" },
          {
            $push: {
              "value.history": {
                $each: [{ x: Date.now(), y: currentPing }],
                $slice: -2880,
              },
            },
          },
          { upsert: true },
        );
      } catch (err) {
        originalError.apply(console, [err]);
      }
    }
  }
}, 30000);
function setBotPresence() {
  if (!client.isReady()) return;
  try {
    client.user.setPresence({
      activities: [{ name: "!help", type: 0 }],
      status: "online",
    });
  } catch (err) {
    console.error("Fehler beim Setzen:", err);
  }
}
const hlGames = new Map();
const crashGames = new Map();
const resetJackpot = () => ({
  entries: [],
  totalPool: 0,
  countdownTimer: null,
  countdownEndTime: null,
  announceMessage: null,
});
let jackpotState = resetJackpot();
async function runJackpotDraw(channel) {
  if (jackpotState.entries.length === 0) {
    jackpotState = resetJackpot();
    return;
  }
  const entries = [...jackpotState.entries];
  const totalPool = jackpotState.totalPool;
  let rand = Math.random() * totalPool;
  let winner = entries[entries.length - 1];
  for (const entry of entries) {
    rand -= entry.betAmount;
    if (rand <= 0) {
      winner = entry;
      break;
    }
  }
  const winnerData = await getEcoData(winner.userId);
  winnerData.balance = (winnerData.balance || 0) + totalPool;
  await logTransaction(winner.userId, totalPool, "plus", "Casino Jackpot");
  await setEcoData(winner.userId, winnerData);
  const winEmbed = new EmbedBuilder()
    .setTitle("Jackpot - Gewinner!")
    .setDescription(
      `<@${winner.userId}> hat den Jackpot gewonnen!\n\n**Gewinn: ${totalPool} Kekse**\nGewinnchance: **${((winner.betAmount / totalPool) * 100).toFixed(1)}%**`,
    )
    .addFields({
      name: "Teilnehmer",
      value: entries
        .map(
          (e) =>
            `<@${e.userId}>: ${e.betAmount} Kekse (${((e.betAmount / totalPool) * 100).toFixed(1)}%)`,
        )
        .join("\n"),
    })
    .setColor(0xffffff)
    .setFooter({ text: "Kekse Clan Casino | Jackpot" })
    .setTimestamp();
  const savedMsg = jackpotState.announceMessage;
  jackpotState = resetJackpot();
  if (savedMsg)
    await savedMsg.edit({ embeds: [winEmbed], components: [] }).catch(() => {});
  else await channel.send({ embeds: [winEmbed] }).catch(() => {});
  console.log(`${winner.username} hat den Jackpot in höhe von ${totalPool} gewonnen.`);
}
let archives = [];
export async function initTicketArchive(app, getTickData, setTickData) {
  try {
    const stored = (await getTickData("archive_list")) || {};
    archives = Array.isArray(stored.archive) ? stored.archive : [];
    console.log(
      `${archives.length} Tickets geladen.`,
    );
  } catch (e) {
    console.log("Fehler beim Laden der archivierten Tickets: " + e.message);
  }
  app.get("/api/tickets", requireDashboardAuth, async (req, res) => {
  try {
    const StorageModel = mongoose.model("BotStorage");
    const archiveDoc = await StorageModel.findOne({
      namespace: "tickets",
      key: "archive_list"
    }).lean();
    if (!archiveDoc || !archiveDoc.value) return res.json([]);
    const archive = Array.isArray(archiveDoc.value.archive)
      ? archiveDoc.value.archive
      : Array.isArray(archiveDoc.value)
        ? archiveDoc.value
        : [];
    res.json(archive.map(({ token, ...ticket }) => ticket));
    } catch (error) {
    res.status(500).json({ error: error.message });
  }
  });
}
export async function archiveTicket(
  { name, closedBy, creator, channel },
  setTickData,
) {
  try {
    const messages = [];
    let lastId;
    while (true) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(lastId ? { before: lastId } : {}),
      });
      if (!batch.size) break;
      for (const msg of batch.values()) {
        messages.push({
          id: msg.id,
          author: {
            name: msg.author.username,
            id: msg.author.id,
            avatar: msg.author.displayAvatarURL({ size: 64 }),
          },
          content: msg.content || null,
          timestamp: msg.createdTimestamp,
          attachments: [...msg.attachments.values()].map((a) => ({
            name: a.name,
            url: a.url,
            type: a.contentType || "unknown",
          })),
          stickers: [...(msg.stickers?.values() ?? [])].map((s) => ({
            name: s.name,
            url: s.url,
          })),
          embeds: msg.embeds.map((e) => ({
            title: e.title,
            description: e.description,
          })),
        });
        lastId = msg.id;
      }
      if (batch.size < 100) break;
    }
    messages.reverse();
    const match = name.match(/\d{4}$/);
    const ticketIdNum =
      match && match[0]
        ? match[0]
        : name.replace(/[^0-9]/g, "").slice(-4) || "0000";
    archives.unshift({
      id: ticketIdNum,
      name,
      closedBy: closedBy?.username ?? "System",
      createdBy: creator?.username ?? null,
      createdById: creator?.id ?? null,
      closedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    });
    if (archives.length > 100) archives.pop();
    await setTickData("archive_list", { archive: archives });
    console.log(
      `"${name}" archiviert. Ersteller: ${creator?.username ?? "Unbekannt"} Nachrichten: ${messages.length}`,
    );
    const sendKekseLog = async (ticketName, ticketMessages) => {
      const logChannel = client.channels.cache.get(config.channels.logs);
      if (!logChannel) return;
      const ticketUrl = `https://kekse-bot.de/#ticket-${ticketIdNum}`;
      const logEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: closedBy?.username ?? "System",
          iconURL:
            closedBy?.displayAvatarURL({ size: 512 }) ||
            client.user.displayAvatarURL(),
        })
        .setDescription(
          `**Kanal:** \`${ticketName}\` archiviert\n**Erstellt von:** ${creator?.username ?? "Unbekannt"}\n**Nachrichten:** ${ticketMessages.length}\n\n**Transcript:** [**${ticketName}**](${ticketUrl})`,
        )
        .setFooter({ text: "Kekse Bot | Ticket System" })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    };
    await sendKekseLog(name, messages);
    setTimeout(async () => {
      await channel.delete().catch(() => {});
    }, 2000);
  } catch (e) {
    console.log(`Fehler bei "${name}": ${e.message}`);
  }
}
export let globalBotStats = {
  membersJoined: 0,
  membersLeft: 0,
  pingNow: 0,
  pingAverage: 0,
  pingMaximum: 0,
  pingMinimum: 0,
};
async function startStorages() {
  try {
    const stats = await getTickData("global_stats");
    if (stats) {
      globalBotStats = { ...globalBotStats, ...stats };
    }
    console.log("Globale Statistiken geladen.");
  } catch (error) {
    console.log(
      `Fehler beim Laden der Statistiken: ${error.message}`,
    );
  }
}
function parseTimeframe(tf) {
  const match = tf.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const num = parseInt(match[1]);
  switch (match[2]) {
    case "s":
      return num * 1000;
    case "m":
      return num * 60000;
    case "h":
      return num * 3600000;
    case "d":
      return num * 86400000;
    default:
      return 0;
  }
}
const LOG_DIR = path.join(__dirname, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });
let logStream = null;
let logStreamDate = null;
function logDateString(date = new Date()) {
  return date
    .toLocaleDateString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\./g, "-");
}
function writeLogLine(entry) {
  const day = logDateString(new Date(entry.t));
  if (day !== logStreamDate) {
    if (logStream) logStream.end();
    logStream = fs.createWriteStream(path.join(LOG_DIR, `${day}.log`), {
      flags: "a",
    });
    logStream.on("error", () => {});
    logStreamDate = day;
  }
  logStream.write(JSON.stringify(entry) + "\n");
}
async function readLogFile(day) {
  try {
    const raw = await fs.promises.readFile(
      path.join(LOG_DIR, `${day}.log`),
      "utf8",
    );
    const out = [];
    for (const line of raw.split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        out.push({ t: e.t, m: e.m });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}
const originalLog = console.log;
const originalError = console.error;
console.log = function (...args) {
  originalLog.apply(console, args);
  captureLog("info", args);
};
console.error = function (...args) {
  originalError.apply(console, args);
  captureLog("error", args);
};
function formatArgs(args) {
  return args
    .map(function (arg) {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === "object" && arg !== null) {
        try {
          if (arg.embeds || arg.content) {
            return `${arg.content || ""} ${arg.embeds ? JSON.stringify(arg.embeds) : ""}`;
          }
          return util.inspect(arg, { depth: 2, colors: false });
        } catch (e) {
          return "[Komplexes Objekt]";
        }
      }
      return String(arg);
    })
    .join(" ");
}
function captureLog(type, args) {
  writeLogLine({ t: Date.now(), type, m: formatArgs(args) });
}
async function logTransaction(userId, amount, type, description) {
  try {
    const StorageModel = mongoose.model("BotStorage");
    await StorageModel.updateOne(
      { namespace: "economy", key: `tx_${userId}` },
      {
        $push: {
          "value.history": {
            $each: [{ timestamp: Date.now(), amount, type, description }],
            $position: 0,
            $slice: 100,
          },
        },
      },
      { upsert: true },
    );
  } catch (err) {
    console.error(err);
  }
}
import { dbGet, dbSet, dbDelete, dbConnection } from "./database.js";
export async function getIData(key) {
  const data = await dbGet("invites", key);
  return data || {};
}
export async function setIData(key, value) {
  await dbSet("invites", key, value);
}
export async function getMData(key) {
  const data = await dbGet("moderation", key);
  return data || { warns: {} };
}
export async function setMData(key, value) {
  await dbSet("moderation", key, value);
}
export async function getTickData(key) {
  const data = await dbGet("tickets", key);
  return data || {};
}
export async function setTickData(key, value) {
  await dbSet("tickets", key, value);
}
export async function getRData(key) {
  const data = await dbGet("reminders", key);
  return data || { reminders: [] };
}
export async function setRData(key, value) {
  await dbSet("reminders", key, value);
}
export async function getCouData(key) {
  const data = await dbGet("counting", key);
  return data || null;
}
export async function setCouData(key, value) {
  await dbSet("counting", key, value);
}
export async function getGivData(key) {
  const data = await dbGet("giveaways", key);
  return data || {};
}
export async function setGivData(key, value) {
  await dbSet("giveaways", key, value);
}
export async function setSaData(key, value) {
  await dbSet("sa", key, value);
}
export async function getSaData(key) {
  const data = await dbGet("sa", key);
  return data || {};
}
export async function setXpData(key, value) {
  await dbSet("xp", key, value);
}
export async function getXpData(key) {
  const data = await dbGet("xp", key);
  return data || {};
}
export async function setEcoData(key, value) {
  await dbSet("economy", key, value);
}
export async function getEcoData(key) {
  const data = await dbGet("economy", key);
  return data || {};
}
export async function setWageData(key, value) {
  await dbSet("wage", key, value);
}
export async function getWageData(key) {
  const data = await dbGet("wage", key);
  return data || {};
}
export async function initEconomyGetKekse(client) {
  try {
    const StorageModel = mongoose.model("BotStorage");
    const [r] = await StorageModel.aggregate([
      { $match: { namespace: "economy", key: /^\d+$/ } },
      { $group: { _id: null, sum: { $sum: "$value.balance" } } },
    ]);
    return r?.sum ?? 0;
  } catch (err) {
    console.error(err);
    return 0;
  }
}
const stealBusy = new Set();
const payallBusy = new Set();
async function performSteal(guild, thiefMember) {
  const thiefId = thiefMember.id;
  if (!thiefMember.roles.cache.has(config.roles.economy)) {
    return {
      ok: false,
      text: "Du benötigst ein Bankkonto, um zu klauen. Nutze `!bank create`.",
    };
  }
  if (stealBusy.has(thiefId)) {
    return { ok: false, text: "Dein Diebstahl läuft bereits." };
  }
  stealBusy.add(thiefId);
  try {
    const today = new Date().toLocaleDateString("de-DE", {
      timeZone: "Europe/Berlin",
    });
    const thiefCheck = await getEcoData(thiefId);
    if (thiefCheck.blocked) {
      return {
        ok: false,
        text: "Dein Konto ist gesperrt. Wende dich an den Support.",
      };
    }
    if (thiefCheck.lastSteal === today) {
      return {
        ok: false,
        text: "Du hast heute bereits geklaut. Versuche es nach 00:00 Uhr erneut.",
      };
    }
    const candidates = shuffle(
      guild.members.cache
        .filter(
          (m) =>
            !m.user.bot && m.id !== thiefId && m.roles.cache.has(config.roles.economy),
        )
        .map((m) => m),
    ).slice(0, 20);
    const candidateData = await Promise.all(
      candidates.map((m) => getEcoData(m.id)),
    );
    const index = candidateData.findIndex(
      (d) => !d.blocked && (d.balance || 0) > 0,
    );
    if (index === -1) {
      return {
        ok: false,
        text: "Aktuell gibt es niemanden, von dem du Kekse klauen kannst.",
      };
    }
    const victimMember = candidates[index];
    const [thiefData, victimData] = await Promise.all([
      getEcoData(thiefId),
      getEcoData(victimMember.id),
    ]);
    const amount = Math.min(
      1 + Math.floor(Math.random() * 100),
      victimData.balance || 0,
    );
    if (amount <= 0) {
      return {
        ok: false,
        text: "Aktuell gibt es niemanden, von dem du Kekse klauen kannst.",
      };
    }
    thiefData.balance = (thiefData.balance || 0) + amount;
    thiefData.lastSteal = today;
    victimData.balance = (victimData.balance || 0) - amount;
    await Promise.all([
      setEcoData(thiefId, thiefData),
      setEcoData(victimMember.id, victimData),
    ]);
    logTransaction(
      thiefId,
      amount,
      "plus",
      `Diebstahl von ${victimMember.user.username}`,
    );
    logTransaction(
      victimMember.id,
      amount,
      "minus",
      `Diebstahl durch ${thiefMember.user.username}`,
    );
    console.log(
      `${thiefMember.user.username} hat ${victimMember.user.username} ${amount} Kekse geklaut.`,
    );
    return {
      ok: true,
      text: `<@${thiefId}> hat <@${victimMember.id}> **${amount} Kekse** geklaut.`,
    };
  } finally {
    stealBusy.delete(thiefId);
  }
}
const SLOT_SYMBOLS = [
  { emoji: "🍒", weight: 28, multiplier: 5 },
  { emoji: "🍋", weight: 24, multiplier: 8 },
  { emoji: "🍇", weight: 20, multiplier: 14 },
  { emoji: "🔔", weight: 14, multiplier: 30 },
  { emoji: "⭐", weight: 8, multiplier: 75 },
  { emoji: "💎", weight: 4, multiplier: 100 },
  { emoji: "7️⃣", weight: 2, multiplier: 250 },
];
function spinSlotReel() {
  let r = Math.random() * 100;
  for (const s of SLOT_SYMBOLS) {
    r -= s.weight;
    if (r < 0) return s;
  }
  return SLOT_SYMBOLS[0];
}
function playSlot(betAmount) {
  const reels = [spinSlotReel(), spinSlotReel(), spinSlotReel()];
  let returned = 0;
  let label = "Keine Übereinstimmung";
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    returned = betAmount * reels[0].multiplier;
    label = `Drei gleiche (${reels[0].multiplier}x)`;
  } else if (
    reels[0] === reels[1] ||
    reels[1] === reels[2] ||
    reels[0] === reels[2]
  ) {
    returned = betAmount;
    label = "Zwei gleiche, Einsatz zurück";
  }
  return { reels, payout: returned - betAmount, label };
}
function buildSlotEmbed(result, betAmount, balance) {
  const won = result.payout > 0;
  const push = result.payout === 0;
  return new EmbedBuilder()
    .setTitle("🎰 Slotmaschine")
    .setDescription(
      `Dein Einsatz: **${betAmount} Kekse**`,
    )
    .addFields(
      {
        name: `**${result.reels.map((r) => r.emoji).join("  |  ")}**`,
        value: `${result.label}`,
      },
      {
      name: won ? "Gewonnen!" : push ? "Einsatz zurück" : "Verloren!",
      value: `${result.payout >= 0 ? "+" : ""}${result.payout} Kekse`,
    })
    .setColor(0x333333)
    .setFooter({ text: `Neuer Kontostand: ${balance} Kekse` });
}
export async function initEconomySystem(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.member) return;
    if (!msg.content.startsWith("!")) return;
    if (
      msg.content === "!wage pay" &&
      msg.author.id == config.users.sysadmin
    ) {
      await wage(true);
      console.log(`Team-Mitgliedern wurde der monatliche Lohn manuell gutgeschrieben.`);
    }
    const args = msg.content.trim().split(/ +/);
    const command = args[0].toLowerCase();
    const subCommand = args[1]?.toLowerCase();
    if (command === "!leaderboard") {
      const StorageModel = mongoose.model("BotStorage");
      const sorted = await StorageModel.find(
        { namespace: "economy", key: /^\d+$/, "value.balance": { $gt: 0 } },
        { key: 1, "value.balance": 1 },
      ).sort({ "value.balance": -1 }).limit(5).lean();
      const embed = new EmbedBuilder()
        .setTitle(":trophy: Top 5 Balance")
        .setColor("#ffffff")
        .setDescription(
          sorted
            .map(
              (doc, i) =>
                `**${i + 1}.** <@${doc.key}> • ${doc.value.balance.toLocaleString("de-DE")} Kekse`,
            )
            .join("\n") || "Keine Daten",
        )
        .setFooter({ text: "Kekse Clan" })
        .setTimestamp();
      console.log(`${msg.author.username} hat !leaderboard genutzt`);
      console.log(`Reply ${msg.author.username}: [leaderboard]`);
      return msg.reply({ embeds: [embed] });
    }
    if (command === "!steal") {
      const result = await performSteal(msg.guild, msg.member);
      console.log(`Reply ${msg.author.username}: ${result.text}`);
      return msg.reply({ content: result.text });
    }
    if (command === "!daily_setup") {
      if (msg.author.id !== config.users.sysadmin) return;
      const setupId = args[1];
      if (!setupId) {
        console.log(`Reply ${msg.author.username}: setup_id is missing`);
        return msg.reply({
          content: "setup_id is missing",
        });
      }
      const description =
        args.slice(1).join(" ") || "Hole dir hier deine täglichen Kekse ab!";
      await setEcoData(`setup_${setupId}`, {
        description: description,
        exists: true,
      });
      const embed = new EmbedBuilder()
        .setTitle(":cookie: Tägliche Kekse")
        .setDescription(
          `${description}\n\nKlicke auf den Button unten, um 100 Kekse zu erhalten.`,
        )
        .setColor(0xffffff);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`daily_claim_${setupId}`)
          .setLabel("Kekse abholen")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🍪"),
      );
      await msg.channel.send({ embeds: [embed], components: [row] });
      console.log(
        `Neues Daily Setup erstellt. (daily_claim_${setupId})`,
      );
      return msg.delete().catch(() => {});
    }
    if (command === "!shop_setup") {
      if (msg.author.id !== config.users.sysadmin) return;
      const setupId = args[0];
      if (!setupId) {
        console.log(`Reply ${msg.author.username}: setup_id is missing`);
        return msg.reply({
          content: "setup_id is missing",
        });
      }
      const description =
        args.slice(1).join(" ") ||
        "Kaufe dir hier von deinen Keksen Booster, Rollen und Puffer\n";
      await setEcoData(`setup_${setupId}`, {
        description: description,
        exists: true,
      });
      const shopChannel = msg.guild.channels.cache.get(config.channels.shop);
      if (!shopChannel) return msg.reply("Shop-Kanal wurde nicht gefunden!");
      const shopEmbed = new EmbedBuilder()
        .setTitle(`🛒 Server Shop`)
        .setDescription(description)
        .setColor(0xffffff)
        .addFields(
          {
            name: "🎉 Double Chance Giveaway → `100.000 Kekse`",
            value: "Erhöht die Gewinnchance bei Giveaways.",
            inline: false,
          },
          {
            name: "🛡️ Counting Puffer → `25.000 Kekse`",
            value:
              "Erlaubt dir einen Fehler beim Zählen, ohne dass die Zahl zurückgesetzt wird.",
            inline: false,
          },
          {
            name: "⚡ Counting XP Booster (30 Min) → `50.000 Kekse`",
            value: "Du erhältst 30 Minuten lang doppelte XP beim Zählen.",
            inline: false,
          },
          {
            name: "🔥 Counting XP Booster (60 Min) → `100.000 Kekse`",
            value: "Du erhältst 60 Minuten lang doppelte XP beim Zählen.",
            inline: false,
          },
          {
            name: "💎 VIP Rolle (7d) → `500.000 Kekse`",
            value:
              "Erhöhte Position in der Server-Liste und teilnahme an spezifischen Events.",
            inline: false,
          },
        )
        .setFooter({
          text: "Für den Einkauf im Shop benötigst du ein regestriertes Konto. Wenn du noch keins besitzt, erstelle eins mit `!bank create`",
        });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("shop_giveaway")
          .setLabel("Giveaway Chance")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🎉"),
        new ButtonBuilder()
          .setCustomId("shop_puffer")
          .setLabel("Counting Puffer")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🛡️"),
        new ButtonBuilder()
          .setCustomId("shop_xp30")
          .setLabel("XP Booster 30m")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("⚡"),
        new ButtonBuilder()
          .setCustomId("shop_xp60")
          .setLabel("XP Booster 60m")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🔥"),
        new ButtonBuilder()
          .setCustomId("shop_vip")
          .setLabel("VIP-Rolle")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💎"),
      );
      await shopChannel.send({ embeds: [shopEmbed], components: [row] });
      console.log(`Neuer Shop erstellt (setup_${setupId})`);
      console.log(`Reply ${msg.author.username}: Shop erfolgreich im Kanal #Shop erstellt.`);
      return msg.reply(
        `Shop erfolgreich im Kanal <#${config.channels.shop}> erstellt`,
      );
    }
    if (command === "!coinflip") {
      const targetUser = msg.mentions.users.first();
      const betAmount = parseInt(args[2]);
      if (!targetUser || isNaN(betAmount) || betAmount <= 0) {
        console.log(`Reply ${msg.author.username}: Nutzung: "!coinflip @User <Einsatz>"`);
        return msg.reply({
          content: "Nutzung: `!coinflip @User <Einsatz>`",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (targetUser.id === msg.author.id) {
        console.log(`Reply ${msg.author.username}: Du kannst nicht gegen dich selbst spielen.`);
        return msg.reply({
          content: "Du kannst nicht gegen dich selbst spielen.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (msg.channelId !== config.channels.casino) {
        console.log(`Reply ${msg.author.username}: Nur in #Casino nutzbar.`);
        return msg.reply({
          content: `Nur in <#${config.channels.casino}> nutzbar.`,
          flags: [MessageFlags.Ephemeral],
        });
      }
      const challengerData = await getEcoData(msg.author.id);
      const challengedData = await getEcoData(targetUser.id);
      if ((challengerData.balance || 0) < betAmount) {
        console.log(`Reply ${msg.author.username}: du hast nicht genug Kekse.`);
        return msg.reply({
          content: "Du hast nicht genug Kekse.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if ((challengedData.balance || 0) < betAmount) {
        console.log(`Reply ${msg.author.username}: ${targetUser.username} hat nicht genug Kekse.`);
        return msg.reply({
          content: `<@${targetUser.id}> hat nicht genug Kekse.`,
          flags: [MessageFlags.Ephemeral],
        });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `cf_accept_${msg.author.id}_${targetUser.id}_${betAmount}`,
          )
          .setLabel("Annehmen")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`cf_decline_${msg.author.id}_${targetUser.id}`)
          .setLabel("Ablehnen")
          .setStyle(ButtonStyle.Danger),
      );
      console.log(`${targetUser.username} wurde von ${msg.author.username} zu einem Coinflip um ${betAmount} Kekse herausgefordert.`);
      const challengeMsg = await msg.channel.send({
        content: `<@${targetUser.id}>, du wurdest von <@${msg.author.id}> zu einem Coinflip um **${betAmount} Kekse** herausgefordert.`,
        components: [row],
      });
      const collector = challengeMsg.createMessageComponentCollector({
        filter: (i) => i.user.id === targetUser.id,
        componentType: ComponentType.Button,
        time: 30000,
      });
      collector.on("collect", async (interaction) => {
        if (interaction.customId.startsWith("cf_decline_")) {
          console.log(`${targetUser.username} hat die Herausforderung abgelehnt.`);
          await interaction.update({
            content: `<@${targetUser.id}> hat die Herausforderung abgelehnt.`,
            components: [],
          });
          return collector.stop();
        }
        const freshChallenger = await getEcoData(msg.author.id);
        const freshChallenged = await getEcoData(targetUser.id);
        if (
          (freshChallenger.balance || 0) < betAmount ||
          (freshChallenged.balance || 0) < betAmount
        ) {
          await interaction.update({
            content: "Jemand hat nicht mehr genug Kekse.",
            components: [],
          });
          console.log(`Herausforderung abgebrochen.`);
          return collector.stop();
        }
        const flip = Math.random() < 0.5;
        const winner = flip ? msg.author : targetUser;
        const loser = flip ? targetUser : msg.author;
        const winnerData = flip ? freshChallenger : freshChallenged;
        const loserData = flip ? freshChallenged : freshChallenger;
        winnerData.balance = (winnerData.balance || 0) + betAmount;
        loserData.balance = (loserData.balance || 0) - betAmount;
        console.log(`${winner.username} hat ${loser.username} in einem Coinflip um ${betAmount} besiegt.`);
        await logTransaction(
          winner.id,
          betAmount,
          "plus",
          "Multiplayer Coinflip",
        );
        await logTransaction(
          loser.id,
          betAmount,
          "minus",
          "Multiplayer Coinflip",
        );
        await setEcoData(winner.id, winnerData);
        await setEcoData(loser.id, loserData);
        const resultEmbed = new EmbedBuilder()
          .setTitle("Coinflip Ergebnis")
          .setDescription(
            `**Gewinner:** <@${winner.id}> **+${betAmount} Kekse**\n**Verlierer:** <@${loser.id}> **-${betAmount} Kekse**`,
          )
          .setColor(0xffffff)
          .setFooter({ text: "Kekse Clan Casino | Multiplayer Coinflip" });
        await interaction.update({
          content: "",
          embeds: [resultEmbed],
          components: [],
        });
        collector.stop();
      });
      collector.on("end", (_, reason) => {
        if (reason === "time") {
          console.log(`Herausforderung abgebrochen.`);
          challengeMsg
            .edit({ content: "Die Anfrage ist abgelaufen.", components: [] })
            .catch(() => {});
        }
      });
    }
    if (command === "!ssp") {
      const targetUser = msg.mentions.users.first();
      const betAmount = parseInt(args[2]);
      if (!targetUser || isNaN(betAmount) || betAmount <= 0) {
        console.log(`Reply ${msg.author.username}: Nutzung: "!ssp @User <Einsatz>"`);
        return msg.reply({
          content: "Nutzung: `!ssp @User <Einsatz>`",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (targetUser.id === msg.author.id) {
        console.log(`Reply ${msg.author.username}: Du kannst nicht gegen dich selbst spielen.`);
        return msg.reply({
          content: "Du kannst nicht gegen dich selbst spielen.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (msg.channelId !== config.channels.casino) {
        console.log(`Reply ${msg.author.username}: Nur in #Casino nutzbar.`);
        return msg.reply({
          content: `Nur in <#${config.channels.casino}> nutzbar.`,
          flags: [MessageFlags.Ephemeral],
        });
      }
      const challengerData = await getEcoData(msg.author.id);
      const challengedData = await getEcoData(targetUser.id);
      if ((challengerData.balance || 0) < betAmount) {
        console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
        return msg.reply({
          content: "Du hast nicht genug Kekse.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if ((challengedData.balance || 0) < betAmount) {
        console.log(`Reply ${msg.author.username}: ${targetUser.username} hat nicht genug Kekse.`);
        return msg.reply({
          content: `<@${targetUser.id}> hat nicht genug Kekse.`,
          flags: [MessageFlags.Ephemeral],
        });
      }
      const SSP_EMOJI = { schere: ":scissors:", stein: ":rock:", papier: ":page_facing_up:" };
      const beats = { schere: "papier", stein: "schere", papier: "stein" };
      const makeChoiceRow = (userId) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ssp_${userId}_schere`)
            .setLabel("Schere")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`ssp_${userId}_stein`)
            .setLabel("Stein")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`ssp_${userId}_papier`)
            .setLabel("Papier")
            .setStyle(ButtonStyle.Primary),
        );
      const inviteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `ssp_invite_accept_${msg.author.id}_${targetUser.id}_${betAmount}`,
          )
          .setLabel("Annehmen")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`ssp_invite_decline_${msg.author.id}`)
          .setLabel("Ablehnen")
          .setStyle(ButtonStyle.Danger),
      );
      const inviteMsg = await msg.channel.send({
        content: `<@${targetUser.id}>, du wurdest von <@${msg.author.id}> zu **Schere Stein Papier** um **${betAmount} Kekse** herausgefordert!`,
        components: [inviteRow],
      });
      console.log(`${msg.author.username} hat ${targetUser.username} zu Schere Stein Papier um ${betAmount} Kekse herausgefordert.`);
      const inviteCollector = inviteMsg.createMessageComponentCollector({
        filter: (i) => i.user.id === targetUser.id,
        componentType: ComponentType.Button,
        time: 30000,
        max: 1,
      });
      inviteCollector.on("collect", async (inviteInt) => {
        if (inviteInt.customId.startsWith("ssp_invite_decline_")) {
          console.log(`${targetUser.username} hat abgelehnt.`);
          return inviteInt.update({
            content: `<@${targetUser.id}> hat abgelehnt.`,
            components: [],
          });
        }
        console.log(`${targetUser.username} hat die Herausforderung angenommen.`);
        await inviteInt.update({
          content: `Herausforderung angenommen! Beide Spieler wählen jetzt per DM.`,
          components: [],
        });
        const choices = {};
        const askChoice = async (playerUser) => {
          try {
            const dm = await playerUser.send({
              content: `Wähle für das Spiel gegen <@${playerUser.id === msg.author.id ? targetUser.id : msg.author.id}> (Einsatz: **${betAmount} Kekse**):`,
              components: [makeChoiceRow(playerUser.id)],
            });
            return new Promise((resolve) => {
              const dmCollector = dm.createMessageComponentCollector({
                filter: (i) => i.user.id === playerUser.id,
                componentType: ComponentType.Button,
                time: 60000,
                max: 1,
              });
              dmCollector.on("collect", async (i) => {
                const choice = i.customId.split("_")[2];
                choices[playerUser.id] = choice;
                console.log(`${playerUser.username} hat gewählt. (${choice})`);
                await i.update({
                  content: `Du hast **${SSP_EMOJI[choice]} ${choice}** gewählt. Warte auf deinen Gegner...`,
                  components: [],
                });
                resolve(choice);
              });
              dmCollector.on("end", (_, reason) => {
                if (reason === "time") {
                  console.log(`Herausforderung abgebrochen.`);
                  choices[playerUser.id] = choices[playerUser.id] || null;
                  resolve(null);
                }
              });
            });
          } catch {
            choices[playerUser.id] = null;
            return null;
          }
        };
        await Promise.all([askChoice(msg.author), askChoice(targetUser)]);
        const c1 = choices[msg.author.id];
        const c2 = choices[targetUser.id];
        if (!c1 || !c2) {
          const whoTimeout = !c1 ? msg.author : targetUser;
          console.log(`${whoTimeout.username} hat nicht rechtzeitig gewählt. Herausforderung abgebrochen.`);
          return inviteMsg.channel.send(
            `<@${whoTimeout.id}> hat nicht rechtzeitig gewählt. Das Spiel wurde abgebrochen.`,
          );
        }
        const freshChallenger = await getEcoData(msg.author.id);
        const freshChallenged = await getEcoData(targetUser.id);
        let resultText;
        let winner = null;
        let loser = null;
        if (c1 === c2) {
          resultText = `**Unentschieden!** Beide haben ${c1} gewählt.`;
          console.log(`Herausforderung beendet. Unentschieden.`);
        } else if (beats[c1] === c2) {
          winner = msg.author;
          loser = targetUser;
          freshChallenger.balance = (freshChallenger.balance || 0) + betAmount;
          freshChallenged.balance = (freshChallenged.balance || 0) - betAmount;
          await logTransaction(winner.id, betAmount, "plus", "Multiplayer SSP");
          await logTransaction(loser.id, betAmount, "minus", "Multiplayer SSP");
          await setEcoData(winner.id, freshChallenger);
          await setEcoData(loser.id, freshChallenged);
          console.log(`${winner.username} hat ${loser.username} in Schere Stein Papier um ${betAmount} Kekse besiegt.`);
          resultText = `**Gewinner:** <@${winner.id}> ${SSP_EMOJI[c1]} **+${betAmount} Kekse**\n**Verlierer:** <@${loser.id}> ${SSP_EMOJI[c2]} **-${betAmount} Kekse**`;
        } else {
          winner = targetUser;
          loser = msg.author;
          freshChallenged.balance = (freshChallenged.balance || 0) + betAmount;
          freshChallenger.balance = (freshChallenger.balance || 0) - betAmount;
          await logTransaction(winner.id, betAmount, "plus", "Multiplayer SSP");
          await logTransaction(loser.id, betAmount, "minus", "Multiplayer SSP");
          await setEcoData(winner.id, freshChallenged);
          await setEcoData(loser.id, freshChallenger);
          console.log(`${winner.username} hat ${loser.username} in Schere Stein Papier um ${betAmount} Kekse besiegt.`);
          resultText = `**Gewinner:** <@${winner.id}> ${SSP_EMOJI[c2]} **+${betAmount} Kekse**\n**Verlierer:** <@${loser.id}> ${SSP_EMOJI[c1]} **-${betAmount} Kekse**`;
        }
        const resultEmbed = new EmbedBuilder()
          .setTitle("Schere-Stein-Papier Ergebnis")
          .setDescription(
            `<@${msg.author.id}> hat **${SSP_EMOJI[c1]} ${c1}** gewählt.\n<@${targetUser.id}> hat **${SSP_EMOJI[c2]} ${c2}** gewählt.\n\n${resultText}`,
          )
          .setColor(0xffffff)
          .setFooter({ text: "Kekse Clan Casino | Multiplayer SSP" });
        await inviteMsg.channel.send({ embeds: [resultEmbed] });
      });
      inviteCollector.on("end", (collected, reason) => {
        if (reason === "time") {
          console.log(`Herausforderung abgebrochen.`);
          inviteMsg
            .edit({ content: "Die Anfrage ist abgelaufen.", components: [] })
            .catch(() => {});
        }
      });
    }
    if (command === "!casino") {
      const hasEcoRole = msg.member.roles.cache.has(config.roles.economy);
      if (!hasEcoRole) {
        console.log(`Reply ${msg.author.username}: Du benötigst ein Account um im Casino zu spielen. nutze "!bank create".`);
        return msg.reply({
          content:
            "Du benötigst ein Account um im Casino zu spielen. Nutze `!bank create`.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (msg.channelId !== config.channels.casino) {
        console.log(`Reply ${msg.author.username}: Das Casino ist nur in #Casino nutzbar.`);
        return msg.reply({
          content: `Das Casino ist nur in <#${config.channels.casino}> nutzbar.`,
          flags: [MessageFlags.Ephemeral],
        });
      }
      const userData = await getEcoData(msg.author.id);
      if (userData.blocked) {
        console.log(`Reply ${msg.author.username}: Dein Konto ist gesperrt. Wenn es sich um ein Missverständnis handelt wende dich an den Support -> #Ticket`);
        return msg.reply({
          content:
            "Dein Konto ist gesperrt. Wenn es sich um ein Missverständnis handelt wende dich an den Support → <#1423413348493430905>",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (subCommand === "roulette") {
        const betAmount = parseInt(args[2]);
        const betType = args[3]?.toLowerCase();
        if (isNaN(betAmount) || betAmount <= 0) {
          console.log(`Reply ${msg.author.username}: Nutzung: "!casino roulette <Einsatz> <red|black|even|odd|0-36>"`);
          return msg.reply({
            content:
              "Nutzung: `!casino roulette <Einsatz> <red|black|even|odd|0-36>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (!betType) {
          console.log(`Reply ${msg.author.username}: Bitte gib eine Wettart an: "red", "black", "even", "odd", eine Zahl "0"-"36"`);
          return msg.reply({
            content:
              "Bitte gib eine Wettart an: `red`, `black`, `even`, `odd`, eine Zahl `0`-`36`.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
          return msg.reply({
            content: "Du hast nicht genug Kekse für diesen Einsatz.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const redNumbers = new Set([
          1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
        ]);
        const spin = Math.floor(Math.random() * 37);
        const spinColor =
          spin === 0 ? "green" : redNumbers.has(spin) ? "red" : "black";
        const spinEmoji = spin === 0 ? ":green_circle:" : spinColor === "red" ? ":red_circle:" : ":black_circle:";
        let won = false;
        let payout = 0;
        let betDesc = betType;
        const numBet = parseInt(betType);
        if (!isNaN(numBet) && numBet >= 0 && numBet <= 36) {
          won = spin === numBet;
          payout = won ? betAmount * 35 : -betAmount;
          betDesc = `Zahl ${numBet}`;
        } else if (betType === "red") {
          won = spinColor === "red";
          payout = won ? betAmount : -betAmount;
          betDesc = ":red_circle: Rot";
        } else if (betType === "black") {
          won = spinColor === "black";
          payout = won ? betAmount : -betAmount;
          betDesc = ":black_circle: Schwarz";
        } else if (betType === "even") {
          won = spin !== 0 && spin % 2 === 0;
          payout = won ? betAmount : -betAmount;
          betDesc = "Gerade";
        } else if (betType === "odd") {
          won = spin % 2 !== 0;
          payout = won ? betAmount : -betAmount;
          betDesc = "Ungerade";
        } else if (betType === "1-18") {
          won = spin >= 1 && spin <= 18;
          payout = won ? betAmount : -betAmount;
          betDesc = "1-18";
        } else if (betType === "19-36") {
          won = spin >= 19 && spin <= 36;
          payout = won ? betAmount : -betAmount;
          betDesc = "19-36";
        } else {
          console.log(`Reply ${msg.author.username}: Ungültige Angabe. Nutze: "red", "black", "even", "odd", eine Zahl (0-36).`);
          return msg.reply({
            content:
              "Ungültige Angabe. Nutze: `red`, `black`, `even`, `odd`, eine Zahl (0-36).",
            flags: [MessageFlags.Ephemeral],
          });
        }
        userData.balance = (userData.balance || 0) + payout;
        await logTransaction(
          msg.author.id,
          payout,
          payout >= 0 ? "plus" : "minus",
          "Casino Roulette",
        );
        await setEcoData(msg.author.id, userData);
        const roulEmbed = new EmbedBuilder()
          .setTitle("Roulette")
          .setDescription(
            `Die Kugel landet auf: **${spinEmoji} ${spin}**\n\nDeine Wette: **${betDesc}** | Einsatz: **${betAmount} Kekse**`,
          )
          .addFields({
            name: won ? ":white_check_mark: Gewonnen!" : ":x: Verloren!",
            value: `${payout >= 0 ? "+" : ""}${payout} Kekse\nNeuer Kontostand: **${userData.balance} Kekse**`,
          })
          .setColor(won ? 0x333333 : 0x333333);
        console.log(`Reply ${msg.author.username}: [roulette]`);
        console.log(`${msg.author.username} hat im Roulette ${payout>0 ? payout : -payout} Kekse ${payout>0 ? `gewonnen` : `verloren`}.`);
        return msg.reply({ embeds: [roulEmbed] });
      }
      if (subCommand === "coinflip") {
        const betAmount = parseInt(args[2]);
        const choice = args[3]?.toLowerCase();
        if (isNaN(betAmount) || betAmount <= 0) {
          console.log(`Reply ${msg.author.username}: Nutzung: "!casino coinlip <Einsatz> <heads|tails>"`);
          return msg.reply({
            content: "Nutzung: `!casino coinflip <Einsatz> <heads|tails>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (choice !== "heads" && choice !== "tails") {
          console.log(`Reply ${msg.author.username}: Bitte wähle "heads" (Kopf) oder "tails" (Zahl).`);
          return msg.reply({
            content: "Bitte wähle `heads` (Kopf) oder `tails` (Zahl).",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
          return msg.reply({
            content: "Du hast nicht genug Kekse.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const flip = Math.random() < 0.5 ? "heads" : "tails";
        const won = flip === choice;
        userData.balance =
          (userData.balance || 0) + (won ? betAmount : -betAmount);
        console.log(`${msg.author.username} hat im Coinflip ` + betAmount + ` Kekse ` + (won ? `gewonnen` : `verloren`) + `.`);
        await logTransaction(
          msg.author.id,
          betAmount,
          won ? "plus" : "minus",
          "Casino Coinflip",
        );
        await setEcoData(msg.author.id, userData);
        const cfEmbed = new EmbedBuilder()
          .setTitle(`Coinflip`)
          .setDescription(
            `Die Münze zeigt: **${flip === "heads" ? "Kopf (Heads)" : "Zahl (Tails)"}**\n\nDu hast auf **${choice === "heads" ? "Kopf" : "Zahl"}** gesetzt.`,
          )
          .addFields({
            name: won ? ":white_check_mark: Gewonnen!" : ":x: Verloren!",
            value: `${won ? "+" : "-"}${betAmount} Kekse\nNeuer Kontostand: **${userData.balance} Kekse**`,
          })
          .setColor(won ? 0x333333 : 0x333333);
        console.log(`Reply ${msg.author.username}: [coinflip]`);
        return msg.reply({ embeds: [cfEmbed] });
      }
      if (subCommand === "jackpot") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          console.log(`Reply ${msg.author.username}: Nutzung: "!casino jackpot <Einsatz>"`);
          return msg.reply({
            content: "Nutzung: `!casino jackpot <Einsatz>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
          return msg.reply({
            content: "Du hast nicht genug Kekse.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (jackpotState.entries.find((e) => e.userId === msg.author.id)) {
          console.log(`Reply ${msg.author.username}: Du bist bereits im Jackpot! Warte auf die Ziehung.`);
          return msg.reply({
            content: "Du bist bereits im Jackpot! Warte auf die Ziehung.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        userData.balance -= betAmount;
        await logTransaction(
          msg.author.id,
          betAmount,
          "minus",
          "Casino Jackpot",
        );
        console.log(`${userData.username} hat den Jackpot mit ${betAmount} betreten.`);
        await setEcoData(msg.author.id, userData);
        jackpotState.entries.push({
          userId: msg.author.id,
          username: msg.author.username,
          betAmount,
        });
        jackpotState.totalPool += betAmount;
        const buildJackpotEmbed = (extra = "") => {
          const list = jackpotState.entries
            .map((e) => {
              const pct = (
                (e.betAmount / jackpotState.totalPool) *
                100
              ).toFixed(1);
              return `<@${e.userId}> - **${e.betAmount} Kekse** (${pct}%)`;
            })
            .join("\n");
          return new EmbedBuilder()
            .setTitle("Jackpot")
            .setDescription(
              `**Pool: ${jackpotState.totalPool} Kekse**\n\n${extra}`,
            )
            .addFields({
              name: `Teilnehmer (${jackpotState.entries.length})`,
              value: list || "Keine",
            })
            .setColor(0xffffff)
            .setFooter({
              text: "Je mehr du einsetzt, desto höher deine Gewinnchance!",
            });
        };
        if (jackpotState.entries.length === 1) {
          const jMsg = await msg.channel.send({
            embeds: [buildJackpotEmbed("Warte auf weitere Teilnehmer…")],
          });
          console.log(`Reply ${msg.author.username}: [jackpot]`);
          jackpotState.announceMessage = jMsg;
        }
        if (jackpotState.announceMessage) {
          const extra = jackpotState.countdownEndTime
            ? `Ziehung <t:${Math.floor(jackpotState.countdownEndTime / 1000)}:R>`
            : "";
          await jackpotState.announceMessage
            .edit({ embeds: [buildJackpotEmbed(extra)] })
            .catch(() => {});
        }
        if (!jackpotState.countdownTimer) {
          const drawTime = Date.now() + 5 * 60 * 1000;
          jackpotState.countdownEndTime = drawTime;
          if (jackpotState.announceMessage) {
            await jackpotState.announceMessage
              .edit({
                embeds: [
                  buildJackpotEmbed(
                    `Ziehung <t:${Math.floor(drawTime / 1000)}:R>`,
                  ),
                ],
              })
              .catch(() => {});
          }
          jackpotState.countdownTimer = setTimeout(
            () => runJackpotDraw(msg.channel),
            5 * 60 * 1000,
          );
        }
        return;
      }
      if (subCommand === "crash") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          console.log(`Reply ${msg.author.username}: Nutzung: "!casino crash <Einsatz>"`);
          return msg.reply({
            content: "Nutzung: `!casino crash <Einsatz>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
          return msg.reply({
            content: "Du hast nicht genug Kekse.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (crashGames.has(msg.author.id)) {
          console.log(`Reply ${msg.author.username}: Du hast bereits ein aktives Crash-Spiel!`);
          return msg.reply({
            content: "Du hast bereits ein aktives Crash-Spiel!",
            flags: [MessageFlags.Ephemeral],
          });
        }
        userData.balance -= betAmount;
        console.log(`${userData.username} hat einen Crash gestartet.`);
        await logTransaction(msg.author.id, betAmount, "minus", "Casino Crash");
        await setEcoData(msg.author.id, userData);
        const crashPoint = parseFloat(
          Math.max(1.01, 0.97 / (1 - Math.random())).toFixed(2),
        );
        let multiplier = 1.0;
        let intervalHandle = null;
        const cashoutRow = () =>
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`crash_cashout_${msg.author.id}`)
              .setLabel(
                `Cash Out (${Math.floor(betAmount * multiplier)} Kekse)`,
              )
              .setStyle(ButtonStyle.Success),
          );
        const crashEmbed = (crashed = false, cashedAt = null) => {
          if (crashed)
            return new EmbedBuilder()
              .setTitle(":boom: CRASH!")
              .setDescription(
                `Gecrasht bei **${crashPoint.toFixed(2)}x**!\n\nEinsatz: **${betAmount} Kekse** - **Verloren!**\nNeuer Kontostand: **${userData.balance} Kekse**`,
              )
              .setColor(0x333333);
          if (cashedAt !== null) {
            const win = Math.floor(betAmount * cashedAt);
            return new EmbedBuilder()
              .setTitle(":white_check_mark: Cash Out!")
              .setDescription(
                `Ausgecasht bei **${cashedAt.toFixed(2)}x**!\n\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${userData.balance} Kekse**`,
              )
              .setColor(0x333333);
          }
          return new EmbedBuilder()
            .setTitle("Crash")
            .setDescription(
              `**${multiplier.toFixed(2)}x** - Steigt noch…\n\nEinsatz: **${betAmount} Kekse**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**\n\nDrücke **Cash Out** vor dem Crash!`,
            )
            .setColor(0xffffff);
        };
        console.log(`Reply ${msg.author.username}: [crash]`);
        const gameMsg = await msg.reply({
          embeds: [crashEmbed()],
          components: [cashoutRow()],
        });
        crashGames.set(msg.author.id, {
          betAmount,
          crashPoint,
          cashedOut: false,
          cashedAtMultiplier: null,
        });
        const collector = gameMsg.createMessageComponentCollector({
          filter: (i) =>
            i.user.id === msg.author.id &&
            i.customId === `crash_cashout_${msg.author.id}`,
          componentType: ComponentType.Button,
          time: 120000,
        });
        collector.on("collect", async (interaction) => {
          const game = crashGames.get(msg.author.id);
          if (!game || game.cashedOut) {
            await interaction
              .reply({
                content: "Zu spät - das Spiel ist bereits beendet!",
                flags: [MessageFlags.Ephemeral],
              })
              .catch(() => {});
            return;
          }
          game.cashedOut = true;
          game.cashedAtMultiplier = multiplier;
          if (intervalHandle) clearInterval(intervalHandle);
          crashGames.delete(msg.author.id);
          collector.stop("cashout");
          const win = Math.floor(betAmount * game.cashedAtMultiplier);
          const fresh = await getEcoData(msg.author.id);
          fresh.balance = (fresh.balance || 0) + win;
          userData.balance = fresh.balance;
          console.log(`${userData.username} hat den Crash mit ${win} Keksen verlassen.`);
          await logTransaction(msg.author.id, win, "plus", "Casino Crash");
          await setEcoData(msg.author.id, fresh);
          await interaction
            .update({
              embeds: [crashEmbed(false, game.cashedAtMultiplier)],
              components: [],
            })
            .catch(() => {});
        });
        intervalHandle = setInterval(async () => {
          const game = crashGames.get(msg.author.id);
          if (!game) {
            clearInterval(intervalHandle);
            return;
          }
          multiplier = parseFloat((multiplier + 0.2).toFixed(2));
          if (multiplier >= game.crashPoint) {
            clearInterval(intervalHandle);
            crashGames.delete(msg.author.id);
            collector.stop("crashed");
            console.log(`Crash beendet.`);
            await gameMsg
              .edit({ embeds: [crashEmbed(true)], components: [] })
              .catch(() => {});
            return;
          }
          await gameMsg
            .edit({ embeds: [crashEmbed()], components: [cashoutRow()] })
            .catch(() => {});
        }, 1500);
        collector.on("end", async (collected, reason) => {
          if (reason === "time") {
            clearInterval(intervalHandle);
            const game = crashGames.get(msg.author.id);
            if (game && !game.cashedOut) {
              crashGames.delete(msg.author.id);
              await gameMsg
                .edit({ embeds: [crashEmbed(true)], components: [] })
                .catch(() => {});
            }
          }
        });
        return;
      }
      if (subCommand === "highlow" || subCommand === "hl") {
        const betAmount = args.map(Number).find((n) => !isNaN(n) && n > 0);
        if (isNaN(betAmount) || betAmount <= 0) {
          console.log(`Reply ${msg.author.username}: Nutzung: "!casino highlow <Einsatz>"`);
          return msg.reply({
            content: "Nutzung: `!casino highlow <Einsatz>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
          return msg.reply({
            content: "Du hast nicht genug Kekse.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (hlGames.has(msg.author.id)) {
          console.log(`Reply ${msg.author.username}: Du hast bereits ein aktives Higher/Lower-Spiel.`);
          return msg.reply({
            content: "Du hast bereits ein aktives Higher/Lower-Spiel!",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const todayStr = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
        if (userData.hl_cooldown_date !== todayStr) {
          userData.hl_cooldown_date = todayStr;
          userData.hl_today_count = 0;
        }
        if ((userData.hl_today_count || 0) >= 5) {
          console.log(`Reply ${msg.author.username}: Du hast dein Limit von 5 Higher/Lower-Spielen für heute bereits erreicht! Komm morgen wieder.`);
          return msg.reply({
            content:
              "Du hast dein Limit von **5 Higher/Lower-Spielen** für heute bereits erreicht! Komm morgen wieder.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        userData.hl_today_count = (userData.hl_today_count || 0) + 1;
        userData.balance -= betAmount;
        console.log(`${userData.username} hat ein Higher/Lower-Spiel gestartet.`);
        await logTransaction(
          msg.author.id,
          betAmount,
          "minus",
          "Casino Higher Lower",
        );
        await setEcoData(msg.author.id, userData);
        hlGames.set(msg.author.id, true);
        const cardNames = [
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "J",
          "Q",
          "K",
          "A",
        ];
        const cardVals = {
          2: 2,
          3: 3,
          4: 4,
          5: 5,
          6: 6,
          7: 7,
          8: 8,
          9: 9,
          10: 10,
          J: 11,
          Q: 12,
          K: 13,
          A: 14,
        };
        const suits = [":spades:", ":hearts:", ":diamonds:", ":clubs:"];
        const getCard = () => {
          const n = cardNames[Math.floor(Math.random() * cardNames.length)];
          return {
            display: `${n}${suits[Math.floor(Math.random() * 4)]}`,
            value: cardVals[n],
          };
        };
        let currentCard = getCard();
        let lastDrawnCard = null;
        let streak = 0;
        let multiplier = 1.0;
        const hlRow = (disabled = false) =>
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`hl_higher_${msg.author.id}`)
              .setLabel("Higher")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled),
            new ButtonBuilder()
              .setCustomId(`hl_lower_${msg.author.id}`)
              .setLabel("Lower")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(disabled),
            new ButtonBuilder()
              .setCustomId(`hl_cashout_${msg.author.id}`)
              .setLabel(
                `Auszahlen (${Math.floor(betAmount * multiplier)} Kekse)`,
              )
              .setStyle(ButtonStyle.Success)
              .setDisabled(disabled || streak === 0),
          );
        const hlEmbed = (desc, color = 0xffffff) =>
          new EmbedBuilder()
            .setTitle("Higher or Lower")
            .setDescription(desc)
            .setColor(0xffffff);
        console.log(`Reply ${msg.author.username}: [higher/lower]`);
        const gameMsg = await msg.reply({
          embeds: [
            hlEmbed(
              `Aktuelle Karte: **${currentCard.display}**\n\nStreak: **0** | Multiplikator: **1.00x**\nMöglicher Gewinn: **${betAmount} Kekse**\n\nIst die nächste Karte höher oder niedriger?\n*(Spiel **${userData.hl_today_count}/5** heute)*`,
            ),
          ],
          components: [hlRow()],
        });
        const collector = gameMsg.createMessageComponentCollector({
          filter: (i) => i.user.id === msg.author.id,
          componentType: ComponentType.Button,
          time: 90000,
        });
        collector.on("collect", async (interaction) => {
          try {
            await interaction.deferUpdate();
            const id = interaction.customId;
            if (id === `hl_cashout_${msg.author.id}`) {
              collector.stop("cashout");
              return;
            }
            await gameMsg.edit({ components: [hlRow(true)] }).catch(() => {});
            const nextCard = getCard();
            lastDrawnCard = nextCard;
            const choice = id.startsWith(`hl_higher`) ? "higher" : "lower";
            const isTie = nextCard.value === currentCard.value;
            const correct =
              !isTie &&
              ((choice === "higher" && nextCard.value > currentCard.value) ||
                (choice === "lower" && nextCard.value < currentCard.value));
            if (isTie) {
              currentCard = nextCard;
              await gameMsg
                .edit({
                  embeds: [
                    hlEmbed(
                      `:yellow_circle: Unentschieden! Neue Karte: **${nextCard.display}**\nStreak: **${streak}** | Multiplikator: **${multiplier.toFixed(2)}x**\n\nIst die nächste Karte höher oder niedriger?`,
                    ),
                  ],
                  components: [hlRow(false)],
                })
                .catch(() => {});
              return;
            }
            if (correct) {
              streak++;
              multiplier = parseFloat((multiplier + 0.5).toFixed(2));
              currentCard = nextCard;
              await gameMsg
                .edit({
                  embeds: [
                    hlEmbed(
                      `:white_check_mark: Richtig! Nächste Karte war **${nextCard.display}**\n\nAktuelle Karte: **${currentCard.display}**\nStreak: **${streak}** | Multiplikator: **${multiplier.toFixed(2)}x**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**\n\nWeiterhöhen oder auszahlen?`,
                      0xffffff,
                    ),
                  ],
                  components: [hlRow()],
                })
                .catch(() => {});
            } else {
              collector.stop("wrong");
            }
          } catch (error) {
            console.error("Fehler im HL-Collector abgefangen:", error);
          }
        });
        collector.on("end", async (collected, reason) => {
          hlGames.delete(msg.author.id);
          const fresh = await getEcoData(msg.author.id);
          if (reason === "cashout") {
            const win = Math.floor(betAmount * multiplier);
            fresh.balance = (fresh.balance || 0) + win;
            console.log(`${fresh.username} hat das Higher/Lower-Spiel mit ${win} Keksen verlassen.`);
            await logTransaction(
              msg.author.id,
              win,
              "plus",
              "Casino Higher Lower",
            );
            await setEcoData(msg.author.id, fresh);
            await gameMsg
              .edit({
                embeds: [
                  hlEmbed(
                    `:moneybag: **Ausgezahlt!**\n\nMultiplikator: **${multiplier.toFixed(2)}x**\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                    0x333333,
                  ),
                ],
                components: [],
              })
              .catch(() => {});
          } else if (reason === "wrong") {
            console.log(`Higher/Lower-Spiel beendet.`);
            await gameMsg
              .edit({
                embeds: [
                  hlEmbed(
                    `:x: **Falsch geraten!**\n\nDie Karte war **${lastDrawnCard ? lastDrawnCard.display : "Unbekannt"}**.\nDu hast **${betAmount} Kekse** verloren.\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                    0x333333,
                  ),
                ],
                components: [],
              })
              .catch(() => {});
          } else {
            if (streak > 0) {
              const win = Math.floor(betAmount * multiplier);
              fresh.balance = (fresh.balance || 0) + win;
              await logTransaction(
                msg.author.id,
                win,
                "plus",
                "Casino Higher Lower",
              );
              await setEcoData(msg.author.id, fresh);
              console.log(`${fresh.username} hat das Higher/Lower-Spiel mit ${win} Keksen verlassen.`);
              await gameMsg
                .edit({
                  embeds: [
                    hlEmbed(
                      `:alarm_clock: **Zeit abgelaufen!**\n\nAutomatisch ausgezahlt bei **${multiplier.toFixed(2)}x**\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                      0x333333,
                    ),
                  ],
                  components: [],
                })
                .catch(() => {});
            } else {
              await gameMsg
                .edit({
                  embeds: [
                    hlEmbed(
                      `:alarm_clock: **Zeit abgelaufen!**\n\nDu hast zu lange gebraucht und **${betAmount} Kekse** verloren.\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                      0x333333,
                    ),
                  ],
                  components: [],
                })
                .catch(() => {});
            }
          }
        });
        return;
      }
      if (subCommand === "slot") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          console.log(`Reply ${msg.author.username}: Nutzung: "!casino slot <Einsatz>"`);
          return msg.reply({
            content: "Nutzung: `!casino slot <Einsatz>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
          return msg.reply({
            content: "Du hast nicht genug Kekse.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const result = playSlot(betAmount);
        userData.balance = (userData.balance || 0) + result.payout;
        if (result.payout !== 0) {
          logTransaction(
            msg.author.id,
            Math.abs(result.payout),
            result.payout > 0 ? "plus" : "minus",
            "Casino Slot",
          );
        }
        await setEcoData(msg.author.id, userData);
        console.log(`${msg.author.username} hat die Slotmaschine gespielt (${result.payout} Kekse).`);
        console.log(`Reply ${msg.author.username}: [slot]`);
        return msg.reply({
          embeds: [buildSlotEmbed(result, betAmount, userData.balance)],
        });
      }
      if (subCommand === "blackjack") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          console.log(`Reply ${msg.author.username}: Nutzung: "!casino blackjack <Einsatz>"`);
          return msg.reply({
            content:
              "Nutzung: `!casino blackjack <Einsatz>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
          return msg.reply({
            content: "Du hast nicht genug Kekse.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const suits = [":spades:", ":hearts:", ":diamonds:", ":clubs:"];
        const values = [
          { n: "2", v: 2 },
          { n: "3", v: 3 },
          { n: "4", v: 4 },
          { n: "5", v: 5 },
          { n: "6", v: 6 },
          { n: "7", v: 7 },
          { n: "8", v: 8 },
          { n: "9", v: 9 },
          { n: "10", v: 10 },
          { n: "J", v: 10 },
          { n: "Q", v: 10 },
          { n: "K", v: 10 },
          { n: "A", v: 11 },
        ];
        let deck = [];
        for (const suit of suits) {
          for (const val of values) {
            deck.push({ name: `${val.n}${suit}`, value: val.v });
          }
        }
        deck = deck.sort(() => Math.random() - 0.5);
        const playerHand = [deck.pop(), deck.pop()];
        const dealerHand = [deck.pop(), deck.pop()];
        const calculateScore = (hand) => {
          let score = hand.reduce((sum, card) => sum + card.value, 0);
          let aces = hand.filter((card) => card.name.startsWith("A")).length;
          while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
          }
          return score;
        };
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("bj_hit")
            .setLabel("Hit")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("bj_stand")
            .setLabel("Stand")
            .setStyle(ButtonStyle.Primary),
        );
        const createEmbed = (title, color, showAllDealer = false) => {
          const pScore = calculateScore(playerHand);
          const dScore = showAllDealer
            ? calculateScore(dealerHand)
            : dealerHand[0].value;
          const pCards = playerHand.map((c) => c.name).join(" ");
          const dCards = showAllDealer
            ? dealerHand.map((c) => c.name).join(" ")
            : `${dealerHand[0].name} :flower_playing_cards:`;
          return new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(`Dein Einsatz: **${betAmount} Kekse**`)
            .addFields(
              { name: `Deine Hand (${pScore})`, value: pCards, inline: true },
              {
                name: `Dealer Hand (${showAllDealer ? dScore : dScore + " + ?"})`,
                value: dCards,
                inline: true,
              },
            );
        };
        if (calculateScore(playerHand) === 21) {
          let dScore = calculateScore(dealerHand);
          let status = "";
          let finalColor = 0x333333;
          if (dScore === 21) {
            status = "Beide haben Blackjack! Unentschieden.";
            finalColor = 0x333333;
          } else {
            status = "Blackjack! Du erhältst das 1.5-fache deines Einsatzes!";
            userData.balance += Math.floor(betAmount * 1.5);
            console.log(`${userData.username} hat einen Blackjack und erhält ${betAmount * 1.5} Kekse.`);
            await logTransaction(
              msg.author.id,
              Math.floor(betAmount * 1.5),
              "plus",
              "Casino Blackjack",
            );
          }
          await setEcoData(msg.author.id, userData);
          const finalEmbed = createEmbed(
            `Blackjack - ${status}`,
            finalColor,
            true,
          ).setFooter({ text: `Neuer Kontostand: ${userData.balance} Kekse` });
          return msg.reply({ embeds: [finalEmbed] });
        }
        console.log(`Reply ${msg.author.username}: [blackjack]`);
        const gameMessage = await msg.reply({
          embeds: [createEmbed("Blackjack", 0xffffff)],
          components: [row],
        });
        const collector = gameMessage.createMessageComponentCollector({
          filter: (i) => i.user.id === msg.author.id,
          componentType: ComponentType.Button,
          time: 60000,
        });
        collector.on("collect", async (interaction) => {
          await interaction.deferUpdate();
          if (interaction.customId === "bj_hit") {
            playerHand.push(deck.pop());
            if (calculateScore(playerHand) >= 21) {
              collector.stop(
                calculateScore(playerHand) > 21 ? "busted" : "stand",
              );
            } else {
              await gameMessage.edit({
                embeds: [createEmbed("Blackjack", 0xffffff)],
              });
            }
          }
          if (interaction.customId === "bj_stand") {
            collector.stop("stand");
          }
        });
        collector.on("end", async (collected, reason) => {
          const userData = await getEcoData(msg.author.id);
          let pScore = calculateScore(playerHand);
          let dScore = calculateScore(dealerHand);
          let status = "";
          let finalColor = 0x333333;
          if (reason !== "busted") {
            while (dScore < 17) {
              dealerHand.push(deck.pop());
              dScore = calculateScore(dealerHand);
            }
          }
          if (reason === "busted" || pScore > 21) {
            status = "Überkauft! Du hast verloren.";
            userData.balance -= betAmount;
            console.log(`Blackjack beendet.`);
            await logTransaction(
              msg.author.id,
              betAmount,
              "minus",
              "Casino Blackjack",
            );
            finalColor = 0x333333;
          } else if (dScore > 21) {
            status = "Dealer überkauft! Du gewinnst!";
            userData.balance += betAmount;
            console.log(`Dealer überkauft. ${userData.username} erhält ${betAmount} Kekse.`);
            await logTransaction(
              msg.author.id,
              betAmount,
              "plus",
              "Casino Blackjack",
            );
          } else if (pScore > dScore) {
            status = "Mehr Punkte als der Dealer. Du gewinnst!";
            userData.balance += betAmount;
            console.log(`Mehr Punkte als der Dealer. ${userData.username} erhält ${betAmount} Kekse.`);
            await logTransaction(
              msg.author.id,
              betAmount,
              "plus",
              "Casino Blackjack",
            );
          } else if (pScore < dScore) {
            status = "Dealer hat mehr Punkte. Verloren!";
            userData.balance -= betAmount;
            console.log(`Blackjack beendet.`);
            await logTransaction(
              msg.author.id,
              betAmount,
              "minus",
              "Casino Blackjack",
            );
            finalColor = 0x333333;
          } else {
            console.log(`Blackjack beendet. Unentschieden.`);
            status = "Unentschieden! Du erhältst deinen Einsatz zurück.";
            finalColor = 0x333333;
          }
          await setEcoData(msg.author.id, userData);
          const finalEmbed = createEmbed(
            `Blackjack - ${status}`,
            finalColor,
            true,
          ).setFooter({ text: `Neuer Kontostand: ${userData.balance} Kekse` });
          await gameMessage.edit({ embeds: [finalEmbed], components: [] });
        });
        return;
      }
      console.log(`Reply ${msg.author.username}: Unbekanntes Spiel. Verfügbare Spiele: "roulette", "coinflip", "jackpot", "crash", "highlow", "blackjack", "slot"`);
      return msg.reply({
        content:
          "Unbekanntes Spiel. Verfügbare Spiele: `roulette`, `coinflip`, `jackpot`, `crash`, `highlow`, `blackjack`, `slot`",
      });
    }
    if (command === "!bank") {
      const hasEcoRole = msg.member.roles.cache.has(config.roles.economy);
      const isAdmin = msg.author.id == config.users.sysadmin;
      if (
        isAdmin &&
        (subCommand === "add" ||
          subCommand === "remove" ||
          subCommand === "see")
      ) {
        const targetUser = msg.mentions.users.first();
        let amount = 0;
        let targetId = msg.author.id;
        if (subCommand === "see") {
          if (!targetUser) return denyReply(msg, "user is missing");
          const data = await getEcoData(targetUser.id);
          const dmEmbed = new EmbedBuilder()
            .setTitle(`Konto-Details von ${targetUser.username}`)
            .setColor(0xffffff)
            .addFields(
              { name: "User ID", value: data.userId || targetUser.id },
              { name: "Discord Name", value: data.username || "Kein Name" },
              {
                name: "Minecraft Name",
                value: data.mcUsername || "Nicht registriert",
              },
              { name: "Kontostand", value: `${data.balance || 0} Kekse` },
              { name: "Gesperrt?", value: data.blocked ? "Ja" : "Nein" },
            );
          console.log(`Reply ${msg.author.username}: [bank see]`);
          await msg.author.send({ embeds: [dmEmbed] }).catch(() => {});
          return msg.delete().catch(() => {});
        }
        if (targetUser) {
          targetId = targetUser.id;
          amount = parseInt(args[3]);
        } else {
          amount = parseInt(args[2]);
        }
        if (isNaN(amount) || amount <= 0) {
          console.log(`Reply ${msg.author.username}: incorrect amount`);
          return msg.reply({
            content: "incorrect amount",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const targetData = await getEcoData(targetId);
        let currentBalance = targetData.balance || 0;
        if (subCommand === "add") {
          currentBalance += amount;
          console.log(`${targetData.username} erhält ${amount} Kekse.`);
        } else {
          currentBalance = Math.max(0, currentBalance - amount);
          console.log(`${targetData.username} verliert ${amount} Kekse`);
        }
        targetData.balance = currentBalance;
        await setEcoData(targetId, targetData);
        const logEmbed = new EmbedBuilder()
          .setTitle("Konto-Aktualisierung")
          .setDescription(`Konto von <@${targetId}> wurde aktualisiert.`)
          .addFields(
            {
              name: "Aktion",
              value:
                subCommand === "add" ? `+${amount} Kekse` : `-${amount} Kekse`,
            },
            { name: "Neuer Kontostand", value: `${currentBalance} Kekse` },
          )
          .setColor(0xffffff);
        await msg.author.send({ embeds: [logEmbed] }).catch(() => {});
        console.log(`Reply ${msg.author.username}: [Konto-Aktualisierung]`);
        return msg.delete().catch(() => {});
      }
      if (subCommand === "create") {
        if (hasEcoRole) {
          console.log(`Reply ${msg.author.username}: Du besitzt bereits ein registriertes Bankkonto`);
          return msg.reply({
            content: "Du besitzt bereits ein registriertes Bankkonto.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`open_bank_modal_${msg.author.id}`)
            .setLabel("Konto erstellen")
            .setStyle(ButtonStyle.Primary),
        );
        console.log(`Reply ${msg.author.username}: Klicke auf den Button unten, um dein Konto zu erstellen. Dieser Button ist nur von dir Nutzbar. [Button]`);
        const reply = await msg.reply({
          content:
            "Klicke auf den Button unten, um dein Konto zu erstellen. Dieser Button ist nur von dir Nutzbar.",
          components: [row],
        });
        setTimeout(() => {
          reply.delete().catch(() => {});
          msg.delete().catch(() => {});
        }, 30000);
        return;
      }
      if (subCommand === "help") {
        const helpEmbed = new EmbedBuilder()
          .setTitle(":bank: Bank-System Hilfe")
          .setColor(0xffffff)
          .setDescription("Hier findest du alle verfügbaren Befehle:")
          .addFields(
            {
              name: "`!bank create`",
              value: "Erstelle ein Bankkonto (Erfordert Minecraft-Namen).",
            },
            {
              name: "`!bank`",
              value: "Zeigt dir deinen Kontostand.",
            },
            {
              name: "`!bank pay`",
              value: "Überweise Kekse an eine andere Person.",
            },
          );
        console.log(`Reply ${msg.author.username}: [Bank help]`);
        return msg.reply({
          embeds: [helpEmbed],
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (subCommand === "pay") {
        let targetArg = args[2];
        let amountArg = args[3];
        const targetUserId = targetArg?.replace(/[<@!&>#]/g, "");
        const amount = parseInt(amountArg);
        const userData = await getEcoData(msg.author.id);
        if (!targetUserId || isNaN(amount) || amount <= 0) {
          console.log(`Reply ${msg.author.username}: Nutzung: "!bank pay @User <Betrag>"`);
          return msg.reply({
            content: "Nutzung: `!bank pay @User <Betrag>`",
          });
        }
        if (targetUserId === msg.author.id) {
          console.log(`Reply ${msg.author.username}: Du kannst dir selbst keine Kekse überweisen.`);
          return msg.reply({
            content: "Du kannst dir selbst keine Kekse überweisen.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (amount > (userData.balance || 0)) {
          console.log(`Reply ${msg.author.username}: Du hast nicht genug Kekse.`);
          return msg.reply({
            content: "Du hast nicht genug Kekse.",
          });
        }
        const targetData = await getEcoData(targetUserId);
        if (!targetData || !targetData.username || targetData.blocked) {
          console.log(`Reply ${msg.author.username}: Der Zielnutzer hat kein aktives Konto oder ist gesperrt.`);
          return msg.reply({
            content: "Der Zielnutzer hat kein aktives Konto oder ist gesperrt.",
          });
        }
        userData.balance -= amount;
        targetData.balance = (targetData.balance || 0) + amount;
        await logTransaction(
          msg.author.id,
          amount,
          "minus",
          `Pay an ${targetData.username}`,
        );
        await logTransaction(
          targetData.userId,
          amount,
          "plus",
          `Pay von ${userData.username}`,
        );
        await setEcoData(msg.author.id, userData);
        await setEcoData(targetUserId, targetData);
        console.log(
          `Überweisung von ${userData.username || msg.author.username} an ${targetData.username || targetUserId} für ${amount} Kekse.`,
        );
        const payEmbed = new EmbedBuilder()
          .setTitle("Überweisung erfolgreich")
          .setDescription(
            `Du hast **${amount} Kekse** an <@${targetUserId}> überwiesen.`,
          )
          .addFields({
            name: "Neuer Kontostand",
            value: `${userData.balance} Kekse`,
          })
          .setColor(0xffffff);
        const getEmbed = new EmbedBuilder()
          .setTitle("Kekse erhalten!")
          .setDescription(
            `Du hast **${amount} Kekse** von <@${msg.author.id}> erhalten.`,
          )
          .addFields({
            name: "Neuer Kontostand",
            value: `${targetData.balance} Kekse`,
          })
          .setColor(0xffffff);
        console.log(`Reply ${msg.author.username}: [pay]`);
        await msg.reply({
          embeds: [payEmbed],
        });
        try {
          const targetUser = await msg.client.users.fetch(targetUserId);
          await targetUser.send({ embeds: [getEmbed] });
        } catch (error) {
          console.log(
            `Konnte keine DM an ${targetUserId} senden: ${error.message}`,
          );
        }
        return;
      }
      if (subCommand === "payall") {
        const amount = parseInt(args[2]);
        if (isNaN(amount) || amount <= 0) {
          return denyReply(msg, "Nutzung: `!bank payall <Betrag pro Konto>`");
        }
        if (!hasEcoRole) {
          return denyReply(msg, "Du hast noch kein Konto. Nutze `!bank create`, um dich zu registrieren.");
        }
        if (payallBusy.has(msg.author.id)) {
          return denyReply(msg, "Du hast bereits eine offene Massenüberweisung.");
        }
        const loadRecipients = async function () {
          const members = [...msg.guild.members.cache.values()].filter(function (m) {
            return !m.user.bot && m.id !== msg.author.id && m.roles.cache.has(config.roles.economy);
          });
          const loaded = await Promise.all(
            members.map(async function (m) {
              return { id: m.id, data: await getEcoData(m.id) };
            }),
          );
          return loaded.filter(function (r) {
            return r.data.username && !r.data.blocked;
          });
        };
        const senderData = await getEcoData(msg.author.id);
        if (senderData.blocked) {
          return denyReply(msg, "Dein Konto ist gesperrt. Wenn es sich um ein Missverständnis handelt wende dich an den Support.");
        }
        const preview = await loadRecipients();
        if (!preview.length) return denyReply(msg, "Es gibt keine anderen aktiven Konten.");
        const previewTotal = amount * preview.length;
        if (previewTotal > (senderData.balance || 0)) {
          return denyReply(msg, `Du hast nicht genug Kekse. Für **${preview.length} Konten** brauchst du **${previewTotal} Kekse**.`);
        }
        payallBusy.add(msg.author.id);
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("payall_confirm").setLabel("Bestätigen").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("payall_cancel").setLabel("Abbrechen").setStyle(ButtonStyle.Danger),
        );
        const confirmMsg = await msg.reply({
          content: `Du überweist **${amount} Kekse** an **${preview.length} Konten**. Insgesamt werden **${previewTotal} Kekse** von deinem Konto abgebucht.`,
          components: [confirmRow],
        });
        const collector = confirmMsg.createMessageComponentCollector({
          filter: function (i) {
            return i.user.id === msg.author.id;
          },
          componentType: ComponentType.Button,
          time: 30000,
          max: 1,
        });
        collector.on("collect", async function (interaction) {
          if (interaction.customId === "payall_cancel") {
            return interaction.update({ content: "Abgebrochen.", components: [] });
          }
          await interaction.update({ content: "Überweisung läuft...", components: [] });
          const sender = await getEcoData(msg.author.id);
          const recipients = await loadRecipients();
          const total = amount * recipients.length;
          if (!recipients.length || sender.blocked || total > (sender.balance || 0)) {
            return confirmMsg
              .edit({ content: "Die Überweisung wurde abgebrochen. Dein Guthaben reicht nicht mehr aus oder dein Konto ist gesperrt." })
              .catch(function () {});
          }
          sender.balance = (sender.balance || 0) - total;
          await setEcoData(msg.author.id, sender);
          const logs = [logTransaction(msg.author.id, total, "minus", `Payall an ${recipients.length} Konten`)];
          for (const r of recipients) {
            const data = await getEcoData(r.id);
            data.balance = (data.balance || 0) + amount;
            await setEcoData(r.id, data);
            logs.push(logTransaction(r.id, amount, "plus", `Payall von ${sender.username || msg.author.username}`));
          }
          await Promise.all(logs);
          console.log(`${msg.author.username} hat per !bank payall ${amount} Kekse an ${recipients.length} Konten überwiesen (${total} Kekse).`);
          await confirmMsg
            .edit({
              content: `<@${msg.author.id}> hat **${amount} Kekse** an **${recipients.length} Konten** überwiesen (insgesamt **${total} Kekse**).`,
              allowedMentions: { parse: [] },
            })
            .catch(function () {});
        });
        collector.on("end", function (collected, reason) {
          payallBusy.delete(msg.author.id);
          if (reason === "time") {
            confirmMsg.edit({ content: "Die Anfrage ist abgelaufen.", components: [] }).catch(function () {});
          }
        });
        return;
      }
      if (subCommand === "get") {
        if (msg.author.id == config.users.sysadmin) {
          const existingKekse = await initEconomyGetKekse(client);
          return msg.reply(`Es sind aktuell ${existingKekse} Kekse im Umlauf.`);
        } else {
          console.log(`Reply ${msg.author.username}: Du hast nicht die Berechtigung diese Funktion zu nutzen. Wenn es sich um einen Fehler handelt wende dich bitte an den Support.`);
          return msg.reply(
            `Du hast nicht die Berechtigung diese Funktion zu nutzen. Wenn es sich um einen Fehler handelt wende dich bitte an den Support.`,
          );
        }
      }
      if (!subCommand) {
        if (!hasEcoRole) {
          console.log(`Reply ${msg.author.username}: Du hast noch kein Konto. Nutze "!bank create", um dich zu registrieren.`);
          return msg.reply({
            content:
              "Du hast noch kein Konto. Nutze `!bank create`, um dich zu registrieren.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const userData = await getEcoData(msg.author.id);
        if (userData.blocked) {
          console.log(`Reply ${msg.author.username}: Dein Konto ist gesperrt. Wenn es sich um ein Missverständnis handelt wende dich an den Support -> #Ticket`);
          return msg.reply({
            content:
              `Dein Konto ist gesperrt. Wenn es sich um ein Missverständnis handelt wende dich an den Support → <#${config.channels.ticket}>`,
            flags: [MessageFlags.Ephemeral],
          });
        }
        const userName = msg.author;
        if (msg.content.startsWith("!bank")) {
          await msg.delete().catch(() => {});
          console.log(`Send ${msg.author.username}: Dein aktueller Kontostand beträgt: ${userData.balance} Kekse.`);
          return userName.send({
            content: `Dein aktueller Kontostand beträgt: **${userData.balance || 0} Kekse**`,
          });
        }
      }
    }
  });
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("open_bank_modal_")) {
        const allowedUserId = interaction.customId.replace(
          "open_bank_modal_",
          "",
        );
        if (interaction.user.id !== allowedUserId) {
          console.log(`Reply ${interaction.user.username}: Du kannst diesen Button nicht nutzen, da du den Befehl nicht eingegeben hast.`);
          return interaction.reply({
            content:
              "Du kannst diesen Button nicht nutzen, da du den Befehl nicht eingegeben hast.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const hasEcoRole = interaction.member.roles.cache.has(config.roles.economy);
        if (hasEcoRole) {
          console.log(`Reply ${interaction.user.username}: Du besitzt bereits ein registriertes Bankkonto.`);
          return interaction.reply({
            content: "Du besitzt bereits ein registriertes Bankkonto.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bank_create_${interaction.user.id}`)
          .setTitle("Bankkonto erstellen");
        const mcInput = new TextInputBuilder()
          .setCustomId("mc_username")
          .setLabel("Minecraft Benutzername")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("Dein exakter Name im Spiel");
        modal.addComponents(new ActionRowBuilder().addComponents(mcInput));
        await interaction.showModal(modal).catch(console.error);
        return;
      }
      if (interaction.customId.startsWith("daily_claim_")) {
        const hasEcoRole = interaction.member.roles.cache.has(config.roles.economy);
        if (!hasEcoRole) {
          console.log(`Reply ${interaction.user.username}: Du benötigst zuerst ein registriertes Bankkonto ("!bank create")`);
          return interaction.reply({
            content:
              "Du benötigst zuerst ein registriertes Bankkonto (`!bank create`).",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const setupId = interaction.customId.replace("daily_claim_", "");
        const localizedDateStr = new Date().toLocaleDateString("de-DE", {
          timeZone: "Europe/Berlin",
        });
        const userData = (await getEcoData(interaction.user.id)) || {};
        if (!userData.claimedDailies) {
          userData.claimedDailies = {};
        }
        if (userData.claimedDailies[setupId] === localizedDateStr) {
          console.log(`Reply ${interaction.user.username}: Du hast deine Kekse für dieses Event heute bereits abgeholt! Versuche es nach 00:00 Uhr (de-DE) erneut.`);
          return interaction.reply({
            content: `Du hast deine Kekse für **dieses Event** heute bereits abgeholt! Versuche es nach 00:00 Uhr (de-DE) erneut.`,
            flags: [MessageFlags.Ephemeral],
          });
        }
        const payout = 100;
        userData.balance = (userData.balance || 0) + payout;
        await logTransaction(interaction.user.id, payout, "plus", "Daily");
        userData.claimedDailies[setupId] = localizedDateStr;
        if (typeof userData.markModified === "function") {
          userData.markModified("claimedDailies");
        } else {
          userData.claimedDailies = { ...userData.claimedDailies };
        }
        await setEcoData(interaction.user.id, userData);
        console.log(`Reply ${interaction.user.username}: Dir wurden 100 Kekse auf dein Bankkonto gutgeschrieben.`);
        return interaction.reply({
          content:
            "Erfolgreich! Dir wurden 100 Kekse auf dein Bankkonto gutgeschrieben.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (interaction.customId.startsWith("shop_")) {
        const member = interaction.member;
        const itemType = interaction.customId.replace("shop_", "");
        const SHOP_ITEMS = {
          giveaway: {
            roleId: config.roles.giveawayDouble,
            name: ":tada: Double Chance Giveaway",
            duration: null,
            price: 100000,
          },
          puffer: {
            roleId: config.roles.countingPuffer,
            name: ":shield: Counting Puffer",
            duration: null,
            price: 25000,
          },
          xp30: {
            roleId: config.roles.countingXp30,
            name: ":zap: Counting XP Booster (30 Min)",
            duration: 30 * 60 * 1000,
            price: 50000,
          },
          xp60: {
            roleId: config.roles.countingXp60,
            name: ":fire: Counting XP Booster (60 Min)",
            duration: 60 * 60 * 1000,
            price: 100000,
          },
          vip: {
            roleId: config.roles.vip,
            name: ":gem: VIP-Rolle (7d)",
            duration: 7 * 24 * 60 * 60 * 1000,
            price: 500000,
          },
        };
        const item = SHOP_ITEMS[itemType];
        if (!item) {
          console.log(`Reply ${interaction.user.username}: Dieses Item existiert nicht.`);
          return interaction.reply({
            content: "Dieses Item existiert nicht!",
            flags: MessageFlags.Ephemeral,
          });
        }
        if (member.roles.cache.has(item.roleId)) {
          console.log(`Reply ${interaction.user.username}: Du besitzt das Item ${item.name} bereits.`);
          return interaction.reply({
            content: `Du besitzt das Item **${item.name}** bereits!`,
            flags: MessageFlags.Ephemeral,
          });
        }
        let freshData = await getEcoData(interaction.user.id);
        if (!freshData || typeof freshData !== "object") freshData = {};
        let currentCookies = freshData.balance || 0;
        if (currentCookies < item.price) {
          console.log(`Reply ${interaction.user.username}: Du hast nicht genug Kekse für diesen Kauf! 1x ${item.name} kostet ${item.price.toLocaleString("de-DE")} Kekse (Du hast: ${currentCookies.toLocaleString("de-DE")}).`);
          return interaction.reply({
            content: `Du hast nicht genug Kekse für diesen Kauf! 1x **${item.name}** kostet **${item.price.toLocaleString("de-DE")} Kekse** (Du hast: ${currentCookies.toLocaleString("de-DE")}).`,
            flags: MessageFlags.Ephemeral,
          });
        }
        try {
          const finalData = (await getEcoData(interaction.user.id)) || {};
          finalData.balance =
            (finalData.balance || currentCookies) - item.price;
          if (!finalData.userId) finalData.userId = interaction.user.id;
          if (!finalData.username)
            finalData.username = interaction.user.username;
          await member.roles.add(item.roleId);
          await setEcoData(interaction.user.id, finalData);
          console.log(`${interaction.user.username} hat ${item.name} im Shop erworben.`);
          console.log(`Reply ${interaction.user.username}: Kauf erfolgreich: Du hast ${item.name} erhalten!`);
          await interaction.reply({
            content: `Kauf erfolgreich: Du hast **${item.name}** erhalten!`,
            flags: MessageFlags.Ephemeral,
          });
          addXP(interaction.user.id, 100, client);
          const invoiceEmbed = {
            color: 0xffffff,
            title: ":receipt: Deine Shop-Quittung",
            description: `Vielen Dank für deinen Einkauf auf unserem Server!`,
            fields: [
              { name: "Gekauftes Item", value: item.name, inline: true },
              {
                name: "Abgezogene Kekse",
                value: `-${item.price.toLocaleString("de-DE")}`,
                inline: true,
              },
              {
                name: "Neuer Kontostand",
                value: `${finalData.balance.toLocaleString("de-DE")} Kekse`,
                inline: false,
              },
            ],
            timestamp: new Date(),
          };
          await interaction.user.send({ embeds: [invoiceEmbed] }).catch(() => {
            console.log(`Konnte keine DM an ${interaction.user.tag} senden.`);
          });
          if (item.duration) {
            setTimeout(async () => {
              try {
                const currentMember = await interaction.guild.members
                  .fetch(member.id)
                  .catch(() => null);
                if (
                  currentMember &&
                  currentMember.roles.cache.has(item.roleId)
                ) {
                  await currentMember.roles.remove(item.roleId);
                  console.log(`Send ${interaction.user.username}: Dein ${item.name} ist abgelaufen und wurde entfernt.`);
                  await currentMember
                    .send(
                      `Dein **${item.name}** ist abgelaufen und wurde entfernt!`,
                    )
                    .catch(() => null);
                }
              } catch (timerError) {
                console.error(
                  `Fehler beim Entfernen von ${item.name}:`,
                  timerError,
                );
              }
            }, item.duration);
          }
        } catch (error) {
          console.error("Fehler beim Shop-Kauf:", error);
          console.log(`Reply ${interaction.user.username}: Es gab einen Fehler beim Verarbeiten deines Kaufs.`);
          return interaction.reply({
            content: "Es gab einen Fehler beim Verarbeiten deines Kaufs!",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("bank_create_")) {
        const userId = interaction.customId.replace("bank_create_", "");
        if (interaction.user.id !== userId) return;
        const userData = await getEcoData(interaction.user.id);
        let prevBalance = userData?.balance;
        const mcUsername = interaction.fields.getTextInputValue("mc_username");
        const accountData = {
          userId: interaction.user.id,
          username: interaction.user.username,
          mcUsername: mcUsername,
          balance: (prevBalance || 0) + 100,
          blocked: false,
          claimedDailies: {},
        };
        await setEcoData(interaction.user.id, accountData);
        const member = await interaction.guild.members
          .fetch(interaction.user.id)
          .catch(() => null);
        if (member) {
          await member.roles.add(config.roles.economy).catch(() => {});
        }
        console.log(`${interaction.user.username} hat ein Konto erstellt.`);
        console.log(`Reply ${interaction.user.username}: Dein Konto wurde erfolgreich angelegt! Minecraft-Name: ${mcUsername}, Startguthaben: 100 Kekse, Du hast nun zugriff auf dein Konto mit "!bank"`);
        await interaction.reply({
          content: `Dein Konto wurde erfolgreich angelegt!\n**Minecraft-Name:** ${mcUsername}\n**Startguthaben:** 100 Kekse\nDu hast nun Zugriff auf dein Konto mit \`!bank\`.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  });
}
export async function wage(force = false) {
  const now = new Date();
  const aktuellerMonat = now.getMonth();
  const istErzwungen = force === true;
  if (istErzwungen) {
    await fuehreGehaltszahlungAus(now);
    return;
  }
  const status = await getWageData("status");
  const gespeicherterMonat =
    status.letzterMonat !== undefined ? status.letzterMonat : -1;
  const istErsterDesMonats = now.getDate() === 1;
  const istNullUhr = now.getHours() === 0;
  const bereitsDiesenMonatGezahlt = gespeicherterMonat === aktuellerMonat;
  if (!bereitsDiesenMonatGezahlt) {
    await setWageData("status", { letzterMonat: aktuellerMonat });
    await fuehreGehaltszahlungAus(now);
  }
}
async function fuehreGehaltszahlungAus(now) {
  try {
    const guild =
      client.guilds.cache.first() ||
      (await client.guilds.fetch(GUILD_ID));
    const role =
      guild.roles.cache.get(config.roles.team) ||
      (await guild.roles.fetch(config.roles.team));
    const team = Array.from(role.members.values());
    const nowFormatted = now
      .toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
      .replace(",", "");
    for (const member of team) {
      const userData = await getEcoData(member.user.id);
      userData.balance = (userData.balance || 0) + 10000;
      console.log(`${member.user.id} wurde der monatliche Team-Lohn in höhe von 10000 Keksen gutgeschrieben. Neuer Kontostand: ${userData.balance} Kekse`);
      await setEcoData(member.user.id, userData);
      const embed = {
        title: ":white_check_mark: Monatlicher Lohn",
        description:
          "Dir wurde erfolgreich der monatliche Lohn von `10.000 Kekse` gutgeschrieben. \nVielen Dank für dein Engagement im Team!\n\n\n**User:** <@" +
          member.user.id +
          ">\n**Menge:** 10000 Kekse\n**Typ:** Gutschrift",
        color: 0x2ecc70,
        footer: { text: nowFormatted },
      };
      try {
        await member.send({
          embeds: [embed],
          content: `Dein aktueller Kontostand beträgt: **${userData.balance} Kekse** :cookie:`,
        });
        const logchannel = client.channels.cache.get(config.channels.logs);
        logchannel.send(
          `:white_check_mark: Überweisung an <@${userData.userId}> erfolgreich.\n**Beschreibung:** Monatlicher Lohn (Team)\n**Menge:** 10000 Kekse\n**Typ:** Gutschrift\n**Datum:** ${nowFormatted}`,
        );
        console.log(
          `Überweisung an <@${userData.userId}> erfolgreich.\n**Beschreibung:** Monatlicher Lohn (Team)\n**Menge:** 10000 Kekse\n**Typ:** Gutschrift\n**Datum:** ${nowFormatted}`,
        );
      } catch (dmError) {
        console.error(
          `DM konnte nicht an ${member.user.tag} gesendet werden:`,
          dmError,
        );
      }
    }
  } catch (error) {
    console.error(error);
  }
}
export function initAdminFun(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!")) return;
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    if (cmd === "blob") {
      const filePfad = path.join(__dirname, "blobfish.jpg");
      const attachment = new AttachmentBuilder(filePfad, {
        name: "blobfish.jpg",
      });
      console.log(`${msg.author.username} hat !blob genutzt.`);
      msg.channel.send({ files: [attachment] });
    }
    if (cmd === "sand") {
      const filePfad = path.join(__dirname, "sandkorn.png");
      const attachment = new AttachmentBuilder(filePfad, {
        name: "sandkorn.png",
      });
      console.log(`${msg.author.username} hat !sand genutzt.`);
      msg.channel.send({ files: [attachment] });
    }
    if (cmd === "sandkorn") {
      const filePfad = path.join(__dirname, "strand.jpg");
      const attachment = new AttachmentBuilder(filePfad, {
        name: "strand.jpg",
      });
      console.log(`${msg.author.username} hat !sandkorn genutzt.`);
      msg.channel.send({ files: [attachment] });
    }
  });
}
export function initAuditLogs(client) {
  const sendLog = async (
    title,
    user,
    text,
    color = "#ffffff",
    thumb = null,
    channelId = null,
  ) => {
    if (channelId === config.channels.logs) return;
    const chan = client.channels.cache.get(config.channels.logs);
    if (!chan) return;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({
        name: user?.tag || "System / Admin",
        iconURL: user?.displayAvatarURL() || client.user.displayAvatarURL(),
      })
      .setDescription(`**Event:** \`${title}\`\n${text}`)
      .setFooter({ text: "Kekse Bot | Audit Log" })
      .setTimestamp();
    if (thumb) embed.setThumbnail(thumb);
    await chan.send({ embeds: [embed] }).catch(() => {});
  };
  client.on(Events.MessageDelete, async (msg) => {
    if (msg.partial || msg.author?.bot || msg.channel.id === config.channels.logs)
      return;
    const ghostPing =
      msg.mentions.users.size > 0 ? "**GHOST PING ERKANNT**\n" : "";
    await sendLog(
      "Nachricht gelöscht",
      msg.author,
      `${ghostPing}**Kanal:** ${msg.channel}\n**Inhalt:**\n\`\`\`${msg.content || "Kein Textinhalt"}\`\`\``,
      "#ffffff",
      null,
      msg.channel.id,
    );
  });
  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (
      oldMsg.partial ||
      oldMsg.content === newMsg.content ||
      oldMsg.author?.bot ||
      oldMsg.channel.id === config.channels.logs
    )
      return;
    await sendLog(
      "Nachricht editiert",
      oldMsg.author,
      `**Kanal:** ${oldMsg.channel}\n**Vorher:**\n\`\`\`${oldMsg.content}\`\`\`\n**Nachher:**\n\`\`\`${newMsg.content}\`\`\``,
      "#ffffff",
      null,
      oldMsg.channel.id,
    );
  });
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await sendLog(
      "User Join",
      member.user,
      `<@${member.id}> (${member.user.tag}) hat den Server betreten.\nAccount erstellt: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      "#ffffff",
      member.user.displayAvatarURL({ forceStatic: false }),
    );
    console.log(`${member.user.tag} (${member.id}) hat den Server betreten.`);
    const account = await getEcoData(member.id);
    if (account && account.username) {
      await member.roles.add(config.roles.economy);
      console.log(`${member.user.username} wurde die Economy-Rolle zugewiesen.`)
    }
  } catch (error) {
    console.error("Fehler im GuildMemberAdd Event:", error);
  }
});
  client.on(Events.GuildMemberRemove, async (member) => {
    await sendLog(
      "User Leave",
      member.user,
      `<@${member.id}> (${member.user.tag}) hat den Server verlassen.`,
      "#f04747",
      member.user.displayAvatarURL(),
    );
    console.log(
      `<@${member.id}> (${member.user.tag}) hat den Server verlassen.`,
    );
  });
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
      await sendLog(
        "Nickname geändert",
        newMember.user,
        `Alt: \`${oldMember.nickname || "Kein"}\`\nNeu: \`${newMember.nickname || "Kein"}\``,
      );
      console.log(
        `Alt: \`${oldMember.nickname || "Kein"}\`\nNeu: \`${newMember.nickname || "Kein"}\``,
      );
    }
    const addedRoles = newMember.roles.cache.filter(
      (r) => !oldMember.roles.cache.has(r.id),
    );
    const removedRoles = oldMember.roles.cache.filter(
      (r) => !newMember.roles.cache.has(r.id),
    );
    if (addedRoles.size > 0)
      await sendLog(
        "Rolle vergeben",
        newMember.user,
        `Hinzugefügt: ${addedRoles.map((r) => r.name).join(", ")}`,
        "#43b581",
      );
    if (removedRoles.size > 0)
      await sendLog(
        "Rolle entfernt",
        newMember.user,
        `Entfernt: ${removedRoles.map((r) => r.name).join(", ")}`,
        "#f04747",
      );
  });
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const user = newState.member.user;
    if (!oldState.channelId && newState.channelId) {
      await sendLog(
        "VC Join",
        user,
        `Kanal: <#${newState.channelId}>`,
        "#ffffff",
      );
      console.log(`${user} hat <#${newState.channelId}> betreten.`);
    } else if (oldState.channelId && !newState.channelId) {
      await sendLog(
        "VC Leave",
        user,
        `Kanal: <#${oldState.channelId}>`,
        "#ffffff",
      );
      console.log(`${user} hat <#${oldState.channelId}> verlassen.`);
    } else if (oldState.channelId !== newState.channelId) {
      await sendLog(
        "VC Wechsel",
        user,
        `<#${oldState.channelId}> ➔ <#${newState.channelId}>`,
        "#ffffff",
      );
      console.log(
        `${user} ist von <#${oldState.channelId}> in <#${newState.channelId}> gewechselt.`,
      );
    }
    if (!oldState.selfMute && newState.selfMute) {
      await sendLog(
        "User gestummt (VC)",
        user,
        `In Kanal: <#${newState.channelId}>`,
      );
      console.log(`${user} hat sich gestummt.`);
    }
  });
  client.on(Events.GuildAuditLogEntryCreate, async (entry) => {
    const { action, executorId, targetId } = entry;
    const executor = await client.users.fetch(executorId).catch(() => null);
    if (action === AuditLogEvent.ChannelCreate) {
      await sendLog(
        "Channel erstellt",
        executor,
        `ID: <#${targetId}>\nEin neuer Kanal wurde erstellt.`,
      );
      console.log(`ID: <#${targetId}>\nEin neuer Kanal wurde erstellt.`);
    }
    if (action === AuditLogEvent.ChannelDelete) {
      await sendLog(
        "Channel gelöscht",
        executor,
        `ID: \`${targetId}\` Kanal wurde gelöscht.`,
        "#ffffff",
      );
      console.log(`ID: \`${targetId}\` Kanal wurde gelöscht.`);
    }
    if (action === AuditLogEvent.ChannelUpdate) {
      await sendLog(
        "Channel aktualisiert",
        executor,
        `Einstellungen in <#${targetId}> wurden geändert.`,
      );
      console.log(`Einstellungen in <#${targetId}> wurden geändert.`);
    }
    if (
      action === AuditLogEvent.ChannelOverwriteUpdate ||
      action === AuditLogEvent.ChannelOverwriteCreate ||
      action === AuditLogEvent.ChannelOverwriteDelete
    ) {
      await sendLog(
        "Channel Permissions aktualisiert",
        executor,
        `Berechtigungen in <#${targetId}> wurden geändert.`,
        "#ffffff",
      );
      console.log(`Berechtigungen in <#${targetId}> wurden geändert.`);
    }
    if (action === AuditLogEvent.ThreadCreate) {
      await sendLog("Thread erstellt", executor, `Thread: <#${targetId}>`);
    }
    if (action === AuditLogEvent.ThreadDelete) {
      await sendLog(
        "Thread gelöscht",
        executor,
        `Ein Thread wurde entfernt.`,
        "#ffffff",
      );
    }
    if (action === AuditLogEvent.ThreadUpdate) {
      await sendLog(
        "Thread aktualisiert",
        executor,
        `Thread <#${targetId}> wurde bearbeitet.`,
      );
    }
    if (action === AuditLogEvent.RoleCreate) {
      await sendLog(
        "Rolle erstellt",
        executor,
        `Eine neue Rolle wurde erstellt.`,
      );
    }
    if (action === AuditLogEvent.RoleDelete) {
      await sendLog(
        "Rolle gelöscht",
        executor,
        `ID: \`${targetId}\` Rolle wurde gelöscht.`,
        "#ffffff",
      );
    }
    if (action === AuditLogEvent.RoleUpdate) {
      await sendLog(
        "Rolle aktualisiert",
        executor,
        `Die Rolle <@&${targetId}> wurde bearbeitet.`,
      );
    }
    if (action === AuditLogEvent.InviteCreate) {
      await sendLog(
        "Invite erstellt",
        executor,
        `Ein neuer Einladungslink wurde generiert.`,
      );
    }
    if (action === AuditLogEvent.GuildUpdate) {
      await sendLog(
        "Server aktualisiert",
        executor,
        `Die allgemeinen Server-Einstellungen wurden geändert.`,
        "#ffffff",
      );
    }
    if (action === AuditLogEvent.MemberBanAdd)
      await sendLog("BAN", executor, `Ziel: <@${targetId}>`, "#ffffff");
    if (action === AuditLogEvent.MemberBanRemove)
      await sendLog("UNBAN", executor, `Ziel: <@${targetId}>`, "#ffffff");
    if (action === AuditLogEvent.MemberKick)
      await sendLog("KICK", executor, `Ziel: <@${targetId}>`, "#ffffff");
  });
  client.on(Events.GuildInviteCreate, async (invite) => {
    await sendLog(
      "Invite gesendet",
      invite.inviter,
      `Code: \`${invite.code}\`\nKanal: <#${invite.channelId}>`,
    );
  });
}
export async function clear(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Bot | Moderation System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!clear") || message.author.bot) return;
    if (!message.member.roles.cache.has(config.roles.team)) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel.send("Keine Berechtigung!");
      return setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
    }
    const args = message.content.split(/\s+/).slice(1);
    await message.delete().catch(() => {});
    const startTime = Date.now();
    let targetChannel = message.channel;
    let userIds = [];
    let amount = 100;
    let timeframe = null;
    if (/^\d{17,19}$/.test(args[0])) {
      const foundChannel = message.guild.channels.cache.get(args[0]);
      if (foundChannel?.isTextBased()) {
        targetChannel = foundChannel;
        args.shift();
      }
    }
    while (args.length && /^\d{17,19}$/.test(args[0])) {
      userIds.push(args.shift());
    }
    if (args.length) {
      if (/^\d+$/.test(args[0])) amount = Math.min(parseInt(args.shift()), 500);
      else timeframe = args.shift();
    }
    const statusMsg = await message.channel.send(" Suche Nachrichten...");
    let messagesToDelete = [];
    let lastId = null;
    let deletedCount = 0;
    try {
      while (messagesToDelete.length < amount) {
        const fetched = await targetChannel.messages.fetch({
          limit: 100,
          before: lastId || undefined,
        });
        if (!fetched || fetched.size === 0) break;
        for (const msg of fetched.values()) {
          if (userIds.length > 0 && !userIds.includes(msg.author.id)) continue;
          if (timeframe) {
            const ms = parseTimeframe(timeframe);
            if (Date.now() - msg.createdTimestamp > ms) continue;
          }
          messagesToDelete.push(msg);
          if (messagesToDelete.length >= amount) break;
        }
        const lastMsg = fetched.last();
        if (!lastMsg) break;
        lastId = lastMsg.id;
        if (fetched.size < 100) break;
      }
      if (messagesToDelete.length === 0) {
        return statusMsg
          .edit("Keine Nachrichten gefunden, die den Kriterien entsprechen.")
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
      }
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const youngMsgs = messagesToDelete.filter(
        (m) => m.createdTimestamp > fourteenDaysAgo,
      );
      const oldMsgs = messagesToDelete.filter(
        (m) => m.createdTimestamp <= fourteenDaysAgo,
      );
      if (youngMsgs.length > 0) {
        await statusMsg.edit(
          ` Bulk-Löschung von ${youngMsgs.length} Nachrichten...`,
        );
        const deletedBulk = await targetChannel
          .bulkDelete(youngMsgs, true)
          .catch(() => new Map());
        deletedCount += deletedBulk.size;
      }
      if (oldMsgs.length > 0) {
        for (let i = 0; i < oldMsgs.length; i++) {
          await oldMsgs[i].delete().catch(() => {});
          deletedCount++;
          if (deletedCount % 5 === 0)
            await statusMsg
              .edit(
                ` Lösche alte Nachrichten: **${deletedCount}/${messagesToDelete.length}**...`,
              )
              .catch(() => {});
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    } catch (clearError) {
      console.log(
        `[Clear] Fehler bei der Ausführung: ${clearError.message}`,
      );
      if (statusMsg)
        await statusMsg
          .edit("an error occurred while deleting messages")
          .catch(() => {});
      return;
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await statusMsg.delete().catch(() => {});
    const finishMsg = await message.channel.send(
      `**Abschlussbericht:**\n- Gelöscht: **${deletedCount}**\n- Dauer: **${duration}s**\n- Kanal: <#${targetChannel.id}>`,
    );
    console.log(`Clear: ${deletedCount} Nachrichten, Dauer: ${duration}s, Kanal: <#${targetChannel.id}>`);
    const userList =
      userIds.length > 0
        ? userIds.map((id) => `<@${id}>`).join(", ")
        : "Alle User";
    await sendKekseLog(
      "Nachrichten gelöscht (Clear)",
      message.author,
      `**Kanal:** <#${targetChannel.id}>\n` +
        `**Anzahl:** ${deletedCount}\n` +
        `**Filter (User):** ${userList}\n` +
        `**Zeitrahmen:** ${timeframe || "Keiner"}\n` +
        `**Dauer:** ${duration}s`,
    );
    setTimeout(() => finishMsg.delete().catch(() => {}), 15000);
  });
}
function denyReply(msg, text) {
  console.log(`Reply ${msg.author.username}: ${text}`);
  return msg.reply(text);
}
function hasPerm(member) {
  return member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
}
export function initModeration(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;
    if (
      !msg.member.roles.cache.has(config.roles.team) ||
      !hasPerm(msg.member)
    )
      return;
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    let data = (await getMData("moderation")) || { warns: {} };
    const getUser = async (input) => {
      if (!input) return null;
      const id = input.replace(/[<@!>]/g, "");
      if (/^\d{17,20}$/.test(id))
        return await client.users.fetch(id).catch(() => null);
      return null;
    };
    const sendModLog = async (action, target, reason, extra = null) => {
      const logChannel = await client.channels
        .fetch(config.channels.logs)
        .catch(() => null);
      if (!logChannel) return;
      const kekseEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: msg.author.username,
          iconURL: msg.author.displayAvatarURL({ size: 512 }),
        })
        .setTitle(`Mod-Aktion: ${action}`)
        .setDescription(
          `**Target:** ${target.tag || target.id} (\`${target.id}\`)\n**Grund:** ${reason}${extra ? `\n**Info:** ${extra}` : ""}`,
        )
        .setFooter({ text: "Kekse Bot | Moderation System" })
        .setTimestamp();
      console.log(`Aktion: ${action}, Von: ${msg.author.username}, User: ${target.tag}, Grund: ${reason}${extra ? `Info: ${extra}` : ""}`);
      await logChannel.send({ embeds: [kekseEmbed] }).catch(() => {});
    };
    if (cmd === "timeout") {
      const user = await getUser(args[0]);
      const durationStr = args[1];
      const reason = args.slice(2).join(" ") || "Kein Grund";
      if (!user || !durationStr) return denyReply(msg, "Syntax: `!timeout @user 10m Grund`.");
      const match = durationStr.match(/^(\d+)([smhd])$/);
      if (!match) return denyReply(msg, "Format: 10s, 5m, 2h, 1d");
      const durationMs = parseTimeframe(durationStr);
      if (durationMs === 0) return denyReply(msg, "Ungültige Zeitangabe.");
      try {
        const member = await msg.guild.members.fetch(user.id);
        await member.timeout(durationMs, reason);
        await sendModLog("Timeout", user, reason, `Dauer: ${durationStr}`);
        console.log(`Reply ${msg.author.username}: Timeout: ${user.username} für ${durationStr}`);
        await msg.reply({
          content: ` **Timeout**: <@${user.id}> für ${durationStr}.`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        console.log(`Reply ${msg.author.username}: Fehler: User nicht auf Server oder fehlende Rechte.`);
        await msg.reply({
          content: " Fehler: User nicht auf Server oder fehlende Rechte.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
    if (cmd === "untimeout") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user) return denyReply(msg, "User nicht gefunden.");
      try {
        const member = await msg.guild.members.fetch(user.id);
        await member.timeout(null, reason);
        await sendModLog("Untimeout", user, reason);
        console.log(`Reply ${msg.author.username}: Untimeout: ${user.username}`);
        await msg.reply({
          content: `**Untimeout**: <@${user.id}>`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        console.log(`Reply ${msg.author.username}: Fehler beim Untimeout.`);
        await msg.reply({
          content: "Fehler beim Untimeout.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
    if (cmd === "kick") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user) return denyReply(msg, "User nicht gefunden.");
      try {
        await msg.guild.members.kick(user.id, reason);
        await sendModLog("Kick", user, reason);
        console.log(`Reply ${msg.author.username}: Kick: ${user.username}`);
        await msg.reply({
          content: `**Kick**: <@${user.id}>`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        console.log(`Reply ${msg.author.username}: Fehler beim Kick.`);
        await msg.reply({
          content: "Fehler beim Kick.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
    if (cmd === "ban") {
      const idInput = args[0]?.replace(/[<@!>]/g, "");
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!idInput || !/^\d{17,20}$/.test(idInput)) return denyReply(msg, "enter valid user_id");
      try {
        const user = await client.users
          .fetch(idInput)
          .catch(() => ({ id: idInput, tag: "Unknown#0000" }));
        await msg.guild.members.ban(idInput, { reason });
        await sendModLog("Ban", user, reason);
        console.log(`Reply ${msg.author.username}: Ban: ${user.tag} wurde gebannt.`);
        await msg.reply({
          content: `**Ban**: ${user.tag || idInput} wurde gebannt.`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        console.log(`Reply ${msg.author.username}: Fehler beim Ban.`);
        await msg.reply({
          content: "Fehler beim Ban.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
    if (cmd === "unban") {
      const idInput = args[0]?.replace(/[<@!>]/g, "");
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!idInput) return denyReply(msg, "user_id is missing");
      try {
        const user = await client.users
          .fetch(idInput)
          .catch(() => ({ id: idInput, tag: idInput }));
        await msg.guild.members.unban(idInput, reason);
        await sendModLog("Unban", user, reason);
        console.log(`Reply ${msg.author.username}: Unban: ${user.tag}`);
        await msg.reply({
          content: `**Unban**: ${user.tag || idInput}`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        console.log(`Reply ${msg.author.username}: enter valid user_id`);
        await msg.reply({
          content: "enter valid user_id",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
    if (cmd === "warn") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user) return denyReply(msg, "user not found");
      data.warns[user.id] ??= [];
      data.warns[user.id].push({ reason, by: msg.author.id, date: Date.now() });
      await setMData("moderation", data);
      await sendModLog(
        "Warnung",
        user,
        reason,
        `Warn-Stand: ${data.warns[user.id].length}`,
      );
      console.log(`Reply ${msg.author.username}: Warn: ${user.username} (Gesamt: ${data.warns[user.id].length})`);
      await msg.reply({
        content: `**Warn**: <@${user.id}> (Gesamt: ${data.warns[user.id].length})`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    if (cmd === "warns") {
      const user = await getUser(args[0]);
      if (!user) return denyReply(msg, "user not found");
      const userWarns = data.warns[user.id] || [];
      if (userWarns.length === 0) return denyReply(msg, "Keine Warnungen.");
      const embed = new EmbedBuilder()
        .setTitle(`Warnungen: ${user.username}`)
        .setColor("#ffffff")
        .setDescription(
          userWarns
            .map((w, i) => `**${i + 1}.** ${w.reason} (von <@${w.by}>)`)
            .join("\n"),
        )
        .setFooter({ text: "Kekse Clan" });
      console.log(`Reply ${msg.author.username}: [warns]`);
      await msg.reply({ embeds: [embed] });
      
    }
    if (cmd === "warn_remove") {
      const user = await getUser(args[0]);
      const index = parseInt(args[1]) - 1;
      if (!user || isNaN(index) || !data.warns[user.id]?.[index]) return denyReply(msg, "not a valid index");
      const removed = data.warns[user.id].splice(index, 1);
      await setMData("moderation", data);
      await sendModLog(
        "Warn entfernt",
        user,
        `Grund war: ${removed[0].reason}`,
      );
      console.log(`Reply ${msg.author.username}: Warnung entfernt.`);
      await msg.reply({
        content: "Warnung entfernt.",
        flags: [MessageFlags.Ephemeral],
      });
      
    }
  });
}
export function initVerification(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Bot | Verification System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("guildMemberAdd", async (member) => {
    await member.roles.add(config.roles.unverified).catch(() => {});
  });
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== "verify_user")
      return;
    const member = interaction.member;
    if (!member.roles.cache.has(config.roles.unverified)) {
      console.log(`Reply ${interaction.user.username}: Du bist bereits verifiziert.`);
      return interaction.reply({
        content: "Du bist bereits verifiziert.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    try {
      await member.roles.remove(config.roles.unverified);
      console.log(`${interaction.user.username} hat sich verifiziert.`);
      await sendKekseLog(
        "User Verifiziert",
        interaction.user,
        `<@${interaction.user.id}> hat sich verifiziert.`,
      );
      console.log(`Reply ${interaction.user.username}: Erfolgreich verifiziert!`);
      await interaction.reply({
        content: "Erfolgreich verifiziert!",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (err) {
      console.log(`Reply ${interaction.user.username}: Fehler: Bot-Rolle steht in der Liste vermutlich unter der Verifizierungs-Rolle.`);
      await interaction.reply({
        content:
          "Es ist ein Problem bei der Verifizierung aufgetreten. Bitte erstelle ein #Ticket.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  });
  client.on("messageCreate", async (msg) => {
    if (msg.content === "!setup_verify") {
      if (!msg.member.roles.cache.has(config.roles.team)) return;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_user")
          .setLabel("Verifizieren")
          .setStyle(ButtonStyle.Success),
      );
      const channel = client.channels.cache.get(config.channels.verify);
      if (channel) {
        const imageUrl = new AttachmentBuilder("./verify.png");
        console.log(`Send: [Verify]`);
        await channel.send({
          content:
            `**Herzlich willkommen!** Klicke auf den Button unten, um Zugriff auf die Channels des Servers zu erhalten.\n` +
            `-# Um Bot-Accounts von diesem Server fernzuhalten, wurde dieser Zwischenschritt implementiert. Beim Klicken wird eine Rolle entfernt, die das Einsehen der Channels blockiert. Mit der Verifikation bestätigst du zeitgleich, dass du dich an die geltenden Regeln hältst. Die Regeln können jederzeit im <#1423413348065611949> eingesehen werden. Beachte, dass diese jederzeit geändert werden können. Dies wird im Normalfall im <#1464993818968588379> angekündigt.`,
          files: [imageUrl],
          components: [row],
        });
        await sendKekseLog(
          "Verification Setup",
          msg.author,
          `Das Verifizierungs-Panel wurde in <#${config.channels.verify}> neu aufgesetzt.`,
        );
        
        await msg.delete().catch(() => {});
      }
    }
  });
}
export function initRules(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.content === "!setup_rules") {
      if (!msg.member.roles.cache.has(config.roles.team)) {
        console.log(`Reply ${msg.author.username}: Du hast keine Berechtigung diese funktion zu nutzen.`);
        msg.reply(`Du hast keine Berechtigung diese Funktion zu nutzen.`);
        return;
      }
      const defaultRule = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({ name: "Regelwerk" })
        .setDescription(
          `# Allgemeine Regeln\n## Respekt und Freundlichkeit\n\n- Sei respektvoll gegenüber anderen. Beleidigungen, Mobbing oder Drohungen werden nicht toleriert.\n\n- Diskutiere sachlich und vermeide provokative Streitigkeiten.\n\n## Keine unangemessene Inhalte\n\n- Sende keine anstößigen, pornografischen, rassistischen oder gewalttätigen Inhalte.\n\n- Verbreite keine illegale Inhalte oder diskutiere über illegale Aktivitäten.\n\n## Spam, Werbung und Links\n\n- Unterlasse Spam jeglicher Art.\n\n- Werbung darf nur in den dafür vorgesehenen Channels gesendet werden.\n\n## Serverlücken\n\n- Die Ausnutzung von Serverlücken ist strengstens untersagt\n\n- Gefundene Lücken müssen per Ticket an die Moderation gemeldet werden.\n\n## Regelverstöße\n\n- Regelverstöße müssen an das Server-Team gemeldet werden.`,
        );
      const privacyRule = new EmbedBuilder()
        .setColor("#ffffff")
        .setDescription(
          `# Privatsphäre und Sicherheit\n## Datenschutz\n\n- Teile nicht deine persönlichen Daten oder die anderer.\n\n- Respektiere die Privatsphäre anderer Mitglieder.\n\n## Keine unerwünschte Kontaktaufnahme\n\n- Sende nicht unaufgefordert Freundschaftsanfragen oder Direktnachrichten an andere.\n\n- Wünsche nach Ruhe sind zu respektieren.`,
        );
      const useRule = new EmbedBuilder()
        .setColor("#ffffff")
        .setDescription(
          `# Server Nutzung und Kommunikation\n## Richtige Kanäle\n\n- Poste wenn möglich in die dafür vorgesehenen Channels.\n\n- Bots dürfen nur in den dafür vorgesehenen Channels genutzt werden.\n\n## Sprache und Ausdruck\n\n- Kommuniziere freundlich, konstruktiv und versuche das Fluchen in Maßen zu halten.\n\n- Deutsch und Englisch sind die eizig erlaubten Sprachen auf diesem Server.\n\n## Verhalten in Voice Channels\n\n- Vermeide störgeräusche.\n\n- Das machen von Audio- und Videoaufnahmen von Voice-Chats ist nur mit der ausdrücklichen Erlaubnis aller Beteiligten erlaubt.\n\n## Rangsystem & XP\n\n- Es zählen nur echte Einladungen/Personen um XP zu erhalten. Das Einladen von 2. Accounts oder Fake Accounts wird anerkannt und ist verboten. Das manipulieren von Einladungen führt zu einen Ausschluss des Rangsystems\n\n- Spamming um schneller XP zu erlangen ist verboten.`,
        );
      const channelRule = new EmbedBuilder()
        .setColor("#ffffff")
        .setDescription(
          `# Channelspezifische Regeln\n## Tickets\n\n- Der Missbrauch von Tickets, wie beispielsweise durch das öffnen ohne Grund ist nicht erlaubt.\n\n- Bot-Fehler sind per Ticket zu melden und nicht in öffentlichen Channels zu diskutieren.\n\n## Counting\n\n- Absichtliches Falschzählen (um andere zu provozieren) ist verboten.\n\n## Giveaways\n\n- Tickets für Giveaways müssen innerhalb von 2 Tagen nach Ende geöffnet werden.\n\n- Im Fall, dass der Nutzer auf einem Server gebannt ist, für den das Giveaway ist, darf am Giveaway nicht teilgenommen werden.\n\n- Mitglieder mit einer Konto-Sperre dürfen nicht an Giveaways teilnehmen, die ein aktives Konto voraussetzen.\n\n## Vorschläge\n\n- Verbesserungsvorschläge für Bot und Server sind im Vorschläge-Forum einzureichen.`,
        );
      const modRule = new EmbedBuilder()
        .setColor("#ffffff")
        .setDescription(
          `# Moderation und Konsequenzen\n## Verhalten gegenüber Moderatoren\n\n- Entscheidungen der Moderation sind zu respektieren. Bei Problemen mit Entscheidungen ist ein Ticket zu erstellen.\n\n- Den Anweisungen der Moderation ist Folge zu leisten.\n\n- Ein Administrator zu pingen, ist nur in Sonderfällen erlaubt. Kleinere Anliegen gehen an die Moderation.\n\n## Discord Nutzerbedingungen\n\n- Die offiziellen Discord Richtlinien und Nutzerbedingungen müssen zu jeder Zeit eingehalten werden.\n\n- https://discord.com/terms\n\n## Konsequenzen bei Verstößen\n\n- Bei Verstößen können Verwarnungen, temporäre oder permanente Sperren verhangen werden.\n\n- Moderatoren dürfen jederzeit Inhalte entfernen, die gegen Regeln verstoßen.\n\n- Administratoren ist jederzeit das Recht vorbehalten, Nutzer auch ohne Angabe eines Grundes zu verwarnen, zu sperren oder anderweitig zu bestrafen.\n\n## Verarbeitung und Schutz von Daten\n\n- Bei der Nutzung unseres Discord-Servers und seiner Funktionen werden personenbezogene Daten verarbeitet und teilweise gespeichert. Dies ist für den Betrieb, die Verwaltung und die Sicherheit des Servers erforderlich. Weitere Informationen zu den verarbeiteten Daten, deren Speicherdauer und den Betroffenenrechten findest du in unserer [Datenschutzerklärung](https://kekse-bot.de/datenschutz).`,
        );
      console.log(`Send: [Rules]`);
      msg.channel
        .send({
          embeds: [defaultRule, privacyRule, useRule, channelRule, modRule],
        })
        .catch(() => {});
    }
  });
}
function initReminder(client) {
  async function checkReminders() {
    const now = Date.now();
    const reminderData = (await getRData("reminders")) || { reminders: [] };
    if (!reminderData.reminders || reminderData.reminders.length === 0) return;
    const dueReminders = reminderData.reminders.filter((r) => r.time <= now);
    if (dueReminders.length === 0) return;
    reminderData.reminders = reminderData.reminders.filter((r) => r.time > now);
    await setRData("reminders", reminderData);
    for (const r of dueReminders) {
      try {
        const channel = await client.channels
          .fetch(r.channelId)
          .catch(() => null);
        if (channel && channel.isTextBased()) {
          console.log(`Send: [remind]`);
          await channel.send(`<@${r.userId}>, Erinnerung: ${r.reason}`);
          continue;
        }
        const user = await client.users.fetch(r.userId).catch(() => null);
        if (user) {
          await user
            .send(`Erinnerung aus einem gelöschten Kanal: ${r.reason}`)
            .catch(() => {});
        }
      } catch (err) {
        console.log(
          `Fehler beim Senden einer Erinnerung: ${err.message}`,
        );
      }
    }
  }
  setInterval(checkReminders, 10000);
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.content.startsWith("!remind")) return;
    const args = message.content.slice(7).trim().split(/ +/);
    const timeStr = args.shift();
    const reason = args.join(" ");
    if (!timeStr || !reason) {
      console.log(`Reply ${message.author.username}: Nutzung: "!remind <Zeit(m/h/d)> <Grund>"`);
      return message
        .reply(
          "Nutzung: `!remind <Zeit(m/h/d)> <Grund>`",
        )
        .catch(() => {});
    }
    const ms = parseTimeframe(timeStr);
    if (!ms || ms < 10000) {
      console.log(`Reply ${message.author.username}: Ungültige Zeitangabe. Mindestens 10 Sekunden (z.B. 10s, 5m, 1h, 2d).`);
      return message
        .reply(
          "Ungültige Zeitangabe. Mindestens 10 Sekunden (z.B. 10s, 5m, 1h, 2d).",
        )
        .catch(() => {});
    }
    const reminderData = (await getRData("reminders")) || { reminders: [] };
    const newReminder = {
      userId: message.author.id,
      channelId: message.channel.id,
      time: Date.now() + ms,
      reason: reason,
    };
    reminderData.reminders.push(newReminder);
    await setRData("reminders", reminderData);
    console.log(`Reply ${message.author.username}: Ich werde dich in ${timeStr} erinnern.`);
    message.reply(`Ich werde dich in **${timeStr}** erinnern.`).catch(() => {});
  });
}
let countingData = {
  currentNumber: 1,
  direction: 1,
  lastUserId: null,
  lastCountingTime: null,
  scoreboard: {},
  systemPuffer: 0,
  lastPufferGranted: 0,
};
let kingId = null;
let topScore = 0;
function recalcKing() {
  kingId = null;
  topScore = 0;
  for (const [id, s] of Object.entries(countingData.scoreboard || {})) {
    if (s > topScore) { topScore = s; kingId = id; }
  }
}
function recordHighscore(num, msg) {
  const reached = Math.abs(num);
  if (reached <= (countingData.highscore || 0)) return;
  countingData.highscore = reached;
  countingData.highscoreBy = msg.author.id;
  countingData.highscoreAt = msg.createdTimestamp;
}
let countingLock = Promise.resolve();
let liveListenerRegistered = false;
const processedMessageIds = new Set();
function withCountingLock(fn) {
  const run = countingLock.then(() => fn());
  countingLock = run.catch(() => {});
  return run;
}
async function loadCounting() {
  const stored = await getCouData("counting");
  if (stored) {
    countingData = stored;
  } else {
    await saveCounting();
  }
  recalcKing();
}
async function saveCounting() {
  await setCouData("counting", countingData);
}
function getMilestoneReward(score) {
  if (score < 10) return null;
  if (score <= 90) return score % 10 === 0 ? score : null;
  if (score <= 900) return score % 100 === 0 ? score : null;
  if (score <= 100000) return score % 1000 === 0 ? 5000 : null;
  return null;
}
export async function initCounting(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Bot | Counting System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  const checkMilestone = async (userId, channel) => {
    const score = countingData.scoreboard[userId];
    const reward = getMilestoneReward(score);
    if (!reward) return;
    countingData.milestonesClaimed = countingData.milestonesClaimed || {};
    const claimKey = `${userId}_${score}`;
    if (countingData.milestonesClaimed[claimKey]) return;
    countingData.milestonesClaimed[claimKey] = true;
    const mileUserData = (await getEcoData(userId)) || {};
    mileUserData.balance = (mileUserData.balance || 0) + reward;
    await logTransaction(
      userId,
      reward,
      "plus",
      `Counting Meilenstein ${score}`,
    );
    await setEcoData(userId, mileUserData);
    await channel
      .send(
        `:tada: <@${userId}> hat **${score} Zählungen** erreicht und erhält **${reward} Kekse** als Belohnung!`,
      )
      .catch(() => {});
  };
  const handleCountingInner = async (msg, syncMode = false) => {
    if (!syncMode && msg.author.bot) return;
    if (msg.channel.id !== config.channels.counting) return;
    if (!syncMode && msg.content === "!top") {
      const sorted = Object.entries(countingData.scoreboard || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const embed = new EmbedBuilder()
        .setTitle(":trophy: Top 10 Counter")
        .setDescription(
          sorted.map(([id, s], i) => `${i + 1}. <@${id}> • ${s}`).join("\n") ||
            "Keine Daten",
        )
        .setColor("#ffffff")
        .setFooter({ text: "Kekse Clan" });
      console.log(`Reply ${msg.author.username}: [top]`);
      await msg.reply({ embeds: [embed] }).catch(() => {});
      return;
    }
    if (!syncMode && msg.content === "!highscore") {
      const current = Math.max(Math.abs(countingData.currentNumber) - 1, 0);
      const record = Math.max(countingData.highscore || 0, current);
      const holder =
        countingData.highscore === record && countingData.highscoreBy
          ? `\nErreicht von <@${countingData.highscoreBy}> am <t:${Math.floor(countingData.highscoreAt / 1000)}:D>`
          : "";
      const embed = new EmbedBuilder()
        .setTitle(":trophy: Counting-Highscore")
        .setDescription(`Der Highscore liegt bei **${record}**.${holder}\n\nAktueller Stand: **${current}**`)
        .setColor("#ffffff")
        .setFooter({ text: "Kekse Clan" });
      console.log(`Reply ${msg.author.username}: [highscore]`);
      await msg.reply({ embeds: [embed] }).catch(function () {});
      return;
    }
    const match = msg.content.trim().match(/^-?\d+/);
    if (!match && !syncMode && msg.content.startsWith("!set_number")) {
      if (msg.author.id !== config.users.sysadmin) return;
      const args = msg.content.split(" ");
      const newNum = parseInt(args[1]);
      if (isNaN(newNum)) return;
      countingData.currentNumber = newNum;
      countingData.direction = newNum < 0 ? -1 : 1;
      await saveCounting();
      await sendKekseLog(
        "Counting Reset",
        msg.author,
        `Die Zahl wurde auf **${newNum}** gesetzt.`,
      );
      console.log(`Reply ${msg.author.username}: Die nächste Zahl wurde auf ${newNum} gesetzt.`);
      await msg
        .reply(`Die nächste Zahl wurde auf **${newNum}** gesetzt.`)
        .catch(() => {});
      return;
    }
    if (!match) return;
    if (!syncMode && !msg.member) {
      try {
        await msg.guild?.members.fetch(msg.author.id);
      } catch {
        return;
      }
    }
    const member = msg.member;
    if (!syncMode && !member) return;
    const num = parseInt(match[0]);
    if (num > Number.MAX_SAFE_INTEGER || num < -Number.MAX_SAFE_INTEGER) {
      if (!syncMode) {
        await msg.react("❌").catch(() => {});
        console.log(`Reply ${msg.author.username}: Diese zahl ist viel zu groß für das System.`);
        await msg
          .reply("Diese Zahl ist viel zu groß für das System!")
          .catch(() => {});
      }
      return;
    }
    const excludedUsers = [config.users.sysadmin];
    if (countingData.currentNumber === 1 && countingData.lastUserId === null) {
      if (num === 1 || num === -1) {
        countingData.direction = num;
        countingData.currentNumber = num + countingData.direction;
        const currentHundred = Math.floor(
          Math.abs(countingData.currentNumber) / 100,
        );
        if (currentHundred > countingData.lastPufferGranted) {
          countingData.lastPufferGranted = currentHundred;
          countingData.systemPuffer = 1;
          if (!syncMode) {
            console.log(`Counting Puffer aufgeladen.`);
            await msg.channel
              .send(`:shield: Puffer aufgeladen! Der nächste Fehler wird abgefangen.`)
              .catch(() => {});
          }
        }
        countingData.lastUserId = msg.author.id;
        countingData.lastCountingTime = msg.createdTimestamp;
        countingData.lastMessageId = msg.id;
        recordHighscore(num, msg);
        await saveCounting();
        if (!syncMode) await msg.react("✅").catch(() => {});
        return;
      }
    }
    if (
      num !== countingData.currentNumber ||
      msg.author.id === countingData.lastUserId
    ) {
      const reason =
        num !== countingData.currentNumber
          ? `Falsche Zahl (${num} statt ${countingData.currentNumber})`
          : "Doppel-Post";
      const hasRolePuffer =
        !syncMode && member ? member.roles.cache.has(config.roles.countingPuffer) : false;
      if (countingData.systemPuffer > 0) {
        countingData.systemPuffer = 0;
        await saveCounting();
        if (!syncMode) {
          await msg.react("🛡️").catch(() => {});
          console.log(` Server-Counting-Puffer verbraucht.`);
          await msg.channel
            .send(
              `:shield: Server-Puffer verbraucht! Weiter zählen ab **${countingData.currentNumber}**.`,
            )
            .catch(() => {});
        }
        return;
      }
      if (hasRolePuffer) {
        try {
          await member.roles.remove(config.roles.countingPuffer);
        } catch {
          return;
        }
        countingData.currentNumber = num + countingData.direction;
        const currentHundred = Math.floor(
          Math.abs(countingData.currentNumber) / 100,
        );
        if (currentHundred > countingData.lastPufferGranted) {
          countingData.lastPufferGranted = currentHundred;
          countingData.systemPuffer = 1;
          console.log(`Counting Puffer aufgeladen.`);
          if (!syncMode) {
            await msg.channel
              .send(`:shield: Puffer aufgeladen! Der nächste Fehler wird abgefangen.`)
              .catch(() => {});
          }
        }
        countingData.lastUserId = msg.author.id;
        countingData.lastCountingTime = msg.createdTimestamp;
        if (!excludedUsers.includes(msg.author.id)) {
          countingData.scoreboard[msg.author.id] ??= 0;
          countingData.scoreboard[msg.author.id]++;
          if (member.roles.cache.has(config.roles.countingXp30) || member.roles.cache.has(config.roles.countingXp60)) {
            countingData.scoreboard[msg.author.id]++;
          }
          await checkMilestone(msg.author.id, msg.channel);
        }
        countingData.lastMessageId = msg.id;
        await saveCounting();
        const userData = (await getEcoData(msg.author.id)) || {};
        userData.balance = (userData.balance || 0) + 1;
        await logTransaction(msg.author.id, 1, "plus", "Counting");
        await setEcoData(msg.author.id, userData);
        if (!syncMode) await msg.react("🟨").catch(() => {});
        return;
      }
      if (!syncMode) {
        console.log(`Counting Fehler von ${msg.author.username}. Grund: ${reason}`);
        await sendKekseLog(
          "Counting Fehler",
          msg.author,
          `**Grund:** ${reason}\n**Reset auf:** 1 / 1`,
        );
      }
      countingData.currentNumber = 1;
      countingData.direction = 1;
      countingData.lastPufferGranted = 0;
      countingData.systemPuffer = 0;
      countingData.lastUserId = null;
      countingData.lastCountingTime = msg.createdTimestamp;
      countingData.lastMessageId = msg.id;
      await saveCounting();
      if (!syncMode) {
        await msg.react("❌").catch(() => {});
        const replyContent =
          reason === "Doppel-Post"
            ? `<@${msg.author.id}> nicht zwei mal nacheinander! Zurück auf den Start (1 oder -1).`
            : `<@${msg.author.id}> hat falsch gezählt! Zurück auf den Start (1 oder -1).`;
        await msg.reply(replyContent).catch(() => {});
      }
      return;
    }
    countingData.currentNumber = num + (countingData.direction || 1);
    recordHighscore(num, msg);
    const currentHundred = Math.floor(
      Math.abs(countingData.currentNumber) / 100,
    );
    if (currentHundred > countingData.lastPufferGranted) {
      countingData.lastPufferGranted = currentHundred;
      countingData.systemPuffer = 1;
      if (!syncMode) {
        console.log(`Countig Puffer aufgeladen.`);
        await msg.channel
          .send(`:shield: Puffer aufgeladen! Der nächste Fehler wird abgefangen.`)
          .catch(() => {});
      }
    }
    countingData.lastUserId = msg.author.id;
    countingData.lastCountingTime = msg.createdTimestamp;
    if (!excludedUsers.includes(msg.author.id)) {
      countingData.scoreboard[msg.author.id] ??= 0;
      countingData.scoreboard[msg.author.id]++;
      if (member && (member.roles.cache.has(config.roles.countingXp30) || member.roles.cache.has(config.roles.countingXp60))) {
        countingData.scoreboard[msg.author.id]++;
      }
      await checkMilestone(msg.author.id, msg.channel);
    }
    countingData.lastMessageId = msg.id;
    if (!syncMode) msg.react("✅").catch(() => {});
    await saveCounting();
    const userData = (await getEcoData(msg.author.id)) || {};
    userData.balance = (userData.balance || 0) + 1;
    handleMessageXP(msg);
    logTransaction(msg.author.id, 1, "plus", "Counting").catch(() => {});
    await setEcoData(msg.author.id, userData);
    const myScore = countingData.scoreboard[msg.author.id] ?? 0;
    if (myScore > topScore) {
      topScore = myScore;
      if (msg.author.id !== kingId) {
        const oldKing = kingId;
        kingId = msg.author.id;
        const oldMember = oldKing
          ? await msg.guild.members.fetch(oldKing).catch(() => null)
          : null;
        const newMember = await msg.guild.members.fetch(kingId).catch(() => null);
        if (oldMember) await oldMember.roles.remove(config.roles.countingKing).catch(() => {});
        if (newMember) await newMember.roles.add(config.roles.countingKing).catch(() => {});
        console.log(`<@${kingId}> ist der neue King of Counting.`);
        if (!syncMode)
          await msg.channel
            .send(`<@${kingId}> ist der neue **King of Counting**!`)
            .catch(() => {});
      }
    }
  };
    function handleCounting(msg, syncMode = false) {
    return withCountingLock(function () {
      if (processedMessageIds.has(msg.id)) return;
      processedMessageIds.add(msg.id);
      if (processedMessageIds.size > 500) {
        processedMessageIds.delete(processedMessageIds.values().next().value);
      }
      return handleCountingInner(msg, syncMode);
    });
  }
  const runSync = async () => {
    console.log("Starte Counting-Synchronisation...");
    await loadCounting();
    const channel = await client.channels
      .fetch(config.channels.counting)
      .catch((err) => {
        console.error("Fehler beim Abrufen des Counting-Kanals:", err);
        return null;
      });
    if (!channel || !channel.isTextBased()) {
      registerLiveListener();
      return;
    }
    try {
      let lastId = countingData.lastMessageId;
      let totalRecovered = 0;
      if (!lastId) {
        const lastMsg = await channel.messages.fetch({ limit: 1 });
        countingData.lastMessageId = lastMsg.first()?.id;
        await saveCounting();
        console.log(
          "Keine Referenz-ID gefunden. Starte ab der aktuellsten Nachricht.",
        );
        return;
      }
      let hasMore = true;
      while (hasMore) {
        const missedMessages = await channel.messages.fetch({
          after: lastId,
          limit: 100,
        });
        if (missedMessages.size === 0) {
          hasMore = false;
        } else {
          const sorted = [...missedMessages.values()].reverse();
          for (const msg of sorted) {
            await handleCounting(msg, true);
          }
          lastId = sorted[sorted.length - 1].id;
          totalRecovered += missedMessages.size;
          if (missedMessages.size === 100) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
      if (totalRecovered > 0) {
        console.log(
          `Synchronisation abgeschlossen. ${totalRecovered} Nachrichten nachgeholt.`,
        );
      } else {
        console.log("Keine verpassten Zahlen gefunden.");
      }
    } catch (err) {
      console.error("Fehler bei der Synchronisation:", err);
    } finally {
      registerLiveListener();
    }
  };
  function registerLiveListener() {
    if (liveListenerRegistered) return;
    liveListenerRegistered = true;
    client.on(Events.MessageCreate, async function (msg) {
      try {
        await handleCounting(msg, false);
      } catch (err) {
        console.error("Fehler im Counting-Handler:", err);
      }
    });
    console.log("Live-Zähler aktiv.");
  }
  if (client.isReady()) {
    runSync();
  } else {
    client.once(Events.ClientReady, runSync);
  }
  await loadCounting();
}
const GIVEAWAY_EMOJI = "🎉";
const EMBED_COLOR = 0xffffff;
function countUnique(participants) {
  return new Set(participants || []).size;
}
function getLinkedAccounts(networks, userId) {
  const linked = new Set();
  const visited = new Set([userId]);
  const queue = [userId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [accountId, accounts] of Object.entries(networks || {})) {
      const accountList = Array.isArray(accounts) ? accounts : [];
      if (accountId === current) {
        for (const linkedId of accountList) {
          if (!visited.has(linkedId)) {
            visited.add(linkedId);
            linked.add(linkedId);
            queue.push(linkedId);
          }
        }
      }
      if (accountList.includes(current) && !visited.has(accountId)) {
        visited.add(accountId);
        linked.add(accountId);
        queue.push(accountId);
      }
    }
  }
  linked.delete(userId);
  return linked;
}
function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
async function buildPool(guild, participants) {
  const pool = [];
  const counts = new Map();
  for (const id of participants || []) counts.set(id, (counts.get(id) || 0) + 1);
  for (const [userId, tickets] of counts) {
    if (!guild.members.cache.has(userId)) continue;
    for (let i = 0; i < tickets; i++) pool.push(userId);
  }
  return pool;
}
function pickWinners(pool, count, excluded) {
  const winners = [];
  const shuffled = shuffle(pool);
  for (const id of shuffled) {
    if (winners.length >= count) break;
    if (excluded.includes(id)) continue;
    if (!winners.includes(id)) winners.push(id);
  }
  return winners;
}
export async function initGiveaway(client) {
  async function sendKekseLog(action, user, details) {
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Bot | Giveaway System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(function () {});
  }
  async function checkGiveaways() {
    const giveaways = (await getGivData("activeGiveaways")) || {};
    const now = Date.now();
    for (const [msgId, data] of Object.entries(giveaways)) {
      if (now < data.endTime) continue;
      const channel = await client.channels.fetch(data.channelId).catch(() => null);
      const msg = channel ? await channel.messages.fetch(msgId).catch(() => null) : null;
      delete giveaways[msgId];
      await setGivData("activeGiveaways", giveaways);
      if (msg) await endGiveaway(client, msg, data, sendKekseLog);
    }
  }
  setInterval(checkGiveaways, 10000);
  client.on("messageCreate", async function (msg) {
    if (!msg.content.startsWith("!giveaway") || msg.author.bot) return;
    if (!msg.member.roles.cache.has(config.roles.team)) return denyReply(msg, "Du hast keine Berechtigung diesen Befehl zu nutzen.");
    const args =
      msg.content
        .slice(1)
        .match(/(?:[^\s"]+|"[^"]*")+/g)
        ?.map(function (a) {
          return a.replace(/"/g, "");
        }) || [];
    args.shift();
    if (args[0] && args[0].toLowerCase() === "reroll") {
      const giveawayId = args[1];
      const count = parseInt(args[2]) || 1;
      if (!giveawayId || count < 1) return denyReply(msg, "Syntax: `!giveaway reroll <giveawayid> <anzahl>`");
      const error = await rerollGiveaway(client, msg.guild, giveawayId, count, msg.author, sendKekseLog);
      if (error) return msg.reply(error);
      return msg.delete().catch(function () {});
    }
    let winnerCount = 1;
    let requiredRoles = [];
    let rolesGiven = false;
    const positional = [];
    for (const arg of args) {
      if (arg.startsWith("winners=")) {
        winnerCount = parseInt(arg.split("=")[1]) || 1;
      } else if (arg.startsWith("roles=")) {
        rolesGiven = true;
        requiredRoles = arg.slice(6).match(/\d{17,20}/g) || [];
      } else {
        positional.push(arg);
      }
    }
    if (positional.length < 3) return denyReply(msg, 'Syntax: `!giveaway #channel 1h "Preis" "Text" winners=2 roles=@Rolle1,@Rolle2`');
    const channel =
      msg.mentions.channels.first() ||
      msg.guild.channels.cache.get(positional[0]);
    if (!channel) return msg.reply("Kanal nicht gefunden.");
    const durationMs = parseDuration(positional[1]);
    if (durationMs <= 0) return denyReply(msg, "Zeitformat ungültig (z.B. 1h, 30m, 1d).");
    if (rolesGiven && requiredRoles.length === 0) return denyReply(msg, "Keine gültige Rolle bei `roles=` gefunden.");
    requiredRoles = [...new Set(requiredRoles)];
    for (const roleId of requiredRoles) {
      if (!msg.guild.roles.cache.has(roleId)) return denyReply(msg, `Rolle \`${roleId}\` existiert nicht auf diesem Server.`);
    }
    const price = positional[2];
    const messageText = positional[3] || "Viel Glück 🍀";
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    const giveawayData = {
      channelId: channel.id,
      startTime,
      endTime,
      price,
      messageText,
      winnerCount,
      requiredRoles,
      hostId: msg.author.id,
      participants: [],
    };
    const embed = new EmbedBuilder()
      .setTitle(`:gift: Giveaway: ${price}`)
      .setDescription(buildDescription(giveawayData, 0))
      .setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`join_giveaway`)
        .setLabel("Teilnehmen")
        .setEmoji(GIVEAWAY_EMOJI)
        .setStyle(ButtonStyle.Primary),
    );
    const giveawayMsg = await channel.send({
      content: `<@&${config.roles.giveaways}>`,
      embeds: [embed],
      components: [row],
    });
    const giveaways = (await getGivData("activeGiveaways")) || {};
    giveaways[giveawayMsg.id] = giveawayData;
    await setGivData("activeGiveaways", giveaways);
    let logDetails = `**Preis:** ${price}\n**Kanal:** ${channel}\n**Dauer:** ${positional[1]}\n**Gewinner:** ${winnerCount}`;
    if (requiredRoles.length > 0)
      logDetails += `\n**Benötigte Rolle:** ${formatRoles(requiredRoles)}`;
    await sendKekseLog("Giveaway gestartet", msg.author, logDetails);
    await msg.delete().catch(function () {});
    if (args[0] && args[0].toLowerCase() === "reroll") {
      const giveawayId = args[1];
      const count = parseInt(args[2]) || 1;
      if (!giveawayId || count < 1) {
        return msg.reply("Syntax: `!giveaway reroll <giveawayid> <anzahl>`");
      }
      const error = await rerollGiveaway(
        client,
        msg.guild,
        giveawayId,
        count,
        msg.author,
        sendKekseLog,
      );
      if (error) return msg.reply(error);
      return msg.delete().catch(function () {});
    }
  });
  client.on("interactionCreate", async function (interaction) {
    if (!interaction.isButton() || interaction.customId !== "join_giveaway")
      return;
    const giveaways = (await getGivData("activeGiveaways")) || {};
    const data = giveaways[interaction.message.id];
    if (!data) {
      console.log(`Reply ${interaction.user.username}: Dieses Giveaway ist nicht mehr aktiv.`);
      return interaction.reply({
        content: "Dieses Giveaway ist nicht mehr aktiv.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const requiredRoles = data.requiredRoles || [];
    if (requiredRoles.length > 0) {
      let hasRequiredRole = false;
      for (const roleId of requiredRoles) {
        if (interaction.member.roles.cache.has(roleId)) {
          hasRequiredRole = true;
          break;
        }
      }
      if (!hasRequiredRole) {
        console.log(`Reply ${interaction.user.username}: Du kannst nicht teilnehmen. Dafür brauchst du eine der folgenden Rollen: ${formatRoles(requiredRoles)}`);
        return interaction.reply({
          content: `Du kannst nicht teilnehmen. Dafür brauchst du eine der folgenden Rollen: ${formatRoles(requiredRoles)}`,
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
    if (data.participants.includes(interaction.user.id)) {
      console.log(`Reply ${interaction.user.username}: Du nimmst bereits an diesem Giveaway teil!`);
      return interaction.reply({
        content: "Du nimmst bereits an diesem Giveaway teil!",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const networks = (await getSaData("alt_networks")) || {};
    const linkedAccounts = getLinkedAccounts(networks, interaction.user.id);
    const participantConflict = [...linkedAccounts].find(function (id) {
      return data.participants.includes(id);
    });
    if (participantConflict) {
      console.log(
        `Reply ${interaction.user.username}: Du kannst nicht teilnehmen, da bereits ein registrierter Zweitaccount von dir im Giveaway ist.`
      );
      return interaction.reply({
        content:
          "Du kannst nicht teilnehmen, da bereits ein registrierter Zweitaccount von dir im Giveaway ist!",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const bonusRoles = [config.roles.booster, config.roles.giveawayDouble];
    const activeBonusCount = interaction.member.roles.cache.filter(
      function (role) {
        return bonusRoles.includes(role.id);
      },
    ).size;
    const totalTickets =
      activeBonusCount === 2 ? 4 : activeBonusCount === 1 ? 2 : 1;
    if (config.users.giveaway_blocked.includes(interaction.user.id)) {
      await sendKekseLog(
        "Giveaway Teilnahme blockiert",
        interaction.user,
        `**Preis:** ${data.price}`,
      );
      console.log(
        `${interaction.user.tag} hat versucht am Giveaway für "${data.price}" teilzunehmen.`,
      );
      addXP(interaction.user.id, 10, client);
      let replyText = "Du hast das Giveaway erfolgreich betreten!";
      if (totalTickets === 2) {
        replyText += " (Inklusive **doppelter Chance** durch deine Rolle!)";
      } else if (totalTickets === 4) {
        replyText +=
          " (Inklusive **4-facher Chance**, da du beide Rollen besitzt!)";
      }
      return interaction
        .reply({ content: replyText, flags: [MessageFlags.Ephemeral] })
        .catch(function () {});
    }
    for (let i = 0; i < totalTickets; i++) {
      data.participants.push(interaction.user.id);
    }
    giveaways[interaction.message.id] = data;
    await setGivData("activeGiveaways", giveaways);
    interaction.message
      .edit({
        embeds: [
          EmbedBuilder.from(interaction.message.embeds[0]).setDescription(
            buildDescription(data, countUnique(data.participants)),
          ),
        ],
      })
      .catch(() => {});
    addXP(interaction.user.id, 10, client);
    let replyText = "Du hast das Giveaway erfolgreich betreten!";
    if (totalTickets === 2) {
      replyText += " (Inklusive **doppelter Chance** durch deine Rolle!)";
    } else if (totalTickets === 4) {
      replyText +=
        " (Inklusive **4-facher Chance**, da du beide Rollen besitzt!)";
    }
    sendKekseLog("Giveaway Teilnahme", interaction.user, `**Preis:** ${data.price}\n**Teilnehmer:** ${data.participants.length}`);
    console.log(`${interaction.user.username} hat das Giveaway betreten.`);
    return interaction
      .reply({ content: replyText, flags: [MessageFlags.Ephemeral] })
      .catch(function () {});
  });
}
async function endGiveaway(client, msg, data, logFunc) {
  const guild = msg.guild;
  const participants = data.participants || [];
  const rafflePool = await buildPool(guild, participants);
  const winners = pickWinners(rafflePool, data.winnerCount, []);
  const winnerMentions = winners.length
    ? winners
        .map(function (id) {
          return `<@${id}>`;
        })
        .join(", ")
    : "Niemand";
  const endEmbed = EmbedBuilder.from(msg.embeds[0])
    .setTitle(`:confetti_ball: Giveaway beendet: ${data.price}`)
    .setDescription(
      `${data.messageText}\n\nBeendet am: <t:${Math.floor(data.endTime / 1000)}:f>\nTeilnehmer: **${countUnique(participants)}**\nGewinner: ${winnerMentions}`,
    )
    .setColor(0x2f3136);
  await msg.edit({ embeds: [endEmbed], components: [] }).catch(function () {});
  if (winners.length > 0) {
    await msg.channel.send(
      `:tada: Glückwunsch ${winnerMentions}! Du hast **${data.price}** gewonnen!\nMelde dich bitte zeitnah im Support.`,
    );
  }
  const ended = (await getGivData("endedGiveaways")) || {};
  ended[msg.id] = {
    channelId: data.channelId,
    price: data.price,
    hostId: data.hostId,
    endTime: data.endTime,
    winnerCount: data.winnerCount,
    participants: participants,
    winners: winners,
  };
  await setGivData("endedGiveaways", ended);
  const uniqueParticipants = [...new Set(participants)];
  for (const userId of uniqueParticipants) {
    const member = await guild.members.fetch(userId).catch(function () {
      return null;
    });
    if (member && member.roles.cache.has(config.roles.giveawayDouble)) {
      await member.roles.remove(config.roles.giveawayDouble).catch(function () {});
    }
  }
  const host = await client.users.fetch(data.hostId).catch(function () {
    return client.user;
  });
  await logFunc(
    "Giveaway beendet",
    host,
    `**Preis:** ${data.price}\n**Teilnehmer:** ${countUnique(participants)}\n**Gewinner:** ${winnerMentions}`,
  );
  const reportChannel = await client.channels
    .fetch(config.channels.logs)
    .catch(function () {
      return null;
    });
  if (reportChannel) {
    const report = {
      giveaway_id: msg.id,
      prize: data.price,
      host: data.hostId,
      winners: winners,
      total_participants: participants.length,
      participant_list: participants,
    };
    const buffer = Buffer.from(JSON.stringify(report, null, 2), "utf-8");
    const attachment = new AttachmentBuilder(buffer, {
      name: `report_${msg.id}.json`,
    });
    await reportChannel.send({
      content: `**Giveaway Report**\n**Preis:** ${data.price}\n**ID:** ${msg.id}`,
      files: [attachment],
    });
  }
}
function parseDuration(input) {
  if (!input) return 0;
  const match = input.match(/^(\d+)(s|sec|m|min|h|std|d|tag|tage)$/i);
  if (!match) return 0;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("s")) return value * 1000;
  if (unit.startsWith("m")) return value * 60000;
  if (unit.startsWith("h") || unit === "std") return value * 3600000;
  if (unit.startsWith("d") || unit.startsWith("t")) return value * 86400000;
  return 0;
}
export function buildDescription(data, participantCount) {
  const endUnix = Math.floor(data.endTime / 1000);
  let text = `${data.messageText}\n\nEndet am: <t:${endUnix}:R> (<t:${endUnix}:f>)\nTeilnehmer: **${participantCount}**\nGewinner: **${data.winnerCount}**`;
  if (data.requiredRoles && data.requiredRoles.length > 0) {
    text += `\nBenötigte Rolle: ${formatRoles(data.requiredRoles)}`;
  }
  return text;
}
export function formatRoles(roleIds) {
  const parts = [];
  for (const id of roleIds) parts.push(`<@&${id}>`);
  return parts.join(", ");
}
export async function rerollGiveaway(
  client,
  guild,
  giveawayId,
  count,
  actor,
  logFunc,
) {
  const ended = (await getGivData("endedGiveaways")) || {};
  const data = ended[giveawayId];
  if (!data) {
    const active = (await getGivData("activeGiveaways")) || {};
    if (active[giveawayId])
      return "Dieses Giveaway läuft noch und kann nicht gerollt werden.";
    return "Kein beendetes Giveaway mit dieser ID gefunden.";
  }
  const channel = await client.channels
    .fetch(data.channelId)
    .catch(function () {
      return null;
    });
  if (!channel) return "Der Kanal des Giveaways existiert nicht mehr.";
  const pool = await buildPool(guild, data.participants);
  const previousWinners = data.winners || [];
  const winners = pickWinners(pool, count, previousWinners);
  if (winners.length === 0)
    return "Es gibt keine weiteren Teilnehmer für einen Reroll.";
  const mentions = [];
  for (const id of winners) mentions.push(`<@${id}>`);
  const winnerMentions = mentions.join(", ");
  console.log(`Giveaway neu ausgelost.`);
  await channel.send(
    `**Reroll _(${count})_:**:tada: Glückwunsch ${winnerMentions}! Du hast ${data.price} gewonnen.\nMelde dich im Support.`,
  );
  data.winners = previousWinners.concat(winners);
  ended[giveawayId] = data;
  await setGivData("endedGiveaways", ended);
  await logFunc(
    "Giveaway Reroll",
    actor,
    `**Preis:** ${data.price}\n**ID:** ${giveawayId}\n**Anzahl:** ${count}\n**Neue Gewinner:** ${winnerMentions}`,
  );
  return null;
}
export function registerMessageCommands(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;
    if (msg.content.startsWith("!setup_dashboardInfo")) {
      if (msg.author.id !== config.users.sysadmin) return;
      const infoEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setTitle(`Dashboard Login`)
        .setDescription(`So meldest du dich im Dashboard an:`)
        .addFields(
          {
            name: `Schritt 1`,
            value: `Lass dir deine Zugangsdaten von einem Administrator geben.`,
          },
          {
            name: `Schritt 2`,
            value: `Öffne das [Dashboard](https://kekse-bot.de)`,
          },
          {
            name: `Schritt 3`,
            value: `Melde dich mit deinen Zugangsdaten an.`,
          },
          {
            name: `Schritt 4`,
            value: `Setze dein eigenes Passwort.`,
          },
          {
            name: `Schritt 5`,
            value: 'Nutze `/dashboard-verify` und gebe den erhaltenen Verifizierungs-Code ein.',
          },
        )
        .setFooter({ text: `Kekse Bot Dashboard` })
      await msg.channel.send({embeds: [infoEmbed]});
    }
    if (
      !msg.member.roles.cache.has(config.roles.team) &&
      !msg.member.permissions.has(PermissionsBitField.Flags.ManageMessages)
    )
      return;
    const args =
      msg.content
        .slice(1)
        .match(/(?:[^\s"]+|"[^"]*")+/g)
        ?.map((a) => a.replace(/"/g, "")) || [];
    const cmd = args.shift().toLowerCase();
    const deleteCmd = () => msg.delete().catch(() => {});
    const sendKekseLog = async (commandName, target, content) => {
      const logChannel = client.channels.cache.get(config.channels.logs);
      if (logChannel) {
        const kekseEmbed = new EmbedBuilder()
          .setColor("#ffffff")
          .setAuthor({
            name: msg.author.username,
            iconURL: msg.author.displayAvatarURL({ size: 512 }),
          })
          .setDescription(
            `**Aktion:** \`!${commandName}\`\n**Ziel:** ${target}\n**Inhalt:**\n\`\`\`${content || "Kein Inhalt"}\`\`\``,
          )
          .setFooter({ text: "Kekse Bot | Message System" })
          .setTimestamp();
        await logChannel.send({ embeds: [kekseEmbed] });
      }
    };
    if (cmd === "send") {
      await deleteCmd();
      const channel = msg.mentions.channels.first();
      const text = msg.content.replace(/^!send\s+<#[0-9]+>\s?/, "").trim();
      if (channel && text) {
        await channel.send(text);
        await sendKekseLog("send", channel.toString(), text);
        
        console.log(`${msg.author.username} hat die "send"-Funktion genutzt.`);
      }
    }
    if (cmd === "changelog") {
      await deleteCmd();
      const changelogChannel = msg.guild.channels.cache.get(config.channels.changelog);
      if (!changelogChannel || args.length === 0) return;
      const date = new Date().toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const updateList = args.map((item) => `- ${item}`).join("\n");
      const messageFormat = `<@&${config.roles.changelog}>\n**:wrench: Änderungen (${date})**\n${updateList}`;
      await changelogChannel.send(messageFormat);
      await sendKekseLog("changelog", changelogChannel.toString(), updateList);
      
      console.log(`${msg.author.username} hat die "changelog"-Funktion genutzt`);
    }
    if (cmd === "embed") {
      await deleteCmd();
      const channel = msg.mentions.channels.first();
      const title = args[1];
      const text = args[2];
      const color = args[3] || "#ffffff";
      if (channel && title && text) {
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(text)
          .setColor(color);
        await channel.send({ embeds: [embed] });
        await sendKekseLog(
          "embed",
          channel.toString(),
          `Titel: ${title}\nText: ${text}`,
        );
        
        console.log(`${msg.author.username} hat die "embed"-Funktion genutzt`);
      }
    }
    if (cmd === "dm") {
      await deleteCmd();
      const userId = args[0];
      const text = args.slice(1).join(" ");
      const user = await client.users.fetch(userId).catch(() => null);
      if (user && text) {
        await user.send(text).catch(() => {});
        await sendKekseLog("dm", `${user.tag} (${userId})`, text);
        
        console.log(`${msg.author.username} hat die "dm"-Funktion genutzt`);
      }
    }
    if (cmd === "reply") {
      await deleteCmd();
      const channelMention = msg.mentions.channels.first() || msg.channel;
      const msgId = args.find((a) => /^\d{17,20}$/.test(a));
      let text = args
        .filter((a) => !a.includes(msgId) && !a.startsWith("<#"))
        .join(" ");
      if (!msgId || !text) return;
      
      console.log(`${msg.author.username} hat die "news"-Funktion genutzt`);
      try {
        const targetMsg = await channelMention.messages.fetch(msgId);
        targetMsg.system
          ? await channelMention.send(text)
          : await targetMsg.reply(text);
        await sendKekseLog("reply", `Nachricht ID ${msgId}`, text);
      } catch (err) {
        await msg.channel
          .send("Nachricht nicht gefunden.")
          .then((m) => setTimeout(() => m.delete(), 3000));
      }
    }
  });
}
export function initPing(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!ping") || msg.author.bot) return;
    if (!msg.member.roles.cache.has(config.roles.team)) {
      const warn = await msg.channel.send("Du hast keine Berechtigung diese Funktion zu nutzen.");
      return setTimeout(() => {
        warn.delete().catch(() => {});
        msg.delete().catch(() => {});
      }, 5000);
    }
    
    const start = Date.now();
    const sentMsg = await msg.channel.send(":ping_pong: Pinging...").catch(() => null);
    if (!sentMsg) return;
    const end = Date.now();
    const roundtrip = end - start;
    const wsPing = client.ws.ping;
    await sentMsg
      .edit({
        content: `:ping_pong: **Pong!**\n- API-Latenz: \`${roundtrip}ms\`\n- WebSocket: \`${wsPing}ms\``,
      })
      .catch(() => {});
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (logChannel) {
      const kekseLog = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: msg.author.username,
          iconURL: msg.author.displayAvatarURL({ size: 512 }),
        })
        .setDescription(
          `**Aktion:** \`!ping\`\n**Ergebnis:** RT: \`${roundtrip}ms\` | WS: \`${wsPing}ms\``,
        )
        .setFooter({ text: "Kekse Bot | System Check" })
        .setTimestamp();
      await logChannel.send({ embeds: [kekseLog] });
      console.log(`${msg.author.username} hat die "ping"-Funktion genutzt`);
    }
    setTimeout(() => {
      sentMsg.delete().catch(() => {});
      msg.delete().catch(() => {});
    }, 10000);
  });
}
function clanRankOf(member) {
  const r = member.roles.cache;
  if (r.has(config.roles.admin)) return 4;
  if (r.has(config.roles.team)) return 3;
  if (r.has(config.roles.member)) return 2;
  if (r.has(config.roles.testmember)) return 1;
  return 0;
}
export async function clanChange(client, member, action) {
  const cur = clanRankOf(member);
  const id = member.id;
  const memberCh = await client.channels
    .fetch(config.channels.memberchat)
    .catch(() => null);
  const teamCh = await client.channels
    .fetch(config.channels.modchat)
    .catch(() => null);
  const say = (ch, text) => ch?.send(text).catch(() => {});
  if (cur === 4) throw new Error("Admins können hier nicht verändert werden.");
  if (action === "promote") {
    if (cur === 0) {
      await member.roles.add(config.roles.testmember);
      await say(
        memberCh,
        `<@${id}> hat den Clan betreten. Herzlich Willkommen :cookie:`,
      );
      return "Neuer Rang: Test Member";
    }
    if (cur === 1) {
      await member.roles.remove(config.roles.testmember);
      await member.roles.add(config.roles.member);
      await say(memberCh, `<@${id}> ist nun ein vollwertiges Mitglied.`);
      return "Neuer Rang: Member";
    }
    if (cur === 2) {
      await member.roles.add([config.roles.team, config.roles.moderator]);
      await say(teamCh, `<@${id}> hat das Team betreten.`);
      return "Neuer Rang: Team";
    }
    throw new Error("Höher als Team ist nicht möglich.");
  }
  if (action === "demote") {
    if (cur === 0) throw new Error("User ist kein Clan-Mitglied.");
    if (cur === 3) {
      await member.roles.remove([config.roles.team, config.roles.moderator]);
      await member.roles.add(config.roles.member);
      await say(teamCh, `<@${id}> hat das Team verlassen.`);
      return "Neuer Rang: Member";
    }
    await member.roles.remove([config.roles.testmember, config.roles.member]);
    await say(memberCh, `<@${id}> hat den Clan verlassen. :wave:`);
    return "Neuer Rang: User";
  }
  if (action === "kick") {
    if (cur === 0) throw new Error("User ist kein Clan-Mitglied.");
    const wasTeam = cur === 3;
    await member.roles.remove([config.roles.team, config.roles.moderator, config.roles.member, config.roles.testmember]);
    if (wasTeam)
      await say(teamCh, `:no_entry: <@${id}> wurde aus dem Team geschmissen.`);
    await say(memberCh, `:no_entry: <@${id}> wurde aus dem Clan geschmissen.`);
    return wasTeam ? "Aus Team und Clan entfernt" : "Aus dem Clan entfernt";
  }
  throw new Error("Unbekannte Aktion.");
}
export function initMembers(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.member) return;
    if (!msg.content.startsWith("!member")) return;
    if (!msg.member.roles.cache.has(config.roles.team)) return;
    const args = msg.content.trim().split(/\s+/);
    const sub = args[1]?.toLowerCase();
    const targetId = args[2]?.replace(/[<@!>]/g, "");
    if (!["add", "promote", "remove", "demote", "kick"].includes(sub)) return;
    if (!/^\d{17,20}$/.test(targetId || "")) {
      return msg
        .reply("Nutzung: `!member <add|promote|demote|remove|kick> @User`")
        .catch(() => {});
    }
    try {
      const target = await msg.guild.members.fetch(targetId).catch(() => null);
      if (!target)
        return msg.reply("User nicht auf dem Server.").catch(() => {});
      const action =
        sub === "add" || sub === "promote"
          ? "promote"
          : sub === "kick"
            ? "kick"
            : "demote";
      if (sub === "add" && clanRankOf(target) !== 0)
        return msg.reply("User ist bereits im Clan.").catch(() => {});
      const result = await clanChange(client, target, action);
      
      console.log(
        `${msg.author.username} hat "!member ${sub}" für ${target.user.username} genutzt (${result})`,
      );
      await msg.react("✅").catch(() => {});
    } catch (error) {
      await msg.reply(`:x: ${error.message}`).catch(() => {});
    }
  });
}
export function initReactions(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (
      message.type === MessageType.GuildBoost ||
      message.type === MessageType.GuildBoostTier1 ||
      message.type === MessageType.GuildBoostTier2 ||
      message.type === MessageType.GuildBoostTier3
    ) {
      try {
        console.log(
          `[BOOST] Boost erkannt von ${message.author.username}. Sende Herz-Nachricht.`,
        );
        await message.react("❤️");
      } catch (err) {
        console.error("[BOOST] Fehler beim Senden der Herz-Antwort:", err);
      }
      return;
    }
    if (message.content.includes(":cookie:")) {
      try {
        await message.channel.send("<:pepecookie:1453796363442585660>");
        console.log(`Keks von ${message.author.username} aufgegessen :)`);
      } catch {}
    }
    if (message.mentions.everyone) {
      try {
        await message.channel.send("<a:pingeveryone:1453800508329558218>");
        console.log(`${message.author.username} hat @everyone gepingt :/`);
      } catch {}
    } else if (message.mentions.has(client.user.id)) {
      try {
        await message.channel.send("<:ping:1453799622303813714>");
        console.log(`${message.author.username} hat den Bot gepingt`);
      } catch {}
    }
  });
}
const TRIGGERS = [
  "bot reagiert",
  "bot funzt",
  "bot geht",
  "keine reaktion vom bot",
  "bot antwortet",
  "bot macht nix",
  "ticket wird erstellt",
  "ticket öffnet",
  "ticket geht",
  "kann ticket öffnen",
  "ticket befehl funzt",
  "keine rechte",
  "kann channel sehen",
  "kann schreiben",
  "berechtigung fehlt",
  "nachricht senden",
  "kann nachricht löschen",
  "reaktion wird erkannt",
  "emoji geht",
  "button funzt",
  "reaction auf panel",
  "archiv wird erstellt",
  "rollen werden erkannt",
  "channel verschieben",
  "kategorie kann gesetzt werden",
  "bot hat admin rechte",
  "bot kann nachricht pinnen",
  "permission",
  "bot",
  "role",
  "rolle",
];
export function initTicketCategory(client) {
  const askedUsers = new Set();
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (msg.content.startsWith("!moveadmin")) {
      if (!msg.member.roles.cache.has(config.roles.team)) return;
      await msg.delete().catch(() => {});
      return moveChannelToAdmin(msg.channel, true);
      
    }
    const channel = msg.channel;
    if (channel.parentId !== config.categories.support) return;
    const content = msg.content.toLowerCase();
    const foundTrigger = TRIGGERS.find((t) => content.includes(t));
    if (!foundTrigger || (foundTrigger.length < 4 && content !== foundTrigger))
      return;
    if (askedUsers.has(msg.author.id)) return;
    askedUsers.add(msg.author.id);
    const isGerman = TRIGGERS.indexOf(foundTrigger) <= 30;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("move_yes")
        .setLabel(isGerman ? "Ja / Yes" : "Yes")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("move_no")
        .setLabel(isGerman ? "Nein / No" : "No")
        .setStyle(ButtonStyle.Danger),
    );
    const questionText = isGerman
      ? `:warning: <@${msg.author.id}>, Keyword "**${foundTrigger}**" erkannt. Benötigt dieses Ticket einen **Admin**?`
      : `:warning: <@${msg.author.id}>, keyword "**${foundTrigger}**" detected. Does this ticket require an **Admin**?`;
    const questionMsg = await channel.send({
      content: questionText,
      components: [row],
    });
    const collector = questionMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30000,
    });
    collector.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) {
        return i.reply({
          content: isGerman
            ? "Nur der Ticket-Ersteller kann das entscheiden."
            : "Only the ticket creator can decide.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (i.customId === "move_yes") {
        await i.update({
          content: isGerman ? "Verschiebe..." : "Moving...",
          components: [],
        });
        await moveChannelToAdmin(channel, isGerman);
        
      } else {
        await i.update({
          content: isGerman
            ? "Der Support wird sich weiterhin darum kümmern"
            : "Support will handle it.",
          components: [],
        });
        setTimeout(() => questionMsg.delete().catch(() => {}), 5000);
      }
      collector.stop();
    });
    collector.on("end", (collected, reason) => {
      askedUsers.delete(msg.author.id);
      if (reason === "time") questionMsg.delete().catch(() => {});
    });
  });
}
async function moveChannelToAdmin(channel, isGerman) {
  try {
    await channel.setParent(config.categories.admin);
    await channel.send(
      isGerman
        ? `Dieses Ticket wurde zu den **Admins** verschoben.\n<@&${config.roles.admin}>`
        : `This ticket has been moved to the **Admins**.\n<@&${config.roles.admin}>`,
    );
  } catch (err) {
    console.error("Fehler beim Verschieben:", err);
    await channel.send("Fehler beim Verschieben des Channels.");
  }
}
const CATEGORY_EMOJI = {
  Support: "⚙️",
  Abholung: "🎉",
  Bewerbung: "✉️",
};
const CATEGORY_CHANNELS = {
  Support: config.categories.support,
  Abholung: config.categories.support,
  Bewerbung: config.categories.bewerbung,
  Admin: config.categories.admin,
};
async function loadTickets() {
  const stored = await getTickData("tickets");
  if (stored) ticketData = stored;
}
async function isBlocked(userId) {
  const blocked = (await getTickData("blocked_users")) || {};
  if (!blocked[userId]) return false;
  if (Date.now() > blocked[userId].until) {
    delete blocked[userId];
    await setTickData("blocked_users", blocked);
    return false;
  }
  return true;
}
async function blockUser(
  userId,
  username,
  durationMs = 7 * 24 * 60 * 60 * 1000,
) {
  const blocked = (await getTickData("blocked_users")) || {};
  blocked[userId] = {
    username,
    until: Date.now() + durationMs,
    reason: "Spam / Limit überschritten",
  };
  await setTickData("blocked_users", blocked);
}
const BEWERBUNG_VORLAGE_TEXT = `
> ### Bewerbungsvorlage:
> - Rufname & Ingame-Name
> - Alter
> - Auf welchem Spiel / Auf welchem Server bist du aktiv? Zur Auswahl stehen derzeit: \`Minevale.de\` \`CraftValley.de\` \`BrawlStars\`
> - Weshalb du in den Clan willst
> - In welchen Clans warst du bereits
> - Warum du in unseren Clan aufgenommen werden solltest
> - Deine Stärken
> - Spielzeit: (Minecraft & Minecraft Server) / BrawlStars
> **Weitere Informationen:**
> - Schreibe in ganzen Sätzen
> - Keine KI verwenden
> - Achte auf eine säuberliche, äußere Form deiner Bewerbung
> - Bei stark nachlässiger Ausführung der obigen Punkte kann und wird die Bewerbung abgelehnt werden
> **Voraussetzungen beachten:**
> - Du bist aktiv im angegebenen Spiel / auf dem angegebenen Server und diesem Discord-Server
`;
function parseYesNo(input) {
  if (!input) return false;
  const cleanInput = input.trim().toLowerCase();
  const positiveAnswers = ["ja", "j", "yes", "y", "jep", "jup", "jo", "ya"];
  return positiveAnswers.includes(cleanInput);
}
function buildModal(category, { needsIngameName }) {
  if (category === "Support") {
    const modal = new ModalBuilder()
      .setCustomId("tm_Support")
      .setTitle("Support-Ticket");
    const kurz = new TextInputBuilder()
      .setCustomId("kurz")
      .setLabel("Anliegen kurz (2-4 Worte)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);
    const lang = new TextInputBuilder()
      .setCustomId("lang")
      .setLabel("Beschreibe dein Anliegen ausführlich.")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);
    modal.addComponents(
      new ActionRowBuilder().addComponents(kurz),
      new ActionRowBuilder().addComponents(lang),
    );
    return modal;
  }
  if (category === "Abholung") {
    const modal = new ModalBuilder()
      .setCustomId(`tm_Abholung_${needsIngameName ? "noacc" : "hasacc"}`)
      .setTitle("Abholung-Ticket");
    const rows = [];
    if (needsIngameName) {
      const ign = new TextInputBuilder()
        .setCustomId("ingame")
        .setLabel("Minecraft Ingame Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(32);
      rows.push(new ActionRowBuilder().addComponents(ign));
    }
    const gewonnen = new TextInputBuilder()
      .setCustomId("gewonnen")
      .setLabel("Was hast du gewonnen?")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);
    rows.push(new ActionRowBuilder().addComponents(gewonnen));
    modal.addComponents(...rows);
    return modal;
  }
  if (category === "Bewerbung") {
    const modal = new ModalBuilder()
      .setCustomId(`tm_Bewerbung_${needsIngameName ? "noacc" : "hasacc"}`)
      .setTitle("Bewerbung-Ticket");
    const name = new TextInputBuilder()
      .setCustomId("name")
      .setLabel("Dein Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(64);
    const rows = [new ActionRowBuilder().addComponents(name)];
    if (needsIngameName) {
      const ign = new TextInputBuilder()
        .setCustomId("ingame")
        .setLabel("Minecraft Ingame Name")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(32);
      rows.push(new ActionRowBuilder().addComponents(ign));
    }
    const vorlage = new TextInputBuilder()
      .setCustomId("vorlage")
      .setLabel("Benötigst du eine Vorlage? (ja/nein)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);
    rows.push(new ActionRowBuilder().addComponents(vorlage));
    modal.addComponents(...rows);
    return modal;
  }
  return null;
}
function buildTicketInfoEmbeds({
  idString,
  category,
  user,
  created,
  hasAccount,
  ingameName,
  anliegen,
}) {
  const embeds = [];
  embeds.push(
    new EmbedBuilder()
      .setTitle(" Ticket-Informationen")
      .setColor(0xffffff)
      .setDescription(
        [
          `> **ID:** \`${idString}\``,
          `> **Discord-Username:** ${user.username}`,
          `> **Kategorie:** ${category}`,
          `> **Erstellt:** <t:${Math.floor(created / 1000)}:F>`,
        ].join("\n"),
      ),
  );
  embeds.push(
    new EmbedBuilder()
      .setTitle(" Nutzer-Informationen")
      .setColor(0xffffff)
      .setDescription(
        [
          `> **Anzeigename:** **${user.displayName || user.username}**`,
          `> **Username:** ${user.username}`,
          `> **Account vorhanden:** ${hasAccount ? " Ja" : " Nein"}`,
          `> **Minecraft Ingame Name:** ${ingameName || "–"}`,
        ].join("\n"),
      ),
  );
  if (anliegen && Object.entries(anliegen).length > 0) {
    const anliegenLines = Object.entries(anliegen).map(
      ([label, value]) => `> **${label}:** ${value}`,
    );
    embeds.push(
      new EmbedBuilder()
        .setTitle(" Weiteres")
        .setColor(0xffffff)
        .setDescription(anliegenLines.join("\n")),
    );
  }
  return embeds;
}
export async function initTickets(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Bot | Ticket System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  function hasEconomyAccount(target) {
    if (!target) return false;
    const member = target.member || target;
    if (!member || !member.roles || !member.roles.cache) return false;
    return member.roles.cache.has(config.roles.economy);
  }
  async function getStoredIngameName(userId) {
    const ecoData = await getEcoData(userId);
    return ecoData?.mcUsername || null;
  }
  async function closeTicket(channel, moderator) {
    try {
      const stored = (await getTickData("tickets")) || { tickets: {} };
      const allEntries = stored.tickets || {};
      const ticket = Object.values(allEntries).find(
        (t) => typeof t === "object" && t.channelId === channel.id,
      );
      if (!ticket) {
        console.log("Gesuchte Channel-ID:", channel.id);
        return channel.send(" Kein aktives Ticket in der Datenbank gefunden.");
      }
      await channel.permissionOverwrites.delete(ticket.userId).catch(() => {});
      await channel.send({
        content: ` **Ticket wird archiviert...**\nErstellt von: ${ticket.username}\nID: ${ticket.idString}`,
      });
      delete stored.tickets[ticket.idString];
      await setTickData("tickets", stored);
      await archiveTicket(
        {
          name: channel.name,
          closedBy: moderator,
          creator: { id: ticket.userId, username: ticket.username },
          channel: channel,
        },
        setTickData,
      );
    } catch (err) {
      console.error("[TICKET] Fehler:", err);
    }
  }
  async function createTicket(category, user, guild, extra = {}) {
    if (await isBlocked(user.id)) return null;
    const stored = (await getTickData("tickets")) || { tickets: { lastId: 0 } };
    if (!stored.tickets) stored.tickets = { lastId: 0 };
    const currentLastId = parseInt(stored.tickets.lastId) || 0;
    const id = currentLastId + 1;
    const idString = id.toString().padStart(4, "0");
    stored.tickets.lastId = id;
    const parentId = CATEGORY_CHANNELS[category];
    try {
      const channel = await guild.channels.create({
        name: `${CATEGORY_EMOJI[category] || " "}-${category}-${idString}`,
        type: ChannelType.GuildText,
        parent: parentId,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: config.roles.team,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
            ],
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
            ],
          },
        ],
      });
      const member = guild.members.cache.get(user.id);
      const hasAccount = hasEconomyAccount(member);
      const ingameName = hasAccount
        ? await getStoredIngameName(user.id)
        : extra.ingame;
      const embeds = buildTicketInfoEmbeds({
        idString,
        category,
        user,
        created: Date.now(),
        hasAccount,
        ingameName,
        anliegen: extra.anliegen || {},
      });
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close_${idString}`)
          .setLabel("Ticket schließen")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger),
      );
      await channel.send({
        content: `${user} ||<@&${config.roles.team}>||`,
        embeds,
        components: [closeRow],
      });
      if (extra.needsTemplate) {
        await channel.send({ content: BEWERBUNG_VORLAGE_TEXT });
      }
      stored.tickets[idString] = {
        idString,
        channelId: channel.id,
        userId: user.id,
        username: user.username,
        category: category,
      };
      await setTickData("tickets", stored);
      await sendKekseLog(
        "Ticket Erstellt",
        user,
        `Kategorie: \`${category}\`\nKanal: ${channel}`,
      );
      return channel;
    } catch (error) {
      console.error("Fehler beim Erstellen des Tickets:", error);
    }
  }
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("ticket_close_")) {
        const currentChannel = interaction.channel;
        const user = interaction.user;
        if (!interaction.member.roles.cache.has(config.roles.team)) {
          return interaction.reply({
            content: "Du hast keine Berechtigung diese Funktion zu nutzen.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        await interaction.reply({
          content: "Ticket-Schließung initiiert...",
          flags: [MessageFlags.Ephemeral],
        });
        await closeTicket(currentChannel, user);
        console.log(`${user.username} hat ${currentChannel} geschlossen`);
        
      }
      if (interaction.customId.startsWith("t_")) {
        const category = interaction.customId.split("_")[1];
        if (
          (await isBlocked(interaction.user.id)) &&
          !interaction.member.roles.cache.has(config.roles.team)
        ) {
          return interaction.reply({
            content: "Du bist gesperrt.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const verifiedOnlyIds = ["t_Bewerbung", "t_Abholung"];
        if (
          verifiedOnlyIds.includes(interaction.customId) &&
          interaction.member.roles.cache.has(config.roles.unverified)
        ) {
          return interaction.reply({
            content:
              "Du musst dich verifizieren bevor du etwas abholen oder dich bewerben kannst: <#1439337595090898955>",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const hasAccount = hasEconomyAccount(interaction);
        const storedName = await getStoredIngameName(interaction.user.id);
        const needsIngameName = !hasAccount || !storedName;
        const modal = buildModal(category, { needsIngameName });
        if (modal) {
          await interaction.showModal(modal);
        } else {
          return interaction.reply({
            content: "Unbekannte Kategorie.",
            flags: [MessageFlags.Ephemeral],
          });
        }
      }
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("tm_")) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const parts = interaction.customId.split("_");
        const category = parts[1];
        const extra = { anliegen: {} };
        if (category === "Support") {
          extra.anliegen["Kurze Beschreibung"] =
            interaction.fields.getTextInputValue("kurz");
          extra.anliegen["Ausführliche Beschreibung"] =
            interaction.fields.getTextInputValue("lang");
        } else if (category === "Abholung") {
          if (parts[2] === "noacc") {
            extra.ingame = interaction.fields.getTextInputValue("ingame");
          }
          extra.anliegen["Gewinn"] =
            interaction.fields.getTextInputValue("gewonnen");
        } else if (category === "Bewerbung") {
          extra.anliegen["Name"] = interaction.fields.getTextInputValue("name");
          if (parts[2] === "noacc") {
            extra.ingame = interaction.fields.getTextInputValue("ingame");
          }
          const vorlageInput = interaction.fields.getTextInputValue("vorlage");
          extra.needsTemplate = parseYesNo(vorlageInput);
        }
        const channel = await createTicket(
          category,
          interaction.user,
          interaction.guild,
          extra,
        );
        if (channel) {
          await interaction.editReply({
            content: `Ein Ticket wurde erfolgreich erstellt: ${channel}`,
          });
        } else {
          await interaction.editReply({
            content: "Fehler beim Erstellen des Tickets.",
          });
        }
      }
    }
  });
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!") || msg.author.bot) return;
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    if (cmd === "ticket_panel" && msg.member.roles.cache.has(config.roles.team)) {
      const embed = new EmbedBuilder()
        .setTitle("Willkommen im Support")
        .setDescription(
          `Wähle eins der Themen um ein Ticket zu erstellen. Ein Team-Mitglied wird sich schnellstmöglich um dein Anliegen kümmern.\n\n⚙️ **Support** → Allgemeine Support-Anliegen\n🎉 **Abholung** → Abholung von Giveaways und Events\n✉️ **Bewerbung** → Clan-Bewerbungen`,
        )
        .setColor("#ffffff");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("t_Support")
          .setLabel("⚙️ Support")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("t_Abholung")
          .setLabel("🎉 Abholung")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("t_Bewerbung")
          .setLabel("✉️ Bewerbung")
          .setStyle(ButtonStyle.Secondary),
      );
      await msg.channel.send({ embeds: [embed], components: [row] });
      await msg.delete().catch(() => {});
      
    }
    if (cmd === "close") {
      const currentChannel = msg.channel;
      const user = msg.author;
      if (!msg.member.roles.cache.has(config.roles.team)) {
        return msg.reply({
          content: "Du hast keine Berechtigung diesen Befehl zu nutzen.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      await msg.reply({
        content: "Ticket-Schließung initiiert...",
        flags: [MessageFlags.Ephemeral],
      });
      await closeTicket(currentChannel, user);
      console.log(`${user.username} hat ${currentChannel} geschlossen`);
      
    }
    if (cmd === "delete" && msg.member.roles.cache.has(config.roles.admin)) {
      await msg.reply("Kanal wird gelöscht...");
      setTimeout(() => msg.channel.delete().catch(() => {}), 3000);
      
    }
    if (cmd === "block" && msg.member.roles.cache.has(config.roles.team)) {
      const target = msg.mentions.users.first() || {
        id: args[0],
        username: "Unbekannt",
      };
      const days = parseInt(args[1]) || 7;
      if (!target.id) return msg.reply("ID fehlt.");
      await blockUser(target.id, target.username, days * 24 * 60 * 60 * 1000);
      msg.reply(`<@${target.id}> für ${days} Tage gesperrt.`);
      
    }
  });
}
const activeCreations = new Set();
function toMonospace(text) {
  const normal =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const mono = "𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿";
  let result = "";
  for (let char of text) {
    const idx = normal.indexOf(char);
    result += idx !== -1 ? mono.slice(idx * 2, idx * 2 + 2) : char;
  }
  return result;
}
export function initVoiceChannels(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Bot | Voice System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const { member, guild } = newState;
    if (!member || member.user.bot) return;
    if (newState.channelId === config.channels.jtcVoice) {
      if (activeCreations.has(member.id)) return;
      activeCreations.add(member.id);
      try {
        const userNameMono = toMonospace(member.user.username);
        const channelName = `${userNameMono}'𝚜 𝙻𝚘𝚞𝚗𝚐𝚎`;
        const tempChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildVoice,
          parent: config.categories.voice,
          permissionOverwrites: [
            {
              id: guild.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
              ],
            },
            {
              id: config.roles.team,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
              ],
            },
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.MuteMembers,
                PermissionFlagsBits.DeafenMembers,
              ],
            },
          ],
        });
        await newState.setChannel(tempChannel).catch(async () => {
          await tempChannel.delete().catch(() => {});
        });
        await sendKekseLog(
          "Voice Lounge erstellt",
          member.user,
          `**Kanal:** \`${channelName}\`\n**ID:** \`${tempChannel.id}\``,
        );
      } catch (err) {
        console.error("[VOICE] Fehler beim Erstellen:", err);
      } finally {
        setTimeout(() => activeCreations.delete(member.id), 5000);
      }
    }
    const oldChannel = oldState.channel;
    if (
      oldChannel &&
      oldChannel.parentId === config.categories.voice &&
      oldChannel.id !== config.channels.jtcVoice &&
      oldChannel.id !== config.channels.afkVoice &&
      oldChannel.name.endsWith("𝙻𝚘𝚞𝚗𝚐𝚎")
    ) {
      try {
        const freshChannel = await guild.channels
          .fetch(oldChannel.id)
          .catch(() => null);
        if (freshChannel && freshChannel.members.size === 0) {
          const channelName = freshChannel.name;
          await freshChannel.delete().catch(() => {});
          await sendKekseLog(
            "Voice Lounge entfernt",
            member.user,
            `**Kanal:** \`${channelName}\``,
          );
        }
      } catch (err) {}
    }
  });
}
const ROLES_TIERS = [
  { id: config.roles.rank.neuankoemmling, needed: 50, name: "Neuankömmling" },
  { id: config.roles.rank.bronze, needed: 100, name: "Bronze" },
  { id: config.roles.rank.silber, needed: 500, name: "Silber" },
  { id: config.roles.rank.gold, needed: 1000, name: "Gold" },
  { id: config.roles.rank.platin, needed: 5000, name: "Platin" },
  { id: config.roles.rank.diamant, needed: 10000, name: "Diamant" },
  { id: config.roles.rank.smaragt, needed: 50000, name: "Smaragd" },
  { id: config.roles.rank.obsidian, needed: 100000, name: "Obsidian" },
];
const invitesTracker = new Map();
export async function addXP(userId, xpAmount, client) {
  if (xpAmount <= 0) return;
  const userData = await getXpData(userId);
  let currentTier = userData.rang !== undefined ? userData.rang : 0;
  let currentXp = userData.xp !== undefined ? userData.xp : 0;
  if (currentTier >= ROLES_TIERS.length - 1) {
    currentXp += xpAmount;
    await setXpData(userId, { rang: currentTier, xp: currentXp });
    return;
  }
  currentXp += xpAmount;
  let leveledUp = false;
  while (
    currentTier < ROLES_TIERS.length - 1 &&
    currentXp >= ROLES_TIERS[currentTier].needed
  ) {
    currentXp -= ROLES_TIERS[currentTier].needed;
    currentTier++;
    leveledUp = true;
  }
  await setXpData(userId, { rang: currentTier, xp: currentXp });
  if (leveledUp && client) {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        const rolesToRemove = ROLES_TIERS.map((tier) => tier.id);
        await member.roles.remove(rolesToRemove);
        await member.roles.add(ROLES_TIERS[currentTier].id);
      }
    } catch (error) {
      console.error(error);
    }
  }
}
async function applyTierRole(userId, tier, client) {
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  await member.roles.remove(ROLES_TIERS.map((t) => t.id)).catch(() => {});
  await member.roles.add(ROLES_TIERS[tier].id).catch(() => {});
}
export async function removeXP(userId, amount, client) {
  if (amount <= 0) return;
  const d = await getXpData(userId);
  let tier = d.rang !== undefined ? d.rang : 0;
  let xp = (d.xp !== undefined ? d.xp : 0) - amount;
  let changed = false;
  while (xp < 0 && tier > 0) {
    tier--;
    xp += ROLES_TIERS[tier].needed;
    changed = true;
  }
  if (xp < 0) xp = 0;
  await setXpData(userId, { rang: tier, xp });
  if (changed) await applyTierRole(userId, tier, client);
}
const xpCooldown = new Map();
export function handleMessageXP(message) {
  if (message.author.bot || !message.guild || message.guild.id !== GUILD_ID)
    return;
  const now = Date.now();
  if (now - (xpCooldown.get(message.author.id) || 0) < 10000) return;
  xpCooldown.set(message.author.id, now);
  addXP(message.author.id, 1, message.client);
}
export function startVoiceXpTracker(client) {
  setInterval(async () => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      guild.voiceStates.cache.forEach(async (voiceState) => {
        if (
          voiceState.channelId &&
          !voiceState.member.user.bot &&
          !voiceState.deaf &&
          !voiceState.mute &&
          voiceState.channelId !== config.channels.afkVoice &&
          voiceState.channel.members.filter((m) => !m.user.bot).size > 1
        ) {
          await addXP(voiceState.id, 2, client);
        }
      });
    } catch (err) {
      console.error(err);
    }
  }, 60000);
}
export async function initInviteTracker(client) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const guildInvites = await guild.invites.fetch().catch(() => new Map());
    invitesTracker.set(
      guild.id,
      new Map(guildInvites.map((invite) => [invite.code, invite.uses])),
    );
  } catch (error) {
    console.error(error);
  }
}
export async function handleGuildMemberAdd(member) {
  if (member.guild.id !== GUILD_ID || member.user.bot) return;
  const existingData = await getXpData(member.id);
  if (!existingData || existingData.rang === undefined) {
    await setXpData(member.id, { rang: 0, xp: 0 });
  }
  await member.roles.add(ROLES_TIERS[0].id).catch(console.error);
  try {
    const newInvites = await member.guild.invites.fetch();
    const oldInvites = invitesTracker.get(member.guild.id);
    const inviteUsed = newInvites.find(
      (i) => oldInvites && i.uses > (oldInvites.get(i.code) || 0),
    );
    if (
      inviteUsed &&
      inviteUsed.inviter &&
      inviteUsed.inviter.id !== member.id
    ) {
      const previous = await getIData(`joined_${member.id}`);
      if (!previous.awarded) {
        await addXP(inviteUsed.inviter.id, 50, member.client);
        await setIData(`joined_${member.id}`, {
          inviterId: inviteUsed.inviter.id,
          joinedAt: Date.now(),
          xp: 50,
          awarded: true,
          penalized: false,
        });
      }
    }
    invitesTracker.set(
      member.guild.id,
      new Map(newInvites.map((invite) => [invite.code, invite.uses])),
    );
  } catch (err) {
    console.error(err);
  }
}
export function handleInviteCreate(invite) {
  if (invite.guild.id !== GUILD_ID) return;
  const currentInvites = invitesTracker.get(invite.guild.id) || new Map();
  currentInvites.set(invite.code, invite.uses);
  invitesTracker.set(invite.guild.id, currentInvites);
}
export async function syncExistingUsers(client) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) return;
    const members = guild.members.cache;
    for (const [memberId, member] of members) {
      if (member.user.bot) continue;
      if (member.roles.cache.has(config.roles.unverified)) continue;
      const existingData = await getXpData(memberId);
      if (!existingData || existingData.rang === undefined) {
        await setXpData(memberId, { rang: 0, xp: 0 });
        const hasTierRole = member.roles.cache.some((role) =>
          ROLES_TIERS.map((t) => t.id).includes(role.id),
        );
        if (!hasTierRole) {
          await member.roles.add(ROLES_TIERS[0].id).catch(console.error);
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
}
client.on("messageCreate", async (message) => {
  if (message.channelId == config.channels.counting) return;
  handleMessageXP(message);
});
client.on("guildMemberAdd", async (member) => {
  await handleGuildMemberAdd(member);
});
client.on("inviteCreate", async (invite) => {
  handleInviteCreate(invite);
});
async function handleInviteLeave(member) {
  if (member.guild.id !== GUILD_ID || member.user.bot) return;
  const record = await getIData(`joined_${member.id}`);
  if (!record.awarded || record.penalized || !record.inviterId) return;
  if (Date.now() - record.joinedAt >= 24 * 60 * 60 * 1000) return;
  record.penalized = true;
  await setIData(`joined_${member.id}`, record);
  const before = await getXpData(record.inviterId);
  const tierBefore = before.rang !== undefined ? before.rang : 0;
  await removeXP(record.inviterId, record.xp, member.client);
  const after = await getXpData(record.inviterId);
  const tierAfter = after.rang !== undefined ? after.rang : 0;
  const xpAfter = after.xp !== undefined ? after.xp : 0;
  const reason = "Eingeladener User hat den Server verlassen";
  let text;
  if (tierAfter < tierBefore) {
    text = `Dein Rang wurde auf \`${ROLES_TIERS[tierAfter].name}\` zurückgesetzt. Grund: \`${reason}\``;
  } else {
    text = `Deine XP wurden auf \`${xpAfter}/${ROLES_TIERS[tierAfter].needed}\` zurückgesetzt. Grund: \`${reason}\``;
  }
  const modData = await getMData("moderation");
  if (!modData.warns) modData.warns = {};
  if (!modData.warns[record.inviterId]) modData.warns[record.inviterId] = [];
  modData.warns[record.inviterId].push({
    reason: `Invite-Missbrauch: ${reason}`,
    by: member.client.user.id,
    date: Date.now(),
    via: "invite",
  });
  await setMData("moderation", modData);
  const inviter = await member.client.users
    .fetch(record.inviterId)
    .catch(function () {
      return null;
    });
  if (inviter) {
    await inviter
      .send(text)
      .catch(function () {});
  }
  console.log(
    `${member.user.username} hat den Server innerhalb von 24h verlassen. Einlader <@${record.inviterId}> wurden ${record.xp} XP abgezogen und eine Warnung erteilt.`,
  );
}
client.on("guildMemberRemove", handleInviteLeave);
const getHelpData = {
  getMainEmbed: () => {
    return new EmbedBuilder()
      .setTitle("Hilfemenü")
      .setDescription(
        "Willkommen im Hilfemenü! Klicke auf die Buttons unten, um zwischen den Kategorien zu wechseln.\n\n" +
          `Falls du ein Supportanliegen hast, einen Gewinn abholen möchtest (Giveaway oder Event) oder dich für den Clan bewerben willst, erstelle bitte ein Ticket in <#${config.channels.ticket}>.`,
      )
      .setColor("#ffffff");
  },
  getProfileEmbed: async (userId, userUsername, userAvatarURL) => {
    const ecoData = (await getEcoData(userId)) || {};
    const xpData = (await getXpData(userId)) || {};
    const countData = (await getCouData("counting")) || {};
    const username = ecoData.username || userUsername;
    const mcUsername = ecoData.mcUsername || "Nicht verknüpft";
    const balance = (ecoData.balance || 0).toLocaleString("de-DE");
    const isBlocked = ecoData.blocked ? "Gesperrt" : "Aktiv";
    const currentPoints = xpData.xp || 0;
    const tier = ROLES_TIERS[xpData.rang ?? 0];
    const currentTierName = tier?.name ?? "Kein Rang";
    const nextTierPoints = tier?.needed ?? "Max";
    let countedRight = 0;
    if (countData.scoreboard && typeof countData.scoreboard === "object") {
      countedRight = countData.scoreboard[userId] || 0;
    }
    return new EmbedBuilder()
      .setTitle(`Profil von ${username}`)
      .setThumbnail(userAvatarURL)
      .setColor("#ffffff")
      .addFields(
        { name: "Discord-Username", value: username, inline: true },
        { name: "Minecraft-Name", value: mcUsername, inline: true },
        { name: "Konto-Status", value: isBlocked, inline: true },
        { name: "Kontostand", value: `${balance} Kekse`, inline: true },
        { name: "Rang", value: currentTierName, inline: true },
        {
          name: "XP",
          value: `${currentPoints}/${nextTierPoints}`,
          inline: true,
        },
        { name: "Counting", value: `${countedRight} Zahlen`, inline: true },
      );
  },
  getCommandsEmbed: () => {
    return new EmbedBuilder()
      .setTitle("Befehlsübersicht")
      .setColor("#ffffff")
      .setDescription(
        "`!bank` (`/bank status`) - Zeige deinen aktuellen Kontostand an\n" +
          "`!bank create` (`/bank create`) - Eröffne ein neues Bankkonto\n" +
          "`!bank help` (`/bank help`) - Zeige Hilfe zum Bank-System\n" +
          "`!bank pay @User x` (`/bank pay`) - Überweise einem anderen Nutzer Kekse\n" +
          "`!bank payall x` - Überweise jedem aktiven Konto x Kekse von deinem Konto\n" +
          "`!casino` (`/casino`) - Zeige existierende Spiele im Casino\n" +
          "`!casino blackjack x` (`/blackjack`) - Starte ein Spiel Blackjack\n" +
          "`!casino coinflip x` (`/coinflip`) - Spiel Coinflip gegen das Haus\n" +
          "`!casino crash x` (`/crash`) - Starte einen Crash\n" +
          "`!casino highlow x` (`/highlow`) - Starte ein Highlow-Kartenspiel\n" +
          "`!casino jackpot x` (`/jackpot`) - Kaufe Tickets für den Jackpot\n" +
          "`!casino roulette x` (`/roulette`) - Setze Kekse am Roulette-Tisch\n" +
          "`!casino slot x` (`/slot`) - Drehe an der Slotmaschine\n" +
          "`!help` (`/help`) - Öffnet dieses Hilfemenü\n" +
          "`!leaderboard` (`/leaderboard`) - Zeigt die Top 5 der reichsten User\n" +
          "`!remind` (`/remind`) - Erstelle eine Erinnerung für dich\n" +
          "`!top` (`/top`) - Zeige serverweite Bestenliste im Counting\n" +
          "`!coinflip @User x` - Fordert einen Spieler zu Coinflip heraus\n" +
          "`!ssp @User x` - Fordert einen Spieler zu Schere-Stein-Papier heraus\n" +
          "`!steal` (`/steal`) - Klaue einmal täglich 1-100 Kekse von einem zufälligen Mitglied",
      );
  },
  getChannelsEmbed: () => {
    return new EmbedBuilder()
      .setTitle("Kanalübersicht")
      .setColor("#ffffff")
      .setDescription(
          `<#${config.channels.rules}> Hier findest du das offizielle Regelwerk des Servers.\n` +
          `<#${config.channels.news}> Wichtige Neuigkeiten und Ankündigungen werden hier geteilt.\n` +
          `<#${config.channels.changelog}> Technische Änderungen und Bot-Updates werden hier aufgelistet.\n` +
          `<#${config.channels.giveaways}> Hier finden regelmäßige Giveaways statt.\n` +
          `<#${config.channels.events}> Hier werden Events angekündigt\n` +
          `<#${config.channels.werbung}> In diesem Kanal darfst du deine eigenen Projekte bewerben.\n` +
          `<#${config.channels.counting}> Der Kanal für das Counting Spiel\n` +
          `<#${config.channels.daily}> Hier kannst du dir alle 24 Stunden 10 kostenlose Kekse abholen.\n` +
          `<#${config.channels.casino}> Der Bereich für alle Casino-Spiele und Wetten.\n` +
          `<#${config.channels.shop}> Tausche deine Kekse gegen Booster, doppelte Giveaway Chance oder die VIP-Rolle ein.\n` +
          `<#${config.channels.ticket}> Hier kannst du Tickets für Support, Gewinne oder Bewerbungen erstellen.`,
      );
  },
};
const helpRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("help_profile")
    .setLabel("Profil")
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId("help_commands")
    .setLabel("Befehle")
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId("help_channels")
    .setLabel("Channels")
    .setStyle(ButtonStyle.Secondary),
);
export async function handleTextHelpCommand(msg) {
  const mainEmbed = getHelpData.getMainEmbed();
  const responseMessage = await msg.reply({
    embeds: [mainEmbed],
    components: [helpRow],
  });
  createHelpCollector(responseMessage, msg.author.id, msg.author.username);
}
export async function handleSlashHelpCommand(interaction) {
  if (!interaction || !interaction.user) return;
  const mainEmbed = getHelpData.getMainEmbed();
  const responseMessage = await interaction.reply({
    embeds: [mainEmbed],
    components: [helpRow],
    fetchReply: true,
  });
  createHelpCollector(
    responseMessage,
    interaction.user.id,
    interaction.user.username,
  );
}
function createHelpCollector(messageTarget, userId, userUsername) {
  const collector = messageTarget.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120000,
  });
  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== userId) {
      return interaction.reply({
        content:
          "Du hast diesen Befehl nicht gerufen! Benutze selbst `!help` oder `/help`.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    await interaction.deferUpdate();
    let newEmbed;
    if (interaction.customId === "help_profile") {
      newEmbed = await getHelpData.getProfileEmbed(
        userId,
        userUsername,
        interaction.user.displayAvatarURL({ size: 512 }),
      );
    } else if (interaction.customId === "help_commands") {
      newEmbed = getHelpData.getCommandsEmbed();
    } else if (interaction.customId === "help_channels") {
      newEmbed = getHelpData.getChannelsEmbed();
    }
    await interaction
      .editReply({ embeds: [newEmbed], components: [helpRow] })
      .catch(() => {});
  });
  collector.on("end", async () => {
    await messageTarget.delete().catch(() => {});
  });
}
export function initHelp(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith("!")) return;
    const args = msg.content.slice(1).trim().split(" ");
    const cmd = args.shift().toLowerCase();
    if (cmd !== "help") return;
    console.log(`[HELP] Von ${msg.author.username}`);
    await handleTextHelpCommand(msg);
    
  });
}
export async function setupVoiceModToggle(client) {
  const CUSTOM_BUTTON_ID = "toggle_voice_lock";
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== CUSTOM_BUTTON_ID)
      return;
    if (!interaction.member.roles.cache.has(config.roles.admin)) {
      return interaction.reply({
        content: "Du bist nicht berechtigt, diesen Button zu nutzen.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    try {
      await interaction.deferUpdate();
      const voiceChannel = interaction.channel;
      const currentOverwrites =
        voiceChannel.permissionOverwrites.cache.get(config.roles.team);
      let isCurrentlyLocked = false;
      if (
        currentOverwrites &&
        currentOverwrites.deny.has(PermissionFlagsBits.Connect)
      ) {
        isCurrentlyLocked = true;
      }
      let nextLockState = !isCurrentlyLocked;
      if (isCurrentlyLocked) {
        await voiceChannel.permissionOverwrites.edit(config.roles.team, {
          Connect: true,
        });
      } else {
        await voiceChannel.permissionOverwrites.edit(config.roles.team, {
          Connect: false,
        });
      }
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CUSTOM_BUTTON_ID)
          .setLabel(nextLockState ? "Geschlossen" : "Geöffnet")
          .setStyle(
            nextLockState ? ButtonStyle.Secondary : ButtonStyle.Secondary,
          ),
      );
      await interaction.editReply({
        components: [updatedRow],
      });
    } catch (error) {
      console.error(error);
      await interaction.followUp({
        content: "Es gab einen Fehler beim Umschalten der Rechte.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  });
}
const dashboardScrypt = util.promisify(crypto.scrypt);
const DASHBOARD_COOKIE = "__Host-kekse_dashboard";
const dashboardLoginAttempts = new Map();
function getDashboardAccounts() {
  const accounts = JSON.parse(process.env.DASHBOARD_ACCOUNTS || "[]");
  if (!Array.isArray(accounts)) throw new Error("DASHBOARD_ACCOUNTS muss ein Array sein.");
  return accounts;
}
const DASHBOARD_LEVELS = ["mod", "admin", "super"];
const DASHBOARD_ASSIGNABLE = ["mod", "admin"];
const DASHBOARD_RANKS = { mod: 1, admin: 2, super: 3 };
const DASHBOARD_LEVEL_NAMES = { mod: "Team", admin: "Admin", super: "Admin*" };
const DASHBOARD_USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
const DASHBOARD_URL = "https://kekse-bot.de";
function dashboardKey(username) {
  return String(username || "").trim().toLowerCase();
}
async function getDashboardUsers() {
  const stored = await dbGet("dashboard", "users");
  if (stored) return promoteSuperAdmin(stored);
  const users = {};
  const accounts = (await dbGet("dashboard", "accounts")) || {};
  for (const entry of getDashboardAccounts()) {
    if (!entry.username) continue;
    const key = dashboardKey(entry.username);
    users[key] = {
      username: entry.username,
      discordId: String(entry.discordId || ""),
      level: entry.level,
      createdAt: Date.now(),
      createdBy: "env"
    };
    const account = accounts[key] || {};
    if (!account.passwordHash && !account.startPasswordHash && entry.startPassword) {
      account.startPasswordHash = await hashDashboardPassword(entry.startPassword);
      account.startExpiresAt = null;
      accounts[key] = account;
    }
  }
  await dbSet("dashboard", "users", users);
  await dbSet("dashboard", "accounts", accounts);
  return promoteSuperAdmin(users);
}
async function getDashboardUser(username) {
  const users = await getDashboardUsers();
  return users[dashboardKey(username)] || null;
}
function requireDashboardAdmin(req, res, next) {
  if ((DASHBOARD_RANKS[req.dashboardUser?.level] || 0) < DASHBOARD_RANKS.admin) {
    return res.status(403).json({ error: "Dafür fehlt dir die Berechtigung." });
  }
  next();
}
async function promoteSuperAdmin(users) {
  let changed = false;
  for (const user of Object.values(users)) {
    if (user.discordId === config.users.sysadmin && user.level !== "super") {
      user.level = "super";
      changed = true;
    }
  }
  if (changed) await dbSet("dashboard", "users", users);
  return users;
}
async function dashboardLevelOfDiscordId(discordId) {
  const users = await getDashboardUsers();
  const match = Object.values(users).find(function (user) {
    return user.discordId === discordId;
  });
  return match ? DASHBOARD_RANKS[match.level] || 0 : 0;
}
async function dashboardRevokeUser(username) {
  const key = dashboardKey(username);
  const sessions = (await dbGet("dashboard", "sessions")) || {};
  for (const [hash, session] of Object.entries(sessions)) {
    if (dashboardKey(session.username) === key) delete sessions[hash];
  }
  await dbSet("dashboard", "sessions", sessions);
  const pending = (await dbGet("dashboard", "pending")) || {};
  for (const [id, item] of Object.entries(pending)) {
    if (dashboardKey(item.username) === key) delete pending[id];
  }
  await dbSet("dashboard", "pending", pending);
}
async function sendDashboardDm(userId, content) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
    return true;
  } catch {
    return false;
  }
}
function validateAccountFields(username, discordId, level) {
  if (!DASHBOARD_USERNAME_PATTERN.test(username)) {
    throw new Error("Benutzername: 3-32 Zeichen, nur Buchstaben, Zahlen, _ . -");
  }
  if (!/^\d{17,20}$/.test(discordId)) throw new Error("Ungültige Discord-ID.");
  if (!DASHBOARD_ASSIGNABLE.includes(level)) throw new Error("Ungültige Berechtigung.");
}
async function prepareAccountAction(action, input, actor) {
  const users = await getDashboardUsers();
  if (action === "create") {
    if (actor.level !== "super") throw new Error("Nur Admin* darf Accounts erstellen.");
    const username = String(input?.username || "").trim();
    const discordId = String(input?.discordId || "").trim();
    const level = String(input?.level || "");
    validateAccountFields(username, discordId, level);
    if (users[dashboardKey(username)]) throw new Error("Benutzername ist bereits vergeben.");
    const owner = Object.values(users).find(function (other) {
      return other.discordId === discordId;
    });
    if (owner) throw new Error(`Diese Discord-ID gehört bereits zu ${owner.username}.`);
    return { username, discordId, level };
  }
  if (action === "delete") {
    const target = users[dashboardKey(input?.username)];
    if (!target) throw new Error("Account nicht gefunden.");
    if (dashboardKey(target.username) === dashboardKey(actor.username)) {
      throw new Error("Den eigenen Account kannst du nicht löschen.");
    }
    if ((DASHBOARD_RANKS[target.level] || 0) >= (DASHBOARD_RANKS[actor.level] || 0)) {
      throw new Error("Du kannst nur Accounts mit niedrigerer Berechtigung löschen.");
    }
    return { username: target.username };
  }
  throw new Error("Unbekannte Aktion.");
}
async function executeAccountAction(action, data, actor) {
  const users = await getDashboardUsers();
  const accounts = (await dbGet("dashboard", "accounts")) || {};
  const key = dashboardKey(data.username);
  if (action === "create") {
    const password = crypto.randomBytes(12).toString("base64url");
    const expires = Date.now() + 7 * 86400000;
    const text =
      "**Dashboard-Account erstellt**\n" +
      `Benutzername: \`${data.username}\`\n` +
      `Berechtigung: ${DASHBOARD_LEVEL_NAMES[data.level]}\n` +
      `Discord: <@${data.discordId}> (\`${data.discordId}\`)\n` +
      `Startpasswort: \`${password}\`\n` +
      `Gültig bis: <t:${Math.floor(expires / 1000)}:f>\n\n` +
      `Dashboard: ${DASHBOARD_URL}\n` +
      "Bei der ersten Anmeldung legt die Person ihr eigenes Passwort fest.";
    if (!(await sendDashboardDm(config.users.sysadmin, text))) {
      throw new Error("Das Startpasswort konnte dir nicht per DM zugestellt werden. Es wurde kein Account erstellt.");
    }
    users[key] = {
      username: data.username,
      discordId: data.discordId,
      level: data.level,
      createdAt: Date.now(),
      createdBy: actor.username
    };
    accounts[key] = {
      username: data.username,
      discordId: data.discordId,
      startPasswordHash: await hashDashboardPassword(password),
      startExpiresAt: expires,
      createdAt: Date.now()
    };
    await dbSet("dashboard", "users", users);
    await dbSet("dashboard", "accounts", accounts);
    await dashLog(actor.level, "account-create", data.discordId, `${data.username} (${data.level})`);
    return `Account ${data.username} erstellt. Das Startpasswort wurde dir per DM geschickt.`;
  }
  if (action === "delete") {
    const target = users[key];
    delete users[key];
    delete accounts[key];
    await dbSet("dashboard", "users", users);
    await dbSet("dashboard", "accounts", accounts);
    await dashboardRevokeUser(data.username);
    await dashLog(actor.level, "account-delete", target.discordId, data.username);
    return `Account ${data.username} gelöscht.`;
  }
  throw new Error("Unbekannte Aktion.");
}
function dashboardHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
async function hashDashboardPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await dashboardScrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}
async function verifyDashboardPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = await dashboardScrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}
function getDashboardCookie(req) {
  const prefix = `${DASHBOARD_COOKIE}=`;
  const entry = (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null;
}
async function createDashboardSession(res, username, level, rememberMe) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = dashboardHash(token);
  const lifetime = rememberMe ? 30 * 86400000 : 12 * 3600000;
  const sessions = (await dbGet("dashboard", "sessions")) || {};
  for (const [key, s] of Object.entries(sessions)) {
    if (s.expiresAt <= Date.now()) delete sessions[key];
  }
  sessions[hash] = {
    username,
    level,
    expiresAt: Date.now() + lifetime
  };
  await dbSet("dashboard", "sessions", sessions);
  const cookie = `${DASHBOARD_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict${rememberMe ? `; Max-Age=${Math.floor(lifetime / 1000)}` : ""}`;
  res.setHeader("Set-Cookie", cookie);
}
const requireDashboardAuth = async (req, res, next) => {
  try {
    const token = getDashboardCookie(req);
    if (!token) return res.status(401).json({ error: "Anmeldung erforderlich" });
    const hash = dashboardHash(token);
    const sessions = (await dbGet("dashboard", "sessions")) || {};
    const session = sessions[hash];
    if (!session || session.expiresAt <= Date.now()) {
      delete sessions[hash];
      await dbSet("dashboard", "sessions", sessions);
      return res.status(401).json({ error: "Session abgelaufen" });
    }
        const config = await getDashboardUser(session.username);
    if (!config || !DASHBOARD_LEVELS.includes(config.level)) {
      delete sessions[hash];
      await dbSet("dashboard", "sessions", sessions);
      return res.status(401).json({ error: "Konto nicht mehr freigeschaltet" });
    }
    req.dashboardUser = {
      username: session.username,
      level: config.level
    };
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Authentifizierungsfehler" });
  }
};
async function createDashboardChallenge(username, level, discordId, rememberMe, firstLogin) {
  const pending = (await dbGet("dashboard", "pending")) || {};
  for (const [id, item] of Object.entries(pending)) {
    if (item.username.toLowerCase() === username.toLowerCase()) delete pending[id];
  }
  for (const [key, item] of Object.entries(pending)) {
    if (item.expiresAt <= Date.now()) delete pending[key];
  }
  const id = crypto.randomBytes(24).toString("hex");
  const code = String(crypto.randomInt(10000000, 99999999));
  pending[id] = {
    username,
    level,
    discordId,
    codeHash: dashboardCodeHash(code),
    rememberMe,
    firstLogin,
    verified: false,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000
  };
  await dbSet("dashboard", "pending", pending);
  return { id, code };
}
const dashboardLimits = new Map();
const dashboardVerifyFailures = new Map();
function limitBlocked(store, key, max) {
  const entry = store.get(key);
  return !!entry && entry.count >= max && entry.until > Date.now();
}
function limitHit(store, key, windowMs) {
  const entry = store.get(key);
  if (!entry || entry.until <= Date.now()) {
    store.set(key, { count: 1, until: Date.now() + windowMs });
  } else {
    entry.count++;
  }
}
function dashboardCodeHash(code) {
  return crypto
    .createHmac("sha256", process.env.DASHBOARD_CODE_SECRET)
    .update(String(code))
    .digest("hex");
}
function dashboardLoginBlocked(ip) {
  const entry = dashboardLoginAttempts.get(ip);
  return !!entry && entry.count >= 5 && entry.until > Date.now();
}
function dashboardLoginFailed(ip) {
  const entry = dashboardLoginAttempts.get(ip);
  if (!entry || entry.until <= Date.now()) {
    dashboardLoginAttempts.set(ip, { count: 1, until: Date.now() + 15 * 60 * 1000 });
  } else {
    entry.count++;
  }
}
const RANK_LADDER = [
  { name: "User", roleId: null },
  { name: "Test Member", roleId: config.roles.testmember },
  { name: "Member", roleId: config.roles.member },
  { name: "Team", roleId: config.roles.team },
  { name: "Admin", roleId: config.roles.admin },
  { name: "Admin*", roleId: null },
];
const ACTION_MIN_LEVEL = {
  "toggle-block": 1,
  warn: 1,
  unwarn: 1,
  timeout: 1,
  untimeout: 1,
  kick: 1,
  ban: 1,
  unban: 1,
  "promote-user": 2,
  "demote-user": 2,
  "clan-kick": 2,
  "purge-data": 2,
  "promote-rang": 3,
  "demote-rang": 3,
  "add-xp": 3,
  "remove-xp": 3,
  "add-kekse": 3,
  "remove-kekse": 3,
};
function getRankIndex(guild, userId, member) {
  if (guild.ownerId === userId) return 5;
  if (!member) return 0;
  for (let i = 4; i >= 1; i--) {
    if (member.roles.cache.has(RANK_LADDER[i].roleId)) return i;
  }
  return 0;
}
let banCache = { time: 0, list: [] };
async function getBans(guild) {
  if (Date.now() - banCache.time < 60000) return banCache.list;
  try {
    const bans = await guild.bans.fetch();
    banCache = { time: Date.now(), list: [...bans.values()] };
  } catch {
    banCache.time = Date.now();
  }
  return banCache.list;
}
async function dashLog(level, action, userId, details) {
  console.log(
    `[Dashboard] (${level}) ${action} -> <@${userId}>${details ? " | " + details : ""}`,
  );
  const ch = client.channels.cache.get(config.channels.logs);
  if (!ch) return;
  const embed = new EmbedBuilder()
    .setColor("#ffffff")
    .setDescription(
      `**Aktion:** \`Dashboard: ${action}\`\n**Ziel:** <@${userId}> (\`${userId}\`)\n**Token:** ${DASHBOARD_LEVEL_NAMES[level] || level}${details ? `\n**Info:** ${details}` : ""}`,
    )
    .setFooter({ text: "Kekse Bot | Dashboard" })
    .setTimestamp();
  await ch.send({ embeds: [embed] }).catch(() => {});
}
async function buildUserDatabase(guild) {
  const Storage = mongoose.model("BotStorage");
  const [ecoDocs, xpDocs] = await Promise.all([
    Storage.find({ namespace: "economy" }).lean(),
    Storage.find({ namespace: "xp" }).lean(),
  ]);
  const ecoMap = new Map();
  const txLogs = {};
  for (const doc of ecoDocs) {
    if (/^\d+$/.test(doc.key) && doc.value) ecoMap.set(doc.key, doc.value);
    else if (doc.key.startsWith("tx_") && doc.value?.history)
      txLogs[doc.key.replace("tx_", "")] = doc.value.history;
  }
  const xpMap = new Map(xpDocs.map((d) => [d.key, d.value || {}]));
  const modData = await getMData("moderation");
  const warnsMap = modData.warns || {};
  const banMap = new Map((await getBans(guild)).map((b) => [b.user.id, b]));
  const ids = new Set([
    ...guild.members.cache.filter((m) => !m.user.bot).keys(),
    ...ecoMap.keys(),
    ...banMap.keys(),
  ]);
  const users = [];
  for (const id of ids) {
    const member = guild.members.cache.get(id);
    const eco = ecoMap.get(id) || {};
    const xp = xpMap.get(id) || {};
    const ban = banMap.get(id);
    const tierIdx = Math.min(xp.rang ?? 0, ROLES_TIERS.length - 1);
    const rankIdx = getRankIndex(guild, id, member);
    const hasAccount = member
      ? member.roles.cache.has(config.roles.economy)
      : !!eco.username;
    if (!member && !hasAccount && !ban) continue;
    users.push({
      userId: id,
      username:
        member?.user.username ||
        eco.username ||
        ban?.user.username ||
        "Unbekannt",
      displayName:
        member?.displayName ||
        eco.username ||
        ban?.user.username ||
        "Unbekannt",
      inGuild: !!member,
      banned: !!ban,
      banReason: ban?.reason || null,
      timeoutUntil: member?.communicationDisabledUntilTimestamp || null,
      hasAccount,
      mcUsername: eco.mcUsername || null,
      rank: (RANK_LADDER[rankIdx] || RANK_LADDER[0]).name,
      rankIndex: rankIdx,
      tier: tierIdx,
      tierName: ROLES_TIERS[tierIdx].name,
      xp: xp.xp ?? 0,
      xpNeeded: ROLES_TIERS[tierIdx].needed,
      balance: eco.balance ?? 0,
      accountActive: hasAccount && !eco.blocked,
      warns: warnsMap[id] || [],
    });
  }
  return { users, txLogs };
}
let statsCache = { time: 0, data: null };
app.get("/api/stats", requireDashboardAuth, async (req, res) => {
  if (statsCache.data && Date.now() - statsCache.time < 15000) return res.json(statsCache.data);
  try {
    const guild =
      client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
    let ownerName = "Unbekannt";
    let userCount = globalBotStats.membersJoined;
    let botCount = 0;
    if (guild?.fetchOwner) {
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) ownerName = owner.user.username;
      userCount = guild.members.cache.filter((m) => !m.user.bot).size;
      botCount = guild.members.cache.filter((m) => m.user.bot).size;
    }
    const StorageModel = mongoose.model("BotStorage");
    const pingDoc = await StorageModel.findOne({
      namespace: "system",
      key: "ping_history",
    }).lean();
    const dbPingHistory =
      pingDoc && pingDoc.value && Array.isArray(pingDoc.value.history)
        ? pingDoc.value.history
        : [];
    const { users, txLogs } = guild
      ? await buildUserDatabase(guild)
      : { users: [], txLogs: {} };
    const mappedLogs = await readLogFile(logDateString());
    const payload = {
      guild: {
        name: guild?.name || "Kekse Server",
        id: guild?.id || "-",
        owner: ownerName,
        channels: guild?.channels?.cache?.size || 0,
      },
      users: userCount,
      bots: botCount,
      uptime: Math.floor(process.uptime()),
      version: "3.2.3",
      lastRestart: Math.round(Date.now() - process.uptime() * 1000),
      ping: {
        now: client.ws.ping || globalBotStats.pingNow || 0,
        avg: dbPingHistory.length
          ? Math.round(dbPingHistory.reduce((sum, p) => sum + p.y, 0) / dbPingHistory.length)
          : client.ws.ping || 0,
        max: globalBotStats.pingMaximum || client.ws.ping || 0,
        history: dbPingHistory,
      },
      userDatabase: users,
      transactionLogs: txLogs,
      logs: mappedLogs,
    };
    statsCache = { time: Date.now(), data: payload };
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/auth/login", express.json({ limit: "10kb" }), async function (req, res) {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (dashboardLoginBlocked(ip)) {
      return res.status(429).json({ error: "Zu viele Loginversuche. Bitte später erneut versuchen." });
    }
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const rememberMe = req.body?.rememberMe === true;
    if (!username || !password || username.length > 64 || password.length > 128) {
      dashboardLoginFailed(ip);
      return res.status(401).json({ error: "Ungültige Zugangsdaten." });
    }
    const config = await getDashboardUser(username);
    if (!config || !DASHBOARD_LEVELS.includes(config.level) || !/^\d{17,20}$/.test(String(config.discordId || ""))) {
      dashboardLoginFailed(ip);
      return res.status(401).json({ error: "Ungültige Zugangsdaten." });
    }
    const accountKey = dashboardKey(config.username);
    if (limitBlocked(dashboardLimits, "acc:" + accountKey, 10)) {
      return res.status(429).json({ error: "Zu viele Versuche für dieses Konto. Bitte später erneut versuchen." });
    }
    const accounts = (await dbGet("dashboard", "accounts")) || {};
    const account = accounts[accountKey];
    let firstLogin = false;
    if (account?.passwordHash) {
      if (!(await verifyDashboardPassword(password, account.passwordHash))) {
        dashboardLoginFailed(ip);
        limitHit(dashboardLimits, "acc:" + accountKey, 15 * 60 * 1000);
        return res.status(401).json({ error: "Ungültige Zugangsdaten." });
      }
    } else {
      const startValid =
        !!account?.startPasswordHash &&
        (!account.startExpiresAt || account.startExpiresAt > Date.now()) &&
        (await verifyDashboardPassword(password, account.startPasswordHash));
      if (!startValid) {
        dashboardLoginFailed(ip);
        limitHit(dashboardLimits, "acc:" + accountKey, 15 * 60 * 1000);
        return res.status(401).json({ error: "Ungültige Zugangsdaten." });
      }
      firstLogin = true;
    }
    dashboardLoginAttempts.delete(ip);
    if (!firstLogin && account.twoFactorEnabled === false) {
      await createDashboardSession(res, config.username, config.level, rememberMe);
      return res.json({ status: "authenticated", level: config.level });
    }
    if (limitBlocked(dashboardLimits, "chal:" + accountKey, 5)) {
      return res.status(429).json({ error: "Zu viele Anmeldeversuche. Bitte in ein paar Minuten erneut versuchen." });
    }
    limitHit(dashboardLimits, "chal:" + accountKey, 10 * 60 * 1000);
    const challenge = await createDashboardChallenge(
      config.username,
      config.level,
      config.discordId,
      rememberMe,
      firstLogin
    );
    res.json({
      status: "verify",
      challengeId: challenge.id,
      code: challenge.code,
      firstLogin
    });
  } catch (error) {
    console.error("[Dashboard Login]", error);
    res.status(500).json({ error: "Login fehlgeschlagen." });
  }
});
app.post("/api/auth/2fa-status", express.json({ limit: "10kb" }), async (req, res) => {
  try {
    const id = String(req.body?.challengeId || "");
    const pending = (await dbGet("dashboard", "pending")) || {};
    const challenge = pending[id];
    if (!challenge || challenge.purpose === "stepup" || challenge.expiresAt <= Date.now()) {
      delete pending[id];
      await dbSet("dashboard", "pending", pending);
      return res.status(401).json({ error: "Bestätigung abgelaufen." });
    }
    if (!challenge.verified) return res.json({ verified: false });
    if (challenge.firstLogin) {
      return res.json({ verified: true, setupRequired: true });
    }
    await createDashboardSession(
      res,
      challenge.username,
      challenge.level,
      challenge.rememberMe
    );
    delete pending[id];
    await dbSet("dashboard", "pending", pending);
    return res.json({ authenticated: true, level: challenge.level });
  } catch (error) {
    console.error("[Dashboard 2FA]", error);
    res.status(500).json({ error: "Verifizierung fehlgeschlagen." });
  }
});
app.post("/api/auth/complete-setup", express.json({ limit: "10kb" }), async (req, res) => {
  try {
    const id = String(req.body?.challengeId || "");
    const password = String(req.body?.password || "");
    const confirmation = String(req.body?.confirmation || "");
    const disableTwoFactor = req.body?.disableTwoFactor === true;
    if (password.length < 12 || password.length > 128 || password !== confirmation) {
      return res.status(400).json({ error: "Passwörter müssen übereinstimmen und mindestens 12 Zeichen lang sein." });
    }
    const pending = (await dbGet("dashboard", "pending")) || {};
    const challenge = pending[id];
    if (!challenge || !challenge.firstLogin || !challenge.verified || challenge.expiresAt <= Date.now()) {
      return res.status(401).json({ error: "Erstanmeldung nicht bestätigt oder abgelaufen." });
    }
    const config = await getDashboardUser(challenge.username);
    if (!config || config.discordId !== challenge.discordId) {
      return res.status(401).json({ error: "Konto nicht mehr freigeschaltet." });
    }
    const accounts = (await dbGet("dashboard", "accounts")) || {};
    accounts[config.username.toLowerCase()] = {
      username: config.username,
      passwordHash: await hashDashboardPassword(password),
      discordId: config.discordId,
      twoFactorEnabled: !disableTwoFactor,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await dbSet("dashboard", "accounts", accounts);
    await createDashboardSession(
      res,
      config.username,
      config.level,
      challenge.rememberMe
    );
    console.log(`${config.username}, Herzlich Willkommen!`)
    delete pending[id];
    await dbSet("dashboard", "pending", pending);
    res.json({ status: "authenticated", level: config.level });
  } catch (error) {
    console.error("[Dashboard Setup]", error);
    res.status(500).json({ error: "Passwort konnte nicht gespeichert werden." });
  }
});
app.get("/api/auth/session", requireDashboardAuth, (req, res) => {
  res.json({
    authenticated: true,
    username: req.dashboardUser.username,
    level: req.dashboardUser.level
  });
});
app.post("/api/auth/logout", requireDashboardAuth, async (req, res) => {
  try {
    const token = getDashboardCookie(req);
    const hash = dashboardHash(token);
    const sessions = (await dbGet("dashboard", "sessions")) || {};
    delete sessions[hash];
    await dbSet("dashboard", "sessions", sessions);
    res.setHeader("Set-Cookie", `${DASHBOARD_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Logout fehlgeschlagen." });
  }
});
app.get("/api/admin/accounts", requireDashboardAuth, requireDashboardAdmin, async function (req, res) {
  try {
    const users = await getDashboardUsers();
    const accounts = (await dbGet("dashboard", "accounts")) || {};
    const guild = client.guilds.cache.get(GUILD_ID);
    const ownKey = dashboardKey(req.dashboardUser.username);
    const actorRank = DASHBOARD_RANKS[req.dashboardUser.level] || 0;
    const list = Object.entries(users).map(function ([key, user]) {
      const account = accounts[key] || {};
      const member = guild?.members.cache.get(user.discordId);
      return {
        username: user.username,
        discordId: user.discordId,
        discordName: member ? member.displayName : null,
        level: user.level,
        passwordSet: !!account.passwordHash,
        setupPending: !account.passwordHash && !!account.startPasswordHash,
        startExpiresAt: account.startExpiresAt || null,
        twoFactorEnabled: account.passwordHash ? account.twoFactorEnabled !== false : null,
        createdAt: user.createdAt || null,
        self: key === ownKey,
        manageable: key !== ownKey && (DASHBOARD_RANKS[user.level] || 0) < actorRank
      };
    });
    list.sort(function (a, b) {
      return a.username.localeCompare(b.username);
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/admin/accounts/update", requireDashboardAuth, requireDashboardAdmin, express.json({ limit: "10kb" }), async function (req, res) {
  try {
    const users = await getDashboardUsers();
    const key = dashboardKey(req.body?.username);
    const target = users[key];
    if (!target) throw new Error("Account nicht gefunden.");
    if (key === dashboardKey(req.dashboardUser.username)) {
      throw new Error("Den eigenen Account kannst du hier nicht ändern.");
    }
    if ((DASHBOARD_RANKS[target.level] || 0) >= (DASHBOARD_RANKS[req.dashboardUser.level] || 0)) {
      throw new Error("Du kannst nur Accounts mit niedrigerer Berechtigung ändern.");
    }
    const newUsername = String(req.body?.newUsername ?? target.username).trim();
    const discordId = String(req.body?.discordId ?? target.discordId).trim();
    const level = String(req.body?.level ?? target.level);
    if (level !== target.level && req.dashboardUser.level !== "super") {
      throw new Error("Die Berechtigung darf nur Admin* ändern.");
    }
    validateAccountFields(newUsername, discordId, level);
    const newKey = dashboardKey(newUsername);
    if (newKey !== key && users[newKey]) throw new Error("Benutzername ist bereits vergeben.");
    const idOwner = Object.entries(users).find(function ([otherKey, other]) {
      return otherKey !== key && other.discordId === discordId;
    });
    if (idOwner) throw new Error(`Diese Discord-ID gehört bereits zu ${idOwner[1].username}.`);
    const changes = [];
    if (newUsername !== target.username) changes.push(`Benutzername ${target.username} -> ${newUsername}`);
    if (discordId !== target.discordId) changes.push(`Discord-ID ${target.discordId} -> ${discordId}`);
    if (level !== target.level) changes.push(`Berechtigung ${DASHBOARD_LEVEL_NAMES[target.level]} -> ${DASHBOARD_LEVEL_NAMES[level]}`);
    if (!changes.length) throw new Error("Es gibt keine Änderungen.");
    const accounts = (await dbGet("dashboard", "accounts")) || {};
    if (newKey !== key || discordId !== target.discordId) {
      await dashboardRevokeUser(target.username);
    }
    const account = accounts[key];
    delete users[key];
    delete accounts[key];
    users[newKey] = { ...target, username: newUsername, discordId, level, updatedAt: Date.now() };
    if (account) accounts[newKey] = { ...account, username: newUsername, discordId };
    await dbSet("dashboard", "users", users);
    await dbSet("dashboard", "accounts", accounts);
    await dashLog(req.dashboardUser.level, "account-update", discordId, `${target.username}: ${changes.join(", ")}`);
    res.json({ success: true, message: `Gespeichert: ${changes.join(", ")}` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.post("/api/admin/accounts/reset", requireDashboardAuth, requireDashboardAdmin, express.json({ limit: "10kb" }), async function (req, res) {
  try {
    const users = await getDashboardUsers();
    const key = dashboardKey(req.body?.username);
    const target = users[key];
    if (!target) throw new Error("Account nicht gefunden.");
    if (key === dashboardKey(req.dashboardUser.username)) {
      throw new Error("Dein eigenes Passwort kannst du hier nicht zurücksetzen.");
    }
    if ((DASHBOARD_RANKS[target.level] || 0) >= (DASHBOARD_RANKS[req.dashboardUser.level] || 0)) {
      throw new Error("Du kannst nur bei Accounts mit niedrigerer Berechtigung das Passwort zurücksetzen.");
    }
    const password = crypto.randomBytes(12).toString("base64url");
    const expires = Date.now() + 24 * 3600000;
    const until = `<t:${Math.floor(expires / 1000)}:f>`;
    const personText =
      "**Dein Dashboard-Passwort wurde zurückgesetzt**\n" +
      `Benutzername: \`${target.username}\`\n` +
      `Einmalpasswort: \`${password}\`\n` +
      `Gültig bis: ${until}\n\n` +
      `Melde dich unter ${DASHBOARD_URL} an, bestätige die Anmeldung in Discord und lege danach ein neues Passwort fest.`;
    const adminText =
      "**Dashboard-Passwort zurückgesetzt**\n" +
      `Die DM an <@${target.discordId}> war nicht möglich.\n` +
      `Benutzername: \`${target.username}\`\n` +
      `Einmalpasswort: \`${password}\`\n` +
      `Gültig bis: ${until}`;
    let sentTo = "user";
    if (!(await sendDashboardDm(target.discordId, personText))) {
      sentTo = "admin";
      if (!(await sendDashboardDm(config.users.sysadmin, adminText))) {
        throw new Error("Das Einmalpasswort konnte per DM nicht zugestellt werden. Es wurde nichts geändert.");
      }
    }
    const accounts = (await dbGet("dashboard", "accounts")) || {};
    accounts[key] = {
      username: target.username,
      discordId: target.discordId,
      startPasswordHash: await hashDashboardPassword(password),
      startExpiresAt: expires,
      resetAt: Date.now()
    };
    await dbSet("dashboard", "accounts", accounts);
    await dashboardRevokeUser(target.username);
    await dashLog(req.dashboardUser.level, "account-reset", target.discordId, target.username);
    res.json({
      success: true,
      sentTo,
      message:
        sentTo === "user"
          ? "Das Einmalpasswort wurde der Person per DM geschickt."
          : "Die DM an die Person war nicht möglich. Das Einmalpasswort wurde dir per DM geschickt."
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.post("/api/admin/accounts/stepup", requireDashboardAuth, requireDashboardAdmin, express.json({ limit: "10kb" }), async function (req, res) {
  try {
    const actor = req.dashboardUser;
    const actorKey = dashboardKey(actor.username);
    const action = String(req.body?.action || "");
    if (limitBlocked(dashboardLimits, "step:" + actorKey, 5)) {
      return res.status(429).json({ error: "Zu viele Bestätigungen. Bitte in ein paar Minuten erneut versuchen." });
    }
    const data = await prepareAccountAction(action, req.body?.data, actor);
    limitHit(dashboardLimits, "step:" + actorKey, 10 * 60 * 1000);
    const user = await getDashboardUser(actor.username);
    const pending = (await dbGet("dashboard", "pending")) || {};
    for (const [id, item] of Object.entries(pending)) {
      const sameStepup = item.purpose === "stepup" && dashboardKey(item.username) === actorKey;
      if (sameStepup || item.expiresAt <= Date.now()) delete pending[id];
    }
    const challengeId = crypto.randomBytes(24).toString("hex");
    const code = String(crypto.randomInt(10000000, 99999999));
    pending[challengeId] = {
      purpose: "stepup",
      username: actor.username,
      level: actor.level,
      discordId: user.discordId,
      codeHash: dashboardCodeHash(code),
      verified: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      action,
      data
    };
    await dbSet("dashboard", "pending", pending);
    res.json({ challengeId, code });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.post("/api/admin/accounts/stepup-status", requireDashboardAuth, requireDashboardAdmin, express.json({ limit: "10kb" }), async function (req, res) {
  try {
    const id = String(req.body?.challengeId || "");
    const pending = (await dbGet("dashboard", "pending")) || {};
    const challenge = pending[id];
    if (
      !challenge ||
      challenge.purpose !== "stepup" ||
      dashboardKey(challenge.username) !== dashboardKey(req.dashboardUser.username) ||
      challenge.expiresAt <= Date.now()
    ) {
      return res.status(410).json({ error: "Die Bestätigung ist abgelaufen." });
    }
    res.json({ verified: !!challenge.verified });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/admin/accounts/execute", requireDashboardAuth, requireDashboardAdmin, express.json({ limit: "10kb" }), async function (req, res) {
  try {
    const id = String(req.body?.challengeId || "");
    const pending = (await dbGet("dashboard", "pending")) || {};
    const challenge = pending[id];
    if (
      !challenge ||
      challenge.purpose !== "stepup" ||
      !challenge.verified ||
      dashboardKey(challenge.username) !== dashboardKey(req.dashboardUser.username) ||
      challenge.expiresAt <= Date.now()
    ) {
      return res.status(410).json({ error: "Die Bestätigung fehlt oder ist abgelaufen." });
    }
    delete pending[id];
    await dbSet("dashboard", "pending", pending);
    const data = await prepareAccountAction(challenge.action, challenge.data, req.dashboardUser);
    const message = await executeAccountAction(challenge.action, data, req.dashboardUser);
    res.json({ success: true, message });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.post("/api/tickets/delete", requireDashboardAuth, requireDashboardAdmin, express.json({ limit: "10kb" }), async (req, res) => {
  try {
    const id = String(req.body?.id || "");
    const closedAt = String(req.body?.closedAt || "");
    const index = archives.findIndex(function (t) {
      return t.id === id && t.closedAt === closedAt;
    });
    if (index === -1) return res.status(404).json({ error: "Ticket nicht gefunden." });
    const removed = archives.splice(index, 1)[0];
    await setTickData("archive_list", { archive: archives });
    const actor = await getDashboardUser(req.dashboardUser.username);
    await dashLog(
      req.dashboardUser.level,
      "ticket-delete",
      removed.createdById || actor?.discordId || config.users.sysadmin,
      `${removed.name} (${removed.messageCount} Nachrichten) gelöscht von ${req.dashboardUser.username}`,
    );
    res.json({ success: true, message: `Ticket ${removed.name} gelöscht.` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.post("/api/users/action", requireDashboardAuth, express.json(), async (req, res) => {
  try {
    const { userId, action, amount, reason, duration, index } = req.body || {};
    const level = req.dashboardUser.level;
    if (!level) return res.status(401).json({ error: "Ungültiger Token" });
    const neededRank = ACTION_MIN_LEVEL[action];
    if (!neededRank) return res.status(400).json({ error: "Unbekannte Aktion" });
    if ((DASHBOARD_RANKS[level] || 0) < neededRank)
      return res.status(403).json({ error: "Dafür fehlt dir die Berechtigung." });
    if (!/^\d{17,20}$/.test(String(userId)))
      return res.status(400).json({ error: "Ungültige User-ID" });
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild)
      return res.status(503).json({ error: "Server nicht verfügbar" });
    const fail = (m) => {
      throw new Error(m);
    };
    const member = await guild.members.fetch(userId).catch(() => null);
    const needMember = () => member || fail("User ist nicht auf dem Server.");
    const needAccount = async () => {
      const d = await getEcoData(userId);
      if (!d || !d.username) fail("Der User hat kein Bankkonto.");
      return d;
    };
    const val = parseInt(amount);
    const note =
      (reason && String(reason).trim().slice(0, 200)) || "Kein Grund";
    let info = "";
    if (["timeout", "kick", "ban"].includes(action)) {
      const actorRank = DASHBOARD_RANKS[level] || 0;
      if (actorRank < DASHBOARD_RANKS.super && (await dashboardLevelOfDiscordId(userId)) >= actorRank) {
        fail("Nutzer mit gleicher oder höherer Dashboard-Berechtigung können nicht bestraft werden.");
      }
      if (level === "mod" && getRankIndex(guild, userId, member) >= 3) {
        fail("Team-Mitglieder können nur von Admins bestraft werden.");
      }
    }
    switch (action) {
      case "promote-user":
        info = await clanChange(client, needMember(), "promote");
        break;
      case "demote-user":
        info = await clanChange(client, needMember(), "demote");
        break;
      case "clan-kick":
        info = await clanChange(client, needMember(), "kick");
        break;
      case "promote-rang":
      case "demote-rang": {
        const d = await getXpData(userId);
        const cur = d.rang !== undefined ? d.rang : 0;
        const next = cur + (action === "promote-rang" ? 1 : -1);
        if (next < 0 || next >= ROLES_TIERS.length)
          fail("Kein weiterer Rang möglich.");
        await setXpData(userId, { rang: next, xp: 0 });
        await applyTierRole(userId, next, client);
        info = `Rang: ${ROLES_TIERS[next].name} (XP auf 0 gesetzt)`;
        break;
      }
      case "add-xp":
        if (isNaN(val) || val <= 0) fail("Ungültige Menge");
        await addXP(userId, val, client);
        info = `+${val} XP`;
        break;
      case "remove-xp":
        if (isNaN(val) || val <= 0) fail("Ungültige Menge");
        await removeXP(userId, val, client);
        info = `-${val} XP`;
        break;
      case "add-kekse":
      case "remove-kekse": {
        if (isNaN(val) || val <= 0) fail("Ungültige Menge");
        const d = await needAccount();
        if (action === "add-kekse") {
          d.balance = (d.balance || 0) + val;
          await logTransaction(userId, val, "plus", "Dashboard Gutschrift");
        } else {
          d.balance = Math.max(0, (d.balance || 0) - val);
          await logTransaction(userId, val, "minus", "Dashboard Abzug");
        }
        await setEcoData(userId, d);
        info = `${action === "add-kekse" ? "+" : "-"}${val} Kekse`;
        break;
      }
      case "purge-data":
        if (getRankIndex(guild, userId, member) >= 4) fail("Admins und der Systemadministrator können nicht zurückgesetzt werden.");
        info = await purgeUserData(userId, { guild, member });
        statsCache.time = 0;
        break;
      case "toggle-block": {
        const d = await needAccount();
        d.blocked = !d.blocked;
        await logTransaction(
          userId,
          0,
          "neutral",
          `Konto durch Dashboard ${d.blocked ? "gesperrt" : "entsperrt"}`,
        );
        await setEcoData(userId, d);
        info = d.blocked ? "Konto gesperrt" : "Konto entsperrt";
        break;
      }
      case "timeout": {
        const ms = parseTimeframe(String(duration || ""));
        if (!ms) fail("Ungültige Dauer (z.B. 10m, 2h, 1d)");
        if (ms > 28 * 86400000) fail("Maximal 28 Tage möglich");
        await needMember().timeout(ms, note);
        info = `Timeout ${duration} | ${note}`;
        break;
      }
      case "untimeout":
        await needMember().timeout(null, note);
        info = note;
        break;
      case "kick":
        await needMember().kick(note);
        info = note;
        break;
      case "ban":
        await guild.members.ban(userId, { reason: note });
        banCache.time = 0;
        info = note;
        break;
      case "unban":
        await guild.members.unban(userId, note);
        banCache.time = 0;
        info = note;
        break;
      case "warn": {
        const md = await getMData("moderation");
        md.warns ??= {};
        (md.warns[userId] ??= []).push({
          reason: note,
          by: client.user.id,
          date: Date.now(),
          via: "dashboard",
        });
        await setMData("moderation", md);
        info = `${note} (Gesamt: ${md.warns[userId].length})`;
        break;
      }
      case "unwarn": {
        const md = await getMData("moderation");
        const list = md.warns?.[userId] || [];
        if (!list.length) fail("Keine Warnungen vorhanden.");
        const idx = index ? parseInt(index) - 1 : list.length - 1;
        if (!list[idx]) fail("Ungültige Warn-Nummer.");
        const removed = list.splice(idx, 1)[0];
        await setMData("moderation", md);
        info = `Entfernt: ${removed.reason}`;
        break;
      }
    }
    await dashLog(level, action, userId, info);
    statsCache.time = 0;
    
    res.json({ success: true, message: info });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
const RETENTION_MS = 365 * 86400000;
const PURGE_ROLE_IDS = [
  config.roles.economy,
  config.roles.giveawayDouble,
  config.roles.countingPuffer,
  config.roles.countingXp30,
  config.roles.countingXp60,
  config.roles.vip,
  config.roles.countingKing,
];
let leftQueue = Promise.resolve();
function storageModel() {
  return mongoose.model("BotStorage");
}
async function deleteStorageKeys(namespace, keys) {
  return dbDelete(namespace, keys);
}
function updateLeftUsers(mutator) {
  const run = leftQueue.then(async function () {
    const left = (await dbGet("retention", "left_users")) || {};
    mutator(left);
    await dbSet("retention", "left_users", left);
  });
  leftQueue = run.catch(function () {});
  return run;
}
function purgeCountingData(userId, guild) {
  return withCountingLock(async function () {
    const board = countingData.scoreboard || {};
    const claimed = countingData.milestonesClaimed || {};
    let changed = false;
    if (userId in board) {
      delete board[userId];
      changed = true;
    }
    for (const key of Object.keys(claimed)) {
      if (key.startsWith(userId + "_")) {
        delete claimed[key];
        changed = true;
      }
    }
    if (countingData.highscoreBy === userId) {
      countingData.highscoreBy = null;
      countingData.highscoreAt = null;
      changed = true;
    }
    if (!changed) return false;
    const wasKing = kingId === userId;
    recalcKing();
    await saveCounting();
    if (wasKing && kingId && guild) {
      const newKing = await guild.members.fetch(kingId).catch(function () {
        return null;
      });
      if (newKing) await newKing.roles.add(config.roles.countingKing).catch(function () {});
    }
    return true;
  });
}
async function purgeReminders(userId) {
  const data = (await getRData("reminders")) || { reminders: [] };
  const list = Array.isArray(data.reminders) ? data.reminders : [];
  const kept = list.filter(function (reminder) {
    return reminder.userId !== userId;
  });
  if (kept.length === list.length) return false;
  data.reminders = kept;
  await setRData("reminders", data);
  return true;
}
async function purgeGiveawayEntries(userId) {
  let changed = false;
  for (const key of ["activeGiveaways", "endedGiveaways"]) {
    const store = (await getGivData(key)) || {};
    let storeChanged = false;
    for (const giveaway of Object.values(store)) {
      if (giveaway.hostId === userId) {
        giveaway.hostId = client.user.id;
        storeChanged = true;
      }
      const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
      const winners = Array.isArray(giveaway.winners) ? giveaway.winners : [];
      if (participants.includes(userId)) {
        giveaway.participants = participants.filter(function (id) {
          return id !== userId;
        });
        storeChanged = true;
      }
      if (winners.includes(userId)) {
        giveaway.winners = winners.filter(function (id) {
          return id !== userId;
        });
        storeChanged = true;
      }
    }
    if (storeChanged) {
      await setGivData(key, store);
      changed = true;
    }
  }
  return changed;
}
async function purgeAltLinks(userId) {
  const networks = (await getSaData("alt_networks")) || {};
  let changed = false;
  if (networks[userId]) {
    delete networks[userId];
    changed = true;
  }
  for (const [id, list] of Object.entries(networks)) {
    if (!Array.isArray(list) || !list.includes(userId)) continue;
    const kept = list.filter(function (uid) {
      return uid !== userId;
    });
    if (kept.length) networks[id] = kept;
    else delete networks[id];
    changed = true;
  }
  if (changed) await setSaData("alt_networks", networks);
  return changed;
}
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function collectUserNames(userId, member) {
  const names = new Set();
  if (member) names.add(member.user.username);
  const eco = await getEcoData(userId);
  if (eco && eco.username) names.add(eco.username);
  const fetched = await client.users.fetch(userId).catch(function () {
    return null;
  });
  if (fetched) names.add(fetched.username);
  return [...names].filter(Boolean);
}
async function purgeWarnings(userId) {
  const data = await getMData("moderation");
  if (!data.warns || !data.warns[userId]) return false;
  delete data.warns[userId];
  await setMData("moderation", data);
  return true;
}
async function purgeTicketBlock(userId) {
  const blocked = (await getTickData("blocked_users")) || {};
  if (!blocked[userId]) return false;
  delete blocked[userId];
  await setTickData("blocked_users", blocked);
  return true;
}
async function purgeInviteData(userId) {
  const docs = await storageModel()
    .find({ namespace: "invites", "value.inviterId": userId }, { key: 1 })
    .lean();
  const keys = docs
    .map(function (doc) {
      return doc.key;
    })
    .concat("joined_" + userId);
  return (await dbDelete("invites", keys)) > 0;
}
async function purgeTickets(userId, names) {
  const before = archives.length;
  archives = archives.filter(function (ticket) {
    if (ticket.createdById === userId) return false;
    if (ticket.createdBy && names.includes(ticket.createdBy)) return false;
    const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    return !messages.some(function (m) {
      const author = m.author || {};
      if (author.id === userId) return true;
      if (typeof author.avatar === "string" && author.avatar.includes("/avatars/" + userId + "/")) return true;
      return !!author.name && names.includes(author.name);
    });
  });
  const removed = before - archives.length;
  if (removed > 0) await setTickData("archive_list", { archive: archives });
  return removed;
}
async function purgeLogFiles(userId, names) {
  const patterns = [new RegExp(escapeRegex(userId))];
  for (const name of names) {
    if (name.length < 3) continue;
    patterns.push(
      new RegExp("(?<![A-Za-z0-9_.])" + escapeRegex(name) + "(?![A-Za-z0-9_.])"),
    );
  }
  const files = await fs.promises.readdir(LOG_DIR).catch(function () {
    return [];
  });
  let removed = 0;
  for (const file of files) {
    if (!/^\d{2}-\d{2}-\d{4}\.log$/.test(file)) continue;
    if (logStream && file === logStreamDate + ".log") {
      const old = logStream;
      logStream = null;
      logStreamDate = null;
      await new Promise(function (resolve) {
        old.end(resolve);
      });
    }
    const full = path.join(LOG_DIR, file);
    const raw = await fs.promises.readFile(full, "utf8").catch(function () {
      return null;
    });
    if (raw === null) continue;
    const lines = raw.split("\n").filter(Boolean);
    const kept = lines.filter(function (line) {
      return !patterns.some(function (p) {
        return p.test(line);
      });
    });
    if (kept.length === lines.length) continue;
    removed += lines.length - kept.length;
    await fs.promises.writeFile(full, kept.length ? kept.join("\n") + "\n" : "");
  }
  return removed;
}
async function purgeUserData(userId, options) {
  const guild = options.guild;
  const member = options.member || null;
  if (member) {
    await member.roles.add(config.roles.unverified).catch(function () {
      throw new Error("Die Unverified-Rolle konnte nicht vergeben werden (Rollen-Reihenfolge prüfen). Es wurde nichts gelöscht.");
    });
  }
  const names = await collectUserNames(userId, member);
  const parts = [];
  if (await deleteStorageKeys("economy", [userId, "tx_" + userId])) parts.push("Konto und Transaktionen");
  if (await deleteStorageKeys("xp", [userId])) parts.push("XP und Rang");
  if (await purgeInviteData(userId)) parts.push("Einladungsdaten");
  if (await purgeCountingData(userId, guild)) parts.push("Counting-Stand");
  if (await purgeReminders(userId)) parts.push("Erinnerungen");
  if (await purgeGiveawayEntries(userId)) parts.push("Giveaway-Teilnahmen");
  if (await purgeAltLinks(userId)) parts.push("Zweitaccount-Verknüpfung");
  if (await purgeWarnings(userId)) parts.push("Verwarnungen");
  if (await purgeTicketBlock(userId)) parts.push("Ticket-Sperre");
  const tickets = await purgeTickets(userId, names);
  if (tickets) parts.push(`${tickets} Ticket-Transkripte`);
  if (!options.skipLogs) {
    const lines = await purgeLogFiles(userId, names);
    if (lines) parts.push(`${lines} Logzeilen`);
  }
  if (member) {
    const roleIds = PURGE_ROLE_IDS.concat(
      ROLES_TIERS.map(function (tier) {
        return tier.id;
      }),
    );
    await member.roles.remove(roleIds).catch(function (error) {
      console.error("Rollen konnten nicht entfernt werden:", error);
    });
    parts.push("Rollen zurückgesetzt, Unverified-Rolle vergeben");
  }
  return parts.length ? parts.join(", ") : "Keine gespeicherten Daten gefunden";
}
async function cleanupLogFiles() {
  const cutoff = Date.now() - RETENTION_MS;
  const files = await fs.promises.readdir(LOG_DIR).catch(function () {
    return [];
  });
  let removed = 0;
  for (const file of files) {
    const match = file.match(/^(\d{2})-(\d{2})-(\d{4})\.log$/);
    if (!match) continue;
    const fileTime = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
    if (fileTime >= cutoff) continue;
    await fs.promises
      .unlink(path.join(LOG_DIR, file))
      .then(function () {
        removed++;
      })
      .catch(function () {});
  }
  return removed;
}
async function cleanupTicketArchive() {
  const cutoff = Date.now() - RETENTION_MS;
  const before = archives.length;
  archives = archives.filter(function (ticket) {
    const closed = new Date(ticket.closedAt).getTime();
    return !closed || closed >= cutoff;
  });
  const removed = before - archives.length;
  if (removed > 0) await setTickData("archive_list", { archive: archives });
  return removed;
}
async function cleanupWarnings() {
  const cutoff = Date.now() - RETENTION_MS;
  const data = await getMData("moderation");
  const warns = data.warns || {};
  let removed = 0;
  let changed = false;
  for (const [userId, list] of Object.entries(warns)) {
    const current = Array.isArray(list) ? list : [];
    const kept = current.filter(function (warn) {
      return !warn.date || warn.date >= cutoff;
    });
    removed += current.length - kept.length;
    if (kept.length !== current.length || !kept.length) changed = true;
    if (kept.length) warns[userId] = kept;
    else delete warns[userId];
  }
  if (changed) {
    data.warns = warns;
    await setMData("moderation", data);
  }
  return removed;
}
async function cleanupEndedGiveaways() {
  const cutoff = Date.now() - RETENTION_MS;
  const ended = (await getGivData("endedGiveaways")) || {};
  let removed = 0;
  for (const [id, giveaway] of Object.entries(ended)) {
    if (giveaway.endTime && giveaway.endTime < cutoff) {
      delete ended[id];
      removed++;
    }
  }
  if (removed > 0) await setGivData("endedGiveaways", ended);
  return removed;
}
async function cleanupDepartedUsers() {
  const guild = await client.guilds.fetch(GUILD_ID).catch(function () {
    return null;
  });
  if (!guild || guild.members.cache.size < guild.memberCount * 0.9) return 0;
  const model = storageModel();
  const [economyDocs, xpDocs, inviteDocs] = await Promise.all([
    model.find({ namespace: "economy", key: /^(tx_)?\d+$/ }, { key: 1 }).lean(),
    model.find({ namespace: "xp", key: /^\d+$/ }, { key: 1 }).lean(),
    model.find({ namespace: "invites", key: /^joined_\d+$/ }, { key: 1 }).lean(),
  ]);
  const known = new Set(Object.keys(countingData.scoreboard || {}));
  const altNetworks = (await getSaData("alt_networks")) || {};
  for (const id of Object.keys(altNetworks)) known.add(id);
  for (const doc of economyDocs.concat(xpDocs, inviteDocs)) {
    known.add(doc.key.replace(/^(tx_|joined_)/, ""));
  }
  const now = Date.now();
  const expired = [];
  await updateLeftUsers(function (left) {
    for (const id of known) {
      if (guild.members.cache.has(id)) {
        delete left[id];
      } else if (!left[id]) {
        left[id] = now;
      } else if (now - left[id] >= RETENTION_MS) {
        expired.push(id);
      }
    }
    for (const id of Object.keys(left)) {
      if (guild.members.cache.has(id)) delete left[id];
      else if (!known.has(id) && now - left[id] >= RETENTION_MS) delete left[id];
    }
  });
  for (const id of expired) {
    await purgeUserData(id, { guild, member: null, skipLogs: true });
  }
  if (expired.length) {
    await updateLeftUsers(function (left) {
      for (const id of expired) delete left[id];
    });
  }
  return expired.length;
}
async function cleanupLogChannel() {
  const cutoff = Date.now() - RETENTION_MS;
  const channel = await client.channels.fetch(config.channels.logs).catch(function () {
    return null;
  });
  if (!channel || !channel.isTextBased()) return 0;
  let removed = 0;
  while (removed < 1500) {
    const batch = await channel.messages.fetch({ limit: 100, after: "0" });
    const sorted = [...batch.values()].sort(function (a, b) {
      return a.createdTimestamp - b.createdTimestamp;
    });
    const expired = sorted.filter(function (m) {
      return m.createdTimestamp < cutoff;
    });
    if (!expired.length) break;
    let deleted = 0;
    for (const message of expired) {
      const ok = await message
        .delete()
        .then(function () {
          return true;
        })
        .catch(function () {
          return false;
        });
      if (ok) deleted++;
      await new Promise(function (r) {
        setTimeout(r, 1200);
      });
    }
    removed += deleted;
    if (!deleted || expired.length < sorted.length) break;
  }
  return removed;
}
async function runRetentionCleanup() {
  const tasks = [
    ["Logs", cleanupLogFiles],
    ["Ticket-Transkripte", cleanupTicketArchive],
    ["Warnungen", cleanupWarnings],
    ["Giveaways", cleanupEndedGiveaways],
    ["Ehemalige Nutzer", cleanupDepartedUsers],
    ["Log-Kanal", cleanupLogChannel],
  ];
  const results = [];
  for (const [label, task] of tasks) {
    try {
      const count = await task();
      if (count > 0) results.push(`${label}: ${count}`);
    } catch (error) {
      console.error(`${label} fehlgeschlagen:`, error);
    }
  }
  if (results.length) console.log(`Gelöscht: ${results.join(", ")}`);
}
function startRetentionCleanup() {
  setTimeout(runRetentionCleanup, 60 * 1000);
  setInterval(runRetentionCleanup, 24 * 60 * 60 * 1000);
}
client.on("guildMemberRemove", async function (member) {
  if (member.guild.id !== GUILD_ID || member.user.bot) return;
  await updateLeftUsers(function (left) {
    left[member.id] = Date.now();
  }).catch(function (error) {
    console.error("Austritt konnte nicht gespeichert werden:", error);
  });
});
client.on("guildMemberAdd", async function (member) {
  if (member.guild.id !== GUILD_ID) return;
  await updateLeftUsers(function (left) {
    delete left[member.id];
  }).catch(function () {});
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
const commands = [
  new SlashCommandBuilder()
    .setName("send")
    .setDescription("Sendet eine Nachricht in einen bestimmten Kanal")
    .addChannelOption((opt) =>
      opt.setName("kanal").setDescription("Der Zielkanal").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("text")
        .setDescription("Der Nachrichtentext")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("changelog")
    .setDescription("Erstellt einen neuen Changelog-Eintrag")
    .addStringOption((opt) =>
      opt
        .setName("eintrag")
        .setDescription("Inhalt des Updates (Nutze Kommas für Listenpunkte)")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Sendet ein strukturiertes Embed")
    .addChannelOption((opt) =>
      opt.setName("kanal").setDescription("Der Zielkanal").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("titel")
        .setDescription("Der Titel des Embeds")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("text")
        .setDescription("Die Beschreibung / Haupttext")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("farbe")
        .setDescription("HEX-Farbe (z.B. #ff0000 oder #ffffff)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Sendet eine Direktnachricht an einen User")
    .addStringOption((opt) =>
      opt
        .setName("userid")
        .setDescription("Die Discord-ID des Users")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("text")
        .setDescription("Der Nachrichtentext")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("reply")
    .setDescription("Antwortet auf eine existierende Nachricht")
    .addStringOption((opt) =>
      opt
        .setName("msgid")
        .setDescription("Die ID der Nachricht")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName("text").setDescription("Der Antworttext").setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName("kanal")
        .setDescription("Kanal der Nachricht (Standard: aktueller Kanal)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Zeigt die aktuelle Latenz des Bots an")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Löscht eine bestimmte Anzahl an Nachrichten mit Filtern")
    .addIntegerOption((opt) =>
      opt
        .setName("anzahl")
        .setDescription("Menge an Nachrichten (max. 500, Standard: 100)")
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName("kanal")
        .setDescription("Der Zielkanal (Standard: aktueller Kanal)")
        .setRequired(false),
    )
    .addUserOption((opt) =>
      opt
        .setName("nutzer")
        .setDescription("Filtert Nachrichten nach einem bestimmten User")
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName("zeitrahmen")
        .setDescription("Zeitrahmen-Filter (z.B. 2h, 1d)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Giveaway-Verwaltung")
    .addSubcommand(function (sub) {
      return sub
        .setName("start")
        .setDescription("Startet ein Giveaway")
        .addChannelOption(function (o) {
          return o.setName("kanal").setDescription("Kanal").setRequired(true);
        })
        .addStringOption(function (o) {
          return o
            .setName("dauer")
            .setDescription("z.B. 1h, 30m, 1d")
            .setRequired(true);
        })
        .addStringOption(function (o) {
          return o.setName("preis").setDescription("Preis").setRequired(true);
        })
        .addStringOption(function (o) {
          return o.setName("text").setDescription("Beschreibung");
        })
        .addIntegerOption(function (o) {
          return o
            .setName("gewinner")
            .setDescription("Anzahl Gewinner")
            .setMinValue(1);
        })
        .addRoleOption(function (o) {
          return o.setName("rolle1").setDescription("Benötigte Rolle");
        })
        .addRoleOption(function (o) {
          return o.setName("rolle2").setDescription("Alternative Rolle");
        })
        .addRoleOption(function (o) {
          return o.setName("rolle3").setDescription("Alternative Rolle");
        });
    })
    .addSubcommand(function (sub) {
      return sub
        .setName("reroll")
        .setDescription("Zieht neue Gewinner für ein beendetes Giveaway")
        .addStringOption(function (o) {
          return o
            .setName("id")
            .setDescription("Nachrichten-ID des Giveaways")
            .setRequired(true);
        })
        .addIntegerOption(function (o) {
          return o
            .setName("anzahl")
            .setDescription("Anzahl neuer Gewinner")
            .setRequired(true)
            .setMinValue(1);
        });
    }),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Zeigt dir, wie du Hilfe oder Support erhalten kannst")
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("moveadmin")
    .setDescription(
      "Verschiebt das aktuelle Ticket manuell in den Admin-Bereich",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("top")
    .setDescription(
      "Zeigt die Top 10 User mit den meisten Punkten im Counting-System",
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("set-number")
    .setDescription("Admin: Setzt die nächste zu zählende Nummer manuell fest")
    .addIntegerOption((opt) =>
      opt
        .setName("nummer")
        .setDescription("Die neue Zielzahl")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageServer),
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription(
      "Sendet das Ticket-Panel mit Buttons in den aktuellen Kanal",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageServer),
  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Schließt und archiviert das aktuelle Ticket")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("block")
    .setDescription(
      "Sperrt einen User für eine bestimmte Anzahl an Tagen für das Ticket-System",
    )
    .addUserOption((opt) =>
      opt
        .setName("nutzer")
        .setDescription("Der zu sperrende Nutzer")
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("tage")
        .setDescription("Anzahl der Tage für die Sperre (Standard: 7)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("daily-setup")
    .setDescription(
      "Entwickler: Richtet ein tägliches Belohnungssystem mit Button ein",
    )
    .addStringOption((opt) =>
      opt
        .setName("id")
        .setDescription("Eine eindeutige ID für dieses Setup (z.B. event1)")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("beschreibung")
        .setDescription("Zusätzlicher Beschreibungstext für das Einlösen")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("casino")
    .setDescription("Zeigt eine Übersicht aller verfügbaren Casino-Spiele an")
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("roulette")
    .setDescription("Spiele eine Runde Roulette")
    .addIntegerOption((opt) =>
      opt
        .setName("einsatz")
        .setDescription("Einsatz in Keksen")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("typ")
        .setDescription(
          "Wettart: red, black, even, odd, Zahl 0-36, 1-18, 19-36",
        )
        .setRequired(true),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Mache einen Münzwurf")
    .addIntegerOption((opt) =>
      opt
        .setName("einsatz")
        .setDescription("Einsatz in Keksen")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("seite")
        .setDescription("Kopf oder Zahl?")
        .setRequired(true)
        .addChoices(
          { name: "Kopf (Heads)", value: "heads" },
          { name: "Zahl (Tails)", value: "tails" },
        ),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("jackpot")
    .setDescription("Zahle Kekse in den aktuellen Jackpot ein")
    .addIntegerOption((opt) =>
      opt
        .setName("einsatz")
        .setDescription("Einsatz in Keksen")
        .setRequired(true),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("crash")
    .setDescription("Starte ein Crash-Multiplikator-Spiel")
    .addIntegerOption((opt) =>
      opt
        .setName("einsatz")
        .setDescription("Einsatz in Keksen")
        .setRequired(true),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("highlow")
    .setDescription("Errate, ob die nächste Karte höher oder niedriger ist")
    .addIntegerOption((opt) =>
      opt
        .setName("einsatz")
        .setDescription("Einsatz in Keksen")
        .setRequired(true),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Spiele eine Runde Blackjack gegen den Bot")
    .addIntegerOption((opt) =>
      opt
        .setName("einsatz")
        .setDescription("Einsatz in Keksen")
        .setRequired(true),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("bank")
    .setDescription("Nutze das integrierte Bank- und Währungssystem")
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Zeigt dir privat deinen aktuellen Kontostand an"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Erstellt dein persönliches Bankkonto"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("help")
        .setDescription("Zeigt die Hilfe-Übersicht des Bank-Systems an"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("pay")
        .setDescription("Überweist Kekse an einen anderen Spieler")
        .addUserOption((opt) =>
          opt
            .setName("nutzer")
            .setDescription("Der Empfänger der Kekse")
            .setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("anzahl")
            .setDescription("Die Menge an Keksen")
            .setRequired(true),
        ),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("bank-admin")
    .setDescription("Serverleitung: Konten von Mitgliedern modifizieren")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageServer)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Fügt einem Konto Kekse hinzu")
        .addIntegerOption((opt) =>
          opt
            .setName("anzahl")
            .setDescription("Die Menge an Keksen")
            .setRequired(true),
        )
        .addUserOption((opt) =>
          opt
            .setName("nutzer")
            .setDescription("Der Zielnutzer")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Zieht von einem Konto Kekse ab")
        .addIntegerOption((opt) =>
          opt
            .setName("anzahl")
            .setDescription("Die Menge an Keksen")
            .setRequired(true),
        )
        .addUserOption((opt) =>
          opt
            .setName("nutzer")
            .setDescription("Der Zielnutzer")
            .setRequired(false),
        ),
    ),
  new SlashCommandBuilder()
    .setName("bank-mod")
    .setDescription("Team: Kontoinformationen und Umläufe einsehen")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName("see")
        .setDescription("Zeigt detaillierte Kontoinformationen eines Nutzers")
        .addUserOption((opt) =>
          opt
            .setName("nutzer")
            .setDescription("Der zu prüfende Nutzer")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("get")
        .setDescription("Zeigt an, wie viele Kekse insgesamt im Umlauf sind"),
    ),
  new SlashCommandBuilder()
    .setName("zweitaccount")
    .setDescription("Verwaltet die Zweitaccounts von Mitgliedern")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription(
          "Verknüpft zwei Accounts miteinander (ID oder Erwähnung)",
        )
        .addStringOption((opt) =>
          opt
            .setName("account_1")
            .setDescription("Erster Account (ID oder Erwähnung)")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("account_2")
            .setDescription("Zweiter Account (ID oder Erwähnung)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Löst eine bestimmte Account-Verknüpfung auf")
        .addStringOption((opt) =>
          opt
            .setName("nutzer")
            .setDescription("ID oder Erwähnung des zu entfernenden Accounts")
            .setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Erstellt eine persönliche Erinnerung")
    .addStringOption((opt) =>
      opt
        .setName("zeit")
        .setDescription("Zeitspanne bis zur Erinnerung (z.B. 10s, 5m, 1h, 2d)")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("grund")
        .setDescription("Waran soll der Bot dich erinnern?")
        .setRequired(true),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Versetzt ein Mitglied in ein Timeout")
    .addUserOption((opt) =>
      opt
        .setName("nutzer")
        .setDescription("Der betroffene Nutzer")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("dauer")
        .setDescription("Dauer (z.B. 10s, 5m, 2h, 1d)")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("grund")
        .setDescription("Grund für das Timeout")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Hebt das Timeout eines Mitglieds vorzeitig auf")
    .addUserOption((opt) =>
      opt
        .setName("nutzer")
        .setDescription("Der betroffene Nutzer")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("grund")
        .setDescription("Grund für die Aufhebung")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kickt ein Mitglied vom Server")
    .addUserOption((opt) =>
      opt
        .setName("nutzer")
        .setDescription("Der zu kickende Nutzer")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("grund")
        .setDescription("Grund für den Kick")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bannt einen User vom Server (auch per ID)")
    .addStringOption((opt) =>
      opt
        .setName("userid")
        .setDescription("Die Discord-ID oder Erwähnung des Users")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("grund")
        .setDescription("Grund für den Ban")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Hebt den Ban eines Users auf")
    .addStringOption((opt) =>
      opt
        .setName("userid")
        .setDescription("Die Discord-ID des Users")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("grund")
        .setDescription("Grund für den Entban")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Verwarnt ein Mitglied auf dem Server")
    .addUserOption((opt) =>
      opt
        .setName("nutzer")
        .setDescription("Der zu verwarnende Nutzer")
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("grund")
        .setDescription("Grund für die Verwarnung")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("warns")
    .setDescription("Zeigt alle Verwarnungen eines Nutzers an")
    .addUserOption((opt) =>
      opt
        .setName("nutzer")
        .setDescription("Der zu prüfende Nutzer")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("warn-remove")
    .setDescription(
      "Entfernt eine bestimmte Verwarnung eines Nutzers anhand der Nummer",
    )
    .addUserOption((opt) =>
      opt
        .setName("nutzer")
        .setDescription("Der betroffene Nutzer")
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("nummer")
        .setDescription("Die Nummer des Warns (z.B. 1)")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Zeigt die Top 5 Nutzer mit den meisten Keksen")
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("steal")
    .setDescription("Klaue einmal täglich 1-100 Kekse von einem zufälligen Mitglied")
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("slot")
    .setDescription("Drehe an der Slotmaschine")
    .addIntegerOption((opt) =>
      opt
        .setName("einsatz")
        .setDescription("Einsatz in Keksen")
        .setRequired(true),
    )
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName("dashboard-verify")
    .setDescription("Bestätigt eine Dashboard-Anmeldung")
    .addStringOption(opt =>
      opt
        .setName("code")
        .setDescription("Der achtstellige Bestätigungscode")
        .setMinLength(8)
        .setMaxLength(8)
        .setRequired(true)
    )
    .setContexts(0)
    .setIntegrationTypes(0),
].map((cmd) => cmd.toJSON());
export async function deploySlashCommands() {
  if (!process.env.BOT_TOKEN) {
    console.error("❌ Fehler: BOT_TOKEN fehlt in den Umgebungsvariablen!");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  try {
    const base64Token = process.env.BOT_TOKEN.split(".")[0];
    const botId = Buffer.from(base64Token, "base64").toString("utf-8");
    console.log(`Registriere Befehle für Bot-ID: ${botId}...`);
    await rest.put(
      Routes.applicationGuildCommands(botId, GUILD_ID),
      { body: commands },
    );
    console.log("Befehle erfolgreich registriert.");
  } catch (error) {
    console.error("Fehler bei der Registrierung:", error);
  }
}
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const {
    commandName,
    options,
    member,
    guild,
    user,
    channelId,
    channel: currentChannel,
  } = interaction;
  if (commandName === "dashboard-verify") {
    if (!member?.roles?.cache?.has(config.roles.team)) {
      return interaction.reply({
        content: "Du benötigst die Team-Rolle.",
        flags: [MessageFlags.Ephemeral]
      });
    }
    const code = options.getString("code", true);
    if (limitBlocked(dashboardVerifyFailures, user.id, 5)) {
      return interaction.reply({
        content: "Zu viele Fehlversuche. Bitte warte 15 Minuten.",
        flags: [MessageFlags.Ephemeral]
      });
    }
    const codeHash = dashboardCodeHash(code);
    const pending = (await dbGet("dashboard", "pending")) || {};
    const entry = Object.entries(pending).find(
      ([, p]) =>
        p.codeHash === codeHash &&
        p.expiresAt > Date.now() &&
        !p.verified &&
        p.discordId === user.id
    );
    if (!entry) {
      limitHit(dashboardVerifyFailures, user.id, 15 * 60 * 1000);
      return interaction.reply({
        content: "Der Code ist ungültig, abgelaufen oder gehört nicht zu deinem Discord-Konto.",
        flags: [MessageFlags.Ephemeral]
      });
    }
    const [challengeId, challenge] = entry;
    challenge.verified = true;
    challenge.verifiedAt = Date.now();
    pending[challengeId] = challenge;
    await dbSet("dashboard", "pending", pending);
    return interaction.reply({
      content: "Dashboard-Anmeldung erfolgreich bestätigt.",
      flags: [MessageFlags.Ephemeral]
    });
  }
  const sendKekseLog = async (cmdName, target, content) => {
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (logChannel) {
      const kekseEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: user.username,
          iconURL: user.displayAvatarURL({ size: 512 }),
        })
        .setDescription(
          `**Aktion:** \`/${cmdName}\`\n**Ziel:** ${target}\n**Inhalt:**\n\`\`\`${content || "Kein Inhalt"}\`\`\``,
        )
        .setFooter({ text: "Kekse Bot | Message System" })
        .setTimestamp();
      await logChannel.send({ embeds: [kekseEmbed] }).catch(() => {});
    }
  };
  if (commandName === "leaderboard") {
    const StorageModel = mongoose.model("BotStorage");
    const sorted = await StorageModel.find(
      { namespace: "economy", key: /^\d+$/, "value.balance": { $gt: 0 } },
      { key: 1, "value.balance": 1 },
    ).sort({ "value.balance": -1 }).limit(5).lean();
    const embed = new EmbedBuilder()
      .setTitle("🏆 Top 5 Balance")
      .setColor("#ffffff")
      .setDescription(
        sorted
          .map(
            (doc, i) =>
              `**${i + 1}.** <@${doc.key}> • ${doc.value.balance.toLocaleString("de-DE")} Kekse`,
          )
          .join("\n") || "Keine Daten",
      )
      .setFooter({ text: "Kekse Clan" })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }
  if (commandName === "steal") {
    const result = await performSteal(guild, member);
    console.log(`Reply ${user.username}: ${result.text}`);
    
    const payload = { content: result.text };
    if (!result.ok) payload.flags = [MessageFlags.Ephemeral];
    return interaction.reply(payload);
  }
  if (commandName === "send") {
    const targetChannel = options.getChannel("kanal");
    const text = options.getString("text");
    await targetChannel.send(text);
    await interaction.reply({
      content: `Nachricht in ${targetChannel} gesendet.`,
      flags: [MessageFlags.Ephemeral],
    });
    await sendKekseLog("send", targetChannel.toString(), text);
    
    console.log(`${user.username} hat die "send"-Funktion genutzt`);
  }
  if (commandName === "changelog") {
    const changelogChannel = guild.channels.cache.get("1464993818968588379");
    const eintrag = options.getString("eintrag");
    if (!changelogChannel)
      return interaction.reply({
        content: "Kanal nicht gefunden.",
        flags: [MessageFlags.Ephemeral],
      });
    const date = new Date().toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const updateList = eintrag
      .split(",")
      .map((item) => `- ${item.trim()}`)
      .join("\n");
    const messageFormat = `<@&1464994942345547857>\n**:wrench: Änderungen (${date})**\n${updateList}`;
    await changelogChannel.send(messageFormat);
    await interaction.reply({
      content: "Changelog erfolgreich gepostet.",
      flags: [MessageFlags.Ephemeral],
    });
    await sendKekseLog("changelog", changelogChannel.toString(), updateList);
    
    console.log(`${user.username} hat die "changelog"-Funktion genutzt`);
  }
  if (commandName === "embed") {
    const targetChannel = options.getChannel("kanal");
    const title = options.getString("titel");
    const text = options.getString("text");
    const color = options.getString("farbe") || "#ffffff";
    const validColor = /^#[0-9A-F]{6}$/i.test(color) ? color : "#ffffff";
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(text)
      .setColor(validColor);
    await targetChannel.send({ embeds: [embed] });
    await interaction.reply({
      content: `Embed erfolgreich in ${targetChannel} gesendet.`,
      flags: [MessageFlags.Ephemeral],
    });
    await sendKekseLog(
      "embed",
      targetChannel.toString(),
      `Titel: ${title}\nText: ${text}`,
    );
    
    console.log(`${user.username} hat die "embed"-Funktion genutzt`);
  }
  if (commandName === "dm") {
    const userId = options.getString("userid");
    const text = options.getString("text");
    const targetUser = await client.users.fetch(userId).catch(() => null);
    if (!targetUser) {
      return interaction.reply({
        content: "❌ User konnte nicht gefunden werden. Ungültige ID?",
        flags: [MessageFlags.Ephemeral],
      });
    }
    try {
      await targetUser.send(text);
      await interaction.reply({
        content: `Direktnachricht an ${targetUser.tag} gesendet.`,
        flags: [MessageFlags.Ephemeral],
      });
      await sendKekseLog("dm", `${targetUser.tag} (${userId})`, text);
      
      console.log(`${user.username} hat die "dm"-Funktion genutzt`);
    } catch (err) {
      await interaction.reply({
        content:
          "❌ Die DM konnte nicht zugestellt werden (Privatsphäre-Einstellungen des Users).",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (commandName === "reply") {
    const msgId = options.getString("msgid");
    const text = options.getString("text");
    const targetChannel = options.getChannel("kanal") || currentChannel;
    try {
      const targetMsg = await targetChannel.messages.fetch(msgId);
      targetMsg.system
        ? await targetChannel.send(text)
        : await targetMsg.reply(text);
      await interaction.reply({
        content: "Erfolgreich auf die Nachricht geantwortet.",
        flags: [MessageFlags.Ephemeral],
      });
      await sendKekseLog(
        "reply",
        `Nachricht ID ${msgId} in ${targetChannel}`,
        text,
      );
      
      console.log(`${user.username} hat die "reply"-Funktion genutzt`);
    } catch (err) {
      await interaction.reply({
        content: "❌ Nachricht im angegebenen Kanal nicht gefunden.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (commandName === "ping") {
    if (!member.roles.cache.has(config.roles.team)) {
      return interaction.reply({
        content: "❌ Keine Berechtigung.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    
    const start = Date.now();
    await interaction.reply({
      content: "🏓 Pinging...",
      flags: [MessageFlags.Ephemeral],
    });
    const end = Date.now();
    const roundtrip = end - start;
    const wsPing = client.ws.ping;
    await interaction
      .editReply({
        content: `🏓 **Pong!**\n- API-Latenz: \`${roundtrip}ms\`\n- WebSocket: \`${wsPing}ms\``,
      })
      .catch(() => {});
    const logChannel = client.channels.cache.get(config.channels.logs);
    console.log(
      `${user.username} hat eine Pingabfrage gestartet. Antwort: API-Latenz:${roundtrip}ms , WebSocket:${wsPing}ms`,
    );
    if (logChannel) {
      const kekseLog = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: user.username,
          iconURL: user.displayAvatarURL({ size: 512 }),
        })
        .setDescription(
          `**Aktion:** \`/ping\`\n**Ergebnis:** RT: \`${roundtrip}ms\` | WS: \`${wsPing}ms\``,
        )
        .setFooter({ text: "Kekse Bot | System Check" })
        .setTimestamp();
      await logChannel.send({ embeds: [kekseLog] }).catch(() => {});
    }
  }
  if (commandName === "clear") {
    if (!member.roles.cache.has(config.roles.team)) {
      return interaction.reply({
        content: ":x: Keine Berechtigung.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const amount = Math.min(options.getInteger("anzahl") || 100, 500);
    const targetChannel = options.getChannel("kanal") || currentChannel;
    const targetUser = options.getUser("nutzer");
    const timeframe = options.getString("zeitrahmen");
    if (!targetChannel.isTextBased()) {
      return interaction.reply({
        content: "❌ Der ausgewählte Kanal ist kein Textkanal.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const startTime = Date.now();
    let messagesToDelete = [];
    let lastId = null;
    let deletedCount = 0;
    try {
      while (messagesToDelete.length < amount) {
        const fetched = await targetChannel.messages.fetch({
          limit: 100,
          before: lastId || undefined,
        });
        if (!fetched || fetched.size === 0) break;
        for (const msg of fetched.values()) {
          if (targetUser && msg.author.id !== targetUser.id) continue;
          if (timeframe) {
            const ms = parseTimeframe(timeframe);
            if (Date.now() - msg.createdTimestamp > ms) continue;
          }
          messagesToDelete.push(msg);
          if (messagesToDelete.length >= amount) break;
        }
        const lastMsg = fetched.last();
        if (!lastMsg) break;
        lastId = lastMsg.id;
        if (fetched.size < 100) break;
      }
      if (messagesToDelete.length === 0) {
        return interaction.editReply({
          content:
            " Keine Nachrichten gefunden, die den Kriterien entsprechen.",
        });
      }
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const youngMsgs = messagesToDelete.filter(
        (m) => m.createdTimestamp > fourteenDaysAgo,
      );
      const oldMsgs = messagesToDelete.filter(
        (m) => m.createdTimestamp <= fourteenDaysAgo,
      );
      if (youngMsgs.length > 0) {
        await interaction.editReply({
          content: ` Bulk-Löschung von ${youngMsgs.length} Nachrichten...`,
        });
        const deletedBulk = await targetChannel
          .bulkDelete(youngMsgs, true)
          .catch(() => new Map());
        deletedCount += deletedBulk.size;
      }
      if (oldMsgs.length > 0) {
        for (let i = 0; i < oldMsgs.length; i++) {
          await oldMsgs[i].delete().catch(() => {});
          deletedCount++;
          if (deletedCount % 5 === 0) {
            await interaction
              .editReply({
                content: ` Lösche alte Nachrichten: **${deletedCount}/${messagesToDelete.length}**...`,
              })
              .catch(() => {});
          }
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    } catch (clearError) {
      console.log(
        `[ClearCommand] Fehler bei der Ausführung: ${clearError.message}`,
      );
      return interaction.editReply({
        content: "❌ Ein interner Fehler ist beim Löschen aufgetreten.",
      });
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await interaction.editReply({
      content: `✅ **Abschlussbericht:**\n- Gelöscht: **${deletedCount}**\n- Dauer: **${duration}s**\n- Kanal: <#${targetChannel.id}>`,
    });
    console.log(
      `${user.username} hat die "clear"-Funktion genutzt: ${deletedCount} innerhalb von ${duration}s in ${targetChannel} gelöscht`,
    );
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (logChannel) {
      const userList = targetUser ? `<@${targetUser.id}>` : "Alle User";
      const logEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: user.username,
          iconURL: user.displayAvatarURL({ size: 512 }),
        })
        .setDescription(
          `**Aktion:** \`Clear\`\n\n**Kanal:** <#${targetChannel.id}>\n**Anzahl:** ${deletedCount}\n**Filter (User):** ${userList}\n**Zeitrahmen:** ${timeframe || "Keiner"}\n**Dauer:** ${duration}s`,
        )
        .setFooter({ text: "Kekse Bot | Moderation System" })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
    
  }
  if (commandName === "giveaway") {
    if (!member.roles.cache.has(config.roles.team)) {
      return interaction.reply({
        content: " Keine Rechte.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const subcommand = options.getSubcommand();
    if (subcommand === "reroll") {
      const giveawayId = options.getString("id");
      const count = options.getInteger("anzahl");
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const error = await rerollGiveaway(
        interaction.client,
        interaction.guild,
        giveawayId,
        count,
        user,
        sendKekseLog,
      );
      if (error) return interaction.editReply({ content: error });
      return interaction.editReply({ content: "✅ Reroll durchgeführt." });
    }
    const channel = options.getChannel("kanal");
    const durationStr = options.getString("dauer");
    const price = options.getString("preis");
    const messageText = options.getString("text") || "Viel Glück 🍀";
    const winnerCount = options.getInteger("gewinner") || 1;
    if (!channel.isTextBased()) {
      return interaction.reply({
        content: "❌ Der ausgewählte Kanal ist kein Textkanal.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const durationMs = parseDuration(durationStr);
    if (durationMs <= 0) {
      return interaction.reply({
        content: "❌ Zeitformat ungültig (z.B. 1h, 30m, 1d).",
        flags: [MessageFlags.Ephemeral],
      });
    }
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const requiredRoles = [];
    for (const optionName of ["rolle1", "rolle2", "rolle3"]) {
      const role = options.getRole(optionName);
      if (role && !requiredRoles.includes(role.id)) requiredRoles.push(role.id);
    }
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    const giveawayData = {
      channelId: channel.id,
      startTime,
      endTime,
      price,
      messageText,
      winnerCount,
      requiredRoles,
      hostId: user.id,
      participants: [],
    };
    const embed = new EmbedBuilder()
      .setTitle(`🎁 Giveaway: ${price}`)
      .setDescription(buildDescription(giveawayData, 0))
      .setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`join_giveaway`)
        .setLabel("Teilnehmen")
        .setEmoji(GIVEAWAY_EMOJI)
        .setStyle(ButtonStyle.Primary),
    );
    const giveawayMsg = await channel.send({
      content: "<@&1424028650080178348>",
      embeds: [embed],
      components: [row],
    });
    const giveaways = (await getGivData("activeGiveaways")) || {};
    giveaways[giveawayMsg.id] = giveawayData;
    await setGivData("activeGiveaways", giveaways);
    await interaction.editReply({
      content: `✅ Giveaway erfolgreich in ${channel} gestartet!\n**ID:** \`${giveawayMsg.id}\``,
      flags: [MessageFlags.Ephemeral],
    });
    let logDetails = `**Preis:** ${price}\n**Kanal:** ${channel}\n**Dauer:** ${durationStr}\n**Gewinner:** ${winnerCount}`;
    if (requiredRoles.length > 0)
      logDetails += `\n**Benötigte Rolle:** ${formatRoles(requiredRoles)}`;
    await sendKekseLog("Giveaway gestartet", user, logDetails);
    console.log(
      `${user.username} hat ein Giveaway für ${price} in ${channel} erstellt.`,
    );
  }
  if (commandName === "help") {
    console.log(`[HELP] Von ${user.username}`);
    await handleSlashHelpCommand(interaction);
    console.log(`${user.username} hat die "help"-Funktion genutzt`);
    
  }
  if (commandName === "moveadmin") {
    if (!member.roles.cache.has(config.roles.team)) {
      return interaction.reply({
        content: ":x: Keine Berechtigung.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    await interaction.reply({
      content: "⏳ Verschiebe Ticket in den Admin-Bereich...",
      flags: [MessageFlags.Ephemeral],
    });
    await moveChannelToAdmin(currentChannel, true);
    console.log(
      `${user.username} hat ein Ticket in die Admin-Kategorie verschoben`,
    );
    
  }
  if (commandName === "ticket-panel") {
    if (!member.roles.cache.has(config.roles.admin)) {
      return interaction.reply({
        content: "❌ Keine Berechtigung.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    await interaction.reply({
      content: "⏳ Sende Ticket-Panel...",
      flags: [MessageFlags.Ephemeral],
    });    
    const panelEmbed = new EmbedBuilder()
      .setTitle("Willkommen im Support")
      .setDescription(
        `Wähle eins der Themen um ein Ticket zu erstellen. Ein Team-Mitglied wird sich schnellstmöglich um dein Anliegen kümmern.\n\n⚙️ **Support** → Allgemeine Support-Anliegen\n🎉 **Abholung** → Abholung von Giveaways und Events\n✉️ **Bewerbung** → Clan-Bewerbungen`,
      )
      .setColor("#ffffff");
    const panelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("t_Support").setLabel("⚙️ Support").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("t_Abholung").setLabel("🎉 Abholung").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("t_Bewerbung").setLabel("✉️ Bewerbung").setStyle(ButtonStyle.Secondary),
    );
    await currentChannel.send({ embeds: [panelEmbed], components: [panelRow] });
    console.log(`${user.username} hat ein neues Ticket-Panel erstellt`);
    
  }
  if (commandName === "close") {
    if (!member.roles.cache.has(config.roles.team)) {
      return interaction.reply({
        content: "Keine Berechtigung.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    await interaction.reply({
      content: "⏳ Ticket-Schließung initiiert...",
      flags: [MessageFlags.Ephemeral],
    });
    await closeTicket(currentChannel, user);
    console.log(`${user.username} hat ${currentChannel} geschlossen`);
    
  }
  if (commandName === "block") {
    if (!member.roles.cache.has(config.roles.team)) {
      return interaction.reply({
        content: ":x: Keine Berechtigung.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const targetUser = options.getUser("nutzer");
    const days = options.getInteger("tage") || 7;
    await blockUser(
      targetUser.id,
      targetUser.username,
      days * 24 * 60 * 60 * 1000,
    );
    console.log(
      `${user.username} hat ${targetUser.username} von der Erstellung von Tickets ausgeschlossen`,
    );
    await interaction.reply({
      content: `✅ <@${targetUser.id}> wurde für ${days} Tage gesperrt.`,
      flags: [MessageFlags.Ephemeral],
    });
    
  }
  if (!member.roles.cache.has(config.roles.team) || !hasPerm(member)) {
    if (
      [
        "timeout",
        "untimeout",
        "kick",
        "ban",
        "unban",
        "warn",
        "warns",
        "warn-remove",
      ].includes(commandName)
    ) {
      return interaction.reply({
        content: ":x: Keine Berechtigung.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  let moderationData = (await getMData("moderation")) || { warns: {} };
  const sendModLog = async (action, target, reason, extra = null) => {
    const logChannel = await client.channels
      .fetch(config.channels.logs)
      .catch(() => null);
    if (!logChannel) return;
    const kekseEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setTitle(`🛠️ Mod-Aktion: ${action}`)
      .setDescription(
        `**Target:** ${target.tag || target.id} (\`${target.id}\`)\n**Grund:** ${reason}${extra ? `\n**Info:** ${extra}` : ""}`,
      )
      .setFooter({ text: "Kekse Bot | Moderation System" })
      .setTimestamp();
    await logChannel.send({ embeds: [kekseEmbed] }).catch(() => {});
  };
  if (commandName === "timeout") {
    const targetUser = options.getUser("nutzer");
    const durationStr = options.getString("dauer");
    const reason = options.getString("grund") || "Kein Grund";
    const match = durationStr.match(/^(\d+)([smhd])$/);
    if (!match)
      return interaction.reply({
        content: " Format: 10s, 5m, 2h, 1d",
        flags: [MessageFlags.Ephemeral],
      });
    const durationMs = parseTimeframe(durationStr);
    if (durationMs === 0)
      return interaction.reply({
        content: " Ungültige Zeitangabe.",
        flags: [MessageFlags.Ephemeral],
      });
    try {
      const targetMember = await guild.members.fetch(targetUser.id);
      await targetMember.timeout(durationMs, reason);
      await interaction.reply({
        content: ` **Timeout**: <@${targetUser.id}> für ${durationStr}.`,
        flags: [MessageFlags.Ephemeral],
      });
      await sendModLog("Timeout", targetUser, reason, `Dauer: ${durationStr}`);
      console.log(
        `${user.username} hat ${targetUser} wegen ${reason} für ${durationStr} in den timeout versetzt`,
      );
      
    } catch (err) {
      await interaction.reply({
        content: " Fehler: User nicht auf Server oder fehlende Rechte.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (commandName === "untimeout") {
    const targetUser = options.getUser("nutzer");
    const reason = options.getString("grund") || "Kein Grund";
    try {
      const targetMember = await guild.members.fetch(targetUser.id);
      await targetMember.timeout(null, reason);
      await interaction.reply({
        content: `✅ **Untimeout**: <@${targetUser.id}>`,
        flags: [MessageFlags.Ephemeral],
      });
      await sendModLog("Untimeout", targetUser, reason);
      console.log(
        `${user.username} hat ${targetUser} wegen ${reason} aus dem timeout geholt`,
      );
      
    } catch (err) {
      await interaction.reply({
        content: "❌ Fehler beim Untimeout.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (commandName === "kick") {
    const targetUser = options.getUser("nutzer");
    const reason = options.getString("grund") || "Kein Grund";
    try {
      await guild.members.kick(targetUser.id, reason);
      await interaction.reply({
        content: `✅ **Kick**: <@${targetUser.id}>`,
        flags: [MessageFlags.Ephemeral],
      });
      await sendModLog("Kick", targetUser, reason);
      console.log(
        `${user.username} hat ${targetUser} wegen ${reason} vom Server gekickt`,
      );
      
    } catch (err) {
      await interaction.reply({
        content: "❌ Fehler beim Kick.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (commandName === "ban") {
    const idInput = options.getString("userid").replace(/[<@!>]/g, "");
    const reason = options.getString("grund") || "Kein Grund";
    if (!/^\d{17,20}$/.test(idInput)) {
      return interaction.reply({
        content: "❌ Gültige ID/Erwähnung angeben.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    try {
      const fetchedUser = await client.users
        .fetch(idInput)
        .catch(() => ({ id: idInput, tag: "Unknown#0000" }));
      await guild.members.ban(idInput, { reason });
      await interaction.reply({
        content: `✅ **Ban**: ${fetchedUser.tag || idInput} wurde gebannt.`,
        flags: [MessageFlags.Ephemeral],
      });
      await sendModLog("Ban", fetchedUser, reason);
      console.log(
        `${user.username} hat ${fetchedUser} wegen ${reason} vom Server gebannt`,
      );
      
    } catch (err) {
      await interaction.reply({
        content: "❌ Fehler beim Ban (Rechte?).",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (commandName === "unban") {
    const idInput = options.getString("userid").replace(/[<@!>]/g, "");
    const reason = options.getString("grund") || "Kein Grund";
    try {
      const fetchedUser = await client.users
        .fetch(idInput)
        .catch(() => ({ id: idInput, tag: idInput }));
      await guild.members.unban(idInput, reason);
      await interaction.reply({
        content: `✅ **Unban**: ${fetchedUser.tag || idInput}`,
        flags: [MessageFlags.Ephemeral],
      });
      await sendModLog("Unban", fetchedUser, reason);
      console.log(
        `${user.username} hat ${fetchedUser} wegen ${reason} vom Server entbannt`,
      );
      
    } catch (err) {
      await interaction.reply({
        content: "❌ User nicht gebannt oder ID falsch.",
        flags: [MessageFlags.Ephemeral],
      });
    }
  }
  if (commandName === "warn") {
    const targetUser = options.getUser("nutzer");
    const reason = options.getString("grund") || "Kein Grund";
    moderationData.warns[targetUser.id] ??= [];
    moderationData.warns[targetUser.id].push({
      reason,
      by: user.id,
      date: Date.now(),
    });
    await setMData("moderation", moderationData);
    await interaction.reply({
      content: `⚠️ **Warn**: <@${targetUser.id}> (Gesamt: ${moderationData.warns[targetUser.id].length})`,
      flags: [MessageFlags.Ephemeral],
    });
    await sendModLog(
      "Warnung",
      targetUser,
      reason,
      `Warn-Stand: ${moderationData.warns[targetUser.id].length}`,
    );
    console.log(`${user.username} hat ${targetUser} wegen ${reason} gewarnt`);
    
  }
  if (commandName === "warns") {
    const targetUser = options.getUser("nutzer");
    const userWarns = moderationData.warns[targetUser.id] || [];
    if (userWarns.length === 0) {
      return interaction.reply({
        content: "✅ Keine Warnungen.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const embed = new EmbedBuilder()
      .setTitle(`Warnungen: ${targetUser.username}`)
      .setColor("#ffffff")
      .setDescription(
        userWarns
          .map((w, i) => `**${i + 1}.** ${w.reason} (von <@${w.by}>)`)
          .join("\n"),
      )
      .setFooter({ text: "Kekse Clan" });
    await interaction.reply({ embeds: [embed] });
    console.log(
      `${user.username} hat sich die Warnungen von ${targetUser} angeschaut`,
    );
    
  }
  if (commandName === "warn-remove") {
    const targetUser = options.getUser("nutzer");
    const index = options.getInteger("nummer") - 1;
    if (!moderationData.warns[targetUser.id]?.[index]) {
      return interaction.reply({
        content: "❌ Ungültige Warn-Nummer.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const removed = moderationData.warns[targetUser.id].splice(index, 1);
    await setMData("moderation", moderationData);
    await interaction.reply({
      content: "✅ Warnung entfernt.",
      flags: [MessageFlags.Ephemeral],
    });
    await sendModLog(
      "Warn entfernt",
      targetUser,
      `Grund war: ${removed[0].reason}`,
    );
    console.log(
      `${user.username} hat ${targetUser} für ${removed[0].reason} entwarnt`,
    );
    
  }
  if (commandName === "top") {
    const sorted = Object.entries(countingData.scoreboard || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const embed = new EmbedBuilder()
      .setTitle(":trophy: Top 10 Counter")
      .setDescription(
        sorted.map(([id, s], i) => `${i + 1}. <@${id}> • ${s}`).join("\n") ||
          "Keine Daten",
      )
      .setColor("#ffffff")
      .setFooter({ text: "Kekse Clan" });
    await interaction.reply({ embeds: [embed] });
    console.log(`${user.username} hat die "top"-Funktion genutzt`);
    
  }
  if (commandName === "set-number") {
    if (user.id !== config.users.sysadmin) {
      return interaction.reply({
        content: ":x: Nur der Haupt-Admin darf diesen Befehl nutzen.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const newNum = options.getInteger("nummer");
    await loadCounting();
    countingData.currentNumber = newNum;
    countingData.direction = newNum < 0 ? -1 : 1;
    await saveCounting();
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: user.username,
          iconURL: user.displayAvatarURL({ size: 512 }),
        })
        .setDescription(
          `**Aktion:** \`Counting Reset (Admin)\`\nDie Zahl wurde manuell auf **${newNum}** gesetzt.`,
        )
        .setFooter({ text: "Kekse Bot | Counting System" })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
    await interaction.reply({
      content: ` Die nächste Zahl wurde auf **${newNum}** gesetzt.`,
      flags: [MessageFlags.Ephemeral],
    });
    console.log(
      `${user.username} hat die Zahl im Counting auf ${newNum} gesetzt`,
    );
    
  }
  if (commandName === "daily-setup") {
    if (user.id !== config.users.sysadmin) {
      return interaction.reply({
        content: "Du hast keine Berechtigung diesen Befehl zu nutzen.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const setupId = options.getString("id");
    const description =
      options.getString("beschreibung") ||
      "Hole dir hier deine täglichen Kekse ab!";
    await setEcoData(`setup_${setupId}`, {
      description: description,
      exists: true,
    });
    const embed = new EmbedBuilder()
      .setTitle(":cookie: Tägliche Kekse")
      .setDescription(
        `${description}\n\nKlicke auf den Button unten, um 100 Kekse zu erhalten.`,
      )
      .setColor(0xffffff);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`daily_claim_${setupId}`)
        .setLabel("Kekse abholen")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🍪"),
    );
    await currentChannel.send({ embeds: [embed], components: [row] });
    console.log(
      `[Economy] Neues Daily Setup erstellt. (daily_claim_${setupId})`,
    );
    await interaction.reply({
      content: ":white_check_box: Daily Setup erfolgreich platziert.",
      flags: [MessageFlags.Ephemeral],
    });
    console.log(`${user.username} hat ein neues Daily-Setup erstellt`);
    
  }
  if (commandName === "casino") {
    if (channelId !== config.channels.casino) {
      return interaction.reply({
        content: `Das Casino ist nur in <#${config.channels.casino}> nutzbar.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    const listEmbed = new EmbedBuilder()
      .setTitle("🎲 Kekse Clan Casino")
      .setDescription(
        "Hier sind alle Befehle, die du direkt im Chat eingeben kannst:\n\n" +
          "**/roulette** `<Einsatz>` `<Wettart>` - Setze auf Farben, Zahlen oder Bereiche\n" +
          "**/coinflip** `<Einsatz>` `<Kopf/Zahl>` - Setze auf das Ergebnis eines Münzwurfs\n" +
          "**/jackpot** `<Einsatz>` - Tritt dem globalen Pott bei\n" +
          "**/crash** `<Einsatz>` - Cashing out bevor die Rakete explodiert\n" +
          "**/highlow** `<Einsatz>` - Errate die nächste Karte\n" +
          "**/blackjack** `<Einsatz>` - Gewinne im Kartenspiel gegen den Dealer\n" +
          "**/slot** `<Einsatz>` - Drehe an der Slotmaschine",
      )
      .setColor("#ffffff");
    return interaction.reply({ embeds: [listEmbed] });
  }
  if (
    [
      "roulette",
      "coinflip",
      "jackpot",
      "crash",
      "highlow",
      "blackjack",
      "slot",
    ].includes(commandName)
  ) {
    const hasEcoRole = member.roles.cache.has(config.roles.economy);
    if (!hasEcoRole) {
      return interaction.reply({
        content:
          "Du benötigst ein Bankkonto, um am Casino teilzunehmen. Nutze `/bank create`.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    if (channelId !== config.channels.casino) {
      return interaction.reply({
        content: `Das Casino ist nur in <#${config.channels.casino}> nutzbar.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    const userData = await getEcoData(user.id);
    if (userData.blocked) {
      return interaction.reply({
        content: "Dein Konto ist gesperrt. Bitte wende dich an den Support.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const betAmount = options.getInteger("einsatz");
    if (betAmount <= 0) {
      return interaction.reply({
        content: "Bitte gib einen gültigen Einsatz über 0 an.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    if (betAmount > (userData.balance || 0)) {
      return interaction.reply({
        content: "Du hast nicht genug Kekse für diesen Einsatz.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    if (commandName === "roulette") {
      const betType = options.getString("typ").toLowerCase();
      const redNumbers = new Set([
        1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
      ]);
      const spin = Math.floor(Math.random() * 37);
      const spinColor =
        spin === 0 ? "green" : redNumbers.has(spin) ? "red" : "black";
      const spinEmoji = spin === 0 ? "🟢" : spinColor === "red" ? "🔴" : "⚫";
      let won = false;
      let payout = 0;
      let betDesc = betType;
      const numBet = parseInt(betType);
      if (!isNaN(numBet) && numBet >= 0 && numBet <= 36) {
        won = spin === numBet;
        payout = won ? betAmount * 35 : -betAmount;
        betDesc = `Zahl ${numBet}`;
      } else if (betType === "red") {
        won = spinColor === "red";
        payout = won ? betAmount : -betAmount;
        betDesc = "🔴 Rot";
      } else if (betType === "black") {
        won = spinColor === "black";
        payout = won ? betAmount : -betAmount;
        betDesc = "⚫ Schwarz";
      } else if (betType === "even") {
        won = spin !== 0 && spin % 2 === 0;
        payout = won ? betAmount : -betAmount;
        betDesc = "Gerade";
      } else if (betType === "odd") {
        won = spin % 2 !== 0;
        payout = won ? betAmount : -betAmount;
        betDesc = "Ungerade";
      } else if (betType === "1-18") {
        won = spin >= 1 && spin <= 18;
        payout = won ? betAmount : -betAmount;
        betDesc = "1-18";
      } else if (betType === "19-36") {
        won = spin >= 19 && spin <= 36;
        payout = won ? betAmount : -betAmount;
        betDesc = "19-36";
      } else {
        return interaction.reply({
          content:
            "Ungültige Wettart. Nutze: `red`, `black`, `even`, `odd`, eine Zahl (0–36), `1-18` oder `19-36`.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      userData.balance = (userData.balance || 0) + payout;
      await logTransaction(
        user.id,
        payout,
        payout >= 0 ? "plus" : "minus",
        "Casino Roulette",
      );
      await setEcoData(user.id, userData);
      const roulEmbed = new EmbedBuilder()
        .setTitle("Roulette")
        .setDescription(
          `Die Kugel landet auf: **${spinEmoji} ${spin}**\n\nDeine Wette: **${betDesc}** | Einsatz: **${betAmount} Kekse**`,
        )
        .addFields({
          name: won ? "✅ Gewonnen!" : "❌ Verloren!",
          value: `${payout >= 0 ? "+" : ""}${payout} Kekse\nNeuer Kontostand: **${userData.balance} Kekse**`,
        })
        .setColor(0x333333);
      return interaction.reply({ embeds: [roulEmbed] });
    }
    if (commandName === "coinflip") {
      const choice = options.getString("seite");
      const flip = Math.random() < 0.5 ? "heads" : "tails";
      const won = flip === choice;
      userData.balance =
        (userData.balance || 0) + (won ? betAmount : -betAmount);
      await logTransaction(
        user.id,
        betAmount,
        won ? "plus" : "minus",
        "Casino Coinflip",
      );
      await setEcoData(user.id, userData);
      const cfEmbed = new EmbedBuilder()
        .setTitle(`Coinflip`)
        .setDescription(
          `Die Münze zeigt: **${flip === "heads" ? "Kopf (Heads)" : "Zahl (Tails)"}**\n\nDu hast auf **${choice === "heads" ? "Kopf" : "Zahl"}** gesetzt.`,
        )
        .addFields({
          name: won ? "✅ Gewonnen!" : "❌ Verloren!",
          value: `${won ? "+" : "-"}${betAmount} Kekse\nNeuer Kontostand: **${userData.balance} Kekse**`,
        })
        .setColor(0x333333);
      return interaction.reply({ embeds: [cfEmbed] });
    }
    if (commandName === "jackpot") {
      if (jackpotState.entries.find((e) => e.userId === user.id)) {
        return interaction.reply({
          content: "Du bist bereits im Jackpot! Warte auf die Ziehung.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      userData.balance -= betAmount;
      await logTransaction(user.id, betAmount, "minus", "Casino Jackpot");
      await setEcoData(user.id, userData);
      jackpotState.entries.push({
        userId: user.id,
        username: user.username,
        betAmount,
      });
      jackpotState.totalPool += betAmount;
      const buildJackpotEmbed = (extra = "") => {
        const list = jackpotState.entries
          .map((e) => {
            const pct = ((e.betAmount / jackpotState.totalPool) * 100).toFixed(
              1,
            );
            return `<@${e.userId}> - **${e.betAmount} Kekse** (${pct}%)`;
          })
          .join("\n");
        return new EmbedBuilder()
          .setTitle("Jackpot")
          .setDescription(
            `**Pool: ${jackpotState.totalPool} Kekse**\n\n${extra}`,
          )
          .addFields({
            name: `Teilnehmer (${jackpotState.entries.length})`,
            value: list || "Keine",
          })
          .setColor(0xffffff)
          .setFooter({
            text: "Je mehr du einsetzt, desto höher deine Gewinnchance!",
          });
      };
      const casinoChannel = guild.channels.cache.get(config.channels.casino);
      if (!jackpotState.countdownTimer) {
        const drawTime = Date.now() + 5 * 60 * 1000;
        jackpotState.countdownEndTime = drawTime;
        jackpotState.countdownTimer = setTimeout(
          () => runJackpotDraw(casinoChannel),
          5 * 60 * 1000,
        );
      }
      const timestamp = `<t:${Math.floor(jackpotState.countdownEndTime / 1000)}:R>`;
      const extraText = `Ziehung ${timestamp}`;
      if (jackpotState.entries.length === 1) {
        const jMsg = await casinoChannel.send({
          embeds: [buildJackpotEmbed(extraText)],
        });
        jackpotState.announceMessage = jMsg;
      } else if (jackpotState.announceMessage) {
        await jackpotState.announceMessage
          .edit({ embeds: [buildJackpotEmbed(extraText)] })
          .catch(() => {});
      }
      const userChance = ((betAmount / jackpotState.totalPool) * 100).toFixed(
        1,
      );
      return interaction.reply({
        content: `Du bist dem Jackpot beigetreten! Einsatz: **${betAmount} Kekse** (${userChance}% Chance)\nPool: **${jackpotState.totalPool} Kekse**\nZiehung findet ${timestamp} statt.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
    if (commandName === "crash") {
      if (crashGames.has(user.id)) {
        return interaction.reply({
          content: "Du hast bereits ein aktives Crash-Spiel!",
          flags: [MessageFlags.Ephemeral],
        });
      }
      userData.balance -= betAmount;
      await logTransaction(user.id, betAmount, "minus", "Casino Crash");
      await setEcoData(user.id, userData);
      const crashPoint = parseFloat(
        Math.max(1.01, 0.97 / (1 - Math.random())).toFixed(2),
      );
      let multiplier = 1.0;
      let intervalHandle = null;
      const cashoutRow = () =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`crash_cashout_${user.id}`)
            .setLabel(`Cash Out (${Math.floor(betAmount * multiplier)} Kekse)`)
            .setStyle(ButtonStyle.Success),
        );
      const crashEmbed = (crashed = false, cashedAt = null) => {
        if (crashed)
          return new EmbedBuilder()
            .setTitle("💥 CRASH!")
            .setDescription(
              `Gecrasht bei **${crashPoint.toFixed(2)}x**!\n\nEinsatz: **${betAmount} Kekse** - **Verloren!**\nNeuer Kontostand: **${userData.balance} Kekse**`,
            )
            .setColor(0x333333);
        if (cashedAt !== null) {
          const win = Math.floor(betAmount * cashedAt);
          return new EmbedBuilder()
            .setTitle("💰 Cash Out!")
            .setDescription(
              `Ausgecasht bei **${cashedAt.toFixed(2)}x**!\n\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${userData.balance} Kekse**`,
            )
            .setColor(0x333333);
        }
        return new EmbedBuilder()
          .setTitle("Crash")
          .setDescription(
            `**${multiplier.toFixed(2)}x** - Steigt noch…\n\nEinsatz: **${betAmount} Kekse**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**\n\nDrücke **Cash Out** bevor die Rakete crasht!`,
          )
          .setColor(0xffffff);
      };
      const gameMsg = await interaction.reply({
        embeds: [crashEmbed()],
        components: [cashoutRow()],
        fetchReply: true,
      });
      crashGames.set(user.id, {
        betAmount,
        crashPoint,
        cashedOut: false,
        cashedAtMultiplier: null,
      });
      const collector = gameMsg.createMessageComponentCollector({
        filter: (i) =>
          i.user.id === user.id && i.customId === `crash_cashout_${user.id}`,
        componentType: ComponentType.Button,
        time: 120000,
      });
      collector.on("collect", async (i) => {
        const game = crashGames.get(user.id);
        if (!game || game.cashedOut) {
          await i
            .reply({
              content: "Zu spät - das Spiel ist bereits beendet!",
              flags: [MessageFlags.Ephemeral],
            })
            .catch(() => {});
          return;
        }
        game.cashedOut = true;
        game.cashedAtMultiplier = multiplier;
        if (intervalHandle) clearInterval(intervalHandle);
        crashGames.delete(user.id);
        collector.stop("cashout");
        const win = Math.floor(betAmount * game.cashedAtMultiplier);
        const fresh = await getEcoData(user.id);
        fresh.balance = (fresh.balance || 0) + win;
        userData.balance = fresh.balance;
        await logTransaction(user.id, win, "plus", "Casino Crash");
        await setEcoData(user.id, fresh);
        await i
          .update({
            embeds: [crashEmbed(false, game.cashedAtMultiplier)],
            components: [],
          })
          .catch(() => {});
      });
      intervalHandle = setInterval(async () => {
        const game = crashGames.get(user.id);
        if (!game) {
          clearInterval(intervalHandle);
          return;
        }
        multiplier = parseFloat((multiplier + 0.2).toFixed(2));
        if (multiplier >= game.crashPoint) {
          clearInterval(intervalHandle);
          crashGames.delete(user.id);
          collector.stop("crashed");
          await gameMsg
            .edit({ embeds: [crashEmbed(true)], components: [] })
            .catch(() => {});
          return;
        }
        await gameMsg
          .edit({ embeds: [crashEmbed()], components: [cashoutRow()] })
          .catch(() => {});
        }, 1500);
      collector.on("end", async (collected, reason) => {
        if (reason === "time") {
          clearInterval(intervalHandle);
          const game = crashGames.get(user.id);
          if (game && !game.cashedOut) {
            crashGames.delete(user.id);
            await gameMsg
              .edit({ embeds: [crashEmbed(true)], components: [] })
              .catch(() => {});
          }
        }
      });
      return;
    }
    if (commandName === "highlow") {
      if (hlGames.has(user.id)) {
        return interaction.reply({
          content: "Du hast bereits ein aktives Higher/Lower-Spiel!",
          flags: [MessageFlags.Ephemeral],
        });
      }
      const todayStr = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
      if (userData.hl_cooldown_date !== todayStr) {
        userData.hl_cooldown_date = todayStr;
        userData.hl_today_count = 0;
      }
      if ((userData.hl_today_count || 0) >= 5) {
        return interaction.reply({
          content: "Du hast dein Limit von **5 Higher/Lower-Spielen** für heute bereits erreicht! Komm morgen wieder.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      userData.hl_today_count = (userData.hl_today_count || 0) + 1;
      userData.balance -= betAmount;
      await logTransaction(user.id, betAmount, "minus", "Casino Higher Lower");
      await setEcoData(user.id, userData);
      hlGames.set(user.id, true);
      const cardNames = [
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "J",
        "Q",
        "K",
        "A",
      ];
      const cardVals = {
        2: 2,
        3: 3,
        4: 4,
        5: 5,
        6: 6,
        7: 7,
        8: 8,
        9: 9,
        10: 10,
        J: 11,
        Q: 12,
        K: 13,
        A: 14,
      };
      const suits = ["♠️", "♥️", "♦️", "♣️"];
      const getCard = () => {
        const n = cardNames[Math.floor(Math.random() * cardNames.length)];
        return {
          display: `${n}${suits[Math.floor(Math.random() * 4)]}`,
          value: cardVals[n],
        };
      };
      let currentCard = getCard();
      let streak = 0;
      let multiplier = 1.0;
      const hlRow = (disabled = false) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`hl_higher_${user.id}`)
            .setLabel("Higher")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(`hl_lower_${user.id}`)
            .setLabel("Lower")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
          new ButtonBuilder()
            .setCustomId(`hl_cashout_${user.id}`)
            .setLabel(`Cash Out (${Math.floor(betAmount * multiplier)} Kekse)`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled || streak === 0),
        );
      const hlEmbed = (desc, color = 0xffffff) =>
        new EmbedBuilder()
          .setTitle("Higher or Lower")
          .setDescription(desc)
          .setColor(color);
      const gameMsg = await interaction.reply({
        embeds: [
          hlEmbed(
            `Aktuelle Karte: **${currentCard.display}**\n\nStreak: **0** | Multiplikator: **1.00x**\nMöglicher Gewinn: **${betAmount} Kekse**\n\nIst die nächste Karte höher oder niedriger?`,
          ),
        ],
        components: [hlRow()],
        fetchReply: true,
      });
      const collector = gameMsg.createMessageComponentCollector({
        filter: (i) => i.user.id === user.id,
        componentType: ComponentType.Button,
        time: 90000,
      });
      collector.on("collect", async (i) => {
        await i.deferUpdate();
        const id = i.customId;
        if (id === `hl_cashout_${user.id}`) {
          collector.stop("cashout");
          return;
        }
        const nextCard = getCard();
        const choice = id.startsWith(`hl_higher`) ? "higher" : "lower";
        const isTie = nextCard.value === currentCard.value;
        const correct =
          !isTie &&
          ((choice === "higher" && nextCard.value > currentCard.value) ||
            (choice === "lower" && nextCard.value < currentCard.value));
        if (isTie) {
          currentCard = nextCard;
          await gameMsg
            .edit({
              embeds: [
                hlEmbed(
                  `Unentschieden! Neue Karte: **${nextCard.display}**\nStreak: **${streak}** | Multiplikator: **${multiplier.toFixed(2)}x**`,
                ),
              ],
              components: [hlRow()],
            })
            .catch(() => {});
          return;
        }
        if (correct) {
          streak++;
          multiplier = parseFloat((multiplier + 0.5).toFixed(2));
          currentCard = nextCard;
          await gameMsg
            .edit({
              embeds: [
                hlEmbed(
                  `Richtig! Nächste Karte war **${nextCard.display}**\n\nAktuelle Karte: **${currentCard.display}**\nStreak: **${streak}** | Multiplikator: **${multiplier.toFixed(2)}x**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**`,
                  0xffffff,
                ),
              ],
              components: [hlRow()],
            })
            .catch(() => {});
        } else {
          collector.stop("wrong");
        }
      });
      collector.on("end", async (collected, reason) => {
        hlGames.delete(user.id);
        const fresh = await getEcoData(user.id);
        if (reason === "cashout") {
          const win = Math.floor(betAmount * multiplier);
          fresh.balance = (fresh.balance || 0) + win;
          await logTransaction(user.id, win, "plus", "Casino Higher Lower");
          await setEcoData(user.id, fresh);
          await gameMsg
            .edit({
              embeds: [
                hlEmbed(
                  `Cash Out bei **${multiplier.toFixed(2)}x**!\n\n**+${win - betAmount} Kekse** Gewinn\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                  0x333333,
                ),
              ],
              components: [],
            })
            .catch(() => {});
        } else if (reason === "wrong") {
          await gameMsg
            .edit({
              embeds: [
                hlEmbed(
                  `❌ Falsch! Du hast **${betAmount} Kekse** verloren.\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                  0x333333,
                ),
              ],
              components: [],
            })
            .catch(() => {});
        } else {
          if (streak > 0) {
            const win = Math.floor(betAmount * multiplier);
            fresh.balance = (fresh.balance || 0) + win;
            await logTransaction(user.id, win, "plus", "Casino Higher Lower");
            await setEcoData(user.id, fresh);
            await gameMsg
              .edit({
                embeds: [
                  hlEmbed(
                    `Zeit abgelaufen! Auto Cash-Out bei **${multiplier.toFixed(2)}x**\n**+${win - betAmount} Kekse**\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                    0x333333,
                  ),
                ],
                components: [],
              })
              .catch(() => {});
          } else {
            await gameMsg
              .edit({
                embeds: [
                  hlEmbed(
                    `Zeit abgelaufen! **${betAmount} Kekse** verloren.\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                    0x333333,
                  ),
                ],
                components: [],
              })
              .catch(() => {});
          }
        }
      });
      return;
    }
    if (commandName === "slot") {
      const result = playSlot(betAmount);
      userData.balance = (userData.balance || 0) + result.payout;
      if (result.payout !== 0) {
        logTransaction(
          user.id,
          Math.abs(result.payout),
          result.payout > 0 ? "plus" : "minus",
          "Casino Slot",
        );
      }
      await setEcoData(user.id, userData);
      console.log(`${user.username} hat die Slotmaschine gespielt (${result.payout} Kekse).`);
      return interaction.reply({
        embeds: [buildSlotEmbed(result, betAmount, userData.balance)],
      });
    }
    if (commandName === "blackjack") {
      const suits = ["♠️", "♥️", "♦️", "♣️"];
      const values = [
        { n: "2", v: 2 },
        { n: "3", v: 3 },
        { n: "4", v: 4 },
        { n: "5", v: 5 },
        { n: "6", v: 6 },
        { n: "7", v: 7 },
        { n: "8", v: 8 },
        { n: "9", v: 9 },
        { n: "10", v: 10 },
        { n: "J", v: 10 },
        { n: "Q", v: 10 },
        { n: "K", v: 10 },
        { n: "A", v: 11 },
      ];
      let deck = [];
      for (const suit of suits) {
        for (const val of values) {
          deck.push({ name: `${val.n}${suit}`, value: val.v });
        }
      }
      deck = deck.sort(() => Math.random() - 0.5);
      const playerHand = [deck.pop(), deck.pop()];
      const dealerHand = [deck.pop(), deck.pop()];
      const calculateScore = (hand) => {
        let score = hand.reduce((sum, card) => sum + card.value, 0);
        let aces = hand.filter((card) => card.name.startsWith("A")).length;
        while (score > 21 && aces > 0) {
          score -= 10;
          aces--;
        }
        return score;
      };
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("bj_hit")
          .setLabel("Karte ziehen (Hit)")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("bj_stand")
          .setLabel("Halten (Stand)")
          .setStyle(ButtonStyle.Secondary),
      );
      const createEmbed = (title, color, showAllDealer = false) => {
        const pScore = calculateScore(playerHand);
        const dScore = showAllDealer
          ? calculateScore(dealerHand)
          : dealerHand[0].value;
        const pCards = playerHand.map((c) => c.name).join(" ");
        const dCards = showAllDealer
          ? dealerHand.map((c) => c.name).join(" ")
          : `${dealerHand[0].name} 🃏`;
        return new EmbedBuilder()
          .setTitle(title)
          .setColor(color)
          .setDescription(`Dein Einsatz: **${betAmount} Kekse**`)
          .addFields(
            { name: `Deine Hand (${pScore})`, value: pCards, inline: true },
            {
              name: `Dealer Hand (${showAllDealer ? dScore : dScore + " + ?"})`,
              value: dCards,
              inline: true,
            },
          );
      };
      if (calculateScore(playerHand) === 21) {
        let dScore = calculateScore(dealerHand);
        let status = "";
        let finalColor = 0x333333;
        if (dScore === 21) {
          status = "Beide haben Blackjack! Unentschieden.";
        } else {
          status = "Echter Blackjack! Du gewinnst das 1.5-fache!";
          userData.balance += Math.floor(betAmount * 1.5);
          await logTransaction(
            user.id,
            Math.floor(betAmount * 1.5),
            "plus",
            "Casino Blackjack",
          );
        }
        await setEcoData(user.id, userData);
        const finalEmbed = createEmbed(
          `Blackjack - ${status}`,
          finalColor,
          true,
        ).setFooter({ text: `Neuer Kontostand: ${userData.balance} Kekse` });
        return interaction.reply({ embeds: [finalEmbed] });
      }
      const gameMessage = await interaction.reply({
        embeds: [createEmbed("Blackjack", 0xffffff)],
        components: [row],
        fetchReply: true,
      });
      const collector = gameMessage.createMessageComponentCollector({
        filter: (i) => i.user.id === user.id,
        componentType: ComponentType.Button,
        time: 60000,
      });
      collector.on("collect", async (i) => {
        await i.deferUpdate();
        if (i.customId === "bj_hit") {
          playerHand.push(deck.pop());
          if (calculateScore(playerHand) >= 21) {
            collector.stop(
              calculateScore(playerHand) > 21 ? "busted" : "stand",
            );
          } else {
            await gameMessage.edit({
              embeds: [createEmbed("Blackjack", 0xffffff)],
            });
          }
        }
        if (i.customId === "bj_stand") {
          collector.stop("stand");
        }
      });
      collector.on("end", async (collected, reason) => {
        const userData = await getEcoData(user.id);
        let pScore = calculateScore(playerHand);
        let dScore = calculateScore(dealerHand);
        let status = "";
        let finalColor = 0x333333;
        if (reason !== "busted") {
          while (dScore < 17) {
            dealerHand.push(deck.pop());
            dScore = calculateScore(dealerHand);
          }
        }
        if (reason === "busted" || pScore > 21) {
          status = "❌ Überkauft! Du hast verloren.";
          userData.balance -= betAmount;
          await logTransaction(user.id, betAmount, "minus", "Casino Blackjack");
        } else if (dScore > 21) {
          status = "🎉 Dealer überkauft! Du gewinnst!";
          userData.balance += betAmount;
          await logTransaction(user.id, betAmount, "plus", "Casino Blackjack");
        } else if (pScore > dScore) {
          status = "🎉 Mehr Punkte als der Dealer. Du gewinnst!";
          userData.balance += betAmount;
          await logTransaction(user.id, betAmount, "plus", "Casino Blackjack");
        } else if (pScore < dScore) {
          status = "❌ Dealer hat mehr Punkte. Verloren!";
          userData.balance -= betAmount;
          await logTransaction(user.id, betAmount, "minus", "Casino Blackjack");
        } else {
          status = "🤝 Unentschieden! Kekse zurück.";
        }
        await setEcoData(user.id, userData);
        const finalEmbed = createEmbed(
          `Blackjack - ${status}`,
          finalColor,
          true,
        ).setFooter({ text: `Neuer Kontostand: ${userData.balance} Kekse` });
        await gameMessage.edit({ embeds: [finalEmbed], components: [] });
      });
      return;
    }
  }
  if (commandName === "bank") {
    const subCommand = options.getSubcommand();
    const hasEcoRole = member.roles.cache.has(config.roles.economy);
    if (subCommand === "create") {
      if (hasEcoRole) {
        return interaction.reply({
          content: "Du besitzt bereits ein registriertes Bankkonto.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_bank_modal_${user.id}`)
          .setLabel("Registrierungsformular öffnen")
          .setStyle(ButtonStyle.Primary),
      );
      return interaction.reply({
        content:
          "Klicke auf den Button unten, um dein Konto zu erstellen. Dieser Button funktioniert nur für dich.",
        components: [row],
        flags: [MessageFlags.Ephemeral],
      });
      console.log(`${user.username} hat eine Konto-Erstellung gestartet`);
    }
    if (subCommand === "help") {
      const helpEmbed = new EmbedBuilder()
        .setTitle("🏦 Bank-System Hilfe")
        .setColor(0xffffff)
        .setDescription("Hier findest du alle verfügbaren Befehle:")
        .addFields(
          {
            name: "`/bank create`",
            value:
              "Erstellt dein persönliches Bankkonto (Erfordert Minecraft-Namen).",
          },
          {
            name: "`/bank status`",
            value: "Zeigt dir deinen aktuellen Kontostand (Privat für dich).",
          },
          {
            name: "`/bank pay`",
            value: "Überträgt Kekse sicher auf das Konto eines Mitspielers.",
          },
        );
      return interaction.reply({
        embeds: [helpEmbed],
        flags: [MessageFlags.Ephemeral],
      });
      console.log(`${user.username} hat die "bank help"-Funktion genutzt`);
    }
    if (subCommand === "pay") {
      const targetUser = options.getUser("nutzer");
      const amount = options.getInteger("anzahl");
      const userData = await getEcoData(user.id);
      if (amount <= 0) {
        return interaction.reply({
          content: "Bitte gib eine gültige Anzahl an Keksen an.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (targetUser.id === user.id) {
        return interaction.reply({
          content: "Du kannst dir selbst keine Kekse überweisen.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (amount > (userData.balance || 0)) {
        return interaction.reply({
          content: "Du hast nicht genug Kekse für diese Überweisung.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      const targetData = await getEcoData(targetUser.id);
      if (!targetData || !targetData.username || targetData.blocked) {
        return interaction.reply({
          content: "Der Zielnutzer hat kein aktives Konto oder ist gesperrt.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      userData.balance -= amount;
      targetData.balance = (targetData.balance || 0) + amount;
      await logTransaction(
        user.id,
        amount,
        "minus",
        `Pay an ${targetData.username}`,
      );
      await logTransaction(
        targetUser.id,
        amount,
        "plus",
        `Pay von ${userData.username}`,
      );
      await setEcoData(user.id, userData);
      await setEcoData(targetUser.id, targetData);
      console.log(
        `[Economy] Überweisung von ${userData.username || user.username} an ${targetData.username || targetUser.id} für ${amount} Kekse.`,
      );
      const payEmbed = new EmbedBuilder()
        .setTitle("Überweisung erfolgreich")
        .setDescription(
          `Du hast **${amount} Kekse** an <@${targetUser.id}> überwiesen.`,
        )
        .addFields({
          name: "Neuer Kontostand",
          value: `${userData.balance} Kekse`,
        })
        .setColor(0xffffff);
      const getEmbed = new EmbedBuilder()
        .setTitle("Kekse erhalten!")
        .setDescription(
          `Du hast **${amount} Kekse** von <@${user.id}> erhalten.`,
        )
        .addFields({
          name: "Neuer Kontostand",
          value: `${targetData.balance} Kekse`,
        })
        .setColor(0xffffff);
      await interaction.reply({
        embeds: [payEmbed],
        flags: [MessageFlags.Ephemeral],
      });
      await targetUser.send({ embeds: [getEmbed] }).catch(() => {
        console.log(`Konnte keine DM an ${targetUser.id} senden.`);
      });
      return;
    }
    if (subCommand === "status") {
      if (!hasEcoRole) {
        return interaction.reply({
          content:
            "Du hast noch kein Konto. Nutze `/bank create`, um dich zu registrieren.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      const userData = await getEcoData(user.id);
      if (userData.blocked) {
        return interaction.reply({
          content:
            "Dein Konto ist aktuell gesperrt. Bitte wende dich an den Support.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      await user
        .send({
          content: `Dein aktueller Kontostand beträgt: **${userData.balance || 0} Kekse** 🍪`,
        })
        .catch(() => {});
      return interaction.reply({
        content: "✅ Dein aktueller Kontostand wurde dir per DM zugestellt.",
        flags: [MessageFlags.Ephemeral],
      });
      console.log(`${user.username} hat seinen Kontostand eingesehen.`);
    }
  }
  if (commandName === "bank-admin") {
    const subCommand = options.getSubcommand();
    const isDev = user.id === config.users.sysadmin;
    if (
      !member.permissions.has(PermissionsBitField.Flags.ManageServer) &&
      !isDev
    ) {
      return interaction.reply({
        content: "❌ Dieser Befehl ist der Serverleitung vorbehalten.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const amount = options.getInteger("anzahl");
    const targetUser = options.getUser("nutzer") || user;
    if (amount <= 0) {
      return interaction.reply({
        content: "Bitte gib eine gültige Anzahl an Keksen an.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const targetData = await getEcoData(targetUser.id);
    let currentBalance = targetData.balance || 0;
    if (subCommand === "add") {
      currentBalance += amount;
      console.log(`${user.username} hat sich ${amount} Kekse hinzugefügt`);
    } else if (subCommand === "remove") {
      currentBalance = Math.max(0, currentBalance - amount);
      console.log(`${user.username} hat sich ${amount} Kekse entfernt`);
    }
    targetData.balance = currentBalance;
    await setEcoData(targetUser.id, targetData);
    const logEmbed = new EmbedBuilder()
      .setTitle("Konto-Aktualisierung")
      .setDescription(`Konto von <@${targetUser.id}> wurde aktualisiert.`)
      .addFields(
        {
          name: "Aktion",
          value: subCommand === "add" ? `+${amount} Kekse` : `-${amount} Kekse`,
        },
        { name: "Neuer Kontostand", value: `${currentBalance} Kekse` },
      )
      .setColor(0xffffff);
    await user.send({ embeds: [logEmbed] }).catch(() => {});
    return interaction.reply({
      content: `✅ Das Konto von <@${targetUser.id}> wurde erfolgreich modifiziert.`,
      flags: [MessageFlags.Ephemeral],
    });
  }
  if (commandName === "bank-mod") {
    const subCommand = options.getSubcommand();
    const isDev = user.id === config.users.sysadmin;
    if (
      !member.permissions.has(PermissionsBitField.Flags.ManageMessages) &&
      !member.permissions.has(PermissionsBitField.Flags.ManageServer) &&
      !isDev
    ) {
      return interaction.reply({
        content:
          "❌ Du hast keine Berechtigung, um Kontoinformationen einzusehen.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    if (subCommand === "see") {
      const targetUser = options.getUser("nutzer");
      const data = await getEcoData(targetUser.id);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Konto-Details von ${targetUser.username}`)
        .setColor(0xffffff)
        .addFields(
          { name: "User ID", value: data.userId || targetUser.id },
          { name: "Discord Name", value: data.username || "Kein Name" },
          {
            name: "Minecraft Name",
            value: data.mcUsername || "Nicht registriert",
          },
          { name: "Kontostand", value: `${data.balance || 0} Kekse` },
          { name: "Gesperrt?", value: data.blocked ? "Ja" : "Nein" },
        );
      await user.send({ embeds: [dmEmbed] }).catch(() => {});
      return interaction.reply({
        content: `✅ Die Kontodetails von ${targetUser.username} wurden dir per DM zugestellt.`,
        flags: [MessageFlags.Ephemeral],
      });
      console.log(
        `${user.username} hat den Kontostand von ${targetUser.username} eingesehen`,
      );
    }
    if (subCommand === "get") {
      const existingKekse = await initEconomyGetKekse(client);
      return interaction.reply({
        content: `Es sind aktuell ${existingKekse} Kekse im Umlauf.`,
        flags: [MessageFlags.Ephemeral],
      });
      console.log(`${user.username} hat die "bank get"-Funktion genutzt`);
    }
  }
  if (commandName === "remind") {
    const timeStr = options.getString("zeit");
    const reason = options.getString("grund");
    const ms = parseTimeframe(timeStr);
    if (!ms || ms < 10000) {
      return interaction.reply({
        content:
          "❌ Ungültige Zeitangabe. Mindestens 10 Sekunden (z.B. 10s, 5m, 1h, 2d).",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const reminderData = (await getRData("reminders")) || { reminders: [] };
    const newReminder = {
      userId: user.id,
      channelId: currentChannel.id,
      time: Date.now() + ms,
      reason: reason,
    };
    reminderData.reminders.push(newReminder);
    await setRData("reminders", reminderData);
    console.log(`${user.username} hat einen Reminder für sich gestartet`);
    await interaction.reply({
      content: `✅ Ich werde dich in **${timeStr}** an folgendes erinnern: ${reason}`,
      ephemeral: false,
    });
    const logChannel = client.channels.cache.get(config.channels.logs);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: user.username,
          iconURL: user.displayAvatarURL({ size: 512 }),
        })
        .setDescription(
          `**Aktion:** \`Reminder gesetzt\`\n**Zeitraum:** ${timeStr}\n**Grund:** ${reason}`,
        )
        .setFooter({ text: "Kekse Bot | Reminder System" })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
    
  }
  if (commandName === "zweitaccount") {
    if (
      !member.roles.cache.has(config.roles.team) &&
      !member.permissions.has(PermissionsBitField.Flags.ManageMessages)
    ) {
      return interaction.reply({
        content: "❌ Keine Berechtigung.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    const subCommand = options.getSubcommand();
    let networks = (await getSaData("alt_networks")) || {};
    if (subCommand === "add") {
      const input1 = options.getString("account_1").replace(/[<@!>]/g, "");
      const input2 = options.getString("account_2").replace(/[<@!>]/g, "");
      if (!/^\d{17,20}$/.test(input1) || !/^\d{17,20}$/.test(input2)) {
        return interaction.reply({
          content: "❌ Ungültige IDs oder Erwähnungen angegeben.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (input1 === input2) {
        return interaction.reply({
          content:
            "❌ Ein Account kann nicht mit sich selbst verknüpft werden.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      let list1 = networks[input1] || [];
      let list2 = networks[input2] || [];
      let allLinked = new Set([input1, input2, ...list1, ...list2]);
      const finalGroup = Array.from(allLinked);
      for (const id of finalGroup) {
        networks[id] = finalGroup.filter((uid) => uid !== id);
      }
      await setSaData("alt_networks", networks);
      await interaction.reply({
        content: `✅ Die Accounts <@${input1}> und <@${input2}> wurden erfolgreich verknüpft.`,
        flags: [MessageFlags.Ephemeral],
      });
      const logChannel = client.channels.cache.get(config.channels.logs);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#ffffff")
          .setAuthor({
            name: user.username,
            iconURL: user.displayAvatarURL({ size: 512 }),
          })
          .setDescription(
            `**Aktion:** \`Zweitaccount verknüpft\`\n**Accounts:** <@${input1}> und <@${input2}>\n**Gruppe Gesamt:** ${finalGroup.map((uid) => `<@${uid}>`).join(", ")}`,
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
      console.log(`${user.username} hat einen Zweitaccount verifiziert`);
      
    }
    if (subCommand === "remove") {
      const targetId = options.getString("nutzer").replace(/[<@!>]/g, "");
      if (!/^\d{17,20}$/.test(targetId)) {
        return interaction.reply({
          content: "❌ Ungültige ID oder Erwähnung angegeben.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      const linkedWith = networks[targetId];
      if (!linkedWith || linkedWith.length === 0) {
        return interaction.reply({
          content: "❌ Für diesen Account existieren keine Verknüpfungen.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      const fullGroup = [targetId, ...linkedWith];
      delete networks[targetId];
      for (const id of linkedWith) {
        if (networks[id]) {
          networks[id] = networks[id].filter((uid) => uid !== targetId);
          if (networks[id].length === 0) {
            delete networks[id];
          }
        }
      }
      await setSaData("alt_networks", networks);
      await interaction.reply({
        content: `✅ Der Account <@${targetId}> wurde aus dem Netzwerk gelöst.`,
        flags: [MessageFlags.Ephemeral],
      });
      const logChannel = client.channels.cache.get(config.channels.logs);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor("#ffffff")
          .setAuthor({
            name: user.username,
            iconURL: user.displayAvatarURL({ size: 512 }),
          })
          .setDescription(
            `**Aktion:** \`Zweitaccount entfernt\`\n**Account:** <@${targetId}>\n**Vorherige Gruppe:** ${fullGroup.map((uid) => `<@${uid}>`).join(", ")}`,
          )
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
      console.log(`${user.username} hat einen Zweitaccount entfernt`);
      
    }
  }
});
client.once("clientReady", async () => {
  setBotPresence();
  try {
    const mainGuild = await client.guilds.fetch(GUILD_ID);
    await mainGuild.members.fetch();
    await initCounting(client);
    registerMessageCommands(client);
    await initTickets(client);
    await initGiveaway(client);
    initPing(client);
    initReactions(client);
    initHelp(client);
    initTicketCategory(client);
    initVoiceChannels(client);
    initReminder(client);
    initModeration(client);
    initVerification(client);
    initRules(client);
    initAuditLogs(client);
    clear(client);
    initMembers(client);
    await initTicketArchive(app, getTickData, setTickData);
    startRetentionCleanup();
    await initEconomySystem(client);
    initAdminFun(client);
    await syncExistingUsers(client);
    await initInviteTracker(client);
    await setupVoiceModToggle(client);
    startVoiceXpTracker(client);
    wage().catch(console.error);
    setInterval(() => wage().catch(console.error), 60 * 1000);
    console.log(`Server-Sync gestartet...`);
    console.log(`Bot online: ${client.user.tag}`);
    await startStorages();
  } catch (err) {
    console.error("Kritischer Fehler beim Initialisieren:", err);
  }
  app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
  });
  try {
    const CUSTOM_BUTTON_ID = "toggle_voice_lock";
    const voiceChannel = await client.channels.fetch(config.channels.modVoice);
    if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) return;
    const messages = await voiceChannel.messages.fetch({ limit: 5 });
    const existingBotMessage = messages.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.components.some((row) =>
          row.components.some((comp) => comp.customId === CUSTOM_BUTTON_ID),
        ),
    );
    if (!existingBotMessage) {
      const currentOverwrites =
        voiceChannel.permissionOverwrites.cache.get(config.roles.team);
      const isLocked =
        currentOverwrites &&
        currentOverwrites.deny.has(PermissionFlagsBits.Connect);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(CUSTOM_BUTTON_ID)
          .setLabel(isLocked ? "Geschlossen" : "Geöffnet")
          .setStyle(isLocked ? ButtonStyle.Danger : ButtonStyle.Success),
      );
      await voiceChannel.send({
        content: "Status des Sprachkanals verwalten:",
        components: [row],
      });
    }
  } catch (error) {
    console.error(error);
  }
});
client.setMaxListeners(50);
client.on("error", console.error);
client.on("warn", console.warn);
dbConnection.then(async () => {
  await deploySlashCommands();
  client.login(process.env.BOT_TOKEN);
});
