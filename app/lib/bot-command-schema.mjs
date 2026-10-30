// Portable registration schema shared by the backend and command UI. SDK copies
// are checked against the same fixtures so downloaded clients stay standalone.
const COMMAND_TYPES = Object.freeze({1:'CHAT_INPUT',2:'USER',3:'MESSAGE'});
const OPTION_TYPES = Object.freeze({1:'SUB_COMMAND',2:'SUB_COMMAND_GROUP',3:'STRING',4:'INTEGER',5:'BOOLEAN',6:'USER',7:'CHANNEL',8:'ROLE',9:'MENTIONABLE',10:'NUMBER',11:'ATTACHMENT'});
const CHOICE_TYPES = new Set(['STRING','INTEGER','NUMBER']);
const BRANCH_TYPES = new Set(['SUB_COMMAND','SUB_COMMAND_GROUP']);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit) => String(value ?? '').replace(/\s+/g,' ').trim().slice(0,limit);
function allowedKeys(value, keys, error) { if (Object.keys(value).some(key => !keys.includes(key))) throw Error(error); }

export function normalizeCommandType(value = 'CHAT_INPUT') {
  const type = typeof value === 'number' ? COMMAND_TYPES[value] : String(value).trim().toUpperCase();
  if (!['CHAT_INPUT','USER','MESSAGE'].includes(type)) throw Error('invalid_command_type');
  return type;
}
export function normalizeCommandName(value, type = 'CHAT_INPUT') {
  type = normalizeCommandType(type);
  const raw = String(value ?? '').trim();
  if (type !== 'CHAT_INPUT') return raw && [...raw].length <= 32 && !/[\u0000-\u001f\u007f]/u.test(raw) ? raw : '';
  const slash = raw.toLowerCase().replace(/^\//,'');
  return /^[a-z0-9_-]{1,32}$/.test(slash) ? slash : '';
}
export function commandKey(name, type = 'CHAT_INPUT') {
  type = normalizeCommandType(type);
  const normalized = normalizeCommandName(name,type);
  if (!normalized) throw Error('invalid_command_name');
  return type === 'CHAT_INPUT' ? normalized : `${type}:${normalized.toLowerCase()}`;
}
export function normalizeCommandOptionType(value = 'STRING') {
  const type = typeof value === 'number' ? OPTION_TYPES[value] : String(value).trim().toUpperCase();
  if (!Object.values(OPTION_TYPES).includes(type)) throw Error('invalid_command_option_type');
  return type;
}
export function normalizeCommandChoices(value, optionType = 'STRING') {
  const type = normalizeCommandOptionType(optionType);
  if (!CHOICE_TYPES.has(type) || !Array.isArray(value) || value.length > 25) throw Error('invalid_command_choices');
  return value.map(choice => {
    if (!record(choice)) throw Error('invalid_command_choice');
    allowedKeys(choice,['name','label','value'],'unsupported_command_choice_field');
    const name = text(choice.name ?? choice.label ?? choice.value,80);
    const selected = choice.value ?? choice.name;
    if (!name) throw Error('invalid_command_choice_name');
    if (type === 'STRING') {
      if (typeof selected !== 'string' || !selected.length || [...selected].length > 100) throw Error('invalid_command_choice_value');
    } else if (typeof selected !== 'number' || !Number.isFinite(selected) || Math.abs(selected) > Number.MAX_SAFE_INTEGER || (type === 'INTEGER' && !Number.isSafeInteger(selected))) throw Error('invalid_command_choice_value');
    return {name,value:selected};
  });
}
export function normalizeCommandOptions(value = [], parentType = '', depth = 0) {
  if (value == null) value = [];
  if (!Array.isArray(value) || value.length > 25 || depth > 2) throw Error('invalid_command_options');
  const seen = new Set(); let mode = '', optionalSeen = false;
  return value.map((item,index) => {
    if (!record(item)) throw Error(`invalid_command_option_${index+1}`);
    allowedKeys(item,['name','description','type','option_type','required','choices','options','autocomplete','min_value','max_value','min_length','max_length','channel_types'],'unsupported_command_option_field');
    const name = normalizeCommandName(item.name);
    if (!name || seen.has(name)) throw Error('invalid_or_duplicate_command_option_name');
    seen.add(name);
    if (item.type !== undefined && item.option_type !== undefined && normalizeCommandOptionType(item.type) !== normalizeCommandOptionType(item.option_type)) throw Error('conflicting_command_option_type');
    const type = normalizeCommandOptionType(item.type !== undefined ? item.type : item.option_type !== undefined ? item.option_type : 'STRING');
    const branch = BRANCH_TYPES.has(type), nextMode = branch ? 'branch' : 'leaf';
    if (mode && mode !== nextMode) throw Error('mixed_command_option_types');
    mode = nextMode;
    if ((parentType === 'SUB_COMMAND_GROUP' && type !== 'SUB_COMMAND') || (parentType === 'SUB_COMMAND' && branch) || (type === 'SUB_COMMAND_GROUP' && depth !== 0)) throw Error('invalid_subcommand_nesting');
    const option = {name,description:text(item.description || `${name} option`,120),type};
    if (branch) {
      if (Object.keys(item).some(key => !['name','description','type','option_type','options'].includes(key))) throw Error('invalid_subcommand_field');
      option.options = normalizeCommandOptions(item.options,type,depth+1);
      if (type === 'SUB_COMMAND_GROUP' && !option.options.length) throw Error('empty_subcommand_group');
      return option;
    }
    if (item.options !== undefined) throw Error('invalid_leaf_options');
    if (item.required !== undefined && typeof item.required !== 'boolean') throw Error('invalid_command_option_required');
    option.required = item.required === true;
    if (option.required && optionalSeen) throw Error('required_options_must_come_first');
    optionalSeen ||= !option.required;
    if (item.autocomplete !== undefined) {
      if (typeof item.autocomplete !== 'boolean' || !CHOICE_TYPES.has(type)) throw Error('invalid_command_autocomplete');
      option.autocomplete = item.autocomplete;
    }
    if (item.choices !== undefined) {
      const choices = normalizeCommandChoices(item.choices,type);
      if (item.autocomplete === true && choices.length) throw Error('choices_and_autocomplete_conflict');
      if (choices.length) option.choices = choices;
    }
    for (const key of ['min_value','max_value']) if (item[key] !== undefined) {
      const bound = item[key];
      if (!['INTEGER','NUMBER'].includes(type) || typeof bound !== 'number' || !Number.isFinite(bound) || Math.abs(bound) > Number.MAX_SAFE_INTEGER || (type === 'INTEGER' && !Number.isSafeInteger(bound))) throw Error('invalid_command_value_bound');
      option[key] = bound;
    }
    if (option.min_value !== undefined && option.max_value !== undefined && option.min_value > option.max_value) throw Error('invalid_command_value_bounds');
    for (const key of ['min_length','max_length']) if (item[key] !== undefined) {
      if (type !== 'STRING' || !Number.isInteger(item[key]) || item[key] < 0 || item[key] > 6000) throw Error('invalid_command_length_bound');
      option[key] = item[key];
    }
    if (option.min_length !== undefined && option.max_length !== undefined && option.min_length > option.max_length) throw Error('invalid_command_length_bounds');
    if (item.channel_types !== undefined) {
      if (type !== 'CHANNEL' || !Array.isArray(item.channel_types) || !item.channel_types.length || item.channel_types.some(kind => ![0,2].includes(kind)) || new Set(item.channel_types).size !== item.channel_types.length) throw Error('invalid_command_channel_types');
      option.channel_types = [...item.channel_types];
    }
    return option;
  });
}
export function normalizeCommandDefinition(name, metadata = {}) {
  if (!record(metadata)) throw Error('invalid_command_metadata');
  allowedKeys(metadata,['name','type','description','options'],'unsupported_command_field');
  const type = normalizeCommandType(metadata.type === undefined ? 'CHAT_INPUT' : metadata.type);
  name = normalizeCommandName(name,type);
  if (!name) throw Error('invalid_command_name');
  if (type !== 'CHAT_INPUT') {
    if ((metadata.description !== undefined && metadata.description !== '') || (metadata.options !== undefined && (!Array.isArray(metadata.options) || metadata.options.length))) throw Error('invalid_context_command_fields');
    return {type,name,description:'',options:[]};
  }
  return {type,name,description:text(metadata.description || `Runs /${name}`,120),options:normalizeCommandOptions(metadata.options)};
}
export function normalizeCommands(value) {
  if (!Array.isArray(value) || value.length > 100) throw Error('commands_array_required');
  const seen = new Set();
  return value.map(item => {
    if (!record(item)) throw Error('invalid_command');
    const command = normalizeCommandDefinition(item.name,item), key = commandKey(command.name,command.type);
    if (seen.has(key)) throw Error('duplicate_command');
    seen.add(key); return command;
  });
}
export function resolveSelectedCommandPath(value = []) {
  if (!Array.isArray(value) || value.length > 25) throw Error('invalid_command_invocation_options');
  let options = value, subcommandGroup = '', subcommand = '';
  for (let depth=0; depth<3; depth++) {
    if (!Array.isArray(options) || options.length > 25) throw Error('invalid_command_invocation_options');
    const branches = options.filter(item => record(item) && BRANCH_TYPES.has(normalizeCommandOptionType(item.type === undefined ? 'STRING' : item.type)));
    if (!branches.length) break;
    if (options.length !== 1 || !record(branches[0]) || !normalizeCommandName(branches[0].name)) throw Error('invalid_command_invocation_path');
    const branch = branches[0], type = normalizeCommandOptionType(branch.type);
    if (type === 'SUB_COMMAND_GROUP') {
      if (depth !== 0) throw Error('invalid_command_invocation_path');
      subcommandGroup = normalizeCommandName(branch.name);
    } else {
      if (subcommand || (depth && !subcommandGroup)) throw Error('invalid_command_invocation_path');
      subcommand = normalizeCommandName(branch.name);
    }
    options = branch.options ?? [];
  }
  if (subcommandGroup && !subcommand) throw Error('invalid_command_invocation_path');
  const seen = new Set(); let focused = null;
  for (const item of options) {
    if (!record(item) || !normalizeCommandName(item.name) || item.options !== undefined || BRANCH_TYPES.has(normalizeCommandOptionType(item.type === undefined ? 'STRING' : item.type)) || seen.has(normalizeCommandName(item.name))) throw Error('invalid_command_invocation_options');
    seen.add(normalizeCommandName(item.name));
    if (item.focused !== undefined && typeof item.focused !== 'boolean') throw Error('invalid_autocomplete_focus');
    if (item.focused === true) {
      if (focused) throw Error('invalid_autocomplete_focus');
      focused = {name:normalizeCommandName(item.name),type:normalizeCommandOptionType(item.type === undefined ? 'STRING' : item.type),value:item.value ?? ''};
    }
  }
  return {subcommandGroup,subcommand,options,focused};
}
