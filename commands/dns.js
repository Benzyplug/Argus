const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const dns = require('node:dns').promises;
const { safeShowModal } = require('../utils/interactionHelper');
const { createArgusEmbed } = require('../utils/embedBuilder');
const { isValidDomain, sanitizeInput } = require('../utils/validation');

async function resolveSafe(fn){ try { return await fn(); } catch(e){ if(['ENODATA','ENOTFOUND','ENOTIMP','ESERVFAIL','EREFUSED'].includes(e?.code)) return []; throw e; } }
function list(values, map=x=>String(x)){ const a=(values||[]).map(map).filter(Boolean); return a.length?a.slice(0,30).map(x=>'• '+x).join('\n'):'None found'; }

async function run(interaction, rawDomain){
  await interaction.deferReply();
  const domain=sanitizeInput(rawDomain).replace(/^https?:\/\//i,'').split('/')[0].replace(/\.$/,'').toLowerCase();
  if(!isValidDomain(domain)){ const e=new Error('Invalid domain'); e.userMessage='Enter a valid domain such as `example.com`.'; throw e; }

  const [a,aaaa,mx,ns,txt,cname,soa]=await Promise.all([
    resolveSafe(()=>dns.resolve4(domain)), resolveSafe(()=>dns.resolve6(domain)),
    resolveSafe(()=>dns.resolveMx(domain)), resolveSafe(()=>dns.resolveNs(domain)),
    resolveSafe(()=>dns.resolveTxt(domain)), resolveSafe(()=>dns.resolveCname(domain)),
    resolveSafe(()=>dns.resolveSoa(domain))
  ]);

  const fields=[
    {name:'🌐 A (IPv4)',value:list(a,x=>'`'+x+'`')},
    {name:'🌐 AAAA (IPv6)',value:list(aaaa,x=>'`'+x+'`')},
    {name:'📨 MX',value:list(mx,x=>'`'+x.exchange+'`  priority '+x.priority)},
    {name:'🧭 Nameservers',value:list(ns,x=>'`'+x+'`')},
    {name:'📝 TXT',value:list(txt,x=>'`'+String(x.join(' ')).slice(0,700).replace(/`/g,'')+'`')},
    {name:'🔗 CNAME',value:list(cname,x=>'`'+x+'`')}
  ];
  if(soa&&soa.nsname) fields.push({name:'⚙️ SOA',value:'Primary: `'+soa.nsname+'`\nAdmin: `'+soa.hostmaster+'`\nSerial: `'+soa.serial+'`'});
  const count=[a,aaaa,mx,ns,txt,cname].reduce((n,x)=>n+(x?.length||0),0);
  if(!count&&!soa){ const e=new Error('No results found'); e.userMessage='No public DNS records were found for `'+domain+'`.'; throw e; }

  await interaction.editReply({embeds:[createArgusEmbed({
    title:'🌐 DNS Intelligence',
    description:'Public DNS records for **'+domain+'**.',
    fields
  },{commandName:'dns'})]});
}

module.exports={
 data:new SlashCommandBuilder().setName('dns').setDescription('Retrieve public DNS records for a domain'),
 async execute(interaction){
   return safeShowModal(interaction,new ModalBuilder().setCustomId('argus:dns:modal').setTitle('DNS Intelligence').addComponents(
     new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('domain').setLabel('Domain').setPlaceholder('example.com').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(253))
   ));
 },
 async handleInteraction(interaction){
   if(!interaction.isModalSubmit?.()||interaction.customId!=='argus:dns:modal') return false;
   await run(interaction,interaction.fields.getTextInputValue('domain'));
   return true;
 }
};
