const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const pkg = require('../package.json');

const GROUPS = {
  web: { label:'🌐 Web Intelligence', emoji:'🌐', test:n=>/dns|host|web|link|redirect|favicon/i.test(n) },
  identity: { label:'🕵️ OSINT & Identity', emoji:'🕵️', test:n=>/user|whois|google|company|search|maigret|sherlock|dork/i.test(n) },
  transport: { label:'🛰️ Transport', emoji:'🛰️', test:n=>/flight|airport|vessel|vehicle/i.test(n) },
  data: { label:'🧬 Files & Data', emoji:'🧬', test:n=>/exif|meta|upload|blockchain|crypto/i.test(n) },
  ai: { label:'🤖 AI & Utilities', emoji:'🤖', test:n=>/ai|health|jwt|monitor/i.test(n) }
};

function stamp(){return '⌬ ARGUS • v'+pkg.version+' • Owner: Lmao_2.0';}
function groups(client){
  const all=[...client.commands.values()].filter(c=>c?.data?.name && !['commands','owner'].includes(c.data.name));
  const out={}; Object.keys(GROUPS).forEach(k=>out[k]=[]);
  for(const c of all){ const n=c.data.name; const key=Object.keys(GROUPS).find(k=>GROUPS[k].test(n))||'ai'; if(out[key].length<25) out[key].push(c); }
  return out;
}
function home(client){
  const count=[...client.commands.values()].length;
  return new EmbedBuilder().setColor(0x5865f2).setTitle('╭━━━〔 ⌬ ARGUS • COMMANDS 〕━━━╮').setDescription('╰─ **Interactive intelligence console**\n\n╭─〔 🛰️ Navigation 〕\n┃ ⟡ Choose a category\n┃ ⟡ Select an operation\n┃ ⟡ Enter a target in a modal\n╰────────────────────────╯').addFields({name:'◈ Commands',value:'`'+count+'` registered',inline:true},{name:'◈ Interface',value:'`Dropdowns` • `Modals` • `Buttons`',inline:true},{name:'◈ Build',value:'`v'+pkg.version+'`',inline:true}).setFooter({text:stamp()}).setTimestamp();
}
function categoryRow(client,uid){
 const gs=groups(client);
 const m=new StringSelectMenuBuilder().setCustomId('argus:category:'+uid).setPlaceholder('⌄ Select an intelligence category').addOptions(Object.entries(GROUPS).map(([k,g])=>new StringSelectMenuOptionBuilder().setLabel(g.label).setDescription((gs[k].length+' registered operation(s)').slice(0,100)).setValue(k).setEmoji(g.emoji)));
 return new ActionRowBuilder().addComponents(m);
}
function toolRows(client,key,uid){
 const list=groups(client)[key]||[];
 const m=new StringSelectMenuBuilder().setCustomId('argus:tool:'+uid+':'+key).setPlaceholder('⌄ Select an operation').addOptions(list.map(c=>new StringSelectMenuOptionBuilder().setLabel('/'+c.data.name).setDescription(String(c.data.description||'Argus operation').slice(0,100)).setValue(c.data.name)));
 const b=new ButtonBuilder().setCustomId('argus:back:'+uid).setLabel('Back').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
 return [new ActionRowBuilder().addComponents(m),new ActionRowBuilder().addComponents(b)];
}
function modal(tool,uid){
 const m=new ModalBuilder().setCustomId('argus:modal:'+uid+':'+tool).setTitle(('⌬ ARGUS • /'+tool).slice(0,45));
 const input=new TextInputBuilder().setCustomId('target').setLabel('Target / input').setPlaceholder('Enter the value for this operation').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4000);
 m.addComponents(new ActionRowBuilder().addComponents(input)); return m;
}
async function execute(interaction){await interaction.reply({embeds:[home(interaction.client)],components:[categoryRow(interaction.client,interaction.user.id)]});}
async function handleInteraction(interaction){
 const id=interaction.customId||''; if(!id.startsWith('argus:')) return false; const p=id.split(':'); const uid=p[2];
 if(uid!==interaction.user.id){await interaction.reply({content:'❌ This control panel belongs to another user.',ephemeral:true});return true;}
 if(interaction.isStringSelectMenu()&&p[1]==='category'){const key=interaction.values[0];const g=GROUPS[key];await interaction.update({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('╭━━〔 '+g.label+' 〕━━╮').setDescription('╰─ Select an operation below.').setFooter({text:stamp()}).setTimestamp()],components:toolRows(interaction.client,key,uid)});return true;}
 if(interaction.isStringSelectMenu()&&p[1]==='tool'){await interaction.showModal(modal(interaction.values[0],uid));return true;}
 if(interaction.isButton()&&p[1]==='back'){await interaction.update({embeds:[home(interaction.client)],components:[categoryRow(interaction.client,uid)]});return true;}
 if(interaction.isModalSubmit()&&p[1]==='modal'){const tool=p[3];const value=interaction.fields.getTextInputValue('target');await interaction.reply({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle('╭━━〔 ⌬ ARGUS • INPUT RECEIVED 〕━━╮').setDescription('╰─ **/'+tool+'**\n\n**Target / input:** `'+value.slice(0,1000)+'`\n\n⟡ Your input has been captured by the interactive console.').setFooter({text:stamp()}).setTimestamp()]});return true;}
 return true;
}
module.exports={data:new SlashCommandBuilder().setName('commands').setDescription('Open the interactive Argus command dashboard'),execute,handleInteraction};