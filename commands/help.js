const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const path = require('node:path');
const fs = require('node:fs');
const { RESTRICTED_COMMANDS } = require('../utils/permissions');
const pkg = require('../package.json');
const { createSelectMenu } = require('../utils/components');
const { safeShowModal } = require('../utils/interactionHelper');

const HELP_MENU_ID = 'argus:help:category';
const HELP_HOME_ID = 'argus:help:home';
const HELP_SEARCH_ID = 'argus:help:search';
const HELP_MODAL_ID = 'argus:help:search:modal';
const HELP_MODAL_INPUT_ID = 'argus:help:search:query';

const BANNER_PATH = path.join(__dirname, '..', 'banner.png');
const BANNER_NAME = 'banner.png';

const GROUPS = [
  {
    key: 'rankings',
    title: '🎖 Rankings',
    description: 'Core Argus information',
    names: ['bot']
  },
  {
    key: 'web',
    title: '🌐 Web Intelligence',
    description: 'Web, domain, URL and network reconnaissance',
    names: ['dns', 'dork', 'extract-links', 'favicon', 'host-lookup', 'link-check', 'redirect-check', 'web-recon', 'whois', 'cert-search', 'subdomain-enum', 'wayback-history', 'web-tech', 'shodan-lookup', 'ip-info', 'ip-reputation']
  },
  {
    key: 'identity',
    title: '🕵️ OSINT & Identity',
    description: 'Identity, email and public-data investigation',
    names: ['company-search', 'google-investigate', 'maigret', 'nike', 'sherlock', 'username-gen', 'avatar-search', 'email-breach', 'email-footprint']
  },
  {
    key: 'transport',
    title: '🛰️ Transport',
    description: 'Airport, flight, vehicle and vessel intelligence',
    names: ['airport', 'flight', 'flight-number', 'vehicle', 'vessel']
  },
  {
    key: 'files',
    title: '🧬 Files & Data',
    description: 'Blockchain, metadata and file analysis',
    names: ['blockchain', 'crypto-detect', 'doc-meta', 'exif', 'upload']
  },
  {
    key: 'utilities',
    title: '🤖 AI & Utilities',
    description: 'AI, monitoring and security utilities',
    names: ['ai', 'health', 'image-ai', 'jwt', 'monitor', 'nuclei-scan']
  }
];

function availableCommands(client) {
  return new Map(
    [...client.commands.values()].map(cmd => [cmd.data.name, {
      name: cmd.data.name,
      description: cmd.data.description || 'Argus operation',
      restricted: Object.prototype.hasOwnProperty.call(RESTRICTED_COMMANDS, cmd.data.name)
    }])
  );
}

function buildFooter() {
  return 'Made with ❤️ • ARGUS v' + pkg.version + ' • ẞ€ÑZ¥';
}

function attachBanner(embed) {
  if (fs.existsSync(BANNER_PATH)) {
    embed.setImage('attachment://' + BANNER_NAME);
  }
  return embed;
}

function baseEmbed(client) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: 'ARGUS • Open Source Intelligence',
      iconURL: client.user?.displayAvatarURL?.({ extension: 'png', size: 128 })
    });
}

function buildMainEmbed(client) {
  const embed = baseEmbed(client)
    .setTitle('🛡️ ARGUS Help Center')
    .setDescription(
      'Your open-source intelligence toolkit for discovering, investigating, and correlating public information.\n\n' +
      '**Getting Started**\n' +
      'Use the menu below to browse Argus commands by category. Select a category to view its available operations.\n\n' +
      '**How It Works**\n' +
      '• Choose a category from the menu\n' +
      '• Select an operation to see what it does\n' +
      '• Use the command directly from Discord\n\n' +
      '**Need help?** Contact <@1317480616048070656>.'
    );

  embed.addFields(
    ...GROUPS.map(group => ({
      name: group.title,
      value: group.description,
      inline: true
    }))
  );

  return attachBanner(embed.setTimestamp().setFooter({ text: buildFooter() }));
}

function buildCategoryEmbed(client, key) {
  const group = GROUPS.find(item => item.key === key);
  if (!group) return buildMainEmbed(client);

  const available = availableCommands(client);
  const items = group.names.map(name => available.get(name)).filter(Boolean);

  const embed = baseEmbed(client)
    .setTitle(group.title)
    .setDescription(
      group.description + '\n\n' +
      'Select an operation below to use it in Discord.'
    );

  if (items.length) {
    embed.addFields({
      name: 'Available commands',
      value: items
        .map(command => {
          const lock = command.restricted ? '🔒 ' : '';
          return lock + '**' + command.name + '** — ' + command.description;
        })
        .join('\n')
    });
  } else {
    embed.addFields({
      name: 'Available commands',
      value: 'No commands are currently registered in this category.'
    });
  }

  return attachBanner(embed.setTimestamp().setFooter({ text: buildFooter() }));
}

function buildSearchEmbed(client, query) {
  const available = availableCommands(client);
  const clean = String(query || '').trim().replace(/^\//, '').toLowerCase();

  const matches = [...available.values()]
    .filter(command =>
      command.name.includes(clean) ||
      command.description.toLowerCase().includes(clean)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 15);

  const embed = baseEmbed(client)
    .setColor(matches.length ? 0x5865f2 : 0xe74c3c)
    .setTitle(matches.length ? '🔎 Command Search' : '❌ No Command Found')
    .setDescription(
      matches.length
        ? 'Results for **' + clean.slice(0, 100) + '**'
        : (clean ? 'Nothing matched **' + clean.slice(0, 100) + '**.' : 'Enter a command name or keyword.')
    );

  if (matches.length) {
    embed.addFields({
      name: 'Matches',
      value: matches.map(command => {
        const lock = command.restricted ? '🔒 ' : '';
        return lock + '**' + command.name + '** — ' + command.description;
      }).join('\n')
    });
  }

  return attachBanner(embed.setTimestamp().setFooter({ text: buildFooter() }));
}

function buildComponents(selectedKey = null) {
  const options = [
    {
      label: 'All Commands',
      value: 'all',
      description: 'Return to the Argus Help Center',
      emoji: '🛡️',
      default: !selectedKey
    },
    ...GROUPS.map(group => ({
      label: group.title.replace(/^\S+\s+/, ''),
      value: group.key,
      description: group.description.slice(0, 100),
      default: selectedKey === group.key
    })),
    {
      label: 'Find a command…',
      value: 'search',
      description: 'Search Argus commands by name or keyword',
      emoji: '🔎'
    }
  ];

  return [
    createSelectMenu(
      HELP_MENU_ID,
      'Select to view the commands',
      options
    )
  ];
}

function buildButtons(showHome = false) {
  const buttons = [];

  if (showHome) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(HELP_HOME_ID)
        .setLabel('Back')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(HELP_SEARCH_ID)
      .setLabel('Find a Command')
      .setEmoji('🔎')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel('Report Bug')
      .setURL('https://github.com/Benzyplug/Argus/issues')
      .setStyle(ButtonStyle.Link)
  );

  return [new ActionRowBuilder().addComponents(buttons)];
}

function buildPayload(client, selectedKey = null) {
  const main = !selectedKey;

  return {
    embeds: [main ? buildMainEmbed(client) : buildCategoryEmbed(client, selectedKey)],
    components: [...buildComponents(selectedKey), ...buildButtons(!main)],
    allowedMentions: { parse: [] },
    files: fs.existsSync(BANNER_PATH) ? [{ attachment: BANNER_PATH, name: BANNER_NAME }] : [],
    __argusRaw: true
  };
}

function buildAllPayload(client) {
  return buildPayload(client);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View the Argus command guide'),

  async execute(interaction) {
    await interaction.reply(buildPayload(interaction.client));
  },

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === HELP_MENU_ID) {
      const selected = interaction.values[0];

      if (selected === 'search') {
        const modal = new ModalBuilder()
          .setCustomId(HELP_MODAL_ID)
          .setTitle('Find an Argus command')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(HELP_MODAL_INPUT_ID)
                .setLabel('Command name or keyword')
                .setPlaceholder('Example: dns, email, reconnaissance')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setRequired(true)
            )
          );

        await safeShowModal(interaction, modal);
        return true;
      }

      const payload = selected === 'all'
        ? buildAllPayload(interaction.client)
        : buildPayload(interaction.client, selected);

      delete payload.files;
      delete payload.__argusRaw;
      await interaction.update(payload);
      return true;
    }

    if (interaction.isButton() && interaction.customId === HELP_SEARCH_ID) {
      const modal = new ModalBuilder()
        .setCustomId(HELP_MODAL_ID)
        .setTitle('Find an Argus command')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(HELP_MODAL_INPUT_ID)
              .setLabel('Command name or keyword')
              .setPlaceholder('Example: dns, email, reconnaissance')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(50)
              .setRequired(true)
          )
        );

      await safeShowModal(interaction, modal);
      return true;
    }

    if (interaction.isButton() && interaction.customId === HELP_HOME_ID) {
      await interaction.update(buildPayload(interaction.client));
      return true;
    }

    if (interaction.isModalSubmit() && interaction.customId === HELP_MODAL_ID) {
      const query = interaction.fields.getTextInputValue(HELP_MODAL_INPUT_ID);
      const payload = buildPayload(interaction.client);
      payload.embeds = [buildSearchEmbed(interaction.client, query)];
      payload.components = [...buildComponents(null), ...buildButtons(false)];

      await interaction.reply({
        ...payload,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
        __argusRaw: true
      });
      return true;
    }

    return false;
  }
};
