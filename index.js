// Main Discord bot entry point for OSINT Assistant — Benzyplug
require('dotenv').config();

const { Client, Collection, GatewayIntentBits, Events, MessageFlags, REST, Routes, ActivityType } = require('discord.js');
const path = require('node:path');
const { checkPermission } = require('./utils/permissions');
const { checkRateLimit, startRateLimitPrune, stopRateLimitPrune } = require('./utils/ratelimit');
const bootstrap = require('./utils/bootstrap');
const logger = require('./utils/logger');
const { startHealthWriter, stopHealthWriter, markReady, markShuttingDown, writeStartingState } = require('./utils/health');
const { startMetricsServer, stopMetricsServer, commandDuration, commandErrors, ratelimitBlocks, discordEvents } = require('./utils/metrics');
const { startHourlySweep, stopHourlySweep } = require('./utils/temp-sweep');
const { pruneReports, startReportsSweep, stopReportsSweep } = require('./utils/reports');
const { installArgusResponses, getComponentOwner } = require('./utils/interactionHelper');
const { handleInteractionError } = require('./utils/errorHandler');
const { auditCommand } = require('./utils/auditLog');
const { buildAutoModal, valuesFromModal, makeOptions, isAutoModal, commandNameFromModal } = require('./utils/modalCommands');

require('./utils/config');

const tempDir = path.join(__dirname, 'temp');
bootstrap.sweepBootTemp(tempDir);
startHourlySweep(tempDir);
pruneReports();
startReportsSweep();

const HEALTH_FILE = process.env.HEALTH_FILE || './temp/.health/health.json';
writeStartingState(HEALTH_FILE);
startHealthWriter({ path: HEALTH_FILE, intervalMs: 5000 });
startRateLimitPrune();

let metricsServer = null;
if (process.env.METRICS_ENABLED === 'true') {
    metricsServer = startMetricsServer({
        port: parseInt(process.env.METRICS_PORT || '9090', 10),
        host: process.env.METRICS_HOST || '127.0.0.1'
    });
    metricsServer.catch(err => logger.error({ err }, 'metrics server failed to start'));
}

const ALLOWED_GUILDS = bootstrap.parseAllowedGuilds(process.env.ALLOWED_GUILD_IDS);

const PRESENCE_MESSAGES = [
    '〢 👁️ Watching the Open Web',
    '〢 🔎 OSINT Intelligence',
    '〢 🛰️ Gathering Intelligence',
    '〢 🧩 Connecting the Dots',
    '〢 🔗 Correlating Evidence',
    '〢 🧠 Analyzing Signals',
    '〢 🌐 Monitoring the Web',
    '〢 🕵️ Investigating Public Data',
    '〢 ⚡ ARGUS Recon',
    '〢 🧿 ARGUS Intelligence',
    '〢 📡 Intelligence Network Active',
    '〢 ⚙️ Investigation Engine Ready',
    '〢 👑 Made by ẞ€ÑZ¥'
];

let presenceIndex = 0;
let presenceTimer = null;

function updatePresence() {
    if (!client.user) return;

    const message = PRESENCE_MESSAGES[presenceIndex++ % PRESENCE_MESSAGES.length];

    try {
        client.user.setPresence({
            status: 'dnd',
            activities: [{
                name: message,
                type: ActivityType.Custom,
                state: message
            }]
        });
        logger.debug({ message }, 'Argus presence updated');
    } catch (err) {
        logger.warn({ err, message }, 'Failed to update Argus presence');
    }
}

async function waitForRetry(retryAfterSeconds) {
    const delayMs = Math.min(Math.max(Number(retryAfterSeconds || 1) * 1000, 1000), 60000);
    console.warn(`[ARGUS] DISCORD REST RATE LIMITED — waiting ${Math.ceil(delayMs / 1000)}s before retry...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
}

async function discordFetchWith429Retry(url, options, label, attempts = 4) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const response = await fetch(url, options);

        if (response.status !== 429) return response;

        const text = await response.text();
        let body;
        try { body = JSON.parse(text); } catch { body = {}; }

        const retryAfter = Number(
            body?.retry_after ??
            response.headers.get('Retry-After') ??
            5
        );

        console.warn(
            `[ARGUS] DISCORD REST 429 — ${label} attempt ${attempt}/${attempts}, retry_after=${retryAfter}s`
        );

        if (attempt === attempts) {
            throw new Error(
                `Discord REST 429 Too Many Requests after ${attempts} attempts: ${text}`
            );
        }

        await waitForRetry(retryAfter);
    }
}

async function syncApplicationCommands(payload, label = 'loaded') {
    const guildId = process.env.GUILD_ID;
    const applicationId = process.env.CLIENT_ID;
    const token = process.env.DISCORD_TOKEN;

    console.log(`[ARGUS] COMMAND SYNC START — GUILD_ID=${guildId || 'MISSING'} CLIENT_ID=${applicationId || 'MISSING'} source=${label} count=${payload.length}`);

    if (!guildId) throw new Error('GUILD_ID is missing from the environment');
    if (!applicationId) throw new Error('CLIENT_ID is missing from the environment');
    if (!token) throw new Error('DISCORD_TOKEN is missing from the environment');
    if (!payload.length) throw new Error('No slash commands were prepared');

    const endpoint = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
        // Always GET first. Only bulk-overwrite when the registered command
        // definitions actually differ. This prevents unnecessary command
        // creates on every restart and avoids burning Discord's daily create
        // allowance.
        console.log('[ARGUS] DISCORD REST GET START — checking existing commands...');
        const existingController = new AbortController();
        const existingTimeout = setTimeout(() => existingController.abort(), 10000);

        let existingCommands;
        try {
            const existingResponse = await fetch(endpoint, {
                method: 'GET',
                headers: { Authorization: `Bot ${token}` },
                signal: existingController.signal
            });
            const existingText = await existingResponse.text();
            let existingBody;
            try { existingBody = JSON.parse(existingText); } catch { existingBody = existingText; }

            if (!existingResponse.ok) {
                throw new Error(`Discord REST GET ${existingResponse.status} ${existingResponse.statusText}: ${typeof existingBody === 'string' ? existingBody : JSON.stringify(existingBody)}`);
            }

            existingCommands = Array.isArray(existingBody) ? existingBody : [];
        } finally {
            clearTimeout(existingTimeout);
        }

        const comparable = (command) => {
            const copy = JSON.parse(JSON.stringify(command));
            delete copy.id;
            delete copy.application_id;
            delete copy.guild_id;
            delete copy.version;
            return copy;
        };

        const desiredComparable = payload.map(comparable);
        const existingComparable = existingCommands.map(comparable);

        const sameCommands =
            existingComparable.length === desiredComparable.length &&
            existingComparable.every((command, index) =>
                JSON.stringify(command) === JSON.stringify(desiredComparable[index])
            );

        const existingNames = existingCommands.map(command => command.name);
        console.log(`[ARGUS] EXISTING COMMANDS — ${existingCommands.length}`);
        console.log(`[ARGUS] EXISTING NAMES — ${existingNames.join(', ')}`);

        if (sameCommands) {
            console.log('[ARGUS] COMMANDS ALREADY UP TO DATE — no Discord command creates needed');
            return true;
        }

        console.log(`[ARGUS] COMMANDS DIFFER — registering ${payload.length} commands...`);
        console.log('[ARGUS] DISCORD REST PUT START...');

        const response = await discordFetchWith429Retry(endpoint, {
            method: 'PUT',
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        }, 'guild command registration', 4);

        const text = await response.text();
        let body;
        try { body = JSON.parse(text); } catch { body = text; }

        if (!response.ok) {
            throw new Error(`Discord REST ${response.status} ${response.statusText}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
        }

        const deployedNames = Array.isArray(body) ? body.map(command => command.name) : [];
        console.log(`[ARGUS] COMMAND REGISTERED — ${deployedNames.length}`);
        console.log(`[ARGUS] COMMAND NAMES — ${deployedNames.join(', ')}`);

        return true;
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error('Discord REST command registration timed out after 15 seconds');
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    waitGuildTimeout: 5000,
    allowedMentions: { parse: ['users'], repliedUser: false }
});

let startupReadyHandled = false;
let commandInitializationStarted = false;

async function completeArgusStartup(source) {
    if (startupReadyHandled) return;
    startupReadyHandled = true;

    // Force-fetch the bot user so Discord's current profile banner is available
    // before Argus starts styling replies. discord.js notes that banner data can
    // require a force fetch before it is populated.
    try {
        await client.user?.fetch(true);
    } catch (err) {
        logger.warn({ err }, 'Failed to refresh Argus profile banner');
    }

    console.log(`[ARGUS] GATEWAY READY — source=${source}`);
    updatePresence();
    presenceTimer = setInterval(updatePresence, 3000);
    presenceTimer.unref?.();
    markReady();
    discordEvents.inc({ event: 'ready' });
}

const commands = new Collection();
const stats = { loaded: 0, skipped: 0, failed: 0, failedFiles: [] };
client.commands = commands;

console.log('[ARGUS] Core modules loaded — connecting to Discord before loading command modules...');

const shutdownHandler = bootstrap.createShutdownHandler(client, {
    onSignal: (signal) => {
        logger.info({ signal }, 'shutdown signal received');
        markShuttingDown();
    },
    onDrain: async () => {
        if (presenceTimer) clearInterval(presenceTimer);
        stopRateLimitPrune();
        stopHealthWriter();
        stopHourlySweep();
        stopReportsSweep();
        if (metricsServer) await stopMetricsServer();
    }
});

process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

function leaveUnauthorized(guild) {
    if (ALLOWED_GUILDS.length > 0 && !ALLOWED_GUILDS.includes(guild.id)) {
        logger.info({ guildName: guild.name, guildId: guild.id }, 'Leaving unauthorized guild');
        guild.leave().catch(err => logger.error({ guildId: guild.id, err }, 'Failed to leave guild'));
    }
}

client.once('clientReady', async () => {
    await completeArgusStartup('clientReady');
});

client.ws.once('READY', async () => {
    console.log('[ARGUS] GATEWAY READY DISPATCH RECEIVED');
    await completeArgusStartup('gatewayReady');
});

client.ws.on('READY', () => {
    console.log('[ARGUS] WEBSOCKET READY RECEIVED');
});

client.on('raw', (packet) => {
    const type = packet?.t || packet?.op;
    if (type === 'READY' || type === 'RESUMED' || type === 0 || type === 1) {
        console.log('[ARGUS GATEWAY RAW]', typeof type === 'string' ? type : `OP_${type}`);
    }
});

client.on('error', (err) => {
    logger.error({ err }, 'Discord client error');
    console.error('[ARGUS DISCORD ERROR]', err?.stack || err);
});

client.on('warn', (message) => {
    console.warn('[ARGUS DISCORD WARN]', message);
});

client.on('debug', (message) => {
    if (/gateway|identify|resume|heartbeat|ready|session/i.test(message)) {
        console.log('[ARGUS DISCORD DEBUG]', message);
    }
});

client.on('shardError', (error) => {
    logger.error({ err: error }, 'Discord gateway shard error');
    console.error('[ARGUS SHARD ERROR]', error?.stack || error);
});

client.on('shardDisconnect', (event, shardId) => {
    console.error(`[ARGUS SHARD DISCONNECT] shard=${shardId} code=${event?.code ?? 'unknown'}`);
});

client.on(Events.InteractionCreate, async interaction => {
    // Apply Argus visual styling to every reply, including permissions, limits and component errors.
    installArgusResponses(interaction, client);
    if (ALLOWED_GUILDS.length > 0) {
        if (!interaction.guild || !ALLOWED_GUILDS.includes(interaction.guild.id)) {
            if (interaction.isRepliable?.()) {
                try {
                    await interaction.reply({
                        content: 'This bot is not authorized in this context.',
                        flags: MessageFlags.Ephemeral
                    });
                } catch {}
            }
            return;
        }
    }

    // Component ownership: interactive controls belong to the user who invoked the command.
    if (interaction.isMessageComponent?.()) {
        const ownerId = getComponentOwner(interaction.message?.id);
        if (ownerId && ownerId !== interaction.user?.id) {
            try {
                await interaction.reply({ content: 'This control belongs to the user who started this operation.', flags: MessageFlags.Ephemeral });
            } catch {}
            return;
        }
    }

    // Auto-generated command modals replace slash-command option menus.
    if (isAutoModal(interaction)) {
        const autoName = commandNameFromModal(interaction);
        const autoCommand = client.commands.get(autoName);
        if (!autoCommand) return;
        try {
            const values = valuesFromModal(interaction, autoCommand);
            Object.defineProperty(interaction, 'commandName', { configurable: true, value: autoName });
            Object.defineProperty(interaction, 'options', { configurable: true, value: makeOptions(values, autoCommand, client) });
            await autoCommand.execute(interaction);
        } catch (error) {
            void auditCommand(client, interaction, { status: 'error', error });
            await handleInteractionError(interaction, error, { command: autoName });
        }
        return;
    }

    // Route native component/modal interactions to the command that owns them.
    if (!interaction.isChatInputCommand()) {
        for (const command of client.commands.values()) {
            if (typeof command.handleInteraction !== 'function') continue;
            try {
                const handled = await command.handleInteraction(interaction);
                if (handled) return;
            } catch (error) {
                void auditCommand(client, interaction, { status: 'error', error });
                await handleInteractionError(interaction, error, { command: interaction.commandName || 'component' });
                return;
            }
        }
        return;
    }

    const cmdName = interaction.commandName;
    const command = client.commands.get(cmdName);

    if (!command) {
        logger.error({ commandName: cmdName }, 'No command matching name was found');
        return;
    }

    const { allowed, reason } = checkPermission(interaction);
    if (!allowed) {
        try {
            void auditCommand(client, interaction, { status: 'error', error: new Error(reason) });
            return await interaction.reply({ content: reason, flags: MessageFlags.Ephemeral });
        } catch {
            return;
        }
    }

    const { limited, reason: rateLimitReason } = checkRateLimit(interaction.user.id, cmdName);

    if (limited) {
        ratelimitBlocks.inc({ command: cmdName });
        try {
            void auditCommand(client, interaction, { status: 'error', error: new Error(rateLimitReason) });
            return await interaction.reply({ content: rateLimitReason, flags: MessageFlags.Ephemeral });
        } catch {
            return;
        }
    }

    const autoModal = command.nativeOptions ? null : buildAutoModal(command);
    if (autoModal) {
        try {
            await interaction.showModal(autoModal);
        } catch (error) {
            void auditCommand(client, interaction, { status: 'error', error });
            logger.error({ command: cmdName, err: error }, 'Failed to open command modal');
        }
        return;
    }

    const startedAt = Date.now();
    const endTimer = commandDuration.startTimer({ command: cmdName });

    try {
        await command.execute(interaction);
        logger.info({ command: cmdName }, 'Command completed successfully');
        void auditCommand(client, interaction, { status: 'success', durationMs: Date.now() - startedAt });
    } catch (error) {
        commandErrors.inc({ command: cmdName, reason: error.name || 'Error' });
        logger.error({ command: cmdName, err: error }, 'Error executing command');
        void auditCommand(client, interaction, { status: 'error', durationMs: Date.now() - startedAt, error });

        await handleInteractionError(interaction, error, { command: cmdName });
    } finally {
        endTimer();
    }
});

process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandledRejection');
    process.exit(1);
});

async function startArgus() {
    logger.info({
        guildId: process.env.GUILD_ID || null,
        clientId: process.env.CLIENT_ID || null
    }, 'Starting Argus...');

    console.log('[ARGUS] LOADING ALL COMMAND MODULES BEFORE REGISTRATION...');

    // Load the real command definitions before touching Discord's command API.
    // This is critical: registering COMMAND_METADATA alone creates slash
    // commands with names/descriptions but NO user-input options.
    const loadedCommands = bootstrap.loadCommands(path.join(__dirname, 'commands'));
    for (const [name, command] of loadedCommands.commands) {
        client.commands.set(name, command);
    }
    Object.assign(stats, loadedCommands.stats);

    console.log(
        `[ARGUS] COMMAND LOAD — loaded=${stats.loaded} skipped=${stats.skipped} failed=${stats.failed}`
    );

    if (stats.failed > 0) {
        console.error('[ARGUS] COMMAND LOAD FAILURES:', JSON.stringify(stats.failedFiles));
        throw new Error('One or more command modules failed to load');
    }

    const commandPayload = [...client.commands.values()].map(command => {
        const payload = command.data.toJSON();
        if (!command.nativeOptions) delete payload.options;
        return payload;
    });

    // Discord requires required options to come before optional options.
    // Keep this normalization at the final registration boundary so one
    // malformed command definition cannot block the entire 39-command sync.
    const normalizeOptions = (options) => {
        if (!Array.isArray(options)) return options;
        const normalized = [...options]
            .map(option => ({
                ...option,
                options: normalizeOptions(option.options)
            }))
            .sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));
        return normalized;
    };

    for (const payload of commandPayload) {
        payload.options = normalizeOptions(payload.options);
    }

    bootstrap.validateCommandPayloads(commandPayload);
    console.log('[ARGUS] COMMAND VALIDATION PASSED');
    console.log('[ARGUS] REGISTERING CLEAN COMMAND DEFINITIONS — command input is collected through modals...');

    // Connect to Discord FIRST. A command-sync failure must never keep the bot offline.
    // This also avoids hammering the REST API before the gateway session is established.
    try {
        await client.login(process.env.DISCORD_TOKEN);
        console.log('[ARGUS] LOGIN RESOLVED — gateway session established');
        await completeArgusStartup('loginResolved');
    } catch (err) {
        console.error('[ARGUS] LOGIN FAILED:', err?.stack || err);
        logger.fatal({ err }, 'Argus gateway login failed');
        throw err;
    }

    // Register commands after the bot is connected. Discord may temporarily rate-limit
    // bulk command overwrites, so sync retries using Discord's retry_after value.
    try {
        await syncApplicationCommands(commandPayload, 'full-modules');
        console.log('[ARGUS] FULL COMMAND REGISTRATION COMPLETE — all slash-command options are deployed');
    } catch (err) {
        // Never crash a healthy gateway session just because command registration was rate-limited.
        console.error('[ARGUS] COMMAND SYNC FAILED — bot will remain online:', err?.stack || err);
        logger.error({ err }, 'Argus command sync failed; gateway remains online');

        // Keep retrying in the background. This is important when Discord has a
        // temporary application-command rate limit: a restart should not be
        // required just to make a newly added command (such as /dm) appear.
        const retryCommandSync = async () => {
            try {
                console.log('[ARGUS] BACKGROUND COMMAND SYNC RETRY...');
                await syncApplicationCommands(commandPayload, 'background-retry');
                console.log('[ARGUS] BACKGROUND COMMAND SYNC SUCCEEDED');
            } catch (retryErr) {
                console.error('[ARGUS] BACKGROUND COMMAND SYNC FAILED — will retry in 60s:', retryErr?.message || retryErr);
                setTimeout(retryCommandSync, 60000).unref?.();
            }
        };

        setTimeout(retryCommandSync, 60000).unref?.();
    }

    // Guild commands are Argus's single public command scope.
    // Global cleanup is opt-in because a PUT [] on every restart wastes the same
    // Discord application-command rate limit we are trying to protect.
    if (process.env.CLEAR_GLOBAL_COMMANDS === 'true') {
        try {
            const globalEndpoint = 'https://discord.com/api/v10/applications/' + process.env.CLIENT_ID + '/commands';
            const globalResponse = await discordFetchWith429Retry(globalEndpoint, {
                method: 'PUT',
                headers: {
                    Authorization: 'Bot ' + process.env.DISCORD_TOKEN,
                    'Content-Type': 'application/json'
                },
                body: '[]'
            }, 'global command cleanup', 4);
            const globalText = await globalResponse.text();

            if (!globalResponse.ok) {
                console.warn('[ARGUS] GLOBAL COMMAND CLEANUP FAILED:', globalText);
            } else {
                console.log('[ARGUS] GLOBAL COMMANDS CLEARED — guild scope is the only public command registry');
            }
        } catch (err) {
            console.warn('[ARGUS] GLOBAL COMMAND CLEANUP SKIPPED:', err?.message || err);
        }
    }

    console.log('[ARGUS] STARTUP COMPLETE — bot is online; command registration is non-fatal');
}

startArgus().catch((err) => {
    logger.fatal({ err }, 'Argus startup failed');
    console.error('[ARGUS] STARTUP FAILED:', err?.stack || err);
    process.exit(1);
});
