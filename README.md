# Argus

**Argus** is a self-hosted Discord OSINT assistant built for structured open-source intelligence workflows, reconnaissance, enrichment, analysis, and investigation support.

Created and maintained by **ẞ€ÑZ¥**.

## Quick Start

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

Edit `.env` and set:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

Register commands for your server:

```bash
npm run deploy
```

Start Argus:

```bash
npm start
```

For global commands:

```bash
npm run deploy:global
```

## Commands

Argus currently exposes 32 slash-command modules.

### Identity & Social

| Command | Purpose |
|---|---|
| `/sherlock` | Search a username across supported social platforms |
| `/maigret` | Build a username-based identity dossier |
| `/linkook` | LinkedIn reconnaissance |
| `/google-investigate` | Google/GHunt account investigation |
| `/username-gen` | Generate username candidates |
| `/nuclei` | Run supported Nuclei OSINT checks |

### Domains & Network

| Command | Purpose |
|---|---|
| `/dns` | DNS and domain information |
| `/whois` | WHOIS/domain information through Whoxy |
| `/hostio` | Host.io domain and infrastructure information |
| `/web-recon` | Web reconnaissance |
| `/redirect-check` | Inspect URL redirect chains |
| `/favicon` | Search and analyze website favicons |

### Images & Documents

| Command | Purpose |
|---|---|
| `/exif` | Extract image metadata |
| `/image-ai` | Image analysis with AWS Rekognition |
| `/doc-meta` | Extract document metadata |

### Blockchain

| Command | Purpose |
|---|---|
| `/blockchain` | Address, transaction, block, and trace analysis |
| `/blockchain-detect` | Identify likely blockchain address formats |

### Transport

| Command | Purpose |
|---|---|
| `/flight` | Aviation and flight information |
| `/airport` | Airport information |
| `/flight-number` | Search a flight number |
| `/vessel` | Maritime/vessel information |

### Business & Identity Data

| Command | Purpose |
|---|---|
| `/pappers` | Business/company information |
| `/vehicle` | Vehicle information |
| `/nike` | Nike-related investigation workflow |

### Analysis & Utilities

| Command | Purpose |
|---|---|
| `/ai` | AI assistance, OSINT analysis, coding, and transcription |
| `/jwt` | JWT analysis |
| `/extract-links` | Extract links from a URL |
| `/dork` | Generate/search-engine dork queries |
| `/monitor` | Configure monitoring/alert workflows |
| `/health` | Check bot, API, and tool health |
| `/upload` | Upload an attachment to the asset service |
| `/help` | List available commands |

## AI Command

`/ai` contains subcommands for different workflows:

- `ask` — general AI assistance
- `code` — code generation
- `analyze` — structured analysis
- `transcribe` — speech-to-text
- `reset` — reset conversation context

## Configuration

Copy `.env.example` to `.env`. Secrets belong in environment variables and must never be committed.

Optional integrations include:

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

Optional external tools include Sherlock, Maigret, Nuclei, ExifTool, GHunt, Linkook, xeuledoc, and jwt_tool.

If an optional integration is unavailable, its command should report the missing dependency rather than preventing Argus from starting.

## Deploying

Argus is designed to run as a persistent Discord bot process.

For a normal Node deployment:

- Runtime: Node.js 20+
- Install/build: `npm install`
- Start: `npm start`

Set the required environment variables in the hosting provider rather than committing a `.env` file.

## Security

Argus is intended for legitimate OSINT research, security testing, investigation, and educational use. Users are responsible for complying with applicable laws, platform rules, and authorization requirements.

The project includes input validation, permission checks, rate limiting, SSRF protections, controlled external-process execution, and secret redaction in logs.

See [SECURITY.md](SECURITY.md) for the security model.

## Development

```bash
npm test
npm run lint
npm run smoke
npm run dev
```

Deploy commands after command changes:

```bash
npm run deploy
```

To remove existing guild commands before a clean redeploy:

```bash
npm run clear
npm run deploy
```

## License

MIT. See [LICENSE](LICENSE).

---

**Argus** — OSINT tools, organized for Discord.

Maintained by **ẞ€ÑZ¥**.
