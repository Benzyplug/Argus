const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('google-investigate')
        .setDescription('Run Google OSINT investigations with GHunt')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Investigation type')
                .setRequired(true)
                .addChoices(
                    { name: '📧 Email Lookup', value: 'email' },
                    { name: '🆔 Gaia ID Lookup', value: 'gaia' },
                    { name: '💾 Drive Analysis', value: 'drive' },
                    { name: '📍 BSSID Geolocation', value: 'geolocate' },
                    { name: '🔗 Digital Asset Links', value: 'spiderdal' },
                    { name: '🔑 Login', value: 'login' },
                    { name: '🔍 Check Login', value: 'check-login' }
                ))
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Email, ID, URL, BSSID, domain, or login token')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('token')
                .setDescription('Base64 GHunt token for login')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('sight')
                .setDescription('Find Google Sight profiles for email searches')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('driver')
                .setDescription('Use Chrome driver where supported')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.reply('🔧 **Google Investigate** is temporarily being repaired. The command is registered and will be restored next.');
    }
};
