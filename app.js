import { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder, Events, AuditLogEvent, PermissionsBitField, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js"
import "dotenv/config"
import path from "path"
import express from "express"
import { fileURLToPath } from "url"
import fs from "fs"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express()
app.use("/", express.static(path.join(__dirname, "public")))
const port = process.env.PORT || 4000
app.listen(port, () => {
    console.log(`Server läuft auf Port ${port}`)
})
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Channel, Partials.Message, Partials.Reaction, 
    Partials.GuildMember, Partials.User, Partials.ThreadMember
    ]
});
const ISTORAGE_CHANNEL_ID = "1474141512165097616";

let storageMessageI = null;
let dataI = {};

export async function initInvitesStorage(client) {
  const channel = await client.channels.fetch(ISTORAGE_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 20 });
  storageMessageI = messages.find(
    m => m.author.id === client.user.id && m.embeds.length > 0
  );

  if (!storageMessageI) {
    dataI = { _init: true };
    const embed = new EmbedBuilder()
      .setTitle("Storage")
      .setDescription("```json\n" + JSON.stringify(dataI) + "\n```");

    storageMessageI = await channel.send({ embeds: [embed] });
  } else {
    try {
      const raw = storageMessageI.embeds[0].description
        .replace("```json\n", "")
        .replace("\n```", "");

      dataI = JSON.parse(raw);
    } catch {
      dataI = { _init: true };
    }
  }
}

export function getIData(key) {
  return dataI[key];
}

export async function setIData(key, value) {
  if (!storageMessageI) return;

  dataI[key] = value;

  const jsonString = JSON.stringify(dataI);

  const embed = new EmbedBuilder()
    .setTitle("Storage")
    .setDescription("```json\n" + jsonString + "\n```");

  await storageMessageI.edit({ embeds: [embed] }).catch(console.error);
  
}
const MSTORAGE_CHANNEL_ID = "1474146608915681384";

let storageMessageM = null;
let dataM = {};

export async function initModerationStorage(client) {
  const channel = await client.channels.fetch(MSTORAGE_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 20 });
  storageMessageM = messages.find(
    m => m.author.id === client.user.id && m.embeds.length > 0
  );

  if (!storageMessageM) {
    dataM = { _init: true };
    const embed = new EmbedBuilder()
      .setTitle("Storage")
      .setDescription("```json\n" + JSON.stringify(dataM) + "\n```");

    storageMessageM = await channel.send({ embeds: [embed] });
  } else {
    try {
      const raw = storageMessageM.embeds[0].description
        .replace("```json\n", "")
        .replace("\n```", "");

      dataM = JSON.parse(raw);
    } catch {
      dataM = { _init: true };
    }
  }
}

export function getMData(key) {
  return dataM[key];
}

export async function setMData(key, value) {
  if (!storageMessageM) return;

  dataM[key] = value;

  const jsonString = JSON.stringify(dataM);

  const embed = new EmbedBuilder()
    .setTitle("Storage")
    .setDescription("```json\n" + jsonString + "\n```");

  await storageMessageM.edit({ embeds: [embed] }).catch(console.error);
  
}
const VSTORAGE_CHANNEL_ID = "1474153032139931720";
let storageMessageV = null;
let dataV = {};
export async function initViolationsStorage(client) {
  const channel = await client.channels.fetch(VSTORAGE_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const messages = await channel.messages.fetch({ limit: 20 });
  storageMessageV = messages.find(
    m => m.author.id === client.user.id && m.embeds.length > 0
  );
  if (!storageMessageV) {
    dataV = { _init: true };
    const embed = new EmbedBuilder()
      .setTitle("Storage")
      .setDescription("```json\n" + JSON.stringify(dataV) + "\n```");
    storageMessageV = await channel.send({ embeds: [embed] });
  } else {
    try {
      const raw = storageMessageV.embeds[0].description
        .replace("```json\n", "")
        .replace("\n```", "");
      dataV = JSON.parse(raw);
    } catch {
      dataV = { _init: true };
    }
  }
}
export function getVData(key) {
  return dataV[key];
}
export async function setVData(key, value) {
  if (!storageMessageV) return;
  dataV[key] = value;
  const jsonString = JSON.stringify(dataV);
  const embed = new EmbedBuilder()
    .setTitle("Storage")
    .setDescription("```json\n" + jsonString + "\n```");
  await storageMessageV.edit({ embeds: [embed] }).catch(console.error);
}
const LOG_CHANNEL_ID = "1423413348220796991";

export function initAuditLogs(client) {

    const sendLog = async (title, user, text, color = "#ffffff", thumb = null, channelId = null) => {
        if (channelId === LOG_CHANNEL_ID) return;
        const chan = client.channels.cache.get(LOG_CHANNEL_ID);
        if (!chan) return;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({ 
                name: user?.tag || "System / Admin", 
                iconURL: user?.displayAvatarURL() || client.user.displayAvatarURL() 
            })
            .setDescription(`**Event:** \`${title}\`\n${text}`)
            .setFooter({ text: 'Kekse Clan Security | Master Log' })
            .setTimestamp();

        if (thumb) embed.setThumbnail(thumb);
        await chan.send({ embeds: [embed] }).catch(() => {});
    };

    client.on(Events.MessageDelete, async (msg) => {
        if (msg.partial || msg.author?.bot || msg.channel.id === LOG_CHANNEL_ID) return;
        const ghostPing = msg.mentions.users.size > 0 ? "⚠️ **GHOST PING ERKANNT**\n" : "";
        await sendLog("Nachricht gelöscht", msg.author, `${ghostPing}**Kanal:** ${msg.channel}\n**Inhalt:**\n\`\`\`${msg.content || "Kein Textinhalt"}\`\`\``, "#ffffff", null, msg.channel.id);
    });

    client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
        if (oldMsg.partial || oldMsg.content === newMsg.content || oldMsg.author?.bot || oldMsg.channel.id === LOG_CHANNEL_ID) return;
        await sendLog("Nachricht editiert", oldMsg.author, `**Kanal:** ${oldMsg.channel}\n**Vorher:**\n\`\`\`${oldMsg.content}\`\`\`\n**Nachher:**\n\`\`\`${newMsg.content}\`\`\``, "#ffffff", null, oldMsg.channel.id);
    });

    client.on(Events.GuildMemberAdd, async (member) => {
        await sendLog("User Join", member.user, `<@${member.id}> (${member.user.tag}) ist beigetreten.\nAccount erstellt: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, "#ffffff", member.user.displayAvatarURL());
    });

    client.on(Events.GuildMemberRemove, async (member) => {
        await sendLog("User Leave", member.user, `<@${member.id}> (${member.user.tag}) ist gegangen oder wurde entfernt.`, "#f04747", member.user.displayAvatarURL());
    });

    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        if (oldMember.nickname !== newMember.nickname) {
            await sendLog("Nickname geändert", newMember.user, `Alt: \`${oldMember.nickname || "Kein"}\`\nNeu: \`${newMember.nickname || "Kein"}\``);
        }
        const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
        if (addedRoles.size > 0) await sendLog("Rolle vergeben", newMember.user, `Hinzugefügt: ${addedRoles.map(r => r.name).join(", ")}`, "#43b581");
        if (removedRoles.size > 0) await sendLog("Rolle entfernt", newMember.user, `Entfernt: ${removedRoles.map(r => r.name).join(", ")}`, "#f04747");
    });

    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const user = newState.member.user;
        if (!oldState.channelId && newState.channelId) {
            await sendLog("VC Join", user, `Kanal: <#${newState.channelId}>`, "#ffffff");
        } else if (oldState.channelId && !newState.channelId) {
            await sendLog("VC Leave", user, `Kanal: <#${oldState.channelId}>`, "#ffffff");
        } else if (oldState.channelId !== newState.channelId) {
            await sendLog("VC Wechsel", user, `<#${oldState.channelId}> ➔ <#${newState.channelId}>`, "#ffffff");
        }
        if (!oldState.selfMute && newState.selfMute) {
            await sendLog("User gestummt (VC)", user, `In Kanal: <#${newState.channelId}>`);
        }
    });

    client.on(Events.GuildAuditLogEntryCreate, async (entry) => {
        const { action, executorId, targetId } = entry;
        const executor = await client.users.fetch(executorId).catch(() => null);

        if (action === AuditLogEvent.ChannelCreate) {
            await sendLog("Channel erstellt", executor, `ID: <#${targetId}>\nEin neuer Kanal wurde angelegt.`);
        }
        if (action === AuditLogEvent.ChannelDelete) {
            await sendLog("Channel gelöscht", executor, `ID: \`${targetId}\` (Kanal wurde entfernt)`, "#ffffff");
        }
        if (action === AuditLogEvent.ChannelUpdate) {
            await sendLog("Channel aktualisiert", executor, `Einstellungen in <#${targetId}> wurden geändert.`);
        }
        if (action === AuditLogEvent.ChannelOverwriteUpdate || action === AuditLogEvent.ChannelOverwriteCreate || action === AuditLogEvent.ChannelOverwriteDelete) {
            await sendLog("Channel Permissions aktualisiert", executor, `Berechtigungen in <#${targetId}> wurden modifiziert.`, "#ffffff");
        }

        if (action === AuditLogEvent.ThreadCreate) {
            await sendLog("Thread erstellt", executor, `Thread: <#${targetId}>`);
        }
        if (action === AuditLogEvent.ThreadDelete) {
            await sendLog("Thread gelöscht", executor, `Ein Thread wurde entfernt.`, "#ffffff");
        }
        if (action === AuditLogEvent.ThreadUpdate) {
            await sendLog("Thread aktualisiert", executor, `Thread <#${targetId}> wurde bearbeitet.`);
        }

        if (action === AuditLogEvent.RoleCreate) {
            await sendLog("Rolle erstellt", executor, `Eine neue Rolle wurde angelegt.`);
        }
        if (action === AuditLogEvent.RoleDelete) {
            await sendLog("Rolle gelöscht", executor, `ID: \`${targetId}\` (Rolle wurde entfernt)`, "#ffffff");
        }
        if (action === AuditLogEvent.RoleUpdate) {
            await sendLog("Rolle aktualisiert", executor, `Die Rolle <@&${targetId}> wurde bearbeitet.`);
        }

        if (action === AuditLogEvent.InviteCreate) {
            await sendLog("Invite erstellt", executor, `Ein neuer Einladungslink wurde generiert.`);
        }

        if (action === AuditLogEvent.GuildUpdate) {
            await sendLog("Server aktualisiert", executor, `Die allgemeinen Server-Einstellungen wurden geändert.`, "#ffffff");
        }

        if (action === AuditLogEvent.MemberBanAdd) await sendLog("BAN", executor, `Ziel: <@${targetId}>`, "#ffffff");
        if (action === AuditLogEvent.MemberBanRemove) await sendLog("UNBAN", executor, `Ziel: <@${targetId}>`, "#ffffff");
        if (action === AuditLogEvent.MemberKick) await sendLog("KICK", executor, `Ziel: <@${targetId}>`, "#ffffff");
    });

    client.on(Events.GuildInviteCreate, async (invite) => {
        await sendLog("Invite gesendet", invite.inviter, `Code: \`${invite.code}\`\nKanal: <#${invite.channelId}>`);
    });
}
const TEAM_ROLE_ID = "1457906448234319922";
export async function clear(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor('#ffffff')
      .setAuthor({ 
          name: user.username, 
          iconURL: user.displayAvatarURL({ size: 512 }) 
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: 'Kekse Clan | Moderation System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!clear") || message.author.bot) return;
    if (!message.member.roles.cache.has(TEAM_ROLE_ID)) {
      await message.delete().catch(() => {});
      const warnMsg = await message.channel.send("❌ Keine Berechtigung!");
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
    const statusMsg = await message.channel.send("🔍 Suche Nachrichten...");
    let messagesToDelete = [];
    let lastId = null;
    try {
      while (messagesToDelete.length < amount) {
        const fetched = await targetChannel.messages.fetch({ limit: 100, before: lastId });
        if (fetched.size === 0) break;
        for (const msg of fetched.values()) {
          if (userIds.length > 0 && !userIds.includes(msg.author.id)) continue;
          if (timeframe) {
            const ms = parseTimeframe(timeframe);
            if (Date.now() - msg.createdTimestamp > ms) continue;
          }
          messagesToDelete.push(msg);
          if (messagesToDelete.length >= amount) break;
        }
        lastId = fetched.last().id;
        if (fetched.size < 100) break;
      }
      if (messagesToDelete.length === 0) {
        return statusMsg.edit("❌ Keine Nachrichten gefunden, die den Kriterien entsprechen.").then(m => setTimeout(() => m.delete(), 5000));
      }
      let deletedCount = 0;
      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const youngMsgs = messagesToDelete.filter(m => m.createdTimestamp > fourteenDaysAgo);
      const oldMsgs = messagesToDelete.filter(m => m.createdTimestamp <= fourteenDaysAgo);
      if (youngMsgs.length > 0) {
        await statusMsg.edit(`🚀 Bulk-Löschung von ${youngMsgs.length} Nachrichten...`);
        const deletedBulk = await targetChannel.bulkDelete(youngMsgs, true);
        deletedCount += deletedBulk.size;
      }
      if (oldMsgs.length > 0) {
        for (let i = 0; i < oldMsgs.length; i++) {
          await oldMsgs[i].delete().catch(() => {});
          deletedCount++;
          if (deletedCount % 5 === 0) await statusMsg.edit(`⏳ Lösche alte Nachrichten: **${deletedCount}/${messagesToDelete.length}**...`);
          await new Promise(r => setTimeout(r, 1200)); 
        }
      }
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      await statusMsg.delete().catch(() => {});
      const finishMsg = await message.channel.send(
        `✅ **Abschlussbericht:**\n- Gelöscht: **${deletedCount}**\n- Dauer: **${duration}s**\n- Kanal: <#${targetChannel.id}>`
      );
      const userList = userIds.length > 0 ? userIds.map(id => `<@${id}>`).join(", ") : "Alle User";
      await sendKekseLog("Nachrichten gelöscht (Clear)", message.author, 
        `**Kanal:** <#${targetChannel.id}>\n` +
        `**Anzahl:** ${deletedCount}\n` +
        `**Filter (User):** ${userList}\n` +
        `**Zeitrahmen:** ${timeframe || "Keiner"}\n` +
        `**Dauer:** ${duration}s`
      );
      setTimeout(() => finishMsg.delete().catch(() => {}), 15000);
    } catch (err) {
      console.error(err);
      if (statusMsg) await statusMsg.edit("❌ Fehler beim Löschen (Berechtigungen prüfen).").catch(() => {});
    }
  });
}
function parseTimeframe(tf) {
  const match = tf.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const num = parseInt(match[1]);
  switch (match[2]) {
    case "s": return num * 1000;
    case "m": return num * 60000;
    case "h": return num * 3600000;
    case "d": return num * 86400000;
    default: return 0;
  }
}
export const ruleMap = {
  "§1a1n1": { section: "Respekt und Freundlichkeit", text: "Sei respektvoll. Beleidigungen, Diskriminierung, Mobbing oder Drohungen werden nicht toleriert." },
  "§1a1n2": { section: "Respekt und Freundlichkeit", text: "Diskutiere sachlich und vermeide provokative Streitigkeiten." },
  "§1a2n1": { section: "Keine unangemessenen Inhalte", text: "Keine anstößigen, pornografischen, rassistischen oder gewalttätigen Inhalte posten." },
  "§1a2n2": { section: "Keine unangemessenen Inhalte", text: "Illegale Inhalte oder Diskussionen über illegale Aktivitäten sind verboten." },
  "§1a3n1": { section: "Spam, Werbung und Links", text: "Spam jeglicher Art ist nicht erlaubt." },
  "§1a3n2": { section: "Spam, Werbung und Links", text: "Werbung oder Links nur in genehmigten Kanälen mit Zustimmung der Moderatoren." },
  "§2a1n1": { section: "Datenschutz", text: "Keine persönlichen Informationen ohne Erlaubnis teilen. Respektiere die Privatsphäre anderer Mitglieder." },
  "§2a2n1": { section: "Keine unerwünschte Kontaktaufnahme", text: "Keine unaufgeforderten Direktnachrichten, insbesondere Werbung oder Anfragen." },
  "§2a2n2": { section: "Keine unerwünschte Kontaktaufnahme", text: "Wünsche nach Ruhe respektieren." },
  "§3a1n1": { section: "Richtige Kanäle", text: "Poste nur im passenden Kanal." },
  "§3a1n2": { section: "Richtige Kanäle", text: "Nutze die richtigen Kanäle für Fragen, Diskussionen oder Medien." },
  "§3a1n3": { section: "Richtige Kanäle", text: "Bots dürfen nur in den dafür vorgesehenen Channels verwendet werden." },
  "§3a2n1": { section: "Sprache und Ausdruck", text: "Freundlich und konstruktiv kommunizieren. Fluchen nur in Maßen." },
  "§3a2n2": { section: "Sprache und Ausdruck", text: "Server-Sprache: Deutsch." },
  "§3a3n1": { section: "Voice Chats", text: "Störgeräusche vermeiden." },
  "§3a3n2": { section: "Voice Chats", text: "Dauerhaftes Stummschalten oder wiederholtes Verlassen und Betreten ist nicht erlaubt." },
  "§4a1n1": { section: "Tickets", text: "Missbrauch von Tickets, z. B. ohne Grund öffnen, wird bestraft." },
  "§5a1n1": { section: "Giveaways", text: "Tickets für Giveaways müssen innerhalb von 2 Tagen nach Ende geöffnet werden, sonst erfolgt ein Reroll." },
  "§5a1n2": { section: "Giveaways", text: "Mitglieder, die aktuell gebannt sind, dürfen nicht am Giveaway teilnehmen." },
  "§6a1n1": { section: "Verhalten gegenüber Moderatoren", text: "Entscheidungen der Moderatoren respektieren. Probleme über ein Ticket klären." },
  "§6a1n2": { section: "Verhalten gegenüber Moderatoren", text: "Den Anweisungen der Moderatoren Folge leisten." },
  "-ssa-": { section: "Mögliche Gefahr durch Spamming.", text: "Der User wurde von Discord mit 'Engaged in suspected spam activity' gekennzeichnet und wird aufgrund der ausgehenden Gefahr vom Discord Server ausgeschlossen."}
};

export async function sendPunishmentInfo(user, type, reason, duration = null) {
  let ruleText = "";
  let sectionTitle = "";
  
  const ruleMatch = reason ? reason.match(/§\d+a\d+n\d+|-ssa-/) : null;
  if (ruleMatch) {
    const code = ruleMatch[0];
    const ruleInfo = ruleMap[code];
    if (ruleInfo) {
      sectionTitle = ruleInfo.section;
      ruleText = `\n\nRegelauszug (${code}):\n[...] "${ruleInfo.text}" [...]`;
    }
  }

  const durationText = duration ? `\n\nDauer: ${duration}` : "";
  const typeLabels = {
    "ban": "Bann",
    "kick": "Kick",
    "timeout": "Timeout"
  };
  const label = typeLabels[type] || type;
  
  const message = `Hey ${user.username},

dein Account auf \`Kekse Clan\` hat eine Strafe erhalten: **${label}**.

Grund: ${reason}${sectionTitle ? ` (${sectionTitle})` : ""}${durationText}${ruleText}

Um sicherzustellen, dass unsere Community sicher und freundlich bleibt, befolge bitte unsere Regeln. Die vollständigen Regeln findest du hier: https://discord.com/channels/1423413347168157718/1423413348065611949`;

  await user.send(message).catch(() => console.log(`Konnte DM an ${user.tag} nicht senden.`));
}
export async function initInvites(client) {
  const inviteCache = new Map();
  const TEAM_ROLE_ID = "1457906448234319922";
  const cacheInvites = async () => {
    for (const g of client.guilds.cache.values()) {
      const invs = await g.invites.fetch().catch(() => null);
      if (invs) inviteCache.set(g.id, new Map(invs.map(i => [i.code, i.uses])));
    }
  };
  client.on("ready", cacheInvites);
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    if (cmd === "invite_leaderboard" || cmd === "invites") {
      const stats = getIData("invite_stats") || {};
      const leaderboard = Object.entries(stats).map(([id, s]) => ({ id, ...s, total: (s.regular || 0) - (s.left || 0) - (s.fake || 0) + (s.bonus || 0) })).sort((a, b) => b.total - a.total).slice(0, 10);
      if (leaderboard.length === 0) return msg.reply("Keine Daten.");
      let desc = "";
      leaderboard.forEach((e, i) => { desc += `\`${i + 1}. \` <@${e.id}> • **${e.total}** invites. (${e.regular} regular, ${e.left} left, ${e.fake} fake, ${e.bonus} bonus)\n`; });
      const embed = new EmbedBuilder().setTitle("<:statistiques:1467246038497886311> Invite Leaderboard").setDescription(desc).setColor(0xffffff);
      await msg.reply({ embeds: [embed] });
    }
    if (cmd === "addbonus" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      const target = msg.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount)) return msg.reply("❌ !addbonus @user 10");
      const stats = getData("invite_stats") || {};
      stats[target.id] = stats[target.id] || { regular: 0, left: 0, fake: 0, bonus: 0 };
      stats[target.id].bonus = (stats[target.id].bonus || 0) + amount;
      await setIData("invite_stats", stats);
      msg.reply(`✅ +${amount} für ${target.username}`);
    }
  });
  client.on("guildMemberAdd", async (m) => {
    const cached = inviteCache.get(m.guild.id);
    const current = await m.guild.invites.fetch().catch(() => null);
    if (!current || !cached) return;
    const used = current.find(i => i.uses > (cached.get(i.code) || 0));
    inviteCache.set(m.guild.id, new Map(current.map(i => [i.code, i.uses])));
    if (used) {
      const stats = getIData("invite_stats") || {};
      const rels = getIData("invite_relations") || {};
      const inviterId = used.inviter.id;
      stats[inviterId] = stats[inviterId] || { regular: 0, left: 0, fake: 0, bonus: 0 };
      rels[m.id] = inviterId;
      const isFake = (Date.now() - m.user.createdTimestamp) < 86400000;
      isFake ? stats[inviterId].fake++ : stats[inviterId].regular++;
      await setIData("invite_stats", stats);
      await setIData("invite_relations", rels);
    }
  });
  client.on("guildMemberRemove", async (m) => {
    const rels = getIData("invite_relations") || {};
    const inviterId = rels[m.id];
    if (inviterId) {
      const stats = getIData("invite_stats") || {};
      if (stats[inviterId]) { stats[inviterId].left++; await setIData("invite_stats", stats); }
      delete rels[m.id];
      await setIData("invite_relations", rels);
    }
  });
}
export function initModSend(client) {
  client.on("guildAuditLogEntryCreate", async (entry, guild) => {
    const { action, targetId, reason, executorId } = entry;
    if (executorId === client.user.id) return; 
    let type = "";
    let duration = null;
    if (action === AuditLogEvent.MemberBanAdd) type = "ban";
    else if (action === AuditLogEvent.MemberKick) type = "kick";
    else if (action === AuditLogEvent.MemberUpdate) {
      const timeoutChange = entry.changes.find(c => c.key === "communication_disabled_until");
      if (timeoutChange && timeoutChange.new) {
        type = "timeout";
        duration = "Check Audit Log";
      }
    }

    if (type) {
      const target = await client.users.fetch(targetId).catch(() => null);
      if (target) {
        if (type === "timeout") {
          const timeoutChange = entry.changes.find(c => c.key === "communication_disabled_until");
          if (timeoutChange && timeoutChange.new) {
            const until = new Date(timeoutChange.new);
            const now = new Date();
            const diffMs = until - now;
            const diffMin = Math.round(diffMs / 60000);
            
            if (diffMin >= 60 * 24) {
              duration = `${Math.round(diffMin / (60 * 24))} Tag(e)`;
            } else if (diffMin >= 60) {
              duration = `${Math.round(diffMin / 60)} Stunde(n)`;
            } else {
              duration = `${diffMin} Minute(n)`;
            }
          }
        }
        await sendPunishmentInfo(target, type, reason || "Kein Grund angegeben.", duration);
      }
    }
  });
}
function hasPerm(member) {
  return member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
}

export function initModeration(client) {
  client.on("messageCreate", async msg => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;
    if (!msg.member.roles.cache.has(TEAM_ROLE_ID) || !hasPerm(msg.member)) return;

    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    let data = getMData("moderation") || { warns: {} };

    const getUser = async (input) => {
      if (!input) return null;
      const id = input.replace(/[<@!>]/g, "");
      if (/^\d{17,20}$/.test(id)) return await client.users.fetch(id).catch(() => null);
      return null;
    };

    const sendModLog = async (action, target, reason, extra = null) => {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (!logChannel) return;

      const kekseEmbed = new EmbedBuilder()
        .setColor('#ffffff')
        .setAuthor({ 
            name: msg.author.username, 
            iconURL: msg.author.displayAvatarURL({ size: 512 }) 
        })
        .setTitle(`🛠️ Mod-Aktion: ${action}`)
        .setDescription(`**Target:** ${target.tag || target.id} (\`${target.id}\`)\n**Grund:** ${reason}${extra ? `\n**Info:** ${extra}` : ""}`)
        .setFooter({ text: 'Kekse Clan | Moderation Logs' })
        .setTimestamp();

      await logChannel.send({ embeds: [kekseEmbed] }).catch(() => {});
    };

    if (cmd === "timeout") {
      const user = await getUser(args[0]);
      const durationStr = args[1];
      const reason = args.slice(2).join(" ") || "Kein Grund";
      if (!user || !durationStr) return msg.reply({ content: "❌ Syntax: `!timeout @user 10m Grund`.", ephemeral: true });

      const match = durationStr.match(/^(\d+)([smhd])$/);
      if (!match) return msg.reply({ content: "❌ Format: 10s, 5m, 2h, 1d", ephemeral: true });
      const durationMs = parseDuration(match[1], match[2]);

      try {
        const member = await msg.guild.members.fetch(user.id);
        await member.timeout(durationMs, reason);
        await sendModLog("Timeout", user, reason, `Dauer: ${durationStr}`);
        await msg.reply({ content: `✅ **Timeout**: <@${user.id}> für ${durationStr}.`, ephemeral: true });
      } catch (err) { 
        await msg.reply({ content: "❌ Fehler: User nicht auf Server oder fehlende Rechte.", ephemeral: true }); 
      }
    }

    if (cmd === "untimeout") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user) return msg.reply({ content: "❌ User nicht gefunden.", ephemeral: true });

      try {
        const member = await msg.guild.members.fetch(user.id);
        await member.timeout(null, reason);
        await sendModLog("Untimeout", user, reason);
        await msg.reply({ content: `✅ **Untimeout**: <@${user.id}>`, ephemeral: true });
      } catch (err) { 
        await msg.reply({ content: "❌ Fehler beim Untimeout.", ephemeral: true }); 
      }
    }

    if (cmd === "kick") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user) return msg.reply({ content: "❌ User nicht gefunden.", ephemeral: true });

      try {
        await msg.guild.members.kick(user.id, reason);
        await sendModLog("Kick", user, reason);
        await msg.reply({ content: `✅ **Kick**: <@${user.id}>`, ephemeral: true });
      } catch (err) { 
        await msg.reply({ content: "❌ Fehler beim Kick.", ephemeral: true }); 
      }
    }

    if (cmd === "ban") {
      const idInput = args[0]?.replace(/[<@!>]/g, "");
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!idInput || !/^\d{17,20}$/.test(idInput)) return msg.reply({ content: "❌ Gültige ID/Erwähnung angeben.", ephemeral: true });

      try {
        const user = await client.users.fetch(idInput).catch(() => ({ id: idInput, tag: "Unknown#0000" }));
        await msg.guild.members.ban(idInput, { reason });
        await sendModLog("Ban", user, reason);
        await msg.reply({ content: `✅ **Ban**: ${user.tag || idInput} wurde gebannt.`, ephemeral: true });
      } catch (err) { 
        await msg.reply({ content: "❌ Fehler beim Ban (Rechte?).", ephemeral: true }); 
      }
    }

    if (cmd === "unban") {
      const idInput = args[0]?.replace(/[<@!>]/g, "");
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!idInput) return msg.reply({ content: "❌ ID angeben.", ephemeral: true });

      try {
        const user = await client.users.fetch(idInput).catch(() => ({ id: idInput, tag: idInput }));
        await msg.guild.members.unban(idInput, reason);
        await sendModLog("Unban", user, reason);
        await msg.reply({ content: `✅ **Unban**: ${user.tag || idInput}`, ephemeral: true });
      } catch (err) { 
        await msg.reply({ content: "❌ User nicht gebannt oder ID falsch.", ephemeral: true }); 
      }
    }

    if (cmd === "warn") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user) return msg.reply({ content: "❌ User nicht gefunden.", ephemeral: true });

      data.warns[user.id] ??= [];
      data.warns[user.id].push({ reason, by: msg.author.id, date: Date.now() });
      await setMData("moderation", data);
      
      await sendModLog("Warnung", user, reason, `Warn-Stand: ${data.warns[user.id].length}`);
      await msg.reply({ content: `⚠️ **Warn**: <@${user.id}> (Gesamt: ${data.warns[user.id].length})`, ephemeral: true });
    }

    if (cmd === "warns") {
      const user = await getUser(args[0]);
      if (!user) return msg.reply({ content: "❌ User nicht gefunden.", ephemeral: true });
      const userWarns = data.warns[user.id] || [];
      if (userWarns.length === 0) return msg.reply({ content: "✅ Keine Warnungen.", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`Warnungen: ${user.username}`)
        .setColor('#ffffff')
        .setDescription(userWarns.map((w, i) => `**${i + 1}.** ${w.reason} (von <@${w.by}>)`).join("\n"))
        .setFooter({ text: 'Kekse Clan' });
      await msg.reply({ embeds: [embed] });
    }

    if (cmd === "warn_remove") {
      const user = await getUser(args[0]);
      const index = parseInt(args[1]) - 1;
      if (!user || isNaN(index) || !data.warns[user.id]?.[index]) return msg.reply({ content: "❌ Ungültiger Index.", ephemeral: true });

      const removed = data.warns[user.id].splice(index, 1);
      await setMData("moderation", data);
      await sendModLog("Warn entfernt", user, `Grund war: ${removed[0].reason}`);
      await msg.reply({ content: "✅ Warnung entfernt.", ephemeral: true });
    }
  });
}

function parseDuration(amount, unit) {
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(amount) * map[unit];
}
const VERIFY_CHANNEL_ID = "1439337595090898955";
const UNVERIFIED_ROLE_ID = "1439337577508245837";
export function initVerification(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor('#ffffff')
      .setAuthor({ 
          name: user.username, 
          iconURL: user.displayAvatarURL({ size: 512 }) 
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: 'Kekse Clan | Verification System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("guildMemberAdd", async (member) => {
    await member.roles.add(UNVERIFIED_ROLE_ID).catch(() => {});
  });
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== "verify_user") return;   
    const member = interaction.member;
    if (!member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
      return interaction.reply({ 
        content: "Du bist bereits verifiziert.", 
        ephemeral: true 
      });
    }
    try {
      await member.roles.remove(UNVERIFIED_ROLE_ID);
      await sendKekseLog("User Verifiziert", interaction.user, `Der User hat den Button genutzt und die Rolle <@&${UNVERIFIED_ROLE_ID}> wurde entfernt.`);
      
      await interaction.reply({ 
        content: "Erfolgreich verifiziert!", 
        ephemeral: true 
      });
    } catch (err) {
      await interaction.reply({ 
        content: "Fehler: Meine Rolle steht in der Liste vermutlich unter der Verifizierungs-Rolle.", 
        ephemeral: true 
      });
    }
  });

  client.on("messageCreate", async (msg) => {
    if (msg.content === "!setup_verify") {
      if (!msg.member.roles.cache.has(TEAM_ROLE_ID)) return;
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_user")
          .setLabel("Verifizieren")
          .setStyle(ButtonStyle.Success)
      );
      const channel = client.channels.cache.get(VERIFY_CHANNEL_ID);
      if (channel) {
        const imageUrl = new AttachmentBuilder('./verify.png');
        
        await channel.send({ 
          content: "**Willkommen!** Klicke auf den Button, um die Verifizierung abzuschließen.",
          files: [imageUrl],
          components: [row] 
        });

        await sendKekseLog("Verification Setup", msg.author, `Das Verifizierungs-Panel wurde in <#${VERIFY_CHANNEL_ID}> neu aufgesetzt.`);
        
        await msg.delete().catch(() => {});
      }
    }
  });
}
const PING_ID = "1151971830983311441";
const LEVELS = [
  { count: 5,  duration: 1 * 86400000, label: "1 Tag" },
  { count: 10, duration: 2 * 86400000, label: "2 Tage" },
  { count: 25, duration: 7 * 86400000, label: "7 Tage" },
  { count: 50, duration: 31 * 86400000, label: "31 Tage" }
];
export async function violations(client) {
  const sendKekseLog = async (action, user, details, color = "#ffffff") => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ 
          name: user.username, 
          iconURL: user.displayAvatarURL({ size: 512 }) 
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: 'Kekse Clan | Automated Security' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    const data = getVData("violations");
    if (!data) return;
    const entry = data[message.author.id];
    if (!entry) return;
    if (!entry.appliedLevel) entry.appliedLevel = 0;
    const level = LEVELS.find(l => entry.count >= l.count && entry.appliedLevel < l.count);
    if (!level) return;
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;
    try {
      await member.timeout(level.duration, "Automatisches System: Verstoß-Schwelle erreicht (§2a1n1)");
      entry.appliedLevel = level.count;
      await setVData("violations", data);
      await sendKekseLog(
        "Automatischer Timeout", 
        message.author, 
        `**Grund:** Verstoß-Schwelle erreicht (${level.count} Verstöße)\n` +
        `**Dauer:** ${level.label}\n` +
        `**Status:** System-Sanktion ausgeführt.`
      );
    } catch (err) {
      if (entry.adminNotified) return;

      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
      if (logChannel) {
        const alertEmbed = new EmbedBuilder()
          .setColor("#ff0000")
          .setTitle("⚠️ Sanktion Fehlgeschlagen")
          .setDescription(
            `<@${PING_ID}>, die automatische Sanktion für <@${member.id}> (${member.user.tag}) schlug fehl.\n\n` +
            `**Grund:** Wahrscheinlich Administrator-Rechte oder Rollen-Hierarchie.\n` +
            `**Erreichte Schwelle:** ${level.count} Verstöße.`
          )
          .setTimestamp();
        await logChannel.send({ content: `<@${PING_ID}>`, embeds: [alertEmbed] });
      }
      entry.adminNotified = true;
      await setVData("violations", data);
    }
  });
}
const CONFIG = {
  ignoredCategories: [
    "1423413348065611953",
    "1434277752982474945",
    "1426271033047912582"
  ],
  suspiciousKeywords: ["steam", "discord", "labymod", "epic", "gift", "redeem", "nitro", "key"],
  cooldown: 5000,
  warnDeleteAfter: 10000,
  ticketChannel: "1423413348493430905"
};
export async function warning(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor('#ffffff')
      .setAuthor({ 
          name: user.username, 
          iconURL: user.displayAvatarURL({ size: 512 }) 
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: 'Kekse Clan | Security System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("messageCreate", async (message) => {
    if (!isProcessable(message) || isIgnoredCategory(message)) return;
    const result = detectViolation(message.content);
    if (!result) return;
    const userId = message.author.id;
    const now = Date.now();
    const violations = getVData("violations") || {};
    if (!violations[userId]) {
      violations[userId] = { name: message.author.username, count: 0, last: 0 };
    }
    if (now - violations[userId].last < CONFIG.cooldown) return;
    violations[userId].count += 1;
    violations[userId].name = message.author.username;
    violations[userId].last = now;
    await setVData("violations", violations);
    if (message.deletable) {
      const originalContent = message.content;
      await message.delete().catch(() => {});
      await sendKekseLog("Sicherheits-Verstoß", message.author, 
        `**Erkannt:** ${result}\n` +
        `**Kanal:** ${message.channel}\n` +
        `**Verstöße gesamt:** ${violations[userId].count}\n` +
        `**Inhalt (zensiert):** \`\`\`${originalContent.substring(0, 15)}...\`\`\``
      );
    }
    const warnMsg = await message.channel.send({
      content: `⚠️ <@${userId}>, unser System hat einen **${result}** erkannt. Bitte poste keine sensiblen Daten öffentlich. Bei Missverständnissen erstelle ein Ticket in <#${CONFIG.ticketChannel}>`
    }).catch(() => {});
    if (warnMsg) {
      setTimeout(() => warnMsg.delete().catch(() => {}), CONFIG.warnDeleteAfter);
    }
  });
}
function isProcessable(message) {
  return !message.author.bot && message.guild && message.content;
}
function isIgnoredCategory(message) {
  const channel = message.channel;
  const parentId = channel.parentId || channel.parent?.parentId;
  return parentId && CONFIG.ignoredCategories.includes(parentId);
}
function detectViolation(msg) {
  const lower = msg.toLowerCase();
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  if (emailPattern.test(msg)) return "E-Mail Adresse";
  const cleanMsg = msg
    .replace(/<a?:[a-zA-Z0-9_]+:\d{17,20}>/g, "") 
    .replace(/<[#@&]!?\d{17,20}>/g, "");
  const words = cleanMsg.split(/\s+/);
  for (const word of words) {
    if (word.startsWith("http") || (word.startsWith(":") && word.endsWith(":"))) continue;
    const clean = word.replace(/[^a-z0-9-]/gi, "");
    if (clean.length < 8) continue;
    if (/^\d+$/.test(clean)) continue; 
    const whitelist = ["windows", "download", "installer", "x86_64", "64-bit"];
    if (whitelist.includes(clean.toLowerCase())) continue;
    const isGiftCardFormat = /^([A-Z0-9]{4,6}-){2,}[A-Z0-9]{4,6}$/i.test(clean);
    if (isGiftCardFormat) return "Gutschein Code";
    const hasNumbers = /\d/.test(clean);
    const hasLetters = /[a-z]/i.test(clean);
    if (hasNumbers && hasLetters) {
      const hasKeyword = CONFIG.suspiciousKeywords.some(k => lower.includes(k)) || 
                         /\b(code|key|free|gratis|geschenk|redeem|nitro)\b/.test(lower);
      if (clean.length >= 10 && hasKeyword) return "Gutschein Code";
      const numberCount = (clean.match(/\d/g) || []).length;
      if (clean.length >= 18 && numberCount >= 4) {
        return "sensiblen Key / Token";
      }
    }
  }
  return null;
}
const DSTORAGE_CHANNEL_ID = "1474153763647389860";
const RSTORAGE_CHANNEL_ID = "1474144083105808556";
let storageMessageD = null;
let dataD = {};
let storageMessageR = null;
let dataR = {};
async function initDmTicketsStorage(client) {
  const channel = await client.channels.fetch(DSTORAGE_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 20 });
  storageMessageD = messages.find(
    m => m.author.id === client.user.id && m.embeds.length > 0
  );

  if (!storageMessageD) {
    dataD = { _init: true };
    const embed = new EmbedBuilder()
      .setTitle("Storage")
      .setDescription("```json\n" + JSON.stringify(dataD) + "\n```");

    storageMessageD = await channel.send({ embeds: [embed] });
  } else {
    try {
      const raw = storageMessageD.embeds[0].description
        .replace("```json\n", "")
        .replace("\n```", "");

      dataD = JSON.parse(raw);
    } catch {
      dataD = { _init: true };
    }
  }
}

export function getDData(key) {
  return dataD[key];
}

export async function setDData(key, value) {
  if (!storageMessageD) return;

  dataD[key] = value;

  const jsonString = JSON.stringify(dataD);

  const embed = new EmbedBuilder()
    .setTitle("Storage")
    .setDescription("```json\n" + jsonString + "\n```");

  await storageMessageD.edit({ embeds: [embed] }).catch(console.error);
  
}

async function initRemindersStorage(client) {
  const channel = await client.channels.fetch(RSTORAGE_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 20 });
  storageMessageR = messages.find(
    m => m.author.id === client.user.id && m.embeds.length > 0
  );

  if (!storageMessageR) {
    dataR = { _init: true };
    const embed = new EmbedBuilder()
      .setTitle("Storage")
      .setDescription("```json\n" + JSON.stringify(dataR) + "\n```");

    storageMessageR = await channel.send({ embeds: [embed] });
  } else {
    try {
      const raw = storageMessageR.embeds[0].description
        .replace("```json\n", "")
        .replace("\n```", "");

      dataR = JSON.parse(raw);
    } catch {
      dataR = { _init: true };
    }
  }
}
export function getRData(key) {
  return dataR[key];
}
export async function setRData(key, value) {
  if (!storageMessageR) return;
  dataR[key] = value;
  const jsonString = JSON.stringify(dataR);
  const embed = new EmbedBuilder()
    .setTitle("Storage")
    .setDescription("```json\n" + jsonString + "\n```");
  await storageMessageR.edit({ embeds: [embed] }).catch(console.error);
}
const FORUM_CHANNEL_ID = "1474918563218198548";
const TEAM_ROLE_ID = "1457906448234319922";
const LOG_CHANNEL_ID = "1423413348220796991";
export async function initSupport(client) {
    const savedData = getDData("tickets") || {};
    let OPEN_HELP = new Map(Object.entries(savedData));
    const getAccountAge = (createdAt) => {
        const diff = Date.now() - createdAt.getTime();
        const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        return years === 0 ? "Weniger als ein Jahr" : `${years} Jahre`;
    };
    client.on("messageCreate", async (msg) => {
        if (msg.author.bot) return;
        if (msg.channel.type === ChannelType.DM) {
            let threadId = OPEN_HELP.get(msg.author.id);
            let thread = threadId ? await client.channels.fetch(threadId).catch(() => null) : null;
            if (!thread) {
                const forumChannel = await client.channels.fetch(FORUM_CHANNEL_ID).catch(() => null);
                if (!forumChannel) return console.error("Forum Channel nicht gefunden!");

                const lastId = (getDData("last_ticket_id") || 0) + 1;
                const ticketIndex = String(lastId).padStart(4, "0");
                thread = await forumChannel.threads.create({
                    name: `Ticket #${ticketIndex} - ${msg.author.username}`,
                    message: {
                        content: `<@&${TEAM_ROLE_ID}> - Neues Ticket von ${msg.author}!`,
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("🎫 Neues Support-Ticket")
                                .setColor("#ffffff")
                                .setThumbnail(msg.author.displayAvatarURL())
                                .addFields(
                                    { name: "User", value: `${msg.author.tag} (${msg.author.id})`, inline: true },
                                    { name: "Account erstellt", value: getAccountAge(msg.author.createdAt), inline: true },
                                    { name: "Erste Nachricht", value: msg.content || "*Anhang*" }
                                )
                                .setFooter({ text: "🎯 Nutze die Buttons unten zur Verwaltung" })
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId("ticket_claim").setLabel("Claim Ticket").setStyle(ButtonStyle.Success).setEmoji("🙋‍♂️"),
                                new ButtonBuilder().setCustomId("ticket_warn").setLabel("User warnen").setStyle(ButtonStyle.Secondary).setEmoji("⚠️"),
                                new ButtonBuilder().setCustomId("ticket_delete").setLabel("Ticket Schließen").setStyle(ButtonStyle.Danger).setEmoji("🔒")
                            )
                        ]
                    }
                });
                OPEN_HELP.set(msg.author.id, thread.id);
                await setDData("tickets", Object.fromEntries(OPEN_HELP));
                await setDData("last_ticket_id", lastId);
                const userConfirm = new EmbedBuilder()
                    .setTitle("✅ Ticket erstellt!")
                    .setDescription(`Dein Support-Ticket wurde erfolgreich erstellt!\n\n💬 Schreibe hier weiter, um mit dem Team zu kommunizieren.\n⏱️ Ein Teammitglied wird sich bald bei dir melden!`)
                    .setColor("#ffffff")
                    .setFooter({ text: `Ticket #${ticketIndex}` })
                    .setTimestamp();
                await msg.author.send({ embeds: [userConfirm] }).catch(() => {});
            } else {
                const relayEmbed = new EmbedBuilder()
                    .setAuthor({ name: msg.author.username, iconURL: msg.author.displayAvatarURL() })
                    .setDescription(msg.content || "*Kein Textinhalt*")
                    .setColor("#ffffff")
                    .setTimestamp();
                if (msg.attachments.size > 0) relayEmbed.setImage(msg.attachments.first().url);
                await thread.send({ embeds: [relayEmbed] });
            }
        }
        if (msg.guild && msg.channel.isThread() && msg.channel.parentId === FORUM_CHANNEL_ID) {
            const entry = [...OPEN_HELP.entries()].find(([uId, tId]) => tId === msg.channel.id);
            if (!entry) return;
            const userId = entry[0];
            const targetUser = await client.users.fetch(userId).catch(() => null);
            if (targetUser) {
                const staffEmbed = new EmbedBuilder()
                    .setAuthor({ name: "Kekse Clan Support", iconURL: client.user.displayAvatarURL() })
                    .setTitle("💬 Antwort vom Support-Team")
                    .setDescription(msg.content)
                    .setColor("#ffffff")
                    .setFooter({ text: "Antworte direkt auf diese DM, um mit uns zu schreiben." });
                if (msg.attachments.size > 0) staffEmbed.setImage(msg.attachments.first().url);
                await targetUser.send({ embeds: [staffEmbed] })
                    .then(() => msg.react("✅"))
                    .catch(() => msg.channel.send("❌ DMs des Users sind deaktiviert."));
            }
        }
    });
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;   
        const entry = [...OPEN_HELP.entries()].find(([uId, tId]) => tId === interaction.channelId);
        if (!entry) return;
        const userId = entry[0];
        if (interaction.customId === "ticket_claim") {
            await interaction.reply({ content: `🙋‍♂️ **${interaction.user.username}** hat dieses Ticket übernommen.` });
        }
        if (interaction.customId === "ticket_warn") {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                const warnEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Warnung vom Support-Team")
                    .setDescription(`Du wurdest von ${interaction.user.username} verwarnt.\nBitte achte auf einen respektvollen Umgangston. Wir sind hier, um dir zu helfen, erwarten aber Höflichkeit.`)
                    .setColor("#F78420");
                await user.send({ embeds: [warnEmbed] }).catch(() => {});
                await interaction.reply({ content: "⚠️ Warnung gesendet.", ephemeral: true });
            }
        }
                if (interaction.customId === "ticket_delete") {
            const user = await client.users.fetch(userId).catch(() => null);
            if (user) {
                await user.send("🔒 **Ticket geschlossen.** Deine Anfrage wurde archiviert. Schreibe eine neue Nachricht, um ein neues Ticket zu eröffnen.").catch(() => {});
            }
            await interaction.reply("🔒 Ticket wird archiviert und geschlossen...");
            OPEN_HELP.delete(userId);
            await setDData("tickets", Object.fromEntries(OPEN_HELP));
            setTimeout(async () => {
                try {
                    await interaction.channel.edit({
                        name: `[Closed] ${interaction.channel.name}`,
                        archived: true,
                        locked: true
                    });
                } catch (err) {
                    console.error("Fehler beim Archivieren des Forum-Threads:", err);
                }
            }, 3000);
        }

    });
}
function initReminder(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor('#ffffff')
      .setAuthor({ 
          name: user.username, 
          iconURL: user.displayAvatarURL({ size: 512 }) 
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: 'Kekse Clan | Reminder System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  function parseDuration(str) {
    const match = str.match(/(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?/);
    if (!match) return 0;
    const days = parseInt(match[1] || "0");
    const hours = parseInt(match[2] || "0");
    const minutes = parseInt(match[3] || "0");
    return ((days * 24 + hours) * 60 + minutes) * 60000;
  }
  function parseAbsoluteTime(str) {
    const [timePart, datePart] = str.split(";");
    if (!timePart || !datePart) return null;
    const [hh, mm] = timePart.split(":").map(Number);
    const [dd, MM, YYYY] = datePart.split(".").map(Number);
    return new Date(YYYY, MM - 1, dd, hh, mm, 0).getTime();
  }
  async function checkReminders() {
    const data = getRData("reminders") || { reminders: [] };
    if (data.reminders.length === 0) return;
    const now = Date.now();
    const remaining = [];
    let changed = false;
    for (const r of data.reminders) {
      if (now >= r.triggerAt) {
        changed = true;
        const user = await client.users.fetch(r.userId).catch(() => null);
        try {
          if (r.dm && user) {
            await user.send(`🔔 **Erinnerung:** ${r.text}`);
          } else {
            const channel = await client.channels.fetch(r.channelId).catch(() => null);
            if (channel) await channel.send(`🔔 <@${r.userId}> **Erinnerung:** ${r.text}`);
          }
          if (user) await sendKekseLog("Erinnerung ausgelöst", user, `**Inhalt:** ${r.text}\n**Typ:** ${r.dm ? "DM" : "Channel"}`);
        } catch (err) {
          console.error("[REMINDER] Fehler beim Senden:", err);
        }
      } else {
        remaining.push(r);
      }
    }
    if (changed) {
      data.reminders = remaining;
      await setRData("reminders", data);
    }
  }
  setInterval(checkReminders, 60000);
  client.on("messageCreate", async msg => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    if (cmd === "remind") {
      if (args.length < 2) return msg.channel.send({ content: "❌ Nutzung: `!remind <Zeit/Dauer> <Text> [dm]`", ephemeral: true });
      const timeArg = args.shift();
      const dmFlag = args[args.length - 1]?.toLowerCase() === "dm";
      if (dmFlag) args.pop();
      const text = args.join(" ");
      let triggerAt = timeArg.includes(";") ? parseAbsoluteTime(timeArg) : (Date.now() + parseDuration(timeArg));
      if (!triggerAt || isNaN(triggerAt) || triggerAt <= Date.now()) {
        return msg.channel.send({ content: "❌ Ungültiger Zeitpunkt.", ephemeral: true });
      }
      const reminder = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        userId: msg.author.id,
        channelId: msg.channel.id,
        triggerAt,
        text,
        dm: dmFlag
      };
      const data = getRData("reminders") || { reminders: [] };
      data.reminders.push(reminder);
      await setRData("reminders", data);
      await sendKekseLog("Erinnerung gesetzt", msg.author, `**Text:** ${text}\n**Zeitpunkt:** <t:${Math.floor(triggerAt / 1000)}:f>\n**DM:** ${dmFlag ? "Ja" : "Nein"}`);
      msg.channel.send({ content: `✅ Erinnerung gesetzt für <t:${Math.floor(triggerAt / 1000)}:R>!`, ephemeral: true });
    }
  });
}
client.once("ready", async () => {
    await initInvitesStorage(client);
    await initModerationStorage(client); 
    await initViolationsStorage(client);
    await initDmTicketsStorage(client);
    await initRemindersStorage(client);
    initSupport(client);
    initReminder(client);
    initModeration(client);
    initVerification(client);
    initInvites(client); 
    initAuditLogs(client);
    clear(client);
    warning(client);
    initModSend(client);
    violations(client);
    client.user.setPresence({
      activities: [{ name: "!help", type: 0 }],
      status: "online"
    });
})
client.setMaxListeners(20);
client.on("error", console.error)
client.on("warn", console.warn)
client.login(process.env.BOT_TOKEN)
