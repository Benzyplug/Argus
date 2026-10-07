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
        const icao = interaction.options.getString('icao');
        const iata = interaction.options.getString('iata');
        const code = icao || iata;
        if (!code) {
            return interaction.reply('⚠️ **Airport Lookup**\n> Provide an ICAO or IATA airport code to continue.');
        }
        return interaction.reply('⚠️ **Airport Lookup Unavailable**\n> The airport intelligence source is currently unavailable. Please try again later.');
    }
};
