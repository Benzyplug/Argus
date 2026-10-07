const { SlashCommandBuilder, EmbedBuilder, version: discordJsVersion } = require('discord.js');
const pkg = require('../package.json');
const { getArgusBanner } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Display Argus bot information'),

  async execute(interaction) {
    const bot = await interaction.client.user.fetch(true);
    const commands = interaction.client.commands?.size ?? 0;
    const uptime = Math.floor(process.uptime());
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: '〢 Argus' })
      .setTitle('⌬ ARGUS')
      .setDescription(
        '**v' + pkg.version + '**\n' +
        'Open-source intelligence • Reconnaissance • Analysis\n\n' +
        'Created and developed by **ẞ€ÑZ¥**.'
      )
      .setThumbnail(bot.displayAvatarURL({ size: 1024 }))
      .addFields(
        {
          name: '◈ Runtime',
          value: 'Node.js **' + process.version + '**\ndiscord.js **v' + discordJsVersion + '**\nUptime **' +
            days + 'd ' + hours + 'h ' + minutes + 'm ' + seconds + 's**',
          inline: true
        },
        {
          name: '◈ Bot',
          value: 'Servers **' + interaction.client.guilds.cache.size + '**\nCommands **' + commands + '**\nStatus **🔴 Do Not Disturb**',
          inline: true
        },
        {
          name: '◈ Owner',
          value: '<@1317480616048070656>\nFounder • Developer • Owner',
          inline: true
        },
        {
          name: '◈ Build',
          value: '`v' + pkg.version + '` • Production',
          inline: true
        }
      )
      .setFooter({ text: '⌬ ARGUS • v' + pkg.version + ' • BY Lmao_2.0' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
