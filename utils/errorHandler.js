const logger = require('./logger');
const { COLORS, createArgusEmbed } = require('./embedBuilder');

const ErrorTypes = Object.freeze({
  VALIDATION: 'validation', PERMISSION: 'permission', CONFIGURATION: 'configuration',
  NETWORK: 'network', DISCORD_API: 'discord_api', RATE_LIMIT: 'rate_limit', UNKNOWN: 'unknown'
});
const MESSAGES = {
  validation: 'Please check your input and try again.',
  permission: 'You do not have permission to do that.',
  configuration: 'This feature is not configured yet.',
  network: 'Argus could not reach an external service. Please try again.',
  discord_api: 'Discord rejected that request. Please try again.',
  rate_limit: 'You are doing that too quickly. Wait a moment and try again.',
  unknown: 'Something went wrong. Please try again later.'
};
function categorizeError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = error?.code;
  if (code === 429 || /rate.?limit|cooldown/.test(message)) return ErrorTypes.RATE_LIMIT;
  if ([50001, 50013, 50007].includes(code) || /permission|missing access/.test(message)) return ErrorTypes.PERMISSION;
  if ([10062, 40060, 50027, 50035].includes(code) || error?.name === 'DiscordAPIError') return ErrorTypes.DISCORD_API;
  if (error?.name === 'AbortError' || /timeout|network|fetch failed|econn|enotfound/.test(message)) return ErrorTypes.NETWORK;
  if (/config|api key|not configured|missing.*env/.test(message)) return ErrorTypes.CONFIGURATION;
  if (/invalid|required|validation|provide|must be/.test(message)) return ErrorTypes.VALIDATION;
  return ErrorTypes.UNKNOWN;
}
function userMessage(error, type) {
  if (error?.userMessage) return String(error.userMessage);
  if (error?.code === 10062) return 'That interaction expired. Run the command again.';
  if ([40060, 50027].includes(error?.code)) return 'That action was already handled. Run the command again if needed.';
  if (error?.code === 50035) return 'Discord rejected the response format. Try again with different input.';
  return MESSAGES[type] || MESSAGES.unknown;
}
function buildErrorEmbed(error, context = {}) {
  const type = categorizeError(error);
  return createArgusEmbed({
    title: '❌ Request failed',
    description: userMessage(error, type),
    color: COLORS.error,
    fields: context.command ? [{ name: 'Operation', value: '/' + context.command, inline: true }] : []
  }, { commandName: context.command || 'argus' });
}
async function handleInteractionError(interaction, error, context = {}) {
  const type = categorizeError(error);
  logger.error({ err: error, errorType: type, command: context.command || interaction?.commandName, customId: interaction?.customId }, 'Argus interaction failed');
  const payload = { embeds: [buildErrorEmbed(error, { ...context, command: context.command || interaction?.commandName })] };
  try {
    if (interaction?.deferred && !interaction.replied) return await interaction.editReply(payload);
    if (interaction?.replied) return await interaction.followUp({ ...payload, ephemeral: true });
    return await interaction.reply({ ...payload, ephemeral: true });
  } catch (replyError) {
    logger.error({ err: replyError }, 'Failed to send Argus error response');
    return null;
  }
}
module.exports = { ErrorTypes, categorizeError, buildErrorEmbed, handleInteractionError };
