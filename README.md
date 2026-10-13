# Argus

**Argus** is a self-hosted Discord OSINT and intelligence assistant for reconnaissance, investigation, enrichment, analysis, and security workflows.

Built and maintained by **ẞ€ÑZ¥**.

---

## ✦ What is Argus?

Argus brings practical open-source intelligence tooling into Discord through slash commands.

It is focused on:

- 🌐 Web and domain reconnaissance
- 🕵️ Identity and username research
- 🛰️ Transport intelligence
- 🧬 File, metadata, and blockchain analysis
- 🤖 AI-assisted analysis
- 🛡️ Security and monitoring utilities

The command surface is intentionally focused. Unneeded teaching/learning scaffolding is not part of the active command guide.

---

## 🚀 Quick Start

### Requirements

- Node.js 20+
- A Discord application and bot token
- Git

### Install

```bash
git clone https://github.com/Benzyplug/Argus.git
cd Argus
npm install
copy .env.example .env
```

Configure:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

Register the commands:

```bash
npm run deploy
```

Start Argus:

```bash
npm start
```

---

## ⌘ Command Surface

Argus currently exposes **32 focused slash commands** through an interactive `/help` command with category filtering and command search.

### 🎖 Rankings

- `/bot`

### 🌐 Web Intelligence

- `/dns`
- `/dork`
- `/extract-links`
- `/favicon`
- `/host-lookup`
- `/link-check`
- `/redirect-check`
- `/web-recon`
- `/whois`

### 🕵️ OSINT & Identity

- `/company-search`
- `/google-investigate`
- `/maigret`
- `/nike`
- `/sherlock`
- `/username-gen`

### 🛰️ Transport

- `/airport`
- `/flight`
- `/flight-number`
- `/vehicle`
- `/vessel`

### 🧬 Files & Data

- `/blockchain`
- `/crypto-detect`
- `/doc-meta`
- `/exif`
- `/upload`

### 🤖 AI & Utilities

- `/ai`
- `/health`
- `/image-ai`
- `/jwt`
- `/monitor`
- `/nuclei-scan`

`/help` also provides a category dropdown and a **Find a command…** modal.

---

## 🤖 AI

The `/ai` command provides AI-assisted workflows. Available capabilities depend on the configured provider.

---

## 🔧 Configuration

Copy `.env.example` to `.env`.

**Never commit secrets or API keys to the repository.**

Optional integrations currently supported include:

- DNSDumpster
- Whoxy
- Host.io
- AviationStack
- AirportDB
- Pappers
- 1min.ai
- VirusTotal
- Etherscan
- BscScan
- PolygonScan
- AWS Rekognition

Optional external tools include:

- Sherlock
- Maigret
- Nuclei
- ExifTool
- GHunt
- Linkook
- xeuledoc
- jwt_tool

Optional integrations should fail gracefully when unavailable instead of preventing Argus from starting.

---

## 🛡️ Security

Argus is intended for legitimate OSINT research, authorized security testing, investigation, and educational use.

Users are responsible for complying with applicable laws, platform rules, and authorization requirements.

See [SECURITY.md](SECURITY.md) for the project's security model.

---

## 🧪 Development

Run:

```bash
npm test
npm run lint
npm run smoke
npm run dev
```

After changing commands:

```bash
npm run deploy
```

For a clean guild registration:

```bash
npm run clear
npm run deploy
```

---

## 📦 Deployment

Argus is designed to run as a persistent Discord bot process.

Typical settings:

- **Runtime:** Node.js 20+
- **Install:** `npm install`
- **Start:** `npm start`

Environment variables should be configured through the hosting provider rather than committed to Git.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**⌬ ARGUS • v2.3.0 • BY ẞ€ÑZ¥**

*Open-source intelligence, organized for Discord.*

</div>
