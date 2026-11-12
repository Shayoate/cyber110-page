'use strict';
const CROPS = {
  carrot: { name: 'Carrot', icon: '🥕', cost: 3, value: 8, seconds: 20 },
  tomato: { name: 'Tomato', icon: '🍅', cost: 6, value: 16, seconds: 40 },
  strawberry: { name: 'Strawberry', icon: '🍓', cost: 10, value: 28, seconds: 60 }
};
const SAVE_KEY = 'little-acre-farm-v1';
const $ = selector => document.querySelector(selector);
let selectedCrop = 'carrot', tool = 'plant', sound = false, audioContext;
let toastTimer, floatTimer, saveAvailable = true;
function freshFarm() {
  const now = Date.now();
  const plots = Array(12).fill(null);
  plots[0] = { crop: 'carrot', wateredAt: now - 25000 };
  plots[2] = { crop: 'tomato', wateredAt: now - 12000 };
  plots[5] = { crop: 'carrot', wateredAt: null };
  plots[8] = { crop: 'strawberry', wateredAt: null };
  return { version: 1, coins: 40, inventory: { carrot: 0, tomato: 0, strawberry: 0 }, plots, harvested: 0, rewardClaimed: false, startedAt: now };
}
function loadFarm() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshFarm();
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Number.isSafeInteger(saved.coins) || saved.coins < 0 || !Number.isSafeInteger(saved.harvested) || saved.harvested < 0 || typeof saved.rewardClaimed !== 'boolean' || !Number.isFinite(saved.startedAt) || saved.startedAt <= 0 || saved.startedAt > Date.now() || !saved.inventory || !Array.isArray(saved.plots) || saved.plots.length !== 12) throw new Error('Invalid farm');
    for (const id of Object.keys(CROPS)) if (!Number.isSafeInteger(saved.inventory[id]) || saved.inventory[id] < 0) throw new Error('Invalid inventory');
    for (const plot of saved.plots) if (plot !== null && (!plot || !Object.hasOwn(CROPS, plot.crop) || (plot.wateredAt !== null && (!Number.isFinite(plot.wateredAt) || plot.wateredAt < 0 || plot.wateredAt > Date.now())))) throw new Error('Invalid plot');
    return saved;
  } catch (error) {
    // Preserve invalid data for recovery instead of silently overwriting it.
    try {
      const previous = localStorage.getItem(SAVE_KEY);
      if (previous) localStorage.setItem(SAVE_KEY + '-backup', previous);
    } catch (_) { saveAvailable = false; }
    return freshFarm();
  }
}
let farm = loadFarm();
function saveFarm() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(farm)); saveAvailable = true; }
  catch (_) { saveAvailable = false; }
  $('#save-status').textContent = saveAvailable ? '✓ Your farm is saved automatically' : 'Saving unavailable · keep this tab open to keep playing';
}
function notify(message, floating = false) {
  const element = $(floating ? '#floating-message' : '#toast');
  clearTimeout(floating ? floatTimer : toastTimer);
  element.textContent = message;
  element.classList.add('visible');
  const timer = setTimeout(() => element.classList.remove('visible'), 3000);
  if (floating) floatTimer = timer; else toastTimer = timer;
}
function chime() {
  if (!sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    [523.25, 659.25].forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const start = audioContext.currentTime + i * .09;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.06, start + .01); gain.gain.exponentialRampToValueAtTime(.001, start + .25);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start); oscillator.stop(start + .26);
    });
  } catch (_) { /* Audio is optional; farm actions still work. */ }
}
function progress(plot) {
  if (plot.wateredAt === null) return 0;
  return Math.min(1, Math.max(0, (Date.now() - plot.wateredAt) / (CROPS[plot.crop].seconds * 1000)));
}
function renderPlots() {
  farm.plots.forEach((plot, i) => {
    const button = $('#plots').children[i];
    if (!plot) {
      button.className = 'plot'; button.innerHTML = '<span class="empty-marker">+</span>';
      button.setAttribute('aria-label', `Empty patch ${i + 1}. Plant ${CROPS[selectedCrop].name.toLowerCase()}.`);
      button.title = 'An empty patch, full of possibility';
      return;
    }
    const crop = CROPS[plot.crop], amount = progress(plot), ready = amount >= 1;
    const seconds = Math.ceil((1 - amount) * crop.seconds);
    button.className = `plot${plot.wateredAt !== null ? ' watered' : ''}${ready ? ' ready' : ''}`;
    button.innerHTML = `<span class="crop">${ready ? crop.icon : amount > .5 ? '🌿' : '🌱'}</span><span class="plot-badge">${ready ? '✨' : plot.wateredAt === null ? '💧' : ''}</span>${plot.wateredAt !== null && !ready ? `<span class="grow-bar"><span style="width:${amount * 100}%"></span></span>` : ''}`;
    const status = ready ? 'Ready to harvest' : plot.wateredAt === null ? 'Needs water' : `Growing, ${seconds} seconds left`;
    button.setAttribute('aria-label', `Patch ${i + 1}: ${crop.name}. ${status}.`);
    button.title = `${crop.name} · ${status}`;
  });
}
function basketValue() { return Object.keys(CROPS).reduce((sum, id) => sum + farm.inventory[id] * CROPS[id].value, 0); }
function render() {
  $('#coins').textContent = farm.coins;
  $('#day').textContent = Math.floor((Date.now() - farm.startedAt) / 86400000) + 1;
  $('#basket').innerHTML = Object.entries(CROPS).map(([id, crop]) => `<div class="basket-item" title="${crop.name}: ${farm.inventory[id]}"><span aria-hidden="true">${crop.icon}</span><span aria-label="${farm.inventory[id]} ${crop.name}">× ${farm.inventory[id]}</span></div>`).join('');
  const value = basketValue();
  $('#sell-value').textContent = `+${value} ✦`;
  $('#sell-all').disabled = value === 0;
  $('#goal-progress').style.width = `${Math.min(100, farm.harvested / 5 * 100)}%`;
  $('#goal-text').textContent = farm.rewardClaimed ? 'A growing success!' : 'Harvest your first 5 crops';
  $('#goal-count').textContent = farm.rewardClaimed ? `${farm.harvested} crops harvested · 20 coin reward earned ♡` : `${farm.harvested} / 5 harvested · reward: 20 coins`;
  renderPlots();
}
function setTool(nextTool) {
  tool = nextTool;
  document.querySelectorAll('[data-tool]').forEach(button => { const active = button.dataset.tool === tool; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('#tool-hint').innerHTML = { plant: 'Pick a seed, then click<br>an empty patch.', water: 'A little drink for<br>each thirsty seedling.', harvest: 'Look for sparkles,<br>then pick your crops.' }[tool];
}
function actOnPlot(index) {
  const plot = farm.plots[index];
  if (tool === 'plant') {
    if (plot) return notify('This patch is already growing something.', true);
    const crop = CROPS[selectedCrop];
    if (farm.coins < crop.cost) return notify('A few more coins needed. Harvest and sell a crop first!');
    farm.coins -= crop.cost;
    farm.plots[index] = { crop: selectedCrop, wateredAt: null };
    notify('A little beginning. Give it some water! 💧', true);
  } else if (tool === 'water') {
    if (!plot) return notify('Plant a seed here first. 🌱', true);
    if (plot.wateredAt !== null) return notify(progress(plot) >= 1 ? 'Ready for your basket! 🧺' : 'Happily watered. Give it a little time.', true);
    plot.wateredAt = Date.now();
    notify('A little water. A little patience. ♡', true);
  } else {
    if (!plot) return notify('Nothing to harvest here just yet.', true);
    if (progress(plot) < 1) return notify(plot.wateredAt === null ? 'This little one needs water first. 💧' : 'Still growing. Good things take a little time.', true);
    farm.inventory[plot.crop]++; farm.harvested++; farm.plots[index] = null;
    notify(`Fresh ${CROPS[plot.crop].name.toLowerCase()} in your basket!`, true);
    if (farm.harvested >= 5 && !farm.rewardClaimed) {
      farm.coins += 20; farm.rewardClaimed = true;
      notify('Five lovely harvests! Here’s your 20 coin reward. ✨');
    }
  }
  chime(); saveFarm(); render();
}
for (let i = 0; i < 12; i++) {
  const button = document.createElement('button'); button.type = 'button';
  button.addEventListener('click', () => actOnPlot(i)); $('#plots').append(button);
}
for (const [id, crop] of Object.entries(CROPS)) {
  const button = document.createElement('button');
  button.className = `seed-option${id === selectedCrop ? ' selected' : ''}`;
  button.setAttribute('aria-pressed', String(id === selectedCrop));
  button.innerHTML = `<span class="seed-icon" aria-hidden="true">${crop.icon}</span><span class="seed-description"><strong>${crop.name}</strong><small>${crop.seconds}s to grow · sells for ${crop.value} ✦</small></span><span class="seed-price">${crop.cost} <span>✦</span></span>`;
  button.addEventListener('click', () => {
    selectedCrop = id;
    document.querySelectorAll('.seed-option').forEach(element => { element.classList.toggle('selected', element === button); element.setAttribute('aria-pressed', String(element === button)); });
    setTool('plant'); renderPlots();
  });
  $('#seed-list').append(button);
}
document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
$('#sell-all').addEventListener('click', () => {
  const value = basketValue(); if (!value) return;
  farm.coins += value;
  for (const id of Object.keys(CROPS)) farm.inventory[id] = 0;
  saveFarm(); render(); chime(); notify(`Your neighbors loved it! +${value} coins. ♡`);
});
$('#chicken').addEventListener('click', () => notify('Cluck! You’re doing egg-cellent. 🐓', true));
$('#sound-toggle').addEventListener('click', () => {
  sound = !sound; $('#sound-toggle').textContent = sound ? '♫ Sound on' : '♫ Sound off';
  $('#sound-toggle').setAttribute('aria-pressed', String(sound)); chime();
});
$('#help-open').addEventListener('click', () => $('#help-dialog').showModal());
for (const id of ['#help-close', '#start-growing']) $(id).addEventListener('click', () => $('#help-dialog').close());
document.addEventListener('keydown', event => {
  if ($('#help-dialog').open || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const next = { '1': 'plant', '2': 'water', '3': 'harvest' }[event.key]; if (next) setTool(next);
});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-view]').forEach(element => { const active = element === button; element.classList.toggle('active', active); element.setAttribute('aria-current', active ? 'page' : 'false'); });
  const target = button.dataset.view === 'market' ? $('.basket-card') : $('.farm-panel');
  target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  if (button.dataset.view === 'market') {
    target.classList.remove('market-highlight'); void target.offsetWidth; target.classList.add('market-highlight');
    notify('Your neighborhood farm stand · sell your fresh harvest here.');
  }
}));
// Refresh crop timers without moving keyboard focus; timestamps also work offline.
setInterval(renderPlots, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
setTool('plant'); render(); saveFarm();
