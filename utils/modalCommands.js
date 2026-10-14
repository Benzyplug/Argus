const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const PREFIX = 'argus:auto:';

function schema(command) { return command?.data?.toJSON ? command.data.toJSON() : null; }
function modalId(name) { return PREFIX + name; }

function parsePacked(value) {
  const out = {};
  for (const line of String(value || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function buildAutoModal(command) {
  const s = schema(command);
  const options = Array.isArray(s?.options) ? s.options : [];
  if (!options.length) return null;

  const modal = new ModalBuilder()
    .setCustomId(modalId(s.name))
    .setTitle(('Argus • ' + (s.name || 'Command')).slice(0, 45));

  if (options.length <= 5) {
    for (const o of options) {
      const choices = Array.isArray(o.choices) && o.choices.length
        ? 'Choices: ' + o.choices.map(c => c.name).join(', ')
        : '';
      const hint = o.type === 5 ? 'true / false' : (o.type === 4 || o.type === 10 ? 'Enter a number' : '');
      const input = new TextInputBuilder()
        .setCustomId(o.name)
        .setLabel(String(o.name).replace(/[-_]/g, ' ').slice(0, 45))
        .setPlaceholder((choices || hint || o.description || ('Enter ' + o.name)).slice(0, 100))
        .setStyle(TextInputStyle.Short)
        .setRequired(Boolean(o.required));
      if (o.min_length != null) input.setMinLength(o.min_length);
      if (o.max_length != null) input.setMaxLength(Math.min(o.max_length, 4000));
      modal.addComponents(new ActionRowBuilder().addComponents(input));
    }
  } else {
    const input = new TextInputBuilder()
      .setCustomId('__packed')
      .setLabel('Command options')
      .setPlaceholder('name=value, one per line')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(4000);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function valuesFromModal(interaction, command) {
  const options = schema(command)?.options || [];
  if (options.length <= 5) {
    return Object.fromEntries(options.map(o => [o.name, interaction.fields.getTextInputValue(o.name) || '']));
  }
  return parsePacked(interaction.fields.getTextInputValue('__packed'));
}

function makeOptions(values, command, client) {
  const defs = new Map((schema(command)?.options || []).map(o => [o.name, o]));
  const raw = name => values[name] ?? undefined;
  const string = (name, required = false) => {
    const v = raw(name);
    return v === undefined || v === '' ? (required ? '' : null) : String(v);
  };
  const bool = (name, required = false) => {
    const v = raw(name);
    return v === undefined || v === '' ? (required ? false : null) : /^(true|1|yes|on)$/i.test(String(v));
  };
  const integer = (name, required = false) => {
    const v = raw(name);
    if (v === undefined || v === '') return required ? 0 : null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };
  const number = (name, required = false) => {
    const v = raw(name);
    if (v === undefined || v === '') return required ? 0 : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const user = name => raw(name) ? client.users.cache.get(String(raw(name))) || null : null;
  const channel = name => raw(name) ? client.channels.cache.get(String(raw(name))) || null : null;
  const role = name => {
    const id = raw(name);
    if (!id) return null;
    for (const guild of client.guilds.cache.values()) {
      const r = guild.roles.cache.get(String(id));
      if (r) return r;
    }
    return null;
  };
  return {
    getString: string,
    getBoolean: bool,
    getInteger: integer,
    getNumber: number,
    getUser: user,
    getChannel: channel,
    getRole: role,
    getMentionable: user,
    getAttachment: () => null,
    getSubcommand: () => null,
    getSubcommandGroup: () => null,
    get(name) {
      const value = raw(name);
      const def = defs.get(name);
      return value == null ? null : { name, type: def?.type, value };
    }
  };
}

function isAutoModal(i) { return Boolean(i?.isModalSubmit?.() && String(i.customId || '').startsWith(PREFIX)); }
function commandNameFromModal(i) { return String(i.customId || '').slice(PREFIX.length); }

module.exports = { buildAutoModal, valuesFromModal, makeOptions, isAutoModal, commandNameFromModal };