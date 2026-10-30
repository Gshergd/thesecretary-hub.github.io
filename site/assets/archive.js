import { statusApi } from './api.js';
import { esc, formatDate, mountLayout } from './layout.js?v=4.5.0';
import { FALLBACK_POST, getPublishedPosts, postHref } from './post-store.js';

const root = document.querySelector('[data-archive-root]');
const type = document.body.dataset.archive;
const singular = { incidents: 'incident', maintenance: 'maintenance', posts: 'post' }[type];
const titles = { incidents: 'Incident history', maintenance: 'Maintenance', posts: 'System posts' };
const STATUS_TIME_ZONE = 'Asia/Kolkata';
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const dateKey = (value) => { const parts = new Intl.DateTimeFormat('en-CA', {timeZone:STATUS_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)); const part = (name) => parts.find((item) => item.type === name)?.value; return `${part('year')}-${part('month')}-${part('day')}`; };
const recordStart = (item) => item.startedAt || item.startAt || item.updatedAt;
const recordEnd = (item) => item.recordType === 'maintenance' ? item.endAt : item.resolvedAt;
const durationMs = (item) => Math.max(0, (recordEnd(item) ? new Date(recordEnd(item)).getTime() : Date.now()) - new Date(recordStart(item)).getTime());
const dayTone = (records) => {
  const incidents=records.filter(item=>item.recordType==='incident');
  if(incidents.length){const total=incidents.reduce((sum,item)=>sum+(item.dayDurationMs??durationMs(item)),0);return total<40*60000?'incident-short':total>FOUR_HOURS?'outage':'major-short';}
  return records.some(item=>item.recordType==='maintenance')?'maintenance':'operational';
};
const monthStart = (value) => new Date(value.getFullYear(), value.getMonth(), 1);
const shiftMonth = (value, amount) => new Date(value.getFullYear(), value.getMonth() + amount, 1);
const localDateFromKey = (key) => { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day, 12); };

function calendarArchive(items) {
  const todayKey = dateKey(new Date());
  const currentMonth = monthStart(new Date());
  let rangeEnd = currentMonth;
  let selectedKey = '';
  const byDay = new Map();
  items.forEach(item=>{
    const start=new Date(recordStart(item)).getTime(), end=Math.min(recordEnd(item)?new Date(recordEnd(item)).getTime():Date.now(),Date.now());
    if(!Number.isFinite(start)||!Number.isFinite(end))return;
    for(let day=new Date(`${dateKey(start)}T00:00:00+05:30`).getTime();day<=end;day+=86400000){
      const duration=Math.max(0,Math.min(end,day+86400000)-Math.max(start,day));
      if(!duration && day!==start)continue;
      const key=dateKey(day);if(!byDay.has(key))byDay.set(key,[]);byDay.get(key).push({...item,dayDurationMs:duration});
    }
  });
  byDay.forEach((records) => records.sort((a, b) => new Date(recordStart(a)) - new Date(recordStart(b))));

  root.innerHTML = `<main class="incident-calendar-page"><header class="incident-calendar-hero"><span class="eyebrow">The Secretary systems</span><h1>Incident history</h1><p>Explore service availability, incidents, and scheduled maintenance by day.</p></header><section class="incident-calendar-shell"><div class="calendar-toolbar"><div><span>Availability archive</span><strong data-calendar-range></strong></div><nav aria-label="Change calendar period"><button type="button" data-calendar-prev aria-label="Previous three months">←</button><button type="button" data-calendar-next aria-label="Next three months">→</button></nav></div><div class="calendar-months" data-calendar-months></div><div class="calendar-day-panel" data-calendar-day-panel hidden></div></section></main>`;
  const monthsHost = root.querySelector('[data-calendar-months]');
  const rangeLabel = root.querySelector('[data-calendar-range]');
  const dayPanel = root.querySelector('[data-calendar-day-panel]');
  const nextButton = root.querySelector('[data-calendar-next]');

  const renderDay = (key) => {
    selectedKey = key;
    const records = byDay.get(key) || [];
    const date = localDateFromKey(key);
    const cards = records.map((item) => {
      const href = item.recordType === 'maintenance' ? `/maintenance/${encodeURIComponent(item.slug)}` : `/incidents/${encodeURIComponent(item.slug)}`;
      const summary = item.excerpt || item.description || item.note || item.updates?.at(-1)?.message || (item.recordType === 'maintenance' ? 'Scheduled maintenance.' : 'View the complete incident report.');
      const start = formatDate(recordStart(item), {hour:'2-digit',minute:'2-digit'});
      const end = recordEnd(item) ? formatDate(recordEnd(item), {hour:'2-digit',minute:'2-digit'}) : 'Ongoing';
      return `<a class="calendar-event ${item.recordType === 'maintenance' ? 'maintenance' : dayTone(records)}" href="${href}"><span>${item.recordType === 'maintenance' ? 'Maintenance' : item.impact === 'critical' || item.impact === 'major' ? 'Major incident' : 'Incident'}</span><h3>${esc(item.title)}</h3><p>${esc(summary)}</p><time>${esc(start)} – ${esc(end)}</time><b aria-hidden="true">↗</b></a>`;
    });
    dayPanel.hidden = false;
    dayPanel.innerHTML = `<header><span>Selected day</span><h2>${esc(formatDate(date, {dateStyle:'long'}))}</h2><p>${records.length ? `${records.length} service ${records.length === 1 ? 'event' : 'events'} recorded` : 'No downtime recorded on this day.'}</p></header>${records.length ? `<div class="calendar-event-list">${cards.slice(0,3).join('')}${cards.length > 3 ? `<details><summary>+ Show all ${cards.length} events</summary>${cards.slice(3).join('')}</details>` : ''}</div>` : '<div class="calendar-clean-day"><i></i><strong>All systems remained operational.</strong></div>'}`;
    monthsHost.querySelectorAll('[data-calendar-day]').forEach((button) => button.classList.toggle('selected', button.dataset.calendarDay === key));
    dayPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
  };

  const render = () => {
    const months = [shiftMonth(rangeEnd,-2), shiftMonth(rangeEnd,-1), rangeEnd];
    rangeLabel.textContent = `${formatDate(months[0], {month:'long',year:'numeric'})} — ${formatDate(rangeEnd, {month:'long',year:'numeric'})}`;
    nextButton.disabled = rangeEnd >= currentMonth;
    monthsHost.innerHTML = months.map((month) => {
      const year = month.getFullYear(), monthIndex = month.getMonth(), days = new Date(year,monthIndex+1,0).getDate(), leading = new Date(year,monthIndex,1).getDay();
      let elapsed = 0, downtime = 0;
      const cells = Array.from({length:leading}, () => '<span class="calendar-blank" aria-hidden="true"></span>');
      for (let day = 1; day <= days; day += 1) {
        const date = new Date(year,monthIndex,day,12), key = dateKey(date), future = key > todayKey, records = byDay.get(key) || [], tone = future ? 'future' : dayTone(records);
        if (!future) { elapsed += 1; downtime += Math.min(24 * 60 * 60 * 1000, records.filter((item) => item.recordType === 'incident').reduce((total, item) => total + durationMs(item), 0)); }
        cells.push(`<button type="button" class="calendar-day ${tone}${selectedKey === key ? ' selected' : ''}" data-calendar-day="${key}" ${future ? 'disabled' : ''} aria-label="${esc(formatDate(date, {dateStyle:'long'}))}: ${records.length ? `${records.length} service events` : 'No downtime'}"><span>${day}</span>${records.length > 1 ? `<b>${records.length}</b>` : ''}</button>`);
      }
      const availability = elapsed ? Math.max(0, 100 - downtime / (elapsed * 24 * 60 * 60 * 1000) * 100) : 100;
      return `<article class="calendar-month"><header><h2>${esc(formatDate(month, {month:'long',year:'numeric'}))}</h2><strong>${availability === 100 ? '100%' : `${availability.toFixed(2)}%`}</strong></header><div class="calendar-weekdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div><div class="calendar-grid">${cells.join('')}</div></article>`;
    }).join('');
  };

  root.querySelector('[data-calendar-prev]').addEventListener('click', () => { rangeEnd = shiftMonth(rangeEnd,-3); selectedKey=''; dayPanel.hidden=true; render(); });
  nextButton.addEventListener('click', () => { if (rangeEnd < currentMonth) { rangeEnd=shiftMonth(rangeEnd,3); if (rangeEnd > currentMonth) rangeEnd=currentMonth; selectedKey=''; dayPanel.hidden=true; render(); } });
  monthsHost.addEventListener('click', (event) => { const button=event.target.closest('[data-calendar-day]'); if (button && !button.disabled) renderDay(button.dataset.calendarDay); });
  render();
}

await mountLayout(type === 'posts' ? 'posts' : type === 'incidents' ? 'incidents' : '');
try {
  if (type === 'posts') {
    const archiveStyle=document.createElement('link'); archiveStyle.rel='stylesheet'; archiveStyle.href='/assets/post-archive.css?v=1.0.0'; document.head.append(archiveStyle);
    const loaded=await getPublishedPosts(60).catch(()=>[]), items=loaded.length?loaded:[FALLBACK_POST];
    root.innerHTML=`<main class="post-index-page"><div class="post-archive-grid">${items.map((item)=>`<a class="post-archive-card" href="${postHref(item)}"><img src="${esc(item.poster_url||FALLBACK_POST.poster_url)}" alt=""><div><p class="post-card-meta"><strong>The Secretary</strong><time>${formatDate(item.published_at,{dateStyle:'long'})}</time></p><h2>${esc(item.title)}</h2></div></a>`).join('')}</div></main>`;
  } else if (type === 'incidents') {
    const [incidentData,maintenanceData]=await Promise.all([statusApi('archive',{type:'incidents'}),statusApi('archive',{type:'maintenance'})]);
    const incidents=(incidentData.items||[]).map((item)=>({...item,recordType:'incident'})), maintenance=(maintenanceData.items||[]).map((item)=>({...item,recordType:'maintenance'}));
    incidents.forEach((item)=>sessionStorage.setItem(`status-record:incident:${item.slug}`,JSON.stringify(item))); maintenance.forEach((item)=>sessionStorage.setItem(`status-record:maintenance:${item.slug}`,JSON.stringify(item)));
    calendarArchive([...incidents,...maintenance]);
  } else {
    const data=await statusApi('archive',{type}); (data.items||[]).forEach((item)=>sessionStorage.setItem(`status-record:${singular}:${item.slug}`,JSON.stringify(item)));
    root.innerHTML=`<main class="container page archive-page ${singular}-archive"><header class="archive-hero"><span class="eyebrow">The Secretary systems</span><h1>${titles[type]}</h1><p>A permanent public record maintained by the monitoring service.</p></header><div class="archive-list">${data.items?.length?data.items.map((item)=>`<a class="archive-row ${singular}" href="/${type}/${encodeURIComponent(item.slug)}"><div><span class="status-pill ${item.status==='resolved'||item.status==='completed'?'good':'warn'}">${esc(item.status||'Published')}</span><h2>${esc(item.title)}</h2><p>${esc(item.excerpt||item.description||'')}</p></div><time>${formatDate(item.publishedAt||item.startedAt||item.startAt)}</time></a>`).join(''):'<div class="community-empty"><p>No records have been published.</p></div>'}</div></main>`;
  }
} catch (error) { root.innerHTML=`<main class="container page"><div class="flash error">${esc(error.message)}</div></main>`; }
