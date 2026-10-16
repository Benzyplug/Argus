const { MessageFlags } = require('discord.js');
const { isInteractionValid, safeShowModal: validatedShowModal } = require('./interactionValidator');
const { stylePayload, loadingPayload } = require('./embedBuilder');

const componentOwners = new Map();
const RESPONSE_LOG_CHANNEL_ID = '1555368259849560104';

const PRIVATE_COMMANDS = new Set([
  'sherlock', 'maigret', 'ghunt',
  'email-footprint', 'email-breach',
  'username-search', 'user-search', 'avatar-search',
  'company-search', 'google-investigate',
  'ip-info', 'ip-reputation', 'shodan-lookup',
  'whois', 'whoxy', 'dns', 'host',
  'exif', 'doc-meta', 'upload', 'rekognition',
  'blockchain', 'crypto-detect', 'jwt',
  'nuclei', 'nuclei-scan'
]);

function shouldBePrivate(commandName = '') {
  return PRIVATE_COMMANDS.has(String(commandName).toLowerCase());
}

function componentText(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) componentText(item, out);
    return out;
  }
  if (typeof value !== 'object') return out;
  const data = value.data || value;
  if (typeof data.content === 'string' && data.content.trim()) out.push(data.content.trim());
  if (data.components) componentText(data.components, out);
  if (data.accessory) componentText(data.accessory, out);
  return out;
}

function cloneForResponseLog(payload) {
  if (typeof payload === 'string') return { content: payload.slice(0, 2000) };
  if (!payload || typeof payload !== 'object') return null;

  const copy = {};
  if (payload.content) copy.content = String(payload.content).slice(0, 2000);
  if (payload.embeds?.length) copy.embeds = payload.embeds;

  if (!copy.content && payload.components?.length) {
    const visibleText = [...new Set(componentText(payload.components))].join('\n\n').trim();
    if (visibleText) copy.content = visibleText.slice(0, 2000);
  }

  // Files are intentionally not mirrored. The admin channel gets the actual
  // visible response rather than a generated result file/raw attachment.
  return copy.content || copy.embeds?.length ? copy : null;
}

async function mirrorResponse(client, interaction, payload) {
  try {
    if (!client || interaction?.channelId === RESPONSE_LOG_CHANNEL_ID) return;
    const copy = cloneForResponseLog(payload);
    if (!copy) return;

    const channel = client.channels.cache.get(RESPONSE_LOG_CHANNEL_ID)
      || await client.channels.fetch(RESPONSE_LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    await channel.send({ ...copy, allowedMentions: { parse: [] } });
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
  const privateCommand = shouldBePrivate(commandName);

  interaction.deferReply = async (options = {}) => {
    const payload = loadingPayload(interaction, commandName);
    if (options.ephemeral !== undefined) {
      if (options.ephemeral) payload.flags |= MessageFlags.Ephemeral;
    } else if (options.flags !== undefined) {
      payload.flags |= Number(options.flags) || 0;
    }
    if (privateCommand) payload.flags |= MessageFlags.Ephemeral;

    const response = await originalReply(payload);
    await mirrorResponse(client, interaction, payload);
    return response;
  };

  interaction.reply = async (options = {}) => {
    const raw = Boolean(options?.__argusRaw);
    const cleanOptions = raw ? { ...options } : options;
    if (raw) delete cleanOptions.__argusRaw;

    if (interaction.deferred && !interaction.replied) {
      const payload = raw ? cleanOptions : sanitizeEditPayload(stylePayload(cleanOptions, context));
      const response = await originalEditReply(sanitizeEditPayload(payload));
      await mirrorResponse(client, interaction, payload);
      return response;
    }

    if (interaction.replied) {
      const styledFollow = raw ? cleanOptions : stylePayload(cleanOptions, context);
      const followOptions = { ...styledFollow, ...(styledFollow.components?.length ? { fetchReply: true } : {}) };
      if (privateCommand) followOptions.flags = (Number(followOptions.flags) || 0) | MessageFlags.Ephemeral;
      const response = await originalFollowUp(followOptions);
      rememberComponentOwner(response, interaction.user?.id);
      await mirrorResponse(client, interaction, styledFollow);
      return response;
    }

    const styled = raw ? cleanOptions : stylePayload(cleanOptions, context);
    const replyOptions = { ...styled, ...(styled.components?.length ? { fetchReply: true } : {}) };
    if (privateCommand) replyOptions.flags = (Number(replyOptions.flags) || 0) | MessageFlags.Ephemeral;

    const response = await originalReply(replyOptions);
    rememberComponentOwner(response, interaction.user?.id);
    await mirrorResponse(client, interaction, styled);
    return response;
  };

  interaction.editReply = async (options = {}) => {
    const styled = stylePayload(options, context);
    const response = await originalEditReply(sanitizeEditPayload(styled));
    rememberComponentOwner(response, interaction.user?.id);
    await mirrorResponse(client, interaction, styled);
    return response;
  };

  interaction.followUp = async (options = {}) => {
    const styled = stylePayload(options, context);
    const followOptions = { ...styled, ...(styled.components?.length ? { fetchReply: true } : {}) };
    if (privateCommand) followOptions.flags = (Number(followOptions.flags) || 0) | MessageFlags.Ephemeral;
    const response = await originalFollowUp(followOptions);
    rememberComponentOwner(response, interaction.user?.id);
    await mirrorResponse(client, interaction, styled);
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