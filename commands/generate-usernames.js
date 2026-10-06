const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('username-gen')
        .setDescription('Generate username combinations for OSINT investigations')
        .addStringOption(option =>
            option.setName('firstname')
                .setDescription('First name')
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(50))
        .addStringOption(option =>
            option.setName('lastname')
                .setDescription('Last name')
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(50))
        .addStringOption(option =>
            option.setName('separators')
                .setDescription('Separators, e.g. .,_, -')
                .setRequired(false)
                .setMaxLength(50))
        .addStringOption(option =>
            option.setName('suffix')
                .setDescription('Optional suffix')
                .setRequired(false)
                .setMaxLength(20))
        .addStringOption(option =>
            option.setName('prefix')
                .setDescription('Optional prefix')
                .setRequired(false)
                .setMaxLength(20))
        .addBooleanOption(option =>
            option.setName('include-numbers')
                .setDescription('Include common number variations')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('case-variations')
                .setDescription('Include case variations')
                .setRequired(false)),

    async execute(interaction) {
        const firstName = clean(interaction.options.getString('firstname'));
        const lastName = clean(interaction.options.getString('lastname'));
        const separators = interaction.options.getString('separators') || '.,_,-';
        const suffix = clean(interaction.options.getString('suffix') || '');
        const prefix = clean(interaction.options.getString('prefix') || '');
        const includeNumbers = interaction.options.getBoolean('include-numbers') ?? false;
        const caseVariations = interaction.options.getBoolean('case-variations') !== false;

        if (!firstName || !lastName) {
            return interaction.reply({
                content: '❌ Please provide a valid first and last name.',
                flags: MessageFlags.Ephemeral
            });
        }

        const usernames = generateUsernames({
            firstName,
            lastName,
            separators,
            prefix,
            suffix,
            includeNumbers,
            caseVariations
        });

        const content =
            '# Argus Username Variations\\n' +
            '# For: ' + firstName + ' ' + lastName + '\\n' +
            '# Total: ' + usernames.length + '\\n\\n' +
            usernames.join('\\n') + '\\n';

        const attachment = new AttachmentBuilder(
            Buffer.from(content, 'utf8'),
            { name: 'usernames_' + firstName + '_' + lastName + '.txt' }
        );

        const preview = usernames.slice(0, 20)
            .map((username, index) => (index + 1) + '. ' + username)
            .join('\\n');

        return interaction.reply({
            content:
                '👤 **Username Variations**\\n' +
                '**For:** ' + firstName + ' ' + lastName + '\\n' +
                '**Total:** ' + usernames.length + '\\n\\n' +
                '```\\n' + preview + '\\n```',
            files: [attachment],
            flags: MessageFlags.Ephemeral
        });
    }
};

function clean(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/[\\r\\n\\0]/g, '')
        .replace(/[<>"';&|\`$(){}[\]\\]/g, '')
        .trim()
        .slice(0, 100);
}

function generateUsernames({ firstName, lastName, separators, prefix, suffix, includeNumbers, caseVariations }) {
    const usernames = new Set();
    const firstInitial = firstName[0];
    const lastInitial = lastName[0];
    const firstThree = firstName.slice(0, 3);
    const lastThree = lastName.slice(0, 3);

    const add = (value, extraSuffix = '', extraPrefix = '') => {
        const username = extraPrefix + prefix + value + suffix + extraSuffix;
        usernames.add(username.toLowerCase());
        if (caseVariations) {
            usernames.add(username.toUpperCase());
            usernames.add(username.charAt(0).toUpperCase() + username.slice(1).toLowerCase());
        }
    };

    [
        firstName + lastName,
        lastName + firstName,
        firstInitial + lastName,
        lastName + firstInitial,
        firstName + lastInitial,
        lastInitial + firstName,
        firstThree + lastThree,
        lastThree + firstThree,
        firstName,
        lastName,
        firstInitial + lastInitial,
        lastInitial + firstInitial
    ].forEach(value => add(value));

    separators.split(',').map(s => s.trim()).filter(Boolean).forEach(separator => {
        [
            firstName + separator + lastName,
            lastName + separator + firstName,
            firstName + separator + lastInitial,
            lastName + separator + firstInitial,
            firstInitial + separator + lastName,
            lastInitial + separator + firstName,
            firstThree + separator + lastThree,
            lastThree + separator + firstThree
        ].forEach(value => add(value));
    });

    if (includeNumbers) {
        const base = Array.from(usernames);
        for (const username of base) {
            for (const number of ['1', '01', '12', '123', '2025']) {
                usernames.add(username + number);
            }
        }
    }

    return Array.from(usernames).sort();
}
