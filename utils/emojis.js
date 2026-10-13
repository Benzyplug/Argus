const EMOJI = Object.freeze({
  EMAIL: '📧',
  GLOBE: '🌐',
  WARN: '⚠️',
  OK: '✅',
  FAIL: '❌',
  CLOCK: '⏱️',
  CHART: '📊',
  SEARCH: '🔎',
  LOADING: '⏳',
  USER: '👤',
  NETWORK: '🛰️',
  LINK: '🔗',
  LOCK: '🔒'
});

// Backwards-compatible aliases for existing Argus commands.
module.exports = Object.freeze({
  EMOJI,
  search: EMOJI.SEARCH,
  domain: EMOJI.GLOBE,
  email: EMOJI.EMAIL,
  identity: EMOJI.USER,
  blockchain: '⛓️',
  warning: EMOJI.WARN,
  success: EMOJI.OK,
  error: EMOJI.FAIL,
  network: EMOJI.NETWORK,
  security: '🛡️',
  ai: '🧠',
  file: '📄',
  image: '🖼️',
  flight: '✈️',
  vessel: '🚢',
  vehicle: '🚗',
  company: '🏢',
  link: EMOJI.LINK,
  time: '🕒',
  chart: EMOJI.CHART,
  source: EMOJI.SEARCH,
  lock: EMOJI.LOCK,
  loading: EMOJI.LOADING
});
