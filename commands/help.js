const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { ARGUS_BANNER_URL } = require('../utils/embedBuilder');
const pkg = require('../package.json');
const { RESTRICTED_COMMANDS } = require('../utils/permissions');
const { createSelectMenu } = require('../utils/components');
const { safeShowModal } = require('../utils/interactionHelper');

const MENU = 'argus:help:category';
const HOME = 'argus:help:home';
const SEARCH = 'argus:help:search';
const MODAL = 'argus:help:search:modal';
const INPUT = 'argus:help:search:query';

const CATEGORY_RULES = [
  ['rankings','🎖 Rankings','Core Argus information', ['bot']],
  ['web','🌐 Web Intelligence','Web, domain, URL and network reconnaissance', ['dns','dork','extract-links','favicon','host-lookup','link-check','redirect-check','web-recon','whois','cert-search','subdomain-enum','wayback-history','web-tech','shodan-lookup','ip-info','ip-reputation']],
  ['identity','🕵️ OSINT & Identity','Identity, email and public-data investigation', ['company-search','google-investigate','maigret','nike','sherlock','username-gen','avatar-search','email-breach','email-footprint']],
  ['transport','🛰️ Transport','Airport, flight, vehicle and vessel intelligence', ['airport','flight','flight-number','vehicle','vessel']],
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
  });
  const other = [...available.values()].filter(x => !used.has(x.name)).sort((a,b) => a.name.localeCompare(b.name));
  if (other.length) result.push({ key:'other', title:'🧰 Other Operations', description:'Additional registered Argus operations', items:other });
  return result;
}

function base(client) {
  return new EmbedBuilder().setColor(0x5865f2).setAuthor({
    name:'ARGUS • Open Source Intelligence',
    iconURL:client.user?.displayAvatarURL?.({extension:'png',size:128})
  });
}
function finish(embed) {
  embed.setImage(ARGUS_BANNER_URL);
  return embed.setFooter({text:'⌬ ARGUS • v'+pkg.version+' • BY ẞ€ÑZ¥'});
}
function home(client) {
  const gs=groups(client);
  return finish(base(client).setTitle('🛡️ ARGUS Help Center').setDescription(
    'Your open-source intelligence toolkit for discovering, investigating, and correlating public information.\n\n' +
    '**Getting Started**\nChoose a category below to browse registered operations, or use **Find a Command** to search.\n\n' +
    gs.map(g => g.title+'\n'+g.description).join('\n\n')
  ));
}
function category(client,key) {
  const g=groups(client).find(x=>x.key===key);
  if(!g) return home(client);
  const value=g.items.length ? g.items.map(x => (x.restricted?'🔒 ':'')+'**'+x.name+'** — '+x.description).join('\n') : 'No registered commands in this category.';
  return finish(base(client).setTitle(g.title).setDescription(g.description).addFields({name:'Available commands',value:value.slice(0,1024)}));
}
function search(client,q) {
  const clean=String(q||'').trim().replace(/^\//,'').toLowerCase();
  const matches=[...commands(client).values()].filter(x => x.name.includes(clean)||x.description.toLowerCase().includes(clean)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,20);
  const e=base(client).setTitle(matches.length?'🔎 Command Search':'❌ No Command Found').setDescription(clean?'Results for **'+clean.slice(0,100)+'**':'Enter a command name or keyword.');
  if(matches.length)e.addFields({name:'Matches',value:matches.map(x=>(x.restricted?'🔒 ':'')+'**'+x.name+'** — '+x.description).join('\n').slice(0,1024)});
  return finish(e);
}
function components(client,selected=null) {
  const gs=groups(client);
  return [
    createSelectMenu(MENU,'Select a category',[{label:'All Commands',value:'all',description:'Return to the Argus Help Center',emoji:'🛡️',default:!selected},...gs.map(g=>({label:g.title.replace(/^\S+\s+/,'').slice(0,100),value:g.key,description:g.description.slice(0,100),default:selected===g.key})),{label:'Find a command…',value:'search',description:'Search by command or keyword',emoji:'🔎'}])
  ];
}
function buttons(back=false) {
  const list=[];
  if(back)list.push(new ButtonBuilder().setCustomId(HOME).setLabel('Back').setEmoji('⬅️').setStyle(ButtonStyle.Secondary));
  list.push(new ButtonBuilder().setCustomId(SEARCH).setLabel('Find a Command').setEmoji('🔎').setStyle(ButtonStyle.Primary));
  list.push(new ButtonBuilder().setLabel('Report Bug').setURL('https://github.com/Benzyplug/Argus/issues').setStyle(ButtonStyle.Link));
  return [new ActionRowBuilder().addComponents(list)];
}
function payload(client,key=null) {
  return {embeds:[key?category(client,key):home(client)],components:[...components(client,key),...buttons(Boolean(key))],allowedMentions:{parse:[]}};
}
function modal() {
  return new ModalBuilder().setCustomId(MODAL).setTitle('Find an Argus command').addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(INPUT).setLabel('Command name or keyword').setPlaceholder('Example: dns, email, reconnaissance').setStyle(TextInputStyle.Short).setMaxLength(50).setRequired(true)
  ));
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
      await i.reply({embeds:[search(i.client,i.fields.getTextInputValue(INPUT))]});
      return true;
    }
    return false;
  }
};