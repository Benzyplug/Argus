const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { RESTRICTED_COMMANDS } = require('../utils/permissions');
const pkg = require('../package.json');
const OWNER_ID = '1317480616048070656';
const OWNER_MENTION = `<@${OWNER_ID}>`;

const GROUPS = [
  { title: '🌐 Web Intelligence', test: n => /dns|host|web|link|redirect|favicon|whois/i.test(n) },
  { title: '🕵️ OSINT & Identity', test: n => /user|google|company|search|maigret|sherlock|dork|nike/i.test(n) },
  { title: '🛰️ Transport', test: n => /flight|airport|vessel|vehicle/i.test(n) },
  { title: '🧬 Files & Data', test: n => /exif|meta|upload|blockchain|crypto|doc/i.test(n) },
  { title: '🤖 AI & Utilities', test: n => /ai|health|jwt|monitor|nuclei/i.test(n) }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Open the Argus help and command guide'),

  async execute(interaction) {
    const commands = [...interaction.client.commands.values()]
      .map(cmd => ({
        name: cmd.data.name,
        description: cmd.data.description || 'Argus operation',
        restricted: Object.prototype.hasOwnProperty.call(RESTRICTED_COMMANDS, cmd.data.name)
      }))
      .filter(c => !['help', 'commands', 'owner'].includes(c.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const sections = GROUPS.map(group => {
      const items = commands.filter(c => group.test(c.name));
      if (!items.length) return null;
      return {
        name: group.title,
        value: items.map(c => `${c.restricted ? '🔒 ' : ''}**/${c.name}** — ${c.description}`).join('\n')
      };
    }).filter(Boolean);

    const assigned = new Set(sections.flatMap(section =>
      commands.filter(c => section.value.includes('/' + c.name)).map(c => c.name)
    ));
    const other = commands.filter(c => !assigned.has(c.name));
    if (other.length) {
      sections.push({
        name: '⌬ Other Operations',
        value: other.map(c => `${c.restricted ? '🔒 ' : ''}**/${c.name}** — ${c.description}`).join('\n')
      });
    }

    const embeds = [];
    let current = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('〢 Quick Reference')
      .setDescription(
        '**Open-source intelligence, reconnaissance & analysis.**\n\n' +
        'Use the command options directly from Discord. Commands that need more detail open focused native input forms.'
      );

    for (const section of sections) {
      if ((current.data.fields?.length || 0) >= 6) {
        embeds.push(current.setFooter({ text: `⌬ ARGUS • v${pkg.version} • BY Lmao_2.0` }).setTimestamp());
        current = new EmbedBuilder().setColor(0x5865f2);
      }
      current.addFields({ name: section.name, value: section.value.slice(0, 1024), inline: false });
    }

    current.addFields({
      name: '◈ Need help?',
      value: `For questions, setup help or issues, contact ${OWNER_MENTION}. You can open the profile and message them directly.`
    });
    current.setFooter({ text: `⌬ ARGUS • v${pkg.version} • BY Lmao_2.0` }).setTimestamp();
    embeds.push(current);

    await interaction.reply({
      embeds,
      allowedMentions: { parse: [] },
      ephemeral: true
    });
  }
};
