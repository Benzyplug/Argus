const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pkg = require('../package.json');
const { getArgusBanner } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Display the Argus owner profile'),

  async execute(interaction) {
    const bot = await interaction.client.user.fetch(true);
    const banner = getArgusBanner(interaction.client);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⌬ ARGUS • OWNER')
      .setDescription('**Owner & creator profile**\n\n' +
        '╭─ **Identity**\n' +
        '│ **Name:** ẞ€ÑZ¥\n' +
        '│ **Username:** `Lmao_2.0`\n' +
        '│ **Age:** 17\n' +
        '│ **Countries:** 🇬🇧 UK • 🇳🇬 NG\n' +
        '╰────────────────────')
      .addFields(
        { name: '◈ Role', value: '`Founder • Developer • Owner`', inline: true },
        { name: '◈ Bot', value: '`' + (bot?.username || 'Argus') + '`', inline: true },
        { name: '◈ Version', value: '`v' + pkg.version + '`', inline: true },
        { name: '◈ Development', value: 'Discord bots • OSINT • automation\nNode.js • JavaScript • APIs', inline: false }
      )
      .setFooter({ text: '⌬ ARGUS • v' + pkg.version + ' • Owner: Lmao_2.0' })
      .setTimestamp();

    if (banner) embed.setImage(banner);
    else if (bot?.displayAvatarURL) embed.setThumbnail(bot.displayAvatarURL({ extension: 'png', size: 512 }));

    await interaction.reply({ embeds: [embed] });
  }
};
