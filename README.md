# Argus

**Argus** is a self-hosted Discord OSINT and intelligence assistant for reconnaissance, investigation, enrichment, analysis, and security workflows.

Built and maintained by **ẞ€ÑZ¥**.

---

## ✦ What is Argus?

Argus brings practical open-source intelligence tooling into Discord through slash commands.

It is designed around:

- 🌐 Web and domain reconnaissance
- 🔎 Username and identity research
- 📧 Email intelligence
- 🛰️ Network and infrastructure analysis
- 🚢 Aviation, airport, vehicle, and vessel lookups
- 🖼️ Image and document metadata analysis
- ⛓️ Blockchain investigation
- 🤖 AI-assisted analysis
- 🛡️ Security and monitoring utilities

Argus is modular, so integrations can be enabled or disabled without preventing the bot from starting.

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

Configure the required values in `.env`:

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

For global command registration:

```bash
npm run deploy:global
```

---

## ⌘ Command Surface

Argus currently contains **42 command modules**. Some modules expose a different slash-command name or group multiple operations under one command.

### Core

- `/help` — Interactive command center
- `/bot` — Bot information
- `/owner` — Project/owner information
- `/health` — Runtime and integration health

### Web & Recon

- `/dns` — DNS and domain intelligence
- `/dork` — Search-engine dork generation
- `/host-lookup` — Host.io intelligence
- `/web-recon` — Web reconnaissance
- `/link-check` — URL/link analysis
- `/redirect-check` — Redirect-chain inspection
- `/extract-links` — Extract links from a webpage
- `/favicon` — Favicon intelligence
- `/subdomain-enum` — Subdomain enumeration
- `/cert-search` — Certificate/CT-log search
- `/wayback-history` — Wayback history
- `/web-tech` — Web technology detection
- `/ip-info` — IP information
- `/ip-reputation` — IP reputation
- `/shodan-lookup` — Shodan lookup
- `/whoxy` — WHOIS/domain intelligence

### Identity & OSINT

- `/company-search` — Company intelligence
- `/email-footprint` — Email footprint analysis
- `/email-breach` — Email breach intelligence
- `/maigret` — Username investigation
- `/sherlock` — Username investigation across supported platforms
- `/google-investigate` — Google/GHunt investigation
- `/username-gen` — Username generation
- `/nike` — Nike investigation workflow
- `/avatar-search` — Avatar/image search

### Transport

- `/airport` — Airport intelligence
- `/flight` — Flight and aviation intelligence
- `/vehicle` — Vehicle/VIN intelligence
- `/vessel` — Maritime and vessel intelligence

Transport functionality is consolidated under the relevant commands rather than creating unnecessary top-level vehicle or flight commands.

### Files & Data

- `/exif` — Image metadata extraction
- `/doc-meta` — Document metadata
- `/upload` — Asset upload
- `/blockchain` — Blockchain/address investigation
- `/crypto-detect` — Cryptocurrency address detection

### AI & Security

- `/ai` — AI-assisted analysis and utilities
- `/jwt` — JWT analysis
- `/monitor` — Monitoring and alert workflows
- `/nuclei-scan` — Nuclei-based security scanning
- `/image-ai` — Image analysis with supported AI services

> Temporary learning, teaching, progression, and duplicate command scaffolding has been removed. The command surface is intentionally kept focused.

---

## 🤖 AI

The `/ai` command provides AI-assisted workflows such as:

- General assistance
- Coding
- Structured analysis
- Transcription
- Conversation reset

Available AI capabilities depend on the configured provider.

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

The project includes protections such as:

- Input validation
- Permission checks
- Rate limiting
- SSRF protections
- Controlled external-process execution
- Secret redaction in logs

See [SECURITY.md](SECURITY.md) for the project's security model.

---

## 🧪 Development

Run the available development checks with:

```bash
npm test
npm run lint
npm run smoke
npm run dev
```

After changing commands, register them again:

```bash
npm run deploy
```

For a clean guild command registration:

```bash
npm run clear
npm run deploy
```

---

## 📦 Deployment

Argus is designed to run as a persistent Discord bot process.

Typical Node.js deployment settings:

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
