const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const { RESTRICTED_COMMANDS } = require('../utils/permissions');
const pkg = require('../package.json');
const { createSelectMenu } = require('../utils/components');
const { safeShowModal } = require('../utils/interactionHelper');

const OWNER_ID = '1317480616048070656';
const OWNER_MENTION = '<@' + OWNER_ID + '>';
const HELP_MENU_ID = 'argus:help:category';
const HELP_MODAL_OPEN_ID = 'argus:help:custom';
const HELP_MODAL_ID = 'argus:help:custom:modal';
const HELP_MODAL_INPUT_ID = 'argus:help:custom:command';

const GROUPS = [
  { key: 'rankings', title: '🎖 Rankings', description: 'Bot information and rankings', names: ['bot'] },
  { key: 'web', title: '🌐 Web Intelligence', description: 'Domains, hosts, links and web reconnaissance', names: ['dns', 'dork', 'extract-links', 'favicon', 'host-lookup', 'link-check', 'redirect-check', 'web-recon', 'whois', 'subdomain-enum', 'cert-search', 'ip-info', 'shodan-lookup', 'ip-reputation', 'wayback-history', 'web-tech'] },
  { key: 'identity', title: '🕵️ OSINT & Identity', description: 'Identity, usernames and company intelligence', names: ['company-search', 'email-footprint', 'email-breach', 'avatar-search', 'maigret', 'sherlock', 'username-gen'] },
  { key: 'transport', title: '🛰️ Transport', description: 'Airport, flight, vehicle and vessel intelligence', names: ['airport', 'flight', 'vehicle', 'vessel'] },
  { key: 'files', title: '🧬 Files & Data', description: 'Files, metadata and blockchain analysis', names: ['blockchain', 'crypto-detect', 'doc-meta', 'exif', 'upload'] },
  { key: 'utilities', title: '🤖 AI & Utilities', description: 'AI, monitoring and security utilities', names: ['ai', 'health', 'image-ai', 'jwt', 'monitor', 'nuclei-scan', 'explain', 'workflow', 'quiz', 'challenge', 'report', 'glossary', 'case-study', 'how-it-works', 'build-your-own', 'legal-check', 'ethics', 'opsec-tips', 'profile', 'streak', 'leaderboard', 'unlock'] }
];

function commandLine(items) {
  return items.map(c => (c.restricted ? '🔒 ' : '› ') + '`/' + c.name + '`').join('  •  ');
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

function buildHelpEmbed(client, selectedKey = null) {
  const available = availableCommands(client);
  if (!selectedKey) {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⌬ ARGUS • Command Center')
      .setDescription('**Open-source intelligence toolkit**\nChoose a category below to browse operations, or use **Find a command…** to search.')
      .addFields(GROUPS.map(group => ({ name: group.title, value: group.description, inline: true })))
      .setFooter({ text: '⌬ 𝐀𝐑𝐆𝐔𝐒 • 𝐯' + pkg.version + ' • 𝐁𝐘 ẞ€ÑZ¥' })
      .setTimestamp();
  }
  const group = GROUPS.find(item => item.key === selectedKey);
  if (!group) return buildHelpEmbed(client);
  const items = group.names.map(name => available.get(name)).filter(Boolean);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(group.title)
    .setDescription(group.description + '\n\nChoose another category below to switch sections.')
    .setFooter({ text: '⌬ 𝐀𝐑𝐆𝐔𝐒 • 𝐯' + pkg.version + ' • 𝐁𝐘 ẞ€ÑZ¥' })
    .setTimestamp();
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10);
    embed.addFields({
      name: items.length > 10 ? 'Operations ' + (Math.floor(i / 10) + 1) : 'Operations',
      value: commandLine(chunk),
      inline: false
    });
  }
  return embed;
}
function buildHelpComponents(selectedKey = null) {
  const options = [
    { label: 'All operations', value: 'all', description: 'Show every Argus command group', emoji: '🧿', default: !selectedKey },
    ...GROUPS.map(group => ({
      label: group.title.replace(/^\\S+\\s*/, '').slice(0, 100),
      value: group.key,
      description: group.description.slice(0, 100),
      default: selectedKey === group.key
    })),
    { label: 'Find a command…', value: 'custom', description: 'Open a command finder modal', emoji: '🔎' }
  ];
  return [createSelectMenu(HELP_MENU_ID, 'Choose an Argus category', options)];
}

function buildCommandEmbed(client, query) {
  const available = availableCommands(client);
  const clean = String(query || '').trim().replace(/^\//, '').toLowerCase();
  const matches = [...available.values()]
    .filter(command => command.name.includes(clean) || command.description.toLowerCase().includes(clean))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 15);
  if (!clean || !matches.length) {
    return new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('❌ No command found')
      .setDescription(clean ? 'Nothing matched `' + clean.slice(0, 100) + '`.' : 'Enter a command name or keyword.')
      .setFooter({ text: '⌬ 𝐀𝐑𝐆𝐔𝐒 • 𝐯' + pkg.version + ' • 𝐁𝐘 ẞ€ÑZ¥' })
      .setTimestamp();
  }
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔎 Command Search')
    .setDescription('Results for **' + clean.slice(0, 100) + '**')
    .addFields({
      name: 'Matches',
      value: matches.map(command => (command.restricted ? '🔒' : '›') + ' `/' + command.name + '` — ' + command.description).join('\n')
    })
    .setFooter({ text: '⌬ 𝐀𝐑𝐆𝐔𝐒 • 𝐯' + pkg.version + ' • 𝐁𝐘 ẞ€ÑZ¥' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('View the Argus command guide'),

  async execute(interaction) {
    await interaction.reply({
      embeds: [buildHelpEmbed(interaction.client)],
      components: buildHelpComponents(),
      allowedMentions: { parse: [] }
    });
  },

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === HELP_MENU_ID) {
      const selected = interaction.values[0];

      if (selected === 'custom') {
        const modal = new ModalBuilder()
          .setCustomId(HELP_MODAL_ID)
          .setTitle('Find an Argus command')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(HELP_MODAL_INPUT_ID)
                .setLabel('Command name')
                .setPlaceholder('Example: dns')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(32)
                .setRequired(true)
            )
          );
        await safeShowModal(interaction, modal);
        return true;
      }

      const key = selected === 'all' ? null : selected;
      await interaction.update({
        embeds: [buildHelpEmbed(interaction.client, key)],
        components: buildHelpComponents(key),
        allowedMentions: { parse: [] }
      });
      return true;
    }

    if (interaction.isModalSubmit() && interaction.customId === HELP_MODAL_ID) {
      const query = interaction.fields.getTextInputValue(HELP_MODAL_INPUT_ID);
      await interaction.reply({
        embeds: [buildCommandEmbed(interaction.client, query)],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
      return true;
    }

    return false;
  }
};
