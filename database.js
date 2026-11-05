import mongoose from "mongoose";
import "dotenv/config";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI fehlt in der .env Datei!");
}

export const dbConnection = mongoose
  .connect(uri, {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(function () {
    console.log("MongoDB-Verbindung erfolgreich hergestellt.");
  })
  .catch(function (err) {
    console.error("MongoDB Verbindungsfehler:", err);
    process.exit(1);
  });

const storageSchema = new mongoose.Schema({
  namespace: { type: String, required: true },
  key: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
});

storageSchema.index({ namespace: 1, key: 1 }, { unique: true });
const StorageModel = mongoose.model("BotStorage", storageSchema);

export async function dbSet(namespace, key, value) {
  try {
    await StorageModel.updateOne({ namespace, key }, { $set: { value } }, { upsert: true });
  } catch (err) {
    console.error(`Fehler beim Speichern in MongoDB (${namespace}:${key}):`, err);
  }
}

export async function dbGet(namespace, key) {
  try {
    const entry = await StorageModel.findOne({ namespace, key }).lean();
    return entry ? entry.value : null;
  } catch (err) {
    console.error(`Fehler beim Abrufen aus MongoDB (${namespace}:${key}):`, err);
    return null;
  }
}
