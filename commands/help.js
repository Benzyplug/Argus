const {
  SlashCommandBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const { ARGUS_BANNER_URL } = require('../utils/embedBuilder');
const pkg = require('../package.json');
const { RESTRICTED_COMMANDS } = require('../utils/permissions');
const { safeShowModal } = require('../utils/interactionHelper');

const MENU = 'argus:help:category';
const HOME = 'argus:help:home';
const SEARCH = 'argus:help:search';
const MODAL = 'argus:help:search:modal';
const INPUT = 'argus:help:search:query';

const CATEGORY_RULES = [
  ['rankings','🎖 Rankings','Core Argus information', ['bot']],
  ['web','🌐 Web Intelligence','Web, domain, URL and network reconnaissance', ['dns','dork','extract-links','favicon','host-lookup','link-check','redirect-check','web-recon','whois','cert-search','subdomain-enum','wayback-history','web-tech','shodan-lookup','ip-info','ip-reputation']],
  ['identity','🕵️ OSINT & Identity','Identity, email and public-data investigation', ['company-search','google-investigate','maigret','sherlock','username-gen','avatar-search','email-breach','email-footprint']],
  ['files','🧬 Files & Data','Blockchain, metadata and file analysis', ['blockchain','crypto-detect','doc-meta','exif','upload']],
  ['utilities','🤖 AI & Utilities','AI, monitoring and security utilities', ['ai','image-ai','jwt','monitor','nuclei-scan']]
];

function commands(client) {
  return new Map([...client.commands.values()].map(c => [c.data.name, {
    name: c.data.name,
    description: c.data.description || 'Argus operation',
    restricted: Object.prototype.hasOwnProperty.call(RESTRICTED_COMMANDS, c.data.name)
  }]));
}

function groups(client) {
  const available = commands(client);
  const used = new Set();
  const result = CATEGORY_RULES.map(([key,title,description,names]) => {
    const items = names.map(n => available.get(n)).filter(Boolean);
    items.forEach(x => used.add(x.name));
    return { key,title,description,items };
  }).filter(g => g.items.length);
  const other = [...available.values()].filter(x => !used.has(x.name)).sort((a,b) => a.name.localeCompare(b.name));
  if (other.length) result.push({ key:'other', title:'🧰 Other Operations', description:'Additional registered Argus operations', items:other });
  return result;
}

function menu(client, selected=null) {
  const options = [
    new StringSelectMenuOptionBuilder().setLabel('All Commands').setValue('all').setDescription('Return to the Argus Help Center').setEmoji('🛡️').setDefault(!selected),
    ...groups(client).map(g => new StringSelectMenuOptionBuilder()
      .setLabel(g.title.replace(/^\S+\s+/,'').slice(0,100))
      .setValue(g.key)
      .setDescription(g.description.slice(0,100))
      .setDefault(selected===g.key)),
    new StringSelectMenuOptionBuilder().setLabel('Find a command…').setValue('search').setDescription('Search by command or keyword').setEmoji('🔎')
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(MENU).setPlaceholder('Select a category').addOptions(options)
  );
}

function buttons(back=false) {
  const list=[];
  if(back) list.push(new ButtonBuilder().setCustomId(HOME).setLabel('Back').setEmoji('⬅️').setStyle(ButtonStyle.Secondary));
  list.push(new ButtonBuilder().setCustomId(SEARCH).setLabel('Find a Command').setEmoji('🔎').setStyle(ButtonStyle.Primary));
  list.push(new ButtonBuilder().setLabel('Report Bug').setURL('https://github.com/Benzyplug/Argus/issues').setStyle(ButtonStyle.Link));
  return new ActionRowBuilder().addComponents(list);
}

function textFor(client,key=null) {
  const gs=groups(client);
  if (!key) {
    return [
      '# 🛡️ ARGUS Help Center',
      'Your open-source intelligence toolkit for discovering, investigating, and correlating public information.',
      '',
      '### Getting Started',
      'Choose a category below to browse registered operations, or use **Find a Command** to search.',
      '',
      ...gs.flatMap(g => ['### '+g.title, g.description, ''])
    ].join('\n').slice(0,4000);
  }
  const g=gs.find(x=>x.key===key);
  if(!g) return textFor(client);
  return [
    '# '+g.title,
    g.description,
    '',
    '### Available commands',
    ...g.items.map(x => (x.restricted?'🔒 ':'')+'**'+x.name+'** — '+x.description)
  ].join('\n').slice(0,4000);
}

function searchText(client,q) {
  const clean=String(q||'').trim().replace(/^\//,'').toLowerCase();
  const matches=[...commands(client).values()]
    .filter(x => x.name.includes(clean)||x.description.toLowerCase().includes(clean))
    .sort((a,b)=>a.name.localeCompare(b.name)).slice(0,20);
  if(!matches.length) return '# ❌ No Command Found\nNo command matched **'+clean.slice(0,100)+'**.';
  return ['# 🔎 Command Search','Results for **'+clean.slice(0,100)+'**','',...matches.map(x=>(x.restricted?'🔒 ':'')+'**'+x.name+'** — '+x.description)].join('\n').slice(0,4000);
}

function container(client, key=null, searchQuery=null) {
  const body = searchQuery === null ? textFor(client,key) : searchText(client,searchQuery);
  const c = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(ARGUS_BANNER_URL).setDescription('ARGUS')
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(menu(client,key))
    .addActionRowComponents(buttons(Boolean(key)))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# ⌬ ARGUS • v'+pkg.version+' • BY ẞ€ÑZ¥')
    );
  return c;
}

function payload(client,key=null,searchQuery=null) {
  return {
    components:[container(client,key,searchQuery)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions:{parse:[]},
    __argusRaw:true
  };
}

function modal() {
  return new ModalBuilder().setCustomId(MODAL).setTitle('Find an Argus command').addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(INPUT).setLabel('Command name or keyword').setPlaceholder('Example: dns, email, reconnaissance').setStyle(TextInputStyle.Short).setMaxLength(50).setRequired(true)
    )
  );
}

module.exports={
  data:new SlashCommandBuilder().setName('help').setDescription('View the Argus command guide'),
  async execute(i){await i.reply(payload(i.client));},
  async handleInteraction(i){
    if(i.isStringSelectMenu()&&i.customId===MENU){
      const v=i.values[0];
      if(v==='search'){await safeShowModal(i,modal());return true;}
      await i.update(v==='all'?payload(i.client):payload(i.client,v));return true;
    }
    if(i.isButton()&&i.customId===SEARCH){await safeShowModal(i,modal());return true;}
    if(i.isButton()&&i.customId===HOME){await i.update(payload(i.client));return true;}
    if(i.isModalSubmit()&&i.customId===MODAL){
      await i.reply(payload(i.client,null,i.fields.getTextInputValue(INPUT)));
      return true;
    }
    return false;
  }
};