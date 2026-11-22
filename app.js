const hostedPhone = document.documentElement.hasAttribute('data-phone');
const $ = id => document.getElementById(id);
const money = cents => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', minimumFractionDigits:cents % 100 ? 2 : 0, maximumFractionDigits:2}).format(cents / 100);
const date = seconds => new Intl.DateTimeFormat('en-US', {timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(seconds*1000));
let snapshot, seen, sound = false, audio, fetching = false, toastTimer;
let updateRequest, retryTimer, retryResolve, pendingCelebrations = 0;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function text(id, value) { $(id).textContent = value; }
function chime() {
  if (!sound || !audio) return;
  [660,880,1320].forEach((frequency,i) => {
    const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime+i*.11;
    oscillator.type='sine'; oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(.12,start+.02); gain.gain.exponentialRampToValueAtTime(.001,start+.5);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start+.55);
  });
}
function celebrate(message, playSound = true) {
  text('toast', message); $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>{$('toast').hidden=true;},4500);
  if (playSound) chime();
  if (reduced) return;
  const board=document.querySelector('.marquee'); board.classList.remove('wiggle'); void board.offsetWidth; board.classList.add('wiggle');
  for(let i=0;i<70;i++) {
    const piece=document.createElement('i'); piece.className='confetto';
    piece.style.left=`${Math.random()*100}%`; piece.style.background=['#ffdc3f','#ff68ad','#53d6df','#b4f56c'][i%4];
    piece.style.animationDelay=`${Math.random()*.6}s`; piece.style.borderRadius=i%3?'2px':'50%';
    $('confetti').append(piece); setTimeout(()=>piece.remove(),3700);
  }
}
let salesSinceReload = 0;
function markNewSale(count) {
  salesSinceReload += count;
  const icon = $('favicon').cloneNode(false);
  icon.href = `./icons/sale-${Math.min(salesSinceReload, 10)}.png`;
  $('favicon').replaceWith(icon);
  document.title = `(${salesSinceReload}) Teachery | BFCM cha-ching`;
}
// Carry tab alerts through an automatic wake reload. A normal reload clears them.
const wakeStorageKey = 'bfcm-wake-reload';
let lastWakeTime;
let reloadingAfterWake = false;
function restoreWakeState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(wakeStorageKey));
    sessionStorage.removeItem(wakeStorageKey);
    if (!saved) return;
    lastWakeTime = saved.wakeTime;
    seen = new Set(saved.seen);
    if (saved.count) markNewSale(saved.count);
    pendingCelebrations = saved.pending;
    if (saved.sound) setSound(true);
  } catch { /* Live updates also work when tab storage is unavailable. */ }
}
function reloadAfterWake(data) {
  if (reloadingAfterWake) return true;
  if (data.error || data.syncing || data.wake_time == null) return false;
  const previous = lastWakeTime;
  lastWakeTime = data.wake_time;
  if (previous == null || data.wake_time <= previous || !seen) return false;
  // The Mac reloads after its first verified post-wake sync. Phone tabs just catch up.
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) return false;
  try {
    sessionStorage.setItem(wakeStorageKey, JSON.stringify({
      wakeTime: lastWakeTime, seen: [...seen], count: salesSinceReload,
      pending: pendingCelebrations, sound
    }));
  } catch { return false; }
  reloadingAfterWake = true;
  location.reload();
  return true;
}
function cell(row, value, className) { const td=document.createElement('td');td.textContent=value;if(className)td.className=className;row.append(td);return td; }
const pacificDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
});
let displayedDay;
function renderToday(sales, day) {
  const today = sales.filter(sale => pacificDay.format(sale.created * 1000) === day);
  const counts = {
    total: today.length,
    affiliate: today.filter(sale => sale.referral).length,
    direct: today.filter(sale => sale.verified && !sale.referral).length
  };
  for (const [category, count] of Object.entries(counts)) {
    text(category + '-today', count + (count === 1 ? ' sale today' : ' sales today'));
  }
  const revenue = today.reduce((sum, sale) => sum + sale.amount, 0);
  text('today-revenue', money(revenue) + ' today in revenue');
  displayedDay = day;
}
function render(data) {
  // A manual refresh can finish after a newer live update has already arrived.
  if (snapshot?.updated_at && data.updated_at && data.updated_at < snapshot.updated_at) return;
  if (reloadAfterWake(data)) return;
  snapshot=data; status();
  if(!data.totals) { if(data.error) text('sales-body',''); return; }
  renderToday(data.sales, pacificDay.format(Date.now()));
  const t=data.totals;
  text('profit',money(t.net)); $('profit').classList.toggle('small',money(t.net).length>7);
  text('receipt-profit',money(t.net)); text('revenue',money(t.gross)); text('fees',`−${money(t.fees)}`);
  text('revenue-math',`${t.count} × $570`); text('fee-math',`${t.affiliate_count} referral ${t.affiliate_count===1?'sale':'sales'} × 25% (after refunds)`);
  text('total-count',t.count); text('affiliate-count',t.affiliate_count); text('direct-count',t.other_count);
  $('adjustments').hidden=!(t.refunds+t.disputed);text('deductions',`−${money(t.refunds+t.disputed)}`);
  text('sales-caption',`${t.count} ${t.count===1?'SALE':'SALES'} · USD${t.unknown_count ? ` · ${t.unknown_count} ATTRIBUTION PENDING` : ''}`);
  const added = seen && !data.error ? data.sales.filter(sale => !seen.has(sale.id)) : [];
  if (!seen) seen = new Set(data.sales.map(sale => sale.id));
  for (const sale of added) seen.add(sale.id);
  const tbody=$('sales-body'); tbody.replaceChildren();
  if(!data.sales.length){const row=document.createElement('tr');const td=cell(row,'The first cha-ching is on its way.','empty');td.colSpan=5;tbody.append(row);}
  data.sales.forEach((sale,index)=>{
    const row=document.createElement('tr');const fresh=added.some(s=>s.id===sale.id);if(fresh)row.className='fresh';
    const paid=cell(row,date(sale.created));
    if(index===0){const badge=document.createElement('span');badge.className='new';badge.textContent=fresh?'NEW!':'LATEST';paid.append(badge);}
    cell(row,`${sale.source==='Billing'?'💳':sale.source==='Lifetime link'?'🔗':'🧾'} ${sale.source}`);
    const referral=cell(row,'');const tag=document.createElement('span');tag.className=sale.referral?'badge':'no-ref';tag.textContent=sale.referral?'🤝 Yes':sale.verified?'No':'Checking';if(sale.referral)tag.title=sale.referral;referral.append(tag);
    cell(row,money(sale.amount),'amount');cell(row,`${sale.status==='Paid'?'✓ ':''}${sale.status}`,sale.status==='Paid'?'paid':'status-other');tbody.append(row);
  });
  if(added.length && !data.error) {
    markNewSale(added.length);
    if (document.hidden) {
      pendingCelebrations += added.length;
      chime();
    } else {
      celebrate(saleMessage(added.length));
    }
  }
}
function saleMessage(count) {
  return count === 1 ? 'CHA-CHING! Another $570. 🎉' : `CHA-CHING! ${count} new sales. 🎉`;
}
function showStatus(message, kind = 'warning') {
  const indicator = $('status-indicator');
  indicator.hidden = !message;
  indicator.dataset.kind = kind;
  $('status-button').title = message;
  $('status-button').setAttribute('aria-label', message || 'Sync status');
  text('notice', message);
  if (!message) {
    $('notice').hidden = true;
    $('status-button').setAttribute('aria-expanded', 'false');
  }
}
function closeStatus() {
  $('notice').hidden = true;
  $('status-button').setAttribute('aria-expanded', 'false');
}
$('status-button').addEventListener('click', () => {
  $('notice').hidden = !$('notice').hidden;
  $('status-button').setAttribute('aria-expanded', String(!$('notice').hidden));
});
 document.addEventListener('pointerdown', event => { if (!$('status-indicator').contains(event.target)) closeStatus(); });
 document.addEventListener('keydown', event => { if (event.key === 'Escape') closeStatus(); });
function status() {
  if(!snapshot)return;
  const day = pacificDay.format(Date.now());
  if (snapshot.totals && day !== displayedDay) renderToday(snapshot.sales, day);
  const age=snapshot.updated_at ? Math.max(0,Math.floor(Date.now()/1000-snapshot.updated_at)) : null;
  if (hostedPhone) {
    const when = new Date(snapshot.updated_at * 1000).toLocaleString();
    $('connection').title = 'Last verified on your Mac: ' + when;
    $('connection').querySelector('span').textContent = $('connection').title;
    $('connection').className = 'connection';
    text('phone-verified', 'Last verified ' + when);
    showStatus(snapshot.error || '');
    return;
  }
  const stale=age!==null && age>95;
  const checkingSaved = snapshot.syncing && snapshot.error === 'Checking saved totals against Stripe...';
  const error = checkingSaved ? null : snapshot.error;
  $('connection').className=`connection ${error||stale?'error':snapshot.updated_at?'live':''}`;
  $('connection').querySelector('span').textContent=error||stale?'Waiting to reconnect':snapshot.syncing?'Checking Stripe':'Live from Stripe';
  text('updated',age===null?'First sync in progress...':`Updated ${age<60?`${age}s`:`${Math.floor(age/60)}m`} ago · checks every 30s`);
  $('connection').title = `${$('connection').querySelector('span').textContent}. ${$('updated').textContent}`;
  const warning=error || (stale?'These are the last verified totals. The tracker is reconnecting to Stripe.':'');
  showStatus(warning || (snapshot.syncing ? (checkingSaved ? 'Checking saved totals against Stripe...' : 'Checking Stripe...') : ''), warning ? 'warning' : 'syncing');
}
async function poll() {
  if(fetching)return;fetching=true;
  try{if(hostedPhone){render(await readPhoneSnapshot());return;}const response=await fetch('/api/sales',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();render(await response.json());}
  catch(error){if(hostedPhone){showStatus(error.message || 'Could not load the saved totals.');return;}if(snapshot){snapshot.error='Local tracker is reconnecting. Your last verified totals are still here.';status();}else{showStatus('Cannot reach the local tracker. Retrying automatically.');}}
  finally{fetching=false;}
}
async function watchUpdates() {
  while (!reloadingAfterWake) {
    updateRequest = new AbortController();
    try {
      const after = snapshot?.revision || '';
      const response = await fetch(`/api/updates?after=${encodeURIComponent(after)}`, {
        signal: AbortSignal.any([updateRequest.signal, AbortSignal.timeout(45000)]),
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Update connection failed');
      render(await response.json());
      // Immediately hold the next request. No browser timer gates a new sale.
    } catch (error) {
      if (updateRequest.signal.aborted) continue;
      const message = 'Live updates are reconnecting. Your last verified totals are still here.';
      if (snapshot) { snapshot.error = message; status(); } else { showStatus(message); }
      await new Promise(resolve => {
        retryResolve = resolve;
        retryTimer = setTimeout(resolve, 3000);
      });
      retryResolve = null;
    }
  }
}
function reconnectUpdates() {
  if (hostedPhone) { poll(); return; }
  if (retryResolve) {
    clearTimeout(retryTimer);
    retryResolve();
  } else {
    updateRequest?.abort();
  }
}
$('refresh').addEventListener('click',async()=>{
  const button=$('refresh');button.disabled=true;button.setAttribute('aria-label','Refreshing sales');button.title='Refreshing sales';
  try{if(hostedPhone){await poll();return;}const r=await fetch('/api/refresh',{method:'POST',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();await poll();}
  catch{showStatus('Refresh could not connect. Retrying automatically.');}
  finally{setTimeout(()=>{button.disabled=false;button.setAttribute('aria-label','Refresh sales');button.title='Refresh sales';},2000);}
});
function setSound(enabled) {
  sound = enabled;
  if (sound) {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume().catch(() => {});
  }
  $('sound').setAttribute('aria-label', sound ? 'Disable sale sounds' : 'Enable sale sounds');
  $('sound').title = sound ? 'Sound on. Click to mute' : 'Sound off. Click to enable';
  $('sound').setAttribute('aria-pressed', String(sound));
}
$('sound').addEventListener('click', () => { setSound(!sound); if (sound) chime(); });
$('party').addEventListener('click',()=>celebrate('A tiny happy dance. You earned it. ✦'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  reconnectUpdates();
  if (pendingCelebrations) {
    celebrate(saleMessage(pendingCelebrations), false);
    pendingCelebrations = 0;
  }
});
window.addEventListener('online', reconnectUpdates);
window.addEventListener('pageshow', event => { if (event.persisted) reconnectUpdates(); });
restoreWakeState();
if (hostedPhone) { poll(); setInterval(poll, 15000); } else { watchUpdates(); }
setInterval(() => { if (!document.hidden) status(); }, 1000);

async function updatePhoneLink() {
  if (!['localhost','127.0.0.1'].includes(location.hostname)) return;
  try {
    const response = await fetch('/api/phone', {signal:AbortSignal.timeout(5000)});
    const data = await response.json();
    if (data.url && new URL(data.url).origin === 'https://iwearyourshirt.github.io') {
      $('phone-link').href = data.url;
      $('phone-link').title = data.url;
      $('phone-link').hidden = false;
    } else {
      $('phone-link').hidden = true;
      $('phone-link').removeAttribute('href');
    }
  } catch {}
}
updatePhoneLink();setInterval(updatePhoneLink,30000);
