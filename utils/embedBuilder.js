const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const ARGUS_BANNER_PATH = path.join(__dirname, '..', 'banner.png');

function hasLocalArgusBanner() {
  try { return fs.existsSync(ARGUS_BANNER_PATH); } catch { return false; }
}

function argusBannerFile() {
  return hasLocalArgusBanner() ? new AttachmentBuilder(ARGUS_BANNER_PATH, { name: 'banner.png' }) : null;
}

const COLORS = Object.freeze({
  network: 0x3498db, identity: 0x9b59b6, blockchain: 0x2ecc71, aviation: 0x00a8ff,
  security: 0xe74c3c, ai: 0x8e44ad, files: 0xf1c40f, general: 0x5865f2,
  success: 0x2ecc71, error: 0xe74c3c, warning: 0xf1c40f
});
const ERROR_COLOR = COLORS.error;

function getArgusBanner(client) {
  try {
    const bot = client?.user;
    return bot?.bannerURL?.({ extension: 'png', size: 2048 }) ||
      client?.application?.coverURL?.({ extension: 'png', size: 1024 }) ||
      process.env.EMBED_BANNER_URL || null;
  } catch { return process.env.EMBED_BANNER_URL || null; }
}

function categoryFor(commandName = '') {
  const n = commandName.toLowerCase();
  if (/dns|host|link|web|redirect|favicon|extract/.test(n)) return 'network';
  if (/username|maigret|sherlock|google|whois|company|nike/.test(n)) return 'identity';
  if (/blockchain|crypto|jwt/.test(n)) return 'blockchain';
  if (/flight|airport|vessel|vehicle/.test(n)) return 'aviation';
  if (/nuclei|security|recon/.test(n)) return 'security';
  if (/ai|image/.test(n)) return 'ai';
  if (/exif|upload|doc/.test(n)) return 'files';
  return 'general';
}

function safeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try { return new URL(value).toString(); } catch { return null; }
}

function targetFromInteraction(interaction) {
  try {
    const opts = interaction.options?.data || [];
    const values = [];
    const walk = list => (list || []).forEach(o => { if (typeof o.value === 'string') values.push(o.value); walk(o.options); });
    walk(opts);
    return values[0] || null;
  } catch { return null; }
}

function faviconForTarget(target) {
  if (!target) return null;
  const clean = String(target).replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (!clean || !clean.includes('.')) return null;
  return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(clean) + '&sz=128';
}

function createArgusEmbed(config = {}, context = {}) {
  const embed = new EmbedBuilder().setColor(config.color ?? COLORS[categoryFor(context.commandName)] ?? COLORS.general);
  if (config.title) embed.setTitle(String(config.title).slice(0, 256));
  if (config.description) embed.setDescription(String(config.description).slice(0, 4096));
  if (Array.isArray(config.fields) && config.fields.length) embed.addFields(config.fields.slice(0, 25));
  if (config.url) { const url = safeUrl(config.url); if (url) embed.setURL(url); }
  if (config.thumbnail) { const url = safeUrl(config.thumbnail); if (url) embed.setThumbnail(url); }
  if (config.banner) { const url = safeUrl(config.banner); if (url) embed.setImage(url); }
  if (config.author) embed.setAuthor(config.author);
  if (config.footer) embed.setFooter({ text: String(config.footer).slice(0, 2048) });
  if (config.timestamp !== false) embed.setTimestamp(config.timestamp instanceof Date ? config.timestamp : new Date());
  return embed;
}

function fieldEmoji(name = '') {
  const n = name.toLowerCase();
  if (/email|mail/.test(n)) return '📧';
  if (/domain|dns|url|host|website|link/.test(n)) return '🌐';
  if (/user|username|identity|account|profile/.test(n)) return '👤';
  if (/ip|network|port|asn|isp/.test(n)) return '🛰️';
  if (/blockchain|crypto|wallet|transaction|address|token/.test(n)) return '⛓️';
  if (/warning|reason|risk|threat/.test(n)) return '⚠️';
  if (/error|failed|failure/.test(n)) return '❌';
  if (/success|status|result|found/.test(n)) return '✅';
  if (/source|provider|api/.test(n)) return '🔎';
  if (/time|date|created|updated/.test(n)) return '🕒';
  return '•';
}

function decorateFields(fields) {
  return fields.map(field => {
    const name = String(field.name || '');
    const decoratedName = /^[\p{Extended_Pictographic}]/u.test(name) || name.startsWith('•')
      ? name
      : fieldEmoji(name) + ' ' + name;
    return { ...field, name: decoratedName };
  });
}

function styleEmbed(input, context = {}) {
  const json = input instanceof EmbedBuilder ? input.toJSON() : { ...input };
  const commandName = context.commandName || '';
  const category = categoryFor(commandName);
  const embed = new EmbedBuilder(json).setColor(json.color || COLORS[category]);
  const bot = context.client?.user;
  const botName = bot?.username || process.env.BOT_NAME || 'Argus';
  const botIcon = bot?.displayAvatarURL?.({ extension: 'png', size: 64 });
  if (!json.author) embed.setAuthor({ name: '〢 Intelligence' });
  const target = context.target || targetFromInteraction(context.interaction);
  if (!json.thumbnail?.url) {
    const targetIcon = faviconForTarget(target);
    if (targetIcon) embed.setThumbnail(targetIcon);
    else if (botIcon) embed.setThumbnail(botIcon);
  }
  const title = json.title || '';
  const isError = /(^|\s)(❌|error|failed|failure)/i.test(title);
  if (title && !/^[✅❌⚠️]/.test(title)) embed.setTitle(title.slice(0, 256));
  let fields = decorateFields([...(json.fields || [])]);
  if (!fields.some(f => /(?:🕒|⏱️)\s*Scanned at/i.test(f.name || ''))) fields.push({ name: '🕒 Scanned at', value: '<t:' + Math.floor(Date.now() / 1000) + ':F>', inline: false });
  if (isError && fields.length < 25) fields.push({ name: '🆘 Support', value: process.env.SUPPORT_URL || 'https://github.com/Benzyplug/Argus/issues', inline: false });
  embed.setFields(fields.slice(0, 25));
  embed.setFooter({ text: '⌬ ARGUS • v' + pkg.version + ' • BY Lmao_2.0' });
  return embed;
}

function bannerEmbed(context = {}) {
  if (hasLocalArgusBanner()) {
    return new EmbedBuilder()
      .setColor(COLORS.general)
      .setImage('attachment://banner.png');
  }

  const banner = context.banner || getArgusBanner(context.client);
  const url = safeUrl(banner);
  if (!url) return null;

  return new EmbedBuilder()
    .setColor(COLORS.general)
    .setImage(url);
}

function stylePayload(payload, context = {}) {
  const result = typeof payload === 'string' ? {} : { ...(payload || {}) };

  if (typeof payload === 'string') {
    const content = payload.trim();
    const isError = /^\s*(❌|⚠️|error|failed|failure)/i.test(content);
    result.embeds = [styleEmbed({
      title: isError ? '❌ Request failed' : '',
      description: content.slice(0, 4096),
      color: isError ? COLORS.error : COLORS[categoryFor(context.commandName)]
    }, context)];
  } else if (!Array.isArray(result.embeds) && typeof result.content === 'string' && result.content.trim()) {
    const content = result.content.trim();
    const isError = /^\s*(❌|⚠️|error|failed|failure)/i.test(content);
    result.embeds = [styleEmbed({
      title: isError ? '❌ Request failed' : '',
      description: content.slice(0, 4096),
      color: isError ? COLORS.error : COLORS[categoryFor(context.commandName)]
    }, context)];
    delete result.content;
  } else if (Array.isArray(result.embeds)) {
    result.embeds = result.embeds.map(embed => styleEmbed(embed, context));
  }

  const banner = bannerEmbed(context);
  if (banner) {
    result.embeds = [banner, ...(result.embeds || [])];
    const bannerFile = argusBannerFile();
    if (bannerFile) result.files = [bannerFile, ...(result.files || [])];
  }
  return result;
}

function loadingEmbed(interaction, toolName) {
  const target = targetFromInteraction(interaction);
  return createArgusEmbed({
    title: '⌁ Processing…',
    description: '> `〢` Processing your request…',
    fields: [{ name: '🛰️ Tool', value: '`' + (toolName || interaction.commandName || 'Argus') + '`', inline: true }],
    footer: '⌬ ARGUS • v' + pkg.version + ' • BY Lmao_2.0'
  }, { interaction, commandName: interaction.commandName, client: interaction.client });
}

module.exports = { COLORS, ERROR_COLOR, categoryFor, targetFromInteraction, createArgusEmbed, styleEmbed, stylePayload, loadingEmbed, faviconForTarget, getArgusBanner, bannerEmbed, argusBannerFile };