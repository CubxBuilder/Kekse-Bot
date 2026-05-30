// mcRoleSync.js
// Synchronisiert Discord-Rollen mit LuckPerms-Gruppen auf dem Minecraft-Server
// Einbinden in deinen Bot: import { syncRoles, handleMemberUpdate } from "./mcRoleSync.js";

import net from "net";
import { getEcoData } from "./app.js";

// ─── Konfiguration ────────────────────────────────────────────────────────────

const RCON_HOST = "127.0.0.1";
const RCON_PORT = 25575;
const RCON_PASSWORD = "t20_2j0f1hmt";

const ROLE_MAP = [
  { roleId: "1454169207838216253", group: "developer", priority: 4 },
  { roleId: "1423427747103113307", group: "admin",     priority: 3 },
  { roleId: "1424020019070898186", group: "moderator", priority: 2 },
  { roleId: "1423428139790499983", group: "member",    priority: 1 },
];

// ─── RCON Client ──────────────────────────────────────────────────────────────

const RCON_PACKET_TYPE = {
  AUTH: 3,
  AUTH_RESPONSE: 2,
  COMMAND: 2,
  COMMAND_RESPONSE: 0,
};

function createPacket(id, type, body) {
  const bodyBuf = Buffer.from(body + "\0", "utf8");
  const packetLen = 4 + 4 + bodyBuf.length + 1;
  const buf = Buffer.alloc(4 + packetLen);
  buf.writeInt32LE(packetLen, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  buf.writeUInt8(0, 12 + bodyBuf.length);
  return buf;
}

async function rconCommand(command) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let authenticated = false;
    let responseData = Buffer.alloc(0);
    let cmdId = Math.floor(Math.random() * 10000);

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("RCON Timeout"));
    }, 5000);

    socket.connect(RCON_PORT, RCON_HOST, () => {
      socket.write(createPacket(1, RCON_PACKET_TYPE.AUTH, RCON_PASSWORD));
    });

    socket.on("data", (data) => {
      responseData = Buffer.concat([responseData, data]);

      while (responseData.length >= 12) {
        const packetLen = responseData.readInt32LE(0);
        if (responseData.length < packetLen + 4) break;

        const packetId   = responseData.readInt32LE(4);
        const packetType = responseData.readInt32LE(8);
        const body = responseData.slice(12, 4 + packetLen - 2).toString("utf8");

        responseData = responseData.slice(4 + packetLen);

        if (!authenticated) {
          if (packetId === -1) {
            clearTimeout(timeout);
            socket.destroy();
            return reject(new Error("RCON Authentifizierung fehlgeschlagen"));
          }
          authenticated = true;
          socket.write(createPacket(cmdId, RCON_PACKET_TYPE.COMMAND, command));
        } else if (packetId === cmdId) {
          clearTimeout(timeout);
          socket.destroy();
          resolve(body);
        }
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Gibt die höchste Rolle zurück die ein Member hat
 */
function getHighestRole(member) {
  for (const { roleId, group } of ROLE_MAP) {
    if (member.roles.cache.has(roleId)) return group;
  }
  return null;
}

/**
 * Alle LuckPerms-Gruppen des Users entfernen und neue setzen
 */
async function applyLuckPermsGroup(mcUsername, group) {
  // Alle bekannten Gruppen entfernen
  for (const { group: g } of ROLE_MAP) {
    await rconCommand(`lp user ${mcUsername} parent remove ${g}`);
  }

  // Neue Gruppe setzen
  if (group) {
    const response = await rconCommand(`lp user ${mcUsername} parent set ${group}`);
    console.log(`[mcRoleSync] ${mcUsername} → ${group} | RCON: ${response}`);
    return true;
  }

  return false;
}

// ─── Haupt-Sync-Funktion ──────────────────────────────────────────────────────

/**
 * Synchronisiert die Rollen eines einzelnen Discord-Members
 */
export async function syncRoles(member) {
  try {
    const userId = member.id;
    const ecoData = await getEcoData(userId);

    if (!ecoData?.mcUsername) {
      console.log(`[mcRoleSync] Kein MC-Account für ${member.user.tag} gefunden`);
      return false;
    }

    const mcUsername = ecoData.mcUsername;
    const group = getHighestRole(member);

    if (!group) {
      console.log(`[mcRoleSync] ${member.user.tag} hat keine bekannte Rolle`);
      return false;
    }

    await applyLuckPermsGroup(mcUsername, group);
    return true;
  } catch (err) {
    console.error(`[mcRoleSync] Fehler bei ${member.user?.tag}:`, err.message);
    return false;
  }
}

/**
 * Sync aller Server-Member beim Bot-Start
 */
export async function syncAllMembers(guild) {
  console.log(`[mcRoleSync] Starte Massen-Sync für ${guild.name}...`);

  const members = await guild.members.fetch();
  let success = 0, skipped = 0, failed = 0;

  for (const [, member] of members) {
    if (member.user.bot) continue;
    const result = await syncRoles(member);
    if (result === true) success++;
    else if (result === false) skipped++;
    else failed++;

    // Kurze Pause um RCON nicht zu überlasten
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[mcRoleSync] Sync abgeschlossen: ✅ ${success} | ⏭ ${skipped} | ❌ ${failed}`);
}

// ─── Event Handler ────────────────────────────────────────────────────────────

/**
 * Wird bei guildMemberUpdate aufgerufen
 * In deinen Bot einbinden:
 *   client.on(Events.GuildMemberUpdate, handleMemberUpdate);
 */
export async function handleMemberUpdate(oldMember, newMember) {
  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());

  const relevantRoleIds = ROLE_MAP.map((r) => r.roleId);
  const changed = relevantRoleIds.some(
    (id) => oldRoles.has(id) !== newRoles.has(id)
  );

  if (!changed) return; // Keine relevante Rollenänderung

  console.log(`[mcRoleSync] Rollenänderung erkannt bei ${newMember.user.tag}`);
  await syncRoles(newMember);
}
