const types = {1:'CHAT_INPUT',2:'USER',3:'MESSAGE'};
const optionTypes = {1:'SUB_COMMAND',2:'SUB_COMMAND_GROUP',3:'STRING',4:'INTEGER',5:'BOOLEAN',6:'USER',7:'CHANNEL',8:'ROLE',9:'MENTIONABLE',10:'NUMBER',11:'ATTACHMENT'};
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const typeOf = value => optionTypes[value] || String(value || 'STRING').toUpperCase();
const keyOf = context => [context?.serverId,context?.channelId,context?.conversationId,context?.navigation].join(':');
export function botCommandType(value) {
 const type = types[value] || String(value || 'CHAT_INPUT').toUpperCase();
 if (!['CHAT_INPUT','USER','MESSAGE'].includes(type)) throw Error('invalid_command_type');
 return type;
}
export function botCommandPaths(command) {
 if (botCommandType(command?.commandType ?? command?.command_type ?? command?.type) !== 'CHAT_INPUT') return [];
 const paths = [];
 const walk = (options,path=[]) => {
  const branches = (Array.isArray(options)?options:[]).filter(o=>['SUB_COMMAND','SUB_COMMAND_GROUP'].includes(typeOf(o.type)));
  if (!branches.length) {paths.push({...command,path,options:Array.isArray(options)?options:[]});return;}
  for (const branch of branches.slice(0,25)) {
   if (path.length>=2 || !/^[a-z0-9_-]{1,32}$/.test(branch.name)) throw Error('invalid_command_path');
   walk(branch.options,[...path,branch.name]);
  }
 };
 walk(command?.options); return paths;
}
export function readAdvancedCommandInput(command,raw='') {
 const name = String(command?.name || '').toLowerCase();
 const match = String(raw).match(/^\/([a-z0-9_-]{1,32})(?:\s+([\s\S]*))?$/i);
 if (!match || match[1].toLowerCase()!==name) return null;
 const args = match[2] || '';
 const paths = botCommandPaths(command);
 const selected = paths.filter(p=>!p.path.length || args===p.path.join(' ') || args.startsWith(p.path.join(' ')+' ')).sort((a,b)=>b.path.length-a.path.length)[0];
 if (!selected) return {branches:paths.filter(p=>p.path.join(' ').startsWith(args.trim())),path:[],schema:[],args:''};
 return {branches:[],path:selected.path,schema:selected.options,args:args.slice(selected.path.join(' ').length).trimStart()};
}
export function wrapBotCommandOptions(command,path,leaves) {
 let options = leaves;
 for (let i=path.length-1;i>=0;i--) options=[{name:path[i],type:i===path.length-1?'SUB_COMMAND':'SUB_COMMAND_GROUP',options}];
 return options;
}
export function advancedBotOptionMarkers(text='') {
 let quoted=false,escaped=false,masked='';
 text=String(text);
 for(let index=0;index<text.length;index++) {
  const character=text[index];
  if (quoted) {
   masked+=' '; if(escaped)escaped=false;else if(character==='\\')escaped=true;else if(character==='"')quoted=false;
  } else if(character==='"') {quoted=true;masked+=' ';} else masked+=character;
 }
 return [...masked.matchAll(/(?:^|\s)([a-z0-9_-]{1,32}):/gi)].map(match=>{
  // Whitespace masking must not consume the beginning of a quoted value.
  const colon=String(text).indexOf(':',match.index),valueStart=colon+1;
  return {name:match[1].toLowerCase(),index:match.index,valueStart};
 });
}
export function decodeAdvancedBotOptionValue(value='',partial=false) {
 const raw=String(value).trim();
 if (!raw.startsWith('"')) return raw;
 try {const parsed=JSON.parse(raw);if(typeof parsed!=='string')throw Error();return parsed;}
 catch {if(partial)return raw.slice(1);throw Error('invalid_quoted_command_option');}
}
export function buildAdvancedCommandOptions(command,raw,selections={},focused='') {
 const input = readAdvancedCommandInput(command,raw);
 if (!input || input.branches.length) throw Error('command_path_required');
 const schema = input.schema;
 const matches = advancedBotOptionMarkers(input.args);
 const values = new Map(matches.map((m,i)=>[m.name,decodeAdvancedBotOptionValue(input.args.slice(m.valueStart,matches[i+1]?.index ?? input.args.length),focused===m.name)]));
 if (!matches.length && schema.length===1 && input.args.trim()) values.set(schema[0].name,decodeAdvancedBotOptionValue(input.args,focused===schema[0].name));
 for (const name of values.keys()) if (!schema.some(o=>o.name===name)) throw Error('unknown_command_option');
 const options=[];
 for (const option of schema) {
  const type=typeOf(option.type), selection=selections[option.name];
  let value = selection && values.get(option.name)===selection.label ? selection.value : values.get(option.name);
  const isFocused=focused===option.name;
  if (isFocused) value=values.get(option.name) ?? '';
  if (value===undefined || value==='') {
   if (!focused && option.required) throw Error('required_command_option');
   if (!isFocused) continue;
  }
  if (!isFocused) {
   if (['USER','CHANNEL','ROLE','MENTIONABLE','ATTACHMENT'].includes(type) && !uuid(value)) throw Error('invalid_entity_option');
   if (type==='BOOLEAN') { if (!/^(true|false)$/i.test(String(value))) throw Error('invalid_boolean_option'); value=String(value).toLowerCase()==='true'; }
   if (['NUMBER','INTEGER'].includes(type)) { if (String(value).trim()==='') throw Error('invalid_numeric_option'); value=Number(value); if (!Number.isFinite(value) || (type==='INTEGER' && !Number.isSafeInteger(value))) throw Error('invalid_numeric_option'); }
   if (typeof value==='string' && value.length>6000) throw Error('invalid_command_option');
   if (option.min_value!==undefined && value<option.min_value || option.max_value!==undefined && value>option.max_value) throw Error('command_option_out_of_range');
   if (Array.isArray(option.choices) && option.choices.length && !option.choices.some(c=>c.value===value)) throw Error('invalid_command_choice');
  } else if (!option.autocomplete || !['STRING','INTEGER','NUMBER'].includes(type)) throw Error('invalid_autocomplete_option');
  options.push({name:option.name,type,value,...(isFocused?{focused:true}:{})});
 }
 return {options:wrapBotCommandOptions(command,input.path,options),path:input.path,schema:input.schema,args:input.args};
}
export function normalizeBotAutocompleteChoices(choices,type='STRING') {
 if (!Array.isArray(choices) || choices.length>25) throw Error('invalid_autocomplete_choices');
 return choices.map(choice=>{
  if (!choice || typeof choice.name!=='string' || !choice.name.trim() || choice.name.length>100) throw Error('invalid_autocomplete_choices');
  const value=choice.value;
  if (type==='STRING' ? typeof value!=='string' || value.length>100 : typeof value!=='number' || !Number.isFinite(value) || type==='INTEGER'&&!Number.isSafeInteger(value)) throw Error('invalid_autocomplete_choices');
  return {name:choice.name,value};
 });
}
// A response belongs to the captured account, channel, command path and query.
// Navigation or a newer keystroke cancels presentation, never retries delivery.
export function createBotAutocompleteController({rpc,invoke,getActor,getContext,delay=ms=>new Promise(r=>setTimeout(r,ms)),requestId=()=>crypto.randomUUID()}) {
 let version=0;
 return {cancel(){version++;},async query({command,context,options,optionType='STRING'}){
  const revision=++version,actor=String(getActor()||''),scope=keyOf(context);
  const current=()=>actor && revision===version && actor===String(getActor()||'') && scope===keyOf(getContext());
  await delay(180); if (!current()) return [];
  const route=await rpc('bots_get_command_delivery_route_v1',{p_server_id:context.serverId,p_channel_id:context.channelId,p_command_id:command.commandId});
  if (!current()) return [];
  const id=requestId(); if (!uuid(id)) throw Error('invalid_command_request_id');
  let result;
  if (route?.mode==='bot_token') result=await rpc('bots_create_advanced_interaction_v1',{p_server_id:context.serverId,p_channel_id:context.channelId,p_command_id:command.commandId,p_options:options,p_target_id:null,p_autocomplete:true,p_request_id:id});
  else if (route?.mode==='https') result=await invoke('altara-bot-interaction-dispatch',{action:'dispatch_autocomplete',server_id:context.serverId,channel_id:context.channelId,command_id:command.commandId,command_type:'CHAT_INPUT',options,request_id:id});
  else throw Error('invalid_command_delivery_route');
  if (!current()) return [];
  const envelope=Array.isArray(result)?result[0]:result,eventId=envelope?.event_id;
  if (!uuid(eventId)) throw Error('invalid_autocomplete_result');
  for(let attempt=0;attempt<40 && current();attempt++) {
   const answer=await rpc('bots_read_autocomplete_result_v1',{p_event_id:eventId});
   if (!current()) return [];
   const row=Array.isArray(answer)?answer[0]:answer;
   if (row?.status==='responded') return normalizeBotAutocompleteChoices(row.choices,optionType);
   if (['expired','failed'].includes(row?.status)) return [];
   await delay(100);
  }
  return [];
 }};
}
