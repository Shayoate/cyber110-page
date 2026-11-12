// READING THIS FILE
// JavaScript is the language that runs the interactive farming game. The browser is the program opening this page.
// A comment beginning with // is a note for a reader; it is not an instruction the browser runs.
// A value is a piece of information. A variable is a named place that holds a value.
// const creates a name that cannot be reassigned; let creates one that can be reassigned.
// A string is text inside quotes; a number represents a quantity; a boolean is true or false.
// An object groups named values in braces. Each name/value pair is a property.
// An array is an ordered list in square brackets; its first position, called index 0, is the first item.
// A function is a reusable set of instructions. Calling it with parentheses runs those instructions.
// A parameter is an input name in a function definition; an argument is the value passed when calling it.
// A method is a function attached to an object. A dot accesses an object property or method.
// A statement is an instruction, usually ending with a semicolon. Braces group instructions together.
// Strict mode below asks JavaScript to catch some mistakes, such as assigning an undeclared variable.
'use strict';
// CROP SETTINGS: this object is the single list of crop names, pictures, prices, and growing times.
// Each inner object describes one crop. The property seconds measures time in seconds.
// These values let the same planting, watering, and selling functions work for every crop.
const CROPS = {
  carrot: { name: 'Carrot', icon: '🥕', cost: 3, value: 8, seconds: 20 },
  tomato: { name: 'Tomato', icon: '🍅', cost: 6, value: 16, seconds: 40 },
  strawberry: { name: 'Strawberry', icon: '🍓', cost: 10, value: 28, seconds: 60 }
};
// localStorage is browser storage that keeps small text values for this website after the tab closes.
// A key is the name used to find a saved value. This key includes v1 to identify the save format.
// These saves belong to this browser and site address; they do not automatically sync to another device.
const SAVE_KEY = 'little-acre-farm-v1';
// The DOM, or Document Object Model, is the browser representation of the HTML elements on the page.
// document provides access to that representation. A selector is text describing an element to find.
// For example, #coins selects the element with id="coins". querySelector returns the first match.
// The $ name is just our short helper function, not an extra library.
// The arrow, =>, is a shorter way to write a function.
const $ = selector => document.querySelector(selector);
// These variables remember the currently selected seed and tool, whether sound is enabled,
// and the browser sound system when it is first created. Sound starts off on every page load.
let selectedCrop = 'carrot', tool = 'plant', sound = false, audioContext;
// A timer schedules something for later. These names track the two message timers so old
// messages can be replaced. saveAvailable remembers whether writing browser storage worked.
let toastTimer, floatTimer, saveAvailable = true;
// NEW GAME: freshFarm returns a starting farm. return sends a value back to the caller
// and ends the current function. The farm object stores the game state, meaning its current information.
function freshFarm() {
  // A timestamp is a number identifying a moment in time. Date.now() gives the current timestamp
  // in milliseconds, where 1,000 milliseconds equal one second.
  const now = Date.now();
  // Make a twelve-item array filled with null. null means there is intentionally no value here,
  // so each null entry represents an empty crop patch.
  const plots = Array(12).fill(null);
  // Add four starter plants so a new farm already has something to do.
  // The first carrot was watered 25 seconds ago, so it is ready immediately.
  // The tomato is partway through growing. A null watering time means the plant still needs water.
  plots[0] = { crop: 'carrot', wateredAt: now - 25000 };
  plots[2] = { crop: 'tomato', wateredAt: now - 12000 };
  plots[5] = { crop: 'carrot', wateredAt: null };
  plots[8] = { crop: 'strawberry', wateredAt: null };
  // Return all starting information together: coins, the basket counts called inventory, plots,
  // harvest count, reward status, and start time. version identifies the save format.
  return { version: 1, coins: 40, inventory: { carrot: 0, tomato: 0, strawberry: 0 }, plots, harvested: 0, rewardClaimed: false, startedAt: now };
}
// LOAD PROGRESS: try to restore the farm before drawing it on the screen.
// try runs code that might fail; catch handles an error, which is a reported problem,
// so blocked storage or a damaged save does not stop the game from opening.
function loadFarm() {
  try {
    // getItem reads the text stored under our save key. If no saved text exists, start a fresh farm.
    // The ! symbol means "not"; here !raw checks whether there is no useful saved text.
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshFarm();
    // JSON, or JavaScript Object Notation, is a text format for storing structured information.
    // JSON.parse converts saved JSON text back into an object the game can use.
    const saved = JSON.parse(raw);
    // Validation means checking that incoming information has the expected shape and sensible values.
    // These checks reject negative coins, missing fields, invalid dates, and lists of the wrong length.
    // === and !== compare values strictly; < and > compare size; || means "or"; && means "and".
    // A safe integer is a whole number JavaScript can represent exactly; a finite number is not infinity
    // or the special invalid-number value. throw creates an error and transfers control to catch.
    if (saved.version !== 1 || !Number.isSafeInteger(saved.coins) || saved.coins < 0 || !Number.isSafeInteger(saved.harvested) || saved.harvested < 0 || typeof saved.rewardClaimed !== 'boolean' || !Number.isFinite(saved.startedAt) || saved.startedAt <= 0 || saved.startedAt > Date.now() || !saved.inventory || !Array.isArray(saved.plots) || saved.plots.length !== 12) throw new Error('Invalid farm');
    // A for...of loop repeats instructions for each item. Object.keys lists an object property names.
    // Check every crop count so invalid saved quantities cannot break the basket calculation.
    for (const id of Object.keys(CROPS)) if (!Number.isSafeInteger(saved.inventory[id]) || saved.inventory[id] < 0) throw new Error('Invalid inventory');
    // Check each occupied patch: its crop must exist in the settings, and its watering time
    // must be null or a valid timestamp that is not in the future. Empty null patches are allowed.
    for (const plot of saved.plots) if (plot !== null && (!plot || !Object.hasOwn(CROPS, plot.crop) || (plot.wateredAt !== null && (!Number.isFinite(plot.wateredAt) || plot.wateredAt < 0 || plot.wateredAt > Date.now())))) throw new Error('Invalid plot');
    // Only return the restored farm after all validation checks succeed.
    return saved;
  } catch (error) {
    // Preserve invalid data for recovery instead of silently overwriting it.
    // Before starting over, keep a backup of any damaged saved text under another key.
    // A nested try/catch handles the possibility that browser storage itself is unavailable.
    // The underscore is an unused error input; its name does not have any special behavior.
    try {
      const previous = localStorage.getItem(SAVE_KEY);
      if (previous) localStorage.setItem(SAVE_KEY + '-backup', previous);
    } catch (_) { saveAvailable = false; }
    return freshFarm();
  }
}
// Read the saved farm once when the script starts, or use the starting farm if loading cannot work.
let farm = loadFarm();
// SAVE PROGRESS: JSON.stringify converts the farm object into text, because localStorage stores text.
// setItem writes that text under the same key, replacing the previous saved version.
// Call this after game actions so the next visit can resume at the same point.
function saveFarm() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(farm)); saveAvailable = true; }
  catch (_) { saveAvailable = false; }
  // textContent replaces an element text without treating it as HTML.
  // The conditional operator, written condition ? choiceA : choiceB, selects one of two values.
  // Show a truthful status: either saving worked or the player needs to keep this tab open.
  $('#save-status').textContent = saveAvailable ? '✓ Your farm is saved automatically' : 'Saving unavailable · keep this tab open to keep playing';
}
// MESSAGES: floating=false is a default parameter, used when the caller omits that argument.
// Use the floating message for crop actions or the bottom notification for general updates.
function notify(message, floating = false) {
  const element = $(floating ? '#floating-message' : '#toast');
  // Cancel the old message timer before creating another, so an older message does not hide a newer one.
  clearTimeout(floating ? floatTimer : toastTimer);
  element.textContent = message;
  // A CSS class is a name that groups elements for appearance rules. classList.add adds a class;
  // here the visible class makes the message appear. setTimeout schedules a function to run once
  // after the given delay, so 3,000 means hide the message after three seconds.
  element.classList.add('visible');
  const timer = setTimeout(() => element.classList.remove('visible'), 3000);
  if (floating) floatTimer = timer; else toastTimer = timer;
}
// OPTIONAL SOUND: leave immediately if sound is off. The try/catch makes sound optional
// even when the browser cannot play it. window gives access to browser-provided features.
function chime() {
  if (!sound) return;
  try {
    // An AudioContext is the browser sound workspace. ||= creates it only if we do not have one yet.
    // The alternative name supports browsers that use an older name. new creates a new object
    // from a constructor, which is a function designed to make objects. resume allows paused audio to play.
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    // forEach calls a function for each array item. This callback, a function passed to another function,
    // plays two notes. Frequency is the number of sound vibrations each second and determines pitch.
    // i is the note index, used to start the second note slightly after the first.
    [523.25, 659.25].forEach((frequency, i) => {
      // An oscillator generates a repeating sound wave, and a gain control adjusts volume.
      // A sine wave is a smooth basic tone. Start quietly, increase the volume, then fade it away.
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const start = audioContext.currentTime + i * .09;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.06, start + .01); gain.gain.exponentialRampToValueAtTime(.001, start + .25);
      // Connect the sound generator through the volume control to the audio output.
      // Schedule a short start and stop so the chime ends without an endless tone.
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start); oscillator.stop(start + .26);
    });
  } catch (_) { /* Audio is optional; farm actions still work. */ }
}
// GROWTH: return a fraction from 0 to 1, where 0 means no growing progress and 1 means ready.
// An unwatered plant stays at 0. Otherwise divide elapsed milliseconds by the required growing time.
// Math.min and Math.max limit the result to that range. Saved timestamps let crops finish while away.
function progress(plot) {
  if (plot.wateredAt === null) return 0;
  return Math.min(1, Math.max(0, (Date.now() - plot.wateredAt) / (CROPS[plot.crop].seconds * 1000)));
}
// DRAW THE PATCHES: rendering means turning game information into what the player sees.
// Visit each saved patch and update its existing button instead of replacing the button itself.
// Keeping the same buttons preserves keyboard focus, meaning the control a keyboard user is on.
function renderPlots() {
  farm.plots.forEach((plot, i) => {
    // children is the list of elements directly inside the plot grid. Use the patch index
    // to find the corresponding button. No new buttons are created during this update.
    const button = $('#plots').children[i];
    if (!plot) {
      // For an empty patch, apply its ordinary CSS class and show a small plus sign.
      // innerHTML sets content by reading a string as HTML. Here that string is controlled by the game.
      button.className = 'plot'; button.innerHTML = '<span class="empty-marker">+</span>';
      // An attribute is extra information attached to an HTML element; setAttribute changes one.
      // ARIA, Accessible Rich Internet Applications, supplies labels for assistive tools such as screen readers.
      // This label describes the empty patch and selected seed. title supplies the mouse hover hint.
      // A template literal is text in backticks; ${...} inserts a calculated value into that text.
      button.setAttribute('aria-label', `Empty patch ${i + 1}. Plant ${CROPS[selectedCrop].name.toLowerCase()}.`);
      button.title = 'An empty patch, full of possibility';
      return;
    }
    // For an occupied patch, look up its crop settings and progress. ready is a boolean
    // that becomes true when growth reaches 1. Math.ceil rounds up to the next whole second.
    const crop = CROPS[plot.crop], amount = progress(plot), ready = amount >= 1;
    const seconds = Math.ceil((1 - amount) * crop.seconds);
    // Build the class names that CSS uses to draw dry soil, watered soil, or a ready patch.
    // The HTML below chooses a seedling, leaves, or the finished crop, then adds a water drop
    // or sparkle and, while growing, a progress bar. An inline style is an appearance rule
    // placed directly on an HTML element; here only the growth bar width is calculated dynamically.
    button.className = `plot${plot.wateredAt !== null ? ' watered' : ''}${ready ? ' ready' : ''}`;
    button.innerHTML = `<span class="crop">${ready ? crop.icon : amount > .5 ? '🌿' : '🌱'}</span><span class="plot-badge">${ready ? '✨' : plot.wateredAt === null ? '💧' : ''}</span>${plot.wateredAt !== null && !ready ? `<span class="grow-bar"><span style="width:${amount * 100}%"></span></span>` : ''}`;
    // Describe the same growth state in words, so labels and mouse hover hints agree with the picture.
    const status = ready ? 'Ready to harvest' : plot.wateredAt === null ? 'Needs water' : `Growing, ${seconds} seconds left`;
    button.setAttribute('aria-label', `Patch ${i + 1}: ${crop.name}. ${status}.`);
    button.title = `${crop.name} · ${status}`;
  });
}
// BASKET TOTAL: reduce combines a list into one value. Start from 0 and add
// each crop quantity multiplied by its selling price. This total is what Sell harvest pays.
function basketValue() { return Object.keys(CROPS).reduce((sum, id) => sum + farm.inventory[id] * CROPS[id].value, 0); }
// DRAW THE STATUS CARDS: refresh the coin count, day, basket, sale button, and harvest goal.
// This function calls renderPlots too, keeping the rest of the screen consistent with the farm.
function render() {
  $('#coins').textContent = farm.coins;
  // There are 86,400,000 milliseconds in one day. Math.floor rounds down, and adding 1
  // makes the starting day day 1 instead of day 0.
  $('#day').textContent = Math.floor((Date.now() - farm.startedAt) / 86400000) + 1;
  // Object.entries provides pairs containing each property name and value.
  // Destructuring, written [id, crop], assigns those two values to separate names.
  // map turns each crop pair into an HTML string, and join combines those strings.
  // aria-hidden hides a decorative emoji from screen readers while aria-label supplies its meaning.
  $('#basket').innerHTML = Object.entries(CROPS).map(([id, crop]) => `<div class="basket-item" title="${crop.name}: ${farm.inventory[id]}"><span aria-hidden="true">${crop.icon}</span><span aria-label="${farm.inventory[id]} ${crop.name}">× ${farm.inventory[id]}</span></div>`).join('');
  const value = basketValue();
  $('#sell-value').textContent = `+${value} ✦`;
  // A disabled button cannot be activated. Disable selling while the basket total is zero.
  $('#sell-all').disabled = value === 0;
  // style.width changes just the progress indicator width, expressed as a percentage.
  // Limit it to 100% even when the player has harvested more than five crops.
  // The text underneath either shows progress toward the reward or celebrates that it was earned.
  $('#goal-progress').style.width = `${Math.min(100, farm.harvested / 5 * 100)}%`;
  $('#goal-text').textContent = farm.rewardClaimed ? 'A growing success!' : 'Harvest your first 5 crops';
  $('#goal-count').textContent = farm.rewardClaimed ? `${farm.harvested} crops harvested · 20 coin reward earned ♡` : `${farm.harvested} / 5 harvested · reward: 20 coins`;
  renderPlots();
}
// CHANGE TOOLS: store the chosen action, update its highlighted button, and show the matching hint.
function setTool(nextTool) {
  tool = nextTool;
  // querySelectorAll finds every matching element. [data-tool] selects buttons with that attribute.
  // dataset reads custom data- attributes from HTML. classList.toggle adds or removes the active class
  // according to a boolean. aria-pressed tells assistive tools which tool is selected.
  // String converts the boolean to the text that the attribute expects.
  document.querySelectorAll('[data-tool]').forEach(button => { const active = button.dataset.tool === tool; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('#tool-hint').innerHTML = { plant: 'Pick a seed, then click<br>an empty patch.', water: 'A little drink for<br>each thirsty seedling.', harvest: 'Look for sparkles,<br>then pick your crops.' }[tool];
}
// FARM ACTIONS: index is the position of the clicked patch. Check the selected tool
// and decide whether to plant, water, or harvest. Early returns show a hint and stop an invalid action.
function actOnPlot(index) {
  const plot = farm.plots[index];
  // PLANT: require an empty patch and enough coins before spending anything.
  // Bracket access, such as CROPS[selectedCrop], looks up a property using a stored name.
  if (tool === 'plant') {
    if (plot) return notify('This patch is already growing something.', true);
    const crop = CROPS[selectedCrop];
    if (farm.coins < crop.cost) return notify('A few more coins needed. Harvest and sell a crop first!');
    // -= subtracts a value from the variable. Pay the seed cost, then replace the empty patch
    // with a crop object whose watering time is null. Growing will begin after watering.
    farm.coins -= crop.cost;
    farm.plots[index] = { crop: selectedCrop, wateredAt: null };
    notify('A little beginning. Give it some water! 💧', true);
  // WATER: require an existing plant that has not already been watered.
  // else if checks another condition only when the earlier condition was false.
  } else if (tool === 'water') {
    if (!plot) return notify('Plant a seed here first. 🌱', true);
    if (plot.wateredAt !== null) return notify(progress(plot) >= 1 ? 'Ready for your basket! 🧺' : 'Happily watered. Give it a little time.', true);
    // Record the watering moment so growth can be computed from real elapsed time later.
    plot.wateredAt = Date.now();
    notify('A little water. A little patience. ♡', true);
  // HARVEST: this final else handles the remaining tool. Do not pick empty or unfinished patches.
  } else {
    if (!plot) return notify('Nothing to harvest here just yet.', true);
    if (progress(plot) < 1) return notify(plot.wateredAt === null ? 'This little one needs water first. 💧' : 'Still growing. Good things take a little time.', true);
    // ++ adds one. Put a crop in the basket and increase the total harvest count,
    // then set the patch back to null so another seed can be planted there.
    farm.inventory[plot.crop]++; farm.harvested++; farm.plots[index] = null;
    notify(`Fresh ${CROPS[plot.crop].name.toLowerCase()} in your basket!`, true);
    // Pay the goal reward only after five harvests and only while rewardClaimed is false.
    // += adds coins; setting the flag to true prevents collecting this bonus again after reloading.
    if (farm.harvested >= 5 && !farm.rewardClaimed) {
      farm.coins += 20; farm.rewardClaimed = true;
      notify('Five lovely harvests! Here’s your 20 coin reward. ✨');
    }
  }
  // After a successful action, play the optional chime, save the changed farm,
  // and redraw its visible information. The earlier invalid-action returns skip this step.
  chime(); saveFarm(); render();
}
// CREATE THE PATCH BUTTONS: a for loop repeats while its condition is true.
// Start i at 0, continue while it is below 12, and add one after each pass.
// This creates one actual button for each of the twelve saved patch positions.
for (let i = 0; i < 12; i++) {
  // createElement makes a new HTML element. type="button" gives it normal button behavior.
  // An event is something that happens, such as a click. addEventListener registers a function
  // to run when that event happens. append puts the new button inside the existing grid.
  // Each click callback remembers its own patch index, so it acts on the right patch.
  const button = document.createElement('button'); button.type = 'button';
  button.addEventListener('click', () => actOnPlot(i)); $('#plots').append(button);
}
// CREATE SEED CHOICES: repeat once per crop settings entry. Display its name, growing time,
// selling value, and seed cost so the player can choose without memorizing the settings.
for (const [id, crop] of Object.entries(CROPS)) {
  const button = document.createElement('button');
  // Use the selected class and aria-pressed value to mark the initial carrot choice
  // both visually and for someone using assistive technology.
  button.className = `seed-option${id === selectedCrop ? ' selected' : ''}`;
  button.setAttribute('aria-pressed', String(id === selectedCrop));
  button.innerHTML = `<span class="seed-icon" aria-hidden="true">${crop.icon}</span><span class="seed-description"><strong>${crop.name}</strong><small>${crop.seconds}s to grow · sells for ${crop.value} ✦</small></span><span class="seed-price">${crop.cost} <span>✦</span></span>`;
  // When a seed button is clicked, remember that crop, highlight only that choice,
  // switch back to planting, and refresh empty-patch labels for the newly selected crop.
  button.addEventListener('click', () => {
    selectedCrop = id;
    document.querySelectorAll('.seed-option').forEach(element => { element.classList.toggle('selected', element === button); element.setAttribute('aria-pressed', String(element === button)); });
    setTool('plant'); renderPlots();
  });
  $('#seed-list').append(button);
}
// WIRE UP THE TOOLS: give each tool button a click handler, a function responding to the click.
// Read its data-tool label and select the matching action.
document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
// SELL THE BASKET: if there is a harvest, add its total value to the coins,
// clear every basket quantity, save, refresh the screen, and confirm the sale.
$('#sell-all').addEventListener('click', () => {
  const value = basketValue(); if (!value) return;
  farm.coins += value;
  for (const id of Object.keys(CROPS)) farm.inventory[id] = 0;
  saveFarm(); render(); chime(); notify(`Your neighbors loved it! +${value} coins. ♡`);
});
// CHICKEN GREETING: clicking the decorative chicken shows a friendly message without changing the farm.
$('#chicken').addEventListener('click', () => notify('Cluck! You’re doing egg-cellent. 🐓', true));
// SOUND SWITCH: ! flips the on/off boolean. Update both the visible label and aria-pressed
// so they match the new setting, then play a sample chime if sound is enabled.
$('#sound-toggle').addEventListener('click', () => {
  sound = !sound; $('#sound-toggle').textContent = sound ? '♫ Sound on' : '♫ Sound off';
  $('#sound-toggle').setAttribute('aria-pressed', String(sound)); chime();
});
// HELP PANEL: showModal opens the built-in dialog, a popup that temporarily keeps focus inside
// its instructions. The close and start buttons both close that popup without resetting the game.
$('#help-open').addEventListener('click', () => $('#help-dialog').showModal());
for (const id of ['#help-close', '#start-growing']) $(id).addEventListener('click', () => $('#help-dialog').close());
// KEYBOARD SHORTCUTS: keydown happens when a key is pressed. The event object
// contains details such as which key and modifier keys, like Ctrl or Alt, were pressed.
document.addEventListener('keydown', event => {
  // Skip shortcuts while the help panel is open, while modifier keys are held, or while typing
  // in an input, text area, or selection control. A regular expression is a text-matching pattern;
  // /INPUT|TEXTAREA|SELECT/ matches any of these three HTML tag names.
  if ($('#help-dialog').open || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  // Translate keys 1, 2, and 3 into tool names. Other keys do not select a tool.
  const next = { '1': 'plant', '2': 'water', '3': 'harvest' }[event.key]; if (next) setTool(next);
});
// NAVIGATION: clicking My farm or Farm stand changes the highlighted navigation button
// and brings the existing farm or basket card into view. It does not load a separate page.
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  // aria-current identifies the current navigation choice for assistive tools.
  document.querySelectorAll('[data-view]').forEach(element => { const active = element === button; element.classList.toggle('active', active); element.setAttribute('aria-current', active ? 'page' : 'false'); });
  const target = button.dataset.view === 'market' ? $('.basket-card') : $('.farm-panel');
  // scrollIntoView moves the visible page to an element. matchMedia checks a browser preference
  // or screen condition. Respect prefers-reduced-motion, the setting asking sites to avoid
  // unnecessary animation, by scrolling instantly rather than smoothly when requested.
  target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  if (button.dataset.view === 'market') {
    // Restart the market highlight animation by removing its class, reading offsetWidth, then adding it.
    // offsetWidth is the measured element width; reading it makes the browser process the previous
    // layout change. void discards that read result, because it is only needed to trigger the update.
    target.classList.remove('market-highlight'); void target.offsetWidth; target.classList.add('market-highlight');
    notify('Your neighborhood farm stand · sell your fresh harvest here.');
  }
}));
// Refresh crop timers without moving keyboard focus; timestamps also work offline.
// setInterval repeatedly calls a function at the given delay; 1,000 milliseconds means once a second.
// Only the existing patch contents are refreshed, so keyboard focus stays in place.
setInterval(renderPlots, 1000);
// visibilitychange fires when the page becomes hidden or visible, such as when switching tabs.
// When it is visible again, redraw to show elapsed growth and the current day.
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
// START THE GAME: select the starting tool, draw the loaded farm, and save it.
// This runs after all buttons and event handlers have been created.
setTool('plant'); render(); saveFarm();
