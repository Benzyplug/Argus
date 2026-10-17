const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const { safeShowModal } = require('../utils/interactionHelper');

const ROBLOX_HEADERS = {
  'User-Agent': 'ARGUS/2.3 (Roblox profile lookup)',
  Accept: 'application/json'
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...ROBLOX_HEADERS, ...(options.headers || {}) },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('Request failed (' + response.status + ')');
  return response.json();
}

async function getBloxlinkRobloxId(discordId) {
  const key = process.env.BLOXLINK_API_KEY;
  const guildId = process.env.GUILD_ID;
  if (!key || !guildId) {
    const error = new Error('Bloxlink configuration missing');
    error.userMessage = 'Roblox lookup is not configured. Add BLOXLINK_API_KEY and GUILD_ID to the bot environment.';
    throw error;
  }

  const response = await fetch(
    'https://api.blox.link/v4/public/guilds/' + encodeURIComponent(guildId) +
      '/discord-to-roblox/' + encodeURIComponent(discordId),
    { headers: { Authorization: key, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Bloxlink returned ' + response.status);
  const data = await response.json();
  return data?.robloxID || data?.robloxId || data?.RobloxID || null;
}

async function getRobloxProfile(robloxId) {
  const data = await fetchJson('https://users.roblox.com/v1/users/' + encodeURIComponent(robloxId));
  if (!data?.id) return null;
  return data;
}

function resolveMember(guild, input) {
  const value = String(input || '').trim().replace(/^<@!?/, '').replace(/>$/, '');
  if (!value || !guild) return null;

  if (/^\d{15,22}$/.test(value)) {
    return guild.members.cache.get(value) || null;
  }

  const lower = value.toLowerCase();
  return guild.members.cache.find(member =>
    member.user?.username?.toLowerCase() === lower ||
    member.user?.globalName?.toLowerCase() === lower ||
    member.displayName?.toLowerCase() === lower
  ) || null;
}

function code(value, fallback = 'Unavailable') {
  const clean = String(value || fallback).replace(/`/g, "'").slice(0, 900);
  return '`' + clean + '`';
}

function buildMessage(discordUser, profile, robloxId) {
  const created = profile.created ? Math.floor(new Date(profile.created).getTime() / 1000) : null;
  const description = String(profile.description || '').trim();
  const avatarUrl = 'https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=' +
    encodeURIComponent(robloxId) + '&size=420x420&format=Png&isCircular=false';

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('⚠️ You Have been H4Ck3D')
    .setDescription(
      '**I have your Information**\n' +
      '-# ARGUS security-awareness demo. This is public profile information only; no password or private account data was accessed.'
    )
    .setURL('https://www.roblox.com/users/' + encodeURIComponent(robloxId) + '/profile')
    .setThumbnail('https://www.roblox.com/headshot-thumbnail/image?userId=' + encodeURIComponent(robloxId) + '&width=420&height=420&format=png')
    .setImage('https://raw.githubusercontent.com/Benzyplug/Argus/main/banner.png')
    .addFields(
      { name: 'Roblox Username', value: code(profile.name), inline: true },
      { name: 'Display Name', value: code(profile.displayName), inline: true },
      { name: 'Verified', value: code(profile.hasVerifiedBadge ? 'Roblox verified badge' : 'No Roblox verified badge'), inline: true },
      { name: 'Password', value: code('Stored In Database'), inline: true },
      { name: 'Description', value: description ? description.slice(0, 1024) : '*No public description set.*', inline: false },
      { name: 'Roblox User ID', value: code(robloxId), inline: true },
      { name: 'Account Created', value: created ? '<t:' + created + ':D> • <t:' + created + ':R>' : 'Unavailable', inline: true },
      { name: 'Roblox Profile', value: '[Open actual Roblox profile](https://www.roblox.com/users/' + encodeURIComponent(robloxId) + '/profile)', inline: false }
    )
    .setFooter({ text: '⌬ ARGUS • v2.3.0 • BY ẞ€ÑZ¥' })
    .setTimestamp();

  // The password row is fixed template copy, not a retrieved credential.
  // Keep the awareness disclaimer so the message does not claim real account access.
  return { embeds: [embed] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send the ARGUS Roblox security-awareness DM')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    return safeShowModal(
      interaction,
      new ModalBuilder()
        .setCustomId('argus:dm:modal')
        .setTitle('Send ARGUS DM')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('username')
              .setLabel('Discord username or ID')
              .setPlaceholder('Username, display name, mention, or ID')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(64)
          )
        )
    );
  },

  async handleInteraction(interaction) {
    if (!interaction.isModalSubmit?.() || interaction.customId !== 'argus:dm:modal') return false;

    await interaction.deferReply({ ephemeral: true });
    const input = interaction.fields.getTextInputValue('username');
    const member = resolveMember(interaction.guild, input);

    if (!member) {
      await interaction.editReply('❌ I could not find that user in this server. Use their exact username, display name, mention, or ID.');
      return true;
    }
    if (member.user.bot) {
      await interaction.editReply('❌ You cannot send this DM to a bot.');
      return true;
    }

    try {
      const robloxId = await getBloxlinkRobloxId(member.id);
      if (!robloxId) {
        await interaction.editReply('❌ No Roblox account is linked to **@' + member.user.username + '** through Bloxlink. I did not send a DM with placeholder Roblox details.');
        return true;
      }

      const profile = await getRobloxProfile(robloxId);
      if (!profile) {
        await interaction.editReply('❌ Roblox did not return a profile for the linked account. No DM was sent.');
        return true;
      }

      await member.send(buildMessage(member.user, profile, robloxId));
      await interaction.editReply('✅ Sent the ARGUS Roblox awareness DM to **@' + member.user.username + '** using live public Roblox profile data.');
    } catch (error) {
      const message = error?.userMessage ||
        (error?.name === 'TimeoutError'
          ? 'The Roblox or Bloxlink lookup timed out. Try again in a moment.'
          : 'The Roblox/Bloxlink lookup failed. Check the API configuration and try again.');
      await interaction.editReply('❌ ' + message);
    }
    return true;
  }
};
