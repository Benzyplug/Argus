const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { createArgusEmbed } = require('./embedBuilder');
const { createSelectMenu } = require('./components');
const { safeShowModal } = require('./interactionHelper');
const DATA={
 explain:['💡 Explain','Get a beginner-friendly explanation of an OSINT or cybersecurity concept.','Topic','e.g. DNS, ASN, OSINT'],
 workflow:['🧭 Workflow','Turn a goal into a safe, step-by-step investigation workflow.','Goal','e.g. investigate a domain'],
 quiz:['🧠 Quiz','Test your OSINT and cybersecurity knowledge.','Topic','e.g. DNS'],
 challenge:['🎯 Challenge','Generate a safe hands-on learning challenge.','Topic','e.g. web reconnaissance'],
 report:['📝 Report','Generate a structured investigation report template.','Case','e.g. suspicious domain'],
 glossary:['📚 Glossary','Define an OSINT or cybersecurity term.','Term','e.g. WHOIS'],
 'case-study':['🔬 Case Study','Explore a safe fictional investigation case study.','Topic','e.g. phishing domain'],
 'how-it-works':['⚙️ How It Works','Learn how a security technology works at a high level.','Technology','e.g. VPN'],
 'build-your-own':['🛠️ Build Your Own','Get a guided blueprint for building a security-learning project.','Project','e.g. URL scanner']
};
const CONTENT={
 explain:'Start with the plain-language definition, then identify inputs, outputs, common uses, limitations, and one safe example.',
 workflow:'1. Define the question.\n2. Identify the minimum target data.\n3. Collect public evidence.\n4. Correlate independent sources.\n5. Record timestamps and URLs.\n6. Stop when the question is answered.',
 quiz:'Answer one question at a time. Focus on concepts, evidence quality, false positives, and responsible handling of public data.',
 challenge:'Build a small lab-only exercise. Define the objective, create test data, collect evidence, document the result, and write down what could produce a false positive.',
 report:'Executive summary\nScope\nEvidence\nTimeline\nConfidence\nLimitations\nNext steps',
 glossary:'Argus explains the term in plain language, then gives a concise technical definition, related terms, and a safe example.',
 'case-study':'Fictional case: a domain resembles a known brand. Compare registration clues, DNS, certificates, hosting, archived pages, and page technology without interacting with private accounts.',
 'how-it-works':'Learn the components, data flow, trust boundaries, common failure modes, and defensive uses. Keep experiments inside systems you own or are authorized to test.',
 'build-your-own':'Define the project goal, inputs, architecture, validation rules, error handling, logging, rate limits, tests, and a small safe MVP before adding integrations.'
};
function build(name){const d=DATA[name];return{data:new SlashCommandBuilder().setName(name).setDescription(d[0]+' — '+d[1]),async execute(i){const m=new ModalBuilder().setCustomId('argus:'+name+':modal').setTitle(d[0].slice(0,45));m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('topic').setLabel(d[2]).setPlaceholder(d[3]).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)));return safeShowModal(i,m)},async handleInteraction(i){const id=i.customId||'';if(id!=='argus:'+name+':modal'&&id!=='argus:'+name+':actions')return false;if(id.endsWith(':actions')){if(i.values&&i.values[0]==='again')return this.execute(i);if(i.values&&i.values[0]==='help'){await i.reply({content:'Use /help to browse Argus.',ephemeral:true});return true}return false}const topic=i.fields.getTextInputValue('topic');await i.deferReply();const embed=createArgusEmbed({title:d[0],description:'**'+topic+'**\n\n'+CONTENT[name]+'\n\n> Educational guidance only. Use authorized systems and public/lab data.',color:0x5865F2,fields:[{name:'⌁ What next',value:'Refine the topic, compare sources, and document your reasoning.'}]},{commandName:name});const menu=createSelectMenu('argus:'+name+':actions','What next?',[{label:'Run again',value:'again',description:'Try another topic'},{label:'View Argus help',value:'help',description:'Open Argus help'}]);await i.editReply({embeds:[embed],components:[menu]});return true}}}
module.exports={build};