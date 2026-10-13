const { ERROR_COLOR, createArgusEmbed } = require('./embedBuilder');

const ERROR_ORANGE = 0xf39c12;

function baseError(title, description, fields = [], color = ERROR_COLOR) {
  return createArgusEmbed({
    title: title.startsWith('❌') || title.startsWith('⏱️') ? title : '❌ ' + title,
    description,
    fields,
    color
  }, { commandName: 'error' });
}

function invalidInput(input, expected = 'valid input', provided = input, title = 'Invalid input') {
  return baseError(
    title,
    'The provided value is not valid.\n\n' +
      '**Provided:** `' + String(provided ?? 'N/A').slice(0, 900) + '`\n' +
      '**Example:** `' + expected.replace(/^a valid /i, '').replace(/[.]+$/, '') + '`',
    []
  );
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

function missingTool(tool = 'the required tool', instruction = 'Install the required tool and restart the bot.') {
  return baseError(
    tool.toLowerCase() === 'holehe' ? '❌ Holehe is not available' : 'Missing tool',
    instruction,
    [],
    ERROR_ORANGE
  );
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

function timeout(message = 'The operation took too long to complete. Try again in a moment.') {
  return baseError('⏱️ Lookup timed out', message, [], ERROR_ORANGE);
}

function generic(message = 'Something went wrong while processing the lookup. Please try again later.') {
  return baseError('❌ Lookup failed', message, [], ERROR_COLOR);
}

module.exports = {
  invalidInput,
  missingTool,
  apiDown,
  missingKey,
  rateLimited,
  notFound,
  timeout,
  generic
};
