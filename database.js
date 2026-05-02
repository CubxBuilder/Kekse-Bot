import mongoose from 'mongoose';
import "dotenv/config";
const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("❌ MONGODB_URI fehlt in der .env Datei!");
}
mongoose.connect(uri)
    .then(() => console.log('🍃 MongoDB-Verbindung (KekseStorage) erfolgreich hergestellt.'))
    .catch(err => console.error('❌ MongoDB Verbindungsfehler:', err));
const storageSchema = new mongoose.Schema({
    namespace: { type: String, required: true }, 
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
});
storageSchema.index({ namespace: 1, key: 1 }, { unique: true });
const StorageModel = mongoose.model('BotStorage', storageSchema);
export async function dbSet(namespace, key, value) {
    try {
        await StorageModel.findOneAndUpdate(
            { namespace, key },
            { value },
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error(`❌ Fehler beim Speichern in MongoDB (${namespace}:${key}):`, err);
    }
}
export async function dbGet(namespace, key) {
    try {
        const entry = await StorageModel.findOne({ namespace, key });
        return entry ? entry.value : null;
    } catch (err) {
        console.error(`❌ Fehler beim Abrufen aus MongoDB (${namespace}:${key}):`, err);
        return null;
    }
}
