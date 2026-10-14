const { MessageFlags } = require('discord.js');
const { isInteractionValid, safeShowModal: validatedShowModal } = require('./interactionValidator');
const { stylePayload, loadingEmbed, argusBannerFile } = require('./embedBuilder');

const componentOwners = new Map();

const RESPONSE_LOG_CHANNEL_ID = '1555368259849560104';

const PRIVATE_COMMANDS = new Set([
  'sherlock', 'maigret', 'ghunt',
  'email-footprint', 'email-breach',
  'ip-info', 'ip-reputation', 'shodan-lookup',
  'whois', 'whoxy', 'google-investigate', 'company-search',
  'blockchain', 'crypto-detect', 'jwt',
  'exif', 'doc-meta', 'upload', 'rekognition',
  'nuclei', 'nuclei-scan'
]);

function shouldBePrivate(commandName = '') {
  return PRIVATE_COMMANDS.has(String(commandName).toLowerCase());
}

function cloneForResponseLog(payload) {
  if (typeof payload === 'string') return { content: payload };
  if (!payload || typeof payload !== 'object') return null;

  const copy = {};
  if (payload.content) copy.content = payload.content;
  if (payload.embeds?.length) copy.embeds = payload.embeds;
  if (payload.files?.length) copy.files = payload.files;

  // Components are intentionally omitted so controls cannot be used from the log channel.
  return copy.content || copy.embeds?.length || copy.files?.length ? copy : null;
}

async function mirrorResponse(client, interaction, payload) {
  try {
    if (!client || interaction?.channelId === RESPONSE_LOG_CHANNEL_ID) return;
    const copy = cloneForResponseLog(payload);
    if (!copy) return;

    const channel = client.channels.cache.get(RESPONSE_LOG_CHANNEL_ID)
      || await client.channels.fetch(RESPONSE_LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    await channel.send(copy);
  } catch (error) {
    console.error('[ARGUS RESPONSE LOG]', error?.message || error);
  }
}

function rememberComponentOwner(message, userId) {
  if (!message?.id || !userId || !message.components?.length) return;
  componentOwners.set(message.id, userId);
  if (componentOwners.size > 2000) componentOwners.delete(componentOwners.keys().next().value);
}
function getComponentOwner(messageId) {
  return componentOwners.get(messageId) || null;
}

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
    // The loading embed itself carries the Argus banner so the response is
    // always one embed, not a separate banner embed.
    const loading = loadingEmbed(interaction, commandName);
    const payload = { embeds: [loading] };
    const bannerFile = argusBannerFile();
    if (bannerFile) payload.files = [bannerFile];
    if (options.ephemeral !== undefined) payload.ephemeral = options.ephemeral;
    else if (options.flags !== undefined) payload.flags = options.flags;
    else if (shouldBePrivate(commandName)) payload.flags = MessageFlags.Ephemeral;
    if (options.flags !== undefined) payload.flags = options.flags;
    return originalReply(payload);
  };

  interaction.reply = async (options = {}) => {
    const raw = Boolean(options?.__argusRaw);
    const cleanOptions = raw ? { ...options } : options;
    if (raw) delete cleanOptions.__argusRaw;
    if (interaction.deferred && !interaction.replied) {
      const payload = raw ? cleanOptions : sanitizeEditPayload(stylePayload(cleanOptions, context));
      const response = await originalEditReply(sanitizeEditPayload(payload));
      if (!shouldBePrivate(commandName)) await mirrorResponse(client, interaction, payload);
      return response;
    }
    if (interaction.replied) {
      const styledFollow = raw ? cleanOptions : stylePayload(cleanOptions, context);
      const followOptions = { ...styledFollow, ...(styledFollow.components?.length ? { fetchReply: true } : {}) };
      if (followOptions.ephemeral === undefined && followOptions.flags === undefined && shouldBePrivate(commandName)) followOptions.flags = MessageFlags.Ephemeral;
      const response = await originalFollowUp(followOptions);
      rememberComponentOwner(response, interaction.user?.id);
      await mirrorResponse(client, interaction, styledFollow);
      return response;
    }
    const styled = raw ? cleanOptions : stylePayload(cleanOptions, context);
    const replyOptions = { ...styled, ...(styled.components?.length ? { fetchReply: true } : {}) };
    if (replyOptions.ephemeral === undefined && replyOptions.flags === undefined && shouldBePrivate(commandName)) replyOptions.flags = MessageFlags.Ephemeral;
    const response = await originalReply(replyOptions);
    rememberComponentOwner(response, interaction.user?.id);
    if (!shouldBePrivate(commandName)) await mirrorResponse(client, interaction, styled);
    return response;
  };

  interaction.editReply = async (options = {}) => {
    const styled = stylePayload(options, context);
    const response = await originalEditReply(sanitizeEditPayload(styled));
    rememberComponentOwner(response, interaction.user?.id);
    if (!shouldBePrivate(commandName)) await mirrorResponse(client, interaction, styled);
    return response;
  };

  interaction.followUp = async (options = {}) => {
    const styled = stylePayload(options, context);
    const followOptions = { ...styled, ...(styled.components?.length ? { fetchReply: true } : {}) };
    if (followOptions.ephemeral === undefined && followOptions.flags === undefined && shouldBePrivate(commandName)) followOptions.flags = MessageFlags.Ephemeral;
    const response = await originalFollowUp(followOptions);
    rememberComponentOwner(response, interaction.user?.id);
    if (!shouldBePrivate(commandName)) await mirrorResponse(client, interaction, styled);
    return response;
  };
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

module.exports = { installArgusResponses, safeRespond, safeShowModal, sanitizeEditPayload, getComponentOwner };
