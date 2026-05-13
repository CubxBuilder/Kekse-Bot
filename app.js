import { Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, EmbedBuilder, Events, AuditLogEvent, MessageFlags, MessageType, PermissionsBitField, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js"
import https from "https";
import "dotenv/config"
import path from "path"
import mongoose from 'mongoose';
import express from "express"
import { fileURLToPath } from "url"
import fs from "fs"
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express()
app.use("/", express.static(path.join(__dirname, "public")))
const port = process.env.PORT || 5000
app.listen(port, "0.0.0.0", () => {
    console.log(`Server läuft auf Port ${port}`)
})
const stats = {
  messagesSent: 0, membersJoined: 0, membersLeft: 0, commandsRunned: 0,
  ticketsCreated: 0, giveawaysCreated: 0, pollsCreated: 0, remindersCreated: 0,
  voiceChannelsCreated: 0, voiceChannelsDeleted: 0, countingMessagesSent: 0,
  countingMessagesFailed: 0, countingMessagesRecovered: 0,
  pingNow: 0, pingAverage: 0, pingMaximum: 0, pingMinimum: 0
};
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Channel, Partials.Message, Partials.Reaction, 
    Partials.GuildMember, Partials.User, Partials.ThreadMember
    ]
});
async function startStorages() {
    console.log("✅ Alle MongoDB-Storages sind einsatzbereit!");
}
const TEAM_ROLE = "1457906448234319922";
const LOG_CHANNEL_ID = "1423413348220796991";
import { dbGet, dbSet } from './database.js';
export async function getIData(key) {
  return await dbGet("invites", key);
}
export async function setIData(key, value) {
  await dbSet("invites", key, value);
}
export async function getMData(key) {
  return await dbGet("moderation", key);
}
export async function setMData(key, value) {
  await dbSet("moderation", key, value);
}
export async function getVData(key) {
  return await dbGet("violations", key);
}
export async function setVData(key, value) {
  await dbSet("violations", key, value);
}
export async function getTickData(key) {
  return await dbGet("tickets", "tickets"); 
}
export async function setTickData(key, value) {
  await dbSet("tickets", "tickets", value);
}
export async function getRData(key) {
  return await dbGet("reminders", key);
}
export async function setRData(key, value) {
  await dbSet("reminders", key, value);
}
export async function getCouData(key) {
  return await dbGet("counting", key);
}
export async function setCouData(key, value) {
  await dbSet("counting", key, value);
}
export async function getGivData(key) {
  return await dbGet("giveaways", key);
}
export async function setGivData(key, value) {
  await dbSet("giveaways", key, value);
}
export async function getPollData(key) {
  return await dbGet("polls", key);
}
export async function setPollData(key) {
  await dbSet("polls", key, value);
}
export async function setScammData(key, value) {
  return await dbGet("scamm", key);
}
export async function getScammData(key) {
  await dbSet("scamm", key, value);
}
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
      stats.commandsRunned += 1;
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
      const stats = await getIData("invite_stats") || {};
      const leaderboard = Object.entries(stats).map(([id, s]) => ({ id, ...s, total: (s.regular || 0) - (s.left || 0) - (s.fake || 0) + (s.bonus || 0) })).sort((a, b) => b.total - a.total).slice(0, 10);
      if (leaderboard.length === 0) return msg.reply("Keine Daten.");
      let desc = "";
      leaderboard.forEach((e, i) => { desc += `\`${i + 1}. \` <@${e.id}> • **${e.total}** invites. (${e.regular} regular, ${e.left} left, ${e.fake} fake, ${e.bonus} bonus)\n`; });
      const embed = new EmbedBuilder().setTitle("<:statistiques:1467246038497886311> Invite Leaderboard").setDescription(desc).setColor(0xffffff);
      await msg.reply({ embeds: [embed] });
      stats.commandsRunned += 1
    }
    if (cmd === "addbonus" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      const target = msg.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
      const amount = parseInt(args[1]);
      if (!target || isNaN(amount)) return msg.reply("❌ !addbonus @user 10");
      const stats = await getIData("invite_stats") || {};
      stats[target.id] = stats[target.id] || { regular: 0, left: 0, fake: 0, bonus: 0 };
      stats[target.id].bonus = (stats[target.id].bonus || 0) + amount;
      await setIData("invite_stats", stats);
      msg.reply(`✅ +${amount} für ${target.username}`);
      stats.commandsRunned += 1;
    }
  });
  client.on("guildMemberAdd", async (m) => {
    const cached = inviteCache.get(m.guild.id);
    const current = await m.guild.invites.fetch().catch(() => null);
    if (!current || !cached) return;
    const used = current.find(i => i.uses > (cached.get(i.code) || 0));
    inviteCache.set(m.guild.id, new Map(current.map(i => [i.code, i.uses])));
    if (used) {
      const stats = await getIData("invite_stats") || {};
      const rels = await getIData("invite_relations") || {};
      const inviterId = used.inviter.id;
      stats[inviterId] = stats[inviterId] || { regular: 0, left: 0, fake: 0, bonus: 0 };
      rels[m.id] = inviterId;
      const isFake = (Date.now() - m.user.createdTimestamp) < 86400000;
      isFake ? stats[inviterId].fake++ : stats[inviterId].regular++;
      await setIData("invite_stats", stats);
      await setIData("invite_relations", rels);
    }
    stats.membersJoined += 1;
  });
  client.on("guildMemberRemove", async (m) => {
    const rels = await getIData("invite_relations") || {};
    const inviterId = rels[m.id];
    if (inviterId) {
      const stats = await getIData("invite_stats") || {};
      if (stats[inviterId]) { stats[inviterId].left++; await setIData("invite_stats", stats); }
      delete rels[m.id];
      await setIData("invite_relations", rels);
    }
    stats.membersLeft += 1;
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
    let data = await getMData("moderation") || { warns: {} };

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
      const durationMs = parseTimDuration(match[1], match[2]);

      try {
        const member = await msg.guild.members.fetch(user.id);
        await member.timeout(durationMs, reason);
        await sendModLog("Timeout", user, reason, `Dauer: ${durationStr}`);
        await msg.reply({ content: `✅ **Timeout**: <@${user.id}> für ${durationStr}.`, ephemeral: true });
      } catch (err) { 
        await msg.reply({ content: "❌ Fehler: User nicht auf Server oder fehlende Rechte.", ephemeral: true }); 
      }
      stats.commandsRunned += 1;
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
      stats.commandsRunned += 1;
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
      stats.commandsRunned += 1;
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
      stats.commandsRunned += 1;
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
      stats.commandsRunned += 1;
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
      stats.commandsRunned += 1;
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
      stats.commandsRunned += 1;
    }

    if (cmd === "warn_remove") {
      const user = await getUser(args[0]);
      const index = parseInt(args[1]) - 1;
      if (!user || isNaN(index) || !data.warns[user.id]?.[index]) return msg.reply({ content: "❌ Ungültiger Index.", ephemeral: true });

      const removed = data.warns[user.id].splice(index, 1);
      await setMData("moderation", data);
      await sendModLog("Warn entfernt", user, `Grund war: ${removed[0].reason}`);
      await msg.reply({ content: "✅ Warnung entfernt.", ephemeral: true });
      stats.commandsRunned += 1;
    }
  });
}

function parseTimDuration(amount, unit) {
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
      stats.usersVerified += 1;
      stats.commandsRunned += 1;
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
        stats.commandsRunned += 1;
        
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
    const data = await getVData("violations");
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
    const violations = await getVData("violations") || {};
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
  function parseRemDuration(str) {
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
    const data = await getRData("reminders") || { reminders: [] };
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
      let triggerAt = timeArg.includes(";") ? parseAbsoluteTime(timeArg) : (Date.now() + parseRemDuration(timeArg));
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
      const data = await getRData("reminders") || { reminders: [] };
      data.reminders.push(reminder);
      await setRData("reminders", data);
      await sendKekseLog("Erinnerung gesetzt", msg.author, `**Text:** ${text}\n**Zeitpunkt:** <t:${Math.floor(triggerAt / 1000)}:f>\n**DM:** ${dmFlag ? "Ja" : "Nein"}`);
      msg.channel.send({ content: `✅ Erinnerung gesetzt für <t:${Math.floor(triggerAt / 1000)}:R>!`, ephemeral: true });
      stats.remindersCreated += 1;
      stats.commandsRunned += 1;
    }
  });
}
const COUNTING_CHANNEL = "1423434079390535730";
let countingData = {
  currentNumber: 1,
  direction: 1,
  lastUserId: null,
  lastCountingTime: null,
  scoreboard: {}
};
async function loadCounting() {
  const stored = await getCouData("counting");
  if (stored) {
    countingData = stored;
  } else {
    await saveCounting();
  }
}
async function saveCounting() {
  await setCouData("counting", countingData);
}
export async function initCounting(client) {
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
      .setFooter({ text: 'Kekse Clan | Counting System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };

  const handleCounting = async (msg, syncMode = false) => {
    if (!syncMode && msg.author.bot) return;
    if (msg.channel.id !== COUNTING_CHANNEL) return;
    await loadCounting();
    if (!syncMode && msg.content === "!top") {
      const sorted = Object.entries(countingData.scoreboard)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const embed = new EmbedBuilder()
        .setTitle("🏆 Top 10 Counter")
        .setDescription(sorted.map(([id, s], i) => `${i + 1}. <@${id}> • ${s}`).join("\n") || "Keine Daten")
        .setColor('#ffffff')
        .setFooter({ text: 'Kekse Clan' });
      await msg.reply({ embeds: [embed] });
      stats.commandsRunned += 1;
      return;
    }
    const match = msg.content.trim().match(/^-?\d+/);
    if (!match && !syncMode && msg.content.startsWith("!set_number")) {
        if (msg.author.id !== "1151971830983311441") return;
        const args = msg.content.split(" ");
        const newNum = parseInt(args[1]);
        if (isNaN(newNum)) return;
        countingData.currentNumber = newNum;
        countingData.direction = newNum < 0 ? -1 : 1;
        await saveCounting();
        await sendKekseLog("Counting Reset (Admin)", msg.author, `Die Zahl wurde manuell auf **${newNum}** gesetzt.`);
        stats.commandsRunned += 1;
        return msg.reply(`✅ Die nächste Zahl wurde auf **${newNum}** gesetzt.`);
    }
    if (!match) return;
    const num = parseInt(match[0]);
    if (countingData.currentNumber === 1 && countingData.lastUserId === null) {
      if (num === 1 || num === -1) {
        countingData.direction = num;
        countingData.currentNumber = num + countingData.direction;
        countingData.lastUserId = msg.author.id;
        countingData.lastCountingTime = msg.createdTimestamp;
        const excludedUsers = ["1151971830983311441", "1274320881585356892"];
        if (!excludedUsers.includes(msg.author.id)) {
          countingData.scoreboard[msg.author.id] ??= 0;
          countingData.scoreboard[msg.author.id]++;
        }
        await saveCounting();
        if (!syncMode) return await msg.react("✅");
        return;
      }
    }
    if (num !== countingData.currentNumber || msg.author.id === countingData.lastUserId) {
      if (!syncMode) {
        const reason = num !== countingData.currentNumber ? `Falsche Zahl (${num} statt ${countingData.currentNumber})` : "Doppel-Post";     
        await sendKekseLog("Counting Fehler", msg.author, `**Grund:** ${reason}\n**Reset auf:** 1 / -1`);
        countingData.currentNumber = 1;
        countingData.direction = 1;
        countingData.lastUserId = null;
        countingData.lastCountingTime = msg.createdTimestamp;
        await saveCounting();
        await msg.react("❌");
        const replyContent = msg.author.id === countingData.lastUserId
          ? `❌ <@${msg.author.id}>, nicht zwei mal nacheinander! Zurück auf den Start (1 oder -1).`
          : `❌ <@${msg.author.id}> hat falsch gezählt! Zurück auf den Start (1 oder -1).`;
        stats.countingMessagesFailed += 1;
        return msg.reply(replyContent);
      }
      return;
    }
    countingData.currentNumber = num + (countingData.direction || 1);
    countingData.lastUserId = msg.author.id;
    countingData.lastCountingTime = msg.createdTimestamp;
    const excludedUsers = ["1151971830983311441", "1274320881585356892"];
    if (!excludedUsers.includes(msg.author.id)) {
      countingData.scoreboard[msg.author.id] ??= 0;
      countingData.scoreboard[msg.author.id]++;
      stats.countingMessagesSent += 1;
    }
    await saveCounting();
    if (!syncMode) await msg.react("✅");
    countingData.lastMessageId = msg.id;
    await saveCounting();
  };

  const runSync = async () => {
    console.log("🔄 Starte Counting-Synchronisation...");
    await loadCounting();
    const channel = await client.channels.fetch(COUNTING_CHANNEL).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    let lastId = countingData.lastMessageId;
    let totalRecovered = 0;
    if (!lastId) {
      const lastMsg = await channel.messages.fetch({ limit: 1 });
      countingData.lastMessageId = lastMsg.first()?.id;
      await saveCounting();
      console.log("📍 Keine Referenz-ID gefunden. Starte ab der aktuellsten Nachricht.");
      return;
    }
    try {
      let hasMore = true;
      while (hasMore) {
        const missedMessages = await channel.messages.fetch({ 
          after: lastId, 
          limit: 100 
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
          if (missedMessages.size === 100) await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (totalRecovered > 0) {
        console.log(`✅ Synchronisation abgeschlossen. ${totalRecovered} Nachrichten nachgeholt.`);
        stats.countingMessagesRecovered += totalRecovered;
      } else {
        console.log("✨ Alles aktuell. Keine verpassten Zahlen gefunden.");
      }
    } catch (err) {
      console.error("❌ Fehler bei der Synchronisation:", err);
    }
  };

  if (client.isReady()) runSync(); else client.once(Events.ClientReady, runSync);
  client.on(Events.MessageCreate, async msg => {
    await handleCounting(msg, false);
  });
}
await loadCounting();
const GIVEAWAY_EMOJI = "🎉";
const BOOSTER_ROLE_ID = "1464202435638722621";
const REPORT_CHANNEL_ID = LOG_CHANNEL_ID;
const EMBED_COLOR = 0xffffff;
export function initGiveaway(client) {
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
      .setFooter({ text: 'Kekse Clan | Giveaway System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  const checkGiveaways = async () => {
    const giveaways = await getGivData("activeGiveaways") || {};
    const now = Date.now();
    let changed = false;
    for (const [msgId, data] of Object.entries(giveaways)) {
      const channel = await client.channels.fetch(data.channelId).catch(() => null);
      if (!channel) continue;
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (!msg) {
        delete giveaways[msgId];
        changed = true;
        continue;
      }
      if (now >= data.endTime) {
        const giveawayData = data;
        delete giveaways[msgId];
        changed = true;
        await setGivData("activeGiveaways", giveaways);
        changed = false;
        await endGiveaway(client, msg, giveawayData, sendKekseLog);
      } else {
        const embed = EmbedBuilder.from(msg.embeds[0])
          .setDescription(`${data.messageText}\n\nEndet am: <t:${Math.floor(data.endTime / 1000)}:R> (<t:${Math.floor(data.endTime / 1000)}:f>)\nTeilnehmer: **${data.participants?.length || 0}**\nGewinner: **${data.winnerCount}**`);
        await msg.edit({ embeds: [embed] }).catch(() => {});
      }
    }
    if (changed) await setGivData("activeGiveaways", giveaways);
  };
  setInterval(checkGiveaways, 10000);
  client.on("messageCreate", async msg => {
    if (!msg.content.startsWith("!giveaway") || msg.author.bot) return;
    if (!msg.member.roles.cache.has(TEAM_ROLE_ID)) return msg.reply("❌ Keine Rechte.");
    const args = msg.content.slice(1).match(/(?:[^\s"]+|"[^"]*")+/g)?.map(a => a.replace(/"/g, "")) || [];
    args.shift();
    if (args.length < 3) return msg.reply("Syntax: `!giveaway #channel 1h \"Preis\" \"Text\" winners=2`");
    const channel = msg.mentions.channels.first() || msg.guild.channels.cache.get(args[0]);
    if (!channel) return msg.reply("❌ Kanal nicht gefunden.");
    const durationMs = parseDuration(args[1]);
    if (durationMs <= 0) return msg.reply("❌ Zeitformat ungültig (z.B. 1h, 30m, 1d).");
    const price = args[2];
    const messageText = args[3] || "Viel Glück 🍀";
    let winnerCount = 1;
    args.forEach(arg => {
      if (arg.startsWith("winners=")) winnerCount = parseInt(arg.split("=")[1]) || 1;
    });
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    const embed = new EmbedBuilder()
      .setTitle(`🎁 Giveaway: ${price}`)
      .setDescription(`${messageText}\n\nEndet am: <t:${Math.floor(endTime / 1000)}:R> (<t:${Math.floor(endTime / 1000)}:f>)\nTeilnehmer: **0**\nGewinner: **${winnerCount}**`)
      .setColor(EMBED_COLOR);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`join_giveaway`)
        .setLabel("Teilnehmen")
        .setEmoji(GIVEAWAY_EMOJI)
        .setStyle(ButtonStyle.Primary)
    );
    const giveawayMsg = await channel.send({
      content: "<@&1424028650080178348>",
      embeds: [embed],
      components: [row]
    });
    const giveaways = await getGivData("activeGiveaways") || {};
    giveaways[giveawayMsg.id] = {
      channelId: channel.id,
      startTime, endTime, price, messageText, winnerCount,
      hostId: msg.author.id,
      participants: []
    };
    await setGivData("activeGiveaways", giveaways);
    await sendKekseLog("Giveaway gestartet", msg.author, `**Preis:** ${price}\n**Kanal:** ${channel}\n**Dauer:** ${args[1]}\n**Gewinner:** ${winnerCount}`);
    stats.commandsRunned += 1;
    stats.giveawaysCreated += 1;
    await msg.delete().catch(() => {});
  });
  client.on("interactionCreate", async interaction => {
    if (!interaction.isButton() || interaction.customId !== "join_giveaway") return;
    const giveaways = await getGivData("activeGiveaways") || {};
    const data = giveaways[interaction.message.id];
    if (!data) return interaction.reply({ content: "❌ Dieses Giveaway ist nicht mehr aktiv.", ephemeral: true });
    if (data.participants.includes(interaction.user.id)) {
        return interaction.reply({ content: "ℹ️ Du nimmst bereits an diesem Giveaway teil!", ephemeral: true });
    }
    data.participants.push(interaction.user.id);
    await setGivData("activeGiveaways", giveaways);
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setDescription(`${data.messageText}\n\nEndet am: <t:${Math.floor(data.endTime / 1000)}:R> (<t:${Math.floor(data.endTime / 1000)}:f>)\nTeilnehmer: **${data.participants.length}**\nGewinner: **${data.winnerCount}**`);
    await interaction.update({ embeds: [updatedEmbed] }).catch(() => {});
  });
}
async function endGiveaway(client, msg, data, logFunc) {
  const guild = msg.guild;
  const participants = data.participants || [];
  let rafflePool = [];
  for (const userId of participants) {
    rafflePool.push(userId);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && member.roles.cache.has(BOOSTER_ROLE_ID)) {
        rafflePool.push(userId);
    }
  }
  const winners = [];
  const shuffledPool = rafflePool.sort(() => Math.random() - 0.5);
  for (const id of shuffledPool) {
    if (winners.length >= data.winnerCount) break;
    if (!winners.includes(id)) winners.push(id);
  }
  const winnerMentions = winners.length ? winners.map(id => `<@${id}>`).join(", ") : "Niemand";
  const endEmbed = EmbedBuilder.from(msg.embeds[0])
    .setTitle(`🎊 Giveaway beendet: ${data.price}`)
    .setDescription(`${data.messageText}\n\nBeendet am: <t:${Math.floor(data.endTime / 1000)}:f>\nTeilnehmer: **${participants.length}**\nGewinner: ${winnerMentions}`)
    .setColor(0x2f3136);
  await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
  if (winners.length > 0) {
    await msg.channel.send(`🎉 Glückwunsch ${winnerMentions}! Du hast **${data.price}** gewonnen!\nMelde dich bitte zeitnah im Support.`);
  }
  const host = await client.users.fetch(data.hostId).catch(() => client.user);
  await logFunc("Giveaway beendet", host, `**Preis:** ${data.price}\n**Teilnehmer:** ${participants.length}\n**Gewinner:** ${winnerMentions}`);
  const reportChannel = await client.channels.fetch(REPORT_CHANNEL_ID).catch(() => null);
  if (reportChannel) {
    const report = { 
        giveaway_id: msg.id, 
        prize: data.price, 
        host: data.hostId,
        winners: winners, 
        total_participants: participants.length,
        participant_list: participants
    };   
    const buffer = Buffer.from(JSON.stringify(report, null, 2), 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `report_${msg.id}.json` });
    await reportChannel.send({ 
        content: `📊 **Giveaway Report**\n**Preis:** ${data.price}\n**ID:** ${msg.id}`, 
        files: [attachment] 
    });
  }
}
function parseDuration(input) {
  if (!input) return 0;
  const match = input.match(/^(\d+)(s|sec|m|min|h|std|d|tag|tage)$/i);
  if (!match) return 0;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('s')) return value * 1000;
  if (unit.startsWith('m')) return value * 60000;
  if (unit.startsWith('h') || unit === 'std') return value * 3600000;
  if (unit.startsWith('d') || unit.startsWith('t')) return value * 86400000;
  return 0;
}
export function initHelp(client) {
  client.on("messageCreate", async msg => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith("!")) return;

    const args = msg.content.slice(1).trim().split(" ");
    const cmd = args.shift().toLowerCase();

    if (cmd !== "help") return;

    console.log(`[HELP] Von ${msg.author.username}`);
    await msg.channel.send(
      "Erstelle ein <#1423413348493430905>. Ein Moderator wird sich so schnell wie möglich um dein Anliegen kümmern."
    );
    stats.commandsRunned += 1;
  });
}
export function registerMessageCommands(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;

    const teamRole = "1457906448234319922";
    const logChannelId = "1423413348220796991";

    if (!msg.member.roles.cache.has(teamRole) && !msg.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

    const args = msg.content.slice(1).match(/(?:[^\s"]+|"[^"]*")+/g)?.map(a => a.replace(/"/g, "")) || [];
    const cmd = args.shift().toLowerCase();
    const deleteCmd = () => msg.delete().catch(() => {});

    const sendKekseLog = async (commandName, target, content) => {
      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel) {
        const kekseEmbed = new EmbedBuilder()
          .setColor('#ffffff')
          .setAuthor({ 
              name: msg.author.username, 
              iconURL: msg.author.displayAvatarURL({ size: 512 }) 
          })
          .setDescription(`**Aktion:** \`!${commandName}\`\n**Ziel:** ${target}\n**Inhalt:**\n\`\`\`${content || "Kein Inhalt"}\`\`\``)
          .setFooter({ text: 'Kekse Clan | Command Logs' })
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
        stats.commandsRunned += 1;
      }
    }

    if (cmd === "changelog") {
      await deleteCmd();
      const changelogChannel = msg.guild.channels.cache.get("1464993818968588379");
      if (!changelogChannel || args.length === 0) return;
      const date = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      const updateList = args.map(item => `- ${item}`).join("\n");
      const messageFormat = `<@&1464994942345547857>\n**:wrench: Änderungen (${date})**\n${updateList}`;
      await changelogChannel.send(messageFormat);
      await sendKekseLog("changelog", changelogChannel.toString(), updateList);
      stats.commandsRunned += 1;
    }

    if (cmd === "embed") {
      await deleteCmd();
      const channel = msg.mentions.channels.first();
      const title = args[1];
      const text = args[2];
      const color = args[3] || "#ffffff";
      if (channel && title && text) {
        const embed = new EmbedBuilder().setTitle(title).setDescription(text).setColor(color);
        await channel.send({ embeds: [embed] });
        await sendKekseLog("embed", channel.toString(), `Titel: ${title}\nText: ${text}`);
        stats.commandsRunned += 1;
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
        stats.commandsRunned += 1;
      }
    }

    if (cmd === "news") {
      await deleteCmd();
      const channel = msg.mentions.channels.first();
      if (!channel) return;
      let rawText = msg.content.replace(/^!news\s+<#[0-9]+>\s?/, "").trim();
      if (!rawText) return;
      const emojiMap = { "regles": "1467246063122649180", "mail": "1467246078226334040", "like": "1467246068235501733", "management": "1467246065437642999", "moins": "1467246060689690849", "info": "1467246059561685238", "web": "1467246058341142833", "dislike": "1467246057070268681", "logs": "1467246054910070938", "check": "1467246053911957759", "staff": "1467246044772569218", "lien": "1467246043182924040", "identifiant": "1467246041668780227", "cybersecurite": "1467246039731015794", "statistiques": "1467246038497886311", "administrateur": "1467246035922321478", "croix": "1467246034580410429", "certifier": "1467246033389092904", "supprimer": "1467246032181006499", "profil": "1467246030998343733", "moderateur": "1467246028758712575", "crayon": "1467246026846109821", "stats": "1467246025411658012", "ouvert": "1467246023872352358", "discordoff": "1467246022668583147", "warningicon": "1467246020445339875", "2nd": "1467246019556282533", "discordon": "1467246018218430696", "1st": "1467246016926453810", "help": "1467246015332618372", "timeout": "1467246013487255705", "unstableping": "1467246011578712186", "yinfo": "1467246010349785119", "3rd": "1467246008734847138", "failed": "1467246005870264352", "mute": "1467246003890425928", "verified": "1467246002628202507", "cross": "1467246000258420767", "interruption": "1467245998043824128", "checkmark": "1467245996584210554", "moderatorprogramsalumnia": "1467245995510337659", "pingeveryone": "1453800508329558218", "ping": "1453799622303813714", "pepecookie": "1453796363442585660" };
      const formattedText = rawText.replace(/:([a-zA-Z0-9_]+):/g, (match, name) => {
        return emojiMap[name] ? `<:emoji:${emojiMap[name]}>` : match;
      });
      await channel.send(formattedText);
      await sendKekseLog("news", channel.toString(), rawText);
      stats.commandsRunned += 1;
    }

    if (cmd === "reply") {
      await deleteCmd();
      const channelMention = msg.mentions.channels.first() || msg.channel;
      const msgId = args.find(a => /^\d{17,20}$/.test(a));
      let text = args.filter(a => !a.includes(msgId) && !a.startsWith("<#")).join(" ");
      if (!msgId || !text) return;
      stats.commandsRunned += 1;
      try {
        const targetMsg = await channelMention.messages.fetch(msgId);
        targetMsg.system ? await channelMention.send(text) : await targetMsg.reply(text);
        await sendKekseLog("reply", `Nachricht ID ${msgId}`, text);
      } catch (err) {
        await msg.channel.send("❌ Nachricht nicht gefunden.").then(m => setTimeout(() => m.delete(), 3000));
      }
    }
  });
}
export function initPing(client) {
  client.on("messageCreate", async msg => {
    if (!msg.content.startsWith("!ping") || msg.author.bot) return;
    if (!msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      const warn = await msg.channel.send("❌ Keine Berechtigung.");
      return setTimeout(() => {
        warn.delete().catch(() => {});
        msg.delete().catch(() => {});
      }, 5000);
    }
    stats.commandsRunned += 1;
    const start = Date.now();
    const sentMsg = await msg.channel.send("🏓 Pinging...").catch(() => null);
    if (!sentMsg) return;
    const end = Date.now();
    const roundtrip = end - start;
    const wsPing = client.ws.ping; 
    await sentMsg.edit({
      content: `🏓 **Pong!**\n- API-Latenz: \`${roundtrip}ms\`\n- WebSocket: \`${wsPing}ms\``
    }).catch(() => {});
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      const kekseLog = new EmbedBuilder()
        .setColor('#ffffff')
        .setAuthor({ 
            name: msg.author.username, 
            iconURL: msg.author.displayAvatarURL({ size: 512 }) 
        })
        .setDescription(`**Aktion:** \`!ping\`\n**Ergebnis:** RT: \`${roundtrip}ms\` | WS: \`${wsPing}ms\``)
        .setFooter({ text: 'Kekse Clan | System Check' })
        .setTimestamp();
      
      await logChannel.send({ embeds: [kekseLog] });
    }
    setTimeout(() => {
        sentMsg.delete().catch(() => {});
        msg.delete().catch(() => {});
    }, 10000);
  });
}
export function initPoll(client) {
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
      .setFooter({ text: 'Kekse Clan | Poll System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return; 
    const args = msg.content.slice(1).match(/(?:[^\s,"]+|"[^"]*")+/g)?.map(a => a.replace(/"/g, "").trim()) || [];
    const cmd = args.shift()?.toLowerCase();
    if (cmd === "poll") {
      if (!msg.member.roles.cache.has(TEAM_ROLE_ID))
        return msg.channel.send("❌ Du hast keine Berechtigung.");    
      if (args.length < 4) return msg.reply("❌ Nutzung: `!poll \"Frage\" \"Minuten\" ...`.");
      const [question, timeStr, description, ...options] = args;
      const time = parseInt(timeStr);
      if (isNaN(time) || options.length < 2 || options.length > 10) return msg.reply("❌ Fehlerhafte Parameter.");
      const pollId = msg.id;
      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      const pollOptions = options.map((opt, i) => ({ text: opt, emoji: emojis[i], votes: 0 }));
      const endTime = Date.now() + time * 60000;
      const pollContent = createPollText(question, description, pollOptions, endTime, 0, pollId, msg.author);
      const pollMsg = await msg.channel.send(pollContent);
      for (let i = 0; i < pollOptions.length; i++) {
        await pollMsg.react(pollOptions[i].emoji).catch(() => {});
      }
      const polls = await getPollData("polls_data") || [];
      polls.push({
        id: pollId, messageId: pollMsg.id, channelId: msg.channel.id,
        question, description, options: pollOptions, endTime,
        creatorId: msg.author.id, voters: [], closed: false
      });
      await setPollData("polls_data", polls);
      await sendKekseLog("Umfrage gestartet", msg.author, `**Frage:** ${question}\n**Dauer:** ${time} Min.\n**ID:** \`${pollId}\``);
      stats.pollsCreated += 1;
    }
    if (cmd === "closepoll") {
      if (!msg.member.roles.cache.has(TEAM_ROLE_ID)) return;
      const pollId = args[0];
      const polls = getPollData("polls_data") || [];
      const poll = polls.find(p => p.id === pollId && !p.closed);
      
      if (!poll) return msg.reply("❌ Poll nicht gefunden.");
      await closePoll(client, poll, polls, msg.author);
      stats.commandsRunned += 1;
    }
    if (cmd === "listpolls") {
      const polls = getPollData("polls_data") || [];
      const activePolls = polls.filter(p => !p.closed);
      if (activePolls.length === 0) return msg.reply("Keine aktiven Polls.");
      const list = activePolls.map(p => `ID: \`${p.id}\` | ${p.question}`).join("\n");
      msg.reply(`**Aktive Polls:**\n${list}`);
      stats.commandsRunned += 1;
    }
  });
  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    let polls = getPollData("polls_data") || [];
    const poll = polls.find(p => p.messageId === reaction.message.id && !p.closed);
    if (!poll) return;
    const option = poll.options.find(o => o.emoji === reaction.emoji.name);
    if (!option || poll.voters.includes(user.id)) return reaction.users.remove(user.id).catch(() => {});
    poll.voters.push(user.id);
    option.votes++;
    await setPollData("polls_data", polls);
    const creator = await client.users.fetch(poll.creatorId).catch(() => ({ toString: () => "Unknown" }));
    await reaction.message.edit(createPollText(poll.question, poll.description, poll.options, poll.endTime, poll.voters.length, poll.id, creator)).catch(() => {});
    await reaction.users.remove(user.id).catch(() => {});
  });
  setInterval(async () => {
    const data = await getPollData("polls") || { polls_data: [] };
    const polls = data.polls_data || [];
    const now = Date.now();
    for (const poll of polls) {
      if (!poll.closed && poll.endTime <= now) {
        const creator = await client.users.fetch(poll.creatorId).catch(() => client.user);
        await closePoll(client, poll, polls, creator);
      }
    }
  }, 30000);
}
function createPollText(q, d, opts, end, count, id, author) {
  return `## ${q}\n${d}\n\n` +
    opts.map(o => `${o.emoji} ${o.text}`).join("\n") + `\n\n` +
    `<:info:1467246059561685238> Endet am: <t:${Math.floor(end / 1000)}:R>\n` +
    `<:profil:1467246030998343733> Erstellt von: ${author}\n` +
    `<:statistiques:1467246038497886311> Teilnehmer: **${count}**\n` +
    `<:identifiant:1467246041668780227> ID: \`${id}\``;
}
async function closePoll(client, poll, polls, closer) {
  poll.closed = true;
  await setPollData("polls_data", polls);
  const channel = await client.channels.fetch(poll.channelId).catch(() => null);
  const pollMsg = await channel?.messages.fetch(poll.messageId).catch(() => null);
  if (!pollMsg) return;
  await pollMsg.reactions.removeAll().catch(() => {});
  const total = poll.voters.length;
  let resultsText = `## <:statistiques:1467246038497886311> Ergebnisse: ${poll.question}\n\n`;
  if (total === 0) resultsText += "Keine Teilnehmer.";
  else {
    const winnerVotes = Math.max(...poll.options.map(o => o.votes));
    poll.options.forEach(o => {
      const perc = Math.round((o.votes / total) * 100);
      resultsText += `${o.emoji} **${o.text}**\n**${o.votes} Stimmen** (${perc}%)${o.votes === winnerVotes && total > 0 ? " <:checkmark:1467245996584210554>" : ""}\n\n`;
    });
  }
  await channel.send(resultsText);
  const logChannel = client.channels.cache.get("1423413348220796991");
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setColor('#ffffff')
      .setAuthor({ name: closer.username, iconURL: closer.displayAvatarURL() })
      .setDescription(`**Aktion:** \`Umfrage beendet\`\n**Frage:** ${poll.question}\n**Teilnehmer:** ${total}\n**ID:** \`${poll.id}\``)
      .setFooter({ text: 'Kekse Clan | Poll System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] });
  }
  const updatedPolls = (getPollData("polls_data") || []).filter(p => p.id !== poll.id);
  await setPollData("polls_data", updatedPolls);
}

export function initReactions(client) {
  const userContext = new Map();

  client.on("messageCreate", async message => {
    if (message.author.bot) return;

    if (message.type === MessageType.GuildBoost || 
        message.type === MessageType.GuildBoostTier1 || 
        message.type === MessageType.GuildBoostTier2 || 
        message.type === MessageType.GuildBoostTier3) {
      try {
        console.log(`[BOOST] Boost erkannt von ${message.author.username}. Sende Herz-Nachricht.`);
        await message.react("❤️");
      } catch (err) {
        console.error("[BOOST] Fehler beim Senden der Herz-Antwort:", err);
      }
      return;
    }

    const content = message.content.toLowerCase().trim();

    if (message.content.includes("🍪")) {
      try {
        console.log(`[REACTION] Keks-Reaktion für ${message.author.username}`);
        await message.channel.send("<:pepecookie:1453796363442585660>");
      } catch {}
    }

    if (message.mentions.everyone) {
      try {
        console.log(`[REACTION] Everyone-Ping-Reaktion für ${message.author.username}`);
        await message.channel.send("<a:pingeveryone:1453800508329558218>");
      } catch {}
    } else if (message.mentions.has(client.user.id)) {
      try {
        console.log(`[REACTION] Bot-Ping-Reaktion für ${message.author.username}`);
        await message.channel.send("<:ping:1453799622303813714>");
      } catch {}
    }
  });
}
const TRIGGERS = [
  "bot reagiert", "bot funzt", "bot geht", "keine reaktion vom bot",
  "bot antwortet", "bot macht nix", "ticket wird erstellt", "ticket öffnet",
  "ticket geht", "kann ticket öffnen", "ticket befehl funzt", "keine rechte",
  "kann channel sehen", "kann schreiben", "berechtigung fehlt",
  "nachricht senden", "kann nachricht löschen", "reaktion wird erkannt",
  "emoji geht", "button funzt", "reaction auf panel", "ticket schließen",
  "ticket löschen", "archiv wird erstellt", "rollen werden erkannt",
  "channel verschieben", "kategorie kann gesetzt werden",
  "bot hat admin rechte", "bot kann nachricht pinnen",
  "permission", "bot", "discord", "role", "rolle"
];

const SUPPORT_CATEGORY = "1423413348065611953";
const ADMIN_CATEGORY = "1426271033047912582";
const ADMIN_ROLE = "1423427747103113307";

export function initTicketCategory(client) {
  const askedUsers = new Set();

  client.on("messageCreate", async msg => {
    if (msg.author.bot || !msg.guild) return;

    if (msg.content.startsWith("!moveadmin")) {
        if (!msg.member.roles.cache.has(TEAM_ROLE)) return;
        await msg.delete().catch(() => {});
        return moveChannelToAdmin(msg.channel, true);
        stats.commandsRunned += 1;
    }

    const channel = msg.channel;
    if (channel.parentId !== SUPPORT_CATEGORY) return;

    const content = msg.content.toLowerCase();
    const foundTrigger = TRIGGERS.find(t => content.includes(t));
    
    if (!foundTrigger || (foundTrigger.length < 4 && content !== foundTrigger)) return;
    if (askedUsers.has(msg.author.id)) return;

    askedUsers.add(msg.author.id);
    const isGerman = TRIGGERS.indexOf(foundTrigger) <= 30;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('move_yes').setLabel(isGerman ? 'Ja / Yes' : 'Yes').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('move_no').setLabel(isGerman ? 'Nein / No' : 'No').setStyle(ButtonStyle.Danger)
    );

    const questionText = isGerman
      ? `⚠️ <@${msg.author.id}>, Schlüsselwort "**${foundTrigger}**" erkannt. Benötigt dieses Ticket einen **Admin**?`
      : `⚠️ <@${msg.author.id}>, keyword "**${foundTrigger}**" detected. Does this ticket require an **Admin**?`;

    const questionMsg = await channel.send({ content: questionText, components: [row] });

    const collector = questionMsg.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: 30000 
    });

    collector.on('collect', async i => {
      if (i.user.id !== msg.author.id) {
          return i.reply({ content: isGerman ? "Nur der Ticket-Ersteller kann das entscheiden." : "Only the ticket creator can decide.", ephemeral: true });
      }

      if (i.customId === 'move_yes') {
        await i.update({ content: isGerman ? "⏳ Verschiebe..." : "⏳ Moving...", components: [] });
        await moveChannelToAdmin(channel, isGerman);
        stats.commandsRunned += 1;
      } else {
        await i.update({ content: isGerman ? "👍 Support übernimmt." : "👍 Support will handle it.", components: [] });
        setTimeout(() => questionMsg.delete().catch(() => {}), 5000);
      }
      collector.stop();
    });

    collector.on('end', (collected, reason) => {
      askedUsers.delete(msg.author.id);
      if (reason === 'time') questionMsg.delete().catch(() => {});
    });
  });
}

async function moveChannelToAdmin(channel, isGerman) {
    try {
        await channel.setParent(ADMIN_CATEGORY, { lockPermissions: true });
        await channel.send(isGerman 
          ? `✅ Dieses Ticket wurde zu den **Admins** verschoben.\n<@&${ADMIN_ROLE}>` 
          : `✅ This ticket has been moved to the **Admins**.\n<@&${ADMIN_ROLE}>`
        );
    } catch (err) {
        console.error("Fehler beim Verschieben:", err);
        await channel.send("❌ Fehler beim Verschieben des Channels.");
    }
}
const ARCHIVE_CATEGORY_ID = "1465452886657077593";
const ADMIN_ROLE_ID = "1423427747103113307";
const CATEGORY_EMOJI = { Support: "⚙️", Abholung: "🎉", Bewerbung: "✉️" };
const CATEGORY_CHANNELS = {
  Support: "1423413348065611953",
  Abholung: "1423413348065611953",
  Bewerbung: "1434277752982474945"
};
let ticketData = { lastId: 0, tickets: {} };
async function loadTickets() {
  const stored = await getTickData("tickets");
  if (stored) ticketData = stored;
}
async function saveTickets() {
  await setTickData("tickets", ticketData);
}
async function isBlocked(userId) {
  const blocked = await getTickData("blocked_users") || {};
  if (!blocked[userId]) return false;
  if (Date.now() > blocked[userId].until) {
    delete blocked[userId];
    await setTickData("blocked_users", blocked);
    return false;
  }
  return true;
}
async function blockUser(userId, username, durationMs = 7 * 24 * 60 * 60 * 1000) {
  const blocked = await getTickData("blocked_users") || {};
  blocked[userId] = {
    username,
    until: Date.now() + durationMs,
    reason: "Spam / Limit überschritten"
  };
  await setTickData("blocked_users", blocked);
}
export async function initTickets(client) {
  await loadTickets();
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor('#ffffff')
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 512 }) })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: 'Kekse Clan | Ticket System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  async function sendTicketPanel(channel) {
    const embed = new EmbedBuilder()
      .setTitle("Wähle den passenden Button für dein Anliegen.")
      .setDescription(
        "Ein Mitglied der Administration wird sich so schnell wie möglich um dich kümmern.\n\n" +
        "**⚙️ Support:** Allgemeine Anliegen\n" +
        "**🎉 Abholung:** Gewinn-Abholung\n" +
        "**✉️ Bewerbung:** Clan-Bewerbungen"
      )
      .setColor(0xffffff);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('t_Support').setLabel('Support').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('t_Abholung').setLabel('Abholung').setEmoji('🎉').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('t_Bewerbung').setLabel('Bewerbung').setEmoji('✉️').setStyle(ButtonStyle.Secondary)
    );
    await channel.send({ embeds: [embed], components: [row] });
  }
  async function createTicket(category, user, guild) {
  if (await isBlocked(user.id)) return;
  const stored = await getTickData("tickets") || { tickets: { lastId: 0 } };
  if (!stored.tickets) stored.tickets = { lastId: 0 };
  const currentLastId = parseInt(stored.tickets.lastId) || 0;
  const id = currentLastId + 1;
  const idString = id.toString().padStart(4, "0");
  stored.tickets.lastId = id;
  const parentId = CATEGORY_CHANNELS[category];
  try {
    const channel = await guild.channels.create({
      name: `${CATEGORY_EMOJI[category]}-${category}-${idString}`,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: TEAM_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });
    stored.tickets[idString] = {
      idString,
      category,
      username: user.username,
      userId: user.id,
      channelId: channel.id,
      created: Date.now()
    };
    await setTickData("tickets", stored);
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`Ticket ${idString}`)
      .setDescription(`**User:** ${user.username}\n**Kategorie:** ${category}\n**Erstellt:** <t:${Math.floor(Date.now() / 1000)}:F>`)
      .setColor(0xffffff);
    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('t_close')
        .setLabel('Ticket schließen')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );
    const greetings = {
      Support: `Hey <@${user.id}>, bitte beschreibe dein Anliegen genauer.`,
      Abholung: `Hey <@${user.id}>, wir benötigen deinen **Minecraft Namen** und die **Info zum Gewinn**.`,
      Bewerbung: `Hey <@${user.id}>, ein Teammitglied wird sich in Kürze melden.`
    };
    await channel.send({ 
      content: `<@&${TEAM_ROLE_ID}>`, 
      embeds: [ticketEmbed], 
      components: [closeRow], 
      flags: MessageFlags.SuppressNotifications 
    });
    await channel.send({ content: greetings[category] });
    await sendKekseLog("Ticket Erstellt", user, `**Kategorie:** ${category}\n**Kanal:** ${channel}\n**ID:** \`${idString}\``);
    stats.ticketsCreated += 1;
  } catch (err) {
    console.error("[TICKET] Fehler:", err);
  }
}
  async function closeTicket(channel, moderator) {
  try {
    const stored = await getTickData("tickets") || { tickets: {} };
    const allEntries = stored.tickets || {};
    const ticket = Object.values(allEntries).find(
      t => typeof t === 'object' && t.channelId === channel.id
    );
    if (!ticket) {
      console.log("Gesuchte Channel-ID:", channel.id);
      return channel.send("❌ Kein aktives Ticket in der Datenbank gefunden.");
    }
    await channel.setParent(ARCHIVE_CATEGORY_ID, { lockPermissions: true });
    await channel.permissionOverwrites.delete(ticket.userId).catch(() => {});
    await channel.send({ 
      content: `✅ **Ticket archiviert.**\nErstellt von: ${ticket.username}\nID: ${ticket.idString}`
    });
    delete stored.tickets[ticket.idString];
    await setTickData("tickets", stored);
  } catch (err) {
    console.error("[TICKET] Fehler:", err);
  }
}
  client.on("interactionCreate", async (int) => {
    if (!int.isButton()) return;
    if (int.customId.startsWith("t_")) {
      const action = int.customId.replace("t_", "");
      if (action === "close") {
        if (!int.member.roles.cache.has(TEAM_ROLE_ID)) return int.reply({ content: "Nur Teammitglieder können schließen.", flags: MessageFlags.Ephemeral });
        await int.deferUpdate();
        return closeTicket(int.channel, int.user);
      }
      if (await isBlocked(int.user.id) && !int.member.roles.cache.has(TEAM_ROLE_ID)) return int.reply({ content: "❌ Du bist gesperrt.", flags: MessageFlags.Ephemeral }); 
      const alreadyOpen = Object.values(ticketData.tickets).some(t => t.userId === int.user.id && t.category === action);
      if (alreadyOpen) return int.reply({ content: "❌ Du hast bereits ein Ticket in dieser Kategorie.", flags: MessageFlags.Ephemeral });
      await int.deferReply({ flags: MessageFlags.Ephemeral });
      await createTicket(action, int.user, int.guild);
      await int.editReply({ content: "✅ Ticket wurde erstellt!" });
    }
  });
  client.on("messageCreate", async msg => {
    if (!msg.content.startsWith("!") || msg.author.bot) return;
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    if (cmd === "ticket_panel" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      await sendTicketPanel(msg.channel);
      await msg.delete().catch(() => {});
      stats.commandsRunned += 1;
    }
    if (cmd === "close" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      await closeTicket(msg.channel, msg.author);
      stats.commandsRunned += 1;
    }
    if (cmd === "delete" && msg.member.roles.cache.has(ADMIN_ROLE_ID)) {
      await msg.reply("🗑️ Kanal wird gelöscht...");
      setTimeout(() => msg.channel.delete().catch(() => {}), 3000);
      stats.commandsRunned += 1;
    }
    if (cmd === "block" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      const target = msg.mentions.users.first() || { id: args[0], username: "Unbekannt" };
      if (!target.id) return msg.reply("❌ ID fehlt.");
      const days = parseInt(args[1]) || 7;
      await blockUser(target.id, target.username, days * 24 * 60 * 60 * 1000);
      msg.reply(`✅ <@${target.id}> für ${days} Tage gesperrt.`);
      stats.commandsRunned += 1;
    }
  });
}
const CREATOR_CHANNEL_ID = "1423413348220796991";
const CATEGORY_ID = "1423413348493430902";        
const TRIGGER_CHANNEL_ID = "1423438527319900180"; 
const activeCreations = new Set();
function toMonospace(text) {
  const normal = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
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
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor('#ffffff')
      .setAuthor({ 
          name: user.username, 
          iconURL: user.displayAvatarURL({ size: 512 }) 
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: 'Kekse Clan | Voice System' })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };

  client.on("voiceStateUpdate", async (oldState, newState) => {
    const { member, guild } = newState;
    if (!member || member.user.bot) return;

    if (newState.channelId === TRIGGER_CHANNEL_ID) {
      if (activeCreations.has(member.id)) return;
      activeCreations.add(member.id);

      try {
        const userNameMono = toMonospace(member.user.username);
        const channelName = `${userNameMono}'𝚜 𝙻𝚘𝚞𝚗𝚐𝚎`;

        const tempChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildVoice,
          parent: CATEGORY_ID,
          permissionOverwrites: [
            { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
            { id: TEAM_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
            {
              id: member.id,
              allow: [
                PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, 
                PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers
              ]
            }
          ]
        });

        await newState.setChannel(tempChannel).catch(async () => {
            await tempChannel.delete().catch(() => {});
        });

        await sendKekseLog("Voice Lounge erstellt", member.user, `**Kanal:** \`${channelName}\`\n**ID:** \`${tempChannel.id}\``);
        stats.voiceChannelCreated += 1;
        
      } catch (err) {
        console.error("[VOICE] Fehler beim Erstellen:", err);
      } finally {
        setTimeout(() => activeCreations.delete(member.id), 5000);
      }
    }

    const oldChannel = oldState.channel;
    if (oldChannel && oldChannel.parentId === CATEGORY_ID && oldChannel.id !== TRIGGER_CHANNEL_ID) {
      try {
        const freshChannel = await guild.channels.fetch(oldChannel.id).catch(() => null);
        if (freshChannel && freshChannel.members.size === 0) {
          const channelName = freshChannel.name;
          await freshChannel.delete().catch(() => {});
          await sendKekseLog("Voice Lounge entfernt", member.user, `**Kanal:** \`${channelName}\` (automatisch gelöscht, da leer)`);
          stats.voiceChannelDeleted += 1;
        }
      } catch (err) {}
    }
  });
}
export async function initStatistics(client) {
  const getStatsMessage = () => {
    const uptime = Math.round(client.uptime / 60000);

    return `
============================================
**Statistiken**
- Mitglieder erschienen: ${stats.membersJoined}
- Mitglieder verlassen: ${stats.membersLeft}
- Gesendete Nachrichten: ${stats.messagesSent}
- Commands ausgeführt: ${stats.commandsRunned}
- Tickets erstellt: ${stats.ticketsCreated}
- Giveaways erstellt: ${stats.giveawaysCreated}
- Polls erstellt: ${stats.pollsCreated}
- Erinnerungen erstellt: ${stats.remindersCreated}
- Voice-Channels erstellt: ${stats.voiceChannelsCreated}
- Voice-Channels gelöscht: ${stats.voiceChannelsDeleted}
- Counting-Nachrichten gesendet: ${stats.countingMessagesSent}
- Counting-Nachrichten fehlgeschlagen: ${stats.countingMessagesFailed}
- Counting-Nachrichten wiederhergestellt: ${stats.countingMessagesRecovered}
- Ping: ${stats.pingNow} ms
- Durchschnittlicher Ping: ${Math.round(stats.pingAverage)} ms
- Höchster Ping: ${stats.pingMaximum} ms
- Niedrigster Ping: ${stats.pingMinimum} ms
- Uptime: ${uptime} Minuten
============================================`;
  };

  setInterval(() => {
    const ping = client.ws.ping;

    stats.pingNow = ping;
    stats.pingAverage =
      stats.pingAverage === 0
        ? ping
        : (stats.pingAverage + ping) / 2;

    stats.pingMaximum = Math.max(stats.pingMaximum, ping);

    stats.pingMinimum =
      stats.pingMinimum === 0
        ? ping
        : Math.min(stats.pingMinimum, ping);
  }, 60000);

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();

    if (cmd === "stats") {
      if (message.author.id !== "1151971830983311441") return;

      if (message.channel.type !== 1) {
        await message.channel.send(getStatsMessage());
      } else {
        await message.author.send(getStatsMessage());
      }
    }
  });

  let lastSentDay = null;

  setInterval(async () => {
    try {
      const now = new Date(
        new Date().toLocaleString("en-US", {
          timeZone: "Europe/Berlin"
        })
      );

      const currentDay = now.toDateString();

      if (
        now.getHours() === 6 &&
        now.getMinutes() === 0 &&
        lastSentDay !== currentDay
      ) {
        lastSentDay = currentDay;

        const user = await client.users.fetch("1151971830983311441");

        await user.send(getStatsMessage());

        Object.keys(stats).forEach((key) => {
          if (typeof stats[key] === "number") {
            stats[key] = 0;
          }
        });

        console.log("Tägliche Statistik gesendet");
        console.log("Stats zurückgesetzt");
      }
    } catch (err) {
      console.error("Fehler beim Senden der Statistik:", err);
    }
  }, 60000);
}
export async function initScammProtection(client) {
    const {
        Events,
        EmbedBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        AttachmentBuilder
    } = await import("discord.js")

    const sharp = (await import("sharp")).default
    const { imageHash } = await import("image-hash")
    const fs = await import("fs")
    const https = await import("https")

    const CONFIG = {
        logChannel: "LOG_CHANNEL_ID",
        modRole: "MOD_ROLE_ID",
        minScore: 70,
        autoTimeout: 10 * 60 * 1000,
        confirmTimeout: 7 * 24 * 60 * 60 * 1000
    }

    function download(url, path) {
        return new Promise(resolve => {
            https.get(url, res => {
                const file = fs.createWriteStream(path)

                res.pipe(file)

                file.on("finish", () => {
                    file.close(resolve)
                })
            })
        })
    }

    function createHash(path) {
        return new Promise(resolve => {
            imageHash(path, 16, true, (err, hash) => {
                resolve(hash || "")
            })
        })
    }

    function hamming(a, b) {
        let dist = 0

        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            if (a[i] !== b[i]) dist++
        }

        return dist
    }

    async function sanitizeImage(input, output) {
        await sharp(input)
            .blur(2)
            .resize(900)
            .png()
            .toFile(output)
    }

    client.on(Events.MessageCreate, async message => {
        try {
            if (!message.guild) return
            if (message.author.bot) return

            const images = [...message.attachments.values()]
                .filter(a => a.contentType?.startsWith("image/"))

            if (images.length !== 3) return

            const knownHashes = await getScammData("hashes") || []

            let score = 20
            const imageData = []
            const safeFiles = []

            for (const img of images) {
                const tempPath = `temp_${Date.now()}_${Math.random()}.png`
                const safePath = `safe_${Date.now()}_${Math.random()}.png`

                await download(img.url, tempPath)

                const hash = await createHash(tempPath)

                for (const known of knownHashes) {
                    const dist = hamming(hash, known.hash)

                    if (dist <= 5) {
                        score += 50
                    }
                }

                await sanitizeImage(tempPath, safePath)

                imageData.push({
                    hash
                })

                safeFiles.push(
                    new AttachmentBuilder(safePath)
                )

                await fs.promises.unlink(tempPath).catch(() => {})
            }

            if (images.length === 3) {
                score += 20
            }

            if (score < CONFIG.minScore) {
                for (const file of safeFiles) {
                    await fs.promises.unlink(file.attachment).catch(() => {})
                }

                return
            }

            await message.delete().catch(() => {})

            const member = await message.guild.members
                .fetch(message.author.id)
                .catch(() => null)

            if (member) {
                await member.timeout(
                    CONFIG.autoTimeout,
                    "Automatische Scam Erkennung"
                ).catch(() => {})
            }

            const scamData = await getScammData("events") || {}

            const caseId = Date.now().toString()

            scamData[caseId] = {
                userId: message.author.id,
                guildId: message.guild.id,
                score,
                status: "pending",
                images: imageData,
                createdAt: Date.now()
            }

            await setScammData("events", scamData)

            const logChannel = client.channels.cache.get(CONFIG.logChannel)

            if (!logChannel) return

            const embed = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Scam Verdacht")
                .setDescription(
                    `User: <@${message.author.id}>\n` +
                    `Score: ${score}\n` +
                    `3 PNG Muster erkannt`
                )
                .setFooter({
                    text: `Case ID: ${caseId}`
                })
                .setTimestamp()

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`scam_confirm_${caseId}`)
                        .setLabel("Bestätigen")
                        .setStyle(ButtonStyle.Danger),

                    new ButtonBuilder()
                        .setCustomId(`scam_reject_${caseId}`)
                        .setLabel("Ablehnen")
                        .setStyle(ButtonStyle.Success)
                )

            await logChannel.send({
                content: `<@&${CONFIG.modRole}>`,
                embeds: [embed],
                files: safeFiles,
                components: [row]
            })

        } catch (err) {
            console.error("[SCAM]", err)
        }
    })

    client.on(Events.InteractionCreate, async interaction => {
        try {
            if (!interaction.isButton()) return

            if (
                !interaction.customId.startsWith("scam_confirm_") &&
                !interaction.customId.startsWith("scam_reject_")
            ) return

            const confirm = interaction.customId.startsWith("scam_confirm_")

            const caseId = interaction.customId.split("_")[2]

            const events = await getScammData("events") || {}

            const data = events[caseId]

            if (!data) {
                return interaction.reply({
                    content: "Fall nicht gefunden.",
                    ephemeral: true
                })
            }

            const member = await interaction.guild.members
                .fetch(data.userId)
                .catch(() => null)

            if (confirm) {
                if (member) {
                    await member.timeout(
                        CONFIG.confirmTimeout,
                        "Bestätigter Scam"
                    ).catch(() => {})
                }

                let hashes = await getScammData("hashes") || []

                for (const img of data.images) {
                    const exists = hashes.find(h => h.hash === img.hash)

                    if (!exists) {
                        hashes.push({
                            hash: img.hash,
                            confirmed: 1,
                            rejected: 0,
                            createdAt: Date.now()
                        })
                    } else {
                        exists.confirmed++
                    }
                }

                await setScammData("hashes", hashes)

                data.status = "confirmed"
                data.confirmedBy = interaction.user.id

                await setScammData("events", events)

                await interaction.reply({
                    content: "Scam bestätigt.",
                    ephemeral: true
                })

            } else {
                if (member) {
                    await member.timeout(null).catch(() => {})
                }

                let hashes = await getScammData("hashes") || []

                for (const img of data.images) {
                    const exists = hashes.find(h => h.hash === img.hash)

                    if (!exists) {
                        hashes.push({
                            hash: img.hash,
                            confirmed: 0,
                            rejected: 1,
                            createdAt: Date.now()
                        })
                    } else {
                        exists.rejected++
                    }
                }

                await setScammData("hashes", hashes)

                data.status = "rejected"
                data.rejectedBy = interaction.user.id

                await setScammData("events", events)

                await interaction.reply({
                    content: "False Positive markiert.",
                    ephemeral: true
                })
            }
        } catch (err) {
            console.error("[SCAM BUTTON]", err)
        }
    })
}
export async function initDashboard(app, client, stats) {
  const logs = [];
  const _log = console.log.bind(console);
  console.log = (...a) => {
    _log(...a);
    logs.push({ t: Date.now(), m: a.join(" ") });
    if (logs.length > 100) logs.shift();
  };
 export function initTicketArchive(app) {
  const archives = [];
  app.get("/api/tickets", (req, res) => res.json(archives));
  async function archiveTicket({ name, closedBy, channel }) {
    try {
      const messages = [];
      let lastId;
      while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (!batch.size) break;
        for (const msg of batch.values()) {
          messages.push({
            id: msg.id,
            author: { name: msg.author.username, avatar: msg.author.displayAvatarURL({ size: 64 }) },
            content: msg.content || null,
            timestamp: msg.createdTimestamp,
            attachments: [...msg.attachments.values()].map(a => ({
              name: a.name,
              url: a.url,
              type: a.contentType || "unknown",
            })),
            stickers: [...(msg.stickers?.values() ?? [])].map(s => ({
              name: s.name,
              url: s.url,
            })),
            embeds: msg.embeds.map(e => ({ title: e.title, description: e.description })),
          });
          lastId = msg.id;
        }
        if (batch.size < 100) break;
      }
      messages.reverse();
      archives.unshift({
        id: Date.now(),
        name,
        closedBy: closedBy?.username ?? "System",
        closedAt: new Date().toISOString(),
        messageCount: messages.length,
        messages,
      });
      if (archives.length > 100) archives.pop();
    } catch (e) {
      console.log(`[TicketArchive] Fehler beim Archivieren von "${name}": ${e.message}`);
    }
  }
  return { archiveTicket };
}
  app.get("/api/stats", async (req, res) => {
    try {
      const guild = client.guilds.cache.first();
      let members = guild?.members.cache;
      const bots = [...members.values()].filter(m => m.user.bot).length;
      const users = members.size - bots;
      let ownerTag = "—";
      try { const o = await client.users.fetch(guild.ownerId); ownerTag = o.tag || o.username; } catch {}

      res.json({
        guild: guild ? { name: guild.name, id: guild.id, owner: ownerTag, channels: guild.channels.cache.size } : null,
        users, bots,
        ping: { now: client.ws.ping, avg: stats.pingAverage ?? 0, max: stats.pingMaximum ?? 0 },
        uptime: process.uptime(),
        version: process.env.npm_package_version || "1.0.0",
        lastRestart: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        stats: {
          tickets: stats.ticketsCreated ?? 0,
          polls: stats.pollsCreated ?? 0,
          giveaways: stats.giveawaysCreated ?? 0,
          commands: stats.commandsRunned ?? 0,
          scams: stats.scamsPrevented ?? 0,
          deleted: stats.messagesDeleted ?? 0,
        },
        logs: logs.slice(-50),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
client.once("ready", async () => {
    await initCounting(client);
    registerMessageCommands(client);
    await initTickets(client);
    await initGiveaway(client);
    initPing(client);
    initReactions(client);
    initHelp(client);
    initTicketCategory(client);
    await initPoll(client);
    initVoiceChannels(client);
    await initReminder(client);
    await initModeration(client);
    await initVerification(client);
    await initInvites(client); 
    initAuditLogs(client);
    clear(client);
    warning(client);
    initModSend(client);
    await violations(client);
    await initStatistics(client);
    await initDashboard(app, client, stats);
    await initScammProtection(client);
    client.user.setPresence({
      activities: [{ name: "!help", type: 0 }],
      status: "online"
    });
    console.log(`Bot online: ${client.user.tag}`);
})
app.get("/api/stats_internal", (req, res) => {
    const totalSeconds = (client.uptime / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const seconds = Math.floor(totalSeconds % 60);
    res.json({
        uptime: days + "d " + hours + "h " + minutes + "m " + seconds + "s",
        ping: Math.round(client.ws.ping),
        guilds: client.guilds.cache.size,
        members: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)
    });
});
client.setMaxListeners(20);
client.on("error", console.error)
client.on("warn", console.warn)
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('🍃 MongoDB verbunden!');
    await startStorages();
    client.login(process.env.BOT_TOKEN);
  })
  .catch(err => console.error('❌ MongoDB Fehler:', err));
