/**
 * File: airport.js
 * Description: Comprehensive airport information and intelligence
 * Author: ẞ€ÑZ¥
 */

const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { safeShowModal } = require('../utils/interactionHelper');
const { createSelectMenu } = require('../utils/components');

function buildActionMenu() {
    return createSelectMenu('argus:airport:actions', 'airport actions', [
        { label: 'Run again', value: 'again', description: 'Open the investigation form again', emoji: '🔎' },
        { label: 'View Argus help', value: 'help', description: 'Browse available Argus operations', emoji: '🧿' }
    ]);
}

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

    async run(interaction) {
        // Load network dependencies only when the command is actually used.
        const axios = require('axios');
        const { getSafeAxiosConfig } = require('../utils/ssrf');

        await interaction.deferReply();

        const icao = interaction.options.getString('icao');
        const iata = interaction.options.getString('iata');

        if ((!icao && !iata) || (icao && iata)) {
            await interaction.editReply({
                content: '⚠️ **Airport Lookup**\n> Provide exactly one airport code: ICAO or IATA.',
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
                `❌ **Airport Lookup Failed**\n> Check the ${codeType} code and try again.`
            );
        }
    }
    async execute(interaction) {
        return safeShowModal(interaction, new ModalBuilder()
            .setCustomId('argus:airport:modal')
            .setTitle('airport')
            .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('icao').setLabel('ICAO code').setPlaceholder('KJFK').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('iata').setLabel('IATA code').setPlaceholder('JFK').setStyle(TextInputStyle.Short).setRequired(false))));
    },

    async handleInteraction(interaction) {
        if (interaction.isStringSelectMenu() && interaction.customId === 'argus:airport:actions') {
            if (interaction.values[0] === 'help') {
                await interaction.reply({ content: 'Use \`/help\` to browse the Argus command center.', ephemeral: true });
                return true;
            }
            if (interaction.values[0] === 'again') {
                return safeShowModal(interaction, new ModalBuilder()
                    .setCustomId('argus:airport:modal')
                    .setTitle('airport')
                    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('icao').setLabel('ICAO code').setPlaceholder('KJFK').setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('iata').setLabel('IATA code').setPlaceholder('JFK').setStyle(TextInputStyle.Short).setRequired(false))));
            }
        }
        if (interaction.isModalSubmit() && interaction.customId === 'argus:airport:modal') {
            const values = interaction.fields;
            const options = {
                getString: (name) => values.getTextInputValue(name) || null,
                getBoolean: (name) => {
                    const value = values.getTextInputValue(name);
                    return value === undefined || value === '' ? null : value === 'true';
                },
                getInteger: (name) => {
                    const value = values.getTextInputValue(name);
                    const parsed = Number.parseInt(value, 10);
                    return Number.isFinite(parsed) ? parsed : null;
                },
                getSubcommand: () => null
            };
            const modalInteraction = new Proxy(interaction, {
                get(target, prop) {
                    if (prop === 'options') return options;
                    const value = Reflect.get(target, prop, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });
            await this.run(modalInteraction);
            await interaction.editReply({ components: [buildActionMenu()] });
            return true;
        }
        return false;
    }
};

async function handleICAOSearch(interaction, icao, axios, getSafeAxiosConfig) {
    const apiToken = process.env.AIRPORTDB_API_KEY;
    if (!apiToken) {
        await interaction.editReply('⚠️ **Airport Lookup Unavailable**\n> The airport intelligence source is not configured.\n\n**Status** `Not configured`');
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
        await interaction.editReply(`❌ **Airport Not Found**\n> No airport was found for IATA code \`${iata}\`.`);
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
