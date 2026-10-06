const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, version: discordJsVersion } = require('discord.js');
const pkg = require('../package.json');
const { getArgusBanner } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Display Argus bot information'),

  async execute(interaction) {
    const bot = await interaction.client.user.fetch(true);
    const banner = getArgusBanner(interaction.client);
    const commands = interaction.client.commands?.size ?? 0;
    const uptime = Math.floor(process.uptime());
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⌬ ARGUS • BOT')
      .setDescription(
        '**v' + pkg.version + '**\n' +
        'Open-source intelligence • Reconnaissance • Analysis\n\n' +
        'Argus is created and developed by **ẞ€ÑZ¥**.'
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
          name: '◈ Interfaces',
          value: '`/commands`\n`/owner`\n`/bot`\nDirect slash commands',
          inline: true
        },
        {
          name: '◈ Build',
          value: '`v' + pkg.version + '`\nProduction build',
          inline: true
        }
      )
      .setFooter({ text: '⌬ ARGUS • v' + pkg.version + ' • Owner: Lmao_2.0' })
      .setTimestamp();

    if (banner) embed.setImage(banner);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('argus:botinfo:' + interaction.user.id)
        .setLabel('More Info')
        .setEmoji('🧩')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], allowedMentions: { parse: [] } });
  }
};
