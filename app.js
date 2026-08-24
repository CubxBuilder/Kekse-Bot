import {
  Client,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  Events,
  AuditLogEvent,
  MessageFlags,
  MessageType,
  PermissionsBitField,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from "discord.js";
import https from "https";
import "dotenv/config";
import path from "path";
import mongoose from "mongoose";
import express from "express";
import util from "util";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.static("public"));
app.get("/permission", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "permission", "index.html"));
});
app.get("/err605", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "err605", "index.html"));
});
app.get("/err612", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "err612", "index.html"));
});
const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/kekse-bot.dedyn.io/privkey.pem"),
  cert: fs.readFileSync(
    "/etc/letsencrypt/live/kekse-bot.dedyn.io/fullchain.pem",
  ),
};

const port = 5000;
https.createServer(options, app).listen(port, "0.0.0.0", () => {
  console.log(`Dashboard läuft sicher auf Port ${port} via HTTPS!`);
});
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
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.GuildMember,
    Partials.User,
    Partials.ThreadMember,
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
      )
        globalBotStats.pingMinimum = currentPing;
      if (
        globalBotStats.pingMaximum ||
        currentPing > globalBotStats.pingMaximum
      )
        globalBotStats.pingMaximum = currentPing;
      try {
        const StorageModel = mongoose.model("BotStorage");
        let pingDoc = await StorageModel.findOne({
          namespace: "system",
          key: "ping_history",
        });
        let history =
          pingDoc && pingDoc.value && Array.isArray(pingDoc.value.history)
            ? pingDoc.value.history
            : [];
        history.push({ x: Date.now(), y: currentPing });
        if (history.length > 2880) history.shift();
        await StorageModel.updateOne(
          { namespace: "system", key: "ping_history" },
          { value: { history: history } },
          { upsert: true },
        );
      } catch (err) {
        originalError.apply(console, ["[Ping-Storage-Fehler]", err]);
      }
    }
  }
}, 30000);
const hlGames = new Map();
const crashGames = new Map();
const jackpotState = {
  entries: [],
  totalPool: 0,
  countdownTimer: null,
  countdownEndTime: null,
  announceMessage: null
};
let archives = [];
let logs = [];
let backendPingHistory = [];
export async function initTicketArchive(app, getTickData, setTickData) {
  try {
    const stored = (await getTickData("archive_list")) || {};
    archives = Array.isArray(stored.archive) ? stored.archive : [];
    console.log(
      `[TicketArchive] ${archives.length} archivierte Tickets geladen.`,
    );
  } catch (e) {
    console.log("[TicketArchive] Fehler beim Laden: " + e.message);
  }
  app.get("/admin/login", (req, res) => {
    res.sendFile(
      path.join(__dirname, "public", "admin", "login", "index.html"),
    );
  });
  app.get("/api/tickets", async (req, res) => {
    try {
      const StorageModel = mongoose.model("BotStorage");

      const archiveDoc = await StorageModel.findOne({
        namespace: "tickets",
        key: "archive_list",
      }).lean();

      if (!archiveDoc || !archiveDoc.value) {
        return res.json([]);
      }

      if (Array.isArray(archiveDoc.value.archive)) {
        return res.json(archiveDoc.value.archive);
      }

      if (Array.isArray(archiveDoc.value)) {
        return res.json(archiveDoc.value);
      }

      res.json([]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
export async function archiveTicket({ name, closedBy, channel }, setTickData) {
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
    const sessionToken = crypto.randomBytes(8).toString("hex");
    archives.unshift({
      id: ticketIdNum,
      name,
      closedBy: closedBy?.username ?? "System",
      closedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
      token: sessionToken,
    });
    if (archives.length > 100) archives.pop();
    await setTickData("archive_list", { archive: archives });
    console.log(
      `[TicketArchive] ✅ "${name}" archiviert — ${messages.length} Nachrichten.`,
    );
    const sendKekseLog = async (ticketName, ticketMessages) => {
      const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
      if (!logChannel) return;
      const ticketUrl = `https://kekse-bot.dedyn.io:5000/?t=${sessionToken}#ticket-${ticketIdNum}`;
      const logEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: closedBy?.username ?? "System",
          iconURL:
            closedBy?.displayAvatarURL({ size: 512 }) ||
            client.user.displayAvatarURL(),
        })
        .setDescription(
          `**Kanal:** \`${ticketName}\` wurde erfolgreich archiviert.\n**Nachrichten:** ${ticketMessages.length}\n\n**Transcript:** [**${ticketName}**](${ticketUrl})`,
        )
        .setFooter({ text: "Kekse Clan | Ticket-Archive" })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    };
    await sendKekseLog(name, messages);
    setTimeout(async () => {
      await channel.delete().catch(() => {});
    }, 2000);
  } catch (e) {
    console.log(`[TicketArchive] ❌ Fehler bei "${name}": ${e.message}`);
  }
}
export let globalBotStats = {
  messagesSent: 0,
  membersJoined: 0,
  membersLeft: 0,
  commandsRunned: 0,
  ticketsCreated: 0,
  giveawaysCreated: 0,
  pollsCreated: 0,
  remindersCreated: 0,
  voiceChannelsCreated: 0,
  voiceChannelsDeleted: 0,
  countingMessagesSent: 0,
  countingMessagesFailed: 0,
  countingMessagesRecovered: 0,
  pingNow: 0,
  pingAverage: 0,
  pingMaximum: 0,
  pingMinimum: 0,
  usersVerified: 0,
};
async function startStorages() {
  try {
    const stats = await getTickData("global_stats");
    if (stats) {
      globalBotStats = { ...globalBotStats, ...stats };
    }
    console.log("[Storage] Globale Statistiken erfolgreich geladen.");
  } catch (error) {
    console.log(
      `[Storage] Fehler beim Laden der Statistiken: ${error.message}`,
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
function captureLog(type, args) {
  const message = args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === "object" && arg !== null) {
        try {
          if (arg.embeds || arg.content) {
            return `[Bot-Nachricht] ${arg.content || ""} ${arg.embeds ? JSON.stringify(arg.embeds) : ""}`;
          }
          return util.inspect(arg, { depth: 2, colors: false });
        } catch (e) {
          return "[Komplexes Objekt]";
        }
      }
      return String(arg);
    })
    .join(" ");

  const logEntry = {
    timestamp: Date.now(),
    type: type,
    message: message,
  };
  logs.push(logEntry);
}
async function logTransaction(userId, amount, type, description) {
  try {
    const key = `tx_${userId}`;
    const data = (await dbGet("economy", key)) || { history: [] };
    data.history.unshift({
      timestamp: Date.now(),
      amount: amount,
      type: type,
      description: description,
    });
    await dbSet("economy", key, data);
  } catch (err) {
    console.error(err);
  }
}
const TEAM_ROLE = "1457906448234319922";
const LOG_CHANNEL_ID = "1423413348220796991";
import { dbGet, dbSet } from "./database.js";
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
export async function initEconomyGetKekse(client) {
  try {
    const StorageModel = mongoose.model("BotStorage");
    const allEcoDocuments = await StorageModel.find({
      namespace: "economy",
    }).lean();

    const existingKekse = allEcoDocuments.reduce((summe, doc) => {
      const isNumericKey = /^\d+$/.test(doc.key);
      if (isNumericKey && doc.value && typeof doc.value.balance === "number") {
        return summe + doc.value.balance;
      }
      return summe;
    }, 0);
    return existingKekse;
  } catch (err) {
    console.error("❌ Fehler beim Berechnen der existingKekse:", err);
    return 0;
  }
}
export async function initEconomySystem(client) {
  const crashGames = new Map();
  const hlGames = new Map();
  const resetJackpot = () => ({
    entries: [],
    totalPool: 0,
    countdownTimer: null,
    countdownEndTime: null,
    announceMessage: null,
  });
  let jackpotState = resetJackpot();

  const runJackpotDraw = async (channel) => {
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
    await logTransaction(
      winnerData.userId,
      totalPool,
      "plus",
      "Casino Jackpot",
    );
    await setEcoData(winner.userId, winnerData);
    const winEmbed = new EmbedBuilder()
      .setTitle("Jackpot — Gewinner!")
      .setDescription(
        `<@${winner.userId}> hat den Jackpot gewonnen!\n\n**Gewinn: ${totalPool} Kekse** 🍪\nGewinnchance war: **${((winner.betAmount / totalPool) * 100).toFixed(1)}%**`,
      )
      .addFields({
        name: "Teilnehmer",
        value: entries
          .map(
            (e) =>
              `<@${e.userId}> — ${e.betAmount} Kekse (${((e.betAmount / totalPool) * 100).toFixed(1)}%)`,
          )
          .join("\n"),
      })
      .setColor(0xffffff)
      .setFooter({ text: "Kekse Clan Casino | Jackpot" })
      .setTimestamp();
    const savedMsg = jackpotState.announceMessage;
    jackpotState = resetJackpot();
    if (savedMsg)
      await savedMsg
        .edit({ embeds: [winEmbed], components: [] })
        .catch(() => {});
    else await channel.send({ embeds: [winEmbed] }).catch(() => {});
  };

  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.member) return;
    if (!msg.content.startsWith("!")) return;
    const args = msg.content.trim().split(/ +/);
    const command = args[0].toLowerCase();
    const subCommand = args[1]?.toLowerCase();
    if (command === "!leaderboard") {
  const StorageModel = mongoose.model("BotStorage");
  const allDocs = await StorageModel.find({ namespace: "economy" }).lean();
  
  const sorted = allDocs
    .filter(doc => /^\d+$/.test(doc.key) && doc.value?.balance > 0)
    .sort((a, b) => b.value.balance - a.value.balance)
    .slice(0, 5);

  const embed = new EmbedBuilder()
    .setTitle("🏆 Top 5 Balance")
    .setColor("#ffffff")
    .setDescription(
      sorted.map((doc, i) =>
        `**${i + 1}.** <@${doc.key}> • ${doc.value.balance.toLocaleString("de-DE")} Kekse`
      ).join("\n") || "Keine Daten"
    )
    .setFooter({ text: "Kekse Clan" })
    .setTimestamp();

  return msg.reply({ embeds: [embed] });
}
    if (command === "!daily_setup") {
      if (msg.author.id !== "1151971830983311441") return;
      const setupId = args[1];
      if (!setupId) {
        return msg.reply({
          content:
            "Bitte gib eine eindeutige Setup-ID an! Beispiel: `!daily_setup event1 Das ist ein Event`",
        });
      }
      const description =
        args.slice(1).join(" ") || "Hole dir hier deine täglichen Kekse ab!";
      await setEcoData(`setup_${setupId}`, {
        description: description,
        exists: true,
      });

      const embed = new EmbedBuilder()
        .setTitle("🍪 Tägliche Kekse")
        .setDescription(
          `${description}\n\nKlicke auf den Button unten, um 10 Kekse zu erhalten.`,
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
        `[Economy] Neues Daily Setup erstellt. (daily_claim_${setupId})`,
      );
      return msg.delete().catch(() => {});
    }
    if (command === "!shop_setup") {
      if (msg.author.id !== "1151971830983311441") return;
      const setupId = args[0];
      if (!setupId) {
        return msg.reply({
          content:
            "Bitte gib eine eindeutige Setup-ID an! Beispiel: `!shop_setup event1 Das ist ein Event`",
        });
      }
      const description =
        args.slice(1).join(" ") || "Hole dir hier deine Items ab!";
      await setEcoData(`setup_${setupId}`, {
        description: description,
        exists: true,
      });
      const SHOP_CHANNEL_ID = "1508053328662364302";
      const shopChannel = msg.guild.channels.cache.get(SHOP_CHANNEL_ID);
      if (!shopChannel) return msg.reply("Shop-Kanal wurde nicht gefunden!");
      const shopEmbed = new EmbedBuilder()
        .setTitle(`🛒 Server Shop`)
        .setDescription(description)
        .setColor(0xffffff)
        .addFields(
          {
            name: "🎉 Double Chance Giveaway - `100.000 Kekse`",
            value: "Erhöht deine Gewinnchance bei Giveaways.",
            inline: false,
          },
          {
            name: "🛡️ Counting Puffer - `25.000 Kekse`",
            value:
              "Erlaubt dir einen Fehler beim Zählen, ohne die Zahl zurückzusetzen.",
            inline: false,
          },
          {
            name: "⚡ Counting XP Booster (30 Min) - `50.000 Kekse`",
            value: "Du erhältst 30 Minuten lang doppelte XP beim Zählen.",
            inline: false,
          },
          {
            name: "🔥 Counting XP Booster (60 Min) - `100.000 Kekse`",
            value: "Du erhältst 60 Minuten lang doppelte XP beim Zählen.",
            inline: false,
          },
          {
            name: "💎 VIP Rolle (7d) - `500.000 Kekse`",
            value: "Du wirst bei der Teilnahme an Events bevorzugt.",
            inline: false,
          },
        );
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
          .setStyle(ButtonStyle.Success)
          .setEmoji("⚡"),
        new ButtonBuilder()
          .setCustomId("shop_xp60")
          .setLabel("XP Booster 60m")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🔥"),
        new ButtonBuilder()
          .setCustomId("shop_vip")
          .setLabel("VIP-Rolle")
          .setStyle(ButtonStyle.Success)
          .setEmoji("💎"),
      );

      await shopChannel.send({ embeds: [shopEmbed], components: [row] });
      return msg.reply(
        `Shop erfolgreich im Kanal <#${SHOP_CHANNEL_ID}> eingerichtet!`,
      );
    }
    if (command === "!coinflip") {
  const targetUser = msg.mentions.users.first();
  const betAmount = parseInt(args[2]);

  if (!targetUser || isNaN(betAmount) || betAmount <= 0) {
    return msg.reply({ content: "Nutzung: `!coinflip @User <Einsatz>`", flags: [MessageFlags.Ephemeral] });
  }
  if (targetUser.id === msg.author.id) {
    return msg.reply({ content: "Du kannst nicht gegen dich selbst spielen.", flags: [MessageFlags.Ephemeral] });
  }
  if (msg.channelId !== "1507385550825459812") {
    return msg.reply({ content: "Nur in <#1507385550825459812> nutzbar.", flags: [MessageFlags.Ephemeral] });
  }

  const challengerData = await getEcoData(msg.author.id);
  const challengedData = await getEcoData(targetUser.id);

  if ((challengerData.balance || 0) < betAmount) {
    return msg.reply({ content: "Du hast nicht genug Kekse.", flags: [MessageFlags.Ephemeral] });
  }
  if ((challengedData.balance || 0) < betAmount) {
    return msg.reply({ content: `<@${targetUser.id}> hat nicht genug Kekse.`, flags: [MessageFlags.Ephemeral] });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cf_accept_${msg.author.id}_${targetUser.id}_${betAmount}`)
      .setLabel("Annehmen")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cf_decline_${msg.author.id}_${targetUser.id}`)
      .setLabel("Ablehnen")
      .setStyle(ButtonStyle.Danger),
  );

  const challengeMsg = await msg.channel.send({
    content: `<@${targetUser.id}>, du wurdest von <@${msg.author.id}> zu einem Coinflip um **${betAmount} Kekse** herausgefordert!`,
    components: [row],
  });

  const collector = challengeMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === targetUser.id,
    componentType: ComponentType.Button,
    time: 30000,
  });

  collector.on("collect", async (interaction) => {
    if (interaction.customId.startsWith("cf_decline_")) {
      await interaction.update({ content: `<@${targetUser.id}> hat die Herausforderung abgelehnt.`, components: [] });
      return collector.stop();
    }
    const freshChallenger = await getEcoData(msg.author.id);
    const freshChallenged = await getEcoData(targetUser.id);

    if ((freshChallenger.balance || 0) < betAmount || (freshChallenged.balance || 0) < betAmount) {
      await interaction.update({ content: "❌ Jemand hat nicht mehr genug Kekse.", components: [] });
      return collector.stop();
    }

    const flip = Math.random() < 0.5;
    const winner = flip ? msg.author : targetUser;
    const loser = flip ? targetUser : msg.author;

    const winnerData = flip ? freshChallenger : freshChallenged;
    const loserData = flip ? freshChallenged : freshChallenger;

    winnerData.balance = (winnerData.balance || 0) + betAmount;
    loserData.balance = (loserData.balance || 0) - betAmount;

    await logTransaction(winner.id, betAmount, "plus", "Multiplayer Coinflip");
    await logTransaction(loser.id, betAmount, "minus", "Multiplayer Coinflip");
    await setEcoData(winner.id, winnerData);
    await setEcoData(loser.id, loserData);

    const resultEmbed = new EmbedBuilder()
      .setTitle("Coinflip Ergebnis")
      .setDescription(
        `**Gewinner:** <@${winner.id}> **+${betAmount} Kekse**\n**Verlierer:** <@${loser.id}> **-${betAmount} Kekse**`,
      )
      .setColor(0xffffff)
      .setFooter({ text: "Kekse Clan Casino | Multiplayer Coinflip" });

    await interaction.update({ content: "", embeds: [resultEmbed], components: [] });
    collector.stop();
  });

  collector.on("end", (_, reason) => {
    if (reason === "time") {
      challengeMsg.edit({ content: "⏰ Die Herausforderung ist abgelaufen.", components: [] }).catch(() => {});
    }
  });
}
    if (command === "!ssp") {
  const targetUser = msg.mentions.users.first();
  const betAmount = parseInt(args[2]);

  if (!targetUser || isNaN(betAmount) || betAmount <= 0) {
    return msg.reply({ content: "Nutzung: `!ssp @User <Einsatz>`", flags: [MessageFlags.Ephemeral] });
  }
  if (targetUser.id === msg.author.id) {
    return msg.reply({ content: "Du kannst nicht gegen dich selbst spielen.", flags: [MessageFlags.Ephemeral] });
  }
  if (msg.channelId !== "1507385550825459812") {
    return msg.reply({ content: "Nur in <#1507385550825459812> nutzbar.", flags: [MessageFlags.Ephemeral] });
  }

  const challengerData = await getEcoData(msg.author.id);
  const challengedData = await getEcoData(targetUser.id);

  if ((challengerData.balance || 0) < betAmount) {
    return msg.reply({ content: "Du hast nicht genug Kekse.", flags: [MessageFlags.Ephemeral] });
  }
  if ((challengedData.balance || 0) < betAmount) {
    return msg.reply({ content: `<@${targetUser.id}> hat nicht genug Kekse.`, flags: [MessageFlags.Ephemeral] });
  }
  const SSP_CHOICES = ["schere", "stein", "papier"];
  const SSP_EMOJI = { schere: "✂️", stein: "🪨", papier: "📄" };
  const beats = { schere: "papier", stein: "schere", papier: "stein" };
  const makeChoiceRow = (userId) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ssp_${userId}_schere`).setLabel("✂️ Schere").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ssp_${userId}_stein`).setLabel("🪨 Stein").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ssp_${userId}_papier`).setLabel("📄 Papier").setStyle(ButtonStyle.Secondary),
    );
  const inviteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ssp_invite_accept_${msg.author.id}_${targetUser.id}_${betAmount}`)
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

  const inviteCollector = inviteMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === targetUser.id,
    componentType: ComponentType.Button,
    time: 30000,
    max: 1,
  });

  inviteCollector.on("collect", async (inviteInt) => {
    if (inviteInt.customId.startsWith("ssp_invite_decline_")) {
      return inviteInt.update({ content: `<@${targetUser.id}> hat abgelehnt.`, components: [] });
    }

    await inviteInt.update({ content: `✅ Herausforderung angenommen! Beide Spieler wählen jetzt ihre Geste per DM.`, components: [] });

    const choices = {};

    const askChoice = async (playerUser) => {
      try {
        const dm = await playerUser.send({
          content: `Wähle deine Geste für das Spiel gegen <@${playerUser.id === msg.author.id ? targetUser.id : msg.author.id}> (Einsatz: **${betAmount} Kekse**):`,
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
            await i.update({ content: `Du hast **${SSP_EMOJI[choice]} ${choice}** gewählt. Warte auf deinen Gegner...`, components: [] });
            resolve(choice);
          });

          dmCollector.on("end", (_, reason) => {
            if (reason === "time") {
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
      return inviteMsg.channel.send(`⏰ <@${whoTimeout.id}> hat nicht rechtzeitig gewählt. Das Spiel wurde abgebrochen.`);
    }

    const freshChallenger = await getEcoData(msg.author.id);
    const freshChallenged = await getEcoData(targetUser.id);

    let resultText;
    let winner = null;
    let loser = null;

    if (c1 === c2) {
      resultText = `**Unentschieden!** Beide haben ${c1} gewählt. Kein Keksverlust.`;
    } else if (beats[c1] === c2) {
      winner = msg.author; loser = targetUser;
      freshChallenger.balance = (freshChallenger.balance || 0) + betAmount;
      freshChallenged.balance = (freshChallenged.balance || 0) - betAmount;
      await logTransaction(winner.id, betAmount, "plus", "Multiplayer SSP");
      await logTransaction(loser.id, betAmount, "minus", "Multiplayer SSP");
      await setEcoData(winner.id, freshChallenger);
      await setEcoData(loser.id, freshChallenged);
      resultText = `**Gewinner:** <@${winner.id}> ${SSP_EMOJI[c1]} **+${betAmount} Kekse**\n**Verlierer:** <@${loser.id}> ${SSP_EMOJI[c2]} **-${betAmount} Kekse**`;
    } else {
      winner = targetUser; loser = msg.author;
      freshChallenged.balance = (freshChallenged.balance || 0) + betAmount;
      freshChallenger.balance = (freshChallenger.balance || 0) - betAmount;
      await logTransaction(winner.id, betAmount, "plus", "Multiplayer SSP");
      await logTransaction(loser.id, betAmount, "minus", "Multiplayer SSP");
      await setEcoData(winner.id, freshChallenged);
      await setEcoData(loser.id, freshChallenger);
      resultText = `**Gewinner:** <@${winner.id}> ${SSP_EMOJI[c2]} **+${betAmount} Kekse**\n**Verlierer:** <@${loser.id}> ${SSP_EMOJI[c1]} **-${betAmount} Kekse**`;
    }

    const resultEmbed = new EmbedBuilder()
      .setTitle("Schere-Stein-Papier Ergebnis")
      .setDescription(`<@${msg.author.id}> hat **${SSP_EMOJI[c1]} ${c1}** gewählt.\n<@${targetUser.id}> hat **${SSP_EMOJI[c2]} ${c2}** gewählt.\n\n${resultText}`)
      .setColor(0xffffff)
      .setFooter({ text: "Kekse Clan Casino | Multiplayer SSP" });

    await inviteMsg.channel.send({ embeds: [resultEmbed] });
  });

  inviteCollector.on("end", (collected, reason) => {
    if (reason === "time") {
      inviteMsg.edit({ content: "⏰ Die Herausforderung ist abgelaufen.", components: [] }).catch(() => {});
    }
  });
}
    if (command === "!casino") {
      const hasEcoRole = msg.member.roles.cache.has("1506732560837771284");
      if (!hasEcoRole) {
        return msg.reply({
          content:
            "Du benötigst ein Bankkonto, um am Casino teilzunehmen. Nutze `!bank create`.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (msg.channelId !== "1507385550825459812") {
        return msg.reply({
          content: "Das Casino ist nur in <#1507385550825459812> nutzbar.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      const userData = await getEcoData(msg.author.id);
      if (userData.blocked) {
        return msg.reply({
          content: "Dein Konto ist gesperrt. Bitte wende dich an den Support.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (subCommand === "roulette") {
        const betAmount = parseInt(args[2]);
        const betType = args[3]?.toLowerCase();
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({
            content:
              "Nutzung: `!casino roulette <Einsatz> <red|black|even|odd|0-36|1-18|19-36>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (!betType) {
          return msg.reply({
            content:
              "Bitte gib eine Wettart an: `red`, `black`, `even`, `odd`, eine Zahl `0`-`36`, `1-18` oder `19-36`.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
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
          betDesc = "1–18";
        } else if (betType === "19-36") {
          won = spin >= 19 && spin <= 36;
          payout = won ? betAmount : -betAmount;
          betDesc = "19–36";
        } else {
          return msg.reply({
            content:
              "Ungültige Wettart. Nutze: `red`, `black`, `even`, `odd`, eine Zahl (0–36), `1-18` oder `19-36`.",
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
            name: won ? "✅ Gewonnen!" : "❌ Verloren!",
            value: `${payout >= 0 ? "+" : ""}${payout} Kekse\nNeuer Kontostand: **${userData.balance} Kekse**`,
          })
          .setColor(won ? 0x333333 : 0x333333);

        return msg.reply({ embeds: [roulEmbed] });
      }
      if (subCommand === "coinflip") {
        const betAmount = parseInt(args[2]);
        const choice = args[3]?.toLowerCase();
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({
            content: "Nutzung: `!casino coinflip <Einsatz> <heads|tails>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (choice !== "heads" && choice !== "tails") {
          return msg.reply({
            content: "Bitte wähle `heads` (Kopf) oder `tails` (Zahl).",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({
            content: "Du hast nicht genug Kekse für diesen Einsatz.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        const flip = Math.random() < 0.5 ? "heads" : "tails";
        const won = flip === choice;
        userData.balance =
          (userData.balance || 0) + (won ? betAmount : -betAmount);
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
            name: won ? "✅ Gewonnen!" : "❌ Verloren!",
            value: `${won ? "+" : "-"}${betAmount} Kekse\nNeuer Kontostand: **${userData.balance} Kekse**`,
          })
          .setColor(won ? 0x333333 : 0x333333);

        return msg.reply({ embeds: [cfEmbed] });
      }
      if (subCommand === "jackpot") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({
            content: "Nutzung: `!casino jackpot <Einsatz>`",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({
            content: "Du hast nicht genug Kekse für diesen Einsatz.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (jackpotState.entries.find((e) => e.userId === msg.author.id)) {
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
              return `<@${e.userId}> — **${e.betAmount} Kekse** (${pct}%)`;
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

        const userChance = ((betAmount / jackpotState.totalPool) * 100).toFixed(
          1,
        );

        if (jackpotState.entries.length === 1) {
          const jMsg = await msg.channel.send({
            embeds: [buildJackpotEmbed("Warte auf weitere Teilnehmer…")],
          });
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
                    `⏳ Ziehung <t:${Math.floor(drawTime / 1000)}:R>`,
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
      }
      if (subCommand === "crash") {
  const betAmount = parseInt(args[2]);
  if (isNaN(betAmount) || betAmount <= 0) {
    return msg.reply({
      content: "Nutzung: `!casino crash <Einsatz>`",
      flags: [MessageFlags.Ephemeral],
    });
  }
  if (betAmount > (userData.balance || 0)) {
    return msg.reply({
      content: "Du hast nicht genug Kekse für diesen Einsatz.",
      flags: [MessageFlags.Ephemeral],
    });
  }
  if (crashGames.has(msg.author.id)) {
    return msg.reply({
      content: "Du hast bereits ein aktives Crash-Spiel!",
      flags: [MessageFlags.Ephemeral],
    });
  }

  userData.balance -= betAmount;
  await logTransaction(msg.author.id, betAmount, "minus", "Casino Crash");
  await setEcoData(msg.author.id, userData);

  const crashPoint = parseFloat(
    Math.max(1.01, 0.50 / (1 - Math.random())).toFixed(2),
  );
  let multiplier = 1.0;
  let intervalHandle = null;

  const cashoutRow = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`crash_cashout_${msg.author.id}`)
        .setLabel(`Cash Out (${Math.floor(betAmount * multiplier)} Kekse)`)
        .setStyle(ButtonStyle.Success),
    );

  const crashEmbed = (crashed = false, cashedAt = null) => {
    if (crashed)
      return new EmbedBuilder()
        .setTitle("💥 CRASH!")
        .setDescription(
          `Gecrasht bei **${crashPoint.toFixed(2)}x**!\n\nEinsatz: **${betAmount} Kekse** — **Verloren!**\nNeuer Kontostand: **${userData.balance} Kekse**`,
        )
        .setColor(0x333333);
    if (cashedAt !== null) {
      const win = Math.floor(betAmount * cashedAt);
      return new EmbedBuilder()
        .setTitle("✅ Cash Out!")
        .setDescription(
          `Ausgecasht bei **${cashedAt.toFixed(2)}x**!\n\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${userData.balance + win} Kekse**`,
        )
        .setColor(0x333333);
    }
    return new EmbedBuilder()
      .setTitle("Crash")
      .setDescription(
        `**${multiplier.toFixed(2)}x** — Steigt noch…\n\nEinsatz: **${betAmount} Kekse**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**\n\nDrücke **Cash Out** bevor die Rakete crasht!`,
      )
      .setColor(0xffffff);
  };

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
      await interaction.reply({
        content: "Zu spät — das Spiel ist bereits beendet!",
        flags: [MessageFlags.Ephemeral],
      }).catch(() => {});
      return;
    }

    game.cashedOut = true;
    game.cashedAtMultiplier = multiplier;
    if (intervalHandle) clearInterval(intervalHandle);
    crashGames.delete(msg.author.id);
    collector.stop("cashout");

    const win = Math.floor(betAmount * game.cashedAtMultiplier);
    userData.balance += win;
    await logTransaction(msg.author.id, win, "plus", "Casino Crash");
    await setEcoData(msg.author.id, userData);

    await interaction.update({
      embeds: [crashEmbed(false, game.cashedAtMultiplier)],
      components: [],
    }).catch(() => {});
  });

  intervalHandle = setInterval(async () => {
    const game = crashGames.get(msg.author.id);
    if (!game) {
      clearInterval(intervalHandle);
      return;
    }

    multiplier = parseFloat((multiplier + 0.08).toFixed(2));

    if (multiplier >= game.crashPoint) {
      clearInterval(intervalHandle);
      crashGames.delete(msg.author.id);
      collector.stop("crashed");
      await gameMsg
        .edit({ embeds: [crashEmbed(true)], components: [] })
        .catch(() => {});
      return;
    }

    await gameMsg
      .edit({ embeds: [crashEmbed()], components: [cashoutRow()] })
      .catch(() => {});
  }, 600);

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
  const betAmount = args.map(Number).find(n => !isNaN(n) && n > 0);
  if (isNaN(betAmount) || betAmount <= 0) {
    return msg.reply({
      content: "Nutzung: `!casino highlow <Einsatz>`",
      flags: [MessageFlags.Ephemeral],
    });
  }
  if (betAmount > (userData.balance || 0)) {
    return msg.reply({
      content: "Du hast nicht genug Kekse für diesen Einsatz.",
      flags: [MessageFlags.Ephemeral],
    });
  }
  if (hlGames.has(msg.author.id)) {
    return msg.reply({
      content: "Du hast bereits ein aktives Higher/Lower-Spiel!",
      flags: [MessageFlags.Ephemeral],
    });
  }
  const todayStr = new Date().toISOString().split("T")[0];
  if (userData.hl_cooldown_date !== todayStr) {
    userData.hl_cooldown_date = todayStr;
    userData.hl_today_count = 0;
  }
  if ((userData.hl_today_count || 0) >= 5) {
    return msg.reply({
      content: "🛑 Du hast dein Limit von **5 Higher/Lower-Spielen** für heute bereits erreicht! Versuche es morgen wieder.",
      flags: [MessageFlags.Ephemeral],
    });
  }
  userData.hl_today_count = (userData.hl_today_count || 0) + 1;
  userData.balance -= betAmount;

  await logTransaction(msg.author.id, betAmount, "minus", "Casino Higher Lower");
  await setEcoData(msg.author.id, userData);
  hlGames.set(msg.author.id, true);
  const cardNames = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const cardVals = { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
  const suits = ["♠️", "♥️", "♦️", "♣️"];
  
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
        .setLabel("⬆️ Higher")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`hl_lower_${msg.author.id}`)
        .setLabel("⬇️ Lower")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`hl_cashout_${msg.author.id}`)
        .setLabel(`Cash Out (${Math.floor(betAmount * multiplier)} Kekse)`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled || streak === 0),
    );

  const hlEmbed = (desc, color = 0xffffff) =>
    new EmbedBuilder()
      .setTitle("Higher or Lower")
      .setDescription(desc)
      .setColor(0xffffff);

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
                `🟡 Unentschieden! Neue Karte: **${nextCard.display}**\nStreak: **${streak}** | Multiplikator: **${multiplier.toFixed(2)}x**\n\nIst die nächste Karte höher oder niedriger?`,
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
                `✅ Richtig! Nächste Karte war **${nextCard.display}**\n\nAktuelle Karte: **${currentCard.display}**\nStreak: **${streak}** | Multiplikator: **${multiplier.toFixed(2)}x**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**\n\nWeiterhöhen oder auszahlen?`,
                0x57f287,
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
      await logTransaction(msg.author.id, win, "plus", "Casino Higher Lower");
      await setEcoData(msg.author.id, fresh);
      await gameMsg
        .edit({
          embeds: [
            hlEmbed(
              `💰 **Cash Out!**\n\nMultiplikator: **${multiplier.toFixed(2)}x**\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${fresh.balance} Kekse**`,
              0x57f287,
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
              `❌ **Falsch gegambelt!**\n\nDie Karte war **${lastDrawnCard ? lastDrawnCard.display : "Unbekannt"}**.\nDu hast **${betAmount} Kekse** verloren.\nNeuer Kontostand: **${fresh.balance} Kekse**`,
              0xed4245,
            ),
          ],
          components: [],
        })
        .catch(() => {});
    } else {
      if (streak > 0) {
        const win = Math.floor(betAmount * multiplier);
        fresh.balance = (fresh.balance || 0) + win;
        await logTransaction(msg.author.id, win, "plus", "Casino Higher Lower");
        await setEcoData(msg.author.id, fresh);
        await gameMsg
          .edit({
            embeds: [
              hlEmbed(
                `⏰ **Zeit abgelaufen!**\n\nAutomatischer Cash-Out bei **${multiplier.toFixed(2)}x**\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                0xe67e22,
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
                `⏰ **Zeit abgelaufen!**\n\nDu hast zu lange gebraucht und **${betAmount} Kekse** verloren.\nNeuer Kontostand: **${fresh.balance} Kekse**`,
                0xed4245,
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
      if (subCommand === "blackjack") {
        const betAmount = parseInt(args[2]);
        if (isNaN(betAmount) || betAmount <= 0) {
          return msg.reply({
            content:
              "Bitte gib einen gültigen Einsatz an (z.B. `!casino blackjack 10`).",
            flags: [MessageFlags.Ephemeral],
          });
        }
        if (betAmount > (userData.balance || 0)) {
          return msg.reply({
            content: "Du hast nicht genug Kekse für diesen Einsatz.",
            flags: [MessageFlags.Ephemeral],
          });
        }

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
            : `${dealerHand[0].name} 🎴`;

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
            status = "Echter Blackjack! Du gewinnst das 1.5-fache!";
            userData.balance += Math.floor(betAmount * 1.5);
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
            await logTransaction(
              msg.author.id,
              betAmount,
              "plus",
              "Casino Blackjack",
            );
          } else if (pScore > dScore) {
            status = "Mehr Punkte als der Dealer. Du gewinnst!";
            userData.balance += betAmount;
            await logTransaction(
              msg.author.id,
              betAmount,
              "plus",
              "Casino Blackjack",
            );
          } else if (pScore < dScore) {
            status = "Dealer hat mehr Punkte. Verloren!";
            userData.balance -= betAmount;
            await logTransaction(
              msg.author.id,
              betAmount,
              "minus",
              "Casino Blackjack",
            );
            finalColor = 0x333333;
          } else {
            status = "Unentschieden! Kekse zurück.";
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
      return msg.reply({
        content:
          "Unbekanntes Casino-Spiel. Verfügbar: `roulette`, `coinflip`, `jackpot`, `crash`, `highlow`, `blackjack`\nBeispiel: `!casino coinflip 10 heads`",
      });
    }
    if (command === "!bank") {
      const hasEcoRole = msg.member.roles.cache.has("1506732560837771284");
      const isAdmin = msg.author.id === "1151971830983311441";
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
          if (!targetUser)
            return msg.reply({
              content: "Bitte erwähne einen Nutzer.",
              flags: [MessageFlags.Ephemeral],
            });
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
          return msg.reply({
            content: "Bitte gib eine gültige Anzahl an Keksen an.",
            flags: [MessageFlags.Ephemeral],
          });
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
            {
              name: "Aktion",
              value:
                subCommand === "add" ? `+${amount} Kekse` : `-${amount} Kekse`,
            },
            { name: "Neuer Kontostand", value: `${currentBalance} Kekse` },
          )
          .setColor(0xffffff);

        await msg.author.send({ embeds: [logEmbed] }).catch(() => {});
        return msg.delete().catch(() => {});
      }

      if (subCommand === "create") {
        if (hasEcoRole) {
          return msg.reply({
            content: "Du besitzt bereits ein registriertes Bankkonto.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`open_bank_modal_${msg.author.id}`)
            .setLabel("Registrierungsformular öffnen")
            .setStyle(ButtonStyle.Primary),
        );

        const reply = await msg.reply({
          content:
            "Klicke auf den Button unten, um dein Konto zu erstellen. Dieser Button funktioniert nur für dich.",
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
          .setTitle("🏦 Bank-System Hilfe")
          .setColor(0xffffff)
          .setDescription("Hier findest du alle verfügbaren Befehle:")
          .addFields(
            {
              name: "`!bank create`",
              value:
                "Erstellt dein persönliches Bankkonto (Erfordert Minecraft-Namen).",
            },
            {
              name: "`!bank`",
              value: "Zeigt dir deinen aktuellen Kontostand (Privat für dich).",
            },
          );

        return msg.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
      }
      if (subCommand === "pay") {
        let targetArg = args[2];
        let amountArg = args[3];

        const targetUserId = targetArg?.replace(/[<@!&>#]/g, "");
        const amount = parseInt(amountArg);
        const userData = await getEcoData(msg.author.id);

        if (!targetUserId || isNaN(amount) || amount <= 0) {
          return msg.reply({
            content: "Nutzung: `!bank pay @User <Betrag>`",
            flags: [MessageFlags.Ephemeral],
          });
        }

        if (targetUserId === msg.author.id) {
          return msg.reply({
            content: "Du kannst dir selbst keine Kekse überweisen.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        if (amount > (userData.balance || 0)) {
          return msg.reply({
            content: "Du hast nicht genug Kekse für diese Überweisung.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        const targetData = await getEcoData(targetUserId);
        if (!targetData || targetData.blocked) {
          return msg.reply({
            content: "Der Zielnutzer hat kein aktives Konto oder ist gesperrt.",
            flags: [MessageFlags.Ephemeral],
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
          `[Economy] Überweisung von ${userData.username || msg.author.username} an ${targetData.username || targetUserId} für ${amount} Kekse.`,
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

        await msg.reply({ embeds: [payEmbed], flags: [MessageFlags.Ephemeral] });

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
      if (subCommand === "get") {
        if (msg.author.id === "1151971830983311441") {
          const existingKekse = await initEconomyGetKekse(client);
          return msg.reply(`Es sind aktuell ${existingKekse} Kekse im Umlauf.`);
        } else {
          return msg.reply(
            `Du hast nicht die Berechtigung diese Funktion zu nutzen. Wenn es sich um einen Fehler handelt wende dich bitte an den Support.`,
          );
        }
      }
      if (!subCommand) {
        if (!hasEcoRole) {
          return msg.reply({
            content:
              "Du hast noch kein Konto. Nutze `!bank create`, um dich zu registrieren.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        const userData = await getEcoData(msg.author.id);

        if (userData.blocked) {
          return msg.reply({
            content:
              "Dein Konto ist aktuell gesperrt. Bitte wende dich an den Support.",
            flags: [MessageFlags.Ephemeral],
          });
        }
        const userName = msg.author;
        if (msg.content.startsWith("!bank")) {
          await msg.delete().catch(() => {});
          return userName.send({
            content: `Dein aktueller Kontostand beträgt: **${userData.balance || 0} Kekse** 🍪`,
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
          return interaction.reply({
            content:
              "Du kannst diesen Button nicht nutzen, da du den Befehl nicht eingegeben hast.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        const hasEcoRole = interaction.member.roles.cache.has(
          "1506732560837771284",
        );
        if (hasEcoRole) {
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
        const hasEcoRole = interaction.member.roles.cache.has(
          "1506732560837771284",
        );
        if (!hasEcoRole) {
          return interaction.reply({
            content:
              "Du benötigst zuerst ein registriertes Bankkonto (`!bank create`).",
            flags: [MessageFlags.Ephemeral],
          });
        }

        const setupId = interaction.customId.replace("daily_claim_", "");
        const localizedDateStr = new Date().toLocaleDateString("sv-SE", {
          timeZone: "Europe/Berlin",
        });
        const userData = (await getEcoData(interaction.user.id)) || {};

        if (!userData.claimedDailies) {
          userData.claimedDailies = {};
        }
        if (userData.claimedDailies[setupId] === localizedDateStr) {
          return interaction.reply({
            content: `Du hast deine Kekse für **dieses spezifische Event** heute bereits abgeholt! Versuche es nach 00:00 Uhr erneut.`,
            flags: [MessageFlags.Ephemeral],
          });
        }
        const payout = 10;
        userData.balance = (userData.balance || 0) + payout;
        await logTransaction(interaction.user.id, payout, "plus", "Daily");
        userData.claimedDailies[setupId] = localizedDateStr;

        if (typeof userData.markModified === "function") {
          userData.markModified("claimedDailies");
        } else {
          userData.claimedDailies = { ...userData.claimedDailies };
        }
        await setEcoData(interaction.user.id, userData);
        return interaction.reply({
          content:
            "Erfolgreich! Dir wurden 10 Kekse auf dein Bankkonto gutgeschrieben.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      if (interaction.customId.startsWith("shop_")) {
        const member = interaction.member;
        const itemType = interaction.customId.replace("shop_", "");
        const SHOP_ITEMS = {
          giveaway: {
            roleId: "1506164984202264656",
            name: "🎉 Double Chance Giveaway",
            duration: null,
            price: 100000,
          },
          puffer: {
            roleId: "1508050024355856494",
            name: "🛡️ Counting Puffer",
            duration: null,
            price: 25000,
          },
          xp30: {
            roleId: "1506164829029666827",
            name: "⚡ Counting XP Booster (30 Min)",
            duration: 30 * 60 * 1000,
            price: 50000,
          },
          xp60: {
            roleId: "1508054186930208768",
            name: "🔥 Counting XP Booster (60 Min)",
            duration: 60 * 60 * 1000,
            price: 100000,
          },
          vip: {
            roleId: "1434555291252297728",
            name: "💎 VIP-Rolle (7d)",
            duration: 7 * 24 * 60 * 60 * 1000,
            price: 500000,
          }
        };

        const item = SHOP_ITEMS[itemType];
        if (!item)
          return interaction.reply({
            content: "Dieses Item existiert nicht!",
            flags: MessageFlags.Ephemeral,
          });

        if (member.roles.cache.has(item.roleId)) {
          return interaction.reply({
            content: `Du besitzt das Item **${item.name}** bereits!`,
            flags: MessageFlags.Ephemeral,
          });
        }

        let freshData = await getEcoData(interaction.user.id);
        if (!freshData || typeof freshData !== "object") freshData = {};
        let currentCookies = freshData.balance || 0;

        if (currentCookies < item.price) {
          return interaction.reply({
            content: `❌ Du hast nicht genug Kekse für diesen Kauf! Ein(e) **${item.name}** kostet **${item.price.toLocaleString("de-DE")} Kekse** (Du hast: ${currentCookies.toLocaleString("de-DE")}).`,
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

          await setEcoData(interaction.user.id, finalData);
          await member.roles.add(item.roleId);

          await interaction.reply({
            content: `🛒 Kauf erfolgreich: Du hast **${item.name}** erhalten!`,
            flags: MessageFlags.Ephemeral,
          });
          addXP(interaction.user.id, 100, client);

          const invoiceEmbed = {
            color: 0xffffff,
            title: "🧾 Deine Shop-Quittung",
            description: `Vielen Dank für deinen Einkauf auf unserem Server!`,
            fields: [
              { name: "Gekauftes Item", value: item.name, inline: true },
              {
                name: "Abgezogene Kekse",
                value: `-${item.price.toLocaleString("de-DE")} 🍪`,
                inline: true,
              },
              {
                name: "Neuer Kontostand",
                value: `${finalData.balance.toLocaleString("de-DE")} 🍪`,
                inline: false,
              },
            ],
            timestamp: new Date(),
          };

          await interaction.user.send({ embeds: [invoiceEmbed] }).catch(() => {
            console.log(
              `Konnte keine DM an ${interaction.user.tag} senden (DMs geschlossen).`,
            );
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
          await member.roles.add("1506732560837771284").catch(() => {});
        }

        await interaction.reply({
          content: `Dein Konto wurde erfolgreich angelegt!\n**Minecraft-Name:** ${mcUsername}\n**Startguthaben:** 100 Kekse\nDu hast nun Zugriff auf dein Konto mit \`!bank\`.`,
          flags: MessageFlags.Ephemeral,
        });

        if (typeof dashboardLog === "function") {
          console.log(
            `[Economy] Neues Konto für ${interaction.user.id} (MC: ${mcUsername}) erstellt.`,
          );
        }
      }
    }
  });
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
      msg.channel.send({ files: [attachment] });
    }
    if (cmd === "sand") {
      const filePfad = path.join(__dirname, "sandkorn.png");
      const attachment = new AttachmentBuilder(filePfad, {
        name: "sandkorn.png",
      });
      msg.channel.send({ files: [attachment] });
    }
    if (cmd === "sandkorn") {
      const filePfad = path.join(__dirname, "strand.jpg");
      const attachment = new AttachmentBuilder(filePfad, {
        name: "strand.jpg",
      });
      msg.channel.send({ files: [attachment] });
    }
  });
}
let activeTransfers = new Map();
async function saveActiveTransfers() {
  await dbSet(
    "economy",
    "active_transfers",
    Object.fromEntries(activeTransfers),
  );
}
async function loadActiveTransfers() {
  const saved = await dbGet("economy", "active_transfers");
  if (saved && typeof saved === "object") {
    for (const [id, transfer] of Object.entries(saved)) {
      activeTransfers.set(id, transfer);
    }
    console.log(
      `[Transfer] ${activeTransfers.size} aktive Transfers aus DB geladen.`,
    );
  }
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
    if (channelId === LOG_CHANNEL_ID) return;
    const chan = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!chan) return;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({
        name: user?.tag || "System / Admin",
        iconURL: user?.displayAvatarURL() || client.user.displayAvatarURL(),
      })
      .setDescription(`**Event:** \`${title}\`\n${text}`)
      .setFooter({ text: "Kekse Clan Security | Master Log" })
      .setTimestamp();

    if (thumb) embed.setThumbnail(thumb);
    await chan.send({ embeds: [embed] }).catch(() => {});
  };

  client.on(Events.MessageDelete, async (msg) => {
    if (msg.partial || msg.author?.bot || msg.channel.id === LOG_CHANNEL_ID)
      return;
    const ghostPing =
      msg.mentions.users.size > 0 ? "⚠️ **GHOST PING ERKANNT**\n" : "";
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
      oldMsg.channel.id === LOG_CHANNEL_ID
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
    await sendLog(
      "User Join",
      member.user,
      `<@${member.id}> (${member.user.tag}) ist beigetreten.\nAccount erstellt: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      "#ffffff",
      member.user.displayAvatarURL(),
    );
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    await sendLog(
      "User Leave",
      member.user,
      `<@${member.id}> (${member.user.tag}) ist gegangen oder wurde entfernt.`,
      "#f04747",
      member.user.displayAvatarURL(),
    );
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (oldMember.nickname !== newMember.nickname) {
      await sendLog(
        "Nickname geändert",
        newMember.user,
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
    } else if (oldState.channelId && !newState.channelId) {
      await sendLog(
        "VC Leave",
        user,
        `Kanal: <#${oldState.channelId}>`,
        "#ffffff",
      );
    } else if (oldState.channelId !== newState.channelId) {
      await sendLog(
        "VC Wechsel",
        user,
        `<#${oldState.channelId}> ➔ <#${newState.channelId}>`,
        "#ffffff",
      );
    }
    if (!oldState.selfMute && newState.selfMute) {
      await sendLog(
        "User gestummt (VC)",
        user,
        `In Kanal: <#${newState.channelId}>`,
      );
    }
  });

  client.on(Events.GuildAuditLogEntryCreate, async (entry) => {
    const { action, executorId, targetId } = entry;
    const executor = await client.users.fetch(executorId).catch(() => null);

    if (action === AuditLogEvent.ChannelCreate) {
      await sendLog(
        "Channel erstellt",
        executor,
        `ID: <#${targetId}>\nEin neuer Kanal wurde angelegt.`,
      );
    }
    if (action === AuditLogEvent.ChannelDelete) {
      await sendLog(
        "Channel gelöscht",
        executor,
        `ID: \`${targetId}\` (Kanal wurde entfernt)`,
        "#ffffff",
      );
    }
    if (action === AuditLogEvent.ChannelUpdate) {
      await sendLog(
        "Channel aktualisiert",
        executor,
        `Einstellungen in <#${targetId}> wurden geändert.`,
      );
    }
    if (
      action === AuditLogEvent.ChannelOverwriteUpdate ||
      action === AuditLogEvent.ChannelOverwriteCreate ||
      action === AuditLogEvent.ChannelOverwriteDelete
    ) {
      await sendLog(
        "Channel Permissions aktualisiert",
        executor,
        `Berechtigungen in <#${targetId}> wurden modifiziert.`,
        "#ffffff",
      );
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
        `Eine neue Rolle wurde angelegt.`,
      );
    }
    if (action === AuditLogEvent.RoleDelete) {
      await sendLog(
        "Rolle gelöscht",
        executor,
        `ID: \`${targetId}\` (Rolle wurde entfernt)`,
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
const TEAM_ROLE_ID = "1457906448234319922";
export async function clear(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Moderation System" })
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
          .edit(" Keine Nachrichten gefunden, die den Kriterien entsprechen.")
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
        `[ClearCommand] Fehler bei der Ausführung: ${clearError.message}`,
      );
      if (statusMsg)
        await statusMsg
          .edit("❌ Ein interner Fehler ist beim Löschen aufgetreten.")
          .catch(() => {});
      return;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    await statusMsg.delete().catch(() => {});

    const finishMsg = await message.channel.send(
      `✅ **Abschlussbericht:**\n- Gelöscht: **${deletedCount}**\n- Dauer: **${duration}s**\n- Kanal: <#${targetChannel.id}>`,
    );

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

    globalBotStats.commandsRunned += 1;
    setTimeout(() => finishMsg.delete().catch(() => {}), 15000);
  });
}
export const ruleMap = {
  "§1a1n1": {
    section: "Respekt und Freundlichkeit",
    text: "Sei respektvoll. Beleidigungen, Diskriminierung, Mobbing oder Drohungen werden nicht toleriert.",
  },
  "§1a1n2": {
    section: "Respekt und Freundlichkeit",
    text: "Diskutiere sachlich und vermeide provokative Streitigkeiten.",
  },
  "§1a2n1": {
    section: "Keine unangemessenen Inhalte",
    text: "Keine anstößigen, pornografischen, rassistischen oder gewalttätigen Inhalte posten.",
  },
  "§1a2n2": {
    section: "Keine unangemessenen Inhalte",
    text: "Illegale Inhalte oder Diskussionen über illegale Aktivitäten sind verboten.",
  },
  "§1a3n1": {
    section: "Spam, Werbung und Links",
    text: "Spam jeglicher Art ist nicht erlaubt.",
  },
  "§1a3n2": {
    section: "Spam, Werbung und Links",
    text: "Werbung oder Links nur in genehmigten Kanälen mit Zustimmung der Moderatoren.",
  },
  "§2a1n1": {
    section: "Datenschutz",
    text: "Keine persönlichen Informationen ohne Erlaubnis teilen. Respektiere die Privatsphäre anderer Mitglieder.",
  },
  "§2a2n1": {
    section: "Keine unerwünschte Kontaktaufnahme",
    text: "Keine unaufgeforderten Direktnachrichten, insbesondere Werbung oder Anfragen.",
  },
  "§2a2n2": {
    section: "Keine unerwünschte Kontaktaufnahme",
    text: "Wünsche nach Ruhe respektieren.",
  },
  "§3a1n1": {
    section: "Richtige Kanäle",
    text: "Poste nur im passenden Kanal.",
  },
  "§3a1n2": {
    section: "Richtige Kanäle",
    text: "Nutze die richtigen Kanäle für Fragen, Diskussionen oder Medien.",
  },
  "§3a1n3": {
    section: "Richtige Kanäle",
    text: "Bots dürfen nur in den dafür vorgesehenen Channels verwendet werden.",
  },
  "§3a2n1": {
    section: "Sprache und Ausdruck",
    text: "Freundlich und konstruktiv kommunizieren. Fluchen nur in Maßen.",
  },
  "§3a2n2": {
    section: "Sprache und Ausdruck",
    text: "Server-Sprache: Deutsch.",
  },
  "§3a3n1": { section: "Voice Chats", text: "Störgeräusche vermeiden." },
  "§3a3n2": {
    section: "Voice Chats",
    text: "Dauerhaftes Stummschalten oder wiederholtes Verlassen und Betreten ist nicht erlaubt.",
  },
  "§4a1n1": {
    section: "Tickets",
    text: "Missbrauch von Tickets, z. B. ohne Grund öffnen, wird bestraft.",
  },
  "§5a1n1": {
    section: "Giveaways",
    text: "Tickets für Giveaways müssen innerhalb von 2 Tagen nach Ende geöffnet werden, sonst erfolgt ein Reroll.",
  },
  "§5a1n2": {
    section: "Giveaways",
    text: "Mitglieder, die aktuell gebannt sind, dürfen nicht am Giveaway teilnehmen.",
  },
  "§6a1n1": {
    section: "Verhalten gegenüber Moderatoren",
    text: "Entscheidungen der Moderatoren respektieren. Probleme über ein Ticket klären.",
  },
  "§6a1n2": {
    section: "Verhalten gegenüber Moderatoren",
    text: "Den Anweisungen der Moderatoren Folge leisten.",
  },
  "-ssa-": {
    section: "Mögliche Gefahr durch Spamming.",
    text: "Der User wurde von Discord mit 'Engaged in suspected spam activity' gekennzeichnet und wird aufgrund der ausgehenden Gefahr vom Discord Server ausgeschlossen.",
  },
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
    ban: "Bann",
    kick: "Kick",
    timeout: "Timeout",
  };
  const label = typeLabels[type] || type;

  const message = `Hey ${user.username},

dein Account auf \`Kekse Clan\` hat eine Strafe erhalten: **${label}**.

Grund: ${reason}${sectionTitle ? ` (${sectionTitle})` : ""}${durationText}${ruleText}

Um sicherzustellen, dass unsere Community sicher und freundlich bleibt, befolge bitte unsere Regeln. Die vollständigen Regeln findest du hier: https://discord.com/channels/1423413347168157718/1423413348065611949`;

  await user
    .send(message)
    .catch(() => console.log(`Konnte DM an ${user.tag} nicht senden.`));
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
      const timeoutChange = entry.changes.find(
        (c) => c.key === "communication_disabled_until",
      );
      if (timeoutChange && timeoutChange.new) {
        type = "timeout";
        duration = "Check Audit Log";
      }
    }

    if (type) {
      const target = await client.users.fetch(targetId).catch(() => null);
      if (target) {
        if (type === "timeout") {
          const timeoutChange = entry.changes.find(
            (c) => c.key === "communication_disabled_until",
          );
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
        await sendPunishmentInfo(
          target,
          type,
          reason || "Kein Grund angegeben.",
          duration,
        );
      }
    }
  });
}
function hasPerm(member) {
  return member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
}

export function initModeration(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;
    if (!msg.member.roles.cache.has("1457906448234319922") || !hasPerm(msg.member))
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
        .fetch(LOG_CHANNEL_ID)
        .catch(() => null);
      if (!logChannel) return;

      const kekseEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: msg.author.username,
          iconURL: msg.author.displayAvatarURL({ size: 512 }),
        })
        .setTitle(`🛠️ Mod-Aktion: ${action}`)
        .setDescription(
          `**Target:** ${target.tag || target.id} (\`${target.id}\`)\n**Grund:** ${reason}${extra ? `\n**Info:** ${extra}` : ""}`,
        )
        .setFooter({ text: "Kekse Clan | Moderation Logs" })
        .setTimestamp();

      await logChannel.send({ embeds: [kekseEmbed] }).catch(() => {});
    };
    if (cmd === "timeout") {
      const user = await getUser(args[0]);
      const durationStr = args[1];
      const reason = args.slice(2).join(" ") || "Kein Grund";
      if (!user || !durationStr)
        return msg.reply({
          content: " Syntax: `!timeout @user 10m Grund`.",
          flags: [MessageFlags.Ephemeral],
        });
      const match = durationStr.match(/^(\d+)([smhd])$/);
      if (!match)
        return msg.reply({
          content: " Format: 10s, 5m, 2h, 1d",
          flags: [MessageFlags.Ephemeral],
        });
      const durationMs = parseTimeframe(durationStr);
      if (durationMs === 0)
        return msg.reply({
          content: " Ungültige Zeitangabe.",
          flags: [MessageFlags.Ephemeral],
        });
      try {
        const member = await msg.guild.members.fetch(user.id);
        await member.timeout(durationMs, reason);
        await sendModLog("Timeout", user, reason, `Dauer: ${durationStr}`);
        await msg.reply({
          content: ` **Timeout**: <@${user.id}> für ${durationStr}.`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        await msg.reply({
          content: " Fehler: User nicht auf Server oder fehlende Rechte.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "untimeout") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user)
        return msg.reply({
          content: "❌ User nicht gefunden.",
          flags: [MessageFlags.Ephemeral],
        });

      try {
        const member = await msg.guild.members.fetch(user.id);
        await member.timeout(null, reason);
        await sendModLog("Untimeout", user, reason);
        await msg.reply({
          content: `✅ **Untimeout**: <@${user.id}>`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        await msg.reply({
          content: "❌ Fehler beim Untimeout.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      globalBotStats.commandsRunned += 1;
    }

    if (cmd === "kick") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user)
        return msg.reply({
          content: "❌ User nicht gefunden.",
          flags: [MessageFlags.Ephemeral],
        });

      try {
        await msg.guild.members.kick(user.id, reason);
        await sendModLog("Kick", user, reason);
        await msg.reply({
          content: `✅ **Kick**: <@${user.id}>`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        await msg.reply({ content: "❌ Fehler beim Kick.", flags: [MessageFlags.Ephemeral] });
      }
      globalBotStats.commandsRunned += 1;
    }

    if (cmd === "ban") {
      const idInput = args[0]?.replace(/[<@!>]/g, "");
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!idInput || !/^\d{17,20}$/.test(idInput))
        return msg.reply({
          content: "❌ Gültige ID/Erwähnung angeben.",
          flags: [MessageFlags.Ephemeral],
        });

      try {
        const user = await client.users
          .fetch(idInput)
          .catch(() => ({ id: idInput, tag: "Unknown#0000" }));
        await msg.guild.members.ban(idInput, { reason });
        await sendModLog("Ban", user, reason);
        await msg.reply({
          content: `✅ **Ban**: ${user.tag || idInput} wurde gebannt.`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        await msg.reply({
          content: "❌ Fehler beim Ban (Rechte?).",
          flags: [MessageFlags.Ephemeral],
        });
      }
      globalBotStats.commandsRunned += 1;
    }

    if (cmd === "unban") {
      const idInput = args[0]?.replace(/[<@!>]/g, "");
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!idInput)
        return msg.reply({ content: "❌ ID angeben.", flags: [MessageFlags.Ephemeral] });

      try {
        const user = await client.users
          .fetch(idInput)
          .catch(() => ({ id: idInput, tag: idInput }));
        await msg.guild.members.unban(idInput, reason);
        await sendModLog("Unban", user, reason);
        await msg.reply({
          content: `✅ **Unban**: ${user.tag || idInput}`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (err) {
        await msg.reply({
          content: "❌ User nicht gebannt oder ID falsch.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      globalBotStats.commandsRunned += 1;
    }

    if (cmd === "warn") {
      const user = await getUser(args[0]);
      const reason = args.slice(1).join(" ") || "Kein Grund";
      if (!user)
        return msg.reply({
          content: "❌ User nicht gefunden.",
          flags: [MessageFlags.Ephemeral],
        });

      data.warns[user.id] ??= [];
      data.warns[user.id].push({ reason, by: msg.author.id, date: Date.now() });
      await setMData("moderation", data);

      await sendModLog(
        "Warnung",
        user,
        reason,
        `Warn-Stand: ${data.warns[user.id].length}`,
      );
      await msg.reply({
        content: `⚠️ **Warn**: <@${user.id}> (Gesamt: ${data.warns[user.id].length})`,
        flags: [MessageFlags.Ephemeral],
      });
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "warns") {
      const user = await getUser(args[0]);
      if (!user)
        return msg.reply({
          content: "❌ User nicht gefunden.",
          flags: [MessageFlags.Ephemeral],
        });
      const userWarns = data.warns[user.id] || [];
      if (userWarns.length === 0)
        return msg.reply({ content: "✅ Keine Warnungen.", flags: [MessageFlags.Ephemeral] });
      const embed = new EmbedBuilder()
        .setTitle(`Warnungen: ${user.username}`)
        .setColor("#ffffff")
        .setDescription(
          userWarns
            .map((w, i) => `**${i + 1}.** ${w.reason} (von <@${w.by}>)`)
            .join("\n"),
        )
        .setFooter({ text: "Kekse Clan" });
      await msg.reply({ embeds: [embed] });
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "warn_remove") {
      const user = await getUser(args[0]);
      const index = parseInt(args[1]) - 1;
      if (!user || isNaN(index) || !data.warns[user.id]?.[index])
        return msg.reply({ content: "❌ Ungültiger Index.", flags: [MessageFlags.Ephemeral] });
      const removed = data.warns[user.id].splice(index, 1);
      await setMData("moderation", data);
      await sendModLog(
        "Warn entfernt",
        user,
        `Grund war: ${removed[0].reason}`,
      );
      await msg.reply({ content: "✅ Warnung entfernt.", flags: [MessageFlags.Ephemeral] });
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
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Verification System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  client.on("guildMemberAdd", async (member) => {
    await member.roles.add(UNVERIFIED_ROLE_ID).catch(() => {});
  });
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== "verify_user")
      return;
    const member = interaction.member;
    if (!member.roles.cache.has(UNVERIFIED_ROLE_ID)) {
      return interaction.reply({
        content: "Du bist bereits verifiziert.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    try {
      await member.roles.remove(UNVERIFIED_ROLE_ID);
      await sendKekseLog(
        "User Verifiziert",
        interaction.user,
        `Der User hat den Button genutzt und die Rolle <@&${UNVERIFIED_ROLE_ID}> wurde entfernt.`,
      );

      await interaction.reply({
        content: "Erfolgreich verifiziert!",
        flags: [MessageFlags.Ephemeral],
      });
      globalBotStats.usersVerified += 1;
      globalBotStats.commandsRunned += 1;
    } catch (err) {
      await interaction.reply({
        content:
          "Fehler: Meine Rolle steht in der Liste vermutlich unter der Verifizierungs-Rolle.",
        flags: [MessageFlags.Ephemeral],
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
          .setStyle(ButtonStyle.Success),
      );
      const channel = client.channels.cache.get(VERIFY_CHANNEL_ID);
      if (channel) {
        const imageUrl = new AttachmentBuilder("./verify.png");

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
          `Das Verifizierungs-Panel wurde in <#${VERIFY_CHANNEL_ID}> neu aufgesetzt.`,
        );
        globalBotStats.commandsRunned += 1;

        await msg.delete().catch(() => {});
      }
    }
  });
}
export function initRules(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.content === "!setup_rules") {
    if (!msg.member.roles.cache.has("1454169207838216253")) {
      msg.reply(`Du hast keine Berechtigung diese Funktion zu nutzen.`);
      return;
    }
    const defaultRule = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({ name: "Regelwerk" })
      .setDescription(
        `# Allgemeine Regeln\n## Respekt und Freundlichkeit\n\n- Sei respektvoll gegenüber anderen. Beleidigungen, Mobbing oder Drohungen werden nicht toleriert.\n\n- Diskutiere sachlich und vermeide provokative Streitigkeiten.\n\n## Keine unangemessene Inhalte\n\n- Sende keine anstößigen, pornografischen, rassistischen oder gewalttätigen Inhalte.\n\n- Verbreite keine illegale Inhalte oder diskutiere über illegale Aktivitäten.\n\n## Spam, Werbung und Links\n\n- Unterlasse Spam jeglicher Art.\n\n- Werbung darf nur mit Zustimmung der Moderation und in den dafür vorgesehenen Channels gesendet werden.\n\n## Serverlücken\n\n- Die Ausnutzung von Serverlücken ist strengstens untersagt\n\n- Gefundene Lücken müssen per Ticket an die Moderation gemeldet werden.\n\n## Regelverstöße\n\n- Regelverstöße müssen an das Server-Team gemeldet werden.`
      )
    const privacyRule = new EmbedBuilder()
      .setColor("#ffffff")
      .setDescription(
        `# Privatsphäre und Sicherheit\n## Datenschutz\n\n- Teile nicht deine persönlichen Daten oder die anderer.\n\n- Respektiere die Privatsphäre anderer Mitglieder.\n\n## Keine unerwünschte Kontaktaufnahme\n\n- Sende nicht unaufgefordert Freundschaftsanfragen oder Direktnachrichten an andere.\n\n- Wünsche nach Ruhe sind zu respektieren.`
      )
    const useRule = new EmbedBuilder()
      .setColor("#ffffff")
      .setDescription(
        `# Server Nutzung und Kommunikation\n## Richtige Kanäle\n\n- Poste wenn möglich in die dafür vorgesehenen Channels.\n\n- Bots dürfen nur in den dafür vorgesehenen Channels genutzt werden.\n\n## Sprache und Ausdruck\n\n- Kommuniziere freundlich, konstruktiv und versuche das Fluchen in Maßen zu halten.\n\n- Deutsch und Englisch sind die eizig erlaubten Sprachen auf diesem Server.\n\n## Verhalten in Voice Channels\n\n- Vermeide störgeräusche.\n\n- Das machen von Audio- und Videoaufnahmen von Voice-Chats ist nur mit der ausdrücklichen Erlaubnis aller Beteiligten erlaubt.`
      )
    const channelRule = new EmbedBuilder()
      .setColor("#ffffff")
      .setDescription(
        `# Channelspezifische Regeln\n## Tickets\n\n- Der Missbrauch von Tickets, wie beispielsweise durch das öffnen ohne Grund ist nicht erlaubt.\n\n- Bot-Fehler sind per Ticket zu melden und nicht in öffentlichen Channels zu diskutieren.\n\n## Counting\n\n- Absichtliches Falschzählen (um andere zu provozieren) ist verboten.\n\n## Giveaways\n\n- Tickets für Giveaways müssen innerhalb von 2 Tagen nach Ende geöffnet werden.\n\n- Im Fall, dass der Nutzer auf einem Server gebannt ist, für den das Giveaway ist, darf am Giveaway nicht teilgenommen werden.\n\n- Mitglieder mit einer Konto-Sperre dürfen nicht an Giveaways teilnehmen, die ein aktives Konto voraussetzen.\n\n## Vorschläge\n\n- Verbesserungsvorschläge für Bot und Server sind im Vorschläge-Forum einzureichen.`
      )
    const modRule = new EmbedBuilder()
      .setColor("#ffffff")
      .setDescription(
        `# Moderation und Konsequenzen\n## Verhalten gegenüber Moderatoren\n\n- Entscheidungen der Moderation sind zu respektieren. Bei Problemen mit Entscheidungen ist ein Ticket zu erstellen.\n\n- Den Anweisungen der Moderation ist Folge zu leisten.\n\n## Discord Nutzerbedingungen\n\n- Die offiziellen Discord Richtlinien und Nutzerbedingungen müssen zu jeder Zeit eingehalten werden.\n\n- https://discord.com/terms\n\n## Konsequenzen bei Verstößen\n\n- Bei Verstößen können Verwarnungen, temporäre oder permanente Sperren verhangen werden.\n\n- Moderatoren dürfen jederzeit Inhalte entfernen, die gegen Regeln verstoßen.\n\n- Administratoren ist jederzeit das Recht vorbehalten, Nutzer auch ohne Angabe eines Grundes zu verwarnen, zu sperren oder anderweitig zu bestrafen.`
      )
    msg.channel.send({
      embeds: [defaultRule, privacyRule, useRule, channelRule, modRule]
    }).catch(() => {});
    }
  });
}
const PING_ID = "1151971830983311441";
const LEVELS = [
  { count: 5, duration: 1 * 86400000, label: "1 Tag" },
  { count: 10, duration: 2 * 86400000, label: "2 Tage" },
  { count: 25, duration: 7 * 86400000, label: "7 Tage" },
  { count: 50, duration: 31 * 86400000, label: "31 Tage" },
];
export async function violations(client) {
  const sendKekseLog = async (action, user, details, color = "#ffffff") => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Automated Security" })
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
    const level = LEVELS.find(
      (l) => entry.count >= l.count && entry.appliedLevel < l.count,
    );
    if (!level) return;
    const member = await message.guild.members
      .fetch(message.author.id)
      .catch(() => null);
    if (!member) return;
    try {
      await member.timeout(
        level.duration,
        "Automatisches System: Verstoß-Schwelle erreicht (§2a1n1)",
      );
      entry.appliedLevel = level.count;
      await setVData("violations", data);
      await sendKekseLog(
        "Automatischer Timeout",
        message.author,
        `**Grund:** Verstoß-Schwelle erreicht (${level.count} Verstöße)\n` +
          `**Dauer:** ${level.label}\n` +
          `**Status:** System-Sanktion ausgeführt.`,
      );
    } catch (err) {
      if (entry.adminNotified) return;

      const logChannel = await client.channels
        .fetch(LOG_CHANNEL_ID)
        .catch(() => null);
      if (logChannel) {
        const alertEmbed = new EmbedBuilder()
          .setColor("#ff0000")
          .setTitle("⚠️ Sanktion Fehlgeschlagen")
          .setDescription(
            `<@${PING_ID}>, die automatische Sanktion für <@${member.id}> (${member.user.tag}) schlug fehl.\n\n` +
              `**Grund:** Wahrscheinlich Administrator-Rechte oder Rollen-Hierarchie.\n` +
              `**Erreichte Schwelle:** ${level.count} Verstöße.`,
          )
          .setTimestamp();
        await logChannel.send({
          content: `<@${PING_ID}>`,
          embeds: [alertEmbed],
        });
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
    "1426271033047912582",
  ],
  suspiciousKeywords: [
    "steam",
    "discord",
    "labymod",
    "epic",
    "gift",
    "redeem",
    "nitro",
    "key",
  ],
  cooldown: 5000,
  warnDeleteAfter: 10000,
  ticketChannel: "1423413348493430905",
};
export async function warning(client) {
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Security System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };

  client.on("messageCreate", async (message) => {
    if (!isProcessable(message) || isIgnoredCategory(message)) return;
    const result = detectViolation(message.content);
    if (!result) return;
    const userId = message.author.id;
    const now = Date.now();
    const violations = (await getVData("violations")) || {};
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
      await sendKekseLog(
        "Sicherheits-Verstoß",
        message.author,
        `**Erkannt:** ${result}\n` +
          `**Kanal:** ${message.channel}\n` +
          `**Verstöße gesamt:** ${violations[userId].count}\n` +
          `**Inhalt (zensiert):** \`\`\`${originalContent.substring(0, 15)}...\`\`\``,
      );
    }
    const warnMsg = await message.channel
      .send({
        content: ` <@${userId}>, unser System hat einen **${result}** erkannt. Bitte poste keine sensiblen Daten öffentlich. Bei Missverständnissen erstelle ein Ticket in <#${CONFIG.ticketChannel}>`,
      })
      .catch(() => {});
    if (warnMsg) {
      setTimeout(
        () => warnMsg.delete().catch(() => {}),
        CONFIG.warnDeleteAfter,
      );
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
    if (word.startsWith("http") || (word.startsWith(":") && word.endsWith(":")))
      continue;
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
      const hasKeyword =
        CONFIG.suspiciousKeywords.some((k) => lower.includes(k)) ||
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
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Reminder System" })
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
          await channel.send(`⏰ <@${r.userId}>, Erinnerung: ${r.reason}`);
          continue;
        }
        const user = await client.users.fetch(r.userId).catch(() => null);
        if (user) {
          await user
            .send(`⏰ Erinnerung aus einem gelöschten Kanal: ${r.reason}`)
            .catch(() => {});
        }
      } catch (err) {
        console.log(
          `[Reminder] Fehler beim Senden einer Erinnerung: ${err.message}`,
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
      return message
        .reply(
          "❌ Nutzung: `!remind <Zeit(m/h/d)> <Grund>` (z.B. `!remind 10m Keks essen`)",
        )
        .catch(() => {});
    }
    const ms = parseTimeframe(timeStr);
    if (!ms || ms < 10000) {
      return message
        .reply(
          "❌ Ungültige Zeitangabe. Mindestens 10 Sekunden (z.B. 10s, 5m, 1h, 2d).",
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
    message
      .reply(
        `✅ Ich werde dich in **${timeStr}** an folgendes erinnern: ${reason}`,
      )
      .catch(() => {});
  });
}
const COUNTING_CHANNEL = "1423434079390535730";
let countingData = {
  currentNumber: 1,
  direction: 1,
  lastUserId: null,
  lastCountingTime: null,
  scoreboard: {},
  systemPuffer: 0,
  lastPufferGranted: 0,
};
let countingLock = Promise.resolve();
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
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;

    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Counting System" })
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
    await logTransaction(userId, reward, "plus", `Counting Meilenstein ${score}`);
    await setEcoData(userId, mileUserData);
    await channel
      .send(`🎉 <@${userId}> hat **${score} Zählungen** erreicht und erhält **${reward} Kekse** als Belohnung!`)
      .catch(() => {});
  };

  const handleCountingInner = async (msg, syncMode = false) => {
    if (!syncMode && msg.author.bot) return;
    if (msg.channel.id !== COUNTING_CHANNEL) return;
    await loadCounting();

    if (!syncMode && msg.content === "!top") {
      const sorted = Object.entries(countingData.scoreboard || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle("🏆 Top 10 Counter")
        .setDescription(
          sorted.map(([id, s], i) => `${i + 1}. <@${id}> • ${s}`).join("\n") ||
            "Keine Daten",
        )
        .setColor("#ffffff")
        .setFooter({ text: "Kekse Clan" });

      await msg.reply({ embeds: [embed] }).catch(() => {});
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
      await sendKekseLog(
        "Counting Reset (Admin)",
        msg.author,
        `Die Zahl wurde manuell auf **${newNum}** gesetzt.`,
      );
      await msg.reply(`Die nächste Zahl wurde auf **${newNum}** gesetzt.`).catch(() => {});
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
        await msg.reply("Diese Zahl ist viel zu groß für das System!").catch(() => {});
      }
      return;
    }

    const excludedUsers = ["1151971830983311441", "1274320881585356892"];

    if (countingData.currentNumber === 1 && countingData.lastUserId === null) {
      if (num === 1 || num === -1) {
        countingData.direction = num;
        countingData.currentNumber = num + countingData.direction;
        const currentHundred = Math.floor(Math.abs(countingData.currentNumber) / 100);
        if (currentHundred > countingData.lastPufferGranted) {
          countingData.lastPufferGranted = currentHundred;
          countingData.systemPuffer = 1;
          if (!syncMode) {
            await msg.channel.send(`🛡️ Puffer aufgeladen! Der nächste Fehler wird abgefangen.`).catch(() => {});
          }
        }
        countingData.lastUserId = msg.author.id;
        countingData.lastCountingTime = msg.createdTimestamp;
        countingData.lastMessageId = msg.id;
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

      const COUNTING_PUFFER = "1508050024355856494";
      const hasRolePuffer = !syncMode && member ? member.roles.cache.has(COUNTING_PUFFER) : false;

      if (countingData.systemPuffer > 0) {
        countingData.systemPuffer = 0;
        await saveCounting();
        if (!syncMode) {
          await msg.react("🛡️").catch(() => {});
          await msg.channel
            .send(`🛡️ Server-Puffer verbraucht! Weiter zählen ab **${countingData.currentNumber}**.`)
            .catch(() => {});
        }
        return;
      }

      if (hasRolePuffer) {
        try {
          await member.roles.remove(COUNTING_PUFFER);
        } catch {
          return;
        }
        countingData.currentNumber = num + countingData.direction;
        const currentHundred = Math.floor(Math.abs(countingData.currentNumber) / 100);
        if (currentHundred > countingData.lastPufferGranted) {
          countingData.lastPufferGranted = currentHundred;
          countingData.systemPuffer = 1;
          if (!syncMode) {
            await msg.channel.send(`🛡️ Puffer aufgeladen! Der nächste Fehler wird abgefangen.`).catch(() => {});
          }
        }
        countingData.lastUserId = msg.author.id;
        countingData.lastCountingTime = msg.createdTimestamp;
        if (!excludedUsers.includes(msg.author.id)) {
          countingData.scoreboard[msg.author.id] ??= 0;
          countingData.scoreboard[msg.author.id]++;
          const COUNTING_XP = "1506164829029666827";
          if (member.roles.cache.has(COUNTING_XP)) {
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
        const replyContent = reason === "Doppel-Post"
          ? `<@${msg.author.id}> nicht zwei mal nacheinander! Zurück auf den Start (1 oder -1).`
          : `<@${msg.author.id}> hat falsch gezählt! Zurück auf den Start (1 oder -1).`;
        await msg.reply(replyContent).catch(() => {});
      }
      return;
    }

    countingData.currentNumber = num + (countingData.direction || 1);
    const currentHundred = Math.floor(Math.abs(countingData.currentNumber) / 100);
    if (currentHundred > countingData.lastPufferGranted) {
      countingData.lastPufferGranted = currentHundred;
      countingData.systemPuffer = 1;
      if (!syncMode) {
        await msg.channel.send(`🛡️ Puffer aufgeladen! Der nächste Fehler wird abgefangen.`).catch(() => {});
      }
    }
    countingData.lastUserId = msg.author.id;
    countingData.lastCountingTime = msg.createdTimestamp;

    if (!excludedUsers.includes(msg.author.id)) {
      countingData.scoreboard[msg.author.id] ??= 0;
      countingData.scoreboard[msg.author.id]++;
      const COUNTING_XP = "1506164829029666827";
      if (member && member.roles.cache.has(COUNTING_XP)) {
        countingData.scoreboard[msg.author.id]++;
      }
      await checkMilestone(msg.author.id, msg.channel);
    }
    countingData.lastMessageId = msg.id;
    await saveCounting();
    const userData = (await getEcoData(msg.author.id)) || {};
    userData.balance = (userData.balance || 0) + 1;
    handleMessageXP(msg);
    await logTransaction(msg.author.id, 1, "plus", "Counting");
    await setEcoData(msg.author.id, userData);
    if (!syncMode) await msg.react("✅").catch(() => {});
  };
  const handleCounting = (msg, syncMode = false) =>
    withCountingLock(() => handleCountingInner(msg, syncMode));

  const runSync = async () => {
    console.log("Starte Counting-Synchronisation...");
    await loadCounting();
    const channel = await client.channels
      .fetch(COUNTING_CHANNEL)
      .catch((err) => {
        console.error("Fehler beim Abrufen des Counting-Kanals:", err);
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
        console.log("Keine Referenz-ID gefunden. Starte ab der aktuellsten Nachricht.");
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
        console.log(`Synchronisation abgeschlossen. ${totalRecovered} Nachrichten nachgeholt.`);
      } else {
        console.log("Alles aktuell. Keine verpassten Zahlen gefunden.");
      }
    } catch (err) {
      console.error("Fehler bei der Synchronisation:", err);
    } finally {
      registerLiveListener();
    }
  };

  const registerLiveListener = () => {
    client.on(Events.MessageCreate, async (msg) => {
      try {
        await handleCounting(msg, false);
      } catch (err) {
        console.error("Fehler im Counting-Handler:", err);
      }
    });
    console.log("Live-Zähler aktiv. System bereit!");
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
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Giveaway System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  const checkGiveaways = async () => {
    const giveaways = (await getGivData("activeGiveaways")) || {};
    const now = Date.now();
    let changed = false;
    for (const [msgId, data] of Object.entries(giveaways)) {
      const channel = await client.channels
        .fetch(data.channelId)
        .catch(() => null);
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
        const uniqueParticipants = [...new Set(data.participants || [])].length;
        const embed = new EmbedBuilder()
          .setTitle(`🎁 Giveaway: ${data.price}`)
          .setDescription(
            `${data.messageText}\n\nEndet am: <t:${Math.floor(data.endTime / 1000)}:R> (<t:${Math.floor(data.endTime / 1000)}:f>)\nTeilnehmer: **${uniqueParticipants}**\nGewinner: **${data.winnerCount}**`,
          )
          .setColor(EMBED_COLOR);

        await msg.edit({ embeds: [embed] }).catch(() => {});
      }
    }
    if (changed) await setGivData("activeGiveaways", giveaways);
  };
  setInterval(checkGiveaways, 10000);
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!giveaway") || msg.author.bot) return;
    if (!msg.member.roles.cache.has(TEAM_ROLE_ID))
      return msg.reply("❌ Keine Rechte.");
    const args =
      msg.content
        .slice(1)
        .match(/(?:[^\s"]+|"[^"]*")+/g)
        ?.map((a) => a.replace(/"/g, "")) || [];
    args.shift();
    if (args.length < 3)
      return msg.reply(
        'Syntax: `!giveaway #channel 1h "Preis" "Text" winners=2`',
      );
    const channel =
      msg.mentions.channels.first() || msg.guild.channels.cache.get(args[0]);
    if (!channel) return msg.reply("❌ Kanal nicht gefunden.");
    const durationMs = parseDuration(args[1]);
    if (durationMs <= 0)
      return msg.reply("❌ Zeitformat ungültig (z.B. 1h, 30m, 1d).");
    const price = args[2];
    const messageText = args[3] || "Viel Glück 🍀";
    let winnerCount = 1;
    args.forEach((arg) => {
      if (arg.startsWith("winners="))
        winnerCount = parseInt(arg.split("=")[1]) || 1;
    });
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    const embed = new EmbedBuilder()
      .setTitle(`🎁 Giveaway: ${price}`)
      .setDescription(
        `${messageText}\n\nEndet am: <t:${Math.floor(endTime / 1000)}:R> (<t:${Math.floor(endTime / 1000)}:f>)\nTeilnehmer: **0**\nGewinner: **${winnerCount}**`,
      )
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
    giveaways[giveawayMsg.id] = {
      channelId: channel.id,
      startTime,
      endTime,
      price,
      messageText,
      winnerCount,
      hostId: msg.author.id,
      participants: [],
    };
    await setGivData("activeGiveaways", giveaways);
    await sendKekseLog(
      "Giveaway gestartet",
      msg.author,
      `**Preis:** ${price}\n**Kanal:** ${channel}\n**Dauer:** ${args[1]}\n**Gewinner:** ${winnerCount}`,
    );
    globalBotStats.commandsRunned += 1;
    globalBotStats.giveawaysCreated += 1;
    await msg.delete().catch(() => {});
  });
  client.on("interactionCreate", async (interaction) => {
       if (interaction.isButton() && interaction.customId === "join_giveaway") {
    const giveaways = await getGivData("activeGiveaways") || {};
    const data = giveaways[interaction.message.id];
    if (!data) {
      return interaction.reply({ content: " Dieses Giveaway ist nicht mehr aktiv.", flags: [MessageFlags.Ephemeral] });
    }
    if (data.participants.includes(interaction.user.id)) {
      return interaction.reply({ content: " Du nimmst bereits an diesem Giveaway teil!", flags: [MessageFlags.Ephemeral] });
    }

    const networks = await getSaData("alt_networks") || {};
    const linkedAccounts = networks[interaction.user.id] || [];
    
    if (linkedAccounts.length > 0) {
      const hasAltInGiveaway = linkedAccounts.some(altId => data.participants.includes(altId));
      if (hasAltInGiveaway) {
        return interaction.reply({ content: "❌ Du kannst nicht teilnehmen, da bereits ein registrierter Zweitaccount von dir im Giveaway ist!", flags: [MessageFlags.Ephemeral] });
      }
    }

    const bonusRoles = ["1464202435638722621", "1506164984202264656"];
    const activeBonusCount = interaction.member.roles.cache.filter(role => bonusRoles.includes(role.id)).size;
    const totalTickets = activeBonusCount === 2 ? 4 : (activeBonusCount === 1 ? 2 : 1);
    for (let i = 0; i < totalTickets; i++) {
      data.participants.push(interaction.user.id);
    }
    await setGivData("activeGiveaways", giveaways);
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds)
      .setDescription(`${data.messageText}\n\nEndet am: <t:${Math.floor(data.endTime / 1000)}:R> (<t:${Math.floor(data.endTime / 1000)}:f>)\nTeilnehmer: **${data.participants.length}**\nGewinner: **${data.winnerCount}**`);
    await interaction.update({ embeds: [updatedEmbed] }).catch(() => {});
    let replyText = " Du hast das Giveaway erfolgreich betreten!";
    addXP(interaction.user.id, 10, client);
    if (totalTickets === 2) {
      replyText += " (Inklusive **doppelter Chance** durch deine Rolle!)";
    } else if (totalTickets === 4) {
      replyText += " (Inklusive **4-facher Chance**, da du beide Rollen besitzt!)";
    }
    return interaction.followUp({ content: replyText, flags: [MessageFlags.Ephemeral] }).catch(() => {});
  }
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
  const winnerMentions = winners.length
    ? winners.map((id) => `<@${id}>`).join(", ")
    : "Niemand";
  const endEmbed = EmbedBuilder.from(msg.embeds[0])
    .setTitle(`🎊 Giveaway beendet: ${data.price}`)
    .setDescription(
      `${data.messageText}\n\nBeendet am: <t:${Math.floor(data.endTime / 1000)}:f>\nTeilnehmer: **${participants.length}**\nGewinner: ${winnerMentions}`,
    )
    .setColor(0x2f3136);
  await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
  if (winners.length > 0) {
    await msg.channel.send(
      `🎉 Glückwunsch ${winnerMentions}! Du hast **${data.price}** gewonnen!\nMelde dich bitte zeitnah im Support.`,
    );
  }
  const BONUS_ROLE_REMOVE = "1506164984202264656";
const uniqueParticipants = [...new Set(participants)];
for (const userId of uniqueParticipants) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && member.roles.cache.has(BONUS_ROLE_REMOVE)) {
    await member.roles.remove(BONUS_ROLE_REMOVE).catch(() => {});
  }
}
  const host = await client.users.fetch(data.hostId).catch(() => client.user);
  await logFunc(
    "Giveaway beendet",
    host,
    `**Preis:** ${data.price}\n**Teilnehmer:** ${participants.length}\n**Gewinner:** ${winnerMentions}`,
  );
  const reportChannel = await client.channels
    .fetch(REPORT_CHANNEL_ID)
    .catch(() => null);
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
      content: `📊 **Giveaway Report**\n**Preis:** ${data.price}\n**ID:** ${msg.id}`,
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
export function registerMessageCommands(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;
    const logChannelId = "1423413348220796991";
    if (
      !msg.member.roles.cache.has(TEAM_ROLE_ID) &&
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
      const logChannel = client.channels.cache.get(logChannelId);
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
          .setFooter({ text: "Kekse Clan | Command Logs" })
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
        console.log(`${user.username} hat die "send"-Funktion genutzt`)
      }
    }

    if (cmd === "changelog") {
      await deleteCmd();
      const changelogChannel = msg.guild.channels.cache.get(
        "1464993818968588379",
      );
      if (!changelogChannel || args.length === 0) return;
      const date = new Date().toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const updateList = args.map((item) => `- ${item}`).join("\n");
      const messageFormat = `<@&1464994942345547857>\n**:wrench: Änderungen (${date})**\n${updateList}`;
      await changelogChannel.send(messageFormat);
      await sendKekseLog("changelog", changelogChannel.toString(), updateList);
      globalBotStats.commandsRunned += 1;
      console.log(`${msg.author} hat die "changelog"-Funktion genutzt`)
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
        globalBotStats.commandsRunned += 1;
        console.log(`${user.username} hat die "embed"-Funktion genutzt`)
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
        console.log(`${user.username} hat die "dm"-Funktion genutzt`)
      }
    }

    if (cmd === "news") {
      await deleteCmd();
      const channel = msg.mentions.channels.first();
      if (!channel) return;
      let rawText = msg.content.replace(/^!news\s+<#[0-9]+>\s?/, "").trim();
      if (!rawText) return;
      const emojiMap = {
        regles: "1467246063122649180",
        mail: "1467246078226334040",
        like: "1467246068235501733",
        management: "1467246065437642999",
        moins: "1467246060689690849",
        info: "1467246059561685238",
        web: "1467246058341142833",
        dislike: "1467246057070268681",
        logs: "1467246054910070938",
        check: "1467246053911957759",
        staff: "1467246044772569218",
        lien: "1467246043182924040",
        identifiant: "1467246041668780227",
        cybersecurite: "1467246039731015794",
        statistiques: "1467246038497886311",
        administrateur: "1467246035922321478",
        croix: "1467246034580410429",
        certifier: "1467246033389092904",
        supprimer: "1467246032181006499",
        profil: "1467246030998343733",
        moderateur: "1467246028758712575",
        crayon: "1467246026846109821",
        stats: "1467246025411658012",
        ouvert: "1467246023872352358",
        discordoff: "1467246022668583147",
        warningicon: "1467246020445339875",
        "2nd": "1467246019556282533",
        discordon: "1467246018218430696",
        "1st": "1467246016926453810",
        help: "1467246015332618372",
        timeout: "1467246013487255705",
        unstableping: "1467246011578712186",
        yinfo: "1467246010349785119",
        "3rd": "1467246008734847138",
        failed: "1467246005870264352",
        mute: "1467246003890425928",
        verified: "1467246002628202507",
        cross: "1467246000258420767",
        interruption: "1467245998043824128",
        checkmark: "1467245996584210554",
        moderatorprogramsalumnia: "1467245995510337659",
        pingeveryone: "1453800508329558218",
        ping: "1453799622303813714",
        pepecookie: "1453796363442585660",
      };
      const formattedText = rawText.replace(
        /:([a-zA-Z0-9_]+):/g,
        (match, name) => {
          return emojiMap[name] ? `<:emoji:${emojiMap[name]}>` : match;
        },
      );
      await channel.send(formattedText);
      await sendKekseLog("news", channel.toString(), rawText);
      globalBotStats.commandsRunned += 1;
    }

    if (cmd === "reply") {
      await deleteCmd();
      const channelMention = msg.mentions.channels.first() || msg.channel;
      const msgId = args.find((a) => /^\d{17,20}$/.test(a));
      let text = args
        .filter((a) => !a.includes(msgId) && !a.startsWith("<#"))
        .join(" ");
      if (!msgId || !text) return;
      globalBotStats.commandsRunned += 1;
      console.log(`${user.username} hat die "news"-Funktion genutzt`)
      try {
        const targetMsg = await channelMention.messages.fetch(msgId);
        targetMsg.system
          ? await channelMention.send(text)
          : await targetMsg.reply(text);
        await sendKekseLog("reply", `Nachricht ID ${msgId}`, text);
      } catch (err) {
        await msg.channel
          .send("❌ Nachricht nicht gefunden.")
          .then((m) => setTimeout(() => m.delete(), 3000));
      }
    }
  });
}
export function initPing(client) {
  client.on("messageCreate", async (msg) => {
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
    await sentMsg
      .edit({
        content: `🏓 **Pong!**\n- API-Latenz: \`${roundtrip}ms\`\n- WebSocket: \`${wsPing}ms\``,
      })
      .catch(() => {});
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
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
        .setFooter({ text: "Kekse Clan | System Check" })
        .setTimestamp();

      await logChannel.send({ embeds: [kekseLog] });
      console.log(`${user.username} hat die "ping"-Funktion genutzt`)
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
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Poll System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  const createPollText = (q, d, opts, end, count, id, author) => {
    return (
      `## ${q}\n${d}\n\n` +
      opts.map((o) => `${o.emoji} ${o.text}`).join("\n") +
      `\n\n` +
      `<:info:1467246059561685238> Endet am: <t:${Math.floor(end / 1000)}:R>\n` +
      `<:profil:1467246030998343733> Erstellt von: ${author}\n` +
      `<:statistiques:1467246038497886311> Teilnehmer: **${count}**\n` +
      `<:identifiant:1467246041668780227> ID: \`${id}\``
    );
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
          .setStyle(ButtonStyle.Secondary),
      );
    });
    if (currentRow.components.length > 0) rows.push(currentRow);
    return rows;
  };
  const closePoll = async (poll, polls, closer) => {
    poll.closed = true;
    const channel = await client.channels
      .fetch(poll.channelId)
      .catch(() => null);
    const pollMsg = await channel?.messages
      .fetch(poll.messageId)
      .catch(() => null);
    if (pollMsg) {
      await pollMsg.edit({ components: [] }).catch(() => {});
    }
    const total = poll.voters.length;
    let resultsText = `## <:statistiques:1467246038497886311> Ergebnisse: ${poll.question}\n\n`;
    if (total === 0) {
      resultsText += "Keine Teilnehmer.";
    } else {
      const winnerVotes = Math.max(...poll.options.map((o) => o.votes));
      poll.options.forEach((o) => {
        const perc = Math.round((o.votes / total) * 100);
        resultsText += `${o.emoji} **${o.text}**\n**${o.votes} Stimmen** (${perc}%)${o.votes === winnerVotes && total > 0 ? " <:checkmark:1467245996584210554>" : ""}\n\n`;
      });
    }
    if (channel) await channel.send(resultsText).catch(() => {});
    const logChannel = client.channels.cache.get("1423413348220796991");
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor("#ffffff")
        .setAuthor({
          name: closer.username,
          iconURL: closer.displayAvatarURL(),
        })
        .setDescription(
          `**Aktion:** \`Umfrage beendet\`\n**Frage:** ${poll.question}\n**Teilnehmer:** ${total}\n**ID:** \`${poll.id}\``,
        )
        .setFooter({ text: "Kekse Clan | Poll System" })
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
    }
    const updatedPolls = polls.filter((p) => p.id !== poll.id);
    await setPollData("polls_data", updatedPolls);
  };
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || !msg.content.startsWith("!")) return;
    const args =
      msg.content
        .slice(1)
        .match(/(?:[^\s,"]+|"[^"]*")+/g)
        ?.map((a) => a.replace(/"/g, "").trim()) || [];
    const cmd = args.shift()?.toLowerCase();
    if (cmd === "poll") {
      if (!msg.member.roles.cache.has(TEAM_ROLE_ID))
        return msg.channel.send("❌ Du hast keine Berechtigung.");
      if (args.length < 4)
        return msg.reply('❌ Nutzung: `!poll "Frage" "Minuten" ...`.');
      const [question, timeStr, description, ...options] = args;
      const time = parseInt(timeStr);
      if (isNaN(time) || options.length < 2 || options.length > 10)
        return msg.reply("❌ Fehlerhafte Parameter.");
      const pollId = msg.id;
      const emojis = [
        "1️⃣",
        "2️⃣",
        "3️⃣",
        "4️⃣",
        "5️⃣",
        "6️⃣",
        "7️⃣",
        "8️⃣",
        "9️⃣",
        "🔟",
      ];
      const pollOptions = options.map((opt, i) => ({
        text: opt,
        emoji: emojis[i],
        votes: 0,
      }));
      const endTime = Date.now() + time * 60000;
      const pollContent = createPollText(
        question,
        description,
        pollOptions,
        endTime,
        0,
        pollId,
        msg.author,
      );
      const components = createPollButtons(pollId, pollOptions);
      const pollMsg = await msg.channel.send({
        content: `<@&1424028924387786762>\n${pollContent}`,
        components: components,
      });
      const polls = (await getPollData("polls_data")) || [];
      polls.push({
        id: pollId,
        messageId: pollMsg.id,
        channelId: msg.channel.id,
        question,
        description,
        options: pollOptions,
        endTime,
        creatorId: msg.author.id,
        voters: [],
        closed: false,
      });
      await setPollData("polls_data", polls);
      await sendKekseLog(
        "Umfrage gestartet",
        msg.author,
        `**Frage:** ${question}\n**Dauer:** ${time} Min.\n**ID:** \`${pollId}\``,
      );
      globalBotStats.pollsCreated += 1;
      console.log(`${user.username} hat einen Poll erstellt`);
    }
    if (cmd === "closepoll") {
      if (!msg.member.roles.cache.has(TEAM_ROLE_ID)) return;
      const pollId = args[0];
      const polls = (await getPollData("polls_data")) || [];
      const poll = polls.find((p) => p.id === pollId && !p.closed);
      if (!poll) return msg.reply("❌ Poll nicht gefunden.");
      await closePoll(poll, polls, msg.author);
      globalBotStats.commandsRunned += 1;
      console.log(`${user.username} hat einen Poll geschlossen`);
    }
    if (cmd === "listpolls") {
      const polls = (await getPollData("polls_data")) || [];
      const activePolls = polls.filter((p) => !p.closed);
      if (activePolls.length === 0) return msg.reply("Keine aktiven Polls.");

      const list = activePolls
        .map((p) => `ID: \`${p.id}\` | ${p.question}`)
        .join("\n");
      msg.reply(`**Aktive Polls:**\n${list}`);
      globalBotStats.commandsRunned += 1;
      console.log(`${user.username} hat die polllist-Funktion verwendet`);
    }
  });
  client.on("interactionCreate", async (interaction) => {
    if (
      !interaction.isButton() ||
      !interaction.customId.startsWith("poll_vote_")
    )
      return;
    const parts = interaction.customId.split("_");
    const pollId = parts[2];
    const optionIndex = parseInt(parts[3]);
    let polls = (await getPollData("polls_data")) || [];
    const poll = polls.find((p) => p.id === pollId && !p.closed);
    if (!poll) {
      return interaction.reply({
        content:
          "❌ Diese Umfrage existiert nicht mehr oder ist bereits beendet.",
        flags: [MessageFlags.Ephemeral],
      });
    }
    if (poll.voters.includes(interaction.user.id)) {
      return interaction.reply({
        content: "❌ Du hast bereits für diese Umfrage abgestimmt!",
        flags: [MessageFlags.Ephemeral],
      });
    }
    poll.voters.push(interaction.user.id);
    poll.options[optionIndex].votes++;
    await setPollData("polls_data", polls);
    const creator = await client.users
      .fetch(poll.creatorId)
      .catch(() => ({ toString: () => "Unknown" }));
    await interaction.message
      .edit({
        content: createPollText(
          poll.question,
          poll.description,
          poll.options,
          poll.endTime,
          poll.voters.length,
          poll.id,
          creator,
        ),
      })
      .catch(() => {});
    await interaction.reply({
      content: "✅ Deine Stimme wurde gezählt!",
      flags: [MessageFlags.Ephemeral],
    });
  });
  setInterval(async () => {
    const polls = (await getPollData("polls_data")) || [];
    const now = Date.now();
    for (const poll of polls) {
      if (!poll.closed && poll.endTime <= now) {
        const creator = await client.users
          .fetch(poll.creatorId)
          .catch(() => client.user);
        await closePoll(poll, polls, creator);
      }
    }
  }, 30000);
}
export function initReactions(client) {
  const userContext = new Map();

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

    const content = message.content.toLowerCase().trim();

    if (message.content.includes("🍪")) {
      try {
        console.log(`[REACTION] Keks-Reaktion für ${message.author.username}`);
        await message.channel.send("<:pepecookie:1453796363442585660>");
        console.log(`${message.author.username} hat eine Reaktion ausgelöst`)
      } catch {}
    }

    if (message.mentions.everyone) {
      try {
        console.log(
          `[REACTION] Everyone-Ping-Reaktion für ${message.author.username}`,
        );
        await message.channel.send("<a:pingeveryone:1453800508329558218>");
        console.log(`${message.author.username} hat eine Reaktion ausgelöst`)
      } catch {}
    } else if (message.mentions.has(client.user.id)) {
      try {
        console.log(
          `[REACTION] Bot-Ping-Reaktion für ${message.author.username}`,
        );
        await message.channel.send("<:ping:1453799622303813714>");
        console.log(`${message.author.username} hat eine Reaktion ausgelöst`)
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
  "ticket schließen",
  "ticket löschen",
  "archiv wird erstellt",
  "rollen werden erkannt",
  "channel verschieben",
  "kategorie kann gesetzt werden",
  "bot hat admin rechte",
  "bot kann nachricht pinnen",
  "permission",
  "bot",
  "discord",
  "role",
  "rolle",
];

const SUPPORT_CATEGORY = "1423413348065611953";
const ADMIN_CATEGORY = "1426271033047912582";
const ADMIN_ROLE = "1423427747103113307";

export function initTicketCategory(client) {
  const askedUsers = new Set();

  client.on("messageCreate", async (msg) => {
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
      ? `⚠️ <@${msg.author.id}>, Schlüsselwort "**${foundTrigger}**" erkannt. Benötigt dieses Ticket einen **Admin**?`
      : `⚠️ <@${msg.author.id}>, keyword "**${foundTrigger}**" detected. Does this ticket require an **Admin**?`;

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
          content: isGerman ? "⏳ Verschiebe..." : "⏳ Moving...",
          components: [],
        });
        await moveChannelToAdmin(channel, isGerman);
        globalBotStats.commandsRunned += 1;
      } else {
        await i.update({
          content: isGerman
            ? "👍 Support wird sich weiterhin darum kümmern"
            : "👍 Support will handle it.",
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
    await channel.setParent(ADMIN_CATEGORY);
    await channel.send(
      isGerman
        ? `✅ Dieses Ticket wurde zu den **Admins** verschoben.\n<@&${ADMIN_ROLE}>`
        : `✅ This ticket has been moved to the **Admins**.\n<@&${ADMIN_ROLE}>`,
    );
  } catch (err) {
    console.error("Fehler beim Verschieben:", err);
    await channel.send("❌ Fehler beim Verschieben des Channels.");
  }
}
const ARCHIVE_CATEGORY_ID = "1465452886657077593";
const ADMIN_ROLE_ID = "1423427747103113307";
const CATEGORY_EMOJI = {
  Support: "⚙️",
  Abholung: "🎉",
  Bewerbung: "✉️",
};
const CATEGORY_CHANNELS = {
  Support: "1423413348065611953",
  Abholung: "1423413348065611953",
  Bewerbung: "1434277752982474945",
  Admin: "1426271033047912582"
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
> - Name & Ingame-Name
> - Alter
> - Auf welchem Minecraft Server bist du aktiv? Zur Auswahl stehen derzeit: \`Minevale.de\` \`CraftValley.de\`
> - Weshalb du in den Clan willst
> - In welchen Clans warst du bereits
> - Warum du in unseren Clan aufgenommen werden solltest
> - Deine Stärken
> - Spielzeit: Minecraft & Minecraft Server
> **Weitere Informationen:**
> - Schreibe in ganzen Sätzen
> - Keine KI verwenden
> - Achte auf eine säuberliche, äußere Form deiner Bewerbung
> **Voraussetzungen beachten:**
> - Du hast noch nie gescammt
> - Du bist aktiv auf dem Minecraft Server und diesem Discord-Server
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

function buildTicketInfoEmbeds({ idString, category, user, created, hasAccount, ingameName, anliegen }) {
  const embeds = [];
  embeds.push(
    new EmbedBuilder()
      .setTitle(" Ticket-Informationen")
      .setColor(0xffffff)
      .setDescription([
        `> **ID:** \`${idString}\``,
        `> **Discord-Username:** ${user.username}`,
        `> **Kategorie:** ${category}`,
        `> **Erstellt:** <t:${Math.floor(created / 1000)}:F>`
      ].join("\n"))
  );
  embeds.push(
    new EmbedBuilder()
      .setTitle(" Nutzer-Informationen")
      .setColor(0xffffff)
      .setDescription([
        `> **Anzeigename:** **${user.displayName || user.username}**`,
        `> **Username:** ${user.username}`,
        `> **Account vorhanden:** ${hasAccount ? " Ja" : " Nein"}`,
        `> **Minecraft Ingame Name:** ${ingameName || "–"}`
      ].join("\n"))
  );
  if (anliegen && Object.entries(anliegen).length > 0) {
    const anliegenLines = Object.entries(anliegen).map(([label, value]) => `> **${label}:** ${value}`);
    embeds.push(
      new EmbedBuilder()
        .setTitle(" Weiteres")
        .setColor(0xffffff)
        .setDescription(anliegenLines.join("\n"))
    );
  }
  return embeds;
}

export async function initTickets(client) {
  await loadTickets();
  const sendKekseLog = async (action, user, details) => {
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Ticket System" })
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  };
  function hasEconomyAccount(target) {
    if (!target) return false;
    const member = target.member || target;
    if (!member || !member.roles || !member.roles.cache) return false;
    return member.roles.cache.has("1506732560837771284");
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
        (t) => typeof t === "object" && t.channelId === channel.id
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
          channel: channel,
        },
        setTickData
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
          { id: TEAM_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ],
      });

      const member = guild.members.cache.get(user.id);
      const hasAccount = hasEconomyAccount(member);

      const ingameName = hasAccount ? await getStoredIngameName(user.id) : extra.ingame;
      
      const embeds = buildTicketInfoEmbeds({
        idString,
        category,
        user,
        created: Date.now(),
        hasAccount,
        ingameName,
        anliegen: extra.anliegen || {}
      });

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close_${idString}`)
          .setLabel("Ticket schließen")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({ content: `${user} ||<@&1457906448234319922>||`, embeds, components: [closeRow] });

      if (extra.needsTemplate) {
        await channel.send({ content: BEWERBUNG_VORLAGE_TEXT });
      }

      stored.tickets[idString] = {
        idString,
        channelId: channel.id,
        userId: user.id,
        username: user.username,
        category: category
      };

      await setTickData("tickets", stored);
      await sendKekseLog("Ticket Erstellt", user, `Kategorie: \`${category}\`\nKanal: ${channel}`);
      
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
        if (!interaction.member.roles.cache.has(TEAM_ROLE_ID)) {
        return interaction.reply({
          content: "❌ Keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      await interaction.reply({
        content: "⏳ Ticket-Schließung initiiert...",
        flags: [MessageFlags.Ephemeral],
      });
      await closeTicket(currentChannel, user);
      console.log(`${user.username} hat ${currentChannel} geschlossen`)
      globalBotStats.commandsRunned += 1;
      }

      if (interaction.customId.startsWith("t_")) {
        const category = interaction.customId.split("_")[1];

        if (await isBlocked(interaction.user.id) && !interaction.member.roles.cache.has(TEAM_ROLE_ID)) {
          return interaction.reply({ content: "Du bist gesperrt.", ephemeral: true });
        }
        const verifiedOnlyIds = ["t_Bewerbung", "t_Abholung"];
        if (verifiedOnlyIds.includes(interaction.customId) && interaction.member.roles.cache.has("1439337577508245837")) {
          return interaction.reply({
            content: "Du musst dich verifizieren bevor du etwas abholen oder dich bewerben kannst: <#1439337595090898955>",
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
          return interaction.reply({ content: "Unbekannte Kategorie.", ephemeral: true });
        }
      }
    }
    if (interaction.isModalSubmit()) { 
  if (interaction.customId.startsWith("tm_")) { 
    await interaction.deferReply({ ephemeral: true });
    const parts = interaction.customId.split("_");
    const category = parts[1];
    const extra = { anliegen: {} };
    if (category === "Support") {
      extra.anliegen["Kurze Beschreibung"] = interaction.fields.getTextInputValue("kurz");
      extra.anliegen["Ausführliche Beschreibung"] = interaction.fields.getTextInputValue("lang");
    } else if (category === "Abholung") {
      if (parts[2] === "noacc") {
        extra.ingame = interaction.fields.getTextInputValue("ingame");
      }
      extra.anliegen["Gewinn"] = interaction.fields.getTextInputValue("gewonnen");
    } else if (category === "Bewerbung") {
      extra.anliegen["Name"] = interaction.fields.getTextInputValue("name");
      if (parts[2] === "noacc") {
        extra.ingame = interaction.fields.getTextInputValue("ingame");
      }
      const vorlageInput = interaction.fields.getTextInputValue("vorlage");
      extra.needsTemplate = parseYesNo(vorlageInput);
    }
    const channel = await createTicket(category, interaction.user, interaction.guild, extra);
    if (channel) {
      await interaction.editReply({ content: `Ein Ticket wurde erfolgreich erstellt: ${channel}` });
    } else {
      await interaction.editReply({ content: "Fehler beim Erstellen des Tickets." });
    }
  }
}
  });
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!") || msg.author.bot) return;
    const args = msg.content.slice(1).split(/\s+/);
    const cmd = args.shift().toLowerCase();
    if (cmd === "ticket_panel" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
       const embed = new EmbedBuilder()
       .setTitle("Willkommen im Support")
       .setDescription(`Wähle eins der Themen um ein Ticket zu erstellen. Ein Team-Mitglied wird sich schnellstmöglich um dein Anliegen kümmern.\n\n⚙️ **Support** - Allgemeine Support-Anliegen\n🎉 **Abholung** - Abholung von Giveaways und Events\n✉️ **Bewerbung** - Clan-Bewerbungen`)
       .setColor("#ffffff");

       const row = new ActionRowBuilder().addComponents(
       new ButtonBuilder().setCustomId("t_Support").setLabel("⚙️ Support").setStyle(ButtonStyle.Secondary),
       new ButtonBuilder().setCustomId("t_Abholung").setLabel("🎉 Abholung").setStyle(ButtonStyle.Secondary),
       new ButtonBuilder().setCustomId("t_Bewerbung").setLabel("✉️ Bewerbung").setStyle(ButtonStyle.Secondary)
       );

       await msg.channel.send({ embeds: [embed], components: [row] });
       await msg.delete().catch(() => {});
       globalBotStats.commandsRunned += 1;
    }

    if (cmd === "close") {
      const currentChannel = msg.channel;
      const user = msg.author;
      if (!msg.member.roles.cache.has(TEAM_ROLE_ID)) {
        return msg.reply({
          content: "❌ Keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      await msg.reply({
        content: "⏳ Ticket-Schließung initiiert...",
        flags: [MessageFlags.Ephemeral],
      });
      await closeTicket(currentChannel, user);
      console.log(`${user.username} hat ${currentChannel} geschlossen`)
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "delete" && msg.member.roles.cache.has(ADMIN_ROLE_ID)) {
      await msg.reply("Kanal wird gelöscht...");
      setTimeout(() => msg.channel.delete().catch(() => {}), 3000);
      globalBotStats.commandsRunned += 1;
    }
    if (cmd === "block" && msg.member.roles.cache.has(TEAM_ROLE_ID)) {
      const target = msg.mentions.users.first() || { id: args[0], username: "Unbekannt" };
      const days = parseInt(args[1]) || 7;
      if (!target.id) return msg.reply("ID fehlt.");
      await blockUser(target.id, target.username, days * 24 * 60 * 60 * 1000);
      msg.reply(`<@${target.id}> für ${days} Tage gesperrt.`);
      globalBotStats.commandsRunned += 1;
    }
  });
};
const CREATOR_CHANNEL_ID = "1423413348220796991";
const CATEGORY_ID = "1423413348493430902";
const TRIGGER_CHANNEL_ID = "1423438527319900180";
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
    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    const logEmbed = new EmbedBuilder()
      .setColor("#ffffff")
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 512 }),
      })
      .setDescription(`**Aktion:** \`${action}\`\n${details}`)
      .setFooter({ text: "Kekse Clan | Voice System" })
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
            {
              id: guild.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
              ],
            },
            {
              id: TEAM_ROLE_ID,
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
        globalBotStats.voiceChannelCreated += 1;
      } catch (err) {
        console.error("[VOICE] Fehler beim Erstellen:", err);
      } finally {
        setTimeout(() => activeCreations.delete(member.id), 5000);
      }
    }

    const oldChannel = oldState.channel;
    if (
      oldChannel &&
      oldChannel.parentId === CATEGORY_ID &&
      oldChannel.id !== TRIGGER_CHANNEL_ID
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
            `**Kanal:** \`${channelName}\` (automatisch gelöscht, da leer)`,
          );
          globalBotStats.voiceChannelDeleted += 1;
        }
      } catch (err) {}
    }
  });
}
export async function initScammProtection(client) {
  const CONFIG = {
    logChannel: "LOG_CHANNEL_ID",
    modRole: "MOD_ROLE_ID",
    minScore: 70,
    autoTimeout: 10 * 60 * 1000,
    confirmTimeout: 7 * 24 * 60 * 60 * 1000,
  };

  function download(url, path) {
    return new Promise((resolve) => {
      https.get(url, (res) => {
        const file = fs.createWriteStream(path);

        res.pipe(file);

        file.on("finish", () => {
          file.close(resolve);
        });
      });
    });
  }

  function createHash(path) {
    return new Promise((resolve) => {
      imageHash(path, 16, true, (err, hash) => {
        resolve(hash || "");
      });
    });
  }

  function hamming(a, b) {
    let dist = 0;

    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) dist++;
    }

    return dist;
  }

  async function sanitizeImage(input, output) {
    await sharp(input).blur(2).resize(900).png().toFile(output);
  }

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild) return;
      if (message.author.bot) return;

      const images = [...message.attachments.values()].filter((a) =>
        a.contentType?.startsWith("image/"),
      );

      if (images.length !== 3) return;

      const knownHashes = (await getScammData("hashes")) || [];

      let score = 20;
      const imageData = [];
      const safeFiles = [];

      for (const img of images) {
        const tempPath = `temp_${Date.now()}_${Math.random()}.png`;
        const safePath = `safe_${Date.now()}_${Math.random()}.png`;

        await download(img.url, tempPath);

        const hash = await createHash(tempPath);

        for (const known of knownHashes) {
          const dist = hamming(hash, known.hash);

          if (dist <= 5) {
            score += 50;
          }
        }

        await sanitizeImage(tempPath, safePath);

        imageData.push({
          hash,
        });

        safeFiles.push(new AttachmentBuilder(safePath));

        await fs.promises.unlink(tempPath).catch(() => {});
      }

      if (images.length === 3) {
        score += 20;
      }

      if (score < CONFIG.minScore) {
        for (const file of safeFiles) {
          await fs.promises.unlink(file.attachment).catch(() => {});
        }

        return;
      }

      await message.delete().catch(() => {});

      const member = await message.guild.members
        .fetch(message.author.id)
        .catch(() => null);

      if (member) {
        await member
          .timeout(CONFIG.autoTimeout, "Automatische Scam Erkennung")
          .catch(() => {});
      }

      const scamData = (await getScammData("events")) || {};

      const caseId = Date.now().toString();

      scamData[caseId] = {
        userId: message.author.id,
        guildId: message.guild.id,
        score,
        status: "pending",
        images: imageData,
        createdAt: Date.now(),
      };

      await setScammData("events", scamData);

      const logChannel = client.channels.cache.get(CONFIG.logChannel);

      if (!logChannel) return;

      const embed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("Scam Verdacht")
        .setDescription(
          `User: <@${message.author.id}>\n` +
            `Score: ${score}\n` +
            `3 PNG Muster erkannt`,
        )
        .setFooter({
          text: `Case ID: ${caseId}`,
        })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`scam_confirm_${caseId}`)
          .setLabel("Bestätigen")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`scam_reject_${caseId}`)
          .setLabel("Ablehnen")
          .setStyle(ButtonStyle.Success),
      );

      await logChannel.send({
        content: `<@&${CONFIG.modRole}>`,
        embeds: [embed],
        files: safeFiles,
        components: [row],
      });
    } catch (err) {
      console.error("[SCAM]", err);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (!interaction.isButton()) return;

      if (
        !interaction.customId.startsWith("scam_confirm_") &&
        !interaction.customId.startsWith("scam_reject_")
      )
        return;

      const confirm = interaction.customId.startsWith("scam_confirm_");

      const caseId = interaction.customId.split("_")[2];

      const events = (await getScammData("events")) || {};

      const data = events[caseId];

      if (!data) {
        return interaction.reply({
          content: "Fall nicht gefunden.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const member = await interaction.guild.members
        .fetch(data.userId)
        .catch(() => null);

      if (confirm) {
        if (member) {
          await member
            .timeout(CONFIG.confirmTimeout, "Bestätigter Scam")
            .catch(() => {});
        }

        let hashes = (await getScammData("hashes")) || [];

        for (const img of data.images) {
          const exists = hashes.find((h) => h.hash === img.hash);

          if (!exists) {
            hashes.push({
              hash: img.hash,
              confirmed: 1,
              rejected: 0,
              createdAt: Date.now(),
            });
          } else {
            exists.confirmed++;
          }
        }

        await setScammData("hashes", hashes);

        data.status = "confirmed";
        data.confirmedBy = interaction.user.id;

        await setScammData("events", events);

        await interaction.reply({
          content: "Scam bestätigt.",
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        if (member) {
          await member.timeout(null).catch(() => {});
        }

        let hashes = (await getScammData("hashes")) || [];

        for (const img of data.images) {
          const exists = hashes.find((h) => h.hash === img.hash);

          if (!exists) {
            hashes.push({
              hash: img.hash,
              confirmed: 0,
              rejected: 1,
              createdAt: Date.now(),
            });
          } else {
            exists.rejected++;
          }
        }

        await setScammData("hashes", hashes);

        data.status = "rejected";
        data.rejectedBy = interaction.user.id;

        await setScammData("events", events);

        await interaction.reply({
          content: "False Positive markiert.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch (err) {
      console.error("[SCAM BUTTON]", err);
    }
  });
}
const ROLES_TIERS = [
  { id: "1540827201111597117", needed: 50, name: "Neuankömmling" },
  { id: "1540827423141138594", needed: 100, name: "Bronze" },
  { id: "1540827754440958035", needed: 500, name: "Silber" },
  { id: "1540827883323527339", needed: 1000, name: "Gold" },
  { id: "1540828086893936761", needed: 5000, name: "Platin" },
  { id: "1540828402968301679", needed: 10000, name: "Diamant" },
  { id: "1540828544463011850", needed: 50000, name: "Smaragd" },
  { id: "1540828698310213683", needed: 100000, name: "Obsidian" }
];

const GUILD_ID = "1423413347168157718";
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

  while (currentTier < ROLES_TIERS.length - 1 && currentXp >= ROLES_TIERS[currentTier].needed) {
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
        const rolesToRemove = ROLES_TIERS.map(tier => tier.id);
        await member.roles.remove(rolesToRemove);
        await member.roles.add(ROLES_TIERS[currentTier].id);
      }
    } catch (error) {
      console.error(error);
    }
  }
}

export function handleMessageXP(message) {
  if (message.author.bot || !message.guild || message.guild.id !== GUILD_ID) return;
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
          voiceState.channelId !== "1423413348493430901" &&
          voiceState.channel.members.filter(m => !m.user.bot).size > 1
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
    invitesTracker.set(guild.id, new Map(guildInvites.map(invite => [invite.code, invite.uses])));
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
    const inviteUsed = newInvites.find(i => oldInvites && i.uses > (oldInvites.get(i.code) || 0));
    
    if (inviteUsed && inviteUsed.inviter) {
      await addXP(inviteUsed.inviter.id, 50, member.client);
    }
    
    invitesTracker.set(member.guild.id, new Map(newInvites.map(invite => [invite.code, invite.uses])));
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
    const members = await guild.members.fetch();
    
    for (const [memberId, member] of members) {
      if (member.user.bot) continue;
      
      const existingData = await getXpData(memberId);
      if (!existingData || existingData.rang === undefined) {
        await setXpData(memberId, { rang: 0, xp: 0 });
        
        const hasTierRole = member.roles.cache.some(role => ROLES_TIERS.map(t => t.id).includes(role.id));
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
  if (message.channelId === "1423434079390535730") return;
  handleMessageXP(message)
});

client.on("guildMemberAdd", async (member) => {
  await handleGuildMemberAdd(member);
});

client.on("inviteCreate", async (invite) => {
  handleInviteCreate(invite);
});
const TICKET_CHANNEL_ID = "1423413348493430905";

const getHelpData = {
  getMainEmbed: () => {
    return new EmbedBuilder()
      .setTitle("Hilfemenü")
      .setDescription(
        "Willkommen im Hilfemenü! Klicke auf die Buttons unten, um zwischen den Kategorien zu wechseln.\n\n" +
        `Falls du ein Supportanliegen hast, einen Gewinn abholen möchtest (Giveaway oder Event) oder dich für den Clan bewerben willst, erstelle bitte ein Ticket in <#${TICKET_CHANNEL_ID}>.`
      )
      .setColor("#ffffff");
  },

  getProfileEmbed: async (userId, userUsername, userAvatarURL) => {
    const ecoData = await getEcoData(userId) || {};
    const xpData = await getXpData(userId) || {};
    const countData = await getCouData("counting") || {};

    const username = ecoData.username || userUsername;
    const mcUsername = ecoData.mcUsername || "Nicht verknüpft";
    const balance = (ecoData.balance || 0).toLocaleString("de-DE");
    const isBlocked = ecoData.blocked ? "Gesperrt" : "Aktiv";

    const currentPoints = xpData.xp || 0;
    let currentTierName = "Kein Rang";
    let nextTierPoints = "Max";

    for (let i = ROLES_TIERS.length - 1; i >= 0; i--) {
      if (currentPoints >= ROLES_TIERS[i].needed) { 
        currentTierName = ROLES_TIERS[i + 1].name;
        break;
      }
    }
    
    const nextTier = ROLES_TIERS.find(t => currentPoints < t.needed);
    if (nextTier) {
      nextTierPoints = nextTier.needed;
    }

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
        { name: "XP", value: `${currentPoints}/${nextTierPoints}`, inline: true },
        { name: "Counting", value: `${countedRight} Zahlen`, inline: true }
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
        "`!casino` (`/casino`) - Zeige existierende Spiele im Casino\n" +
        "`!casino blackjack x` (`/blackjack`) - Starte ein Spiel Blackjack\n" +
        "`!casino coinflip x` (`/coinflip`) - Spiel Coinflip gegen das Haus\n" +
        "`!casino crash x` (`/crash`) - Starte einen Crash\n" +
        "`!casino highlow x` (`/highlow`) - Starte ein Highlow-Kartenspiel\n" +
        "`!casino jackpot x` (`/jackpot`) - Kaufe Tickets für den Jackpot\n" +
        "`!casino roulette x` (`/roulette`) - Setze Kekse am Roulette-Tisch\n" +
        "`!help` (`/help`) - Öffnet dieses Hilfemenü\n" +
        "`!leaderboard` (`/leaderboard`) - Zeigt die Top 5 der reichsten User\n" +
        "`!listpolls` (`/listpolls`) - Liste alle aktiven Umfragen auf\n" +
        "`!remind` (`/remind`) - Erstelle eine Erinnerung für dich\n" +
        "`!top` (`/top`) - Zeige serverweite Bestenliste im Counting\n" +
        "`!coinflip @User x` - Fordert einen Spieler zu Coinflip heraus\n" +
        "`!ssp @User x` - Fordert einen Spieler zu Schere-Stein-Papier heraus"
      );
  },

  getChannelsEmbed: () => {
    return new EmbedBuilder()
      .setTitle("Kanalübersicht")
      .setColor("#ffffff")
      .setDescription(
        "<#1423413348065611949> Hier findest du das offizielle Regelwerk des Servers.\n" +
        "<#1423637547363467346> Wichtige Neuigkeiten und Ankündigungen werden hier geteilt.\n" +
        "<#1464993818968588379> Technische Änderungen und Bot-Updates werden hier aufgelistet.\n" +
        "<#1423637646634123294> Hier finden regelmäßige Giveaways statt.\n" +
        "<#1472658090812899358> Hier werden Events angekündigt\n" +
        "<#1540111606917107772> In diesem Kanal darfst du deine eigenen Projekte bewerben.\n" +
        "<#1423434079390535730> Der Kanal für das Counting Spiel\n" +
        "<#1506746618601541774> Hier kannst du dir alle 24 Stunden 10 kostenlose Kekse abholen.\n" +
        "<#1507385550825459812> Der Bereich für alle Casino-Spiele und Wetten.\n" +
        "<#1508053328662364302> Tausche deine Kekse gegen Booster, doppelte Giveaway Chance oder die VIP-Rolle ein.\n" +
        "<#1423413348493430905> Hier kannst du Tickets für Support, Gewinne oder Bewerbungen erstellen."
      );
  }
};

const helpRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("help_profile").setLabel("Profil").setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId("help_commands").setLabel("Befehle").setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId("help_channels").setLabel("Channels").setStyle(ButtonStyle.Secondary)
);

export async function handleTextHelpCommand(msg) {
  const mainEmbed = getHelpData.getMainEmbed();
  const responseMessage = await msg.reply({ embeds: [mainEmbed], components: [helpRow] });
  createHelpCollector(responseMessage, msg.author.id, msg.author.username);
}

export async function handleSlashHelpCommand(interaction) {
  if (!interaction || !interaction.user) return;
  const mainEmbed = getHelpData.getMainEmbed();
  const responseMessage = await interaction.reply({ embeds: [mainEmbed], components: [helpRow], fetchReply: true });
  createHelpCollector(responseMessage, interaction.user.id, interaction.user.username);
}

function createHelpCollector(messageTarget, userId, userUsername) {
  const collector = messageTarget.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120000
  });

  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: "Du hast diesen Befehl nicht gerufen! Benutze selbst `!help` oder `/help`.",
        flags: [MessageFlags.Ephemeral]
      });
    }

    await interaction.deferUpdate();

    let newEmbed;
    if (interaction.customId === "help_profile") {
      newEmbed = await getHelpData.getProfileEmbed(userId, userUsername, interaction.user.displayAvatarURL({ size: 512 }));
    } else if (interaction.customId === "help_commands") {
      newEmbed = getHelpData.getCommandsEmbed();
    } else if (interaction.customId === "help_channels") {
      newEmbed = getHelpData.getChannelsEmbed();
    }

    await interaction.editReply({ embeds: [newEmbed], components: [helpRow] }).catch(() => {});
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
    await handleTextHelpCommand(msg)
    globalBotStats.commandsRunned += 1;
  });
}
export async function initDashboard(app, client, globalBotStats) {
  const logs = [];
  const _log = console.log.bind(console);
  console.log = (...a) => {
    const message = a.join(" ");
    _log(message);
    logs.push({ t: Date.now(), m: message });
  };
}
app.get("/api/stats", async (req, res) => {
  try {
    const guild = client.guilds.cache.first() || {
      name: "Kekse Server",
      id: "—",
      channels: { cache: { size: 0 } },
    };
    let ownerName = "Unbekannt";
    let userCount = globalBotStats.membersJoined;
    let botCount = 0;

    if (guild.fetchOwner) {
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) ownerName = owner.user.username;
      userCount = guild.members
        ? guild.members.cache.filter((m) => !m.user.bot).size
        : userCount;
      botCount = guild.members
        ? guild.members.cache.filter((m) => m.user.bot).size
        : 0;
    }
    const StorageModel = mongoose.model("BotStorage");
    const allEcoDocuments = await StorageModel.find({
      namespace: "economy",
    }).lean();
    const pingDoc = await StorageModel.findOne({
      namespace: "system",
      key: "ping_history",
    }).lean();
    let dbPingHistory =
      pingDoc && pingDoc.value && Array.isArray(pingDoc.value.history)
        ? pingDoc.value.history
        : [];
    const allXpDocuments = await StorageModel.find({
      namespace: "xp",
    }).lean();
      const xpMap = new Map(
      allXpDocuments.map(doc => [doc.key, doc.value])
    );
    let accounts = [];
    let transactionLogs = {};
    for (const doc of allEcoDocuments) {
      if (/^\d+$/.test(doc.key) && doc.value) {
        const xpData = xpMap.get(doc.key) || {};
        accounts.push({
          userId: doc.key,
          username: doc.value.username || "Unbekannt",
          mcUsername: doc.value.mcUsername || "Nicht registriert",
          balance: doc.value.balance || 0,
          blocked: doc.value.blocked || false,
          rang: xpData.rang || 0,
          xp: xpData.xp || 0
        });
      } else if (doc.key.startsWith("tx_") && doc.value && doc.value.history) {
        const uId = doc.key.replace("tx_", "");
        transactionLogs[uId] = doc.value.history;
      }
    }
    const mappedLogs = logs.map((l) => ({
      t: l.timestamp,
      m: `[${l.type.toUpperCase()}] ${l.message}`,
    }));

    res.json({
      guild: {
        name: guild.name,
        id: guild.id,
        owner: ownerName,
        channels: guild.channels?.cache?.size || 0,
      },
      users: userCount,
      bots: botCount,
      uptime: Math.floor(process.uptime()),
      version: "2.1.0",
      lastRestart: Date.now() - process.uptime() * 1000,
      ping: {
        now: client.ws.ping || globalBotStats.pingNow || 0,
        avg: globalBotStats.pingAverage || client.ws.ping || 0,
        max: globalBotStats.pingMaximum || client.ws.ping || 0,
        history: dbPingHistory,
      },
      accounts: accounts,
      transactionLogs: transactionLogs,
      logs: mappedLogs,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/accounts/action", express.json(), async (req, res) => {
  try {
    const { token, userId, action, amount } = req.body;
    if (!token) return res.status(401).json({ error: "Kein Token angegeben" });

    const inputHash = crypto.createHash("sha256").update(token).digest("hex");
    const ADMIN_TOKEN_HASH =
      "98b597cf0dab8d66c56c7368241dcb52db0c68eb6db44a6d762f7d45fb2db07c";
    if (inputHash !== ADMIN_TOKEN_HASH)
      return res.status(403).json({ error: "Ungültiger Admin Token" });

    const userData = await getEcoData(userId);
    if (!userData || !userData.username)
      return res.status(404).json({ error: "Konto nicht gefunden" });

    if (action === "toggle-block") {
      userData.blocked = !userData.blocked;
      await logTransaction(
        userId,
        0,
        "neutral",
        `Konto durch Dashboard ${userData.blocked ? "gesperrt" : "entsperrt"}`,
      );
    } else if (action === "add-kekse") {
      const val = parseInt(amount);
      if (isNaN(val) || val <= 0)
        return res.status(400).json({ error: "Ungültiger Betrag" });
      userData.balance = (userData.balance || 0) + val;
      await logTransaction(userId, val, "plus", "Dashboard Gutschrift");
    } else if (action === "remove-kekse") {
      const val = parseInt(amount);
      if (isNaN(val) || val <= 0)
        return res.status(400).json({ error: "Ungültiger Betrag" });
      userData.balance = Math.max(0, (userData.balance || 0) - val);
      await logTransaction(userId, val, "minus", "Dashboard Abzug");
    }

    await setEcoData(userId, userData);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Process] Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught Exception:", err);
});
const commands = [
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Sendet eine Nachricht in einen bestimmten Kanal')
    .addChannelOption(opt => opt.setName('kanal').setDescription('Der Zielkanal').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Der Nachrichtentext').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Erstellt einen neuen Changelog-Eintrag')
    .addStringOption(opt => opt.setName('eintrag').setDescription('Inhalt des Updates (Nutze Kommas für Listenpunkte)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Sendet ein strukturiertes Embed')
    .addChannelOption(opt => opt.setName('kanal').setDescription('Der Zielkanal').setRequired(true))
    .addStringOption(opt => opt.setName('titel').setDescription('Der Titel des Embeds').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Die Beschreibung / Haupttext').setRequired(true))
    .addStringOption(opt => opt.setName('farbe').setDescription('HEX-Farbe (z.B. #ff0000 oder #ffffff)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Sendet eine Direktnachricht an einen User')
    .addStringOption(opt => opt.setName('userid').setDescription('Die Discord-ID des Users').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Der Nachrichtentext').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('news')
    .setDescription('Sendet eine News-Nachricht mit integrierter Emoji-Ersetzung')
    .addChannelOption(opt => opt.setName('kanal').setDescription('Der Zielkanal').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Der Newstext (Nutze :emojiName:)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('reply')
    .setDescription('Antwortet auf eine existierende Nachricht')
    .addStringOption(opt => opt.setName('msgid').setDescription('Die ID der Nachricht').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Der Antworttext').setRequired(true))
    .addChannelOption(opt => opt.setName('kanal').setDescription('Kanal der Nachricht (Standard: aktueller Kanal)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Zeigt die aktuelle Latenz des Bots an')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Löscht eine bestimmte Anzahl an Nachrichten mit Filtern')
    .addIntegerOption(opt => opt.setName('anzahl').setDescription('Menge an Nachrichten (max. 500, Standard: 100)').setRequired(false))
    .addChannelOption(opt => opt.setName('kanal').setDescription('Der Zielkanal (Standard: aktueller Kanal)').setRequired(false))
    .addUserOption(opt => opt.setName('nutzer').setDescription('Filtert Nachrichten nach einem bestimmten User').setRequired(false))
    .addStringOption(opt => opt.setName('zeitrahmen').setDescription('Zeitrahmen-Filter (z.B. 2h, 1d)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Startet ein neues Giveaway im ausgewählten Kanal')
    .addChannelOption(opt => opt.setName('kanal').setDescription('Der Kanal, in dem das Giveaway stattfinden soll').setRequired(true))
    .addStringOption(opt => opt.setName('dauer').setDescription('Dauer des Giveaways (z.B. 1h, 30m, 1d)').setRequired(true))
    .addStringOption(opt => opt.setName('preis').setDescription('Der Gewinn / Preis des Giveaways').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Beschreibungstext für das Giveaway').setRequired(false))
    .addIntegerOption(opt => opt.setName('gewinner').setDescription('Anzahl der Gewinner (Standard: 1)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Zeigt dir, wie du Hilfe oder Support erhalten kannst')
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('moveadmin')
    .setDescription('Verschiebt das aktuelle Ticket manuell in den Admin-Bereich')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Erstellt das Verifizierungs-Panel mit Button im festgelegten Kanal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Zeigt die Top 10 User mit den meisten Punkten im Counting-System')
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('set-number')
    .setDescription('Admin: Setzt die nächste zu zählende Nummer manuell fest')
    .addIntegerOption(opt => opt.setName('nummer').setDescription('Die neue Zielzahl').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageServer),

  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Sendet das Ticket-Panel mit Buttons in den aktuellen Kanal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageServer),

  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Schließt und archiviert das aktuelle Ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Löscht den aktuellen Kanal nach einer kurzen Verzögerung')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('block')
    .setDescription('Sperrt einen User für eine bestimmte Anzahl an Tagen für das Ticket-System')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der zu sperrende Nutzer').setRequired(true))
    .addIntegerOption(opt => opt.setName('tage').setDescription('Anzahl der Tage für die Sperre (Standard: 7)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('daily-setup')
    .setDescription('Entwickler: Richtet ein tägliches Belohnungssystem mit Button ein')
    .addStringOption(opt => opt.setName('id').setDescription('Eine eindeutige ID für dieses Setup (z.B. event1)').setRequired(true))
    .addStringOption(opt => opt.setName('beschreibung').setDescription('Zusätzlicher Beschreibungstext für das Einlösen').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('shop-setup')
    .setDescription('Entwickler: Richtet den Server-Shop im festgelegten Kanal ein')
    .addStringOption(opt => opt.setName('beschreibung').setDescription('Zusätzlicher Beschreibungstext für den Shop').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('casino')
    .setDescription('Zeigt eine Übersicht aller verfügbaren Casino-Spiele an')
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Spiele eine Runde Roulette')
    .addIntegerOption(opt => opt.setName('einsatz').setDescription('Einsatz in Keksen').setRequired(true))
    .addStringOption(opt => opt.setName('typ').setDescription('Wettart: red, black, even, odd, Zahl 0-36, 1-18, 19-36').setRequired(true))
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Mache einen Münzwurf')
    .addIntegerOption(opt => opt.setName('einsatz').setDescription('Einsatz in Keksen').setRequired(true))
    .addStringOption(opt => opt.setName('seite').setDescription('Kopf oder Zahl?').setRequired(true).addChoices({ name: 'Kopf (Heads)', value: 'heads' }, { name: 'Zahl (Tails)', value: 'tails' }))
    .setContexts(0)
    .setIntegrationTypes(0),
  new SlashCommandBuilder()
    .setName('jackpot')
    .setDescription('Zahle Kekse in den aktuellen Jackpot ein')
    .addIntegerOption(opt => opt.setName('einsatz').setDescription('Einsatz in Keksen').setRequired(true))
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Starte ein Crash-Multiplikator-Spiel')
    .addIntegerOption(opt => opt.setName('einsatz').setDescription('Einsatz in Keksen').setRequired(true))
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('highlow')
    .setDescription('Errate, ob die nächste Karte höher oder niedriger ist')
    .addIntegerOption(opt => opt.setName('einsatz').setDescription('Einsatz in Keksen').setRequired(true))
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Spiele eine Runde Blackjack gegen den Bot')
    .addIntegerOption(opt => opt.setName('einsatz').setDescription('Einsatz in Keksen').setRequired(true))
    .setContexts(0)
    .setIntegrationTypes(0), 
  
      new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Nutze das integrierte Bank- und Währungssystem')
    .addSubcommand(sub => sub.setName('status').setDescription('Zeigt dir privat deinen aktuellen Kontostand an'))
    .addSubcommand(sub => sub.setName('create').setDescription('Erstellt dein persönliches Bankkonto'))
    .addSubcommand(sub => sub.setName('help').setDescription('Zeigt die Hilfe-Übersicht des Bank-Systems an'))
    .addSubcommand(sub => sub.setName('pay').setDescription('Überweist Kekse an einen anderen Spieler').addUserOption(opt => opt.setName('nutzer').setDescription('Der Empfänger der Kekse').setRequired(true)).addIntegerOption(opt => opt.setName('anzahl').setDescription('Die Menge an Keksen').setRequired(true)))
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('bank-admin')
    .setDescription('Serverleitung: Konten von Mitgliedern modifizieren')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageServer)
    .addSubcommand(sub => sub.setName('add').setDescription('Fügt einem Konto Kekse hinzu').addIntegerOption(opt => opt.setName('anzahl').setDescription('Die Menge an Keksen').setRequired(true)).addUserOption(opt => opt.setName('nutzer').setDescription('Der Zielnutzer').setRequired(false)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Zieht von einem Konto Kekse ab').addIntegerOption(opt => opt.setName('anzahl').setDescription('Die Menge an Keksen').setRequired(true)).addUserOption(opt => opt.setName('nutzer').setDescription('Der Zielnutzer').setRequired(false))),

  new SlashCommandBuilder()
    .setName('bank-mod')
    .setDescription('Team: Kontoinformationen und Umläufe einsehen')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub.setName('see').setDescription('Zeigt detaillierte Kontoinformationen eines Nutzers').addUserOption(opt => opt.setName('nutzer').setDescription('Der zu prüfende Nutzer').setRequired(true)))
    .addSubcommand(sub => sub.setName('get').setDescription('Zeigt an, wie viele Kekse insgesamt im Umlauf sind')),

  new SlashCommandBuilder()
    .setName('zweitaccount')
    .setDescription('Verwaltet die Zweitaccounts von Mitgliedern')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub
      .setName('add')
      .setDescription('Verknüpft zwei Accounts miteinander (ID oder Erwähnung)')
      .addStringOption(opt => opt.setName('account_1').setDescription('Erster Account (ID oder Erwähnung)').setRequired(true))
      .addStringOption(opt => opt.setName('account_2').setDescription('Zweiter Account (ID oder Erwähnung)').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Löst eine bestimmte Account-Verknüpfung auf')
      .addStringOption(opt => opt.setName('nutzer').setDescription('ID oder Erwähnung des zu entfernenden Accounts').setRequired(true))),

  new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Erstellt eine persönliche Erinnerung')
    .addStringOption(opt => opt.setName('zeit').setDescription('Zeitspanne bis zur Erinnerung (z.B. 10s, 5m, 1h, 2d)').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Waran soll der Bot dich erinnern?').setRequired(true))
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('listpolls')
    .setDescription('Zeigt eine Übersicht aller aktiven Umfragen an')
    .setContexts(0)
    .setIntegrationTypes(0),

  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Verwaltet das Umfragen-System (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => sub
      .setName('start')
      .setDescription('Startet eine neue Umfrage')
      .addStringOption(opt => opt.setName('frage').setDescription('Die Hauptfrage').setRequired(true))
      .addIntegerOption(opt => opt.setName('minuten').setDescription('Dauer in Minuten').setRequired(true))
      .addStringOption(opt => opt.setName('beschreibung').setDescription('Zusätzliche Details').setRequired(true))
      .addStringOption(opt => opt.setName('option_1').setDescription('Option 1').setRequired(true))
      .addStringOption(opt => opt.setName('option_2').setDescription('Option 2').setRequired(true))
      .addStringOption(opt => opt.setName('option_3').setDescription('Option 3').setRequired(false))
      .addStringOption(opt => opt.setName('option_4').setDescription('Option 4').setRequired(false))
      .addStringOption(opt => opt.setName('option_5').setDescription('Option 5').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('close')
      .setDescription('Beendet eine aktive Umfrage vorzeitig')
      .addStringOption(opt => opt.setName('id').setDescription('Die ID der Umfrage').setRequired(true))),
    new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Versetzt ein Mitglied in ein Timeout')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der betroffene Nutzer').setRequired(true))
    .addStringOption(opt => opt.setName('dauer').setDescription('Dauer (z.B. 10s, 5m, 2h, 1d)').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Grund für das Timeout').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Hebt das Timeout eines Mitglieds vorzeitig auf')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der betroffene Nutzer').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Grund für die Aufhebung').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kickt ein Mitglied vom Server')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der zu kickende Nutzer').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Grund für den Kick').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannt einen User vom Server (auch per ID)')
    .addStringOption(opt => opt.setName('userid').setDescription('Die Discord-ID oder Erwähnung des Users').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Grund für den Ban').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Hebt den Ban eines Users auf')
    .addStringOption(opt => opt.setName('userid').setDescription('Die Discord-ID des Users').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Grund für den Entban').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Verwarnt ein Mitglied auf dem Server')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der zu verwarnende Nutzer').setRequired(true))
    .addStringOption(opt => opt.setName('grund').setDescription('Grund für die Verwarnung').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Zeigt alle Verwarnungen eines Nutzers an')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der zu prüfende Nutzer').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('warn-remove')
    .setDescription('Entfernt eine bestimmte Verwarnung eines Nutzers anhand der Nummer')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der betroffene Nutzer').setRequired(true))
    .addIntegerOption(opt => opt.setName('nummer').setDescription('Die Nummer des Warns (z.B. 1)').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  
    new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Befördert ein Mitglied auf den nächsthöheren Rang')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der zu befördernde Nutzer').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessagesInThreads),

  new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Degradiert ein Mitglied auf einen niedrigeren Rang')
    .addUserOption(opt => opt.setName('nutzer').setDescription('Der zu degradierende Nutzer').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessagesInThreads),
  new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Zeigt die Top 5 Nutzer mit den meisten Keksen')
  .setContexts(0)
  .setIntegrationTypes(0)
].map(cmd => cmd.toJSON());

export async function deploySlashCommands() {
  if (!process.env.BOT_TOKEN) {
    console.error('❌ Fehler: BOT_TOKEN fehlt in den Umgebungsvariablen!');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

  try {
    const base64Token = process.env.BOT_TOKEN.split('.')[0];
    const botId = Buffer.from(base64Token, 'base64').toString('utf-8');
    console.log(`📡 Registriere Befehle DIREKT auf dem Server für Bot-ID: ${botId}...`);
    await rest.put(
      Routes.applicationGuildCommands(botId, "1423413347168157718"),
      { body: commands }
    );
    console.log('✅ ALLE Befehle erfolgreich auf dem Server registriert! Sie sind JETZT sofort da.');
  } catch (error) {
    console.error('❌ Fehler bei der Server-Registrierung:', error);
  }
}
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, member, guild, user, channelId, channel: currentChannel } = interaction;
    const logChannelId = "1423413348220796991";
    const TEAM_ROLE = "1457906448234319922";
    const sendKekseLog = async (cmdName, target, content) => {
      const logChannel = client.channels.cache.get(logChannelId);
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
          .setFooter({ text: "Kekse Clan | Command Logs" })
          .setTimestamp();

        await logChannel.send({ embeds: [kekseEmbed] }).catch(() => {});
      }
    };
    if (commandName === "leaderboard") {
  const StorageModel = mongoose.model("BotStorage");
  const allDocs = await StorageModel.find({ namespace: "economy" }).lean();

  const sorted = allDocs
    .filter(doc => /^\d+$/.test(doc.key) && doc.value?.balance > 0)
    .sort((a, b) => b.value.balance - a.value.balance)
    .slice(0, 5);

  const embed = new EmbedBuilder()
    .setTitle("🏆 Top 5 Balance")
    .setColor("#ffffff")
    .setDescription(
      sorted.map((doc, i) =>
        `**${i + 1}.** <@${doc.key}> • ${doc.value.balance.toLocaleString("de-DE")} Kekse`
      ).join("\n") || "Keine Daten"
    )
    .setFooter({ text: "Kekse Clan" })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
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
      globalBotStats.commandsRunned += 1;
      console.log(`${user.username} hat die "send"-Funktion genutzt`)
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
      globalBotStats.commandsRunned += 1;
      console.log(`${user.username} hat die "changelog"-Funktion genutzt`)
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
      globalBotStats.commandsRunned += 1;
      console.log(`${user.username} hat die "embed"-Funktion genutzt`)
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
        globalBotStats.commandsRunned += 1;
        console.log(`${user.username} hat die "dm"-Funktion genutzt`)
      } catch (err) {
        await interaction.reply({
          content:
            "❌ Die DM konnte nicht zugestellt werden (Privatsphäre-Einstellungen des Users).",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }

    if (commandName === "news") {
      const targetChannel = options.getChannel("kanal");
      const rawText = options.getString("text");

      const emojiMap = {
        regles: "1467246063122649180",
        mail: "1467246078226334040",
        like: "1467246068235501733",
        management: "1467246065437642999",
        moins: "1467246060689690849",
        info: "1467246059561685238",
        web: "1467246058341142833",
        dislike: "1467246057070268681",
        logs: "1467246054910070938",
        check: "1467246053911957759",
        staff: "1467246044772569218",
        lien: "1467246043182924040",
        identifiant: "1467246041668780227",
        cybersecurite: "1467246039731015794",
        statistiques: "1467246038497886311",
        administrateur: "1467246035922321478",
        croix: "1467246034580410429",
        certifier: "1467246033389092904",
        supprimer: "1467246032181006499",
        profil: "1467246030998343733",
        moderateur: "1467246028758712575",
        crayon: "1467246026846109821",
        stats: "1467246025411658012",
        ouvert: "1467246023872352358",
        discordoff: "1467246022668583147",
        warningicon: "1467246020445339875",
        "2nd": "1467246019556282533",
        discordon: "1467246018218430696",
        "1st": "1467246016926453810",
        help: "1467246015332618372",
        timeout: "1467246013487255705",
        unstableping: "1467246011578712186",
        yinfo: "1467246010349785119",
        "3rd": "1467246008734847138",
        failed: "1467246005870264352",
        mute: "1467246003890425928",
        verified: "1467246002628202507",
        cross: "1467246000258420767",
        interruption: "1467245998043824128",
        checkmark: "1467245996584210554",
        moderatorprogramsalumnia: "1467245995510337659",
        pingeveryone: "1453800508329558218",
        ping: "1453799622303813714",
        pepecookie: "1453796363442585660",
      };
      const formattedText = rawText.replace(
        /:([a-zA-Z0-9_]+):/g,
        (match, name) => {
          return emojiMap[name] ? `<:emoji:${emojiMap[name]}>` : match;
        },
      );

      await targetChannel.send(formattedText);
      await interaction.reply({
        content: `News-Nachricht erfolgreich in ${targetChannel} gepostet.`,
        flags: [MessageFlags.Ephemeral],
      });
      await sendKekseLog("news", targetChannel.toString(), rawText);
      globalBotStats.commandsRunned += 1;
      console.log(`${user.username} hat die "news"-Funktion genutzt`)
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
        globalBotStats.commandsRunned += 1;
        console.log(`${user.username} hat die "reply"-Funktion genutzt`)
      } catch (err) {
        await interaction.reply({
          content: "❌ Nachricht im angegebenen Kanal nicht gefunden.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
    if (commandName === "ping") {
      if (!member.roles.cache.has(TEAM_ROLE)) {
        return interaction.reply({
          content: "❌ Keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      globalBotStats.commandsRunned += 1;

      const start = Date.now();
      await interaction.reply({ content: "🏓 Pinging...", flags: [MessageFlags.Ephemeral] });
      const end = Date.now();

      const roundtrip = end - start;
      const wsPing = client.ws.ping;

      await interaction
        .editReply({
          content: `🏓 **Pong!**\n- API-Latenz: \`${roundtrip}ms\`\n- WebSocket: \`${wsPing}ms\``,
        })
        .catch(() => {});

      const logChannel = client.channels.cache.get(logChannelId);
      console.log(`${user.username} hat eine Pingabfrage gestartet. Antwort: API-Latenz:${roundtrip}ms , WebSocket:${wsPing}ms`)
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
          .setFooter({ text: "Kekse Clan | System Check" })
          .setTimestamp();

        await logChannel.send({ embeds: [kekseLog] }).catch(() => {});
      }
    }
    if (commandName === "clear") {
      if (!member.roles.cache.has(TEAM_ROLE)) {
        return interaction.reply({
          content: "❌ Keine Berechtigung.",
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
      console.log(`${user.username} hat die "clear"-Funktion genutzt: ${deletedCount} innerhalb von ${duration}s in ${targetChannel} gelöscht`)
      const logChannel = client.channels.cache.get(logChannelId);
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
          .setFooter({ text: "Kekse Clan | Moderation System" })
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
      globalBotStats.commandsRunned += 1;
    }
    if (commandName === "giveaway") {
      if (!member.roles.cache.has(TEAM_ROLE)) {
        return interaction.reply({
          content: " Keine Rechte.",
          flags: [MessageFlags.Ephemeral],
        });
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

      const startTime = Date.now();
      const endTime = startTime + durationMs;

      const embed = new EmbedBuilder()
        .setTitle(`🎁 Giveaway: ${price}`)
        .setDescription(
          `${messageText}\n\nEndet am: <t:${Math.floor(endTime / 1000)}:R> (<t:${Math.floor(endTime / 1000)}:f>)\nTeilnehmer: **0**\nGewinner: **${winnerCount}**`,
        )
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
      giveaways[giveawayMsg.id] = {
        channelId: channel.id,
        startTime,
        endTime,
        price,
        messageText,
        winnerCount,
        hostId: user.id,
        participants: [],
      };
      await setGivData("activeGiveaways", giveaways);

      await interaction.reply({
        content: `✅ Giveaway erfolgreich in ${channel} gestartet!`,
        flags: [MessageFlags.Ephemeral],
      });

      await sendKekseLog(
        "Giveaway gestartet",
        user,
        `**Preis:** ${price}\n**Kanal:** ${channel}\n**Dauer:** ${durationStr}\n**Gewinner:** ${winnerCount}`,
      );
      console.log(`${user.username} hat ein Giveaway für ${price} in ${channel} erstellt.`)

      globalBotStats.commandsRunned += 1;
      globalBotStats.giveawaysCreated += 1;
    }
    if (commandName === "help") {
      console.log(`[HELP] Von ${user.username}`);
      await handleSlashHelpCommand(interaction);
      console.log(`${user.username} hat die "help"-Funktion genutzt`)
      globalBotStats.commandsRunned += 1;
    }
    const createPollText = (q, d, opts, end, count, id, author) => {
  const optionsArray = Array.isArray(opts) ? opts : (opts ? Array.from(opts) : []);
  
  return `## ${q}\n${d}\n\n` +
    optionsArray.map(o => `${o.emoji} ${o.text}`).join("\n") + `\n\n` +
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
            .setStyle(ButtonStyle.Secondary),
        );
      });
      if (currentRow.components.length > 0) rows.push(currentRow);
      return rows;
    };
    if (commandName === "poll") {
      if (!member.roles.cache.has(TEAM_ROLE)) {
        return interaction.reply({
          content: "❌ Du hast keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const subCommand = options.getSubcommand();

      if (subCommand === "start") {
        const question = options.getString("frage");
        const time = options.getInteger("minuten");
        const description = options.getString("beschreibung");

        const rawOptions = [];
        for (let i = 1; i <= 10; i++) {
          const optValue = options.getString(`option_${i}`);
          if (optValue) rawOptions.push(optValue);
        }

        const pollId = interaction.id;
        const emojis = [
          "1️⃣",
          "2️⃣",
          "3️⃣",
          "4️⃣",
          "5️⃣",
          "6️⃣",
          "7️⃣",
          "8️⃣",
          "9️⃣",
          "🔟",
        ];
        const pollOptions = rawOptions.map((opt, i) => ({
          text: opt,
          emoji: emojis[i],
          votes: 0,
        }));
        const endTime = Date.now() + time * 60000;

        const pollContent = createPollText(
          question,
          description,
          pollOptions,
          endTime,
          0,
          pollId,
          user,
        );
        const components = createPollButtons(pollId, pollOptions);

        await interaction.reply({
          content: " Umfrage wird gestartet...",
          flags: [MessageFlags.Ephemeral],
        });
        const pollMsg = await currentChannel.send({
          content: `<@&1424028924387786762>\n${pollContent}`,
          components: components,
        });

        const polls = (await getPollData("polls_data")) || [];
        polls.push({
          id: pollId,
          messageId: pollMsg.id,
          channelId: currentChannel.id,
          question,
          description,
          options: pollOptions,
          endTime,
          creatorId: user.id,
          voters: [],
          closed: false,
        });
        await setPollData("polls_data", polls);

        await sendKekseLog(
          "Umfrage gestartet",
          user,
          `**Frage:** ${question}\n**Dauer:** ${time} Min.\n**ID:** \`${pollId}\``,
        );
        console.log(`${user.username} hat einen Poll gestartet: ${question}`)
        globalBotStats.pollsCreated += 1;
      }
      const closePoll = async (poll, polls, closer) => {
        poll.closed = true;
        const channel = await client.channels
          .fetch(poll.channelId)
          .catch(() => null);
        const pollMsg = await channel?.messages
          .fetch(poll.messageId)
          .catch(() => null);
        if (pollMsg) {
          await pollMsg.edit({ components: [] }).catch(() => {});
        }
        const total = poll.voters.length;
        let resultsText = `## <:statistiques:1467246038497886311> Ergebnisse: ${poll.question}\n\n`;
        if (total === 0) {
          resultsText += "Keine Teilnehmer.";
        } else {
          const winnerVotes = Math.max(...poll.options.map((o) => o.votes));
          poll.options.forEach((o) => {
            const perc = Math.round((o.votes / total) * 100);
            resultsText += `${o.emoji} **${o.text}**\n**${o.votes} Stimmen** (${perc}%)${o.votes === winnerVotes && total > 0 ? " <:checkmark:1467245996584210554>" : ""}\n\n`;
          });
        }
        if (channel) await channel.send(resultsText).catch(() => {});
        const logChannel = client.channels.cache.get("1423413348220796991");
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor("#ffffff")
            .setAuthor({
              name: closer.username,
              iconURL: closer.displayAvatarURL(),
            })
            .setDescription(
              `**Aktion:** \`Umfrage beendet\`\n**Frage:** ${poll.question}\n**Teilnehmer:** ${total}\n**ID:** \`${poll.id}\``,
            )
            .setFooter({ text: "Kekse Clan | Poll System" })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
        const updatedPolls = polls.filter((p) => p.id !== poll.id);
        await setPollData("polls_data", updatedPolls);
      };
      if (subCommand === "close") {
        const pollId = options.getString("id");
        const polls = (await getPollData("polls_data")) || [];
        const poll = polls.find((p) => p.id === pollId && !p.closed);

        if (!poll) {
          return interaction.reply({
            content: "❌ Poll nicht gefunden.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        await closePoll(poll, polls, user);
        await interaction.reply({
          content: `✅ Die Umfrage mit der ID \`${pollId}\` wurde erfolgreich geschlossen.`,
          flags: [MessageFlags.Ephemeral],
        });
        console.log(`${user.username} hat den Poll ${pollId} vorzeitig geschlossen`)
        globalBotStats.commandsRunned += 1;
      }
    }
    if (commandName === "listpolls") {
      const polls = (await getPollData("polls_data")) || [];
      const activePolls = polls.filter((p) => !p.closed);
      if (activePolls.length === 0) {
        return interaction.reply({
          content: "Keine aktiven Umfragen vorhanden.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      const list = activePolls
        .map((p) => `ID: \`${p.id}\` | ${p.question}`)
        .join("\n");
      await interaction.reply({
        content: `**Aktive Umfragen:**\n${list}`,
        ephemeral: false,
      });
      console.log(`${user.username} hat die "listpolls"-Funktion genutzt`)
      globalBotStats.commandsRunned += 1;
    }
    if (commandName === "moveadmin") {
      if (!member.roles.cache.has(TEAM_ROLE)) {
        return interaction.reply({
          content: "❌ Keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.reply({
        content: "⏳ Verschiebe Ticket in den Admin-Bereich...",
        flags: [MessageFlags.Ephemeral],
      });
      await moveChannelToAdmin(currentChannel, true);
      console.log(`${user.username} hat ein Ticket in die Admin-Kategorie verschoben`)
      globalBotStats.commandsRunned += 1;
    }
    if (commandName === "ticket-panel") {
      if (!member.roles.cache.has("1454169207838216253")) {
        return interaction.reply({
          content: "❌ Keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.reply({
        content: "⏳ Sende Ticket-Panel...",
        flags: [MessageFlags.Ephemeral],
      });
      await sendTicketPanel(currentChannel);
      console.log(`${user.username} hat ein neues Ticket-Panel erstellt`)
      globalBotStats.commandsRunned += 1;
    }
    async function closeTicket(channel, moderator) {
      try {
        const stored = (await getTickData("tickets")) || { tickets: {} };
        const allEntries = stored.tickets || {};
        const ticket = Object.values(allEntries).find(
          (t) => typeof t === "object" && t.channelId === channel.id,
        );
        if (!ticket) {
          return channel.send(
            "❌ Kein aktives Ticket in der Datenbank gefunden.",
          );
        }
        await channel.permissionOverwrites
          .delete(ticket.userId)
          .catch(() => {});
        await channel.send({
          content: `⏳ **Ticket wird archiviert...**\nErstellt von: ${ticket.username}\nID: ${ticket.idString}`,
        });
        delete stored.tickets[ticket.idString];
        await setTickData("tickets", stored);
        await archiveTicket(
          {
            name: channel.name,
            closedBy: moderator,
            channel: channel,
          },
          setTickData,
        );
      } catch (err) {
        console.error("[TICKET] Fehler:", err);
      }
    }
    if (commandName === "close") {
      if (!member.roles.cache.has(TEAM_ROLE)) {
        return interaction.reply({
          content: "❌ Keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
      }
      await interaction.reply({
        content: "⏳ Ticket-Schließung initiiert...",
        flags: [MessageFlags.Ephemeral],
      });
      await closeTicket(currentChannel, user);
      console.log(`${user.username} hat ${currentChannel} geschlossen`)
      globalBotStats.commandsRunned += 1;
    }
    if (commandName === "block") {
      if (!member.roles.cache.has(TEAM_ROLE)) {
        return interaction.reply({
          content: "❌ Keine Berechtigung.",
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
      console.log(`${user.username} hat ${targetUser.username} von der Erstellung von Tickets ausgeschlossen`)
      await interaction.reply({
        content: `✅ <@${targetUser.id}> wurde für ${days} Tage gesperrt.`,
        flags: [MessageFlags.Ephemeral],
      });
      globalBotStats.commandsRunned += 1;
    }
    if (!member.roles.cache.has(TEAM_ROLE) || !hasPerm(member)) {
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
          content: "❌ Keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    }

    let moderationData = (await getMData("moderation")) || { warns: {} };

    const sendModLog = async (action, target, reason, extra = null) => {
      const logChannel = await client.channels
        .fetch(logChannelId)
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
        .setFooter({ text: "Kekse Clan | Moderation Logs" })
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
        await sendModLog(
          "Timeout",
          targetUser,
          reason,
          `Dauer: ${durationStr}`,
        );
        console.log(`${user.username} hat ${targetUser} wegen ${reason} für ${durationStr} in den timeout versetzt`)
        globalBotStats.commandsRunned += 1;
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
        console.log(`${user.username} hat ${targetUser} wegen ${reason} aus dem timeout geholt`)
        globalBotStats.commandsRunned += 1;
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
        console.log(`${user.username} hat ${targetUser} wegen ${reason} vom Server gekickt`)
        globalBotStats.commandsRunned += 1;
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
        console.log(`${user.username} hat ${fetchedUser} wegen ${reason} vom Server gebannt`)
        globalBotStats.commandsRunned += 1;
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
        console.log(`${user.username} hat ${fetchedUser} wegen ${reason} vom Server entbannt`)
        globalBotStats.commandsRunned += 1;
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
      console.log(`${user.username} hat ${targetUser} wegen ${reason} gewarnt`)
      globalBotStats.commandsRunned += 1;
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
      console.log(`${user.username} hat sich die Warnungen von ${targetUser} angeschaut`)
      globalBotStats.commandsRunned += 1;
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
      console.log(`${user.username} hat ${targetUser} für ${removed[0].reason} entwarnt`)
      globalBotStats.commandsRunned += 1;
    }
    if (commandName === "setup-verify") {
      if (!member.roles.cache.has(TEAM_ROLE)) {
        return interaction.reply({
          content: "❌ Keine Berechtigung.",
          flags: [MessageFlags.Ephemeral],
        });
        console.log(`${user.username} hat ein Verifikations-Setup erstellt`)
      }

      const targetChannel = client.channels.cache.get(VERIFY_CHANNEL_ID);
      if (!targetChannel) {
        return interaction.reply({
          content:
            "❌ Verifizierungs-Kanal konnte nicht in der Cache gefunden werden.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("verify_user")
          .setLabel("Verifizieren")
          .setStyle(ButtonStyle.Success),
      );

      const imageUrl = new AttachmentBuilder("./verify.png");

      await targetChannel.send({
        content:
          "**Willkommen!** Klicke auf den Button, um die Verifizierung abzuschließen.",
        files: [imageUrl],
        components: [row],
      });

      await interaction.editReply({
        content: `✅ Das Verifizierungs-Panel wurde erfolgreich in ${targetChannel} aufgesetzt.`,
      });

      await sendKekseLog(
        "Verification Setup",
        user,
        `Das Verifizierungs-Panel wurde in <#${VERIFY_CHANNEL_ID}> neu aufgesetzt.`,
      );
      globalBotStats.commandsRunned += 1;
    }
    if (commandName === "top") {
      await loadCounting();

      const sorted = Object.entries(countingData.scoreboard || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle("🏆 Top 10 Counter")
        .setDescription(
          sorted.map(([id, s], i) => `${i + 1}. <@${id}> • ${s}`).join("\n") ||
            "Keine Daten",
        )
        .setColor("#ffffff")
        .setFooter({ text: "Kekse Clan" });

      await interaction.reply({ embeds: [embed] });
      console.log(`${user.username} hat die "top"-Funktion genutzt`)
      globalBotStats.commandsRunned += 1;
    }

    if (commandName === "set-number") {
      if (user.id !== "1151971830983311441") {
        return interaction.reply({
          content: "❌ Nur der Haupt-Admin darf diesen Befehl nutzen.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const newNum = options.getInteger("nummer");

      await loadCounting();
      countingData.currentNumber = newNum;
      countingData.direction = newNum < 0 ? -1 : 1;
      await saveCounting();

      const logChannel = client.channels.cache.get(logChannelId);
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
          .setFooter({ text: "Kekse Clan | Counting System" })
          .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }

      await interaction.reply({
        content: ` Die nächste Zahl wurde auf **${newNum}** gesetzt.`,
        flags: [MessageFlags.Ephemeral],
      });
      console.log(`${user.username} hat die Zahl im Counting auf ${newNum} gesetzt`)
      globalBotStats.commandsRunned += 1;
    }
    if (commandName === "daily-setup") {
      if (user.id !== "1151971830983311441") {
        return interaction.reply({
          content: "❌ Nur der Haupt-Admin darf diesen Befehl nutzen.",
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
        .setTitle("🍪 Tägliche Kekse")
        .setDescription(
          `${description}\n\nKlicke auf den Button unten, um 10 Kekse zu erhalten.`,
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
        content: "✅ Daily Setup erfolgreich platziert.",
        flags: [MessageFlags.Ephemeral],
      });
      console.log(`${user.username} hat ein neues Daily-Setup erstellt`)
      globalBotStats.commandsRunned += 1;
    }

    if (commandName === "shop-setup") {
      if (user.id !== "1151971830983311441") {
        return interaction.reply({
          content: "❌ Nur der Haupt-Admin darf diesen Befehl nutzen.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const description =
        options.getString("beschreibung") || "Hole dir hier deine Items ab!";
      const SHOP_CHANNEL_ID = "1508053328662364302";
      const shopChannel = guild.channels.cache.get(SHOP_CHANNEL_ID);

      if (!shopChannel) {
        return interaction.reply({
          content: "❌ Shop-Kanal wurde auf diesem Server nicht gefunden!",
          flags: [MessageFlags.Ephemeral],
        });
      }

      const shopEmbed = new EmbedBuilder()
        .setTitle(`🛒 Server Shop`)
        .setDescription(description)
        .setColor(0xffffff)
        .addFields(
          {
            name: "🎉 Double Chance Giveaway - `100.000 Kekse`",
            value: "Erhöht deine Gewinnchance bei Giveaways.",
            inline: false,
          },
          {
            name: "🛡️ Counting Puffer - `25.000 Kekse`",
            value:
              "Erlaubt dir einen Fehler beim Zählen, ohne die Zahl zurückzusetzen.",
            inline: false,
          },
          {
            name: "⚡ Counting XP Booster (30 Min) - `50.000 Kekse`",
            value: "Du erhältst 30 Minuten lang doppelte XP beim Zählen.",
            inline: false,
          },
          {
            name: "🔥 Counting XP Booster (60 Min) - `100.000 Kekse`",
            value: "Du erhältst 60 Minuten lang doppelte XP beim Zählen.",
            inline: false,
          },
        );

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
          .setStyle(ButtonStyle.Success)
          .setEmoji("⚡"),
        new ButtonBuilder()
          .setCustomId("shop_xp60")
          .setLabel("XP Booster 60m")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🔥"),
      );

      await shopChannel.send({ embeds: [shopEmbed], components: [row] });

      await interaction.reply({
        content: `✅ Shop erfolgreich im Kanal <#${SHOP_CHANNEL_ID}> eingerichtet!`,
        flags: [MessageFlags.Ephemeral],
      });
      console.log(`${user.username} hat ein neues Shop-Setup erstellt`)
      globalBotStats.commandsRunned += 1;
    }
    const CASINO_CHANNEL_ID = "1507385550825459812";
    const ECO_ROLE_ID = "1506732560837771284";

    if (commandName === "casino") {
      if (channelId !== CASINO_CHANNEL_ID) {
        return interaction.reply({
          content: `Das Casino ist nur in <#${CASINO_CHANNEL_ID}> nutzbar.`,
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
            "**/blackjack** `<Einsatz>` - Gewinne im Kartenspiel gegen den Dealer",
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
      ].includes(commandName)
    ) {
      const hasEcoRole = member.roles.cache.has(ECO_ROLE_ID);
      if (!hasEcoRole) {
        return interaction.reply({
          content:
            "Du benötigst ein Bankkonto, um am Casino teilzunehmen. Nutze `/bank create`.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      if (channelId !== CASINO_CHANNEL_ID) {
        return interaction.reply({
          content: `Das Casino ist nur in <#${CASINO_CHANNEL_ID}> nutzbar.`,
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
          betDesc = "1–18";
        } else if (betType === "19-36") {
          won = spin >= 19 && spin <= 36;
          payout = won ? betAmount : -betAmount;
          betDesc = "19–36";
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
        const pct = ((e.betAmount / jackpotState.totalPool) * 100).toFixed(1);
        return `<@${e.userId}> — **${e.betAmount} Kekse** (${pct}%)`;
      })
      .join("\n");

    return new EmbedBuilder()
      .setTitle("Jackpot")
      .setDescription(`**Pool: ${jackpotState.totalPool} Kekse**\n\n${extra}`)
      .addFields({
        name: `Teilnehmer (${jackpotState.entries.length})`,
        value: list || "Keine",
      })
      .setColor(0xffffff)
      .setFooter({ text: "Je mehr du einsetzt, desto höher deine Gewinnchance!" });
  };

  const casinoChannel = guild.channels.cache.get(CASINO_CHANNEL_ID);

  if (!jackpotState.countdownTimer) {
    const drawTime = Date.now() + 5 * 60 * 1000;
    jackpotState.countdownEndTime = drawTime;
    jackpotState.countdownTimer = setTimeout(
      () => runJackpotDraw(casinoChannel),
      5 * 60 * 1000
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

  const userChance = ((betAmount / jackpotState.totalPool) * 100).toFixed(1);
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
          `Gecrasht bei **${crashPoint.toFixed(2)}x**!\n\nEinsatz: **${betAmount} Kekse** — **Verloren!**\nNeuer Kontostand: **${userData.balance} Kekse**`,
        )
        .setColor(0x333333);
    if (cashedAt !== null) {
      const win = Math.floor(betAmount * cashedAt);
      return new EmbedBuilder()
        .setTitle("💰 Cash Out!")
        .setDescription(
          `Ausgecasht bei **${cashedAt.toFixed(2)}x**!\n\nGewinn: **+${win - betAmount} Kekse**\nNeuer Kontostand: **${userData.balance + win} Kekse**`,
        )
        .setColor(0x333333);
    }
    return new EmbedBuilder()
      .setTitle("Crash")
      .setDescription(
        `**${multiplier.toFixed(2)}x** — Steigt noch…\n\nEinsatz: **${betAmount} Kekse**\nMöglicher Gewinn: **${Math.floor(betAmount * multiplier)} Kekse**\n\nDrücke **Cash Out** bevor die Rakete crasht!`,
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
      await i.reply({
        content: "Zu spät — das Spiel ist bereits beendet!",
        flags: [MessageFlags.Ephemeral],
      }).catch(() => {});
      return;
    }

    game.cashedOut = true;
    game.cashedAtMultiplier = multiplier;
    if (intervalHandle) clearInterval(intervalHandle);
    crashGames.delete(user.id);
    collector.stop("cashout");

    const win = Math.floor(betAmount * game.cashedAtMultiplier);
    userData.balance += win;
    await logTransaction(user.id, win, "plus", "Casino Crash");
    await setEcoData(user.id, userData);

    await i.update({
      embeds: [crashEmbed(false, game.cashedAtMultiplier)],
      components: [],
    }).catch(() => {});
  });

  intervalHandle = setInterval(async () => {
    const game = crashGames.get(user.id);
    if (!game) {
      clearInterval(intervalHandle);
      return;
    }

    multiplier = parseFloat((multiplier + 0.08).toFixed(2));

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
  }, 600);

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

        userData.balance -= betAmount;
        await logTransaction(
          user.id,
          betAmount,
          "minus",
          "Casino Higher Lower",
        );
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
              .setLabel(
                `Cash Out (${Math.floor(betAmount * multiplier)} Kekse)`,
              )
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
            await logTransaction(
              user.id,
              betAmount,
              "minus",
              "Casino Blackjack",
            );
          } else if (dScore > 21) {
            status = "🎉 Dealer überkauft! Du gewinnst!";
            userData.balance += betAmount;
            await logTransaction(
              user.id,
              betAmount,
              "plus",
              "Casino Blackjack",
            );
          } else if (pScore > dScore) {
            status = "🎉 Mehr Punkte als der Dealer. Du gewinnst!";
            userData.balance += betAmount;
            await logTransaction(
              user.id,
              betAmount,
              "plus",
              "Casino Blackjack",
            );
          } else if (pScore < dScore) {
            status = "❌ Dealer hat mehr Punkte. Verloren!";
            userData.balance -= betAmount;
            await logTransaction(
              user.id,
              betAmount,
              "minus",
              "Casino Blackjack",
            );
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
      const hasEcoRole = member.roles.cache.has("1506732560837771284");

      if (subCommand === "create") {
        if (hasEcoRole) {
          return interaction.reply({ content: "Du besitzt bereits ein registriertes Bankkonto.", flags: [MessageFlags.Ephemeral] });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`open_bank_modal_${user.id}`)
            .setLabel("Registrierungsformular öffnen")
            .setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({
          content: "Klicke auf den Button unten, um dein Konto zu erstellen. Dieser Button funktioniert nur für dich.",
          components: [row],
          flags: [MessageFlags.Ephemeral]
        });
        console.log(`${user.username} hat eine Konto-Erstellung gestartet`)
      }

      if (subCommand === "help") {
        const helpEmbed = new EmbedBuilder()
          .setTitle("🏦 Bank-System Hilfe")
          .setColor(0xFFFFFF)
          .setDescription("Hier findest du alle verfügbaren Befehle:")
          .addFields(
            { name: "`/bank create`", value: "Erstellt dein persönliches Bankkonto (Erfordert Minecraft-Namen)." },
            { name: "`/bank status`", value: "Zeigt dir deinen aktuellen Kontostand (Privat für dich)." },
            { name: "`/bank pay`", value: "Überträgt Kekse sicher auf das Konto eines Mitspielers." }
          );

        return interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
        console.log(`${user.username} hat die "bank help"-Funktion genutzt`)
      }

      if (subCommand === "pay") {
        const targetUser = options.getUser("nutzer");
        const amount = options.getInteger("anzahl");
        const userData = await getEcoData(user.id);

        if (amount <= 0) {
          return interaction.reply({ content: "Bitte gib eine gültige Anzahl an Keksen an.", flags: [MessageFlags.Ephemeral] });
        }

        if (targetUser.id === user.id) {
          return interaction.reply({ content: "Du kannst dir selbst keine Kekse überweisen.", flags: [MessageFlags.Ephemeral] });
        }

        if (amount > (userData.balance || 0)) {
          return interaction.reply({ content: "Du hast nicht genug Kekse für diese Überweisung.", flags: [MessageFlags.Ephemeral] });
        }

        const targetData = await getEcoData(targetUser.id);
        if (!targetData || targetData.blocked) {
          return interaction.reply({ content: "Der Zielnutzer hat kein aktives Konto oder ist gesperrt.", flags: [MessageFlags.Ephemeral] });
        }

        userData.balance -= amount;
        targetData.balance = (targetData.balance || 0) + amount;
        
        await logTransaction(user.id, amount, "minus", `Pay an ${targetData.username}`);
        await logTransaction(targetUser.id, amount, "plus", `Pay von ${userData.username}`);
        await setEcoData(user.id, userData);
        await setEcoData(targetUser.id, targetData);

        console.log(`[Economy] Überweisung von ${userData.username || user.username} an ${targetData.username || targetUser.id} für ${amount} Kekse.`);

        const payEmbed = new EmbedBuilder()
          .setTitle("Überweisung erfolgreich")
          .setDescription(`Du hast **${amount} Kekse** an <@${targetUser.id}> überwiesen.`)
          .addFields({ name: "Neuer Kontostand", value: `${userData.balance} Kekse` })
          .setColor(0xFFFFFF);

        const getEmbed = new EmbedBuilder()
          .setTitle("Kekse erhalten!")
          .setDescription(`Du hast **${amount} Kekse** von <@${user.id}> erhalten.`)
          .addFields({ name: "Neuer Kontostand", value: `${targetData.balance} Kekse` })
          .setColor(0xFFFFFF);

        await interaction.reply({ embeds: [payEmbed], flags: [MessageFlags.Ephemeral] });

        await targetUser.send({ embeds: [getEmbed] }).catch(() => {
          console.log(`Konnte keine DM an ${targetUser.id} senden.`);
        });
        return;
      }

      if (subCommand === "status") {
        if (!hasEcoRole) {
          return interaction.reply({ content: "Du hast noch kein Konto. Nutze `/bank create`, um dich zu registrieren.", flags: [MessageFlags.Ephemeral] });
        }

        const userData = await getEcoData(user.id);

        if (userData.blocked) {
          return interaction.reply({ content: "Dein Konto ist aktuell gesperrt. Bitte wende dich an den Support.", flags: [MessageFlags.Ephemeral] });
        }

        await user.send({ content: `Dein aktueller Kontostand beträgt: **${userData.balance || 0} Kekse** 🍪` }).catch(() => {});
        return interaction.reply({ content: "✅ Dein aktueller Kontostand wurde dir per DM zugestellt.", flags: [MessageFlags.Ephemeral] });
        console.log(`${user.username} hat seinen Kontostand eingesehen.`)
      }
    }

    if (commandName === "bank-admin") {
      const subCommand = options.getSubcommand();
      const isDev = user.id === "1151971830983311441";

      if (!member.permissions.has(PermissionsBitField.Flags.ManageServer) && !isDev) {
        return interaction.reply({ content: "❌ Dieser Befehl ist der Serverleitung vorbehalten.", flags: [MessageFlags.Ephemeral] });
      }

      const amount = options.getInteger("anzahl");
      const targetUser = options.getUser("nutzer") || user;

      if (amount <= 0) {
        return interaction.reply({ content: "Bitte gib eine gültige Anzahl an Keksen an.", flags: [MessageFlags.Ephemeral] });
      }

      const targetData = await getEcoData(targetUser.id);
      let currentBalance = targetData.balance || 0;

      if (subCommand === "add") {
        currentBalance += amount;
        console.log(`${user.username} hat sich ${amount} Kekse hinzugefügt`)
      } else if (subCommand === "remove") {
        currentBalance = Math.max(0, currentBalance - amount);
        console.log(`${user.username} hat sich ${amount} Kekse entfernt`)
      }

      targetData.balance = currentBalance;
      await setEcoData(targetUser.id, targetData);

      const logEmbed = new EmbedBuilder()
        .setTitle("Konto-Aktualisierung")
        .setDescription(`Konto von <@${targetUser.id}> wurde aktualisiert.`)
        .addFields(
          { name: "Aktion", value: subCommand === "add" ? `+${amount} Kekse` : `-${amount} Kekse` },
          { name: "Neuer Kontostand", value: `${currentBalance} Kekse` }
        )
        .setColor(0xFFFFFF);

      await user.send({ embeds: [logEmbed] }).catch(() => {});
      return interaction.reply({ content: `✅ Das Konto von <@${targetUser.id}> wurde erfolgreich modifiziert.`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === "bank-mod") {
      const subCommand = options.getSubcommand();
      const isDev = user.id === "1151971830983311441";

      if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages) && !member.permissions.has(PermissionsBitField.Flags.ManageServer) && !isDev) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung, um Kontoinformationen einzusehen.", flags: [MessageFlags.Ephemeral] });
      }

      if (subCommand === "see") {
        const targetUser = options.getUser("nutzer");
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

        await user.send({ embeds: [dmEmbed] }).catch(() => {});
        return interaction.reply({ content: `✅ Die Kontodetails von ${targetUser.username} wurden dir per DM zugestellt.`, flags: [MessageFlags.Ephemeral] });
        console.log(`${user.username} hat den Kontostand von ${targetUser.username} eingesehen`)
      }

      if (subCommand === "get") {
        const existingKekse = await initEconomyGetKekse(client);
        return interaction.reply({ content: `Es sind aktuell ${existingKekse} Kekse im Umlauf.`, flags: [MessageFlags.Ephemeral] });
        console.log(`${user.username} hat die "bank get"-Funktion genutzt`)
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
        console.log(`${user.username} hat einen Reminder für sich gestartet`)

        await interaction.reply({
          content: `✅ Ich werde dich in **${timeStr}** an folgendes erinnern: ${reason}`,
          ephemeral: false,
        });

        const logChannel = client.channels.cache.get(logChannelId);
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
            .setFooter({ text: "Kekse Clan | Reminder System" })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }

        globalBotStats.commandsRunned += 1;
      }
          if (commandName === "zweitaccount") {
      if (!member.roles.cache.has(TEAM_ROLE_ID) && !member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({ content: "❌ Keine Berechtigung.", flags: [MessageFlags.Ephemeral] });
      }

      const subCommand = options.getSubcommand();
      let networks = await getSaData("alt_networks") || {};

      if (subCommand === "add") {
        const input1 = options.getString("account_1").replace(/[<@!>]/g, "");
        const input2 = options.getString("account_2").replace(/[<@!>]/g, "");

        if (!/^\d{17,20}$/.test(input1) || !/^\d{17,20}$/.test(input2)) {
          return interaction.reply({ content: "❌ Ungültige IDs oder Erwähnungen angegeben.", flags: [MessageFlags.Ephemeral] });
        }

        if (input1 === input2) {
          return interaction.reply({ content: "❌ Ein Account kann nicht mit sich selbst verknüpft werden.", flags: [MessageFlags.Ephemeral] });
        }

        let list1 = networks[input1] || [];
        let list2 = networks[input2] || [];

        let allLinked = new Set([input1, input2, ...list1, ...list2]);
        const finalGroup = Array.from(allLinked);

        for (const id of finalGroup) {
          networks[id] = finalGroup.filter(uid => uid !== id);
        }

        await setSaData("alt_networks", networks);

        await interaction.reply({ content: `✅ Die Accounts <@${input1}> und <@${input2}> wurden erfolgreich verknüpft.`, flags: [MessageFlags.Ephemeral] });
        
        const logChannel = client.channels.cache.get(logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor('#ffffff')
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 512 }) })
            .setDescription(`**Aktion:** \`Zweitaccount verknüpft\`\n**Accounts:** <@${input1}> und <@${input2}>\n**Gruppe Gesamt:** ${finalGroup.map(uid => `<@${uid}>`).join(', ')}`)
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
        console.log(`${user.username} hat einen Zweitaccount verifiziert`)
        globalBotStats.commandsRunned += 1;
      }

      if (subCommand === "remove") {
        const targetId = options.getString("nutzer").replace(/[<@!>]/g, "");

        if (!/^\d{17,20}$/.test(targetId)) {
          return interaction.reply({ content: "❌ Ungültige ID oder Erwähnung angegeben.", flags: [MessageFlags.Ephemeral] });
        }

        const linkedWith = networks[targetId];
        if (!linkedWith || linkedWith.length === 0) {
          return interaction.reply({ content: "❌ Für diesen Account existieren keine Verknüpfungen.", flags: [MessageFlags.Ephemeral] });
        }

        const fullGroup = [targetId, ...linkedWith];
        delete networks[targetId];

        for (const id of linkedWith) {
          if (networks[id]) {
            networks[id] = networks[id].filter(uid => uid !== targetId);
            if (networks[id].length === 0) {
              delete networks[id];
            }
          }
        }

        await setSaData("alt_networks", networks);

        await interaction.reply({ content: `✅ Der Account <@${targetId}> wurde aus dem Netzwerk gelöst.`, flags: [MessageFlags.Ephemeral] });
        
        const logChannel = client.channels.cache.get(logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor('#ffffff')
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ size: 512 }) })
            .setDescription(`**Aktion:** \`Zweitaccount entfernt\`\n**Account:** <@${targetId}>\n**Vorherige Gruppe:** ${fullGroup.map(uid => `<@${uid}>`).join(', ')}`)
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
        console.log(`${user.username} hat einen Zweitaccount entfernt`)
        globalBotStats.commandsRunned += 1;
      }
    }
        const ROLE_VIP = "1434555291252297728";
    const ROLE_MEMBER = "1506732560837771284";
    const ROLE_TEAM = TEAM_ROLE_ID;
    const ROLE_ADMIN = ADMIN_ROLE_ID;
    const DEV_ID = "1151971830983311441";

    if (commandName === "promote" || commandName === "demote") {
      const targetUser = options.getUser("nutzer");
      
      try {
        const targetMember = await guild.members.fetch(targetUser.id);
        const executorMember = member;

        const isDev = executorMember.id === DEV_ID;
        const isAdmin = executorMember.roles.cache.has(ROLE_ADMIN);
        const isTeam = executorMember.roles.cache.has(ROLE_TEAM);
        const isMember = executorMember.roles.cache.has(ROLE_MEMBER);

        if (!isMember && !isTeam && !isAdmin && !isDev) {
          return interaction.reply({ content: "❌ Du hast keine Berechtigung, das Rangänderungs-System zu nutzen.", flags: [MessageFlags.Ephemeral] });
        }

        const targetHasAdmin = targetMember.roles.cache.has(ROLE_ADMIN);
        const targetHasTeam = targetMember.roles.cache.has(ROLE_TEAM);
        const targetHasMember = targetMember.roles.cache.has(ROLE_MEMBER);
        const targetHasVip = targetMember.roles.cache.has(ROLE_VIP);

        if (commandName === "promote") {
          if (!targetHasVip && !targetHasMember && !targetHasTeam && !targetHasAdmin) {
            await targetMember.roles.add(ROLE_VIP);
            console.log(`[Promote] ${user.username} hat ${targetUser.username} zu VIP befördert.`);
            await interaction.reply({ content: `✅ <@${targetUser.id}> wurde erfolgreich zum **VIP** befördert.` });
            await sendKekseLog("Promote", targetUser.toString(), "Rang auf **VIP** erhöht.");
            globalBotStats.commandsRunned += 1;
            return;
          }

          if (targetHasVip && !targetHasMember && !targetHasTeam && !targetHasAdmin) {
            if (!isTeam && !isAdmin && !isDev) {
              return interaction.reply({ content: "❌ Nur Teammitglieder oder höher können zum Mitglied befördern.", flags: [MessageFlags.Ephemeral] });
            }
            await targetMember.roles.add(ROLE_MEMBER);
            console.log(`[Promote] ${user.username} hat ${targetUser.username} zum Mitglied befördert.`);
            await interaction.reply({ content: `✅ <@${targetUser.id}> wurde erfolgreich zum **Mitglied** befördert.` });
            await sendKekseLog("Promote", targetUser.toString(), "Rang auf **Mitglied** erhöht.");
            globalBotStats.commandsRunned += 1;
            return;
          }

          if (targetHasMember && !targetHasTeam && !targetHasAdmin) {
            if (!isAdmin && !isDev) {
              return interaction.reply({ content: "❌ Nur Admins oder Entwickler können zum Teammitglied befördern.", flags: [MessageFlags.Ephemeral] });
            }
            await targetMember.roles.add(ROLE_TEAM);
            console.log(`[Promote] ${user.username} hat ${targetUser.username} zum Teammitglied befördert.`);
            await interaction.reply({ content: `✅ <@${targetUser.id}> wurde erfolgreich zum **Teammitglied** befördert.` });
            await sendKekseLog("Promote", targetUser.toString(), "Rang auf **Teammitglied** erhöht.");
            globalBotStats.commandsRunned += 1;
            return;
          }

          if (targetHasTeam && !targetHasAdmin) {
            if (!isDev) {
              return interaction.reply({ content: "❌ Nur der Entwickler kann zum Admin befördern.", flags: [MessageFlags.Ephemeral] });
            }
            await targetMember.roles.add(ROLE_ADMIN);
            console.log(`[Promote] ${user.username} hat ${targetUser.username} zum Admin befördert.`);
            await interaction.reply({ content: `✅ <@${targetUser.id}> wurde erfolgreich zum **Admin** befördert.` });
            await sendKekseLog("Promote", targetUser.toString(), "Rang auf **Admin** erhöht.");
            globalBotStats.commandsRunned += 1;
            return;
          }

          return interaction.reply({ content: "❌ Dieser Nutzer hat bereits den höchsten beförderbaren Rang.", flags: [MessageFlags.Ephemeral] });
        }

        if (commandName === "demote") {
          if (targetHasAdmin) {
            if (!isDev) {
              return interaction.reply({ content: "❌ Nur der Entwickler darf Admins degradieren.", flags: [MessageFlags.Ephemeral] });
            }
            await targetMember.roles.remove(ROLE_ADMIN);
            console.log(`[Demote] ${user.username} hat Admin ${targetUser.username} degradiert.`);
            await interaction.reply({ content: `⚠️ <@${targetUser.id}> wurde vom **Admin** zum **Teammitglied** degradiert.` });
            await sendKekseLog("Demote", targetUser.toString(), "Vom **Admin** herabgestuft.");
            globalBotStats.commandsRunned += 1;
            return;
          }

          if (targetHasTeam) {
            if (!isDev) {
              return interaction.reply({ content: "❌ Nur der Entwickler darf Teammitglieder degradieren.", flags: [MessageFlags.Ephemeral] });
            }
            await targetMember.roles.remove(ROLE_TEAM);
            console.log(`[Demote] ${user.username} hat Teammitglied ${targetUser.username} degradiert.`);
            await interaction.reply({ content: `⚠️ <@${targetUser.id}> wurde vom **Teammitglied** zum **Mitglied** degradiert.` });
            await sendKekseLog("Demote", targetUser.toString(), "Vom **Teammitglied** herabgestuft.");
            globalBotStats.commandsRunned += 1;
            return;
          }

          if (targetHasMember) {
            if (!isAdmin && !isDev) {
              return interaction.reply({ content: "❌ Nur Admins dürfen reguläre Mitglieder degradieren.", flags: [MessageFlags.Ephemeral] });
            }
            await targetMember.roles.remove(ROLE_MEMBER);
            console.log(`[Demote] ${user.username} hat Mitglied ${targetUser.username} degradiert.`);
            await interaction.reply({ content: `⚠️ <@${targetUser.id}> wurde vom **Mitglied** zum **VIP** degradiert.` });
            await sendKekseLog("Demote", targetUser.toString(), "Vom **Mitglied** herabgestuft.");
            globalBotStats.commandsRunned += 1;
            return;
          }

          if (targetHasVip) {
            await targetMember.roles.remove(ROLE_VIP);
            console.log(`[Demote] ${user.username} hat VIP ${targetUser.username} degradiert.`);
            await interaction.reply({ content: `⚠️ <@${targetUser.id}> hat den **VIP** Status verloren.` });
            await sendKekseLog("Demote", targetUser.toString(), "Vom **VIP** herabgestuft.");
            globalBotStats.commandsRunned += 1;
            return;
          }

          return interaction.reply({ content: "❌ Dieser Nutzer hat keinen Rang, der herabgestuft werden kann.", flags: [MessageFlags.Ephemeral] });
        }

      } catch (err) {
        return interaction.reply({ content: "❌ Der Nutzer konnte nicht auf dem Server gefunden werden oder der Bot hat nicht genügend Rechte, um seine Rollen anzupassen.", flags: [MessageFlags.Ephemeral] });
      }
    }
  });
client.once("clientReady", async () => {
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
    initRules(client);
    initAuditLogs(client);
    clear(client);
    warning(client);
    initModSend(client);
    await violations(client);
    await initDashboard(app, client, globalBotStats);
    await initScammProtection(client);
    await initTicketArchive(app, getTickData, setTickData);
    await initEconomySystem(client);
    initAdminFun(client);
    await syncExistingUsers(client);
    await initInviteTracker(client);
    startVoiceXpTracker(client);
    client.user.setPresence({
      activities: [{ name: "!help", type: 0 }],
      status: "online",
    });
    const guild = client.guilds.cache.get("1423413347168157718");
    console.log(`Server-Sync gestartet...`)
    console.log(`Bot online: ${client.user.tag}`);
    await startStorages();
  } catch (err) {
    console.error("[Ready] Kritischer Fehler beim Initialisieren:", err);
  }
});
app.get("/api/stats_internal", (req, res) => {
  const totalSeconds = client.uptime / 1000;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = Math.floor(totalSeconds % 60);
  res.json({
    uptime: days + "d " + hours + "h " + minutes + "m " + seconds + "s",
    ping: Math.round(client.ws.ping),
    guilds: client.guilds.cache.size,
    members: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0),
  });
});
client.setMaxListeners(50);
client.on("error", console.error);
client.on("warn", console.warn);
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('🍃 MongoDB verbunden!');
    await startStorages();
    await deploySlashCommands();
    client.login(process.env.BOT_TOKEN);
  })
  .catch(err => console.error('❌ MongoDB Fehler:', err));
