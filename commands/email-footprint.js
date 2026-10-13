const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { spawn } = require('node:child_process');
const { createArgusEmbed, COLORS } = require('../utils/embedBuilder');
const { EMOJI } = require('../utils/emojis');
const { createSelectMenu } = require('../utils/components');
const { safeShowModal } = require('../utils/interactionHelper');
const { invalidInput, missingTool, timeout, generic } = require('../utils/errors');
const { isEmail } = require('../utils/validators');

const MAX_EMAIL_LENGTH = 254;
const HOLEHE_TIMEOUT_MS = 120000;
const HOLEHE_PLATFORM_COUNT = 120;
const HOLEHE_SOURCE = 'https://github.com/megadose/holehe';
const EMAIL_MENU_ID = 'argus:email-footprint:actions';
const EMAIL_MODAL_ID = 'argus:email-footprint:modal';
const EMAIL_MODAL_INPUT_ID = 'argus:email-footprint:email';

function escapeCode(value) {
  return String(value).replace(/\`/g, '\\`');
}

function buildEmailModal() {
  return new ModalBuilder()
    .setCustomId(EMAIL_MODAL_ID)
    .setTitle('Email Footprint')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(EMAIL_MODAL_INPUT_ID)
          .setLabel('Email address')
          .setPlaceholder('name@example.com')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(MAX_EMAIL_LENGTH)
          .setRequired(true)
      )
    );
}

function buildActionMenu() {
  return createSelectMenu(
    EMAIL_MENU_ID,
    'Email Footprint actions',
    [
      { label: 'Scan another email', value: 'scan', description: 'Open the email investigation form', emoji: '📧' },
      { label: 'View Argus help', value: 'help', description: 'Browse available Argus operations', emoji: '🧿' }
    ]
  );
}

function parseHoleheOutput(stdout) {
  const platforms = [];
  const seen = new Set();

  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^\[\+\]\s*(.+?)(?:\s*:\s*.*)?$/);
    if (!match) continue;

    const platform = match[1].trim().replace(/\s+$/, '');
    if (!platform || seen.has(platform)) continue;

    seen.add(platform);
    platforms.push(platform);
  }

  return platforms;
}

function runHolehe(email) {
  const binary = process.env.HOLEHE_PATH || 'holehe';

  return new Promise((resolve, reject) => {
    let child;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    try {
      child = spawn(binary, [email, '--only-used', '--no-color', '--no-gpg'], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      finish(reject, error);
      return;
    }

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.once('error', error => finish(reject, error));

    child.once('close', code => {
      if (code === 0) {
        finish(resolve, { stdout, stderr, code });
        return;
      }

      const error = new Error('Holehe exited with code ' + code);
      error.code = code;
      error.stderr = stderr;
      finish(reject, error);
    });

    timer = setTimeout(() => {
      const error = new Error('Holehe lookup timed out after 120 seconds');
      error.code = 'HOLEHE_TIMEOUT';
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch {}
      }, 2000).unref?.();
      finish(reject, error);
    }, HOLEHE_TIMEOUT_MS);
  });
}

function buildLoadingEmbed(email) {
  return createArgusEmbed({
    title: EMOJI.SEARCH + ' Checking email footprint...',
    description: '> Target email\n> \`' + escapeCode(email) + '\`',
    color: COLORS.general,
    footer: 'Holehe • 120+ platforms',
    timestamp: false
  }, { commandName: 'email-footprint' });
}

function buildResultsEmbed(email, platforms, seconds, interaction) {
  const fields = [];

  if (platforms.length) {
    for (let i = 0; i < platforms.length; i += 15) {
      const chunk = platforms.slice(i, i + 15);
      fields.push({
        name: 'Platforms ' + (Math.floor(i / 15) + 1),
        value: chunk.map(platform => EMOJI.GLOBE + ' ' + platform).join('\n'),
        inline: true
      });
    }
  } else {
    fields.push({
      name: EMOJI.OK + ' Result',
      value: 'No registrations detected across 120+ platforms.',
      inline: false
    });
  }

  fields.push({
    name: EMOJI.CHART + ' Summary',
    value: 'Scanned 120+ platforms in ' + seconds.toFixed(1) + ' seconds',
    inline: false
  });

  fields.push({
    name: '⌁ What’s next',
    value: 'Use the dropdown below to scan another email or open the Argus command guide.',
    inline: false
  });

  const avatar = interaction.client.user?.displayAvatarURL?.({ extension: 'png', size: 128 });

  return createArgusEmbed({
    title: '📧 Email Footprint — ' + email,
    description: '> Found the email registered on **' + platforms.length + '** platforms.',
    color: 0x5865F2,
    thumbnail: avatar || undefined,
    banner: process.env.EMBED_BANNER_URL || undefined,
    fields,
    footer: 'Source: Holehe • ' + HOLEHE_SOURCE,
    timestamp: true
  }, { commandName: 'email-footprint' });
}

async function runLookup(interaction, email) {
  if (email.length > MAX_EMAIL_LENGTH || !isEmail(email)) {
    return interaction.reply({
      embeds: [invalidInput(
        email,
        'a valid email address (for example: \`name@example.com\`)',
        email || 'N/A',
        '❌ Invalid email format'
      )]
    });
  }

  await interaction.deferReply();
  await interaction.editReply({ embeds: [buildLoadingEmbed(email)] });

  const startedAt = Date.now();

  try {
    const result = await runHolehe(email);
    const platforms = parseHoleheOutput(result.stdout);
    const seconds = (Date.now() - startedAt) / 1000;

    return interaction.editReply({
      embeds: [buildResultsEmbed(email, platforms, seconds, interaction)],
      components: [buildActionMenu()]
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return interaction.editReply({
        embeds: [missingTool(
          'Holehe',
          'The bot owner needs to install Holehe on this machine. Run \`pip install holehe\` and restart the bot.'
        )]
      });
    }

    if (error?.code === 'HOLEHE_TIMEOUT') {
      return interaction.editReply({
        embeds: [timeout('Holehe took too long to respond. Try again in a moment.')]
      });
    }

    console.error('[EMAIL-FOOTPRINT] Holehe failed:', error);
    if (error?.stderr) console.error('[EMAIL-FOOTPRINT] stderr:', error.stderr);

    return interaction.editReply({ embeds: [generic()] });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('email-footprint')
    .setDescription('Check where an email is registered using Holehe'),

  async execute(interaction) {
    return safeShowModal(interaction, buildEmailModal());
  },

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === EMAIL_MENU_ID) {
      const action = interaction.values[0];

      if (action === 'scan') {
        return safeShowModal(interaction, buildEmailModal());
      }

      if (action === 'help') {
        await interaction.reply({
          content: 'Use \`/help\` to browse the Argus command center.',
          ephemeral: true
        });
        return true;
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === EMAIL_MODAL_ID) {
      const email = String(
        interaction.fields.getTextInputValue(EMAIL_MODAL_INPUT_ID) || ''
      ).trim();

      await runLookup(interaction, email);
      return true;
    }

    return false;
  }
};
