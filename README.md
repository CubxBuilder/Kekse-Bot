# <img src="icon.png" align="center" width="40" height="40" alt="Kekse-Bot Icon"> Kekse-Bot

Der **Kekse-Bot** ist ein maßgeschneidertes, funktionsreiches Discord.js-Bot-System (v14), das speziell für den Minecraft-Clan **Keksegang** (auf MineVale) entwickelt wurde. Es kombiniert ein tiefgehendes Wirtschafts- und Casino-System mit einem sicheren, administrativen Web-Dashboard inklusive Progressive Web App (PWA) Unterstützung.

---

## 🚀 Kernfunktionen

### 1. 🏦 Bank- & Wirtschaftssystem
* **Minecraft-Verknüpfung**: Spieler können über ein Formular (`!bank create`) ihre Discord-ID mit ihrem Minecraft-Namen koppeln.
* **Tägliche Belohnungen**: Integriertes Abhol-System im `#Daily`-Kanal mit interaktiven Knöpfen. Clan-Mitglieder erhalten automatisch den doppelten Bonus.
* **Dynamischer Wechselkurs**: Automatische Echtzeit-Berechnung des Keks-Wertes auf Basis der im Umlauf befindlichen Kekse und des Bot-Guthabens.

### 🎲 2. Keks-Casino & Server-Shop
* **Vielfältige Minispiele**: Vollautomatische Spiele wie *Blackjack*, *Roulette*, *Coinflip*, *Crash (Rakete)*, *Higher/Lower* und ein zeitgesteuerter, globaler *Jackpot*.
* **Interaktive UI**: Spiele werden komplett über Discord-Buttons und Auswahlmenüs gesteuert.
* **Clan-Shop**: Erlaubt den Tausch von Keksen gegen Spiel-Puffer (für den `#Keks-Counter`), XP-Booster oder erhöhte Giveaway-Chancen.

### 📩 3. Ticket-System & Krypto-Archivierung
* **Automatische Transkripte**: Beim Schließen eines Support-Tickets werden alle Nachrichten, Avatare, Anhänge und Sticker chronologisch ausgelesen.
* **Sichere Web-Archivierung**: Generierung eines kryptografisch sicheren 8-Byte-Tokens für den Web-Aufruf. Der Discord-Kanal wird nach 2 Sekunden automatisch gelöscht.

### 🎛️ 4. PWA Admin-Dashboard
* **Echtzeit-Überwachung**: Überwacht den WebSocket-Ping (inkl. 24h-Historie in einem Chart.js-Diagramm) und spiegelt Konsolen-Logs live ins Web-Frontend.
* **Konten-Datenbank**: Filtern, Suchen und Sortieren aller Spielerkonten. Admins können Guthaben modifizieren oder Konten blockieren.
* **Sicherer Login**: Abgesicherter Admin-Bereich mit SHA-256 Passwort-Überprüfung und einer mathematischen Mensch-Abfrage (Captcha).

---

## 🛠️ Tech-Stack

* **Backend**: Node.js (ESM, `>=18.0.0`), Discord.js v14, Express (HTTPS/SSL-Integration via Let's Encrypt)
* **Datenbank**: MongoDB (via Mongoose)
* **Frontend**: HTML5, CSS3 (Grid/Flexbox, Dark-Theme), Vanilla JavaScript, Chart.js v4
* **Echtzeit & Performance**: Socket.io, Sharp (Bildverarbeitung), Service Worker (Offline-Caching)

---

## 📂 Projektstruktur

```text
├── public/
│   │   
│   └── admin/
│   │    └── login/
│   │        └── index.html       # Admin-Login mit Captcha und SHA-256 Logik
│   ├── index.html                # Das Admin-Dashboard Frontend
│   ├── sw.js                     # Service Worker für PWA Offline-Caching
│   ├── dashboard-manifest.json   # PWA App-Manifest
│   ├── 404.html                  # Fehlerseite: Nicht gefunden
│   ├── /permission
│   │    └── index.html           # Fehlerseite: Keine Berechtigung
│   ├── err612/
│   │    └── index.html           # Fehlerseite: Überprüfungsfehler
│   └── err605/
│        └── index.html           # Fehlerseite: Token inkorrekt
├── app.js                        # Der Hauptcode des Bots (Express, Discord-Events, Casino)
├── database.js                   # MongoDB Verbindungs-Layer (dbGet / dbSet)
├── package.json                  # Projektabhängigkeiten und Start-Skripte
├── icon.png                      # Projekt-Icon (Logo)
├── blobfish.jpg                  # Bild für !blob Funktion
├── sandkorn.png                  # Bild für !sand Funktion
├── strand.jpg                    # Bild für !sandkron Funktion
└── verify.png                    # Bild für Verify Funktion
```

---

## ⚙️ Installation & Setup

### 1. Voraussetzungen
Stelle sicher, dass du folgende Software installiert hast:
* **Node.js** (Version 18.0.0 oder höher)
* **MongoDB** (Lokal oder als Atlas-Cluster)
* Ein gültiges **SSL-Zertifikat** von Let's Encrypt im Verzeichnis `/etc/letsencrypt/live/kekse-bot.dedyn.io/` (für den HTTPS Express-Server).

### 2. Repository klonen & Abhängigkeiten installieren
```bash
git clone https://github.com
cd kekse-clan-bot
npm install
```

### 3. Umgebungsvariablen einrichten
Erstelle eine `.env`-Datei im Hauptverzeichnis des Projekts und trage deine Daten ein:
```env
# Discord Bot Konfiguration
DISCORD_TOKEN=dein_discord_bot_token

# Datenbank Konfiguration
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/KekseStorage

# Webserver Einstellungen
PORT=5000
ADMIN_PASSWORD=dein_sicheres_admin_passwort
```

---

## 🚀 Anwendung starten

Um den Bot und das Dashboard im Produktionsmodus zu starten, verwende:
```bash
npm start
```
Der Bot verbindet sich anschließend mit Discord und der Webserver öffnet den Port `5000` via HTTPS.

---

## 👑 Wichtige administrative IDs (Hardcoded)
* **Team-Rolle**: `1457906448234319922` (Erforderlich für Admin-Befehle wie `!balance` oder `!bank see`).
* **Inhaber-ID**: `1151971830983311441` (Exklusiver Zugriff auf `!daily_setup` und `!shop_setup`).
* **Shop-Kanal**: `1508053328662364302` (Zielkanal für die interaktiven Shop-Buttons).

---

## 📄 Lizenz

Dieses Projekt ist proprietär. Alle Rechte vorbehalten (Kekse Clan / Keksegang). Die Nutzung, Vervielfältigung oder Modifikation ohne ausdrückliche Erlaubnis der Clan-Leitung ist nicht gestattet.
