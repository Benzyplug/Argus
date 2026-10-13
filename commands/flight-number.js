const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { getSafeAxiosConfig } = require('../utils/ssrf');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('flight-number')
    .setDescription('Look up a flight by flight number')
    .addStringOption(option =>
      option
        .setName('flight')
        .setDescription('Flight number, for example BA123')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const apiKey = process.env.AVIATIONSTACK_API_KEY;
    if (!apiKey) {
      return interaction.editReply('AviationStack is not configured for Argus.');
    }

    const flight = interaction.options.getString('flight', true).trim().toUpperCase();

    try {
      const response = await axios.get('https://api.aviationstack.com/v1/flights', {
        params: { access_key: apiKey, flight_iata: flight, limit: 1 },
        timeout: 10000,
        ...getSafeAxiosConfig()
      });

      const item = response.data?.data?.[0];
      if (!item) {
        return interaction.editReply('No flight information was found for `' + flight + '`.');
      }

      const airline = item.airline?.name || 'Unknown';
      const departure = item.departure;
      const arrival = item.arrival;
      const status = item.flight_status || 'Unknown';

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Flight ' + (item.flight?.iata || flight))
        .addFields(
          { name: 'Airline', value: airline, inline: true },
          { name: 'Status', value: status, inline: true },
          { name: 'Departure', value: departure?.airport || 'Unknown', inline: false },
          { name: 'Arrival', value: arrival?.airport || 'Unknown', inline: false }
        )
        .setFooter({ text: '⌬ ARGUS • AviationStack' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Flight-number lookup failed:', error);
      await interaction.editReply('Unable to retrieve flight information right now.');
    }
  }
};
