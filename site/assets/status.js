import { statusApi } from './api.js?v=6.5.0';
import { esc, formatDate, mountLayout } from './layout.js?v=4.5.0';
import { currentAccount } from './supabase-client.js';

const mobileHistory = matchMedia('(max-width: 700px)');
const historyDays = () => mobileHistory.matches ? 30 : 90;
let refreshHistory = () => {};
mobileHistory.addEventListener('change', () => refreshHistory());

const root = document.querySelector('[data-status-root]');
document.body.classList.add('status-public-mode');

const stateClass = (state) => state === 'operational' ? 'operational' : state === 'maintenance' ? 'maintenance' : state === 'incident-short' ? 'incident-short' : state === 'major-short' ? 'major-short' : state === 'degraded' ? 'degraded' : state === 'unknown' ? 'unknown' : 'outage';
const stateLabel = (state) => state === 'operational' ? 'Operational' : state === 'maintenance' ? 'Maintenance' : state === 'degraded' ? 'Degraded' : state === 'unknown' ? 'Awaiting data' : 'Disruption';
const STATUS_TIME_ZONE = 'Asia/Kolkata';
const MAJOR_OUTAGE_RED_AFTER_MS = 4 * 60 * 60 * 1000;
const dayKey = (value) => {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:STATUS_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const statusDateAtOffset = (offset = 0) => {
  const [year, month, day] = dayKey(new Date()).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
};
const defaultServers = [
  ['virginia','The-Secretary Virginia US','Virginia US'],
  ['singapore_n1','The-Secretary Singapore N-1','Singapore N-1'],
  ['singapore_n2','The-Secretary Singapore N-2','Singapore N-2'],
  ['frankfurt','The-Secretary Frankfurt EU','Frankfurt EU'],
  ['ohio','The-Secretary Ohio US','Ohio US'],
].map(([key,name,region]) => ({key,name,region,status:'operational',label:'Operational'}));

function eventsForServiceDay(kind, date, events = [], serverKey) {
  const start = new Date(`${dayKey(date)}T00:00:00+05:30`).getTime();
  const end = Math.min(start + 86400000, Date.now());
  return events.filter(event => {
    if (eventStartTime(event) >= end || eventEndTime(event) <= start) return false;
    if (kind === 'server') return event.recordType === 'exclusion' && event.serverKey === serverKey;
    if (event.recordType === 'exclusion') return false;
    if (event.recordType === 'maintenance' || kind === 'all') return true;
    return kind === 'discord' ? event.source === 'discord' : event.source !== 'discord';
  }).map(event => ({...event, dayDurationMs:Math.max(0, Math.min(eventEndTime(event), end) - Math.max(eventStartTime(event), start))}));
}

const eventStartTime = (event) => new Date(event.startedAt || event.startAt || event.updatedAt).getTime();
const eventEndTime = (event) => {
  const explicitEnd = event.recordType === 'maintenance' ? event.endAt : event.resolvedAt;
  const value = explicitEnd ? new Date(explicitEnd).getTime() : Date.now();
  return Number.isFinite(value) ? value : eventStartTime(event);
};
const eventDurationMs = (event) => Math.max(0, eventEndTime(event) - eventStartTime(event));
const isMajorIncident = (event) => event.recordType === 'incident' && (event.impact === 'critical' || event.impact === 'major');
const historyStateForEvents = (events) => {
  if (events.some(event => event.recordType === 'exclusion')) return 'major-short';
  const incidents = events.filter(event => event.recordType === 'incident');
  if (incidents.length) {
    const total = incidents.reduce((sum, event) => sum + (event.dayDurationMs ?? eventDurationMs(event)), 0);
    return total < 40 * 60000 ? 'incident-short' : total > MAJOR_OUTAGE_RED_AFTER_MS ? 'outage' : 'major-short';
  }
  return events.some(event => event.recordType === 'maintenance') ? 'maintenance' : 'operational';
};

function serviceHistory(service, monitor, events = []) {
  return Array.from({length: historyDays()}, (_, index) => {
    const date = statusDateAtOffset(historyDays() - 1 - index);
    let state = 'operational';
    let uptimeValue = 100;
    const dailyEvents = eventsForServiceDay(service.kind, date, events, service.key);
    if (dailyEvents.length) { state = historyStateForEvents(service.kind === 'server' ? dailyEvents : eventsForServiceDay('all', date, events)); uptimeValue = null; }
    if (index === historyDays() - 1 && service.state !== 'operational' && !dailyEvents.length) state = service.state;
    const value = uptimeValue === null || uptimeValue === undefined ? stateLabel(state) : `${Number(uptimeValue).toFixed(3)}%`;
    return `<i class="${stateClass(state)}" data-history-server="${esc(service.key || '')}" data-history-kind="${service.kind}" data-history-day="${dayKey(date)}" data-history-date="${esc(formatDate(date, {dateStyle:'long'}))}" data-history-value="${esc(value)}"></i>`;
  }).join('');
}

function serviceRow(service, monitor, events) {
  const uptime = service.kind === 'website' ? monitor.uptime?.[String(historyDays())] : service.uptime;
  const detail = service.offlineUntil ? ` until ${formatDate(service.offlineUntil, {dateStyle:'medium',timeStyle:'short'})}` : '';
  return `<article class="status-service"><div class="status-service-head"><h2>${esc(service.name)}</h2><span class="${stateClass(service.state)}">${esc(service.label || stateLabel(service.state))}${esc(detail)}</span></div><div class="status-history" aria-label="${historyDays()}-day status history">${serviceHistory(service, monitor, events)}</div><div class="status-history-foot"><span>${mobileHistory.matches ? "30 days" : "90 days ago"}</span><b></b><span>${service.kind === 'server' ? 'Exclusion history' : uptime === null || uptime === undefined ? (mobileHistory.matches ? 'Uptime unavailable' : 'No outages recorded') : `${Number(uptime).toFixed(2)}% uptime`}</span><b></b><span>Today</span></div></article>`;
}

function incidentDays(incidents = [], maintenance = []) {
  const records = [...incidents.map((item) => ({...item, recordType:'incident', recordAt:item.startedAt || item.updatedAt})), ...maintenance.map((item) => ({...item, recordType:'maintenance', recordAt:item.startAt || item.updatedAt}))];
  return Array.from({length:15}, (_, index) => {
    const date = statusDateAtOffset(index);
    const daily = records.filter((item) => dayKey(new Date(item.recordAt)) === dayKey(date));
    const body = daily.length ? daily.map((item) => {
      if (item.recordType === 'maintenance') return `<a class="status-record maintenance" href="/maintenance/${encodeURIComponent(item.slug)}"><h4>${esc(item.title)}</h4><p><strong>${esc(item.status || 'Scheduled')}</strong> - ${esc(item.note || item.description || item.excerpt || '')}</p><time>${formatDate(item.startAt, {dateStyle:'medium',timeStyle:'short'})}</time></a>`;
      const updates = [...(item.updates || [])].reverse();
      return `<a class="status-record incident ${historyStateForEvents(eventsForServiceDay('all', date, records.filter(record=>record.recordType==='incident').map(record=>({...record,source:'http'}))))}" href="/incidents/${encodeURIComponent(item.slug)}"><h4>${esc(item.title)}</h4>${updates.map((update) => `<p><strong>${esc(update.status)}</strong> - ${esc(update.message)}</p><time>${formatDate(update.createdAt, {dateStyle:'medium',timeStyle:'short'})}</time>`).join('')}</a>`;
    }).join('') : `<p class="no-incidents">${index === 0 ? 'No incidents reported today.' : 'No incidents reported.'}</p>`;
    return `<section class="incident-day"><h3>${formatDate(date, {dateStyle:'medium',timeZone:STATUS_TIME_ZONE})}</h3>${body}</section>`;
  }).join('');
}

function chartMarkup() {
  return `<section class="metrics-section"><header><span>System metrics</span><nav aria-label="Response period"><button class="active" data-chart-range="day">Day</button><button data-chart-range="week">Week</button><button data-chart-range="month">Month</button></nav></header><div class="response-chart"><div class="response-chart-title"><h2>Response Time</h2><strong data-chart-latest>—</strong></div><div class="response-chart-hover" data-chart-tooltip hidden></div><svg data-response-chart viewBox="0 0 820 190" role="img" aria-label="Response time graph"></svg></div></section>`;
}

function durationText(startValue, endValue) {
  const start = new Date(startValue).getTime();
  const end = endValue ? new Date(endValue).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Duration unavailable';
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  const hours = Math.floor(minutes / 60);
  return `${hours} hrs ${minutes % 60} mins`;
}

function historyTooltip(bar, data) {
  const source = data.historyEvents || [...(data.incidents || []).map(item=>({...item,recordType:'incident'})),...(data.maintenance || []).map(item=>({...item,recordType:'maintenance'}))];
  const relevant=eventsForServiceDay(bar.dataset.historyKind,new Date(`${bar.dataset.historyDay}T12:00:00+05:30`),source,bar.dataset.historyServer).sort((a,b)=>eventStartTime(a)-eventStartTime(b));
  const events = relevant.map((item) => {
    if (item.recordType === 'maintenance') return {label:'Maintenance', duration:durationText(item.startAt, item.status === 'completed' ? item.endAt : null), tone:'maintenance'};
    const tone = historyStateForEvents(bar.dataset.historyKind === 'server' ? relevant : eventsForServiceDay('all', new Date(`${bar.dataset.historyDay}T12:00:00+05:30`), source));
    const minutes = Math.round(item.dayDurationMs / 60000);
    return {label:item.recordType === 'exclusion' ? 'Server excluded' : tone === 'incident-short' ? 'Brief outage' : 'Major outage', duration:`${Math.floor(minutes / 60)} hrs ${minutes % 60} mins`, tone:tone === 'outage' ? 'major-long' : tone};
  });
  if (!events.length) {
    const cleanDay = /^100(?:\.0+)?%$/.test(bar.dataset.historyValue);
    return `<span>${esc(bar.dataset.historyDate)}</span><strong>${cleanDay ? 'No downtime recorded on this day.' : esc(bar.dataset.historyValue)}</strong>`;
  }
  if (bar.dataset.historyKind === 'server') return `<span>${esc(bar.dataset.historyDate)}</span><div class="history-tooltip-events">${events.map(event=>`<p class="major-short"><b>●</b><strong>Server excluded</strong><em>${esc(event.duration)}</em></p>`).join('')}</div>`;
  const relatedTitle = relevant[0]?.title || (relevant[0]?.recordType === 'maintenance' ? 'Scheduled maintenance' : 'Service incident');
  return `<span>${esc(bar.dataset.historyDate)}</span><div class="history-tooltip-events">${events.map(event => `<p class="${event.tone}"><b>${event.label === 'Major outage' ? '×' : event.label === 'Maintenance' ? '●' : '▲'}</b><strong>${esc(event.label)}</strong><em>${esc(event.duration)}</em></p>`).join('')}</div><small>Related</small><div class="history-tooltip-related">${esc(relatedTitle)}</div>`;
}

function smoothChartPath(series,x,y) {
  const points=series.map((item,index)=>({x:x(index),y:y(Number(item.responseMs))}));
  if(points.length===1)return `M${points[0].x},${points[0].y}`;
  return points.slice(1).reduce((path,point,index)=>{const previous=points[index];const middle=(previous.x+point.x)/2;return `${path} C${middle.toFixed(1)},${previous.y.toFixed(1)} ${middle.toFixed(1)},${point.y.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`;},`M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`);
}

function drawChart(data, range = 'day') {
  const svg = root.querySelector('[data-response-chart]');
  const tooltip = root.querySelector('[data-chart-tooltip]');
  tooltip.hidden = true;
  const chartWidth = mobileHistory.matches ? 360 : 820;
  const chartRight = chartWidth - 70;
  const plotWidth = chartRight - 20;
  svg.setAttribute('viewBox', `0 0 ${chartWidth} 190`);
  const storedSeries = data.monitor?.response?.series;
  const source = (Array.isArray(storedSeries) ? storedSeries : storedSeries?.[range] || storedSeries?.month || storedSeries?.week || storedSeries?.day) || [];
  const hours = {day:24,week:24*7,month:24*30}[range] || 24;
  const newestAt = source.length ? new Date(source[source.length-1].checkedAt).getTime() : Date.now();
  const cutoff = newestAt - hours * 3600000;
  const series = source.filter(item => new Date(item.checkedAt).getTime() >= cutoff && Number.isFinite(Number(item.responseMs)) && Number(item.responseMs) <= 1200);
  const latest = series[series.length - 1];
  root.querySelector('[data-chart-latest]').textContent = latest ? `${Math.round(latest.responseMs)} ms` : 'No data';
  if (!series.length) { svg.innerHTML = mobileHistory.matches ? '<text x="180" y="90" text-anchor="middle"><tspan x="180">Response samples will appear</tspan><tspan x="180" dy="18">after scheduled checks run.</tspan></text>' : '<text x="410" y="100" text-anchor="middle">Response samples will appear after scheduled checks run.</text>'; return; }
  const values = series.map((item) => Number(item.responseMs));
  const low = Math.max(0, Math.floor(Math.min(...values) / 50) * 50 - 50);
  const high = Math.max(low + 100, Math.ceil(Math.max(...values) / 50) * 50 + 50);
  const x = (index) => 20 + index / Math.max(1, series.length - 1) * plotWidth;
  const y = (value) => 155 - (value - low) / (high - low) * 120;
  const path = smoothChartPath(series,x,y);
  const lines = [0,.33,.66,1].map((part) => { const py=35+part*120; const label=Math.round(high-part*(high-low)); return `<line x1="20" y1="${py}" x2="${chartRight}" y2="${py}"/><text x="${chartRight + 15}" y="${py+4}">${label}</text>`; }).join('');
  const label = (item) => new Intl.DateTimeFormat(undefined, range === 'day' ? {hour:'2-digit',minute:'2-digit'} : {month:'short',day:'numeric'}).format(new Date(item.checkedAt));
  svg.innerHTML = `<g class="chart-grid">${lines}</g><path class="chart-line" pathLength="1" d="${path}"/><line class="chart-hover-guide" y1="35" y2="155" hidden/><circle class="chart-hover-halo" r="11" hidden/><circle class="chart-hover-dot" r="5" hidden/><g class="chart-labels"><text x="20" y="180">${esc(label(series[0]))}</text><text x="${20 + plotWidth / 2}" y="180" text-anchor="middle">${esc(label(series[Math.floor(series.length/2)]))}</text><text x="${chartRight}" y="180" text-anchor="end">${esc(label(latest))}</text></g>`;
  const dot = svg.querySelector('.chart-hover-dot');
  const halo = svg.querySelector('.chart-hover-halo');
  const guide = svg.querySelector('.chart-hover-guide');
  svg.onpointermove = (event) => {
    const rect = svg.getBoundingClientRect();
    const svgX = (event.clientX - rect.left) / rect.width * chartWidth;
    const index = Math.max(0, Math.min(series.length - 1, Math.round((svgX - 20) / plotWidth * (series.length - 1))));
    const point = series[index];
    dot.hidden = false;
    halo.hidden = false;
    guide.hidden = false;
    dot.setAttribute('cx', x(index));
    dot.setAttribute('cy', y(Number(point.responseMs)));
    halo.setAttribute('cx', x(index));
    halo.setAttribute('cy', y(Number(point.responseMs)));
    guide.setAttribute('x1', x(index));
    guide.setAttribute('x2', x(index));
    tooltip.innerHTML = `<span>${esc(formatDate(point.checkedAt, {dateStyle:'medium',timeStyle:'short'}))}</span><i></i><strong>${Math.round(point.responseMs)} ms</strong>`;
    tooltip.hidden = false;
  };
  svg.onpointerleave = () => { dot.hidden = true; halo.hidden = true; guide.hidden = true; tooltip.hidden = true; };
}

function render(data, accountUser) {
  [data.incidents, data.historyEvents].forEach(items => (items || []).forEach(item => {
    if (item.source === 'http' && /^The Secretary (is|was) (unavailable|unreachable)$/.test(item.title || '')) item.title = item.resolvedAt ? 'The Secretary was unreachable' : 'The Secretary is unreachable';
    if (item.source === 'discord' && /^Discord API (was )?rate limited$/.test(item.title || '') && item.resolvedAt) item.title = 'Discord API was rate limited';
  }));
  const monitor = data.monitor || {};
  const discordState = data.discordApi?.rateLimited ? 'outage' : ['operational','normal','ok','none'].includes(data.discordApi?.state) ? 'operational' : data.discordApi?.state === 'degraded' || data.discordApi?.state === 'minor' ? 'degraded' : !data.discordApi?.state || data.discordApi.state === 'unknown' ? 'unknown' : 'outage';
  const services = [{name:'TheSecretary.xyz Website',kind:'website',state:monitor.status || 'unknown',uptime:monitor.uptime?.['90']},{name:'The Secretary™ Discord',kind:'discord',state:discordState,uptime:null},...((data.servers?.length ? data.servers : defaultServers).map((server) => ({...server,kind:'server',state:server.status || 'operational'})))];
  const availabilityServices = services.filter((item) => item.kind === 'website' || item.kind === 'discord');
  const overall = availabilityServices.some((item) => stateClass(item.state) === 'outage') ? 'outage' : availabilityServices.some((item) => stateClass(item.state) === 'degraded') ? 'degraded' : 'operational';
  (data.incidents||[]).forEach(item=>sessionStorage.setItem(`status-record:incident:${item.slug}`,JSON.stringify(item)));
  (data.maintenance||[]).forEach(item=>sessionStorage.setItem(`status-record:maintenance:${item.slug}`,JSON.stringify(item)));
  root.innerHTML = `<main class="status-public-page"><div class="status-wrap"><div class="status-top"><button type="button" data-subscribe-open>Subscribe to updates</button></div><div class="overall-status ${overall}">${overall === 'operational' ? 'All Systems Operational' : overall === 'degraded' ? 'Some Systems Degraded' : 'Service Disruption'}</div><p class="uptime-caption">Uptime over the past ${historyDays()} days.</p><section class="service-list">${services.map((service) => serviceRow(service, monitor, data.historyEvents||[])).join('')}</section>${chartMarkup()}<section class="past-incidents"><h2>Past incidents &amp; maintenance</h2>${incidentDays(data.incidents, data.maintenance)}</section></div></main><div class="status-tooltip" data-status-tooltip></div>`;
  root.querySelectorAll('[data-chart-range]').forEach((button) => button.addEventListener('click', () => { root.querySelectorAll('[data-chart-range]').forEach((item) => item.classList.toggle('active', item === button)); drawChart(data, button.dataset.chartRange); }));
  refreshHistory = () => {
    root.querySelector('.uptime-caption').textContent = `Uptime over the past ${historyDays()} days.`;
    root.querySelector('.service-list').innerHTML = services.map(service => serviceRow(service, monitor, data.historyEvents || [])).join('');
    root.querySelector('[data-status-tooltip]').classList.remove('visible');
    drawChart(data, root.querySelector('[data-chart-range].active')?.dataset.chartRange || 'day');
  };
  const tooltip = root.querySelector('[data-status-tooltip]');
  root.querySelector('.service-list').addEventListener('pointermove', (event) => {
    const bar = event.target.closest('[data-history-date]');
    if (!bar) { tooltip.classList.remove('visible'); return; }
    tooltip.innerHTML = historyTooltip(bar, data);
    tooltip.classList.add('visible');
    const barRect = bar.getBoundingClientRect();
    const halfWidth = Math.max(145, tooltip.offsetWidth / 2);
    const barCenter = barRect.left + barRect.width / 2;
    tooltip.style.left = `${Math.max(halfWidth + 12, Math.min(innerWidth - halfWidth - 12, barCenter))}px`;
    tooltip.style.top = `${barRect.bottom + 14}px`;
  });
  root.querySelector('.service-list').addEventListener('pointerleave', () => tooltip.classList.remove('visible'));
  const subscribeButton = root.querySelector('[data-subscribe-open]');
  if(accountUser){
    let subscribed=false;
    const sync=()=>{
      subscribeButton.textContent=subscribed?'Updates enabled ✓':'Subscribe to updates';
      subscribeButton.setAttribute('aria-pressed',String(subscribed));
      subscribeButton.classList.toggle('is-subscribed',subscribed);
      subscribeButton.title=subscribed?'Click to unsubscribe from email updates.':'Subscribe your account email to updates.';
    };
    subscribeButton.disabled=true;subscribeButton.classList.add('is-working');subscribeButton.setAttribute('aria-busy','true');subscribeButton.textContent='Checking subscription…';
    statusApi('subscription_status').then(result=>{subscribed=Boolean(result.subscribed);sync();}).catch(error=>{subscribeButton.textContent=/unknown action/i.test(error.message)?'Email backend update required':'Subscription unavailable';subscribeButton.title=error.message;subscribeButton.classList.add('is-error');}).finally(()=>{subscribeButton.disabled=false;subscribeButton.classList.remove('is-working');subscribeButton.removeAttribute('aria-busy');});
    subscribeButton.onclick=async()=>{
      if(subscribeButton.disabled)return;
      const enabling=!subscribed;
      subscribeButton.disabled=true;subscribeButton.classList.remove('is-error','is-confirmed');subscribeButton.classList.add('is-working');subscribeButton.setAttribute('aria-busy','true');subscribeButton.textContent=enabling?'Enabling updates…':'Disabling updates…';
      try{
        subscribed=Boolean((await statusApi('toggle_account_subscription')).subscribed);
        subscribeButton.classList.remove('is-working');subscribeButton.classList.add('is-confirmed');subscribeButton.textContent=subscribed?'Updates enabled ✓':'Updates disabled ✓';subscribeButton.setAttribute('aria-pressed',String(subscribed));
        await new Promise(resolve=>setTimeout(resolve,900));
        subscribeButton.classList.remove('is-confirmed');sync();
      }catch(error){subscribeButton.classList.remove('is-working');subscribeButton.classList.add('is-error');subscribeButton.textContent=/unknown action/i.test(error.message)?'Email backend update required':'Could not update — try again';subscribeButton.title=error.message;}
      finally{subscribeButton.disabled=false;subscribeButton.removeAttribute('aria-busy');}
    };
  }else subscribeButton.onclick = () => { location.href=`/register/?return=${encodeURIComponent(location.pathname+location.search)}`; };
  drawChart(data);
}

async function load() {
  await mountLayout('status');
  const {user:accountUser}=await currentAccount();
  try { render(await statusApi('status'),accountUser); }
  catch (error) { root.innerHTML = `<main class="status-public-page"><div class="status-wrap"><div class="status-load-error"><h1>Status data is temporarily unavailable.</h1><p>${esc(error.message)}</p><button data-retry>Retry</button></div></div></main>`; root.querySelector('[data-retry]').onclick = load; }
}

load();
