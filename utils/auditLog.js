const { EmbedBuilder } = require('discord.js');

async function auditCommand(client, interaction, { status='success', durationMs=null, error=null } = {}) {
  const channelId = process.env.ARGUS_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
  if (!channelId || !client) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased?.()) return;
    const embed = new EmbedBuilder()
      .setColor(status === 'success' ? 0x2ecc71 : 0xe74c3c)
      .setTitle(status === 'success' ? '✅ Argus Command' : '❌ Argus Command Error')
      .addFields(
        { name:'User', value: interaction.user ? interaction.user.tag + ' (' + interaction.user.id + ')' : 'Unknown', inline:true },
        { name:'Command', value:'/' + (interaction.commandName || 'unknown'), inline:true },
        { name:'Guild', value:interaction.guild ? interaction.guild.name + ' (' + interaction.guild.id + ')' : 'DM', inline:true },
        { name:'Duration', value:durationMs == null ? 'N/A' : durationMs + 'ms', inline:true },
        { name:'Status', value:status, inline:true }
      )
      .setTimestamp();
    if (error) embed.addFields({ name:'Error', value:String(error.message || error).slice(0,1024), inline:false });
    await channel.send({ embeds:[embed], allowedMentions:{parse:[]} });
  } catch {}
}
module.exports = { auditCommand };
