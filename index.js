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
        const payload = stylePayload(options, { interaction, client, commandName });
        return originalReply(payload);
    };

    interaction.editReply = async (options = {}) => {
        if (typeof options === 'string') return originalEditReply(options);
        const payload = stylePayload(options, { interaction, client, commandName });
        return originalEditReply(payload);
    };

    interaction.followUp = async (options = {}) => {
        if (typeof options === 'string') return originalFollowUp(options);
        const payload = stylePayload(options, { interaction, client, commandName });
        return originalFollowUp(payload);
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

async function syncApplicationCommands() {
    const guildId = process.env.GUILD_ID;
    const applicationId = process.env.CLIENT_ID;

    console.log(`[ARGUS] COMMAND SYNC START — GUILD_ID=${guildId || 'MISSING'} CLIENT_ID=${applicationId || 'MISSING'} loaded=${client.commands.size}`);

    if (!guildId) throw new Error('GUILD_ID is missing from the environment');
    if (!applicationId) throw new Error('CLIENT_ID is missing from the environment');
    if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is missing from the environment');
    if (client.commands.size === 0) throw new Error('No slash commands were loaded');

    const payload = [...client.commands.values()].map(command => command.data.toJSON());
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

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    allowedMentions: { parse: ['users'], repliedUser: false }
});

const commands = new Collection();
const stats = { loaded: 0, skipped: 0, failed: 0, failedFiles: [] };
client.commands = commands;
console.log('[ARGUS] Core modules loaded — connecting to Discord before loading commands');

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
    logger.info({ tag: readyClient.user.tag, guilds: readyClient.guilds.cache.size, commands: client.commands.size, applicationId: readyClient.application?.id || readyClient.client?.application?.id || null }, 'Argus online');
    console.log(`[ARGUS] READY — guilds=${readyClient.guilds.cache.size} commands=${client.commands.size} application=${client.application?.id || 'unknown'}`);
    updatePresence();
    presenceTimer = setInterval(updatePresence, 3000);

    console.log('[ARGUS] READY — loading command modules now...');
    try {
        const loadedCommands = bootstrap.loadCommands(path.join(__dirname, 'commands'));
        for (const [name, command] of loadedCommands.commands) client.commands.set(name, command);
        Object.assign(stats, loadedCommands.stats);
        console.log(`[ARGUS] COMMAND LOAD — loaded=${stats.loaded} failed=${stats.failed}`);

        if (stats.failed > 0) {
            console.error('[ARGUS] COMMAND LOAD FAILURES:', JSON.stringify(stats.failedFiles));
            return;
        }

        await syncApplicationCommands();
        console.log('[ARGUS] COMMAND SYNC COMPLETE');
    } catch (err) {
        logger.error({ err }, 'Command loading/sync failed after Discord login');
        console.error('[ARGUS] COMMAND STARTUP FAILED:', err?.stack || err);
    }

    presenceTimer.unref?.();
    if (ALLOWED_GUILDS.length > 0) readyClient.guilds.cache.forEach(leaveUnauthorized);
    markReady();
    discordEvents.inc({ event: 'ready' });
});

client.on(Events.GuildCreate, leaveUnauthorized);
client.on('error', (err) => {
    logger.error({ err }, 'Discord client error');
});

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
        try { return await interaction.reply({ content: reason, flags: MessageFlags.Ephemeral }); }
        catch { return; }
    }

    const { limited, reason: rateLimitReason } = checkRateLimit(interaction.user.id, cmdName);
    if (limited) {
        ratelimitBlocks.inc({ command: cmdName });
        try { return await interaction.reply({ content: rateLimitReason, flags: MessageFlags.Ephemeral }); }
        catch { return; }
    }

    installResponseStyling(interaction);

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

async function startArgus() {
    logger.info({ guildId: process.env.GUILD_ID || null, clientId: process.env.CLIENT_ID || null, commandCount: client.commands.size }, 'Starting Argus...');
    console.log('[ARGUS] STARTING — connecting to Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    console.log('[ARGUS] DISCORD LOGIN COMPLETE');
}

startArgus().catch((err) => {
    logger.fatal({ err }, 'Argus startup failed');
    console.error('[ARGUS] STARTUP FAILED:', err?.stack || err);
    process.exit(1);
});
