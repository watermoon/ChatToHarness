'use strict';
const fs=require('node:fs'),path=require('node:path');
const {isRemoteEligible}=require('./cloud-router-catalog.cjs');
const NAME=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const PER_CALL=new Set(['kill_process','force_terminate','move_file','undo_project_edit',
 'start_process','start_task','interact_with_process','set_config_value']);
const bare=name=>String(name||'').split('__').pop();
const mode=name=>bare(name)==='computer_use'?'session':PER_CALL.has(bare(name))?'per_call':'persistent';
const definitions=manager=>{
 const map=new Map();
 for(const tool of [...(manager?.broker?.results?.tools?.()||[]),...(manager?.visibleTools?.()||[])])
  if(tool&&NAME.test(tool.name||'')&&!map.has(tool.name))map.set(tool.name,tool);
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
};
class RemoteToolAccess{
 constructor({home,approve=async()=>false,onChange=()=>{},clock=()=>Date.now()}={}){
  if(!path.isAbsolute(home||''))throw Error('REMOTE_GRANTS_INVALID_HOME');
  this.file=path.join(home,'remote-tool-grants.json');this.approve=approve;this.onChange=onChange;this.clock=clock;
  this.overrides=new Map();this.sessions=new Map();this.generation=0;
  try{
   if(fs.statSync(this.file).size>65536)throw Error('REMOTE_GRANTS_TOO_LARGE');
   const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(saved?.schema_version!==1||!saved.grants||typeof saved.grants!=='object'||Array.isArray(saved.grants))throw Error('REMOTE_GRANTS_INVALID');
   for(const [name,allow] of Object.entries(saved.grants)){
    if(!NAME.test(name)||typeof allow!=='boolean')throw Error('REMOTE_GRANTS_INVALID');
    this.overrides.set(name,allow);
   }
  }catch(e){if(e.code!=='ENOENT')this.overrides.clear();}
 }
 enabled(tool){return this.overrides.has(tool.name)?this.overrides.get(tool.name):isRemoteEligible(tool);}
 list(manager){
  const tools=definitions(manager).map(tool=>({name:tool.name,description:String(tool.description||'').slice(0,240),
   read_only:tool.annotations?.readOnlyHint===true,default_allowed:isRemoteEligible(tool),
   allowed:this.enabled(tool),mode:mode(tool.name)}));
  return {tools,total:tools.length,remote_count:tools.filter(tool=>tool.allowed).length};
 }
 set(manager,{name,enabled}={}){
  if(!NAME.test(name||'')||typeof enabled!=='boolean')throw Error('REMOTE_GRANTS_INVALID_ARGUMENTS');
  const tool=definitions(manager).find(item=>item.name===name);
  if(!tool)throw Error('REMOTE_GRANTS_UNKNOWN_TOOL');
  const before=new Map(this.overrides);this.overrides.set(name,enabled);
  const data=JSON.stringify({schema_version:1,grants:Object.fromEntries(this.overrides)});
  if(Buffer.byteLength(data)>65536){this.overrides=before;throw Error('REMOTE_GRANTS_TOO_LARGE');}
  const tmp=this.file+'.tmp';
  try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(tmp,data,{encoding:'utf8',mode:0o600});fs.renameSync(tmp,this.file);}
  catch(e){this.overrides=before;try{fs.unlinkSync(tmp);}catch{}throw e;}
  if(!enabled){this.generation++;if(bare(name)==='computer_use')this.clearSessions();}
  this.onChange();return this.list(manager);
 }
 mode(name){return mode(name);}
 clearSessions(){this.sessions.clear();this.generation++;}
 async before(tool,args,{expiresAt}={}){
  if(!this.enabled(tool))throw Error('REMOTE_TOOL_NOT_GRANTED');
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('REMOTE_INVALID_ARGUMENTS');
  if(Number.isFinite(expiresAt)&&this.clock()>expiresAt)throw Error('REMOTE_REQUEST_EXPIRED');
  const kind=mode(tool.name),generation=this.generation;
  if(kind==='per_call'&&!await this.approve({kind,name:tool.name,args}))
   throw Error('REMOTE_USER_DECLINED');
  if(!this.enabled(tool)||generation!==this.generation)throw Error('REMOTE_GRANT_REVOKED');
  if(bare(tool.name)==='computer_use'){
   // Listing candidate windows is read-only; it is needed to select a target
   // before the user approves an operation session.
   if(args.action==='list_windows')return {};
   if(args.action==='open_session'){
    if(!await this.approve({kind:'session',name:tool.name,args}))throw Error('REMOTE_USER_DECLINED');
    if(!this.enabled(tool)||generation!==this.generation)throw Error('REMOTE_GRANT_REVOKED');
    if(Number.isFinite(expiresAt)&&this.clock()>expiresAt)throw Error('REMOTE_REQUEST_EXPIRED');
    return {open:true};
   }
   const id=args.session_id;
   if(typeof id!=='string'||!this.sessions.has(id))throw Error('REMOTE_SESSION_NOT_APPROVED');
   if(this.sessions.get(id)<=this.clock()){this.sessions.delete(id);throw Error('REMOTE_SESSION_EXPIRED');}
   return {session:id,close:args.action==='close_session'};
  }
  if(Number.isFinite(expiresAt)&&this.clock()>expiresAt)throw Error('REMOTE_REQUEST_EXPIRED');
  return {};
 }
 after(token,result){
  if(token?.open){
   const value=result?.structuredContent||result?.result?.structuredContent||result?.result||result;
   const id=value?.session_id||value?.sessionId;
   if(typeof id!=='string'||!id)throw Error('REMOTE_SESSION_ID_MISSING');
   const raw=value?.expires_at,until=typeof raw==='number'?raw:Date.parse(raw);
   this.sessions.set(id,Math.min(Number.isFinite(until)?until:this.clock()+600000,this.clock()+600000));
  }
  if(token?.close)this.sessions.delete(token.session);
  return result;
 }
}
module.exports={RemoteToolAccess,definitions,mode};
