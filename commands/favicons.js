const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('favicon')
        .setDescription('Extract and analyze a website favicon')
        .addStringOption(option =>
            option
                .setName('url')
                .setDescription('Website URL to analyze')
                .setRequired(true))
        .addBooleanOption(option =>
            option
                .setName('raw')
                .setDescription('Include raw analysis data')
                .setRequired(false))
        .addBooleanOption(option =>
            option
                .setName('verbose')
                .setDescription('Show detailed discovery information')
                .setRequired(false))
        .addStringOption(option =>
            option
                .setName('format')
                .setDescription('Hash output format')
                .setRequired(false)
                .addChoices(
                    { name: 'Decimal', value: 'decimal' },
                    { name: 'Hexadecimal', value: 'hex' },
                    { name: 'Both', value: 'both' }
                )),

    async execute(interaction) {
        await interaction.reply(
            '⚠️ **Favicon Analysis Unavailable**\n> The favicon intelligence module is currently unavailable. Please try again later.'
        );
    }
};
