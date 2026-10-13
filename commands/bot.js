const { SlashCommandBuilder, version: discordJsVersion } = require('discord.js');
const pkg = require('../package.json');
const { gatherHealthData, formatUptime } = require('../utils/health');
const { createArgusEmbed } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Display Argus bot information and health')
    .addBooleanOption(o => o.setName('detailed').setDescription('Show detailed system information').setRequired(false))
    .addBooleanOption(o => o.setName('check-apis').setDescription('Check configured API integrations').setRequired(false))
    .addBooleanOption(o => o.setName('check-tools').setDescription('Check external tool availability').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const detailed = interaction.options.getBoolean('detailed') ?? false;
    const checkApis = interaction.options.getBoolean('check-apis') ?? false;
    const checkTools = interaction.options.getBoolean('check-tools') ?? false;
    const health = await gatherHealthData(detailed, checkApis, checkTools, interaction.client);
    const statusEmoji = { healthy: '🟢', degraded: '🟡', unhealthy: '🔴' }[health.overall.status] || '⚪';
    const mem = health.system.memory.used;
    const fields = [
      { name: '◈ Runtime', value: 'Node.js **' + process.version + '**\ndiscord.js **v' + discordJsVersion + '**\nUptime **' + formatUptime(process.uptime()) + '**', inline: true },
      { name: '◈ Bot', value: 'Servers **' + interaction.client.guilds.cache.size + '**\nCommands **' + (interaction.client.commands?.size ?? 0) + '**\nStatus **' + (health.discord.connected ? '🟢 Connected' : '🔴 Disconnected') + '**\nPing **' + (health.discord.ping == null ? 'N/A' : health.discord.ping + 'ms') + '**', inline: true },
      { name: '◈ Health', value: statusEmoji + ' **' + health.overall.status.toUpperCase() + '** (' + health.overall.score + '/100)\n' + (health.overall.issues.length ? '⚠️ ' + health.overall.issues.slice(0, 6).join(', ') : '✅ No issues detected'), inline: true },
      { name: '◈ System', value: '**Platform:** ' + health.system.platform + ' ' + health.system.arch + '\n**Memory:** ' + Math.round(mem.heapUsed / 1048576) + 'MB / ' + Math.round(mem.heapTotal / 1048576) + 'MB\n**Uptime:** ' + formatUptime(health.system.uptime), inline: true },
      { name: '◈ Owner', value: '<@1317480616048070656>\nFounder • Developer • Owner', inline: true },
      { name: '◈ Build', value: 'v' + pkg.version + ' • Production', inline: true }
    ];
    if (health.apis) fields.push({ name: '🌐 API Integrations', value: Object.entries(health.apis).map(([n, x]) => (x.status === 'configured' ? '🟢' : '🟡') + ' ' + n).join('\n').slice(0, 1024), inline: true });
    if (health.tools) fields.push({ name: '🔧 External Tools', value: Object.entries(health.tools).map(([n, x]) => (x.available ? '🟢' : '🔴') + ' ' + n).join('\n'), inline: true });
    if (detailed) fields.push({ name: '⚙️ Detailed System Info', value: '**CPU:** ' + (health.system.cpu?.cores || 'N/A') + ' cores\n**Load:** ' + (health.system.cpu?.loadAvg || []).map(x => x.toFixed(2)).join(', ') + '\n**Temp:** ' + (health.system.tempDir?.exists ? 'Available' : 'Missing'), inline: false });
    const embed = createArgusEmbed({
      title: '⌬ ARGUS',
      description: '**v' + pkg.version + '**\nOpen-source intelligence • Reconnaissance • Analysis\n\nCreated and developed by **ẞ€ÑZ¥**.',
      color: health.overall.status === 'healthy' ? 0x57f287 : health.overall.status === 'degraded' ? 0xfee75c : 0xed4245,
      fields
    }, { commandName: 'bot', client: interaction.client });
    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
