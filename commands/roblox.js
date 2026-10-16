const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { safeShowModal } = require('../utils/interactionHelper');
const { createArgusEmbed } = require('../utils/embedBuilder');
const H={'User-Agent':'Argus/2.3',Accept:'application/json'};
async function req(url,o={}){const r=await fetch(url,{...o,headers:{...H,...(o.headers||{})},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('Roblox API returned '+r.status);return r.json();}
async function opt(url,o={}){try{return await req(url,o)}catch{return null}}
const esc=s=>String(s??'').replace(/([\\`*_{}\[\]()#+\-.!|>])/g,'\\$1');
const bullets=(a,fn,n=12)=>a?.length?a.slice(0,n).map(x=>'• '+fn(x)).join('\n'):'None found';
async function resolve(q){q=String(q).trim();const body=/^\d+$/.test(q)?{userIds:[Number(q)],excludeBannedUsers:false}:{usernames:[q],excludeBannedUsers:false};return (await req(/^\d+$/.test(q)?'https://users.roblox.com/v1/users':'https://users.roblox.com/v1/usernames/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).data?.[0]}

function isDiscordId(value) {
  return /^\d{15,22}$/.test(String(value).trim());
}

async function bloxlink(path) {
  const key = process.env.BLOXLINK_API_KEY;
  const guildId = process.env.GUILD_ID;
  if (!key || !guildId) return null;

  try {
    const response = await fetch(
      'https://api.blox.link/v4/public/guilds/' + guildId + path,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(12000) }
    );
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function resolveDiscordId(interaction, input) {
  const value = String(input).trim().replace(/^<@!?/, '').replace(/>$/, '');
  if (isDiscordId(value)) return value;

  const cached = interaction.guild?.members?.cache?.find(member =>
    member.user?.username?.toLowerCase() === value.toLowerCase() ||
    member.displayName?.toLowerCase() === value.toLowerCase()
  );
  if (cached) return cached.id;

  try {
    const matches = await interaction.guild?.members?.search({ query: value, limit: 10 });
    const exact = matches?.find(member =>
      member.user?.username?.toLowerCase() === value.toLowerCase() ||
      member.displayName?.toLowerCase() === value.toLowerCase()
    );
    return exact?.id || matches?.first()?.id || null;
  } catch {
    return null;
  }
}

async function getDiscordUser(client, id) {
  try {
    const user = await client.users.fetch(id);
    return {
      id: user.id,
      username: user.username,
      globalName: user.globalName,
      avatar: user.displayAvatarURL({ size: 256, extension: 'png' })
    };
  } catch {
    return { id, username: 'Unknown', globalName: null, avatar: null };
  }
}

async function run(i,target){
 await i.deferReply();
 const input=String(target).trim();
 let sourceDiscord=null;
 let sourceDiscordId=null;

 // Discord -> Roblox through the server's Bloxlink verification mapping.
 if (isDiscordId(input) || !/^\d+$/.test(input)) {
   const discordId=await resolveDiscordId(i,input);
   if (discordId) {
     const link=await bloxlink('/discord-to-roblox/'+encodeURIComponent(discordId));
     const robloxId=link?.robloxID||link?.robloxId||link?.RobloxID;
     if (robloxId) {
       const [base,discord]=await Promise.all([
         resolve(String(robloxId)),
         getDiscordUser(i.client,discordId)
       ]);
       if (base) { sourceDiscord=discord; sourceDiscordId=discordId; target=String(robloxId); }
     }
     if (isDiscordId(input)) {
       const e=new Error('No linked Roblox account');
       e.userMessage=process.env.BLOXLINK_API_KEY
         ? 'No Roblox account is linked to that Discord account through Bloxlink.'
         : 'Discord ↔ Roblox lookup needs **BLOXLINK_API_KEY** configured in the environment.';
       throw e;
     }
   }
 }

 const base=await resolve(target);if(!base){const e=new Error('No results found');e.userMessage='No Roblox account was found for that username or user ID.';throw e}const id=base.id;
 const reverse=await bloxlink('/roblox-to-discord/'+encodeURIComponent(id));
 const reverseIds=reverse?.discordIDs||reverse?.discordIds||reverse?.DiscordIDs||[];
 const reverseUsers=[];
 for(const discordId of reverseIds.slice(0,5)) reverseUsers.push(await getDiscordUser(i.client,String(discordId)));
 const linkedDiscord=sourceDiscord||reverseUsers[0]||null;
 const [p,h,fr,fo,fg,gr,ba,we,av,th,ga,iv,co,pr]=await Promise.all([
  opt('https://users.roblox.com/v1/users/'+id),opt('https://users.roblox.com/v1/users/'+id+'/username-history?limit=100&sortOrder=Desc'),
  opt('https://friends.roblox.com/v1/users/'+id+'/friends/count'),opt('https://friends.roblox.com/v1/users/'+id+'/followers/count'),opt('https://friends.roblox.com/v1/users/'+id+'/followings/count'),
  opt('https://groups.roblox.com/v2/users/'+id+'/groups/roles'),opt('https://accountinformation.roblox.com/v1/users/'+id+'/roblox-badges'),
  opt('https://avatar.roblox.com/v1/users/'+id+'/currently-wearing'),opt('https://avatar.roblox.com/v1/users/'+id+'/avatar'),
  opt('https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds='+id+'&size=420x420&format=Png&isCircular=false'),
  opt('https://games.roblox.com/v2/users/'+id+'/games?accessFilter=Public&limit=50&sortOrder=Desc'),opt('https://inventory.roblox.com/v1/users/'+id+'/can-view-inventory'),
  opt('https://inventory.roblox.com/v1/users/'+id+'/assets/collectibles?sortOrder=Desc&limit=100'),opt('https://accountinformation.roblox.com/v1/users/'+id+'/promotion-channels')
 ]);
 const created=p?.created?new Date(p.created):null, days=created?Math.floor((Date.now()-created.getTime())/86400000):null;
 const groups=gr?.data||[], badges=Array.isArray(ba)?ba:(ba?.data||[]), games=ga?.data||[], old=h?.data||[], coll=co?.data||[];
 const social=[];if(pr)for(const [k,v] of Object.entries(pr))if(v&&typeof v==='string')social.push(k+': '+v);
 const fields=[
 {name:'🔗 Discord correlation',value:linkedUsers.length?linkedUsers.map(u=>'**@'+esc(u.username)+'** — `'+u.id+'`').join('\\n'):'No Bloxlink-linked Discord account returned.'},
 {name:'🔗 Discord correlation',value:(sourceDiscord||reverseUsers.length)?(sourceDiscord?('**@'+esc(sourceDiscord.username)+'** — `'+sourceDiscord.id+'`'):reverseUsers.map(u=>'**@'+esc(u.username)+'** — `'+u.id+'`').join('\\n')):'No Bloxlink-linked Discord account returned.'},
 {name:'👤 Identity',value:'Username: **'+esc(p?.name||base.name)+'**\nDisplay: **'+esc(p?.displayName||base.displayName||'—')+'**\nUser ID: `'+id+'`\nBanned: **'+(p?.isBanned?'Yes':'No')+'**'},
 {name:'📅 Account',value:'Created: **'+(created?created.toISOString().slice(0,10):'Unknown')+'**'+(days!==null?'\nAge: **'+days.toLocaleString()+' days**':'')+'\nhttps://www.roblox.com/users/'+id+'/profile'},
 {name:'📝 Description',value:esc((p?.description||'No public description.').slice(0,850))},
 {name:'🕰️ Previous usernames',value:bullets(old,x=>'`'+esc(x.name)+'`',20)},
 {name:'👥 Social graph',value:'Friends: **'+(fr?.count??'Unknown')+'**\nFollowers: **'+(fo?.count??'Unknown')+'**\nFollowing: **'+(fg?.count??'Unknown')+'**'},
 {name:'🏛️ Groups & roles',value:bullets(groups,x=>'**'+esc(x.group?.name||'Group')+'** — '+esc(x.role?.name||'Member')+' (rank '+(x.role?.rank??'?')+')',15)},
 {name:'🏅 Roblox badges',value:bullets(badges,x=>esc(x.name||x),12)},
 {name:'🎮 Created experiences',value:bullets(games,x=>esc(x.name||'Experience')+(x.rootPlace?.id?' — https://www.roblox.com/games/'+x.rootPlace.id:''),12)},
 {name:'👕 Avatar intelligence',value:'Wearing asset IDs: '+((we?.assetIds||[]).slice(0,25).map(x=>'`'+x+'`').join(', ')||'None returned')+'\nAvatar type: **'+esc(av?.playerAvatarType||av?.avatarType||'Unknown')+'**'},
 {name:'💎 Inventory / collectibles',value:'Inventory visible: **'+(iv?.canView===true?'Yes':iv?.canView===false?'No':'Unknown')+'**\nCollectibles returned: **'+coll.length+'**'+(coll.length?'\n'+bullets(coll,x=>esc(x.name||('Asset '+x.assetId)),8):'')},
 {name:'🔗 Promotion channels',value:social.length?esc(social.join('\n').slice(0,850)):'None exposed publicly.'}
 ];
 const pic=th?.data?.[0]?.imageUrl||linkedDiscord?.avatar;
 await i.editReply({embeds:[createArgusEmbed({title:'🎮 Roblox Intelligence',description:'Deep public Roblox intelligence for **'+esc(p?.name||base.name)+'**.',fields,thumbnail:pic,url:'https://www.roblox.com/users/'+id+'/profile'},{commandName:'roblox'})]});
}
module.exports={data:new SlashCommandBuilder().setName('roblox').setDescription('Deep public Roblox account intelligence'),async execute(i){return safeShowModal(i,new ModalBuilder().setCustomId('argus:roblox:modal').setTitle('Roblox Intelligence').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('Roblox username or user ID').setPlaceholder('Builderman or 156').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64))))},async handleInteraction(i){if(!i.isModalSubmit?.()||i.customId!=='argus:roblox:modal')return false;await run(i,i.fields.getTextInputValue('target'));return true}};
