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

const OWNER_ID = '1317480616048070656';
const HELP_MENU_ID = 'argus:help:category';
const HELP_HOME_ID = 'argus:help:home';
const HELP_SEARCH_ID = 'argus:help:search';
const HELP_MODAL_ID = 'argus:help:search:modal';
const HELP_MODAL_INPUT_ID = 'argus:help:search:query';
const HELP_TIMEOUT_MS = 5 * 60 * 1000;

const BANNER_PATH = path.join(__dirname, '..', 'banner.png');
const BANNER_NAME = 'banner.png';

const GROUPS = [
  { key: 'rankings', title: '🎖 Rankings', description: 'Bot information and rankings', names: ['bot'] },
  { key: 'web', title: '🌐 Web Intelligence', description: 'Domains, hosts, links and web reconnaissance', names: ['dns', 'dork', 'extract-links', 'favicon', 'host-lookup', 'link-check', 'redirect-check', 'web-recon', 'whois', 'subdomain-enum', 'cert-search', 'ip-info', 'shodan-lookup', 'ip-reputation', 'wayback-history', 'web-tech'] },
  { key: 'identity', title: '🕵️ OSINT & Identity', description: 'Identity, usernames and company intelligence', names: ['company-search', 'email-footprint', 'email-breach', 'avatar-search', 'maigret', 'sherlock', 'username-gen'] },
  { key: 'transport', title: '🛰️ Transport', description: 'Airport, flight, vehicle and vessel intelligence', names: ['airport', 'flight', 'vehicle', 'vessel'] },
  { key: 'files', title: '🧬 Files & Data', description: 'Files, metadata and blockchain analysis', names: ['blockchain', 'crypto-detect', 'doc-meta', 'exif', 'upload'] },
  { key: 'utilities', title: '🤖 AI & Utilities', description: 'AI, monitoring, learning and security utilities', names: ['ai', 'health', 'image-ai', 'jwt', 'monitor', 'nuclei-scan', 'explain', 'workflow', 'quiz', 'challenge', 'report', 'glossary', 'case-study', 'how-it-works', 'build-your-own', 'legal-check', 'ethics', 'opsec-tips', 'profile', 'streak', 'leaderboard', 'unlock'] }
];

function cleanCategoryTitle(title) {
  return title.replace(/^\S+\s+/, '');
}

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
  return '⌬ 𝐀𝐑𝐆𝐔𝐒 • 𝐯' + pkg.version + ' • 𝐁𝐘 ẞ€ÑZ¥';
}

function attachBanner(embed) {
  if (fs.existsSync(BANNER_PATH)) embed.setImage('attachment://' + BANNER_NAME);
  return embed;
}

function buildMainEmbed(client) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: 'ARGUS • Open Source Intelligence',
      iconURL: client.user?.displayAvatarURL?.({ extension: 'png', size: 128 })
    })
    .setTitle('Command Center')
    .setDescription(
      'A focused OSINT toolkit for reconnaissance, investigation, and analysis.\\n\\n' +
      '**Getting Started**\\n' +
      'Select a category below to explore Argus operations. Use **Find a command** when you already know what you are looking for.\\n\\n' +
      '**How It Works**\\n' +
      '• Pick a category\\n' +
      '• Choose an operation\\n' +
      '• Run the command and follow the result'
    )
    .setFooter({ text: buildFooter() });
  return attachBanner(embed);
}

function buildCategoryEmbed(client, key) {
  const group = GROUPS.find(item => item.key === key);
  if (!group) return buildMainEmbed(client);

  const available = availableCommands(client);
  const items = group.names.map(name => available.get(name)).filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: 'ARGUS • Open Source Intelligence',
      iconURL: client.user?.displayAvatarURL?.({ extension: 'png', size: 128 })
    })
    .setTitle(group.title)
    .setDescription(group.description + '\\n\\nSelect another category below to switch sections.');

  if (items.length) {
    const lines = items.map(command => {
      const lock = command.restricted ? '🔒 ' : '';
      return lock + '</' + command.name + '> — ' + command.description;
    });
    for (let i = 0; i < lines.length; i += 12) {
      embed.addFields({
        name: lines.length > 12 ? 'Operations ' + (Math.floor(i / 12) + 1) : 'Operations',
        value: lines.slice(i, i + 12).join('\\n'),
        inline: false
      });
    }
  } else {
    embed.addFields({ name: 'Operations', value: 'No commands are currently registered in this category.' });
  }

  embed.setFooter({ text: buildFooter() });
  return attachBanner(embed);
}

function buildSearchEmbed(client, query) {
  const available = availableCommands(client);
  const clean = String(query || '').trim().replace(/^\\//, '').toLowerCase();

  const matches = [...available.values()]
    .filter(command =>
      command.name.includes(clean) ||
      command.description.toLowerCase().includes(clean)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 15);

  const embed = new EmbedBuilder()
    .setColor(matches.length ? 0x5865f2 : 0xe74c3c)
    .setAuthor({
      name: 'ARGUS • Open Source Intelligence',
      iconURL: client.user?.displayAvatarURL?.({ extension: 'png', size: 128 })
    })
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
        return lock + '</' + command.name + '> — ' + command.description;
      }).join('\\n')
    });
  }

  embed.setFooter({ text: buildFooter() });
  return attachBanner(embed);
}

function buildComponents(selectedKey = null) {
  const options = [
    {
      label: 'All Operations',
      value: 'all',
      description: 'Browse every Argus command',
      emoji: '🧿',
      default: !selectedKey
    },
    ...GROUPS.map(group => ({
      label: cleanCategoryTitle(group.title),
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

  return [createSelectMenu(HELP_MENU_ID, 'Select a category or find a command…', options)];
}

function buildButtons(showHome = false) {
  const buttons = [];
  if (showHome) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(HELP_HOME_ID)
        .setLabel('Home')
        .setEmoji('⌂')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId(HELP_SEARCH_ID)
      .setLabel('Find Command')
      .setEmoji('🔎')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel('Support')
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
  const available = availableCommands(client);
  const groups = GROUPS.map(group => {
    const items = group.names.map(name => available.get(name)).filter(Boolean);
    return '**' + group.title + '**\\n' + (items.length
      ? items.map(c => (c.restricted ? '🔒 ' : '') + '</' + c.name + '>').join('  •  ')
      : 'No commands');
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: 'ARGUS • Open Source Intelligence',
      iconURL: client.user?.displayAvatarURL?.({ extension: 'png', size: 128 })
    })
    .setTitle('All Operations')
    .setDescription(groups.join('\\n\\n'))
    .setFooter({ text: buildFooter() });

  attachBanner(embed);
  return {
    embeds: [embed],
    components: buildComponents('all'),
    allowedMentions: { parse: [] },
    files: fs.existsSync(BANNER_PATH) ? [{ attachment: BANNER_PATH, name: BANNER_NAME }] : [],
    __argusRaw: true
  };
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
      delete payload.files;
      delete payload.__argusRaw;
      await interaction.reply({
        ...payload,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
      return true;
    }

    return false;
  }
};
