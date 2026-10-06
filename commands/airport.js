/**
 * File: airport.js
 * Description: Comprehensive airport information and intelligence
 * Author: ẞ€ÑZ¥
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');

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
        // Load network dependencies only when the command is actually used.
        const axios = require('axios');
        const { getSafeAxiosConfig } = require('../utils/ssrf');

        await interaction.deferReply();

        const icao = interaction.options.getString('icao');
        const iata = interaction.options.getString('iata');

        if ((!icao && !iata) || (icao && iata)) {
            await interaction.editReply({
                content: 'Please provide either an ICAO code or an IATA code, but not both.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        try {
            if (icao) {
                await handleICAOSearch(interaction, icao, axios, getSafeAxiosConfig);
            } else {
                await handleIATASearch(interaction, iata, axios, getSafeAxiosConfig);
            }
        } catch (error) {
            console.error('Error fetching airport data:', {
                message: error.message,
                status: error.response?.status
            });
            const codeType = icao ? 'ICAO' : 'IATA';
            await interaction.editReply(
                `Error fetching airport data. Please check the ${codeType} code and try again.`
            );
        }
    }
};

async function handleICAOSearch(interaction, icao, axios, getSafeAxiosConfig) {
    const apiToken = process.env.AIRPORTDB_API_KEY;
    if (!apiToken) {
        await interaction.editReply('Error: API token not found. Please check the .env file.');
        return;
    }

    const response = await axios.get(`https://airportdb.io/api/v1/airport/${icao}`, {
        params: { apiToken },
        timeout: 15000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        ...getSafeAxiosConfig()
    });

    await interaction.editReply({ embeds: [createEmbed(response.data)] });
}

async function handleIATASearch(interaction, iata, axios, getSafeAxiosConfig) {
    const response = await axios.get('https://api.travelpayouts.com/data/en/airports.json', {
        timeout: 15000,
        maxContentLength: 10 * 1024 * 1024,
        maxBodyLength: 10 * 1024 * 1024,
        ...getSafeAxiosConfig()
    });

    const airports = response.data;
    const airport = airports.find(a => a.code === iata);

    if (!airport) {
        await interaction.editReply(`No airport found with IATA code: ${iata}`);
        return;
    }

    const embed = {
        color: 0x0099ff,
        title: `${airport.name} (${airport.code})`,
        fields: [
            { name: 'IATA Code', value: airport.code, inline: true },
            { name: 'City Code', value: airport.city_code || 'N/A', inline: true },
            { name: 'Country', value: airport.country_code || 'N/A', inline: true },
            { name: 'Time Zone', value: airport.time_zone || 'N/A', inline: true },
            { name: 'Coordinates', value: `${airport.coordinates.lat}, ${airport.coordinates.lon}`, inline: true },
            { name: 'Flightable', value: airport.flightable ? 'Yes' : 'No', inline: true }
        ],
        footer: { text: 'Data provided by TravelPayouts API' }
    };

    await interaction.editReply({ embeds: [embed] });

    try {
        const apiToken = process.env.AIRPORTDB_API_KEY;
        if (apiToken) {
            const detailedResponse = await axios.get(`https://airportdb.io/api/v1/airport/iata/${iata}`, {
                params: { apiToken },
                timeout: 15000,
                maxContentLength: 5 * 1024 * 1024,
                maxBodyLength: 5 * 1024 * 1024,
                ...getSafeAxiosConfig()
            });

            if (detailedResponse.data) {
                await interaction.followUp({
                    content: 'Additional details found:',
                    embeds: [createEmbed(detailedResponse.data)]
                });
            }
        }
    } catch (error) {
        console.log(`Could not fetch additional data for IATA ${iata}: ${error.message}`);
    }
}

function createEmbed(airport) {
    return {
        color: 0x0099ff,
        title: `${airport.name} (${airport.icao_code || airport.icao})`,
        fields: [
            { name: 'Home', value: airport.home_link || 'N/A' },
            { name: 'Wiki', value: airport.wikipedia_link || 'N/A' },
            { name: 'IATA Code', value: airport.iata_code || 'N/A', inline: true },
            { name: 'Type', value: airport.type || 'N/A', inline: true },
            { name: 'Location', value: `${airport.municipality || 'N/A'}, ${airport.iso_country || 'N/A'}`, inline: true },
            { name: 'Coordinates', value: `${airport.latitude_deg || airport.lat}, ${airport.longitude_deg || airport.lon}`, inline: true },
            { name: 'Elevation', value: airport.elevation_ft ? `${airport.elevation_ft} ft` : 'N/A', inline: true },
            { name: 'Runways', value: airport.runways ? airport.runways.length.toString() : 'N/A', inline: true }
        ],
        footer: { text: 'Data provided by AirportDB.io' }
    };
}
