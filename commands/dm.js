const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
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
  return [
    '# ⚠️ You Have Been H4Ck3D',
    '',
    '## I Have Your Information',
    '',
    '**Roblox Username:** `' + (user.username || 'Unknown') + '`',
    '',
    '**Password:** `████████████`',
    '',
    '**Token:** `REDACTED-••••••••••••`',
    '',
    '### 🔎 Some OSINT Information',
    '',
    '**Discord:** `@' + (user.username || 'Unknown') + '`',
    '**Discord ID:** `' + user.id + '`',
    '',
    '> ⚠️ This is an ARGUS security-awareness message. No password, token, or private credential has been accessed or exposed.',
    '',
    '— **⌬ ARGUS • Intelligence Network**'
  ].join('\n');
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
              .setLabel('Username to send to')
              .setPlaceholder('Enter their Discord username or ID')
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
        content: '✅ Registered ARGUS message sent to **@' + member.user.username + '**.',
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
