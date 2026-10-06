const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const pkg = require('../package.json');
const { stylePayload, loadingEmbed } = require('../utils/embedBuilder');

const GROUPS = {
  web: { label: '🌐 Web Intelligence', emoji: '🌐', test: n => /dns|host|web|link|redirect|favicon|whois/i.test(n) },
  identity: { label: '🕵️ OSINT & Identity', emoji: '🕵️', test: n => /user|google|company|search|maigret|sherlock|dork|nike/i.test(n) },
  transport: { label: '🛰️ Transport', emoji: '🛰️', test: n => /flight|airport|vessel|vehicle/i.test(n) },
  data: { label: '🧬 Files & Data', emoji: '🧬', test: n => /exif|meta|upload|blockchain|crypto|doc/i.test(n) },
  ai: { label: '🤖 AI & Utilities', emoji: '🤖', test: n => /ai|health|jwt|monitor|nuclei/i.test(n) }
};

const stamp = () => `⌬ ARGUS • v${pkg.version} • Owner: Lmao_2.0`;

function groups(client) {
  const all = [...client.commands.values()].filter(c => c?.data?.name && !['commands', 'owner'].includes(c.data.name));
  const out = {};
  Object.keys(GROUPS).forEach(k => out[k] = []);
  for (const command of all) {
    const name = command.data.name;
    const key = Object.keys(GROUPS).find(k => GROUPS[k].test(name)) || 'ai';
    if (out[key].length < 25) out[key].push(command);
  }
  return out;
}

function home(client) {
  const count = [...client.commands.values()].filter(c => c?.data?.name && !['commands'].includes(c.data.name)).length;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⌬ ARGUS • COMMANDS')
    .setDescription('**Interactive intelligence console**\n\nChoose a category, select an operation, then enter its real options in the modal.')
    .addFields(
      { name: '◈ Commands', value: `\`${count}\` registered`, inline: true },
      { name: '◈ Interface', value: 'Dropdowns • Modals • Buttons', inline: true },
      { name: '◈ Build', value: `v${pkg.version}`, inline: true }
    )
    .setFooter({ text: stamp() })
    .setTimestamp();
}

function categoryRow(client, uid) {
  const gs = groups(client);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`argus:category:${uid}`)
    .setPlaceholder('Select an intelligence category')
    .addOptions(Object.entries(GROUPS).map(([key, group]) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(group.label)
        .setDescription(`${gs[key].length} registered operation(s)`.slice(0, 100))
        .setValue(key)
        .setEmoji(group.emoji)
    ));
  return new ActionRowBuilder().addComponents(menu);
}

function toolRows(client, key, uid) {
  const list = groups(client)[key] || [];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`argus:tool:${uid}:${key}`)
    .setPlaceholder('Select an operation')
    .addOptions(list.map(command =>
      new StringSelectMenuOptionBuilder()
        .setLabel('/' + command.data.name)
        .setDescription(String(command.data.description || 'Argus operation').slice(0, 100))
        .setValue(command.data.name)
    ));

  const back = new ButtonBuilder()
    .setCustomId(`argus:back:${uid}`)
    .setLabel('Back')
    .setEmoji('↩️')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(back)
  ];
}

function commandOptions(command) {
  const raw = command?.data?.toJSON?.() || {};
  const options = raw.options || [];
  const subcommands = options.filter(o => o.type === 1 || o.type === 2);
  const leaves = [];

  const walk = list => {
    for (const option of list || []) {
      if (option.type === 1 || option.type === 2) walk(option.options);
      else if ([3, 4, 5, 6, 7, 8, 9, 10].includes(option.type)) leaves.push(option);
    }
  };
  walk(options);
  return { subcommands, leaves };
}

function modal(command, uid) {
  const { subcommands, leaves } = commandOptions(command);
  const tool = command.data.name;
  const modal = new ModalBuilder()
    .setCustomId(`argus:modal:${uid}:${tool}`)
    .setTitle((`ARGUS • /${tool}`).slice(0, 45));

  const inputs = [];

  if (subcommands.length) {
    const names = subcommands.map(s => s.name).join(', ');
    inputs.push(
      new TextInputBuilder()
        .setCustomId('argus_subcommand')
        .setLabel('Subcommand')
        .setPlaceholder(names.slice(0, 100))
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
    );
  }

  for (const option of leaves.slice(0, 5 - inputs.length)) {
    const typeLabel = option.type === 5 ? 'true or false' : 'value';
    const input = new TextInputBuilder()
      .setCustomId('argus_opt_' + option.name)
      .setLabel(option.name.slice(0, 45))
      .setPlaceholder(String(option.description || typeLabel).slice(0, 100))
      .setStyle(TextInputStyle.Short)
      .setRequired(Boolean(option.required))
      .setMaxLength(4000);

    if (option.type === 5) input.setPlaceholder('true or false');
    if (option.choices?.length) {
      input.setPlaceholder(option.choices.map(c => c.value).join(', ').slice(0, 100));
    }

    inputs.push(input);
  }

  if (!inputs.length) {
    inputs.push(
      new TextInputBuilder()
        .setCustomId('argus_target')
        .setLabel('Input')
        .setPlaceholder('Enter input for this operation')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(4000)
    );
  }

  modal.addComponents(inputs.map(input => new ActionRowBuilder().addComponents(input)));
  return modal;
}

function findOption(interaction, name) {
  const walk = list => {
    for (const option of list || []) {
      if (option.name === name) return option;
      const nested = walk(option.options);
      if (nested !== undefined) return nested;
    }
    return undefined;
  };
  return findOptionFromModal(interaction, name) ?? walk(interaction.__argusModalOptions || []);
}

function findOptionFromModal(interaction, name) {
  try {
    const value = interaction.fields.getTextInputValue('argus_opt_' + name);
    return value === '' ? undefined : value;
  } catch {
    return undefined;
  }
}

function createModalOptions(interaction, command) {
  const { subcommands } = commandOptions(command);
  const activeSubcommand = (() => {
    try { return interaction.fields.getTextInputValue('argus_subcommand').trim(); } catch { return null; }
  })();

  const selected = subcommands.find(s => s.name === activeSubcommand);
  const selectedOptions = selected?.options || [];

  const allLeaves = [];
  const walk = list => {
    for (const option of list || []) {
      if (option.type === 1 || option.type === 2) walk(option.options);
      else allLeaves.push(option);
    }
  };
  walk(selected ? selectedOptions : commandOptions(command).leaves);

  const values = new Map();
  for (const option of allLeaves) {
    try {
      const raw = interaction.fields.getTextInputValue('argus_opt_' + option.name);
      if (raw !== '') values.set(option.name, raw);
    } catch {}
  }

  const get = name => values.get(name);
  const asBool = value => value === undefined ? null : /^(true|1|yes|y|on)$/i.test(String(value));

  return {
    data: allLeaves.map(option => ({
      name: option.name,
      type: option.type,
      value: get(option.name)
    })).filter(x => x.value !== undefined),
    getString: name => {
      const value = get(name);
      return value === undefined ? null : String(value);
    },
    getInteger: name => {
      const value = get(name);
      return value === undefined ? null : Number.parseInt(value, 10);
    },
    getNumber: name => {
      const value = get(name);
      return value === undefined ? null : Number(value);
    },
    getBoolean: name => asBool(get(name)),
    getAttachment: () => null,
    getChannel: () => null,
    getRole: () => null,
    getUser: () => null,
    getMentionable: () => null,
    getSubcommand: () => activeSubcommand || null,
    getSubcommandGroup: () => null
  };
}

function createExecutionInteraction(interaction, command) {
  const options = createModalOptions(interaction, command);
  const originalReply = interaction.reply.bind(interaction);
  const originalEditReply = interaction.editReply.bind(interaction);
  const originalFollowUp = interaction.followUp.bind(interaction);
  const originalDeferReply = interaction.deferReply.bind(interaction);

  const styled = payload => stylePayload(payload, {
    interaction,
    client: interaction.client,
    commandName: command.data.name
  });

  return new Proxy(interaction, {
    get(target, property, receiver) {
      if (property === 'commandName') return command.data.name;
      if (property === 'options') return options;
      if (property === 'reply') return payload => originalReply(styled(payload));
      if (property === 'editReply') return payload => originalEditReply(styled(payload));
      if (property === 'followUp') return payload => originalFollowUp(styled(payload));
      if (property === 'deferReply') return async () => originalDeferReply({ embeds: [loadingEmbed(interaction, command.data.name)] });
      return Reflect.get(target, property, receiver);
    }
  });
}

async function execute(interaction) {
  await interaction.reply({
    embeds: [home(interaction.client)],
    components: [categoryRow(interaction.client, interaction.user.id)]
  });
}

async function handleInteraction(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('argus:')) return false;

  const parts = id.split(':');
  const uid = parts[2];

  if (uid !== interaction.user.id) {
    await interaction.reply({ content: '❌ This control panel belongs to another user.', ephemeral: true });
    return true;
  }

  if (interaction.isStringSelectMenu() && parts[1] === 'category') {
    const key = interaction.values[0];
    const group = GROUPS[key];
    if (!group) return true;
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(group.label)
          .setDescription('Select an operation below.')
          .setFooter({ text: stamp() })
          .setTimestamp()
      ],
      components: toolRows(interaction.client, key, uid)
    });
    return true;
  }

  if (interaction.isStringSelectMenu() && parts[1] === 'tool') {
    const command = interaction.client.commands.get(interaction.values[0]);
    if (!command) {
      await interaction.reply({ content: '❌ That Argus operation is unavailable.', ephemeral: true });
      return true;
    }
    await interaction.showModal(modal(command, uid));
    return true;
  }

  if (interaction.isButton() && parts[1] === 'back') {
    await interaction.update({
      embeds: [home(interaction.client)],
      components: [categoryRow(interaction.client, uid)]
    });
    return true;
  }

  if (interaction.isModalSubmit() && parts[1] === 'modal') {
    const tool = parts[3];
    const command = interaction.client.commands.get(tool);

    if (!command || tool === 'commands' || tool === 'owner') {
      await interaction.reply({ content: '❌ The selected Argus operation could not be loaded.', ephemeral: true });
      return true;
    }

    const executionInteraction = createExecutionInteraction(interaction, command);

    try {
      await command.execute(executionInteraction);
    } catch (error) {
      console.error(`[ARGUS DASHBOARD] /${tool} failed:`, error);

      const message = {
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('❌ ARGUS • Operation Failed')
            .setDescription('The selected operation could not complete. Check the command configuration and try again.')
            .setFooter({ text: stamp() })
            .setTimestamp()
        ]
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(message);
      } else {
        await interaction.reply(message);
      }
    }

    return true;
  }

  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Open the interactive Argus command dashboard'),
  execute,
  handleInteraction
};
