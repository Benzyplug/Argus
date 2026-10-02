/**
 * Register the exact command set used by Argus at runtime.
 * This intentionally uses the shared bootstrap loader so command renames
 * and descriptions cannot drift between the bot and Discord registration.
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const path = require('node:path');
const bootstrap = require('./utils/bootstrap');

const args = process.argv.slice(2);
const isGlobalDeploy = args.includes('--global') || args.includes('-g');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID.');
    process.exit(1);
}

if (!isGlobalDeploy && !GUILD_ID) {
    console.error('❌ Missing GUILD_ID for guild deployment.');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

function loadCommands() {
    const { commands, stats } = bootstrap.loadCommands(path.join(__dirname, 'commands'));

    if (stats.failed > 0) {
        console.error(`❌ ${stats.failed} command file(s) failed to load. Refusing to deploy a partial command set.`);
        process.exit(1);
    }

    const data = [...commands.values()].map(command => command.data.toJSON());

    if (data.length === 0) {
        console.error('❌ No valid commands found.');
        process.exit(1);
    }

    console.log(`📁 Loaded ${data.length} Argus commands.`);
    for (const command of data) {
        console.log(`   ✅ /${command.name} — ${command.description}`);
    }

    return data;
}

async function main() {
    console.log('⌬ Argus command deployment');
    console.log(`🎯 Target: ${isGlobalDeploy ? 'Global' : `Guild ${GUILD_ID}`}`);

    const commands = loadCommands();

    const route = isGlobalDeploy
        ? Routes.applicationCommands(CLIENT_ID)
        : Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);

    const deployed = await rest.put(route, { body: commands });

    console.log(`\n✅ Registered ${deployed.length} command(s) ${isGlobalDeploy ? 'globally' : `in guild ${GUILD_ID}`}.`);
    console.log('Old guild commands are replaced by this complete command set.');
}

main().catch(error => {
    console.error('❌ Command deployment failed:', error);
    process.exit(1);
});
