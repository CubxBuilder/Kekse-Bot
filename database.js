import mongoose from "mongoose";
import "dotenv/config";
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI fehlt in der .env Datei!");
  process.exit(1);
}
export const dbConnection = mongoose
  .connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("MongoDB-Verbindung erfolgreich hergestellt."))
  .catch((err) => {
    console.error("MongoDB Verbindungsfehler:", err);
    process.exit(1);
  });
const storageSchema = new mongoose.Schema(
  {
    namespace: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { versionKey: false },
);
storageSchema.index({ namespace: 1, key: 1 }, { unique: true });
storageSchema.index({ namespace: 1, "value.balance": -1 });
const StorageModel = mongoose.model("BotStorage", storageSchema);
const CACHED_NS = new Set([
  "economy", "xp", "counting", "giveaways",
  "reminders", "sa", "polls", "wage", "moderation",
]);
const cache = new Map();
const dirty = new Map();
let flushTimer = null;
async function flush() {
  flushTimer = null;
  if (!dirty.size) return;
  const batch = [...dirty.entries()];
  dirty.clear();
  try {
    await StorageModel.bulkWrite(
      batch.map(([, { namespace, key, value }]) => ({
        updateOne: {
          filter: { namespace, key },
          update: { $set: { value } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (err) {
    console.error("Fehler beim Speichern (bulkWrite):", err);
    for (const [k, v] of batch) if (!dirty.has(k)) dirty.set(k, v);
    if (!flushTimer) flushTimer = setTimeout(flush, 2000);
  }
}
export async function flushNow() {
  clearTimeout(flushTimer);
  await flush();
}
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await flushNow();
    process.exit(0);
  });
}
export async function dbSet(namespace, key, value) {
  if (!CACHED_NS.has(namespace)) {
    try {
      await StorageModel.updateOne({ namespace, key }, { $set: { value } }, { upsert: true });
    } catch (err) {
      console.error(`Fehler beim Speichern (${namespace}:${key}):`, err);
    }
    return;
  }
  const k = `${namespace}:${key}`;
  const snapshot = structuredClone(value);
  cache.set(k, snapshot);
  dirty.set(k, { namespace, key, value: snapshot });
  if (!flushTimer) flushTimer = setTimeout(flush, 500);
}
export async function dbGet(namespace, key) {
  const k = `${namespace}:${key}`;
  const cached = CACHED_NS.has(namespace);
  if (cached && cache.has(k)) return structuredClone(cache.get(k));
  try {
    const entry = await StorageModel.findOne({ namespace, key }).lean();
    if (!entry) return null;
    if (cached) cache.set(k, structuredClone(entry.value));
    return entry.value;
  } catch (err) {
    console.error(`Fehler beim Abrufen (${namespace}:${key}):`, err);
    return null;
  }
}
