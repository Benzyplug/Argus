const { SlashCommandBuilder, EmbedBuilder, version: discordJsVersion } = require('discord.js');
const pkg = require('../package.json');
const { gatherHealthData, formatUptime } = require('../utils/health');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Display Argus bot information and health')
    .addBooleanOption(option => option.setName('detailed').setDescription('Show detailed system information').setRequired(false))
    .addBooleanOption(option => option.setName('check-apis').setDescription('Test external API connectivity').setRequired(false))
    .addBooleanOption(option => option.setName('check-tools').setDescription('Verify external tool availability').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const detailed = interaction.options.getBoolean('detailed') ?? false;
    const checkApis = interaction.options.getBoolean('check-apis') ?? false;
    const checkTools = interaction.options.getBoolean('check-tools') ?? false;
    try {
      const bot = await interaction.client.user.fetch(true);
      const health = await gatherHealthData(detailed, checkApis, checkTools, interaction.client);
      const statusEmoji = { healthy: '🟢', degraded: '🟡', unhealthy: '🔴' }[health.overall.status] || '⚪';
      const memUsed = Math.round(health.system.memory.used.heapUsed / 1024 / 1024);
      const memTotal = Math.round(health.system.memory.used.heapTotal / 1024 / 1024);
      const embed = new EmbedBuilder()
        .setColor(health.overall.status === 'healthy' ? 0x57f287 : health.overall.status === 'degraded' ? 0xfee75c : 0xed4245)
        .setAuthor({ name: 'ARGUS • Open Source Intelligence', iconURL: bot.displayAvatarURL({ size: 128 }) })
        .setTitle('⌬ ARGUS')
        .setDescription('**v' + pkg.version + '**\nOpen-source intelligence • Reconnaissance • Analysis\n\nCreated and developed by **ẞ€ÑZ¥**.')
        .setThumbnail(bot.displayAvatarURL({ size: 1024 }))
        .addFields(
          { name: '◈ Runtime', value: 'Node.js **' + process.version + '**\ndiscord.js **v' + discordJsVersion + '**\nUptime **' + formatUptime(process.uptime()) + '**', inline: true },
          { name: '◈ Bot', value: 'Servers **' + interaction.client.guilds.cache.size + '**\nCommands **' + (interaction.client.commands?.size ?? 0) + '**\nStatus **' + (health.discord.connected ? '🟢 Connected' : '🔴 Disconnected') + '**\nPing **' + (health.discord.ping || 'N/A') + 'ms', inline: true },
          { name: '◈ Health', value: statusEmoji + ' **' + health.overall.status.toUpperCase() + '** (' + health.overall.score + '/100)\n' + (health.overall.issues.length ? '⚠️ ' + health.overall.issues.join(', ') : '✅ No issues detected'), inline: true },
          { name: '◈ System', value: '**Platform:** ' + health.system.platform + ' ' + health.system.arch + '\n**Node.js:** ' + health.system.nodeVersion + '\n**Memory:** ' + memUsed + 'MB / ' + memTotal + 'MB\n**Uptime:** ' + formatUptime(health.system.uptime), inline: true },
          { name: '◈ Owner', value: '<@1317480616048070656>\nFounder • Developer • Owner', inline: true },
          { name: '◈ Build', value: 'v' + pkg.version + ' • Production', inline: true }
        );
      if (health.apis) {
        const value = Object.entries(health.apis).map(([name, item]) => (item.status === 'healthy' ? '🟢' : item.status === 'degraded' ? '🟡' : '🔴') + ' ' + name).join('\n');
        embed.addFields({ name: '🌐 External APIs', value: value || 'No APIs checked', inline: true });
      }
      if (health.tools) {
        const value = Object.entries(health.tools).map(([name, item]) => (item.available ? '🟢' : '🔴') + ' ' + name + (item.version && item.version !== 'unknown' ? ' v' + item.version : '')).join('\n');
        embed.addFields({ name: '🔧 External Tools', value: value || 'No tools checked', inline: true });
      }
      if (detailed && health.system.cpu) {
        embed.addFields({ name: '⚙️ Detailed System Info', value: '**CPU:** ' + health.system.cpu.cores + ' cores\n**Load Avg:** ' + health.system.cpu.loadAvg.map(l => l.toFixed(2)).join(', ') + '\n**Temp Dir:** ' + (health.system.tempDir?.exists ? '✅ Available' : '❌ Missing'), inline: false });
      }
      embed.setFooter({ text: '⌬ ARGUS • v' + pkg.version + ' • BY ẞ€ÑZ¥ • Check completed in ' + health.processingTime + 'ms' }).setTimestamp();
      await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('[BOT] Error gathering bot/health information:', error);
      await interaction.editReply({ content: '❌ **Bot information check failed**\nAn error occurred while gathering system information. Check server logs for details.' });
    }
  }
};