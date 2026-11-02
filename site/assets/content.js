import { formatStatusText } from './status-text.js?v=1';
import { statusApi } from './api.js';
import { esc, formatDate, mountLayout } from './layout.js?v=4.5.0';
import { getPostBySlug, safeRichHtml } from './post-store.js?v=post-links-1.0.0';

const root = document.querySelector('[data-content-root]');
const query = new URLSearchParams(location.search);
const postRoute = location.pathname.match(/^\/posts\/([^/]+)\/?$/);
const incidentRoute = location.pathname.match(/^\/incidents\/([^/]+)\/?$/);
const maintenanceRoute = location.pathname.match(/^\/maintenance\/([^/]+)\/?$/);
const type = postRoute ? 'post' : incidentRoute ? 'incident' : maintenanceRoute ? 'maintenance' : query.get('type');
const slug = decodeURIComponent((postRoute || incidentRoute || maintenanceRoute)?.[1] || query.get('slug') || '');
if(type === 'incident' || type === 'maintenance'){
  document.body.classList.add('status-detail-mode');
  const detailStyle = document.createElement('link');
  detailStyle.rel = 'stylesheet';
  detailStyle.href = '/assets/status-detail.css?v=1.2.0';
  document.head.append(detailStyle);
  root.innerHTML = '<main class="status-detail-loader" aria-live="polite"><span></span><p>Loading status report…</p></main>';
}
await mountLayout(type === 'post' ? 'posts' : type === 'incident' ? 'incidents' : '');
try {
  if (!['incident','maintenance','post'].includes(type) || !slug) throw new Error('This page address is incomplete.');
  let item;
  if(type === 'post') item = await getPostBySlug(slug);
  else {
    const cached=sessionStorage.getItem(`status-record:${type}:${slug}`);
    if(cached){try{item=JSON.parse(cached);}catch(error){sessionStorage.removeItem(`status-record:${type}:${slug}`);}}
    if(!item)item=(await statusApi('content', { type, slug })).item;
  }
  if (!item) throw new Error('Page not found.');
  document.title = `${item.title} I The Secretary Hub`;
  updatePageMetadata(item, type);
  if (type === 'post') {
    document.body.classList.add('post-reading-mode');
    const readerStyle = document.createElement('link');
    readerStyle.rel = 'stylesheet';
    readerStyle.href = '/assets/post-reader.css?v=post-links-1.0.0';
    document.head.append(readerStyle);
    root.innerHTML = `<main class="post-story-page"><article class="post-story"><img class="post-story-hero" src="${esc(item.full_thumb_url || '/assets/images/post-fallback-full.webp')}" alt=""><header class="post-story-header"><div class="post-story-tag">Posts <span>/</span> The Secretary</div><h1>${esc(item.title)}</h1>${item.excerpt ? `<p>${esc(item.excerpt)}</p>` : ''}<time>${formatDate(item.published_at, { dateStyle: 'long' })}</time></header><div class="post-story-body rich-content">${safeRichHtml(item.content_html || '')}</div></article></main>`;
    bindPostImageLightbox();
  } else {
    const source = type === 'incident' ? item.source === 'discord' ? 'Discord API' : item.source === 'http' ? 'TheSecretary.xyz' : 'The Secretary' : 'The Secretary';
    let rows = [];
    if (type === 'incident') {
      rows = [...(item.updates || [])].reverse().map(update => ({label:update.status, message:update.message, time:update.createdAt}));
    } else {
      rows = [
        {label:'Maintenance Conclusion',message:item.conclusionMessage || `Maintenance ${item.status === 'completed' ? 'concluded' : 'is expected to conclude'} at the scheduled end time.`,time:item.endAt},
        ...(item.status === 'active' || item.status === 'completed' ? [{label:'Maintenance Started',message:item.startedMessage || 'Scheduled maintenance is now in progress.',time:item.startAt}] : []),
        {label:'Maintenance Note',message:item.note || item.description || '',time:item.updatedAt || item.createdAt},
        {label:'Maintenance Scheduled',message:item.scheduledMessage || 'Maintenance is scheduled.',time:item.createdAt || item.startAt},
      ];
    }
    root.innerHTML = `<main class="status-detail-page ${type}-detail"><nav><a href="/status/">← Status</a></nav><article><header><h1>${esc(item.title)}</h1><p>${type === 'incident' ? 'Incident report for' : 'Maintenance report for'} ${esc(source)}</p>${type==='incident'&&item.excerpt?`<div class="status-public-summary">${formatStatusText(item.excerpt)}</div>`:''}</header><section class="status-detail-timeline">${rows.map(row => `<div class="status-detail-row"><h2>${esc(row.label)}</h2><div><div class="status-message">${formatStatusText(row.message)}</div><time>Posted ${formatDate(row.time, {dateStyle:'medium',timeStyle:'short'})}</time></div></div>`).join('')}</section></article></main>`;
  }
} catch (error) { root.innerHTML = `<main class="container page"><section class="not-found-panel"><span class="eyebrow">404</span><h1>Page unavailable</h1><p>${esc(error.message)}</p><a class="button primary" href="/">Return home</a></section></main>`; }


function updatePageMetadata(item, contentType) {
  const isPost = contentType === 'post';
  const fallback = `Read this ${contentType} update from The Secretary.`;
  const description = String(isPost ? (item.excerpt || 'Read the latest post from The Secretary Hub.') : (item.excerpt || item.note || item.description || item.message || fallback)).replace(/\s+/g, ' ').trim().slice(0, 200);
  const image = new URL(isPost ? (item.full_thumb_url || '/assets/images/post-fallback-full.webp') : '/assets/images/meta-status.png', location.origin).href;
  const named = { description, 'theme-color': '#F4FEB0', 'twitter:card': 'summary_large_image', 'twitter:title': item.title, 'twitter:description': description, 'twitter:image': image };
  Object.entries(named).forEach(([name, content]) => upsertMeta('name', name, content));
  [['og:type', isPost ? 'article' : 'website'], ['og:title', item.title], ['og:description', description], ['og:url', location.href], ['og:image', image]].forEach(([property, content]) => upsertMeta('property', property, content));
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
  canonical.href = location.href.split('?')[0];
}
function upsertMeta(attribute, key, content) {
  let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!node) { node = document.createElement('meta'); node.setAttribute(attribute, key); document.head.append(node); }
  node.content = content;
}

function bindPostImageLightbox() {
  root.querySelectorAll('.post-story img').forEach(image => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', image.alt ? `Open image: ${image.alt}` : 'Open image full screen');
    image.addEventListener('click', event => { event.preventDefault(); openPostImage(image); });
    image.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPostImage(image); }
    });
  });
}

function openPostImage(source) {
  if (document.querySelector('.post-image-lightbox')) return;
  const overlay = document.createElement('div');
  overlay.className = 'post-image-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Expanded post image');
  overlay.innerHTML = `<img src="${esc(source.currentSrc || source.src)}" alt="${esc(source.alt || '')}"><button type="button" aria-label="Close expanded image">×</button>`;
  const scrollKeys = new Set(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ']);
  const stopScroll = event => { if (event.type !== 'keydown' || scrollKeys.has(event.key)) event.preventDefault(); };
  document.addEventListener('wheel', stopScroll, {passive:false});
  document.addEventListener('touchmove', stopScroll, {passive:false});
  document.addEventListener('keydown', stopScroll);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-open'));
  const close = () => {
    if (overlay.classList.contains('is-closing')) return;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('wheel', stopScroll);
    document.removeEventListener('touchmove', stopScroll);
    document.removeEventListener('keydown', stopScroll);
    overlay.classList.add('is-closing');
    overlay.classList.remove('is-open');
    const finish = () => { overlay.remove(); source.focus({preventScroll:true}); };
    overlay.addEventListener('transitionend', finish, {once:true});
    setTimeout(() => overlay.isConnected && finish(), 360);
  };
  overlay.addEventListener('click', close);
  const onKey = event => { if (event.key === 'Escape') { document.removeEventListener('keydown', onKey); close(); } };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('button').focus({preventScroll:true});
}
