/**
 * File: flight-number.js
 * Description: Command to get flight tracking links for a given flight number
 * Author: ẞ€ÑZ¥
 * 
 * This command takes a flight number as input and generates tracking links
 * for various flight tracking services to help users monitor flights.
 */

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { safeShowModal } = require('../utils/interactionHelper');
const { createSelectMenu } = require('../utils/components');

function buildActionMenu() {
    return createSelectMenu(
        'argus:flight-number:actions',
        'flight number actions',
        [
            { label: 'Run again', value: 'again', description: 'Open the investigation form again', emoji: '🔎' },
            { label: 'View Argus help', value: 'help', description: 'Browse available Argus operations', emoji: '🧿' }
        ]
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('flight-number')
        .setDescription('Get flight tracking links for a flight number')
        .addStringOption(option =>
            option.setName('flight')
                .setDescription('The flight number (e.g. BA234, DL1234)')
                .setRequired(true)),
                
    async run(interaction) {
        try {
            const flightNumber = interaction.options.getString('flight');
            
            // Validate and standardize the flight number
            const standardizedFlightNumber = standardizeFlightNumber(flightNumber);
            if (!standardizedFlightNumber) {
                return await interaction.reply({
                    content: 'Please provide a valid flight number (e.g. BA234, DL1234, UA89).',
                    ephemeral: false
                });
            }
            
            // Generate links for the flight number
            const links = generateTrackingLinks(standardizedFlightNumber);
            
            // Create embed for response
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`Flight Tracking: ${standardizedFlightNumber.airline}${standardizedFlightNumber.number}`)
                .setDescription('Click on the links below to track this flight:')
                .addFields(
                    { name: 'AirNavRadar', value: links.airNavRadar, inline: false },
                    { name: 'FlightAware', value: links.flightAware, inline: false },
                    { name: 'Flightera', value: links.flightera, inline: false },
                    { name: 'AirportInfo Live', value: links.airportInfo, inline: false },
                    { name: 'FlightRadar24', value: links.flightRadar24, inline: false }
                )
                .setFooter({ text: 'Flight tracking data powered by multiple providers' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in flight-number command:', error);
            await interaction.reply({
                content: 'An error occurred while processing your request. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
    
    async execute(interaction) {
        return safeShowModal(interaction, new ModalBuilder()
            .setCustomId('argus:flight-number:modal')
            .setTitle('flight number')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('flight')
                        .setLabel('Flight number')
                        .setPlaceholder('BA234')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            ));
    },

    async handleInteraction(interaction) {
        if (interaction.isStringSelectMenu() && interaction.customId === 'argus:flight-number:actions') {
            if (interaction.values[0] === 'help') {
                await interaction.reply({ content: 'Use \`/help\` to browse the Argus command center.', ephemeral: true });
                return true;
            }
            if (interaction.values[0] === 'again') {
                return safeShowModal(interaction, new ModalBuilder()
                    .setCustomId('argus:flight-number:modal')
                    .setTitle('flight number')
                    .addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('flight').setLabel('Flight number').setPlaceholder('BA234').setStyle(TextInputStyle.Short).setRequired(true))
                    ));
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'argus:flight-number:modal') {
            const values = interaction.fields;
            const options = {
                getString: (name) => {
                    const value = values.getTextInputValue(name);
                    if (name === 'verbose' || name === 'include-nsfw') return value === 'true';
                    return value || null;
                },
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

/**
 * Standardize flight number into airline code and flight number
 * @param {string} input - Raw flight number input
 * @returns {object|null} - Object with airline and number properties, or null if invalid
 */
function standardizeFlightNumber(input) {
    if (!input) return null;
    
    // Remove spaces and convert to uppercase
    const cleanInput = input.toUpperCase().replace(/\s+/g, '');
    
    // Try to match airline code (2-3 letters) followed by flight number (1-4 digits)
    const match = cleanInput.match(/^([A-Z]{2,3})(\d{1,4})$/);
    if (!match) return null;
    
    const airline = match[1];
    const number = match[2];
    
    // Return standardized format
    return {
        airline: airline,
        number: number
    };
}

/**
 * Generate tracking links for various flight tracking websites
 * @param {object} flight - Standardized flight object
 * @returns {object} - Object containing links to various tracking websites
 */
function generateTrackingLinks(flight) {
    // Create the standard format
    const flightDesignator = `${flight.airline}${flight.number}`;
    
    return {
        airNavRadar: `https://www.airnavradar.com/data/flights/${flightDesignator}`,
        flightAware: `https://fr.flightaware.com/live/flight/${flightDesignator}`,
        flightera: `https://www.flightera.net/en/flight/${flightDesignator}`,
        airportInfo: `https://airportinfo.live/flight/${flightDesignator.toLowerCase()}`,
        flightRadar24: `https://www.flightradar24.com/data/flights/${flightDesignator.toLowerCase()}`
    };
}
