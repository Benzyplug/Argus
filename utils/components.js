const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');

function createSelectMenu(customId, placeholder, options = [], min = 1, max = 1) {
  if (!customId || typeof customId !== 'string') throw new Error('customId is required');
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId.slice(0, 100))
    .setPlaceholder(String(placeholder || 'Choose an option').slice(0, 150))
    .setMinValues(min)
    .setMaxValues(max)
    .addOptions(options.slice(0, 25));
  return new ActionRowBuilder().addComponents(menu);
}

function createButton(customId, label, style = ButtonStyle.Secondary, options = {}) {
  const button = new ButtonBuilder()
    .setCustomId(String(customId).slice(0, 100))
    .setLabel(String(label).slice(0, 80))
    .setStyle(style)
    .setDisabled(Boolean(options.disabled));
  if (options.emoji) button.setEmoji(options.emoji);
  return button;
}

function createButtonRow(buttons = []) {
  return new ActionRowBuilder().addComponents(buttons.filter(Boolean).slice(0, 5));
}

function createPaginationRow(prefix, currentPage, totalPages) {
  const page = Math.max(1, Number(currentPage) || 1);
  const total = Math.max(1, Number(totalPages) || 1);
  return createButtonRow([
    createButton(prefix + ':first', 'First', ButtonStyle.Secondary, { emoji: '⏮️', disabled: page <= 1 }),
    createButton(prefix + ':prev', 'Previous', ButtonStyle.Secondary, { emoji: '◀️', disabled: page <= 1 }),
    createButton(prefix + ':page', page + '/' + total, ButtonStyle.Secondary, { disabled: true }),
    createButton(prefix + ':next', 'Next', ButtonStyle.Secondary, { emoji: '▶️', disabled: page >= total }),
    createButton(prefix + ':last', 'Last', ButtonStyle.Secondary, { emoji: '⏭️', disabled: page >= total })
  ]);
}

function createConfirmationRow(prefix = 'argus:confirm') {
  return createButtonRow([
    createButton(prefix + ':yes', 'Confirm', ButtonStyle.Success, { emoji: '✅' }),
    createButton(prefix + ':no', 'Cancel', ButtonStyle.Danger, { emoji: '❌' })
  ]);
}

module.exports = {
  createSelectMenu,
  createButton,
  createButtonRow,
  createPaginationRow,
  createConfirmationRow,
  ButtonStyle
};
