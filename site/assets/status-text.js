// A deliberately small, escaped formatting vocabulary, shared by writer and reader.
export function formatStatusText(value=''){
 const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const inline=s=>escape(s).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/_([^_\n]+)_/g,'<em>$1</em>').replace(/`([^`\n]+)`/g,'<code>$1</code>');
 return String(value).split('\n').map(line=>line.startsWith('## ')?`<h3>${inline(line.slice(3))}</h3>`:line.startsWith('- ')?`<p class="status-bullet">• ${inline(line.slice(2))}</p>`:line.startsWith('> ')?`<blockquote>${inline(line.slice(2))}</blockquote>`:`<p>${inline(line)||'<br>'}</p>`).join('');
}
