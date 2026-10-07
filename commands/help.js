const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { RESTRICTED_COMMANDS } = require('../utils/permissions');
const { getArgusBanner } = require('../utils/embedBuilder');
const pkg = require('../package.json');

const OWNER_ID = '1317480616048070656';
const OWNER_MENTION = '<@' + OWNER_ID + '>';

const GROUPS = [
  { title: '🎖 Rankings', test: n => /owner|bot/i.test(n) },
  { title: '🌐 Web Intelligence', test: n => /dns|host|web|link|redirect|favicon|whois|dork/i.test(n) },
  { title: '🕵️ OSINT & Identity', test: n => /username|google|company|search|maigret|sherlock|nike/i.test(n) },
  { title: '🛰️ Transport', test: n => /flight|airport|vessel|vehicle/i.test(n) },
  { title: '🧬 Files & Data', test: n => /exif|meta|upload|blockchain|crypto|doc/i.test(n) },
  { title: '🤖 AI & Utilities', test: n => /ai|health|jwt|monitor|nuclei/i.test(n) }
];

function chunk(items, size = 12) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('View the Argus command guide'),

  async execute(interaction) {
    const commands = [...interaction.client.commands.values()]
      .map(cmd => ({ name: cmd.data.name, description: cmd.data.description || 'Argus operation', restricted: Object.prototype.hasOwnProperty.call(RESTRICTED_COMMANDS, cmd.data.name) }))
      .filter(c => !['help', 'owner', 'commands'].includes(c.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const assigned = new Set();
    const fields = [];
    for (const group of GROUPS) {
      const items = commands.filter(c => group.test(c.name));
      items.forEach(c => assigned.add(c.name));
      for (const part of chunk(items)) {
        if (part.length) fields.push({ name: group.title, value: part.map(c => (c.restricted ? '🔒 ' : '› ') + '/' + c.name).join('  •  '), inline: false });
      }
    }
    const other = commands.filter(c => !assigned.has(c.name));
    for (const part of chunk(other)) if (part.length) fields.push({ name: '⌁ Other Operations', value: part.map(c => (c.restricted ? '🔒 ' : '› ') + '/' + c.name).join('  •  '), inline: false });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription('**Command Guide**\n> Here is the list of available Argus commands.\n\n**For more info**\n> Use a command directly and Discord will show its available options.\n\n**Need more help?**\n> Contact ' + OWNER_MENTION + ' for setup or support.')
      .addFields(fields.slice(0, 25))
      .setFooter({ text: '⌬ ARGUS • v' + pkg.version + ' • BY Lmao_2.0' })
      .setTimestamp();
    const banner = getArgusBanner(interaction.client);
    if (banner) embed.setImage(banner);
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};