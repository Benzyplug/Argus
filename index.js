// Main Discord bot entry point for OSINT Assistant — Benzyplug
require('dotenv').config();

const { Client, GatewayIntentBits, Events, MessageFlags, REST, Routes } = require('discord.js');
const path = require('node:path');
const { checkPermission } = require('./utils/permissions');
const { checkRateLimit, startRateLimitPrune, stopRateLimitPrune } = require('./utils/ratelimit');
const bootstrap = require('./utils/bootstrap');
const logger = require('./utils/logger');
const { startHealthWriter, stopHealthWriter, markReady, markShuttingDown, writeStartingState } = require('./utils/health');
const { startMetricsServer, stopMetricsServer, commandDuration, commandErrors, ratelimitBlocks, discordEvents } = require('./utils/metrics');
const { startHourlySweep, stopHourlySweep } = require('./utils/temp-sweep');
const { pruneReports, startReportsSweep, stopReportsSweep } = require('./utils/reports');

require('./utils/config'); // validates env; exits(1) on missing required vars

const tempDir = path.join(__dirname, 'temp');
bootstrap.sweepBootTemp(tempDir);
startHourlySweep(tempDir);
pruneReports();        // boot prune of the durable reports/ archive (long TTL)
startReportsSweep();   // hourly reports/ prune

const HEALTH_FILE = process.env.HEALTH_FILE || './temp/.health/health.json';
writeStartingState(HEALTH_FILE);
startHealthWriter({ path: HEALTH_FILE, intervalMs: 5000 });
startRateLimitPrune();

let metricsServer = null;
if (process.env.METRICS_ENABLED === 'true') {
    metricsServer = startMetricsServer({ port: parseInt(process.env.METRICS_PORT || '9090', 10), host: process.env.METRICS_HOST || '127.0.0.1' });
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
    const message = PRESENCE_MESSAGES[presenceIndex++ % PRESENCE_MESSAGES.length];
    client.user.setPresence({
        status: 'dnd',
        activities: [{ name: message, type: 0 }]
    }).catch(err => logger.warn({ err }, 'Failed to update Argus presence'));
}

async function syncGuildCommands() {
    if (!process.env.GUILD_ID) {
        logger.warn('GUILD_ID is not set; skipping automatic guild command synchronization');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const payload = [...client.commands.values()].map(command => command.data.toJSON());
    const route = Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID);

    try {
        const deployed = await rest.put(route, { body: payload });
        logger.info({
            registered: deployed.length,
            guildId: process.env.GUILD_ID,
            commands: deployed.map(command => command.name)
        }, 'Guild slash commands synchronized');
    } catch (err) {
        logger.error({ err }, 'Failed to synchronize guild slash commands');
    }
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    allowedMentions: { parse: ['users'], repliedUser: false }
});

const { commands, stats } = bootstrap.loadCommands(path.join(__dirname, 'commands'));
client.commands = commands;
logger.info({ loaded: stats.loaded, skipped: stats.skipped, failed: stats.failed }, 'Commands loaded');

const shutdownHandler = bootstrap.createShutdownHandler(client, {
    onSignal: (signal) => { logger.info({ signal }, 'shutdown signal received'); markShuttingDown(); },
    onDrain: async () => { if (presenceTimer) clearInterval(presenceTimer); stopRateLimitPrune(); stopHealthWriter(); stopHourlySweep(); stopReportsSweep(); if (metricsServer) await stopMetricsServer(); }
});
process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

function leaveUnauthorized(guild) {
    if (ALLOWED_GUILDS.length > 0 && !ALLOWED_GUILDS.includes(guild.id)) {
        logger.info({ guildName: guild.name, guildId: guild.id }, 'Leaving unauthorized guild');
        guild.leave().catch(err => logger.error({ guildId: guild.id, err }, 'Failed to leave guild'));
    }
}

client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ tag: readyClient.user.tag, guilds: readyClient.guilds.cache.size, commands: client.commands.size }, 'Argus online');
    updatePresence();
    presenceTimer = setInterval(updatePresence, 30000);
    presenceTimer.unref?.();
    if (ALLOWED_GUILDS.length > 0) readyClient.guilds.cache.forEach(leaveUnauthorized);
    await syncGuildCommands();
    markReady();
    discordEvents.inc({ event: 'ready' });
});

client.on(Events.GuildCreate, leaveUnauthorized);

client.on(Events.InteractionCreate, async interaction => {
    if (ALLOWED_GUILDS.length > 0) {
        if (!interaction.guild || !ALLOWED_GUILDS.includes(interaction.guild.id)) {
            if (interaction.isRepliable?.()) {
                try { await interaction.reply({ content: 'This bot is not authorized in this context.', flags: MessageFlags.Ephemeral }); }
                catch { /* expired */ }
            }
            return;
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const cmdName = interaction.commandName;
    const command = client.commands.get(cmdName);
    if (!command) { logger.error({ commandName: cmdName }, 'No command matching name was found'); return; }

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

    logger.info({
        command: cmdName,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        guildId: interaction.guild?.id,
        guildName: interaction.guild?.name
    }, 'Command invoked');

    const endTimer = commandDuration.startTimer({ command: cmdName });
    try {
        await command.execute(interaction);
        logger.info({ command: cmdName }, 'Command completed successfully');
    } catch (error) {
        commandErrors.inc({ command: cmdName, reason: error.name || 'Error' });
        logger.error({ command: cmdName, err: error }, 'Error executing command');
        const msg = 'There was an error while executing this command! Please try again later.';
        try {
            if (interaction.replied || interaction.deferred) await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
            else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        } catch (e) { logger.error({ err: e }, 'Failed to send error message to user'); }
    } finally {
        endTimer();
    }
});

process.on('uncaughtException', (err) => { logger.fatal({ err }, 'uncaughtException'); process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'unhandledRejection'); process.exit(1); });

logger.info('Starting Argus...');
client.login(process.env.DISCORD_TOKEN);
