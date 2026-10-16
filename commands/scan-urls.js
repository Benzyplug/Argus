const axios = require('axios');
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createArgusEmbed } = require('../utils/embedBuilder');

const MAX_URLS = 1500;
const CONCURRENCY = 15;
const TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function isBlockedHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h || h === 'localhost' || h === 'localhost.localdomain' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '0.0.0.0') return true;

  const parts = h.split('.').map(Number);
  if (parts.length === 4 && parts.every(Number.isInteger)) {
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  if (h.includes(':')) {
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
  }

  return false;
}

function normalizeUrls(text) {
  const raw = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const urls = [];
  const seen = new Set();

  for (const original of raw) {
    let line = original;
    if (line.startsWith('#')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) {
          for (const value of parsed) line = String(value);
        }
      } catch {}
    }

    if (line.includes(',') && !/^https?:\/\//i.test(line)) {
      line = line.split(',')[0].trim();
    }

    const match = line.match(/https?:\/\/[^\s,"']+/i);
    if (!match) continue;

    let value = match[0].replace(/[)>\]}]+$/, '');
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (isBlockedHostname(url.hostname)) continue;
      value = url.toString();
      if (!seen.has(value)) {
        seen.add(value);
        urls.push(value);
      }
    } catch {}
  }

  return urls.slice(0, MAX_URLS);
}

async function readAttachment(attachment) {
  const response = await axios.get(attachment.url, {
    responseType: 'text',
    timeout: 15000,
    maxContentLength: 1024 * 1024,
    maxBodyLength: 1024 * 1024,
    validateStatus: status => status >= 200 && status < 400,
    headers: { 'User-Agent': 'Argus/2.3 URL Scanner' }
  });
  return String(response.data || '');
}

async function scanUrl(url, needle, caseSensitive) {
  try {
    const response = await axios.get(url, {
      responseType: 'text',
      timeout: TIMEOUT_MS,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      validateStatus: status => status >= 200 && status < 400,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Argus/2.3 URL Scanner' }
    });

    const body = String(response.data || '');
    const haystack = caseSensitive ? body : body.toLowerCase();
    const target = caseSensitive ? needle : needle.toLowerCase();
    const index = haystack.indexOf(target);

    if (index === -1) return { url, status: response.status, matched: false };

    const start = Math.max(0, index - 120);
    const end = Math.min(body.length, index + target.length + 180);
    const snippet = body.slice(start, end).replace(/\s+/g, ' ').trim();

    return { url, status: response.status, matched: true, snippet };
  } catch (error) {
    return {
      url,
      matched: false,
      error: error.code || error.response?.status || error.message || 'request failed'
    };
  }
}

async function runPool(urls, worker) {
  const results = new Array(urls.length);
  let next = 0;

  async function runner() {
    while (true) {
      const index = next++;
      if (index >= urls.length) return;
      results[index] = await worker(urls[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, runner));
  return results;
}

module.exports = {
  nativeOptions: true,

  data: new SlashCommandBuilder()
    .setName('scan-urls')
    .setDescription('Scan an uploaded URL list for a specific string')
    .addAttachmentOption(option =>
      option.setName('file')
        .setDescription('TXT, CSV, or JSON file containing URLs')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('search')
        .setDescription('String to search for in the page content')
        .setRequired(true)
        .setMaxLength(500)
    )
    .addBooleanOption(option =>
      option.setName('case-sensitive')
        .setDescription('Match uppercase/lowercase exactly')
        .setRequired(false)
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('file');
    const needle = interaction.options.getString('search');
    const caseSensitive = interaction.options.getBoolean('case-sensitive') ?? false;

    if (!attachment || !needle?.trim()) {
      return interaction.reply({ content: '❌ Provide both a URL file and a search string.', ephemeral: true });
    }

    const filename = String(attachment.name || '').toLowerCase();
    if (!/\.(txt|csv|json)$/.test(filename)) {
      return interaction.reply({ content: '❌ Upload a .txt, .csv, or .json file.', ephemeral: true });
    }

    await interaction.deferReply();

    let urls;
    try {
      const content = await readAttachment(attachment);
      urls = normalizeUrls(content);
    } catch (error) {
      return interaction.editReply({
        embeds: [createArgusEmbed({
          title: '❌ URL Scan Failed',
          description: 'Argus could not read the uploaded file.',
          fields: [{ name: 'Error', value: String(error.message || error).slice(0, 900) }]
        }, { commandName: 'scan-urls', client: interaction.client })]
      });
    }

    if (!urls.length) {
      return interaction.editReply({
        embeds: [createArgusEmbed({
          title: '❌ No Valid URLs',
          description: 'No valid public HTTP/HTTPS URLs were found in the uploaded file.'
        }, { commandName: 'scan-urls', client: interaction.client })]
      });
    }

    const results = await runPool(urls, url => scanUrl(url, needle.trim(), caseSensitive));
    const matches = results.filter(result => result.matched);
    const failures = results.filter(result => result.error);

    const lines = [
      '# ARGUS URL SCAN RESULTS',
      '',
      'Search: ' + needle.trim(),
      'Case-sensitive: ' + (caseSensitive ? 'yes' : 'no'),
      'URLs scanned: ' + urls.length,
      'Matches: ' + matches.length,
      'Failed: ' + failures.length,
      ''
    ];

    if (matches.length) {
      lines.push('## MATCHES');
      for (const result of matches) {
        lines.push(result.url);
        if (result.snippet) lines.push('  ' + result.snippet.slice(0, 500));
        lines.push('');
      }
    } else {
      lines.push('No matching URLs were found.');
    }

    if (failures.length) {
      lines.push('', '## FAILED');
      for (const result of failures.slice(0, 500)) {
        lines.push(result.url + ' — ' + result.error);
      }
    }

    const output = Buffer.from(lines.join('\n'), 'utf8');
    const embed = createArgusEmbed({
      title: '🔎 ARGUS URL Scan',
      description: matches.length
        ? '**' + matches.length + '** matching URL(s) found for "' + needle.trim().slice(0, 200) + '".'
        : 'No matching URLs were found.',
      fields: [
        { name: '🌐 Scanned', value: String(urls.length), inline: true },
        { name: '🎯 Matches', value: String(matches.length), inline: true },
        { name: '⚠️ Failed', value: String(failures.length), inline: true },
        { name: '⚡ Mode', value: CONCURRENCY + ' concurrent requests • ' + (caseSensitive ? 'case-sensitive' : 'case-insensitive'), inline: false }
      ]
    }, { commandName: 'scan-urls', client: interaction.client });

    await interaction.editReply({
      embeds: [embed],
      files: [new AttachmentBuilder(output, { name: 'argus-url-scan-results.txt' })],
      allowedMentions: { parse: [] }
    });
  }
};
