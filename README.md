# Kekse Clan Security and Management System

This repository contains the source code for an advanced, multi-functional Discord management bot built with discord.js v14. The system is designed to provide comprehensive server automation, ranging from security and moderation to community engagement and utility features.

## Core Module Overview

### 1. Automated Security and Data Protection
* **Sensitive Data Redaction:** Monitors and removes email addresses, software license keys, gift card codes, and authentication tokens in real-time.
* **Automated Violation System:** Tracks security breaches per user and automatically applies tiered timeouts once specific thresholds are reached.
* **Member Verification:** Includes a button-based verification system to gate server access and manage member roles.

### 2. Moderation and Administrative Tools
* **Advanced Message Purging:** A high-precision clear command supporting filters for specific users and timeframes, including a custom handler for messages older than 14 days.
* **Comprehensive Sanctioning:** Includes warning, timeout, kick, and ban modules. Sanctions are automatically linked to a predefined rule map to provide users with specific regulatory excerpts.
* **Detailed Audit Logging:** Tracks and logs message updates, deletions, voice state changes, role modifications, and administrative audit log entries.

### 3. Support and Communication
* **Forum-Based Support Tickets:** Bridges user DMs to dedicated forum threads, allowing staff to manage support inquiries through a centralized interface.
* **Direct Messaging System:** Enables staff to send official notifications and warnings directly to users through the bot's interface.

### 4. Community Engagement and Utilities
* **Polling System:** Provides a dedicated module for creating and managing community polls to gather member feedback.
* **Giveaway Management:** Provides a framework for hosting and tracking server giveaways, including eligibility checks.
* **Invite Tracking and Analytics:** Maintains a detailed database of server invitations, including a public leaderboard and fake-invite detection.
* **Counting Module:** Includes specialized counting game logic to enhance member interaction in designated channels.
* **Reminder System:** Allows users or staff to set and manage time-based reminders stored within the internal database.
* **Temporal Voice Channels:** Logic for managing dynamic voice environments based on user activity.
* **Network Utility:** Integrated ping and system status commands to monitor bot latency and host performance.

### 5. Statistics and Activity Tracking
* **Message and Voice Analytics:** Monitors and records message volume and time spent in voice channels per user for engagement reporting.

## Technical Architecture

### Message-Based Storage Persistence
The system utilizes a Discord-native storage architecture. Data is serialized into JSON format and maintained within the descriptions of specific messages in hidden administrative channels. This approach eliminates the dependency on external SQL or NoSQL databases while ensuring data persistence.

### Infrastructure and Deployment
* **Express Web Integration:** A built-in Express server handles static file serving and ensures the bot remains active on cloud hosting platforms.
* **Event-Driven Design:** Leverages the full range of Discord Gateway intents to ensure reactive performance across all server activities.

## Configuration and Setup

1. **Environment Configuration:** A .env file is required to store the Discord bot token and the service port.
2. **Dependency Management:** All required packages, including discord.js, dotenv, and express, must be installed via the standard package manager.
3. **Privileged Intents:** The bot requires the Guild Members, Message Content, and Guild Presences intents to be enabled in the Discord Developer Portal.
