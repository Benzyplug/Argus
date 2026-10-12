const { MessageFlags } = require('discord.js');
const { isInteractionValid, safeShowModal: validatedShowModal } = require('./interactionValidator');
const { stylePayload, loadingEmbed, argusBannerFile } = require('./embedBuilder');

function sanitizeEditPayload(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return options;
  const { ephemeral, flags, ...rest } = options;
  return rest;
}

function installArgusResponses(interaction, client) {
  if (!interaction || interaction.__argusResponseStyling) return;
  interaction.__argusResponseStyling = true;

  const originalReply = interaction.reply?.bind(interaction);
  const originalDeferReply = interaction.deferReply?.bind(interaction);
  const originalEditReply = interaction.editReply?.bind(interaction);
  const originalFollowUp = interaction.followUp?.bind(interaction);
  if (!originalReply || !originalDeferReply || !originalEditReply || !originalFollowUp) return;

  const commandName = interaction.commandName || 'argus';
  const context = { interaction, client, commandName };

  interaction.deferReply = async (options = {}) => {
    const loading = loadingEmbed(interaction, commandName);
    const payload = { embeds: [loading] };
    const bannerFile = argusBannerFile();
    if (bannerFile) {
      loading.setImage('attachment://banner.png');
      payload.files = [bannerFile];
    }
    if (options.ephemeral !== undefined) payload.ephemeral = options.ephemeral;
    if (options.flags !== undefined) payload.flags = options.flags;
    return originalReply(payload);
  };

  interaction.reply = async (options = {}) => {
    if (interaction.deferred && !interaction.replied) {
      return originalEditReply(sanitizeEditPayload(stylePayload(options, context)));
    }
    if (interaction.replied) return originalFollowUp(stylePayload(options, context));
    return originalReply(stylePayload(options, context));
  };

  interaction.editReply = async (options = {}) =>
    originalEditReply(sanitizeEditPayload(stylePayload(options, context)));

  interaction.followUp = async (options = {}) =>
    originalFollowUp(stylePayload(options, context));
}

async function safeRespond(interaction, payload, { ephemeral = false } = {}) {
  if (!isInteractionValid(interaction)) return false;
  const options = typeof payload === 'string' ? { content: payload } : { ...(payload || {}) };
  if (ephemeral && !interaction.deferred && !interaction.replied) options.flags = MessageFlags.Ephemeral;
  if (interaction.deferred && !interaction.replied) return interaction.editReply(sanitizeEditPayload(options));
  if (interaction.replied) return interaction.followUp(options);
  return interaction.reply(options);
}

async function safeShowModal(interaction, modal) {
  return validatedShowModal(interaction, modal);
}

module.exports = { installArgusResponses, safeRespond, safeShowModal, sanitizeEditPayload };
