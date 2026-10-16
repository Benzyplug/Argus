const logger = require('./logger');
const { COLORS, createArgusEmbed } = require('./embedBuilder');

const ErrorTypes = Object.freeze({
  VALIDATION:'validation', PERMISSION:'permission', CONFIGURATION:'configuration',
  NETWORK:'network', DISCORD_API:'discord_api', RATE_LIMIT:'rate_limit',
  TOOL:'tool', NOT_FOUND:'not_found', UNKNOWN:'unknown'
});

const DESIGN = {
  validation:    { icon:'⚠️', title:'Invalid Input',       status:'Invalid input',    message:'Check the value you entered, then try again.' },
  permission:    { icon:'🔒', title:'Access Denied',       status:'Permission denied',message:'You do not have permission to use this operation.' },
  configuration: { icon:'🔧', title:'Service Not Configured',status:'Not configured', message:'This operation needs a service or API key that has not been configured.' },
  network:       { icon:'🌐', title:'Connection Failed',   status:'API unavailable',  message:'Argus could not reach the external service. Try again shortly.' },
  discord_api:   { icon:'⚙️', title:'Discord Error',       status:'Discord rejected request',message:'Discord could not process this response. Run the command again.' },
  rate_limit:    { icon:'⏳', title:'Rate Limited',         status:'Rate limited',      message:'Too many requests were sent. Wait a moment, then try again.' },
  tool:          { icon:'🧰', title:'Tool Unavailable',     status:'Tool unavailable', message:'The required external tool is not available on this deployment.' },
  not_found:     { icon:'🔎', title:'No Results Found',     status:'No results',       message:'No matching public information was found for that target.' },
  unknown:       { icon:'❌', title:'Operation Failed',     status:'Internal error',   message:'Argus could not complete this operation. Try again.' }
};

function categorizeError(error) {
  const message=String(error?.message||'').toLowerCase(), code=error?.code;
  if(code===429||/rate.?limit|cooldown|too many requests/.test(message)) return ErrorTypes.RATE_LIMIT;
  if([50001,50013,50007].includes(code)||/permission|missing access|access denied/.test(message)) return ErrorTypes.PERMISSION;
  if([10062,40060,50027,50035].includes(code)||error?.name==='DiscordAPIError') return ErrorTypes.DISCORD_API;
  if(/not found|no results|no matching|404/.test(message)) return ErrorTypes.NOT_FOUND;
  if(/unavailable|enoent|not installed|command not found|spawn .*enoent/.test(message)) return ErrorTypes.TOOL;
  if(error?.name==='AbortError'||/timeout|timed out|network|fetch failed|econn|enotfound|socket/.test(message)) return ErrorTypes.NETWORK;
  if(/config|api key|not configured|missing.*env|missing.*key/.test(message)) return ErrorTypes.CONFIGURATION;
  if(/invalid|required|validation|provide|must be|malformed/.test(message)) return ErrorTypes.VALIDATION;
  return ErrorTypes.UNKNOWN;
}

function userMessage(error,type) {
  if(error?.userMessage) return String(error.userMessage);
  if(error?.code===10062) return 'This interaction expired. Run the command again.';
  if([40060,50027].includes(error?.code)) return 'This action was already handled. Run the command again if needed.';
  if(error?.code===50035) return 'Discord rejected the response format. Run the command again.';
  return DESIGN[type]?.message||DESIGN.unknown.message;
}

function buildErrorEmbed(error,context={}) {
  const type=categorizeError(error), d=DESIGN[type]||DESIGN.unknown;
  const command=context.command?String(context.command).replace(/^\//,''):'Argus';
  return createArgusEmbed({
    title:d.icon+' '+d.title,
    description:userMessage(error,type),
    color:COLORS.error,
    fields:[
      {name:'Status',value:'`'+d.status+'`',inline:true},
      {name:'Operation',value:'`'+command+'`',inline:true},
      {name:'Next step',value:type===ErrorTypes.RATE_LIMIT?'Wait briefly and retry.':type===ErrorTypes.CONFIGURATION?'Configure the required service, then retry.':type===ErrorTypes.VALIDATION?'Correct the target/input and retry.':'Retry the operation. If it keeps failing, run the command again later.'}
    ]
  },{commandName:command});
}

async function handleInteractionError(interaction,error,context={}) {
  const type=categorizeError(error);
  logger.error({err:error,errorType:type,command:context.command||interaction?.commandName,customId:interaction?.customId},'Argus interaction failed');
  const payload={embeds:[buildErrorEmbed(error,{...context,command:context.command||interaction?.commandName})]};
  try {
    if(interaction?.deferred&&!interaction.replied) return await interaction.editReply(payload);
    if(interaction?.replied) return await interaction.followUp({...payload,ephemeral:true});
    return await interaction.reply({...payload,ephemeral:true});
  } catch(replyError) {
    logger.error({err:replyError},'Failed to send Argus error response');
    return null;
  }
}

module.exports={ErrorTypes,categorizeError,buildErrorEmbed,handleInteractionError};
