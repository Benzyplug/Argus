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

function resolveMember(guild, input) {
  const value = String(input || '').trim().replace(/^<@!?/, '').replace(/>$/, '');
  if (!value) return null;

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

function buildMessage(user) {
  const created = Math.floor(user.createdTimestamp / 1000);
  const now = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('⌬ ARGUS — Security Demo')
    .setDescription(
      '**YOU HAVE BEEN BEAMED.**\n' +
      '-# Simulated security-awareness message — no credentials were accessed.'
    )
    .setThumbnail(user.displayAvatarURL({ extension: 'png', size: 256 }))
    .addFields(
      { name: 'Your Username', value: '\\`' + (user.username || 'Unknown') + '\\`', inline: false },
      { name: 'Verified', value: '\\`Unknown\\`', inline: true },
      { name: 'Your Password', value: '\\`████████████\\`', inline: true },
      { name: 'Your Description', value: '\\`No description available\\`', inline: true },
      { name: 'Discord ID', value: '\\`' + user.id + '\\`', inline: true },
      { name: 'Account Created', value: '<t:' + created + ':F>', inline: true }
    )
    .setFooter({ text: '⌬ ARGUS • v2.3.0 • BY ẞ€ÑZ¥' })
    .setTimestamp();

  return { embeds: [embed] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send the registered ARGUS security-awareness DM')
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
              .setPlaceholder('Example: benzyplug or 123456789')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(64)
          )
        )
    );
  },

  async handleInteraction(interaction) {
    if (!interaction.isModalSubmit?.() || interaction.customId !== 'argus:dm:modal') {
      return false;
    }

    const input = interaction.fields.getTextInputValue('username');
    const member = resolveMember(interaction.guild, input);

    if (!member) {
      await interaction.reply({
        content: '❌ I could not find that user in this server. Use their Discord username, display name, mention, or ID.',
        ephemeral: true
      });
      return true;
    }

    if (member.user.bot) {
      await interaction.reply({
        content: '❌ You cannot send this DM to a bot.',
        ephemeral: true
      });
      return true;
    }

    try {
      await member.send(buildMessage(member.user));
      await interaction.reply({
        content: '✅ ARGUS security-demo DM sent to **@' + member.user.username + '**.',
        ephemeral: true
      });
    } catch {
      await interaction.reply({
        content: '❌ I could not DM **@' + member.user.username + '**. Their DMs may be disabled or the bot may be blocked.',
        ephemeral: true
      });
    }

    return true;
  }
};
