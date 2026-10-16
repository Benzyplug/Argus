const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { createArgusEmbed } = require('./embedBuilder');
const { createSelectMenu } = require('./components');
const { safeShowModal } = require('./interactionHelper');
const { validateUrlNotInternal } = require('./ssrf');
const META = {
 'email-breach':['📧 Email Breach','Check whether an email appears in known breach intelligence.','email','email@example.com'],
 'subdomain-enum':['🌐 Subdomain Enumeration','Discover subdomains for a domain using Subfinder when available.','domain','example.com'],
 'cert-search':['🔐 Certificate Search','Search Certificate Transparency records for a domain.','domain','example.com'],
 'ip-info':['📍 IP Intelligence','Inspect geolocation, ASN and network information for an IP address.','ip','8.8.8.8'],
 'shodan-lookup':['🛰️ Shodan Lookup','Inspect Shodan host intelligence for an IP address.','ip','8.8.8.8'],
 'ip-reputation':['🛡️ IP Reputation','Check public IP reputation intelligence.','ip','8.8.8.8'],
 'wayback-history':['🕰️ Wayback History','Inspect archived URLs for a target domain.','domain','example.com'],
 'web-tech':['🧩 Web Technology','Identify technologies associated with a website.','url','https://example.com'],
 'avatar-search':['🖼️ Avatar Search','Find public avatar/profile references for a username.','username','username']
};
function esc(v=''){return String(v).replace(/[\\`*_{}\[\]()<>#+\-.!|~]/g,'\\$&').slice(0,1000);}
function inputSpec(kind){if(kind==='email')return['Email','name@example.com'];if(kind==='domain')return['Domain','example.com'];if(kind==='ip')return['IP address','8.8.8.8'];if(kind==='url')return['Website URL','https://example.com'];return['Username','username'];}
async function lookup(name,target){
 const meta=META[name], title=meta[0], desc=meta[1], kind=meta[2], clean=String(target||'').trim();
 if(name==='cert-search'){const d=clean.replace(/^https?:\/\//,'').replace(/\/.*$/,'');const r=await fetch('https://crt.sh/?q='+encodeURIComponent('%.'+d)+'&output=json',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('crt.sh returned '+r.status);const rows=await r.json();const vals=[...new Set(rows.flatMap(x=>String(x.name_value||'').split(/\r?\n/)).filter(Boolean))].slice(0,60);return{title,description:desc,fields:[{name:'🔐 Certificates',value:vals.length?vals.map(x=>'• `'+esc(x)+'`').join('\n'):'No certificate names returned.'},{name:'📊 Records',value:String(rows.length)}]};}
 if(name==='ip-info'){const r=await fetch('https://ipwho.is/'+encodeURIComponent(clean),{signal:AbortSignal.timeout(15000)});const j=await r.json();if(j.success===false)throw new Error(j.message||'IP lookup failed');const c=j.connection||{},tz=j.timezone||{},lat=j.latitude,lon=j.longitude;const fields=[{name:'📍 Location',value:esc([j.city,j.region,j.country].filter(Boolean).join(', ')||'Unknown'),inline:true},{name:'🌐 Network',value:esc([c.isp,c.org].filter(Boolean).join(' • ')||'Unknown'),inline:true},{name:'🔢 ASN',value:esc(c.asn||'Unknown'),inline:true},{name:'🕒 Timezone',value:esc(tz.id||j.timezone?.id||'Unknown'),inline:true},{name:'📮 Postal',value:esc(j.postal||'Unknown'),inline:true},{name:'🛰️ Coordinates',value:esc(lat!=null&&lon!=null?String(lat)+', '+String(lon):'Unknown'),inline:true}];if(j.hostname)fields.push({name:'🔗 Hostname',value:esc(j.hostname)});if(c.connection)fields.push({name:'📡 Connection',value:esc(String(c.connection))});return{title,description,fields};}
 if(name==='wayback-history'){const d=clean.replace(/^https?:\/\//,'').replace(/\/.*$/,'');const r=await fetch('https://web.archive.org/cdx/search/cdx?url='+encodeURIComponent(d+'/*')+'&output=json&filter=statuscode:200&filter=mimetype:text/html&collapse=urlkey&limit=50',{signal:AbortSignal.timeout(20000)});const j=await r.json();const rows=Array.isArray(j)?j.slice(1):[];const urls=rows.slice(0,20).map(x=>x[2]).filter(Boolean);return{title,description:desc,fields:[{name:'🕰️ Archived URLs',value:urls.length?urls.map(x=>'• '+esc(x)).join('\n'):'No matching captures found.'},{name:'📊 Captures',value:String(rows.length),inline:true}]};}
 if(name==='web-tech'){const u=/^https?:\/\//i.test(clean)?clean:'https://'+clean;await validateUrlNotInternal(u);const r=await fetch(u,{redirect:'follow',headers:{'User-Agent':'Argus/2.3'},signal:AbortSignal.timeout(15000)});const h=[...r.headers.entries()].filter(x=>/server|powered-by|x-generator|x-runtime/i.test(x[0])).map(x=>x[0]+': '+x[1]);return{title,description:desc,fields:[{name:'🌐 URL',value:esc(r.url)},{name:'⚙️ Signals',value:h.length?h.map(esc).join('\n'):'No identifying technology headers exposed.'},{name:'📡 Status',value:String(r.status),inline:true}]};}
 if(name==='email-breach'){const r=await fetch('https://api.xposedornot.com/v1/check-email/'+encodeURIComponent(clean),{headers:{'User-Agent':'Argus/2.3'},signal:AbortSignal.timeout(15000)});if(r.status===404)return{title,description:desc,fields:[{name:'✅ Result',value:'No breach exposure was returned for this email.'}]};if(!r.ok)throw new Error('XposedOrNot returned '+r.status);const j=await r.json();const names=j&&j.breaches||j&&j.Breaches||[];return{title,description:desc,fields:[{name:'⚠️ Breaches',value:esc(Array.isArray(names)?names.join(', '):String(names))},{name:'📊 Status',value:'Exposure found'}]};}
 if(name==='subdomain-enum'){
  const domain=clean.replace(/^https?:\/\//i,'').replace(/\/.*$/,'').toLowerCase();
  if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) throw new Error('Invalid domain');
  const r=await fetch('https://crt.sh/?q='+encodeURIComponent('%.'+domain)+'&output=json',{headers:{'User-Agent':'Argus/2.3'},signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error('Certificate Transparency service returned '+r.status);
  const j=await r.json();
  const vals=[...new Set((Array.isArray(j)?j:[]).flatMap(x=>String(x.name_value||'').split(/\r?\n/)).map(x=>x.trim().toLowerCase().replace(/^\*\./,'')).filter(x=>x===domain||x.endsWith('.'+domain)))].sort().slice(0,100);
  return{title,description:'Enumerated public subdomains from Certificate Transparency records.',fields:[
    {name:'🌐 Subdomains',value:vals.length?vals.slice(0,60).map(x=>'• `'+esc(x)+'`').join('\n'):'No public subdomains found.'},
    {name:'📊 Count',value:String(vals.length),inline:true},
    {name:'🛰️ Source',value:'Certificate Transparency (crt.sh)',inline:true}
  ]};
 }
 if(name==='shodan-lookup'){if(!process.env.SHODAN_API_KEY)return{title,description:desc,fields:[{name:'🔑 Configuration',value:'`SHODAN_API_KEY` is not configured.'}]};const r=await fetch('https://api.shodan.io/shodan/host/'+encodeURIComponent(clean)+'?key='+encodeURIComponent(process.env.SHODAN_API_KEY),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Shodan returned '+r.status);const j=await r.json();return{title,description:desc,fields:[{name:'🏢 Organization',value:esc(j.org||'Unknown'),inline:true},{name:'📍 Location',value:esc([j.city,j.country_name].filter(Boolean).join(', ')||'Unknown'),inline:true},{name:'🔌 Ports',value:esc((j.ports||[]).join(', ')||'None'),inline:true}]};}
 if(name==='ip-reputation'){if(!process.env.GREYNOISE_API_KEY)return{title,description:desc,fields:[{name:'🔑 Configuration',value:'`GREYNOISE_API_KEY` is not configured.'}]};const r=await fetch('https://api.greynoise.io/v3/community/'+encodeURIComponent(clean),{headers:{key:process.env.GREYNOISE_API_KEY,'User-Agent':'Argus/2.3'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('GreyNoise returned '+r.status);const j=await r.json();return{title,description:desc,fields:[{name:'🛡️ Classification',value:esc(j.classification||'unknown'),inline:true},{name:'🏷️ Name',value:esc(j.name||'Unknown'),inline:true},{name:'📡 RIOT',value:String(Boolean(j.riot)),inline:true}]};}
 if(name==='avatar-search'){
  const username=clean.replace(/^@/,'').trim();
  if(!/^[\\p{L}\\p{N}_.-]{1,64}$/u.test(username)) throw new Error('Invalid username');
  const found=[], seen=new Set();
  const add=(platform,profile,avatar=null,confirmed=true)=>{const k=platform+'|'+profile;if(!seen.has(k)){seen.add(k);found.push({platform,profile,avatar,confirmed});}};
  const request=async(url,opts={})=>{try{const r=await fetch(url,{headers:{'User-Agent':'Argus/2.3','Accept':'application/json,text/html;q=0.9,*/*;q=0.8',...(opts.headers||{})},redirect:'follow',signal:AbortSignal.timeout(10000)});if(!r.ok)return null;const type=r.headers.get('content-type')||'';return type.includes('json')?await r.json():await r.text();}catch{return null;}};

  // Confirmed API-backed sources.
  const gh=await request('https://api.github.com/users/'+encodeURIComponent(username),{headers:process.env.GITHUB_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_TOKEN}:{}});
  if(gh?.login&&gh?.avatar_url)add('GitHub',gh.html_url||('https://github.com/'+encodeURIComponent(gh.login)),gh.avatar_url,true);

  const gl=await request('https://gitlab.com/api/v4/users?username='+encodeURIComponent(username));
  const glu=Array.isArray(gl)?gl.find(u=>String(u.username||'').toLowerCase()===username.toLowerCase()):null;
  if(glu?.username)add('GitLab',glu.web_url||('https://gitlab.com/'+encodeURIComponent(glu.username)),glu.avatar_url||null,true);

  const reddit=await request('https://www.reddit.com/user/'+encodeURIComponent(username)+'/about.json');
  const rd=reddit?.data;
  if(rd?.name)add('Reddit','https://www.reddit.com/user/'+encodeURIComponent(rd.name),(rd.snoovatar_img||rd.icon_img||'').replace(/&amp;/g,'&')||null,true);

  // TikTok's public creator oEmbed endpoint can confirm public creator pages.
  const ttProfile='https://www.tiktok.com/@'+encodeURIComponent(username);
  const tt=await request('https://www.tiktok.com/oembed?url='+encodeURIComponent(ttProfile));
  if(tt?.author_url)add('TikTok',tt.author_url,null,true);

  // Public profile candidates. These are returned separately and never claimed as confirmed
  // because these services do not provide a reliable anonymous username lookup API.
  const candidates=[
    ['Instagram','https://www.instagram.com/'+encodeURIComponent(username)+'/'],
    ['X / Twitter','https://x.com/'+encodeURIComponent(username)],
    ['Twitch','https://www.twitch.tv/'+encodeURIComponent(username)],
    ['Pinterest','https://www.pinterest.com/'+encodeURIComponent(username)+'/'],
    ['SoundCloud','https://soundcloud.com/'+encodeURIComponent(username)],
    ['Steam','https://steamcommunity.com/id/'+encodeURIComponent(username)],
    ['Keybase','https://keybase.io/'+encodeURIComponent(username)],
    ['About.me','https://about.me/'+encodeURIComponent(username)]
  ];
  for(const [platform,profile] of candidates)add(platform,profile,null,false);

  const confirmed=found.filter(x=>x.confirmed), possible=found.filter(x=>!x.confirmed);
  const fields=[
    {name:'👤 Username',value:'`'+esc(username)+'`',inline:true},
    {name:'✅ Confirmed profiles',value:String(confirmed.length),inline:true}
  ];
  for(const item of confirmed)fields.push({name:'🖼️ '+item.platform,value:'[Open profile]('+item.profile+')'+(item.avatar?' • [Open avatar]('+item.avatar+')':'')});
  if(possible.length)fields.push({name:'🔎 Check these public profiles',value:possible.map(x=>'• ['+x.platform+']('+x.profile+')').join('\\n')});
  fields.push({name:'💬 Discord',value:'Discord does not expose a public username-to-profile/avatar lookup. Argus will not guess or fabricate a Discord account.'});
  return{title,description:confirmed.length?'Public username search completed. Confirmed matches are separated from profile candidates.':'No API-confirmed avatar was found, but Argus generated public profile candidates to check.',fields};
 }
 return{title,description:desc,fields:[{name:'🎯 Target',value:'`'+esc(clean)+'`'}]};
}
function fitFields(fields=[]){
 const out=[];
 for(const field of fields){
  const name=String(field.name||'Result').slice(0,256), value=String(field.value||'No data');
  if(value.length<=1024){out.push({...field,name,value});continue;}
  for(let i=0;i<value.length&&out.length<25;i+=1000) out.push({...field,name:(i===0?name:name+' '+(Math.floor(i/1000)+1)).slice(0,256),value:value.slice(i,i+1000)});
 }
 return out.slice(0,25);
}
function build(name){
 const meta=META[name],title=meta[0],description=meta[1],kind=meta[2],spec=inputSpec(kind);
 return {
  data:new SlashCommandBuilder().setName(name).setDescription(description),
  async execute(interaction){
   const modal=new ModalBuilder().setCustomId('argus:'+name+':modal').setTitle(title.replace(/^[^\\s]+\\s*/,'').slice(0,45));
   modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel(spec[0]).setPlaceholder(spec[1]).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(254)));
   return safeShowModal(interaction,modal);
  },
  async handleInteraction(interaction){
   if(interaction.customId!=='argus:'+name+':modal') return false;
   const target=String(interaction.fields.getTextInputValue('target')||'').trim();
   if(!target){await interaction.reply({content:'A target is required.',ephemeral:true});return true;}
   await interaction.deferReply();
   try{
    const result=await lookup(name,target);
    const embed=createArgusEmbed({title:result.title,description:result.description,color:0x5865F2,fields:fitFields(result.fields)},{commandName:name});
    await interaction.editReply({embeds:[embed]});
   }catch(error){
    // Let the global Argus error handler classify and render the real failure.
    throw error;
   }
   return true;
  }
 };
}
module.exports={build};