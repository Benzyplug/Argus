const {
  EmbedBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  MessageFlags
} = require('discord.js');
const pkg = require('../package.json');

const ARGUS_BANNER_URL = 'https://raw.githubusercontent.com/Benzyplug/Argus/main/banner.png';

const COLORS = Object.freeze({
  network: 0x3498db, identity: 0x9b59b6, blockchain: 0x2ecc71, aviation: 0x00a8ff,
  security: 0xe74c3c, ai: 0x8e44ad, files: 0xf1c40f, general: 0x5865f2,
  success: 0x2ecc71, error: 0xe74c3c, warning: 0xf1c40f
});
const ERROR_COLOR = COLORS.error;
const ARGUS_FOOTER = () => '⌬ 𝐀𝐑𝐆𝐔𝐒 • 𝐯' + pkg.version + ' • 𝐁𝐘 ẞ€ÑZ¥';

function categoryFor(commandName = '') {
  const n = commandName.toLowerCase();
  if (/dns|host|link|web|redirect|favicon|extract|ip|shodan|subdomain|cert/.test(n)) return 'network';
  if (/username|maigret|sherlock|google|whois|company|email|ghunt/.test(n)) return 'identity';
  if (/blockchain|crypto|jwt/.test(n)) return 'blockchain';
  if (/nuclei|security|recon/.test(n)) return 'security';
  if (/ai|image/.test(n)) return 'ai';
  if (/exif|upload|doc|file/.test(n)) return 'files';
  return 'general';
}

function targetFromInteraction(interaction) {
  try {
    const values=[];
    const walk=list=>(list||[]).forEach(o=>{if(typeof o.value==='string')values.push(o.value);walk(o.options);});
    walk(interaction.options?.data||[]);
    return values[0]||null;
  } catch { return null; }
}

function createArgusEmbed(config = {}, context = {}) {
  const embed = new EmbedBuilder().setColor(config.color ?? COLORS[categoryFor(context.commandName)] ?? COLORS.general).setTimestamp(config.timestamp || new Date());
  if (config.title) embed.setTitle(String(config.title).slice(0,256));
  if (config.description) embed.setDescription(String(config.description).slice(0,4096));
  if (Array.isArray(config.fields)&&config.fields.length) embed.addFields(config.fields.slice(0,25));
  if (config.url) embed.setURL(config.url);
  if (config.thumbnail) embed.setThumbnail(config.thumbnail);
  if (config.author) embed.setAuthor(config.author);
  if (config.footer !== false) embed.setFooter({text:String(config.footer||ARGUS_FOOTER()).slice(0,2048)});
  return embed;
}

function styleEmbed(input, context={}) {
  const json=input instanceof EmbedBuilder?input.toJSON():{...input};
  return new EmbedBuilder(json).setColor(json.color||COLORS[categoryFor(context.commandName)]||COLORS.general);
}

function embedToMarkdown(input) {
  const e=input instanceof EmbedBuilder?input.toJSON():input||{};
  const out=[];
  if(e.author?.name) out.push('-# '+e.author.name);
  if(e.title) out.push('# '+e.title);
  if(e.description) out.push(e.description);
  for(const f of e.fields||[]) {
    out.push('', '### '+String(f.name||'Result'), String(f.value||'—'));
  }
  if(e.timestamp) {
    const ts=Math.floor(new Date(e.timestamp).getTime()/1000);
    if(Number.isFinite(ts)) out.push('', '-# 🕒 <t:'+ts+':F>');
  }
  if(e.footer?.text) out.push('', '-# '+e.footer.text);
  return out.join('\n').slice(0,3900);
}

function payloadText(payload, context={}) {
  if(typeof payload==='string') return payload.slice(0,3900);
  const parts=[];
  if(payload?.content) parts.push(String(payload.content));
  for(const e of payload?.embeds||[]) parts.push(embedToMarkdown(styleEmbed(e,context)));
  return parts.filter(Boolean).join('\n\n').slice(0,3900)||'Processing your request…';
}

function isV2(payload) {
  return Array.isArray(payload?.components) &&
    payload.components.some(c => c instanceof ContainerBuilder || c?.data?.type === 17) &&
    ((Number(payload.flags)||0) & MessageFlags.IsComponentsV2);
}

function stylePayload(payload, context={}) {
  if(payload?.__argusRaw) {
    const raw={...payload}; delete raw.__argusRaw; return raw;
  }
  if(isV2(payload)) return payload;

  const original = typeof payload==='string'?{}:{...(payload||{})};
  const text=payloadText(payload,context);
  const firstEmbed=original.embeds?.[0];
  const rows=(original.components||[]).filter(c=>c?.data?.type===1 || c?.toJSON?.().type===1);

  const container=new ContainerBuilder()
    .setAccentColor(COLORS[categoryFor(context.commandName)]||COLORS.general)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(ARGUS_BANNER_URL).setDescription('ARGUS')
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

  if(rows.length) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    for(const row of rows) container.addActionRowComponents(row);
  }

  const result={
    components:[container],
    flags:(Number(original.flags)||0)|MessageFlags.IsComponentsV2,
    allowedMentions:original.allowedMentions||{parse:[]}
  };
  if(original.files?.length) result.files=original.files;
  return result;
}

function loadingEmbed(interaction,toolName) {
  return createArgusEmbed({
    title:'⌁ Processing…',
    description:'Processing your request…',
    fields:[{name:'🛰️ Tool',value:'`'+(toolName||interaction.commandName||'Argus')+'`',inline:true}],
    footer:ARGUS_FOOTER()
  },{interaction,commandName:interaction.commandName,client:interaction.client});
}

function loadingPayload(interaction,toolName) {
  return stylePayload({embeds:[loadingEmbed(interaction,toolName)]},{
    interaction,client:interaction.client,commandName:interaction.commandName
  });
}

function getArgusBanner(){return ARGUS_BANNER_URL;}
function bannerEmbed(context={}){return new EmbedBuilder().setColor(COLORS[categoryFor(context.commandName)]||COLORS.general).setImage(ARGUS_BANNER_URL);}
function argusBannerFile(){return null;}
function faviconForTarget(){return null;}

module.exports={ARGUS_BANNER_URL,COLORS,ERROR_COLOR,ARGUS_FOOTER,categoryFor,targetFromInteraction,createArgusEmbed,styleEmbed,stylePayload,loadingEmbed,loadingPayload,faviconForTarget,getArgusBanner,bannerEmbed,argusBannerFile};
