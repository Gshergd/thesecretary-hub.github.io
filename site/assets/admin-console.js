import { statusApi } from './api.js?v=6.6.0';
import { esc, formatDate } from './layout.js?v=4.5.0';
let timer,sequence=0;
const name=value=>String(value||'unknown').replaceAll('_',' ');
export function hostConsole(host){return `<section class="host-console" aria-label="Live host operations"><header><div><span class="eyebrow">Live operations</span><h2>Host console</h2></div><span data-console-status role="status">Connecting…</span></header><div data-console-body>${consoleBody(host)}</div><footer><label><input type="checkbox" data-console-follow checked> Follow latest events</label><span>Refreshes every 8 seconds · times shown locally</span></footer></section>`;}
function consoleBody(host){
 const state=host.switchState,t=host.topology||{};
 const events=(host.recentSwitches||[]).flatMap(run=>(run.events||[{status:run.status,message:run.message,createdAt:run.updatedAt}]).map(event=>({...event,mode:run.mode,reason:run.reason,id:run.id}))).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
 return `<div class="console-topology"><span>DNS owner <strong>${esc(t.dnsKey||'Unknown')}</strong></span><span>Resumed services <strong>${esc((t.runningKeys||[]).join(', ')||t.runningKey||'Unknown')}</strong></span><span>Switch <strong>${esc(state?`${state.mode} · ${name(state.phase)}`:host.emergency?'Emergency · attention required':'Idle')}</strong></span></div>${(t.records||[]).map(record=>`<div class="console-record">${esc(record.name||record.hostname||'DNS')} → ${esc(record.target||record.content||'Unknown')}</div>`).join('')}${state?`<div class="console-current"><strong>${esc(state.sourceKey)} → ${esc(state.targetKey)}</strong> · Attempt ${Number(state.attempts)} / ${Number(state.maxAttempts)}<p>${esc(state.reason)}</p>${state.validateAfter?`<p>Validation scheduled after ${formatDate(state.validateAfter)}</p>`:''}${state.lastError?`<p class="error">${esc(state.lastError)}</p>`:''}</div>`:''}<div class="console-lines" tabindex="0" aria-label="Timestamped host switch history">${events.map(event=>`<div class="console-line ${/failed|emergency/.test(event.status)?'error':''}"><time>${esc(formatDate(event.createdAt,{dateStyle:'short',timeStyle:'medium'}))}</time><span>${esc(event.mode||'system')} / ${esc(name(event.status))}</span><p>${esc(event.message||'')}${event.attempt?` <small>[attempt ${Number(event.attempt)}]</small>`:''}</p></div>`).join('')||'<p class="console-empty">No recorded switches yet. Automatic and manual operations will appear here.</p>'}</div>`;
}
export function startHostConsole(root,initial){
 clearTimeout(timer);const token=++sequence;let busy=false;
 const poll=async()=>{
  if(token!==sequence||!root.querySelector('[data-console-body]'))return;
  if(!document.hidden&&!busy){busy=true;try{
   const data=await statusApi('admin_status');if(token!==sequence)return;
   const body=root.querySelector('[data-console-body]'),old=body.querySelector('.console-lines')?.scrollTop||0;
   body.innerHTML=consoleBody(data.hostManagement||{});const lines=body.querySelector('.console-lines');lines.scrollTop=root.querySelector('[data-console-follow]').checked?lines.scrollHeight:old;
   root.querySelector('[data-console-status]').textContent=`Updated ${new Date().toLocaleTimeString()}`;
   root.querySelectorAll('[data-admin-form="switch_server"] button').forEach(b=>b.disabled=Boolean(data.hostManagement?.switchState||data.hostManagement?.emergency||b.closest('[data-pending]')));
  }catch(error){if(token===sequence)root.querySelector('[data-console-status]').textContent=`Connection interrupted · retrying: ${error.message}`;}finally{busy=false;}}
  if(token===sequence)timer=setTimeout(poll,8000);
 };
 root.querySelector('[data-console-status]').textContent=`Snapshot ${initial.generatedAt?formatDate(initial.generatedAt):new Date().toLocaleTimeString()}`;
 const lines=root.querySelector('.console-lines');if(lines)lines.scrollTop=lines.scrollHeight;
 timer=setTimeout(poll,8000);
}
