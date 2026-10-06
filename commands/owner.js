/** Argus owner profile. */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pkg = require('../package.json');

module.exports = {
  data: new SlashCommandBuilder().setName('owner').setDescription('Display the Argus owner profile'),
  async execute(interaction) {
    const bot = interaction.client.user;
    const banner = interaction.client.application?.coverURL?.({ extension: 'png', size: 1024 }) || null;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('╭━━━〔 ⌬ ARGUS • OWNER 〕━━━╮')
      .setDescription('╰─ **Owner & creator profile**\n\n' +
        '╭─〔 👤 Identity 〕\n' +
        '┃ **Name:** ẞ€ÑZ¥\n' +
        '┃ **Username:** `Lmao_2.0`\n' +
        '┃ **Age:** 17\n' +
        '┃ **Countries:** 🇬🇧 UK • 🇳🇬 NG\n' +
        '╰────────────────────────╯')
      .addFields(
        { name: '◈ Role', value: '`Founder • Developer • Owner`', inline: true },
        { name: '◈ Bot', value: '`' + (bot?.username || 'Argus') + '`', inline: true },
        { name: '◈ Version', value: '`v' + pkg.version + '`', inline: true }
      )
      .setFooter({ text: '⌬ ARGUS • v' + pkg.version + ' • Owner: Lmao_2.0' })
      .setTimestamp();
    if (banner) embed.setImage(banner);
    else if (bot?.displayAvatarURL) embed.setThumbnail(bot.displayAvatarURL({ extension: 'png', size: 512 }));
    await interaction.reply({ embeds: [embed] });
  }
};