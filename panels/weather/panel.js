const icons = {
  CLEAR_DAY:'<circle cx="24" cy="24" r="9"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4"/>',
  CLOUDY:'<path d="M11 34h25a7 7 0 0 0 0-14 10 10 0 0 0-19-2A8 8 0 0 0 11 34Z"/>',
  PARTLY_CLOUDY_DAY:'<circle cx="19" cy="15" r="6"/><path d="M19 4v3M7 15h3M10.5 6.5l2.1 2.1M27.5 6.5l-2.1 2.1"/><path d="M13 32h23a7 7 0 0 0 .2-14 10 10 0 0 0-19-1.5A8 8 0 0 0 13 32Z" fill="var(--md-sys-color-secondary-container)"/>',
  LIGHT_RAIN:'<path d="M11 29h25a7 7 0 0 0 0-14 10 10 0 0 0-19-2A8 8 0 0 0 11 29Z"/><path d="M17 34l-2 5M29 34l-2 5"/>',
  MODERATE_RAIN:'<path d="M11 29h25a7 7 0 0 0 0-14 10 10 0 0 0-19-2A8 8 0 0 0 11 29Z"/><path d="M14 34l-2 5M24 34l-2 5M34 34l-2 5"/>'
};

const root = ctx.root;
const set = (id, value) => { const el = root.querySelector('#' + id); if (el) el.textContent = value; };
const button = root.querySelector('#refresh-weather');
const forecast = root.querySelector('#daily-list');
let updatedAt = 0, active = true, failed = false, request, refreshTimer, settingsPending = false;
let weatherTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let refreshDelay = 15 * 60 * 1000;
function nextRefreshDelay(minute) {
  const values = minute.precipitation_2h;
  return Array.isArray(values) && values.slice(0, 120).some(value => Number.isFinite(value) && value >= 0.08)
    ? 5 * 60 * 1000 : 15 * 60 * 1000;
}
const num = value => Number.isFinite(value) ? Math.round(value) : '—';
const time = ms => new Intl.DateTimeFormat('en-GB', {hour:'2-digit',minute:'2-digit',timeZone:weatherTimeZone}).format(new Date(ms));
function age() { if (!updatedAt || failed) return; const m = Math.max(0, Math.floor((Date.now()-updatedAt)/60000)); set('weather-updated', m < 60 ? 'Updated '+m+' min ago' : 'Updated '+Math.floor(m/60)+' hr ago'); }
function render(data) {
  if (typeof data.timezone === 'string') { try { new Intl.DateTimeFormat('en', {timeZone:data.timezone}); weatherTimeZone = data.timezone; } catch (_) { weatherTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } }
  else weatherTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const result = data.result || {}, current = result.realtime || {}, daily = result.daily || {}, minute = result.minutely || {};
  if (!Number.isFinite(current.temperature)) throw Error('Missing current temperature');
  const temps = daily.temperature || [], rain = daily.precipitation || [], winds = daily.wind || [], skies = daily.skycon || [];
  set('temperature', num(current.temperature)); set('feels-like', Number.isFinite(current.apparent_temperature) ? num(current.apparent_temperature)+'°' : '—');
  set('weather-description', String(current.skycon || 'Unknown').toLowerCase().replaceAll('_',' '));
  const currentIcon=root.querySelector('.weather-art'); const currentSky=current.skycon || 'CLOUDY'; currentIcon.innerHTML=icons[currentSky] || (currentSky.includes('RAIN') ? icons.MODERATE_RAIN : icons.CLOUDY);
  set('high-low', 'H '+num(temps[0]?.max)+'°  L '+num(temps[0]?.min)+'°');
  set('humidity', 'Humidity '+num(Number.isFinite(current.humidity) ? current.humidity*100 : NaN)+'%');
  set('rain-chance', 'Rain '+num(Number.isFinite(minute.probability?.[0]) ? (minute.probability[0] > 1 ? minute.probability[0] : minute.probability[0]*100) : NaN)+'% · 30 min');
  forecast.replaceChildren();
  for (const [i, t] of temps.slice(0,7).entries()) {
    const sky=skies[i]?.value || 'CLOUDY', probability=rain[i]?.probability, speed=winds[i]?.avg?.speed;
    const date=new Date(t.date), day=(i===0?'Today':new Intl.DateTimeFormat('en',{weekday:'short',timeZone:weatherTimeZone}).format(date))+' '+new Intl.DateTimeFormat('en',{day:'numeric',timeZone:weatherTimeZone}).format(date);
    const row=document.createElement('div'); row.className=Number.isFinite(probability)&&probability>60?'daily-row rain-high':'daily-row';
    const icon=icons[sky] || (sky.includes('RAIN') ? icons.MODERATE_RAIN : icons.CLOUDY);
    row.innerHTML='<span class="daily-day"></span><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icon+'</svg><span class="daily-rain"></span><span class="daily-temp"></span><span class="daily-wind"></span>';
    row.querySelector('.daily-day').textContent=day; row.querySelector('.daily-rain').textContent=num(probability)+'%'; row.querySelector('.daily-temp').textContent=num(t.max)+'° / '+num(t.min)+'°'; row.querySelector('.daily-wind').textContent=num(speed);
    row.setAttribute('aria-label',day+', '+sky.toLowerCase().replaceAll('_',' ')+', rain '+num(probability)+'%, high '+num(t.max)+' degrees, low '+num(t.min)+' degrees, wind '+num(speed)+' kilometers per hour'); forecast.appendChild(row);
  }
  const values=Array.isArray(minute.precipitation)?minute.precipitation.slice(0,60):[];
  const thresholds=[0,0.08,3.44,11.33,51.3], ys=[95,72,50,27,5];
  const y = v => { if(v>=thresholds[4]) return 5; for(let i=1;i<thresholds.length;i++) if(v<=thresholds[i]) return ys[i-1]+(ys[i]-ys[i-1])*(v-thresholds[i-1])/(thresholds[i]-thresholds[i-1]); return 95; };
  const line=root.querySelector('.rain-line'); line.setAttribute('d',values.length>1?values.map((v,i)=>(i?'L':'M')+(240*i/(values.length-1)).toFixed(1)+' '+y(Math.max(0,Number(v)||0)).toFixed(1)).join(' '):'');
  root.querySelector('.rain-value').textContent=Number.isFinite(values[0]) ? values[0].toFixed(1)+' mm/h' : '— mm/h';
  const axis=root.querySelectorAll('.rain-axis span'); const now=Date.now(); axis[0].textContent='Now · '+time(now); axis[1].textContent=time(now+1800000); axis[2].textContent=time(now+3600000);
  root.querySelector('.rain-chart').setAttribute('aria-label',values.length?'One-hour precipitation forecast':'One-hour precipitation forecast unavailable');
  refreshDelay=nextRefreshDelay(minute);
  updatedAt=Date.now(); failed=false; age();
}
async function refresh() {
  if (request) return; clearTimeout(refreshTimer); request=new AbortController(); button.disabled=true;
  try { const key=ctx.host.data?.caiyun_weather_api; if(!key) throw Error('Caiyun API key unavailable'); const place=ctx.host.data?.weatherLocation || {name:'Hong Kong',lat:22.32,lon:114.17}; if(!Number.isFinite(place.lat)||!Number.isFinite(place.lon)||place.lat < -90||place.lat > 90||place.lon < -180||place.lon > 180) throw Error('Weather location unavailable'); set('location-name',place.name || 'Selected location'); const url='https://api.caiyunapp.com/v2.6/'+encodeURIComponent(key)+'/'+place.lon.toFixed(2)+','+place.lat.toFixed(2)+'/weather?dailysteps=7&hourlysteps=24&unit=metric%3Av2&lang=en_US'; const response=await ctx.host.http.get(url,{signal:request.signal}); if(!response.ok) throw Error('Weather service unavailable'); const data=await response.json(); if(active) { render(data); console.info('Weather updated from app service'); } }
  catch(e) { if(active && e.name!=='AbortError') { failed=true; set('weather-updated',e.message === 'Caiyun API key unavailable' ? 'Add Caiyun key in Settings' : 'Update failed'); console.error('Weather update failed:', e.message); } }
  finally { request=null; if(active) { button.disabled=false; if(settingsPending) { settingsPending=false; refresh(); } else refreshTimer=setTimeout(refresh, refreshDelay); } }
}
function settingsChanged() { if (request) { settingsPending=true; request.abort(); } else refresh(); }
button.addEventListener('click',refresh); window.addEventListener('thinkview-weather-settings-changed',settingsChanged); const timer=setInterval(age,60000); refresh();
return () => { active=false; clearInterval(timer); clearTimeout(refreshTimer); button.removeEventListener('click',refresh); window.removeEventListener('thinkview-weather-settings-changed',settingsChanged); if(request) request.abort(); };
