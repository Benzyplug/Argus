/**
 * Argus slash-command deployment.
 *
 * Default: synchronize BOTH the configured guild and global application
 * commands. This prevents old names from surviving in one scope.
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const path = require('node:path');
const bootstrap = require('./utils/bootstrap');

const args = process.argv.slice(2);
const globalOnly = args.includes('--global') || args.includes('-g');
const guildOnly = args.includes('--guild');
const deployAll = args.includes('--all') || (!globalOnly && !guildOnly);

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID.');
    process.exit(1);
}
if ((deployAll || guildOnly) && !GUILD_ID) {
    console.error('❌ Missing GUILD_ID for guild deployment.');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

function loadCommands() {
    const { commands, stats } = bootstrap.loadCommands(path.join(__dirname, 'commands'));

    if (stats.failed > 0) {
        console.error(`❌ ${stats.failed} command file(s) failed to load. Refusing partial deployment.`);
        process.exit(1);
    }

    const data = [...commands.values()].map(command => command.data.toJSON());
    if (data.length === 0) {
        console.error('❌ No valid commands found.');
        process.exit(1);
    }

    const stale = data.filter(command => command.name.toLowerCase().startsWith('bob-'));
    if (stale.length) {
        console.error('❌ Refusing deployment: bob-* command names still exist in the payload.');
        stale.forEach(command => console.error(`   /${command.name}`));
        process.exit(1);
    }

    console.log(`📁 Loaded ${data.length} clean Argus commands.`);
    data.forEach(command => console.log(`   ✅ /${command.name} — ${command.description}`));
    return data;
}

async function syncScope(route, label, commands) {
    console.log(`\n🔄 Synchronizing ${label}...`);

    // Discord bulk-overwrite replaces the complete command set for this scope.
    const deployed = await rest.put(route, { body: commands });

    // Verify the actual registered list and remove any retired Bob command
    // defensively if Discord reports one.
    const current = await rest.get(route);
    const stale = current.filter(command => command.name.toLowerCase().startsWith('bob-'));

    for (const command of stale) {
        await rest.delete(`${route}/${command.id}`);
        console.log(`🗑️ Removed stale /${command.name} from ${label}`);
    }

    const cleanNames = current
        .filter(command => !command.name.toLowerCase().startsWith('bob-'))
        .map(command => command.name);

    console.log(`✅ ${label}: ${cleanNames.length} clean command(s) registered.`);
    return deployed;
}

async function main() {
    console.log('⌬ Argus command deployment');
    console.log(`🎯 Mode: ${deployAll ? 'Guild + Global' : globalOnly ? 'Global only' : 'Guild only'}`);

    const commands = loadCommands();

    if (deployAll || guildOnly) {
        await syncScope(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            `guild ${GUILD_ID}`,
            commands
        );
    }

    if (deployAll || globalOnly) {
        await syncScope(
            Routes.applicationCommands(CLIENT_ID),
            'global',
            commands
        );
    }

    console.log('\n🎉 Argus command synchronization complete.');
}

main().catch(error => {
    console.error('❌ Command deployment failed:', error);
    process.exit(1);
});
