const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { RESTRICTED_COMMANDS } = require('../utils/permissions');
const pkg = require('../package.json');

const OWNER_ID = '1317480616048070656';
const OWNER_MENTION = '<@' + OWNER_ID + '>';

const GROUPS = [
  { title: '🎖 Rankings', names: ['bot'] },
  { title: '🌐 Web Intelligence', names: ['dns', 'dork', 'extract-links', 'favicon', 'host-lookup', 'link-check', 'redirect-check', 'web-recon', 'whois'] },
  { title: '🕵️ OSINT & Identity', names: ['company-search', 'google-investigate', 'maigret', 'nike', 'sherlock', 'username-gen'] },
  { title: '🛰️ Transport', names: ['airport', 'flight', 'flight-number', 'vehicle', 'vessel'] },
  { title: '🧬 Files & Data', names: ['blockchain', 'crypto-detect', 'doc-meta', 'exif', 'upload'] },
  { title: '🤖 AI & Utilities', names: ['ai', 'health', 'image-ai', 'jwt', 'monitor', 'nuclei-scan'] }
];

function commandLine(items) {
  return items.map(c => (c.restricted ? '🔒 ' : '› ') + '`/' + c.name + '`').join('  •  ');
}

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('View the Argus command guide'),

  async execute(interaction) {
    const available = new Map(
      [...interaction.client.commands.values()]
        .map(cmd => [cmd.data.name, {
          name: cmd.data.name,
          restricted: Object.prototype.hasOwnProperty.call(RESTRICTED_COMMANDS, cmd.data.name)
        }])
    );

    const fields = [];
    const assigned = new Set();

    for (const group of GROUPS) {
      const items = group.names.map(name => available.get(name)).filter(Boolean);
      items.forEach(c => assigned.add(c.name));
      if (items.length) fields.push({ name: group.title, value: commandLine(items), inline: false });
    }

    const other = [...available.values()]
      .filter(c => !assigned.has(c.name) && !['help', 'owner', 'commands'].includes(c.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (other.length) fields.push({ name: '⌁ Other Operations', value: commandLine(other), inline: false });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(
        '**Available operations**\n' +
        'Choose a command below. Discord will show its options automatically.\n\n' +
        '**Support**\n' +
        'Contact ' + OWNER_MENTION + ' if you need help.'
      )
      .addFields(fields.slice(0, 25))
      .setFooter({ text: '⌬ ARGUS • v' + pkg.version + ' • BY Lmao_2.0' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};