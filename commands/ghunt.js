const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { safeSpawn } = require('../utils/process');
const { createArgusEmbed } = require('../utils/embedBuilder');

const GHUNT_TIMEOUT_MS = 180000;
const MAX_OUTPUT = 9000;

const MODULES = Object.freeze({
    email: { args: value => ['email', value], label: 'Email' },
    gaia: { args: value => ['gaia', value], label: 'Gaia ID' },
    drive: { args: value => ['drive', value], label: 'Drive file/folder' },
    geolocate: { args: value => ['geolocate', '-b', value], label: 'BSSID' },
    spiderdal: { args: value => ['spiderdal', '-u', value], label: 'Digital Asset URL' }
});

function buildResult(title, description, output, color = 0x5865f2) {
    const clean = String(output || '').trim();
    const fields = clean
        ? [{ name: 'GHunt output', value: clean.slice(0, MAX_OUTPUT) }]
        : [{ name: 'Result', value: 'GHunt completed without returning output.' }];
    return createArgusEmbed({ title, description, color, fields, footer: 'GHunt • Google OSINT' }, { commandName: 'google-investigate' });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('google-investigate')
        .setDescription('Run Google OSINT investigations with GHunt')
        .addStringOption(option => option.setName('type').setDescription('Investigation type').setRequired(true).addChoices(
            { name: '📧 Email Lookup', value: 'email' },
            { name: '🆔 Gaia ID Lookup', value: 'gaia' },
            { name: '💾 Drive Analysis', value: 'drive' },
            { name: '📍 BSSID Geolocation', value: 'geolocate' },
            { name: '🔗 Digital Asset Links', value: 'spiderdal' },
            { name: '🔑 Login', value: 'login' }
        ))
        .addStringOption(option => option.setName('query').setDescription('Email, Gaia ID, Drive ID, BSSID, or URL').setRequired(false).setMaxLength(500)),

    async execute(interaction) {
        const type = interaction.options.getString('type', true);
        const query = String(interaction.options.getString('query') || '').trim();

        if (type === 'login') {
            return interaction.reply({
                embeds: [buildResult('🔑 GHunt Login', 'GHunt authentication must be completed on the machine running Argus.', 'Run ghunt login on the Argus host, finish authentication, then run /google-investigate again.', 0xf1c40f)],
                flags: MessageFlags.Ephemeral
            });
        }

        if (!query) {
            return interaction.reply({
                embeds: [buildResult('❌ Missing target', 'Provide a target in the query option for this investigation type.', 'Example: /google-investigate type:email query:name@example.com', 0xed4245)],
                flags: MessageFlags.Ephemeral
            });
        }

        const mod = MODULES[type];
        if (!mod) {
            return interaction.reply({
                embeds: [buildResult('❌ Unsupported investigation', 'That GHunt module is not supported by this Argus build.', 'Choose Email, Gaia, Drive, BSSID Geolocation, or Digital Asset Links.', 0xed4245)],
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();
        try {
            const result = await safeSpawn('ghunt', mod.args(query), { timeout: GHUNT_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
            const output = [result.stdout, result.stderr ? '\n[stderr]\n' + result.stderr : ''].join('').trim();
            if (result.code !== 0) {
                return interaction.editReply({ embeds: [buildResult('❌ GHunt investigation failed', mod.label + ' investigation returned a non-zero exit code.', output || 'GHunt returned no diagnostic output. Make sure GHunt is installed and authenticated.', 0xed4245)] });
            }
            return interaction.editReply({ embeds: [buildResult('🔎 Google Investigation', mod.label + ' investigation completed.', output || 'GHunt completed successfully without text output.', 0x5865f2)] });
        } catch (error) {
            const missing = error?.code === 'ENOENT' || /failed to start process/i.test(error?.message || '');
            return interaction.editReply({
                embeds: [buildResult(missing ? '❌ GHunt not installed' : '❌ GHunt request failed', missing ? 'The ghunt executable is not available on the Argus host.' : 'GHunt could not complete the investigation.', missing ? 'Install GHunt v2 and ensure ghunt is on PATH, then restart Argus.' : String(error?.message || 'Unknown error'), 0xed4245)]
            });
        }
    }
}