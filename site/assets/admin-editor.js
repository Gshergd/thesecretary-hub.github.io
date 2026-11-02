import { formatStatusText } from './status-text.js?v=1';
export function enhanceEditors(root){
 if(!['incidents','maintenance'].includes(document.body.dataset.admin))return;
 root.querySelectorAll('textarea').forEach((area,index)=>{
  const label=area.closest('label');const title=label.firstChild.textContent.trim();
  area.id=`writer-${index}`;area.setAttribute('aria-label',title);
  const shell=document.createElement('div');shell.className='admin-writer';
  const toolbar=document.createElement('div');toolbar.className='writer-toolbar';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label',`${title} formatting`);
  const preview=document.createElement('div');preview.className='writer-preview';preview.hidden=true;
  const footer=document.createElement('div');footer.className='writer-footer';
  const count=()=>footer.textContent=`${area.value.trim()?area.value.trim().split(/\s+/).length:0} words · ${area.value.length}${area.maxLength>0?' / '+area.maxLength:''} characters`;
  const tools=[['Bold','**','**'],['Italic','_','_'],['Heading','## ',''],['List','- ',''],['Quote','> ',''],['Code','`','`']];
  tools.forEach(([name,before,after])=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.title=name;b.setAttribute('aria-controls',area.id);b.onclick=()=>{
   const start=area.selectionStart,end=area.selectionEnd,line=['Heading','List','Quote'].includes(name);const a=line?area.value.lastIndexOf('\n',start-1)+1:start;
   const selected=area.value.slice(a,end);const replacement=line?selected.split('\n').map(v=>before+v).join('\n'):before+selected+after;
   if(area.maxLength>0&&area.value.length-(end-a)+replacement.length>area.maxLength)return;
   area.setRangeText(replacement,a,end,'select');area.focus();area.dispatchEvent(new Event('input',{bubbles:true}));
  };toolbar.append(b);});
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Preview';toggle.setAttribute('aria-pressed','false');toggle.onclick=()=>{preview.hidden=!preview.hidden;area.hidden=!preview.hidden;preview.innerHTML=formatStatusText(area.value);toggle.textContent=preview.hidden?'Preview':'Edit';toggle.setAttribute('aria-pressed',String(!preview.hidden));};toolbar.append(toggle);
  area.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['b','i'].includes(event.key.toLowerCase())){event.preventDefault();toolbar.children[event.key.toLowerCase()==='b'?0:1].click();}});
  area.addEventListener('invalid',()=>{preview.hidden=true;area.hidden=false;toggle.textContent='Preview';toggle.setAttribute('aria-pressed','false');});
  area.addEventListener('input',count);area.before(shell);shell.append(toolbar,area,preview,footer);count();
  // Toolbar buttons live outside the form label to avoid label activation moving focus.
  label.after(shell);label.htmlFor=area.id;
 });
}
