/**
 * File: utils/bootstrap.js
 * Description: Boot orchestration extracted from index.js
 * Responsibilities: command loading, guild whitelist parsing, boot temp sweep, shutdown handler factory
 */

const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

const HEALTH_DIR_NAME = '.health';
const SWEEP_EXCLUDE_DEFAULT = Object.freeze([HEALTH_DIR_NAME]);
const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const COMMAND_METADATA = Object.freeze({
    'airport.js': { name: 'airport', description: 'Look up an airport by code or name.' },
    'aviation.js': { name: 'flight', description: 'Track a flight and view current aviation details.' },
    'blockchain.js': { name: 'blockchain', description: 'Inspect a cryptocurrency address and blockchain data.' },
    'blockchain-detect.js': { name: 'crypto-detect', description: 'Identify the blockchain or cryptocurrency used by an address.' },
    'chat.js': { name: 'ai', description: 'Chat with Argus AI.' },
    'dns.js': { name: 'dns', description: 'Look up DNS records for a domain.' },
    'dork.js': { name: 'dork', description: 'Build and run a search-engine dork for OSINT research.' },
    'exif.js': { name: 'exif', description: 'Extract metadata from an image or file.' },
    'extract-links.js': { name: 'extract-links', description: 'Extract links and URLs from a webpage.' },
    'favicons.js': { name: 'favicon', description: 'Analyze a website favicon for reconnaissance.' },
    'flight-number.js': { name: 'flight-number', description: 'Look up information for a flight number.' },
    'generate-usernames.js': { name: 'username-gen', description: 'Generate username ideas from a name or keyword.' },
    'ghunt.js': { name: 'google-investigate', description: 'Investigate a Google account with available OSINT data.' },
    'health.js': { name: 'health', description: 'Check Argus health and system status.' },
    'help.js': { name: 'help', description: 'Show all Argus commands and what they do.' },
    'hostio.js': { name: 'host-lookup', description: 'Look up hosting and infrastructure information.' },
    'jwt.js': { name: 'jwt', description: 'Inspect and analyze a JSON Web Token.' },
    'linkook.js': { name: 'link-check', description: 'Analyze a URL and check its links and details.' },
    'maigret.js': { name: 'maigret', description: 'Search for a username across online services.' },
    'monitor.js': { name: 'monitor', description: 'Monitor a target for changes and activity.' },
    'nike.js': { name: 'nike', description: 'Search Nike product and release information.' },
    'nuclei.js': { name: 'nuclei-scan', description: 'Scan a target for known security findings with Nuclei.' },
    'pappers.js': { name: 'company-search', description: 'Search public company and business information.' },
    'recon-web.js': { name: 'web-recon', description: 'Run reconnaissance checks against a website.' },
    'redirect-chain.js': { name: 'redirect-check', description: 'Trace a URL redirect chain and final destination.' },
    'rekognition.js': { name: 'image-ai', description: 'Analyze an image with AI-powered image recognition.' },
    'sherlock.js': { name: 'sherlock', description: 'Search for a username across social platforms.' },
    'upload.js': { name: 'upload', description: 'Upload a file for Argus analysis.' },
    'vessels.js': { name: 'vessel', description: 'Look up vessel and maritime information.' },
    'vpic.js': { name: 'vehicle', description: 'Look up vehicle information by VIN.' },
    'whoxy.js': { name: 'whois', description: 'Look up domain registration and WHOIS information.' },
    'xeuledoc.js': { name: 'doc-meta', description: 'Inspect document metadata and properties.' }
});

function loadCommands(commandsPath) {
    const commands = new Collection();
    const stats = { loaded: 0, skipped: 0, failed: 0, failedFiles: [] };

    if (!fs.existsSync(commandsPath)) {
        return { commands, stats };
    }

    const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js')).sort();
    for (const file of files) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if (!command || !command.data || typeof command.execute !== 'function') {
                stats.skipped++;
                stats.failedFiles.push({ file, error: 'Missing command data or execute() function' });
                continue;
            }

            const metadata = COMMAND_METADATA[file];
            if (metadata) {
                command.data.setName(metadata.name).setDescription(metadata.description);
            }

            // Validate the complete slash-command definition before Discord sync.
            const json = command.data.toJSON();
            if (!json.name || !json.description) {
                throw new Error('Command data is missing name or description');
            }
            if (commands.has(json.name)) {
                throw new Error(`Duplicate slash command name: /${json.name}`);
            }

            commands.set(json.name, command);
            stats.loaded++;
        } catch (error) {
            const detail = error?.stack || error?.message || String(error);
            stats.failed++;
            stats.failedFiles.push({ file, error: detail });
            console.error(`[ARGUS COMMAND LOAD FAILED] ${file}\n${detail}`);
        }
    }
    return { commands, stats };
}

function parseAllowedGuilds(envValue) {
    return String(envValue || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
}

function sweepBootTemp(tempDir, exclude = SWEEP_EXCLUDE_DEFAULT, maxAgeMs = TEMP_MAX_AGE_MS) {
    if (!fs.existsSync(tempDir)) return { swept: 0, kept: 0 };
    const excludeSet = new Set(exclude);
    const now = Date.now();
    let swept = 0, kept = 0;

    // A boot sweep must never crash the process — if the dir is unreadable or
    // not a directory (ENOTDIR/EACCES under hardened containers), bail quietly.
    let entries;
    try {
        entries = fs.readdirSync(tempDir);
    } catch {
        return { swept, kept };
    }

    for (const file of entries) {
        if (excludeSet.has(file)) { kept++; continue; }
        const filePath = path.join(tempDir, file);
        try {
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAgeMs) {
                if (stat.isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(filePath);
                }
                swept++;
            } else {
                kept++;
            }
        } catch {
            // file vanished mid-sweep or permission denied — skip
        }
    }
    return { swept, kept };
}

function createShutdownHandler(client, hooks = {}) {
    let invoked = false;
    return function shutdown(signal) {
        if (invoked) return;
        invoked = true;
        if (typeof hooks.onSignal === 'function') {
            try { hooks.onSignal(signal); } catch { /* hook errors must not block shutdown */ }
        }
        for (const cmd of client.commands?.values?.() || []) {
            if (typeof cmd.shutdown === 'function') {
                try { cmd.shutdown(); } catch { /* command shutdown errors logged by hook */ }
            }
        }
        if (typeof hooks.onDrain === 'function') {
            try { Promise.resolve(hooks.onDrain()).catch(() => {}); } catch { /* hook errors must not block shutdown */ }
        }
        try { client.destroy(); } catch { /* already destroyed */ }
        setTimeout(() => process.exit(0), 1000).unref();
    };
}

module.exports = {
    loadCommands,
    parseAllowedGuilds,
    sweepBootTemp,
    createShutdownHandler,
    SWEEP_EXCLUDE_DEFAULT
};
