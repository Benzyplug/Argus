const { EmbedBuilder } = require('discord.js');
const { ERROR_COLOR } = require('./embedBuilder');

function baseError(title, description, fields = []) {
  return new EmbedBuilder().setColor(ERROR_COLOR)
    .setTitle(title.startsWith('❌') ? title : '❌ ' + title)
    .setDescription(description).addFields(fields).setTimestamp();
}
function invalidInput(input, expected, provided) {
  return baseError('Invalid input', 'Expected ' + expected + '.', [
    { name: '⚠️ Provided', value: '`' + String(provided ?? 'N/A').slice(0, 900) + '`' },
    { name: '💡 Fix', value: 'Check the command options and try again.' }
  ]);
}
function apiDown(service, reason) {
  return baseError('Service unavailable', 'Argus could not complete the request through **' + service + '**.', [
    { name: '⚠️ Likely cause', value: reason || 'The upstream service did not return a usable response.' },
    { name: '💡 Fix', value: 'Try again shortly. If it continues, check the service status or API configuration.' }
  ]);
}
function missingKey(key) {
  return baseError('Configuration missing', 'The required API credential for **' + key + '** is not configured.', [
    { name: '🔑 Variable', value: '`' + key + '`' },
    { name: '💡 Fix', value: 'Ask the bot administrator to add the variable to the deployment environment.' }
  ]);
}
function rateLimited(service, retry) {
  return baseError('Rate limited', '**' + service + '** temporarily rejected the request.', [
    { name: '⚠️ Why', value: 'The upstream service rate limit was reached.' },
    { name: '🕒 Retry', value: 'Try again in ' + (retry || 'a short while') + '.' }
  ]);
}
function notFound(target, source) {
  return baseError('Not found', 'No useful result for `' + String(target).slice(0, 500) + '` was returned by **' + (source || 'the requested source') + '**.', [
    { name: '💡 Next step', value: 'Check the target spelling or try a related Argus command.' }
  ]);
}
module.exports = { invalidInput, apiDown, missingKey, rateLimited, notFound };