const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('extract-links')
        .setDescription('Extract links from a webpage'),

    async execute(interaction) {
        await interaction.reply(
            '🔧 **Extract Links** is temporarily being repaired. The command is registered and will be restored next.'
        );
    }
};
