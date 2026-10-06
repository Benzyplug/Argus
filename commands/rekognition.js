const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image-ai')
        .setDescription('Analyze an image with AWS Rekognition')
        .addSubcommand(subcommand =>
            subcommand
                .setName('analyze')
                .setDescription('Analyze an image')
                .addAttachmentOption(option =>
                    option.setName('image')
                        .setDescription('Image to analyze')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('compare')
                .setDescription('Compare two images')
                .addAttachmentOption(option =>
                    option.setName('source_image')
                        .setDescription('Source image')
                        .setRequired(true))
                .addAttachmentOption(option =>
                    option.setName('target_image')
                        .setDescription('Target image')
                        .setRequired(true))),

    async execute(interaction) {
        await interaction.reply(
            '🔧 **Image AI** is temporarily being repaired. The command is registered and will be restored next.'
        );
    }
};
