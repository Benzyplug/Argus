const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('airport')
        .setDescription('Get information about an airport')
        .addStringOption(option =>
            option.setName('icao')
                .setDescription('The ICAO code of the airport (KJFK)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('iata')
                .setDescription('The IATA code of the airport (JFK)')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.reply('Airport command is currently being repaired.');
    }
};
