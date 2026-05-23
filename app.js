import { Client, ModalBuilder, REST, Routes, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, EmbedBuilder, Events, AuditLogEvent, MessageFlags, MessageType, PermissionsBitField, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextInputBuilder, TextInputStyle, ComponentType} from "discord.js"
import https from "https";
import "dotenv/config"
import path from "path"
import mongoose from 'mongoose';
import express from "express"
import { fileURLToPath } from "url"
import fs from "fs"
import crypto from 'crypto';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express()
app.use(express.static('public'))
app.get("/permission", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "permission", "index.html"));
});
app.get("/err605", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "err605", "index.html"));
});
app.get("/err612", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "err612", "index.html"));
});
const port = process.env.PORT || 5000
app.listen(port, "0.0.0.0", () => {
    dashboardLog(`Server läuft auf Port ${port}`)
})
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
let archives = [];
let logs = [];
const originalLog = console.log;
const originalError = console.error;
function captureLog(type, args) {
  const message = args.map(arg => {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === "object" && arg !== null) {
      try {
        if (arg.embeds || arg.content) {
          return `[Bot-Nachricht] ${arg.content || ""} ${arg.embeds ? JSON.stringify(arg.embeds) : ""}`;
        }
        return JSON.stringify(arg);
      } catch (e) {
        return "[Komplexes Objekt]";
      }
    }
    return String(arg);
  }).join(" ");

  const logEntry = {
    timestamp: Date.now(),
    type: type,
    message: message
  };
  logs.push(logEntry);
  if (logs.length > 100) logs.shift();
}
console.log = function(...args) {
  originalLog.apply(console, args);
  captureLog("info", args);
};
console.error = function(...args) {
  originalError.apply(console, args);
  captureLog("error", args);
};
export function dashboardLog(text) {
  console.log(`[Dashboard] ${text}`);
}
export async function initTicketArchive(app, getTickData, setTickData) {
  try {
    const stored = await getTickData("archive_list") || {};
    archives = Array.isArray(stored.archive) ? stored.archive : [];
    dashboardLog(`[TicketArchive] ${archives.length} archivierte Tickets geladen.`);
  } catch (e) {
    dashboardLog("[TicketArchive] Fehler beim Laden: " + e.message);
  }
  const ADMIN_TOKEN_HASH = "98b597cf0dab8d66c56c7368241dcb52db0c68eb6db44a6d762f7d45fb2db07c";
  app.get("/admin/login", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "admin", "login", "index.html"));
  });
  app.get("/api/tickets", (req, res) => {
      const userToken = req.query.token;
        if (!userToken) {
            return res.status(401).json({ error: "Kein Token angegeben" });
        }
        const inputHash = crypto.createHash('sha256').update(userToken).digest('hex');
        if (inputHash === ADMIN_TOKEN_HASH) {
            dashboardLog(`[TicketArchive] Ein Admin hat sich eingeloggt.`);
            return res.json(archives);
        }
        const allowedTicket = archives.find(t => t.token === userToken);
        if (!allowedTicket) {
            return res.status(403).json({ error: "Ungültiger Token" });
        }
        res.json([allowedTicket]);
    });
}
export async function archiveTicket({ name, closedBy, channel }, setTickData) {
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
            name: a.name, url: a.url, type: a.contentType || "unknown",
          })),
          stickers: [...(msg.stickers?.values() ?? [])].map(s => ({ name: s.name, url: s.url })),
          embeds: msg.embeds.map(e => ({ title: e.title, description: e.description })),
        });
        lastId = msg.id;
      }
      if (batch.size < 100) break;
    }
    messages.reverse();
    const match = name.match(/\d{4}$/);
    const ticketIdNum = (match && match[0]) ? match[0] : name.replace(/[^0-9]/g, "").slice(-4) || "0000";
    const sessionToken = crypto.randomBytes(8).toString('hex');
    archives.unshift({
      id: ticketIdNum,
      name,
      closedBy: closedBy?.username ?? "System",
      closedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
      token: sessionToken
    });
    if (archives.length > 100) archives.pop();
    await setTickData("archive_list", { archive: archives });
    dashboardLog(`[TicketArchive] ✅ "${name}" archiviert — ${messages.length} Nachrichten.`);
    const sendKekseLog = async (ticketName, ticketMessages) => {
        const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) return;
        const ticketUrl = `https://kekse-clan-bot.onrender.com/?t=${sessionToken}#ticket-${ticketIdNum}`;
        const logEmbed = new EmbedBuilder()
            .setColor('#ffffff')
            .setAuthor({ 
                name: closedBy?.username ?? "System", 
                iconURL: closedBy?.displayAvatarURL({ size: 512 }) || client.user.displayAvatarURL() 
            })
            .setDescription(`**Kanal:** \`${ticketName}\` wurde erfolgreich archiviert.\n**Nachrichten:** ${ticketMessages.length}\n\n**Transcript:** [**${ticketName}**](${ticketUrl})`)
            .setFooter({ text: 'Kekse Clan | Ticket-Archive' })
            .setTimestamp();  
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    };
    await sendKekseLog(name, messages);
    setTimeout(async () => {
        await channel.delete().catch(() => {});
    }, 2000);      
  } catch (e) {
    dashboardLog(`[TicketArchive] ❌ Fehler bei "${name}": ${e.message}`);
  }
}
export let globalBotStats = {
 messagesSent: 0, membersJoined: 0, membersLeft: 0, commandsRunned: 0,
 ticketsCreated: 0, giveawaysCreated: 0, pollsCreated: 0, remindersCreated: 0,
 voiceChannelsCreated: 0, voiceChannelsDeleted: 0, countingMessagesSent: 0,
 countingMessagesFailed: 0, countingMessagesRecovered: 0,
 pingNow: 0, pingAverage: 0, pingMaximum: 0, pingMinimum: 0,
 usersVerified: 0
};
async function startStorages() {
  try {
    const stats = await getTickData("global_stats");
    if (stats) {
      globalBotStats = { ...globalBotStats, ...stats };
    }
    dashboardLog("[Storage] Globale Statistiken erfolgreich geladen.");
  } catch (error) {
    dashboardLog(`[Storage] Fehler beim Laden der Statistiken: ${error.message}`);
  }
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
const TEAM_ROLE = "1457906448234319922";
const LOG_CHANNEL_ID = "1423413348220796991";
import { dbGet, dbSet } from './database.js';
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
export async function getVData(key) {
 const data = await dbGet("violations", key);
 return data || {};
}
export async function setVData(key, value) {
 await dbSet("violations", key, value);
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
export async function getPollData(key) {
 const data = await dbGet("polls", key);
 return data || {};
}
export async function setPollData(key, value) {
 await dbSet("polls", key, value);
}
export async function setScammData(key, value) {
 await dbSet("scamm", key, value);
}
export async function getScammData(key) {
 const data = await dbGet("scamm", key);
 return data || {};
}
export async function setEcoData(key, value) {
 await dbSet("economy", key, value);
}
export async function getEcoData(key) {
 const data = await dbGet("economy", key);
 return data || {};
}
export async function initEconomySystem(client) {
  const crashGames = new Map();
  const hlGames = new Map();
  const resetJackpot = () => ({ entries: [], totalPool: 0, countdownTimer: null, countdownEndTime: null, announceMessage: null });
  let jackpotState = resetJackpot();

  const runJackpotDraw = async (channel) => {
    if (jackpotState.entries.length === 0) { jackpotState = resetJackpot(); return; }
    const entries = [...jackpotState.entries];
    const totalPool = jackpotState.totalPool;
    let rand = Math.random() * totalPool;
    let winner = entries[entries.length - 1];
    for (const entry of entries) { rand -= entry.betAmount; if (rand <= 0) { winner = entry; break; } }
    const winnerData = await getEcoData(winner.userId);
    winnerData.balance = (winnerData.balance || 0) + totalPool;
    await setEcoData(winner.userId, winnerData);
    const winEmbed = new EmbedBuilder()
      .setTitle('Jackpot — Gewinner!')
      .setDescription(`<@${winner.userId}> hat den Jackpot gewonnen!\n\n**Gewinn: ${totalPool} Kekse** 🍪\nGewinnchance war: **${((winner.betAmount / totalPool) * 100).toFixed(1)}%**`)
      .addFields({ name: 'Teilnehmer', value: entries.map(e => `<@${e.userId}> — ${e.betAmount} Kekse (${((e.betAmount/totalPool)*100).toFixed(1)}%)`).join('\n') })
      .setColor(0xFFFFFF).setFooter({ text: 'Kekse Clan Casino | Jackpot' }).setTimestamp();
    const savedMsg = jackpotState.announceMessage;
    jackpotState = resetJackpot();
    if (savedMsg) await savedMsg.edit({ embeds: [winEmbed], components: [] }).catch(() => {});
    else await channel.send({ embeds: [winEmbed] }).catch(() => {});
  };

  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.member) return;
    if (!msg.content.startsWith("!")) return;
    const args = msg.content.trim().split(/ +/);
    const command = args[0].toLowerCase();
    const subCommand = args[1]?.toLowerCase();

    if (command === "!daily_setup") {
      if (msg.author.id !== "1151971830983311441") return;
      const setupId = args[1];
      if (!setupId) {
        return msg.reply({ content: "Bitte gib eine eindeutige Setup-ID an! Beispiel: `!daily_setup event1 Das ist ein Event`" });
      }
      const description = args.slice(1).join(" ") || "Hole dir hier deine täglichen Kekse ab!";
      await setEcoData(`setup_${setupId}`, {
        description: description,
        exists: true
      });

      const embed = new EmbedBuilder()
        .setTitle("🍪 Tägliche Kekse")
        .setDescription(`${description}\n\nKlicke auf den Button unten, um 10 Kekse zu erhalten.`)
        .setColor(0xFFFFFF);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`daily_claim_${setupId}`)
          .setLabel("Kekse abholen")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🍪")
      );

      await msg.channel.send({ embeds: [embed], components: [row] });
      return msg.delete().catch(() => {});
    }
    if (command === "!casino") {
      const hasEcoRole = msg.member.roles.cache.has("1506732560837771284");
      if (!hasEcoRole) {
        return msg.reply({ content: "Du benötigst ein Bankkonto, um am Casino teilzunehmen. Nutze `!bank create`.", ephemeral: true });
      }
      if (!msg.channelId === "1507385550825459812") {
        return msg.reply({ content: "Das Casino ist nur in <#1507385550825459812> nutzbar.", ephemeral: true })
      }
      const userData = await getEcoData(msg.author.id);
      if (userData.blocked) {
        return msg.reply({ content: "Dein Konto ist gesperrt. Bitte wende dich an den Support.", ephemeral: true });
      }
      if (subCommand === "roulette") {
        const betAmount = parseInt(args[2]);
        const betType = args[3]?.toLowerCase();
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({ content: "Nutzung: `!casino roulette <Einsatz> <red|black|even|odd|0-36|1-18|19-36>`", ephemeral: true });
        }
        if (!betType) {
          return msg.reply({ content: "Bitte gib eine Wettart an: `red`, `black`, `even`, `odd`, eine Zahl `0`-`36`, `1-18` oder `19-36`.", ephemeral: true });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({ content: "Du hast nicht genug Kekse für diesen Einsatz.", ephemeral: true });
        }

        const redNumbers = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
        const spin = Math.floor(Math.random() * 37);
        const spinColor = spin === 0 ? 'green' : redNumbers.has(spin) ? 'red' : 'black';
        const spinEmoji = spin === 0 ? '🟢' : spinColor === 'red' ? '🔴' : '⚫';

        let won = false;
        let payout = 0;
        let betDesc = betType;

        const numBet = parseInt(betType);
        if (!isNaN(numBet) && numBet >= 0 && numBet <= 36) {
          won = spin === numBet;
          payout = won ? betAmount * 35 : -betAmount;
          betDesc = `Zahl ${numBet}`;
        } else if (betType === 'red') {
          won = spinColor === 'red';
          payout = won ? betAmount : -betAmount;
          betDesc = '🔴 Rot';
        } else if (betType === 'black') {
          won = spinColor === 'black';
          payout = won ? betAmount : -betAmount;
          betDesc = '⚫ Schwarz';
        } else if (betType === 'even') {
          won = spin !== 0 && spin % 2 === 0;
          payout = won ? betAmount : -betAmount;
          betDesc = 'Gerade';
        } else if (betType === 'odd') {
          won = spin % 2 !== 0;
          payout = won ? betAmount : -betAmount;
          betDesc = 'Ungerade';
        } else if (betType === '1-18') {
          won = spin >= 1 && spin <= 18;
          payout = won ? betAmount : -betAmount;
          betDesc = '1–18';
        } else if (betType === '19-36') {
          won = spin >= 19 && spin <= 36;
          payout = won ? betAmount : -betAmount;
          betDesc = '19–36';
        } else {
          return msg.reply({ content: "Ungültige Wettart. Nutze: `red`, `black`, `even`, `odd`, eine Zahl (0–36), `1-18` oder `19-36`.", ephemeral: true });
        }

        userData.balance = (userData.balance || 0) + payout;
        await setEcoData(msg.author.id, userData);

        const roulEmbed = new EmbedBuilder()
          .setTitle('Roulette')
          .setDescription(`Die Kugel landet auf: **${spinEmoji} ${spin}**\n\nDeine Wette: **${betDesc}** | Einsatz: **${betAmount} Kekse**`)
          .addFields({ name: won ? '✅ Gewonnen!' : '❌ Verloren!', value: `${payout >= 0 ? '+' : ''}${payout} Kekse\nNeuer Kontostand: **${userData.balance} Kekse**` })
          .setColor(won ? 0x333333 : 0x333333);

        return msg.reply({ embeds: [roulEmbed] });
      }
      if (subCommand === "coinflip") {
        const betAmount = parseInt(args[2]);
        const choice = args[3]?.toLowerCase();
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({ content: "Nutzung: `!casino coinflip <Einsatz> <heads|tails>`", ephemeral: true });
        }
        if (choice !== 'heads' && choice !== 'tails') {
          return msg.reply({ content: "Bitte wähle `heads` (Kopf) oder `tails` (Zahl).", ephemeral: true });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({ content: "Du hast nicht genug Kekse für diesen Einsatz.", ephemeral: true });
        }

        const flip = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = flip === choice;
        userData.balance = (userData.balance || 0) + (won ? betAmount : -betAmount);
        await setEcoData(msg.author.id, userData);

        const cfEmbed = new EmbedBuilder()
          .setTitle(`Coinflip`)
          .setDescription(`Die Münze zeigt: **${flip === 'heads' ? 'Kopf (Heads)' : 'Zahl (Tails)'}**\n\nDu hast auf **${choice === 'heads' ? 'Kopf' : 'Zahl'}** gesetzt.`)
          .addFields({ name: won ? '✅ Gewonnen!' : '❌ Verloren!', value: `${won ? '+' : '-'}${betAmount} Kekse\nNeuer Kontostand: **${userData.balance} Kekse**` })
          .setColor(won ? 0x333333 : 0x333333);

        return msg.reply({ embeds: [cfEmbed] });
      }
      if (subCommand === "jackpot") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({ content: "Nutzung: `!casino jackpot <Einsatz>`", ephemeral: true });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({ content: "Du hast nicht genug Kekse für diesen Einsatz.", ephemeral: true });
        }
        if (jackpotState.entries.find(e => e.userId === msg.author.id)) {
          return msg.reply({ content: "Du bist bereits im Jackpot! Warte auf die Ziehung.", ephemeral: true });
        }

        userData.balance -= betAmount;
        await setEcoData(msg.author.id, userData);
        jackpotState.entries.push({ userId: msg.author.id, username: msg.author.username, betAmount });
        jackpotState.totalPool += betAmount;

        const buildJackpotEmbed = (extra = '') => {
          const list = jackpotState.entries.map(e => {
            const pct = ((e.betAmount / jackpotState.totalPool) * 100).toFixed(1);
            return `<@${e.userId}> — **${e.betAmount} Kekse** (${pct}%)`;
          }).join('\n');
          return new EmbedBuilder()
            .setTitle('Jackpot')
            .setDescription(`**Pool: ${jackpotState.totalPool} Kekse**\n\n${extra}`)
            .addFields({ name: `Teilnehmer (${jackpotState.entries.length})`, value: list || 'Keine' })
            .setColor(0xFFFFFF)
            .setFooter({ text: 'Je mehr du einsetzt, desto höher deine Gewinnchance!' });
        };

        const userChance = ((betAmount / jackpotState.totalPool) * 100).toFixed(1);

        if (jackpotState.entries.length === 1) {
          const jMsg = await msg.channel.send({ embeds: [buildJackpotEmbed('Warte auf weitere Teilnehmer…')] });
          jackpotState.announceMessage = jMsg;
          return msg.reply({ content: `Du bist dem Jackpot beigetreten! Einsatz: **${betAmount} Kekse** (${userChance}% Chance)`, ephemeral: true });
        }

        if (jackpotState.announceMessage) {
          const extra = jackpotState.countdownEndTime ? `Ziehung <t:${Math.floor(jackpotState.countdownEndTime / 1000)}:R>` : '';
          await jackpotState.announceMessage.edit({ embeds: [buildJackpotEmbed(extra)] }).catch(() => {});
        }

        if (!jackpotState.countdownTimer) {
          const drawTime = Date.now() + 5 * 60 * 1000;
          jackpotState.countdownEndTime = drawTime;
          if (jackpotState.announceMessage) {
            await jackpotState.announceMessage.edit({ embeds: [buildJackpotEmbed(`⏳ Ziehung <t:${Math.floor(drawTime / 1000)}:R>`)] }).catch(() => {});
          }
          jackpotState.countdownTimer = setTimeout(() => runJackpotDraw(msg.channel), 5 * 60 * 1000);
        }
        return msg.reply({ content: `Du bist dem Jackpot beigetreten! Einsatz: **${betAmount} Kekse** (${userChance}% Chance)\nPool: **${jackpotState.totalPool} Kekse**`, ephemeral: true });
      }
      if (subCommand === "crash") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({ content: "Nutzung: `!casino crash <Einsatz>`", ephemeral: true });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({ content: "Du hast nicht genug Kekse für diesen Einsatz.", ephemeral: true });
        }
        if (crashGames.has(msg.author.id)) {
          return msg.reply({ content: "Du hast bereits ein aktives Crash-Spiel!", ephemeral: true });
        }
        userData.balance -= betAmount;
        await setEcoData(msg.author.id, userData);
        const crashPoint = parseFloat(Math.max(1.01, 0.97 / (1 - Math.random())).toFixed(2));
        let multiplier = 1.00;
        const cashoutRow = () => new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`crash_cashout_${msg.author.id}`)
            .setLabel(`Cash Out (${Math.floor(betAmount * multiplier)} Kekse)`)
            .setStyle(ButtonStyle.Success)
        );

        const crashEmbed = (crashed = false, cashedAt = null) => {
          if (crashed) return new EmbedBuilder().setTitle('💥 CRASH!').setDescription(`Gecrasht bei **${crashPoint.toFixed(2)}x**!\n\nEinsatz: **${betAmount} Kekse** — **Verloren!**\nNeuer Kontostand: **${userData.balance} Kekse**`).setColor(0x333333);
          if (cashedAt !== null) {
            const win = Math.floor(betAmount * cashedAt);
            return new EmbedBuilder().setTitle('✅ Cash Out!').setDescription(`Ausgecasht bei **${cashedAt.toFixed(2)}x**!\n\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${userData.balance + win} Kekse**`).setColor(0x333333);
          }
          return new EmbedBuilder().setTitle('Crash').setDescription(`**${multiplier.toFixed(2)}x** — Steigt noch…\n\nEinsatz: **${betAmount} Kekse**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**\n\nDrücke **Cash Out** bevor die Rakete crasht!`).setColor(0xFFFFFF);
        };

        const gameMsg = await msg.reply({ embeds: [crashEmbed()], components: [cashoutRow()] });
        crashGames.set(msg.author.id, { betAmount, crashPoint, cashedOut: false });

        const collector = gameMsg.createMessageComponentCollector({
          filter: i => i.user.id === msg.author.id && i.customId === `crash_cashout_${msg.author.id}`,
          componentType: ComponentType.Button,
          time: 120000
        });

        collector.on('collect', async (interaction) => {
          await interaction.deferUpdate();
          const game = crashGames.get(msg.author.id);
          if (game && !game.cashedOut) game.cashedOut = true;
        });

        const interval = setInterval(async () => {
          const game = crashGames.get(msg.author.id);
          if (!game) { clearInterval(interval); return; }

          multiplier = parseFloat((multiplier + 0.08).toFixed(2));

          if (game.cashedOut) {
            clearInterval(interval);
            crashGames.delete(msg.author.id);
            collector.stop('cashout');
            const win = Math.floor(betAmount * multiplier);
            const fresh = await getEcoData(msg.author.id);
            fresh.balance = (fresh.balance || 0) + win;
            await setEcoData(msg.author.id, fresh);
            await gameMsg.edit({ embeds: [crashEmbed(false, multiplier)], components: [] }).catch(() => {});
            return;
          }

          if (multiplier >= game.crashPoint) {
            clearInterval(interval);
            crashGames.delete(msg.author.id);
            collector.stop('crashed');
            await gameMsg.edit({ embeds: [crashEmbed(true)], components: [] }).catch(() => {});
            return;
          }

          await gameMsg.edit({ embeds: [crashEmbed()], components: [cashoutRow()] }).catch(() => {});
        }, 600);

        collector.on('end', async (collected, reason) => {
          if (reason === 'time') {
            clearInterval(interval);
            const game = crashGames.get(msg.author.id);
            if (game) {
              crashGames.delete(msg.author.id);
              await gameMsg.edit({ embeds: [crashEmbed(true)], components: [] }).catch(() => {});
            }
          }
        });

        return;
      }
      if (subCommand === "highlow" || subCommand === "hl") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({ content: "Nutzung: `!casino highlow <Einsatz>`", ephemeral: true });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({ content: "Du hast nicht genug Kekse für diesen Einsatz.", ephemeral: true });
        }
        if (hlGames.has(msg.author.id)) {
          return msg.reply({ content: "Du hast bereits ein aktives Higher/Lower-Spiel!", ephemeral: true });
        }

        userData.balance -= betAmount;
        await setEcoData(msg.author.id, userData);
        hlGames.set(msg.author.id, true);

        const cardNames = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
        const cardVals = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
        const suits = ['♠️','♥️','♦️','♣️'];
        const getCard = () => { const n = cardNames[Math.floor(Math.random()*cardNames.length)]; return { display: `${n}${suits[Math.floor(Math.random()*4)]}`, value: cardVals[n] }; };

        let currentCard = getCard();
        let streak = 0;
        let multiplier = 1.0;

        const hlRow = (disabled = false) => new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`hl_higher_${msg.author.id}`).setLabel('⬆️ Higher').setStyle(ButtonStyle.Primary).setDisabled(disabled),
          new ButtonBuilder().setCustomId(`hl_lower_${msg.author.id}`).setLabel('⬇️ Lower').setStyle(ButtonStyle.Danger).setDisabled(disabled),
          new ButtonBuilder().setCustomId(`hl_cashout_${msg.author.id}`).setLabel(`Cash Out (${Math.floor(betAmount * multiplier)} Kekse)`).setStyle(ButtonStyle.Success).setDisabled(disabled || streak === 0)
        );

        const hlEmbed = (desc, color = 0xFFFFFF) => new EmbedBuilder()
          .setTitle('Higher or Lower')
          .setDescription(desc)
          .setColor(color);

        const gameMsg = await msg.reply({
          embeds: [hlEmbed(`Aktuelle Karte: **${currentCard.display}**\n\nStreak: **0** | Multiplikator: **1.00x**\nMöglicher Gewinn: **${betAmount} Kekse**\n\nIst die nächste Karte höher oder niedriger?`)],
          components: [hlRow()]
        });

        const collector = gameMsg.createMessageComponentCollector({
          filter: i => i.user.id === msg.author.id,
          componentType: ComponentType.Button,
          time: 90000
        });

        collector.on('collect', async (interaction) => {
          await interaction.deferUpdate();
          const id = interaction.customId;
          if (id === `hl_cashout_${msg.author.id}`) { collector.stop('cashout'); return; }

          const nextCard = getCard();
          const choice = id.startsWith(`hl_higher`) ? 'higher' : 'lower';
          const isTie = nextCard.value === currentCard.value;
          const correct = !isTie && ((choice === 'higher' && nextCard.value > currentCard.value) || (choice === 'lower' && nextCard.value < currentCard.value));

          if (isTie) {
            currentCard = nextCard;
            await gameMsg.edit({ embeds: [hlEmbed(`🟡 Unentschieden! Neue Karte: **${nextCard.display}**\nStreak: **${streak}** | Multiplikator: **${multiplier.toFixed(2)}x**`)], components: [hlRow()] }).catch(() => {});
            return;
          }

          if (correct) {
            streak++;
            multiplier = parseFloat((multiplier + 0.5).toFixed(2));
            currentCard = nextCard;
            await gameMsg.edit({
              embeds: [hlEmbed(`✅ Richtig! Nächste Karte war **${nextCard.display}**\n\nAktuelle Karte: **${currentCard.display}**\nStreak: **${streak}** | Multiplikator: **${multiplier.toFixed(2)}x**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**`, 0xFFFFFF)],
              components: [hlRow()]
            }).catch(() => {});
          } else {
            collector.stop('wrong');
          }
        });

        collector.on('end', async (collected, reason) => {
          hlGames.delete(msg.author.id);
          const fresh = await getEcoData(msg.author.id);

          if (reason === 'cashout') {
            const win = Math.floor(betAmount * multiplier);
            fresh.balance = (fresh.balance || 0) + win;
            await setEcoData(msg.author.id, fresh);
            await gameMsg.edit({ embeds: [hlEmbed(`Cash Out bei **${multiplier.toFixed(2)}x**!\n\n**+${win - betAmount} Kekse** Gewinn\nNeuer Kontostand: **${fresh.balance} Kekse**`, 0x333333)], components: [] }).catch(() => {});
          } else if (reason === 'wrong') {
            await gameMsg.edit({ embeds: [hlEmbed(`❌ Falsch! Du hast **${betAmount} Kekse** verloren.\nNeuer Kontostand: **${fresh.balance} Kekse**`, 0x333333)], components: [] }).catch(() => {});
          } else {
            if (streak > 0) {
              const win = Math.floor(betAmount * multiplier);
              fresh.balance = (fresh.balance || 0) + win;
              await setEcoData(msg.author.id, fresh);
              await gameMsg.edit({ embeds: [hlEmbed(`Zeit abgelaufen! Auto Cash-Out bei **${multiplier.toFixed(2)}x**\n**+${win - betAmount} Kekse**\nNeuer Kontostand: **${fresh.balance} Kekse**`, 0x333333)], components: [] }).catch(() => {});
            } else {
              await gameMsg.edit({ embeds: [hlEmbed(`Zeit abgelaufen! **${betAmount} Kekse** verloren.\nNeuer Kontostand: **${fresh.balance} Kekse**`, 0x333333)], components: [] }).catch(() => {});
            }
          }
        });

        return;
      }
      if (subCommand === "blackjack") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({ content: "Bitte gib einen gültigen Einsatz an (z.B. `!casino blackjack 10`).", ephemeral: true });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({ content: "Du hast nicht genug Kekse für diesen Einsatz.", ephemeral: true });
        }

        const suits = ['♠️', '♥️', '♦️', '♣️'];
        const values = [
          { n: '2', v: 2 }, { n: '3', v: 3 }, { n: '4', v: 4 }, { n: '5', v: 5 },
          { n: '6', v: 6 }, { n: '7', v: 7 }, { n: '8', v: 8 }, { n: '9', v: 9 },
          { n: '10', v: 10 }, { n: 'J', v: 10 }, { n: 'Q', v: 10 }, { n: 'K', v: 10 },
          { n: 'A', v: 11 }
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
          let aces = hand.filter(card => card.name.startsWith('A')).length;
          while (score > 21 && aces > 0) {
            score -= 10;
            aces--;
          }
          return score;
        };

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('bj_hit').setLabel('Karte ziehen (Hit)').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('bj_stand').setLabel('Halten (Stand)').setStyle(ButtonStyle.Secondary)
        );

        const createEmbed = (title, color, showAllDealer = false) => {
          const pScore = calculateScore(playerHand);
          const dScore = showAllDealer ? calculateScore(dealerHand) : dealerHand[0].value;
          const pCards = playerHand.map(c => c.name).join(' ');
          const dCards = showAllDealer ? dealerHand.map(c => c.name).join(' ') : `${dealerHand[0].name} 🎴`;

          return new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setDescription(`Dein Einsatz: **${betAmount} Kekse**`)
            .addFields(
              { name: `Deine Hand (${pScore})`, value: pCards, inline: true },
              { name: `Dealer Hand (${showAllDealer ? dScore : dScore + ' + ?'})`, value: dCards, inline: true }
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
            status = "Echter Blackjack! Du gewinnst das 1.5-fache!";
            userData.balance += Math.floor(betAmount * 1.5);
          }

          await setEcoData(msg.author.id, userData);
          const finalEmbed = createEmbed(`Blackjack - ${status}`, finalColor, true)
            .setFooter({ text: `Neuer Kontostand: ${userData.balance} Kekse` });
          return msg.reply({ embeds: [finalEmbed] });
        }

        const gameMessage = await msg.reply({ 
          embeds: [createEmbed("Blackjack", 0xFFFFFF)], 
          components: [row] 
        });

        const collector = gameMessage.createMessageComponentCollector({
          filter: i => i.user.id === msg.author.id,
          componentType: ComponentType.Button,
          time: 60000
        });

        collector.on('collect', async interaction => {
          await interaction.deferUpdate();

          if (interaction.customId === 'bj_hit') {
            playerHand.push(deck.pop());
            if (calculateScore(playerHand) >= 21) {
              collector.stop(calculateScore(playerHand) > 21 ? 'busted' : 'stand');
            } else {
              await gameMessage.edit({ embeds: [createEmbed("Blackjack", 0xFFFFFF)] });
            }
          } 

          if (interaction.customId === 'bj_stand') {
            collector.stop('stand');
          }
        });

        collector.on('end', async (collected, reason) => {
          let pScore = calculateScore(playerHand);
          let dScore = calculateScore(dealerHand);
          let status = "";
          let finalColor = 0x333333;

          if (reason !== 'busted') {
            while (dScore < 17) {
              dealerHand.push(deck.pop());
              dScore = calculateScore(dealerHand);
            }
          }

          if (reason === 'busted' || pScore > 21) {
            status = "Überkauft! Du hast verloren.";
            userData.balance -= betAmount;
            finalColor = 0x333333;
          } else if (dScore > 21) {
            status = "Dealer überkauft! Du gewinnst!";
            userData.balance += betAmount;
          } else if (pScore > dScore) {
            status = "Mehr Punkte als der Dealer. Du gewinnst!";
            userData.balance += betAmount;
          } else if (pScore < dScore) {
            status = "Dealer hat mehr Punkte. Verloren!";
            userData.balance -= betAmount;
            finalColor = 0x333333;
          } else {
            status = "Unentschieden! Kekse zurück.";
            finalColor = 0x333333;
          }

          await setEcoData(msg.author.id, userData);

          const finalEmbed = createEmbed(`Blackjack - ${status}`, finalColor, true)
            .setFooter({ text: `Neuer Kontostand: ${userData.balance} Kekse` });

          await gameMessage.edit({ embeds: [finalEmbed], components: [] });
        });
        return;
      }
      return msg.reply({ content: "Unbekanntes Casino-Spiel. Verfügbar: `roulette`, `coinflip`, `jackpot`, `crash`, `highlow`, `blackjack`\nBeispiel: `!casino coinflip 10 heads`", ephemeral: true });
    }

    const hasEcoRole = msg.member.roles.cache.has("1506732560837771284");
    const isAdmin = msg.author.id === "1151971830983311441";

    if (isAdmin && (subCommand === "add" || subCommand === "remove" || subCommand === "see")) {
      const targetUser = msg.mentions.users.first();
      let amount = 0;
      let targetId = msg.author.id;

      if (subCommand === "see") {
        if (!targetUser) return msg.reply({ content: "Bitte erwähne einen Nutzer.", ephemeral: true });
        const data = await getEcoData(targetUser.id);
        const dmEmbed = new EmbedBuilder()
          .setTitle(`Konto-Details von ${targetUser.username}`)
          .setColor(0xFFFFFF)
          .addFields(
            { name: "User ID", value: data.userId || targetUser.id },
            { name: "Discord Name", value: data.username || "Kein Name" },
            { name: "Minecraft Name", value: data.mcUsername || "Nicht registriert" },
            { name: "Kontostand", value: `${data.balance || 0} Kekse` },
            { name: "Gesperrt?", value: data.blocked ? "Ja" : "Nein" }
          );
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
        return msg.reply({ content: "Bitte gib eine gültige Anzahl an Keksen an.", ephemeral: true });
      }

      const targetData = await getEcoData(targetId);
      let currentBalance = targetData.balance || 0;

      if (subCommand === "add") {
        currentBalance += amount;
      } else {
        currentBalance = Math.max(0, currentBalance - amount);
      }

      targetData.balance = currentBalance;
      await setEcoData(targetId, targetData);

      const logEmbed = new EmbedBuilder()
        .setTitle("Konto-Aktualisierung")
        .setDescription(`Konto von <@${targetId}> wurde aktualisiert.`)
        .addFields(
          { name: "Aktion", value: subCommand === "add" ? `+${amount} Kekse` : `-${amount} Kekse` },
          { name: "Neuer Kontostand", value: `${currentBalance} Kekse` }
        )
        .setColor(0xFFFFFF);

      await msg.author.send({ embeds: [logEmbed] }).catch(() => {});
      return msg.delete().catch(() => {});
    }

    if (subCommand === "create") {
      if (hasEcoRole) {
        return msg.reply({ content: "Du besitzt bereits ein registriertes Bankkonto.", ephemeral: true });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`open_bank_modal_${msg.author.id}`)
          .setLabel("Registrierungsformular öffnen")
          .setStyle(ButtonStyle.Primary)
      );

      const reply = await msg.reply({
        content: "Klicke auf den Button unten, um dein Konto zu erstellen. Dieser Button funktioniert nur für dich.",
        components: [row]
      });

      setTimeout(() => {
        reply.delete().catch(() => {});
        msg.delete().catch(() => {});
      }, 30000);
      return;
    }

    if (subCommand === "help") {
      const helpEmbed = new EmbedBuilder()
        .setTitle("🏦 Bank-System Hilfe")
        .setColor(0xFFFFFF)
        .setDescription("Hier findest du alle verfügbaren Befehle:")
        .addFields(
          { name: "`!bank create`", value: "Erstellt dein persönliches Bankkonto (Erfordert Minecraft-Namen)." },
          { name: "`!bank`", value: "Zeigt dir deinen aktuellen Kontostand (Privat für dich)." },
          { name: "⚠️ Wichtiger Hinweis", value: "Für Änderungen am Konto oder Auszahlungen eröffne bitte ein Ticket in <#1423413348493430905>." }
        );

      return msg.reply({ embeds: [helpEmbed], ephemeral: true });
    }

    if (!subCommand) {
      if (!hasEcoRole) {
        return msg.reply({ content: "Du hast noch kein Konto. Nutze `!bank create`, um dich zu registrieren.", ephemeral: true });
      }

      const userData = await getEcoData(msg.author.id);
      
      if (userData.blocked) {
        return msg.reply({ content: "Dein Konto ist aktuell gesperrt. Bitte wende dich an den Support.", ephemeral: true });
      }
      const userName = msg.author
      if (msg.content.startsWith("!bank")) {
        await msg.delete().catch(() => {});
        return userName.send({ content: `Dein aktueller Kontostand beträgt: **${userData.balance || 0} Kekse** 🍪\nFür Auszahlungen öffne bitte ein Ticket in https://discord.com/channels/1423413347168157718/1423413348493430905`})
      };
    }
  });
  client.on("interactionCreate", async (interaction) => {
      if (interaction.isButton()) {
          if (interaction.customId.startsWith("open_bank_modal_")) {
              const allowedUserId = interaction.customId.replace("open_bank_modal_", "");
              if (interaction.user.id !== allowedUserId) {
                  return interaction.reply({ content: "Du kannst diesen Button nicht nutzen, da du den Befehl nicht eingegeben hast.", ephemeral: true });
              }
              const hasEcoRole = interaction.member.roles.cache.has("1506732560837771284");
              if (hasEcoRole) {
                  return interaction.reply({ content: "Du besitzt bereits ein registriertes Bankkonto.", ephemeral: true });
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
              return interaction.showModal(modal);
          }
          if (interaction.customId.startsWith("daily_claim_")) {
              const hasEcoRole = interaction.member.roles.cache.has("1506732560837771284");
              if (!hasEcoRole) {
                  return interaction.reply({ content: "Du benötigst zuerst ein registriertes Bankkonto (`!bank create`).", ephemeral: true });
              }

              const setupId = interaction.customId.replace("daily_claim_", "");
              const localizedDateStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }); 
              const userData = await getEcoData(interaction.user.id);
              if (!userData.claimedDailies) {
                  userData.claimedDailies = {};
              }
              if (userData.claimedDailies[setupId] === localizedDateStr) {
                  return interaction.reply({ 
                      content: `Du hast deine Kekse für **dieses spezifische Event** heute bereits abgeholt! Versuche es nach 00:00 Uhr erneut.`, 
                      ephemeral: true 
                  });
              }
              userData.balance = (userData.balance || 0) + 10;
              userData.claimedDailies[setupId] = localizedDateStr;
              if (typeof userData.markModified === "function") {
                  userData.markModified("claimedDailies");
              } else {
                  userData.claimedDailies = { ...userData.claimedDailies };
              }
              await setEcoData(interaction.user.id, userData);
              return interaction.reply({ 
                  content: "Erfolgreich! Dir wurden 10 Kekse auf dein Bankkonto gutgeschrieben.", 
                  ephemeral: true 
              });
          }
      }

      if (!interaction.isModalSubmit()) return;
      if (!interaction.customId.startsWith("bank_create_")) return;

      const userId = interaction.customId.replace("bank_create_", "");
      if (interaction.user.id !== userId) return;

      const mcUsername = interaction.fields.getTextInputValue("mc_username");
      const accountData = {
          userId: interaction.user.id,
          username: interaction.user.username,
          mcUsername: mcUsername,
          balance: 0,
          blocked: false,
          claimedDailies: {}
      };

      await setEcoData(interaction.user.id, accountData);

      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (member) {
          await member.roles.add("1506732560837771284").catch(() => {});
      }

      await interaction.reply({
          content: `Dein Konto wurde erfolgreich angelegt!\n**Minecraft-Name:** ${mcUsername}\n**Startguthaben:** 0 Kekse\nDu hast nun Zugriff auf dein Konto mit \`!bank\`.`,
          ephemeral: true
      });

      if (interaction.message) {
          await interaction.message.delete().catch(() => {});
      }
  });  
}
export function initAdminFun(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!")) return;
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    if (cmd === "blob") {
      const filePfad = path.join(__dirname, 'blobfish.jpg'); 
      const attachment = new AttachmentBuilder(filePfad, { name: 'blobfish.jpg' });
      msg.channel.send({ files: [attachment] });
    }
    if (cmd === "sand") {
      const filePfad = path.join(__dirname, 'sandkorn.png');
      const attachment = new AttachmentBuilder(filePfad, { name: 'sandkorn.png' });
      msg.channel.send({ files: [attachment] });
    }
    if (cmd === "sandkorn") {
      const filePfad = path.join(__dirname, 'strand.jpg');
      const attachment = new AttachmentBuilder(filePfad, { name: 'strand.jpg' });
      msg.channel.send({ files: [attachment] });
    }
  });
}
export function initCommandList(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith("!commands")) return;
    if (msg.author.id === "1151971830983311441") {
      const devMessage1 = 
        "**Entwickler-Befehle**\n" +
        "Hier sind alle Befehle, die du nutzen kannst:\n\n" +
        "**!bank** - Zeigt die Übersicht deines Bankkontos an.\n" +
        "**!bank create** - Erstellt ein neues Bankkonto für dich.\n" +
        "**!bank help** - Zeigt die Hilfe-Menüs für die Bank-Befehle an.\n" +
        "**!casino** - Zeigt die Casino-Übersicht.\n" +
        "**!casino blackjack <x>** - Startet eine Runde Blackjack mit dem Einsatz (x).\n" +
        "**!casino coinflip <x> <->** - Macht einen Münzwurf mit Einsatz (x) und Tipp (Kopf/Zahl).\n" +
        "**!casino crash <x>** - Startet das Crash-Spiel mit einem Einsatz von (x).\n" +
        "**!casino highlow <x>** - Spielt High-Low (Höher oder Tiefer) mit dem Einsatz (x).\n" +
        "**!casino jackpot <x>** - Zahlt den Betrag (x) in den aktuellen Jackpot ein.\n" +
        "**!casino roulette <x> <->** - Setzt den Einsatz (x) beim Roulette auf Farbe, Zahl oder Bereich.\n" +
        "**!listpolls** - Listet alle aktuell laufenden Umfragen auf.\n" +
        "**!remind <x> <t> <->** - Erstellt eine Erinnerung in (x) Zeit mit dem Text (t) und optional einem Kanal oder per DM.\n" +
        "**!top** - Zeigt die Top 10 vom Counting an.\n" +
        "**!bank add <x>** - Fügt dem eigenen Bankkonto einen Betrag (x) hinzu.\n" +
        "**!bank add <x> <@>** - Fügt dem Bankkonto des erwähnten Mitglieds einen Betrag (x) hinzu.\n" +
        "**!bank remove <x>** - Zieht einen Betrag (x) vom eigenen Bankkonto ab.\n" +
        "**!bank remove <x> <@>** - Zieht einen Betrag (x) vom Bankkonto des erwähnten Mitglieds ab.\n" +
        "**!bank see <@>** - Zeigt den Kontostand des erwähnten Mitglieds an.\n" +
        "**!daily_setup <ID>** - Richtet das tägliche Belohnungssystem ein.\n" +
        "**!set_number <x>** - Setzt im Counting die aktuelle Zahl auf (x).\n" +
        "**!stats** - Zeigt die aktuellen Statistiken an.";
      const devMessage2 =
        "**!ban <@>** - Sperrt das erwähnte Mitglied dauerhaft.\n" +
        "**!block <@> <x>** - Hindert den User für die Dauer (x) an der Erstellung von Tickets.\n" +
        "**!ban <@> <t>** - Sperrt das erwähnte Mitglied mit Begründung (t).\n" +
        "**!closepoll <ID>** - Schließt die Umfrage mit der angegebenen ID.\n" +
        "**!changelog <t>** - Postet ein Update oder Changelog mit dem Text (t).\n" +
        "**!close** - Schließt das aktuelle Ticket.\n" +
        "**!clear <@> <@>** - Löscht Nachrichten von zwei bestimmten Benutzern.\n" +
        "**!clear <@> <@> <x>** - Löscht eine Anzahl (x) an Nachrichten von zwei Benutzern.\n" +
        "**!clear <@> <@> <x> <x>** - Löscht Nachrichten von zwei Benutzern in einem bestimmten Zeitraum (x).\n" +
        "**!clear** - Löscht 100 Nachrichten im Kanal.\n" +
        "**!clear <@>** - Löscht die Nachrichten eines bestimmten Benutzers.\n" +
        "**!embed <t> <t> <HEX>** - Erstellt ein Embed mit Titel, Beschreibung und HEX-Farbe.\n" +
        "**!dm <ID> <t>** - Sendet eine Direktnachricht mit Text (t) an die User-ID.\n" +
        "**!giveaway <#> <x> <t> <x>** - Startet ein Giveaway im Kanal <#> für Zeit (x) mit Preis (t).\n";
      const devMessage3 = 
          "**!kick <@>** - Kickt das erwähnte Mitglied vom Server.\n" +
          "**!kick <@> <t>** - Kickt das erwähnte Mitglied mit Begründung (t).\n" +
          "**!news <#> <t>** - Sendet eine Ankündigung in den News-Kanal <#>.\n" +
          "**!ping** - Zeigt die aktuelle Latenz des Bots an.\n" +
          "**!poll <t> <x> <t> ...** - Erstellt eine Umfrage mit einer Frage und Auswahlmöglichkeiten.\n" +
          "**!reply <#> <ID> <t>** - Antwortet auf eine Nachricht via ID im Kanal <#>.\n" +
          "**!send <#> <t>** - Sendet eine Textnachricht (t) in den Kanal <#>.\n" +
          "**!setup_verify** - Richtet das Verifizierungssystem für den Server ein.\n" +
          "**!ticket_panel** - Sendet das Panel zum Erstellen von Support-Tickets.\n" +
          "**!timeout <@> <x>** - Versetzt das Mitglied für die Dauer (x) in den Server-Timeout.\n" +
          "**!timeout <@> <x> <t>** - Versetzt das Mitglied mit Begründung (t) in den Timeout (x).\n" +
          "**!unban <@>** - Hebt die Server-Sperre für das Mitglied auf.\n" +
          "**!unban <@> <t>** - Hebt die Server-Sperre mit Begründung (t) auf.\n" +
          "**!untimeout <@> <t>** - Hebt den Timeout eines Mitglieds vorzeitig auf.\n" +
          "**!warn <@>** - Erteilt dem erwähnten Mitglied eine Verwarnung.\n" +
          "**!warn <@> <t>** - Verwarnt das erwähnte Mitglied mit Begründung (t).\n" +
          "**!warn_remove <@>** - Entfernt die letzte Verwarnung eines Mitglieds.\n" +
          "**!warn_remove <@> <t>** - Entfernt eine Verwarnung mit Begründung (t).";
      await msg.channel.send({ content: devMessage1 });
      await msg.channel.send({ content: devMessage2 });
      await msg.channel.send({ content: devMessage3 });
    } else if (msg.member?.roles.cache.has(TEAM_ROLE_ID)) {
      const teamMessage1 = 
        "**Team-Befehle**\n" +
        "Hier sind alle Befehle, die du nutzen kannst:\n\n" +
        "**!bank** - Zeigt die Übersicht deines Bankkontos an.\n" +
        "**!bank create** - Erstellt ein neues Bankkonto für dich.\n" +
        "**!bank help** - Zeigt die Hilfe-Menüs für die Bank-Befehle an.\n" +
        "**!casino** - Zeigt die Casino-Übersicht.\n" +
        "**!casino blackjack <x>** - Startet eine Runde Blackjack mit dem Einsatz (x).\n" +
        "**!casino coinflip <x> <->** - Macht einen Münzwurf mit Einsatz (x) und Tipp (Kopf/Zahl).\n" +
        "**!casino crash <x>** - Startet das Crash-Spiel mit einem Einsatz von (x).\n" +
        "**!casino highlow <x>** - Spielt High-Low (Höher oder Tiefer) mit dem Einsatz (x).\n" +
        "**!casino jackpot <x>** - Zahlt den Betrag (x) in den aktuellen Jackpot ein.\n" +
        "**!casino roulette <x> <->** - Setzt den Einsatz (x) beim Roulette auf Farbe, Zahl oder Bereich.\n" +
        "**!listpolls** - Listet alle aktuell laufenden Umfragen auf.\n" +
        "**!remind <x> <t> <->** - Erstellt eine Erinnerung in (x) Zeit mit dem Text (t) und optional einem Kanal oder per DM.\n" +
        "**!top** - Zeigt die Top 10 vom Counting an.\n" +
        "**!ban <@>** - Sperrt das erwähnte Mitglied dauerhaft.\n" +
        "**!block <@> <x>** - Hindert den User für die Dauer (x) an der Erstellung von Tickets.\n" +
        "**!ban <@> <t>** - Sperrt das erwähnte Mitglied mit Begründung (t).\n" +
        "**!closepoll <ID>** - Schließt die Umfrage mit der angegebenen ID.\n" +
        "**!changelog <t>** - Postet ein Update oder Changelog mit dem Text (t).\n" +
        "**!close** - Schließt das aktuelle Ticket.\n" +
        "**!clear <@> <@>** - Löscht Nachrichten von zwei bestimmten Benutzern.";
      const teamMessage2 =
        "**!clear <@> <@> <x>** - Löscht eine Anzahl (x) an Nachrichten von zwei Benutzern.\n" +
        "**!clear <@> <@> <x> <x>** - Löscht Nachrichten von zwei Benutzern in einem bestimmten Zeitraum (x).\n" +
        "**!clear** - Löscht 100 Nachrichten im Kanal.\n" +
        "**!clear <@>** - Löscht die Nachrichten eines bestimmten Benutzers.\n" +
        "**!embed <t> <t> <HEX>** - Erstellt ein Embed mit Titel, Beschreibung und HEX-Farbe.\n" +
        "**!dm <ID> <t>** - Sendet eine Direktnachricht mit Text (t) an die User-ID.\n" +
        "**!giveaway <#> <x> <t> <x>** - Startet ein Giveaway im Kanal <#> für Zeit (x) mit Preis (t).\n" +
        "**!kick <@>** - Kickt das erwähnte Mitglied vom Server.\n" +
        "**!kick <@> <t>** - Kickt das erwähnte Mitglied mit Begründung (t).\n" +
        "**!news <#> <t>** - Sendet eine Ankündigung in den News-Kanal <#>.\n" +
        "**!ping** - Zeigt die aktuelle Latenz des Bots an.\n";
      const teamMessage3 =
        "**!poll <t> <x> <t> ...** - Erstellt eine Umfrage mit einer Frage und Auswahlmöglichkeiten.\n" +
        "**!reply <#> <ID> <t>** - Antwortet auf eine Nachricht via ID im Kanal <#>.\n" +
        "**!send <#> <t>** - Sendet eine Textnachricht (t) in den Kanal <#>.\n" +
        "**!setup_verify** - Richtet das Verifizierungssystem für den Server ein.\n" +
        "**!ticket_panel** - Sendet das Panel zum Erstellen von Support-Tickets.\n" +
        "**!timeout <@> <x>** - Versetzt das Mitglied für die Dauer (x) in den Server-Timeout.\n" +
        "**!timeout <@> <x> <t>** - Versetzt das Mitglied mit Begründung (t) in den Timeout (x).\n" +
        "**!unban <@>** - Hebt die Server-Sperre für das Mitglied auf.\n" +
        "**!unban <@> <t>** - Hebt die Server-Sperre mit Begründung (t) auf.\n" +
        "**!untimeout <@> <t>** - Hebt den Timeout eines Mitglieds vorzeitig auf.\n" +
        "**!warn <@>** - Erteilt dem erwähnten Mitglied eine Verwarnung.\n" +
        "**!warn <@> <t>** - Verwarnt das erwähnte Mitglied mit Begründung (t).\n" +
        "**!warn_remove <@>** - Entfernt die letzte Verwarnung eines Mitglieds.\n" +
        "**!warn_remove <@> <t>** - Entfernt eine Verwarnung mit Begründung (t).";
      await msg.channel.send({ content: teamMessage1 });
      await msg.channel.send({ content: teamMessage2 });
      await msg.channel.send({ content: teamMessage3 });
    } else {
      const textMessage = 
        "**Liste der verfügbaren Befehle**\n" +
        "Hier sind alle Befehle, die du nutzen kannst:\n\n" +
        "**!bank** - Zeigt die Übersicht deines Bankkontos an.\n" +
        "**!bank create** - Erstellt ein neues Bankkonto für dich.\n" +
        "**!bank help** - Zeigt die Hilfe-Menüs für die Bank-Befehle an.\n" +
        "**!casino** - Zeigt die Casino-Übersicht.\n" +
        "**!casino blackjack <x>** - Startet eine Runde Blackjack mit dem Einsatz (x).\n" +
        "**!casino coinflip <x> <->** - Macht einen Münzwurf mit Einsatz (x) und Tipp (Kopf/Zahl).\n" +
        "**!casino crash <x>** - Startet das Crash-Spiel mit einem Einsatz von (x).\n" +
        "**!casino highlow <x>** - Spielt High-Low (Höher oder Tiefer) mit dem Einsatz (x).\n" +
        "**!casino jackpot <x>** - Zahlt den Betrag (x) in den aktuellen Jackpot ein.\n" +
        "**!casino roulette <x> <->** - Setzt den Einsatz (x) beim Roulette auf Farbe, Zahl oder Bereich.\n" +
        "**!listpolls** - Listet alle aktuell laufenden Umfragen auf.\n" +
        "**!remind <x> <t> <->** - Erstellt eine Erinnerung in (x) Zeit mit dem Text (t) und optional einem Kanal oder per DM.\n" +
        "****!top** - Zeigt die Top 10 vom Counting an.";

      await msg.channel.send({ content: textMessage });
    }
  });
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
     const statusMsg = await message.channel.send(" Suche Nachrichten...");
 let messagesToDelete = [];
 let lastId = null;
 try {
 while (messagesToDelete.length < amount) {
 const fetched = await targetChannel.messages.fetch({ limit: 100, before: lastId || undefined });
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
 return statusMsg.edit(" Keine Nachrichten gefunden, die den Kriterien entsprechen.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
 }
 let deletedCount = 0;
 const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
 const youngMsgs = messagesToDelete.filter(m => m.createdTimestamp > fourteenDaysAgo);
 const oldMsgs = messagesToDelete.filter(m => m.createdTimestamp <= fourteenDaysAgo);
 if (youngMsgs.length > 0) {
 await statusMsg.edit(` Bulk-Löschung von ${youngMsgs.length} Nachrichten...`);
 const deletedBulk = await targetChannel.bulkDelete(youngMsgs, true).catch(() => new Map());
 deletedCount += deletedBulk.size;
 }
 if (oldMsgs.length > 0) {
 for (let i = 0; i < oldMsgs.length; i++) {
 await oldMsgs[i].delete().catch(() => {});
 deletedCount++;
 if (deletedCount % 5 === 0) await statusMsg.edit(` Lösche alte Nachrichten: **${deletedCount}/${messagesToDelete.length}**...`).catch(() => {});
 await new Promise(r => setTimeout(r, 1200)); 
 }
 }
 const duration = ((Date.now() - startTime) / 1000).toFixed(2);
 await statusMsg.edit(` Erfogreich **${deletedCount}** Nachrichten in **${duration}s** gelöscht!`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
 } catch (clearError) {
 dashboardLog(`[ClearCommand] Fehler bei der Ausführung: ${clearError.message}`);
 if (statusMsg) await statusMsg.edit("❌ Ein interner Fehler ist beim Löschen aufgetreten.").catch(() => {});
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
      globalBotStats.commandsRunned += 1;
      setTimeout(() => finishMsg.delete().catch(() => {}), 15000);
  });
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

  await user.send(message).catch(() => dashboardLog(`Konnte DM an ${user.tag} nicht senden.`));
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
 if (!user || !durationStr) return msg.reply({ content: " Syntax: `!timeout @user 10m Grund`.", ephemeral: true });
 const match = durationStr.match(/^(\d+)([smhd])$/);
 if (!match) return msg.reply({ content: " Format: 10s, 5m, 2h, 1d", ephemeral: true });
 const durationMs = parseTimeframe(durationStr);
 if (durationMs === 0) return msg.reply({ content: " Ungültige Zeitangabe.", ephemeral: true });
 try {
 const member = await msg.guild.members.fetch(user.id);
 await member.timeout(durationMs, reason);
 await sendModLog("Timeout", user, reason, `Dauer: ${durationStr}`);
 await msg.reply({ content: ` **Timeout**: <@${user.id}> für ${durationStr}.`, ephemeral: true });
 } catch (err) { 
 await msg.reply({ content: " Fehler: User nicht auf Server oder fehlende Rechte.", ephemeral: true }); 
 }
 globalBotStats.commandsRunned += 1;
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
      globalBotStats.commandsRunned += 1;
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
      globalBotStats.commandsRunned += 1;
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
      globalBotStats.commandsRunned += 1;
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
      globalBotStats.commandsRunned += 1;
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
      globalBotStats.commandsRunned += 1;
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
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "warn_remove") {
      const user = await getUser(args[0]);
      const index = parseInt(args[1]) - 1;
      if (!user || isNaN(index) || !data.warns[user.id]?.[index]) return msg.reply({ content: "❌ Ungültiger Index.", ephemeral: true });
      const removed = data.warns[user.id].splice(index, 1);
      await setMData("moderation", data);
      await sendModLog("Warn entfernt", user, `Grund war: ${removed[0].reason}`);
      await msg.reply({ content: "✅ Warnung entfernt.", ephemeral: true });
      globalBotStats.commandsRunned += 1;
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
      globalBotStats.usersVerified += 1;
      globalBotStats.commandsRunned += 1;
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
        globalBotStats.commandsRunned += 1;
        
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
 content: ` <@${userId}>, unser System hat einen **${result}** erkannt. Bitte poste keine sensiblen Daten öffentlich. Bei Missverständnissen erstelle ein Ticket in <#${CONFIG.ticketChannel}>`
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
    const now = Date.now();
    const reminderData = await getRData("reminders") || { reminders: [] };
    if (!reminderData.reminders || reminderData.reminders.length === 0) return;
    const dueReminders = reminderData.reminders.filter(r => r.time <= now);
    if (dueReminders.length === 0) return;
    reminderData.reminders = reminderData.reminders.filter(r => r.time > now);
    await setRData("reminders", reminderData);
    for (const r of dueReminders) {
      try {
        const channel = await client.channels.fetch(r.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          await channel.send(`⏰ <@${r.userId}>, Erinnerung: ${r.reason}`);
          continue;
        }
        const user = await client.users.fetch(r.userId).catch(() => null);
        if (user) {
          await user.send(`⏰ Erinnerung aus einem gelöschten Kanal: ${r.reason}`).catch(() => {});
        }
      } catch (err) {
        dashboardLog(`[Reminder] Fehler beim Senden einer Erinnerung: ${err.message}`);
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
      return message.reply("❌ Nutzung: `!remind <Zeit(m/h/d)> <Grund>` (z.B. `!remind 10m Keks essen`)").catch(() => {});
    }
    const ms = parseTimeframe(timeStr);
    if (!ms || ms < 10000) {
      return message.reply("❌ Ungültige Zeitangabe. Mindestens 10 Sekunden (z.B. 10s, 5m, 1h, 2d).").catch(() => {});
    }
    const reminderData = await getRData("reminders") || { reminders: [] };
    const newReminder = {
      userId: message.author.id,
      channelId: message.channel.id,
      time: Date.now() + ms,
      reason: reason
    };
    reminderData.reminders.push(newReminder);
    await setRData("reminders", reminderData);
    message.reply(`✅ Ich werde dich in **${timeStr}** an folgendes erinnern: ${reason}`).catch(() => {});
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
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 512 }) }) 
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
        .setTitle(" Top 10 Counter") 
        .setDescription(sorted.map(([id, s], i) => `${i + 1}. • ${s}`).join("\n") || "Keine Daten") 
        .setColor('#ffffff') 
        .setFooter({ text: 'Kekse Clan' }); 
      await msg.reply({ embeds: [embed] }); 
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
      return msg.reply(` Die nächste Zahl wurde auf **${newNum}** gesetzt.`); 
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
        countingData.lastMessageId = msg.id;
        await saveCounting(); 
        await msg.react("✅").catch(() => {}); 
        return; 
      } 
    } 
    if (num !== countingData.currentNumber || msg.author.id === countingData.lastUserId) { 
      const reason = num !== countingData.currentNumber ? `Falsche Zahl (${num} statt ${countingData.currentNumber})` : "Doppel-Post"; 
      if (!syncMode) {
        await sendKekseLog("Counting Fehler", msg.author, `**Grund:** ${reason}\n**Reset auf:** 1 / 1`); 
      }
      countingData.currentNumber = 1; 
      countingData.direction = 1; 
      countingData.lastUserId = null; 
      countingData.lastCountingTime = msg.createdTimestamp; 
      countingData.lastMessageId = msg.id;
      await saveCounting(); 
      await msg.react("❌").catch(() => {}); 
      
      if (!syncMode) { 
        const replyContent = msg.author.id === countingData.lastUserId 
          ? ` , nicht zwei mal nacheinander! Zurück auf den Start (1 oder -1).` 
          : ` hat falsch gezählt! Zurück auf den Start (1 oder -1).`; 
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
    } 
    countingData.lastMessageId = msg.id; 
    await saveCounting(); 
    await msg.react("✅").catch(() => {}); 
  }; 
  const runSync = async () => { 
    console.log(" Starte Counting-Synchronisation..."); 
    await loadCounting(); 
    const channel = await client.channels.fetch(COUNTING_CHANNEL).catch(err => {
      console.error(" Fehler beim Abrufen des Counting-Kanals:", err);
      return null;
    }); 
    if (!channel || !channel.isTextBased()) return; 
    try {
      let lastId = countingData.lastMessageId; 
      let totalRecovered = 0; 
      if (!lastId) { 
        const lastMsg = await channel.messages.fetch({ limit: 1 }); 
        countingData.lastMessageId = lastMsg.first()?.id; 
        await saveCounting(); 
        console.log(" Keine Referenz-ID gefunden. Starte ab der aktuellsten Nachricht."); 
        return; 
      } 
      let hasMore = true; 
      while (hasMore) { 
        const missedMessages = await channel.messages.fetch({ after: lastId, limit: 100 }); 
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
            await new Promise(r => setTimeout(r, 1000)); 
          }
        } 
      } 
      if (totalRecovered > 0) { 
        console.log(` Synchronisation abgeschlossen. ${totalRecovered} Nachrichten nachgeholt.`); 
      } else { 
        console.log(" Alles aktuell. Keine verpassten Zahlen gefunden."); 
      } 
    } catch (err) {
      console.error(" Fehler bei der Synchronisation:", err);
    } finally {
      registerLiveListener();
    }
  }; 
  const registerLiveListener = () => {
    client.on(Events.MessageCreate, async msg => { 
      await handleCounting(msg, false); 
    });
    console.log(" Live-Zähler aktiv. System bereit!");
  };
  if (client.isReady()) {
    runSync(); 
  } else {
    client.once(Events.ClientReady, runSync); 
  }
  await loadCounting();
}
const GIVEAWAY_EMOJI = "🎉";
const BOOSTER_ROLE_ID = "1464202435638722621";
const REPORT_CHANNEL_ID = LOG_CHANNEL_ID;
const EMBED_COLOR = 0xffffff;
export async function initGiveaway(client) {
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
    globalBotStats.commandsRunned += 1;
    globalBotStats.giveawaysCreated += 1;
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

    dashboardLog(`[HELP] Von ${msg.author.username}`);
    await msg.channel.send(
      "Erstelle ein <#1423413348493430905>. Ein Moderator wird sich so schnell wie möglich um dein Anliegen kümmern."
    );
    globalBotStats.commandsRunned += 1;
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
        globalBotStats.commandsRunned += 1;
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
      globalBotStats.commandsRunned += 1;
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
        globalBotStats.commandsRunned += 1;
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
        globalBotStats.commandsRunned += 1;
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
      globalBotStats.commandsRunned += 1;
    }

    if (cmd === "reply") {
      await deleteCmd();
      const channelMention = msg.mentions.channels.first() || msg.channel;
      const msgId = args.find(a => /^\d{17,20}$/.test(a));
      let text = args.filter(a => !a.includes(msgId) && !a.startsWith("<#")).join(" ");
      if (!msgId || !text) return;
      globalBotStats.commandsRunned += 1;
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
    globalBotStats.commandsRunned += 1;
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
export async function initPoll(client) {
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
  const createPollText = (q, d, opts, end, count, id, author) => {
    return `## ${q}\n${d}\n\n` +
      opts.map(o => `${o.emoji} ${o.text}`).join("\n") + `\n\n` +
      `<:info:1467246059561685238> Endet am: <t:${Math.floor(end / 1000)}:R>\n` +
      `<:profil:1467246030998343733> Erstellt von: ${author}\n` +
      `<:statistiques:1467246038497886311> Teilnehmer: **${count}**\n` +
      `<:identifiant:1467246041668780227> ID: \`${id}\``;
  };
  const createPollButtons = (pollId, opts) => {
    const rows = [];
    let currentRow = new ActionRowBuilder();
    opts.forEach((o, i) => {
      if (i > 0 && i % 5 === 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`poll_vote_${pollId}_${i}`)
          .setEmoji(o.emoji)
          .setStyle(ButtonStyle.Secondary)
      );
    });
    if (currentRow.components.length > 0) rows.push(currentRow);
    return rows;
  };
  const closePoll = async (poll, polls, closer) => {
    poll.closed = true;
    const channel = await client.channels.fetch(poll.channelId).catch(() => null);
    const pollMsg = await channel?.messages.fetch(poll.messageId).catch(() => null);
    if (pollMsg) {
      await pollMsg.edit({ components: [] }).catch(() => {});
    }
    const total = poll.voters.length;
    let resultsText = `## <:statistiques:1467246038497886311> Ergebnisse: ${poll.question}\n\n`;
    if (total === 0) {
      resultsText += "Keine Teilnehmer.";
    } else {
      const winnerVotes = Math.max(...poll.options.map(o => o.votes));
      poll.options.forEach(o => {
        const perc = Math.round((o.votes / total) * 100);
        resultsText += `${o.emoji} **${o.text}**\n**${o.votes} Stimmen** (${perc}%)${o.votes === winnerVotes && total > 0 ? " <:checkmark:1467245996584210554>" : ""}\n\n`;
      });
    }
    if (channel) await channel.send(resultsText).catch(() => {});
    const logChannel = client.channels.cache.get("1423413348220796991");
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor('#ffffff')
        .setAuthor({ name: closer.username, iconURL: closer.displayAvatarURL() })
        .setDescription(`**Aktion:** \`Umfrage beendet\`\n**Frage:** ${poll.question}\n**Teilnehmer:** ${total}\n**ID:** \`${poll.id}\``)
        .setFooter({ text: 'Kekse Clan | Poll System' })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
    const updatedPolls = polls.filter(p => p.id !== poll.id);
    await setPollData("polls_data", updatedPolls);
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
      const components = createPollButtons(pollId, pollOptions);
      const pollMsg = await msg.channel.send({ content: pollContent, components: components });
      const polls = await getPollData("polls_data") || [];
      polls.push({
        id: pollId, messageId: pollMsg.id, channelId: msg.channel.id,
        question, description, options: pollOptions, endTime,
        creatorId: msg.author.id, voters: [], closed: false
      });
      await setPollData("polls_data", polls);
      await sendKekseLog("Umfrage gestartet", msg.author, `**Frage:** ${question}\n**Dauer:** ${time} Min.\n**ID:** \`${pollId}\``);
      globalBotStats.pollsCreated += 1;
    }
    if (cmd === "closepoll") {
      if (!msg.member.roles.cache.has(TEAM_ROLE_ID)) return;
      const pollId = args[0];
      const polls = await getPollData("polls_data") || [];
      const poll = polls.find(p => p.id === pollId && !p.closed);
      if (!poll) return msg.reply("❌ Poll nicht gefunden.");
      await closePoll(poll, polls, msg.author);
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "listpolls") {
      const polls = await getPollData("polls_data") || [];
      const activePolls = polls.filter(p => !p.closed);
      if (activePolls.length === 0) return msg.reply("Keine aktiven Polls.");
    
      const list = activePolls.map(p => `ID: \`${p.id}\` | ${p.question}`).join("\n");
      msg.reply(`**Aktive Polls:**\n${list}`);
      globalBotStats.commandsRunned += 1;
    }
  });
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || !interaction.customId.startsWith("poll_vote_")) return;
    const parts = interaction.customId.split("_");
    const pollId = parts[2];
    const optionIndex = parseInt(parts[3]);
    let polls = await getPollData("polls_data") || [];
    const poll = polls.find(p => p.id === pollId && !p.closed);
    if (!poll) {
      return interaction.reply({ content: "❌ Diese Umfrage existiert nicht mehr oder ist bereits beendet.", ephemeral: true });
    }
    if (poll.voters.includes(interaction.user.id)) {
      return interaction.reply({ content: "❌ Du hast bereits für diese Umfrage abgestimmt!", ephemeral: true });
    }
    poll.voters.push(interaction.user.id);
    poll.options[optionIndex].votes++;
    await setPollData("polls_data", polls);
    const creator = await client.users.fetch(poll.creatorId).catch(() => ({ toString: () => "Unknown" }));
    await interaction.message.edit({
      content: createPollText(poll.question, poll.description, poll.options, poll.endTime, poll.voters.length, poll.id, creator)
    }).catch(() => {});
    await interaction.reply({ content: "✅ Deine Stimme wurde gezählt!", ephemeral: true });
  });
  setInterval(async () => {
    const polls = await getPollData("polls_data") || [];
    const now = Date.now();
    for (const poll of polls) {
      if (!poll.closed && poll.endTime <= now) {
        const creator = await client.users.fetch(poll.creatorId).catch(() => client.user);
        await closePoll(poll, polls, creator);
      }
    }
  }, 30000);
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
        dashboardLog(`[BOOST] Boost erkannt von ${message.author.username}. Sende Herz-Nachricht.`);
        await message.react("❤️");
      } catch (err) {
        console.error("[BOOST] Fehler beim Senden der Herz-Antwort:", err);
      }
      return;
    }

    const content = message.content.toLowerCase().trim();

    if (message.content.includes("🍪")) {
      try {
        dashboardLog(`[REACTION] Keks-Reaktion für ${message.author.username}`);
        await message.channel.send("<:pepecookie:1453796363442585660>");
      } catch {}
    }

    if (message.mentions.everyone) {
      try {
        dashboardLog(`[REACTION] Everyone-Ping-Reaktion für ${message.author.username}`);
        await message.channel.send("<a:pingeveryone:1453800508329558218>");
      } catch {}
    } else if (message.mentions.has(client.user.id)) {
      try {
        dashboardLog(`[REACTION] Bot-Ping-Reaktion für ${message.author.username}`);
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
        globalBotStats.commandsRunned += 1;
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
        globalBotStats.commandsRunned += 1;
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
    globalBotStats.ticketsCreated += 1;
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
      dashboardLog("Gesuchte Channel-ID:", channel.id);
      return channel.send("❌ Kein aktives Ticket in der Datenbank gefunden.");
    }
    await channel.permissionOverwrites.delete(ticket.userId).catch(() => {});
    await channel.send({ 
      content: `⏳ **Ticket wird archiviert...**\nErstellt von: ${ticket.username}\nID: ${ticket.idString}`
    });
    delete stored.tickets[ticket.idString];
    await setTickData("tickets", stored);
    await archiveTicket({ 
        name: channel.name, 
        closedBy: moderator,
        channel: channel 
    }, setTickData);
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
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "close" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      await closeTicket(msg.channel, msg.author);
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "delete" && msg.member.roles.cache.has(ADMIN_ROLE_ID)) {
      await msg.reply("🗑️ Kanal wird gelöscht...");
      setTimeout(() => msg.channel.delete().catch(() => {}), 3000);
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "block" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      const target = msg.mentions.users.first() || { id: args[0], username: "Unbekannt" };
      if (!target.id) return msg.reply("❌ ID fehlt.");
      const days = parseInt(args[1]) || 7;
      await blockUser(target.id, target.username, days * 24 * 60 * 60 * 1000);
      msg.reply(`✅ <@${target.id}> für ${days} Tage gesperrt.`);
      globalBotStats.commandsRunned += 1;
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
        globalBotStats.voiceChannelCreated += 1;
        
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
          globalBotStats.voiceChannelDeleted += 1;
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
- Mitglieder erschienen: ${globalBotStats.membersJoined}
- Mitglieder verlassen: ${globalBotStats.membersLeft}
- Gesendete Nachrichten: ${globalBotStats.messagesSent}
- Commands ausgeführt: ${globalBotStats.commandsRunned}
- Tickets erstellt: ${globalBotStats.ticketsCreated}
- Giveaways erstellt: ${globalBotStats.giveawaysCreated}
- Polls erstellt: ${globalBotStats.pollsCreated}
- Erinnerungen erstellt: ${globalBotStats.remindersCreated}
- Voice-Channels erstellt: ${globalBotStats.voiceChannelsCreated}
- Voice-Channels gelöscht: ${globalBotStats.voiceChannelsDeleted}
- Counting-Nachrichten gesendet: ${globalBotStats.countingMessagesSent}
- Counting-Nachrichten fehlgeschlagen: ${globalBotStats.countingMessagesFailed}
- Counting-Nachrichten wiederhergestellt: ${globalBotStats.countingMessagesRecovered}
- Ping: ${globalBotStats.pingNow} ms
- Durchschnittlicher Ping: ${Math.round(globalBotStats.pingAverage)} ms
- Höchster Ping: ${globalBotStats.pingMaximum} ms
- Niedrigster Ping: ${globalBotStats.pingMinimum} ms
- Uptime: ${uptime} Minuten
============================================`;
  };

  setInterval(() => {
    const ping = client.ws.ping;

    globalBotStats.pingNow = ping;
    globalBotStats.pingAverage = globalBotStats.pingAverage === 0 ? ping : Math.round((globalBotStats.pingAverage * globalBotStats.pingCount + ping) / (globalBotStats.pingCount + 1));


   globalBotStats.pingMaximum = Math.max(globalBotStats.pingMaximum, ping);

    globalBotStats.pingMinimum =
      globalBotStats.pingMinimum === 0
        ? ping
        : Math.min(globalBotStats.pingMinimum, ping);
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
        dashboardLog("Tägliche Statistik gesendet");
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
export async function initDashboard(app, client, globalBotStats) {
  const logs = [];
  const _log = console.log.bind(console);
  console.log = (...a) => {
    _log(...a);
    logs.push({ t: Date.now(), m: a.join(" ") });
    if (logs.length > 100) logs.shift();
  };
}
app.get("/api/stats", async (req, res) => {
  try {
    const currentVersion = 2.4.3;
    if (!client || !client.isReady()) {
      return res.json({ 
        guild: null, 
        users: 0, 
        bots: 0, 
        uptime: 0, 
        version: currentVersion, 
        lastRestart: new Date().toISOString(),
        ping: { now: 0, avg: 0, max: 0 },
        stats: { tickets: 0, polls: 0, giveaways: 0, commands: 0, scams: 0, deleted: 0 },
        logs: [] 
      });
    }

    const guild = client.guilds.cache.first();
    
    const guildData = guild ? {
      name: guild.name,
      id: guild.id,
      owner: "cubxbuilder",
      channels: guild.channels.cache.size
    } : null;

    const totalMembers = guild ? guild.memberCount : 0;
    const botCount = guild ? guild.members.cache.filter(m => m.user.bot).size : 0;
    const userCount = totalMembers - botCount;

    const currentPing = client.ws.ping;
    const validPing = currentPing >= 0 ? currentPing : 0;
    
    res.json({
      guild: guildData,
      users: userCount,
      bots: botCount,
      uptime: Math.floor(client.uptime / 1000),
      version: 2.4.3,
      lastRestart: new Date(Date.now() - client.uptime).toISOString(),
      ping: {
        now: validPing,
        avg: validPing,
        max: validPing
      },
      stats: {
        tickets: globalBotStats.ticketsCreated || 0,
        polls: globalBotStats.pollsCreated || 0,
        giveaways: globalBotStats.giveawaysCreated || 0,
        commands: globalBotStats.commandsRunned || 0,
        scams: globalBotStats.usersVerified || 0,
        deleted: globalBotStats.countingMessagesFailed || 0
      },
      logs: typeof logs !== "undefined" ? logs : []
    });
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Laden der Statistiken" });
  }
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
});
client.once("ready", async () => {
    try {
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
        initReminder(client);
        initModeration(client);
        initVerification(client);
        initAuditLogs(client);
        clear(client);
        warning(client);
        initModSend(client);
        await violations(client);
        await initStatistics(client);
        await initDashboard(app, client, globalBotStats);
        await initScammProtection(client);
        await initTicketArchive(app, getTickData, setTickData);
        await initEconomySystem(client);
        initAdminFun(client);
        initCommandList(client);
        client.user.setPresence({
            activities: [{ name: "!help", type: 0 }],
            status: "online"
        });
        dashboardLog(`Bot online: ${client.user.tag}`);
        await startStorages();
    } catch (err) {
        console.error('[Ready] Kritischer Fehler beim Initialisieren:', err);
    }
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
    dashboardLog('🍃 MongoDB verbunden!');
    await startStorages();
    client.login(process.env.BOT_TOKEN);
  })
  .catch(err => console.error('❌ MongoDB Fehler:', err));
