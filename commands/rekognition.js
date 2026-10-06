const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image-ai')
        .setDescription('Analyze an image with AI'),

    async execute(interaction) {
        await interaction.reply(
            '🔧 **Image AI** is temporarily being repaired. The command is registered and will be restored next.'
        );
    }
};
