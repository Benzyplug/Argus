'use strict';

/**
 * Health writer — periodically writes a JSON health file for Docker HEALTHCHECK.
 *
 * Usage:
 *   const { startHealthWriter, stopHealthWriter, markReady, markShuttingDown, writeNow } = require('./utils/health');
 *   startHealthWriter({ path: '/app/temp/.health/health.json', intervalMs: 5000, client });
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('./logger');

// Read version once at module load; default to 'unknown' if package.json unreadable.
let _version = 'unknown';
try {
    const pkg = require('../package.json');
    _version = pkg.version ?? 'unknown';
} catch {
    // non-fatal
}

/** @type {string|null} */
let _filePath = null;
/** @type {ReturnType<typeof setInterval>|null} */
let _intervalHandle = null;
/** @type {import('discord.js').Client|null} */
let _client = null;

// Internal mutable state
let _state = 'starting';
let _lastReady = null;
let _shuttingDownSince = null;
let _stopped = false;   // set to true after EROFS/EACCES — stop trying

/**
 * Derive state string from Discord client ws.status.
 * ws.status 0 === READY per discord.js WebSocketStatus enum.
 */
function _deriveState() {
    if (_state === 'shutting_down') return 'shutting_down';
    if (_client) {
        return _client.ws.status === 0 ? 'ready' : 'starting';
    }
    return _state;
}

/** Build the health payload object. */
function _buildPayload() {
    return {
        state: _deriveState(),
        lastReady: _lastReady,
        shuttingDownSince: _shuttingDownSince,
        uptime: process.uptime(),
        pid: process.pid,
        version: _version,
        ts: Date.now()
    };
}

/**
 * Atomically write health payload to disk (tmp → rename).
 * Silently stops on EROFS / EACCES to avoid spamming logs.
 */
async function writeNow() {
    if (!_filePath || _stopped) return;
    const tmp = `${_filePath}.tmp`;
    try {
        await fs.writeFile(tmp, JSON.stringify(_buildPayload()), 'utf8');
        await fs.rename(tmp, _filePath);
    } catch (err) {
        if (err.code === 'EROFS' || err.code === 'EACCES') {
            logger.warn({ err, path: _filePath }, 'health: filesystem not writable — disabling health writer');
            _stopped = true;
            stopHealthWriter();
        } else {
            logger.warn({ err, path: _filePath }, 'health: write failed');
        }
    }
}

/**
 * Synchronously write initial 'starting' health payload.
 * Safe to call before startHealthWriter (uses fs.mkdirSync + writeFileSync).
 * @param {string} filePath - Absolute path to write the health file.
 */
function writeStartingState(filePath) {
    if (!filePath) return;
    try {
        fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
        const payload = {
            state: 'starting',
            lastReady: null,
            shuttingDownSince: null,
            uptime: process.uptime(),
            pid: process.pid,
            version: _version,
            ts: Date.now()
        };
        fsSync.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
    } catch (err) {
        logger.warn({ err, path: filePath }, 'health: initial sync write failed');
    }
}

/**
 * Start the health writer interval.
 * @param {object} opts
 * @param {string} opts.path         - Absolute path to write the health file.
 * @param {number} [opts.intervalMs=5000] - Write interval in milliseconds.
 * @param {import('discord.js').Client} [opts.client] - Discord client (optional).
 */
async function startHealthWriter({ path: filePath, intervalMs = 5000, client } = {}) {
    if (!filePath) throw new Error('health.startHealthWriter: `path` is required');

    _filePath = filePath;
    _client = client ?? null;
    _state = 'starting';
    _lastReady = null;
    _shuttingDownSince = null;
    _stopped = false;

    // Ensure parent directory exists
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') {
            logger.warn({ err, path: filePath }, 'health: failed to create health directory');
        }
    }

    await writeNow();

    if (_intervalHandle) clearInterval(_intervalHandle);
    _intervalHandle = setInterval(() => { writeNow().catch(() => {}); }, intervalMs);
}

/** Stop the write interval. Does not modify the health file. */
function stopHealthWriter() {
    if (_intervalHandle) {
        clearInterval(_intervalHandle);
        _intervalHandle = null;
    }
}

/** Mark state as ready and flush immediately. */
async function markReady() {
    _state = 'ready';
    _lastReady = Date.now();
    await writeNow();
}

/** Mark state as shutting_down and flush immediately. */
async function markShuttingDown() {
    _state = 'shutting_down';
    _shuttingDownSince = Date.now();
    await writeNow();
}



const os = require('node:os');
const { execFile } = require('node:child_process');

function formatUptime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [d ? d + 'd' : '', h ? h + 'h' : '', m ? m + 'm' : '', sec + 's'].filter(Boolean).join(' ');
}

function checkTool(command) {
    return new Promise(resolve => {
        const p = execFile(command, ['--version'], { timeout: 2500 }, error => resolve(!error));
        p.on('error', () => resolve(false));
    });
}

async function gatherHealthData(detailed = false, checkApis = false, checkTools = false, client = null) {
    const started = Date.now();
    const connected = Boolean(client?.isReady?.());
    const ping = Number.isFinite(client?.ws?.ping) && client.ws.ping >= 0 ? client.ws.ping : null;
    const memory = process.memoryUsage();
    const system = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: { used: memory },
        cpu: detailed ? { cores: os.cpus().length, loadAvg: os.loadavg() } : null,
        tempDir: detailed ? { exists: fsSync.existsSync(path.join(process.cwd(), 'temp')) } : null
    };
    const apis = {};
    if (checkApis) {
        const envs = [
            ['DNSDumpster', 'DNSDUMPSTER_TOKEN'], ['Whoxy', 'WHOXY_API_KEY'], ['Host.io', 'HOSTIO_API_KEY'],
            ['AviationStack', 'AVIATIONSTACK_API_KEY'], ['AirportDB', 'AIRPORTDB_API_KEY'], ['Pappers', 'PAPPERS_API_KEY'],
            ['AI', 'AI_API_KEY'], ['VirusTotal', 'VIRUSTOTAL_API_KEY'], ['Etherscan', 'ETHERSCAN_API_KEY'],
            ['BscScan', 'BSCSCAN_API_KEY'], ['PolygonScan', 'POLYGONSCAN_API_KEY']
        ];
        for (const [name, key] of envs) apis[name] = process.env[key] ? { status: 'configured' } : { status: 'degraded', reason: 'not configured' };
    }
    const tools = {};
    if (checkTools) {
        const specs = [['ExifTool', process.env.EXIFTOOL_PATH || 'exiftool'], ['Sherlock', process.env.SHERLOCK_PATH || 'sherlock'], ['Maigret', process.env.MAIGRET_PATH || 'maigret'], ['Nuclei', process.env.NUCLEI_PATH || 'nuclei']];
        for (const [name, command] of specs) tools[name] = { available: await checkTool(command), command };
    }
    const issues = [];
    if (!connected) issues.push('Discord disconnected');
    if (checkApis) for (const [name, item] of Object.entries(apis)) if (item.status !== 'configured') issues.push(name + ' not configured');
    if (checkTools) for (const [name, item] of Object.entries(tools)) if (!item.available) issues.push(name + ' unavailable');
    const score = Math.max(0, 100 - (connected ? 0 : 50) - (checkApis ? Object.values(apis).filter(x => x.status !== 'configured').length * 3 : 0) - (checkTools ? Object.values(tools).filter(x => !x.available).length * 5 : 0));
    return { overall: { status: score >= 90 ? 'healthy' : score >= 60 ? 'degraded' : 'unhealthy', score, issues }, discord: { connected, ping }, system, apis: checkApis ? apis : null, tools: checkTools ? tools : null, processingTime: Date.now() - started };
}

module.exports = {
    startHealthWriter,
    stopHealthWriter,
    markReady,
    markShuttingDown,
    writeNow,
    writeStartingState,
    gatherHealthData,
    formatUptime
};
