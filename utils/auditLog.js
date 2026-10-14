const { EmbedBuilder } = require('discord.js');

const OWNER_NAME = 'Lmao_2.0';

async function findOwner(channel, client) {
  const configured = String(process.env.ARGUS_AUDIT_MENTION || '').trim();
  if (configured) {
    const id = configured.match(/^(?:<@!?(\d+)>|(\d+))$/);
    if (id) {
      const userId = id[1] || id[2];
      const user = await client.users.fetch(userId).catch(() => null);
      if (user) return user;
    }
  }

  const cached = client.users.cache.find(user =>
    user.username === OWNER_NAME || user.globalName === OWNER_NAME
  );
  if (cached) return cached;

  const guild = channel?.guild;
  if (!guild?.members?.search) return null;

  const members = await guild.members.search({ query: OWNER_NAME, limit: 10 }).catch(() => null);
  return members?.find(member =>
    member.user?.username === OWNER_NAME ||
    member.user?.globalName === OWNER_NAME ||
    member.nickname === OWNER_NAME
  )?.user || null;
}

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

    if (error) {
      embed.addFields({ name:'Error', value:String(error.message || error).slice(0,1024), inline:false });
    }

    const owner = await findOwner(channel, client);
    const mention = owner ? '<@' + owner.id + '>' : null;

    await channel.send({
      content: mention || undefined,
      embeds:[embed],
      allowedMentions: owner ? { users:[owner.id] } : { parse: [] }
    });
  } catch (error) {
    console.error('[ARGUS AUDIT LOG]', error?.message || error);
  }
}

module.exports = { auditCommand };
