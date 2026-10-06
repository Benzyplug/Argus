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
const { stylePayload, loadingEmbed } = require('./utils/embedBuilder');

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

function installResponseStyling(interaction) {
    if (interaction.__argusResponseStyling) return;
    interaction.__argusResponseStyling = true;

    const originalReply = interaction.reply.bind(interaction);
    const originalEditReply = interaction.editReply.bind(interaction);
    const originalFollowUp = interaction.followUp.bind(interaction);
    const commandName = interaction.commandName || 'argus';

    interaction.deferReply = async (options = {}) => {
        const payload = { embeds: [loadingEmbed(interaction, commandName)] };
        if (options.ephemeral !== undefined) payload.ephemeral = options.ephemeral;
        if (options.flags !== undefined) payload.flags = options.flags;
        return originalReply(payload);
    };

    interaction.reply = async (options = {}) => {
        if (typeof options === 'string') return originalReply(options);
        return originalReply(stylePayload(options, { interaction, client, commandName }));
    };

    interaction.editReply = async (options = {}) => {
        if (typeof options === 'string') return originalEditReply(options);
        return originalEditReply(stylePayload(options, { interaction, client, commandName }));
    };

    interaction.followUp = async (options = {}) => {
        if (typeof options === 'string') return originalFollowUp(options);
        return originalFollowUp(stylePayload(options, { interaction, client, commandName }));
    };
}

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

async function syncApplicationCommands(payload, label = 'loaded') {
    const guildId = process.env.GUILD_ID;
    const applicationId = process.env.CLIENT_ID;

    console.log(`[ARGUS] COMMAND SYNC START — GUILD_ID=${guildId || 'MISSING'} CLIENT_ID=${applicationId || 'MISSING'} source=${label} count=${payload.length}`);

    if (!guildId) throw new Error('GUILD_ID is missing from the environment');
    if (!applicationId) throw new Error('CLIENT_ID is missing from the environment');
    if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is missing from the environment');
    if (!payload.length) throw new Error('No slash commands were prepared');

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const route = Routes.applicationGuildCommands(applicationId, guildId);

    console.log(`[ARGUS] REGISTERING ${payload.length} COMMANDS...`);
    const deployed = await rest.put(route, { body: payload });
    const deployedNames = Array.isArray(deployed) ? deployed.map(command => command.name) : [];

    console.log(`[ARGUS] COMMAND REGISTERED — ${deployedNames.length}`);
    console.log(`[ARGUS] COMMAND NAMES — ${deployedNames.join(', ')}`);

    const verified = await rest.get(route);
    const verifiedNames = Array.isArray(verified) ? verified.map(command => command.name) : [];

    console.log(`[ARGUS] COMMAND VERIFY — ${verifiedNames.length}`);
    console.log(`[ARGUS] VERIFIED NAMES — ${verifiedNames.join(', ')}`);

    return true;
}

function metadataCommandPayload() {
    return Object.values(bootstrap.COMMAND_METADATA).map(({ name, description }) => ({
        name,
        description,
        type: 1
    }));
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    waitGuildTimeout: 5000,
    allowedMentions: { parse: ['users'], repliedUser: false }
});

let startupReadyHandled = false;
let commandInitializationStarted = false;

async function completeArgusStartup(source) {
    if (startupReadyHandled) return;
    startupReadyHandled = true;
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

async function initializeCommandsAfterGateway() {
    if (commandInitializationStarted) return;
    commandInitializationStarted = true;
    console.log('[ARGUS] Gateway is online — loading command modules now...');

    try {
        // Register lightweight command definitions first. This guarantees the
        // slash-command menu is populated even if a command module is slow to load.
        await syncApplicationCommands(metadataCommandPayload(), 'metadata');
        console.log('[ARGUS] METADATA COMMAND SYNC COMPLETE — slash commands are now visible');

        const loadedCommands = bootstrap.loadCommands(path.join(__dirname, 'commands'));
        for (const [name, command] of loadedCommands.commands) {
            client.commands.set(name, command);
        }
        Object.assign(stats, loadedCommands.stats);
        console.log(`[ARGUS] COMMAND LOAD — loaded=${stats.loaded} skipped=${stats.skipped} failed=${stats.failed}`);

        if (stats.failed > 0) {
            console.error('[ARGUS] COMMAND LOAD FAILURES:', JSON.stringify(stats.failedFiles));
        } else {
            await syncApplicationCommands([...client.commands.values()].map(command => command.data.toJSON()), 'modules');
            console.log('[ARGUS] COMMAND SYNC COMPLETE — all Argus commands are registered');
        }
    } catch (err) {
        logger.error({ err }, 'Command initialization failed after gateway connection');
        console.error('[ARGUS] COMMAND INITIALIZATION FAILED:', err?.stack || err);
    }
}

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
    void initializeCommandsAfterGateway();
});

client.ws.once('READY', async () => {
    console.log('[ARGUS] GATEWAY READY DISPATCH RECEIVED');
    await completeArgusStartup('gatewayReady');
    void initializeCommandsAfterGateway();
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

    if (!interaction.isChatInputCommand()) return;

    const cmdName = interaction.commandName;
    const command = client.commands.get(cmdName);

    if (!command) {
        logger.error({ commandName: cmdName }, 'No command matching name was found');
        return;
    }

    const { allowed, reason } = checkPermission(interaction);
    if (!allowed) {
        try {
            return await interaction.reply({ content: reason, flags: MessageFlags.Ephemeral });
        } catch {
            return;
        }
    }

    const { limited, reason: rateLimitReason } = checkRateLimit(interaction.user.id, cmdName);

    if (limited) {
        ratelimitBlocks.inc({ command: cmdName });
        try {
            return await interaction.reply({ content: rateLimitReason, flags: MessageFlags.Ephemeral });
        } catch {
            return;
        }
    }

    installResponseStyling(interaction);

    const endTimer = commandDuration.startTimer({ command: cmdName });

    try {
        await command.execute(interaction);
        logger.info({ command: cmdName }, 'Command completed successfully');
    } catch (error) {
        commandErrors.inc({ command: cmdName, reason: error.name || 'Error' });
        logger.error({ command: cmdName, err: error }, 'Error executing command');

        const msg = 'There was an error while executing this command! Please try again later.';

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            logger.error({ err: e }, 'Failed to send error message to user');
        }
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
    }, 'Starting Argus gateway...');

    console.log('[ARGUS] CONNECTING TO DISCORD GATEWAY...');

    try {
        await client.login(process.env.DISCORD_TOKEN);
        console.log('[ARGUS] LOGIN RESOLVED — registering slash commands directly...');

        // Do not depend on a Discord.js event for registration. The login
        // promise resolving proves the gateway session is established.
        await completeArgusStartup('loginResolved');
        await initializeCommandsAfterGateway();

        console.log('[ARGUS] STARTUP COMPLETE — bot online and slash commands registered');
    } catch (err) {
        console.error('[ARGUS] LOGIN/COMMAND STARTUP FAILED:', err?.stack || err);
        throw err;
    }
}

startArgus().catch((err) => {
    logger.fatal({ err }, 'Argus startup failed');
    console.error('[ARGUS] STARTUP FAILED:', err?.stack || err);
    process.exit(1);
});
