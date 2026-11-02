'use strict';
const fs=require('node:fs'),path=require('node:path');
// The local tool list is the only authorization authority.
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const SCOPES=new Set(['once','session','permanent']);
// Legacy catalog mode values classify tool risk only. They are not an
// independent authorization or consent mechanism.
const PER_CALL=new Set(['kill_process','force_terminate','move_file','undo_project_edit']);
const SCOPED_CONFIRM=new Set(['start_process','start_task','interact_with_process','set_config_value']);
const bare=name=>String(name||'').split('__').pop();
const mode=name=>bare(name)==='computer_use'?'session':
 PER_CALL.has(bare(name))?'per_call':SCOPED_CONFIRM.has(bare(name))?'scoped':'persistent';
function group(name){
 const n=bare(name);
 if(n==='computer_use')return 'desktop';
 if(/usb|pnp|serial|hardware/.test(n))return 'hardware';
 if(/^git_|project_context|project_overview|project_edit/.test(n))return 'project';
 if(/^mcp_/.test(n))return 'mcp';
 if(/search/.test(n))return 'search';
 if(/task|execution_summary/.test(n))return 'tasks';
 if(/process|sessions|terminate/.test(n))return 'process';
 if(/file|directory|edit_block|result_page|result_file/.test(n))return 'files';
 if(/config|settings|feedback/.test(n))return 'settings';
 return 'other';
}
const definitions=manager=>{
 const map=new Map();
 for(const tool of [...(manager?.broker?.results?.tools?.()||[]),...(manager?.visibleTools?.()||[])])
  if(tool&&NAME.test(tool.name||'')&&!map.has(tool.name))map.set(tool.name,tool);
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
};
class RemoteToolAccess{
 constructor({home,manager,onChange=()=>{},clock=()=>Date.now()}={}){
  if(!path.isAbsolute(home||''))throw Error('REMOTE_GRANTS_INVALID_HOME');
  this.file=path.join(home,'remote-tool-grants.json');
  this.manager=manager;this.onChange=onChange;this.clock=clock;
  this.overrides=new Map();this.temporary=new Map();this.sessions=new Map();
  this.lastScope='permanent';
  // Auto-allow only supplies the default for unconfigured tools. Explicit
  // local grants/denials always take precedence. The safest default is scoped
  // to the current Cloudflare connection, rather than persisted forever.
  this.autoAllow=true;this.autoScope='session';
  this.onceActive=new Map();this.reserved=new Set();this.generation=0;
  try{
   if(fs.statSync(this.file).size>65536)throw Error('REMOTE_GRANTS_TOO_LARGE');
   const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(![1,2].includes(saved?.schema_version)||!saved.grants||
      typeof saved.grants!=='object'||Array.isArray(saved.grants))throw Error('REMOTE_GRANTS_INVALID');
   if(SCOPES.has(saved.last_scope))this.lastScope=saved.last_scope;
   if(typeof saved.auto_allow==='boolean')this.autoAllow=saved.auto_allow;
   if(['session','permanent'].includes(saved.auto_scope))this.autoScope=saved.auto_scope;
   for(const [name,allow] of Object.entries(saved.grants)){
    if(!NAME.test(name)||typeof allow!=='boolean')throw Error('REMOTE_GRANTS_INVALID');
    this.overrides.set(name,allow);
   }
  }catch(e){if(e.code!=='ENOENT')this.overrides.clear();}
 }
 setAutoAllow(input={}){
  const {enabled,scope}=input||{};
  if(typeof enabled!=='boolean'||!['session','permanent'].includes(scope))
   throw Error('REMOTE_GRANTS_INVALID_ARGUMENTS');
  if(this.autoAllow===enabled&&this.autoScope===scope)return this.list(this.manager);
  const data=JSON.stringify({schema_version:2,grants:Object.fromEntries(this.overrides),
   last_scope:this.lastScope,auto_allow:enabled,auto_scope:scope});
  if(Buffer.byteLength(data)>65536)throw Error('REMOTE_GRANTS_TOO_LARGE');
  const tmp=this.file+'.tmp';
  try{
   fs.mkdirSync(path.dirname(this.file),{recursive:true});
   fs.writeFileSync(tmp,data,{encoding:'utf8',mode:0o600});
   fs.renameSync(tmp,this.file);
  }catch(error){try{fs.unlinkSync(tmp);}catch{}throw error;}
  this.autoAllow=enabled;this.autoScope=scope;this.generation++;
  this.sessions.clear();this.onceActive.clear();this.reserved.clear();
  this.onChange();
  return this.list(this.manager);
 }
 scope(tool){
  if(this.temporary.has(tool.name))return this.temporary.get(tool.name);
  if(this.overrides.has(tool.name))return this.overrides.get(tool.name)?'permanent':'disabled';
  return this.autoAllow?this.autoScope:'disabled';
 }
 enabled(tool){return this.scope(tool)!=='disabled';}
 list(manager){
  const tools=definitions(manager).map(tool=>({name:tool.name,description:String(tool.description||'').slice(0,240),
   group:group(tool.name),read_only:tool.annotations?.readOnlyHint===true,
   default_allowed:true,allowed:this.enabled(tool),
   grant_scope:this.scope(tool),mode:mode(tool.name)}));
  return {tools,total:tools.length,remote_count:tools.filter(tool=>tool.allowed).length,
   preferred_scope:this.lastScope,auto_allow:this.autoAllow,auto_scope:this.autoScope};
 }
 // An all/group change is validated and persisted atomically, never partially applied.
 set(manager,input={}){
  const {name,names,enabled,scope='permanent'}=input||{};
  if(typeof enabled!=='boolean'||!SCOPES.has(scope))throw Error('REMOTE_GRANTS_INVALID_ARGUMENTS');
  const requested=names===undefined?[name]:names;
  if(!Array.isArray(requested)||!requested.length||requested.length>128||
     requested.some(n=>!NAME.test(n||''))||new Set(requested).size!==requested.length)
    throw Error('REMOTE_GRANTS_INVALID_ARGUMENTS');
  const known=new Set(definitions(manager).map(tool=>tool.name));
  if(requested.some(n=>!known.has(n)))throw Error('REMOTE_GRANTS_UNKNOWN_TOOL');
  const permanent=new Map(this.overrides),temporary=new Map(this.temporary);
  for(const n of requested){
   if(!enabled){permanent.set(n,false);temporary.delete(n);}
   else if(scope==='permanent'){permanent.set(n,true);temporary.delete(n);}
   else {
    // After a transient grant expires, even formerly default-safe tools stay denied.
    permanent.set(n,false);temporary.set(n,scope);
   }
  }
  const nextScope=enabled?scope:this.lastScope;
  const data=JSON.stringify({schema_version:2,grants:Object.fromEntries(permanent),
   last_scope:nextScope,auto_allow:this.autoAllow,auto_scope:this.autoScope});
  if(Buffer.byteLength(data)>65536)throw Error('REMOTE_GRANTS_TOO_LARGE');
  const tmp=this.file+'.tmp';
  try{
   fs.mkdirSync(path.dirname(this.file),{recursive:true});
   fs.writeFileSync(tmp,data,{encoding:'utf8',mode:0o600});fs.renameSync(tmp,this.file);
  }catch(e){try{fs.unlinkSync(tmp);}catch{}throw e;}
  this.overrides=permanent;this.temporary=temporary;this.lastScope=nextScope;this.generation++;
  for(const n of requested){
   this.reserved.delete(n);

  }
  if(requested.includes('computer_use')){this.sessions.clear();this.onceActive.clear();}
  this.onChange();
  return this.list(manager);
 }
 mode(name){return mode(name);}
 consume(name){
  if(this.temporary.get(name)!=='once')return;
  this.temporary.delete(name);this.reserved.delete(name);this.onceActive.delete(name);
  this.onChange();
 }
 clearSessions(){
  this.sessions.clear();this.onceActive.clear();this.reserved.clear();this.temporary.clear();

  this.generation++;this.onChange();
 }
 async before(tool,args,{expiresAt}={}){
  if(!this.enabled(tool))throw Error('REMOTE_TOOL_NOT_GRANTED');
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('REMOTE_INVALID_ARGUMENTS');
  if(Number.isFinite(expiresAt)&&this.clock()>expiresAt)throw Error('REMOTE_REQUEST_EXPIRED');
  // The local tool list is the only authorization decision. No remote call
  // may trigger an additional approval dialog.
  const grant=this.scope(tool),generation=this.generation;
  if(bare(tool.name)==='computer_use'){
   if(args.action==='list_windows')return {};
   if(args.action==='open_session'){
    if(grant==='once'&&(this.reserved.has(tool.name)||this.onceActive.has(tool.name)))
     throw Error('REMOTE_ONE_TIME_ALREADY_USED');
    if(!this.enabled(tool)||generation!==this.generation)throw Error('REMOTE_GRANT_REVOKED');
    if(Number.isFinite(expiresAt)&&this.clock()>expiresAt)throw Error('REMOTE_REQUEST_EXPIRED');
    if(grant==='once'){
     if(this.reserved.has(tool.name)||this.onceActive.has(tool.name))
      throw Error('REMOTE_ONE_TIME_ALREADY_USED');
     this.reserved.add(tool.name);
    }
    return {open:true,generation,...(grant==='once'?{onceOpen:tool.name}:{})};
   }
   const id=args.session_id;
   if(typeof id!=='string'||!this.sessions.has(id))throw Error('REMOTE_SESSION_NOT_APPROVED');
   if(this.sessions.get(id)<=this.clock()){
    this.sessions.delete(id);
    if(this.onceActive.get(tool.name)===id)this.consume(tool.name);
    throw Error('REMOTE_SESSION_EXPIRED');
   }
   return {session:id,close:args.action==='close_session',
    ...(this.onceActive.get(tool.name)===id&&args.action==='close_session'?{onceClose:tool.name}:{})};
  }
  if(grant==='once'){
   if(this.reserved.has(tool.name))throw Error('REMOTE_ONE_TIME_ALREADY_USED');
   this.reserved.add(tool.name);return {onceTool:tool.name,generation};
  }
  return {generation};
 }
 after(token,result){
  if(token?.generation!==undefined&&token.generation!==this.generation)
   throw Error('REMOTE_GRANT_REVOKED');
  if(token?.open){
   const value=result?.structuredContent||result?.result?.structuredContent||result?.result||result;
   const id=value?.session_id||value?.sessionId;
   if(typeof id!=='string'||!id)throw Error('REMOTE_SESSION_ID_MISSING');
   const raw=value?.expires_at,until=typeof raw==='number'?raw:Date.parse(raw);
   this.sessions.set(id,Math.min(Number.isFinite(until)?until:this.clock()+600000,this.clock()+600000));
   if(token.onceOpen){this.onceActive.set(token.onceOpen,id);token.onceRecorded=true;
    this.reserved.delete(token.onceOpen);}
  }
  if(token?.close)this.sessions.delete(token.session);
  if(token?.onceClose)this.consume(token.onceClose);
  return result;
 }
 finish(token){
  if(token?.generation!==this.generation)return;
  if(token?.onceTool)this.consume(token.onceTool);
  if(token?.onceOpen&&!token.onceRecorded)this.consume(token.onceOpen);
 }
}
module.exports={RemoteToolAccess,definitions,mode,group};
