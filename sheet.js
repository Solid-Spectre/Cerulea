// Heroes of Cerulea — Hero Sheet
// Persists one hero per player via OBR player metadata.
// Falls back to localStorage when opened outside Owlbear (e.g. for testing).
//
// The Owlbear SDK is imported dynamically so that a CDN failure (or running
// the file outside Owlbear) degrades gracefully into local-save mode instead
// of taking the whole sheet down.

let OBR = null;

const META_KEY = "rodeo.cerulea.heroSheet/v1";
const ROLL_CHANNEL = "rodeo.cerulea.heroSheet/roll";
const DICE_PLUS_SOURCE = "rodeo.cerulea.heroSheet";
const ATTRS = ["might", "bravery", "insight"];

// Action reference, with blurbs drawn from the rulebook (p.6-7).
const ACTIONS = [
  { name: "ATTACK",   attr: "MIGHT",   text: "Strike a monster or destroy an object. In melee combat this is dangerous unless the monster is STUNNED." },
  { name: "DEFEND",   attr: "BRAVERY", text: "Dodge an attack or avoid a trap. On a successful DEFEND you don't lose any HEARTS." },
  { name: "USE ITEM", attr: null,      text: "Apply a special item or eat something." },
  { name: "INSPECT",  attr: "INSIGHT", text: "Take a closer look or try to find something hidden." },
  { name: "ESCAPE",   attr: null,      text: "Run away from combat or break free." },
  { name: "TALK",     attr: null,      text: "Chat with a friendly inhabitant." },
  { name: "OTHER",    attr: null,      text: "Any action that doesn't fit into the categories above." },
];
const COUNTERS = [
  { key: "gems",      label: "Gems",      icon: "◆", max: 999 },
  { key: "keys",      label: "Keys",      icon: "⚷", max: 9 },
  { key: "snacks",    label: "Snacks",    icon: "🍎", max: 9 },
  { key: "meals",     label: "Meals",     icon: "🍖", max: 9 },
  { key: "fragments", label: "Trinity",   icon: "△", max: 3 },
  { key: "bombs",     label: "Bombs",     icon: "💣", max: 9 },
];

// --- Default hero, per the rulebook's starting hero (p.12) ---
function defaultState() {
  return {
    hero: "", player: "", kin: "", special: "", hair: "", clothes: "",
    might: 1, bravery: 1, insight: 1,
    maxHearts: 3, lostHearts: 0,
    maxEnergy: 3, lostEnergy: 0,
    gems: 15, keys: 0, snacks: 0, meals: 0, fragments: 0, bombs: 0,
    largePouch: false,
    inventory: ["", "", "", "", "", "", "", ""],
  };
}

let state = defaultState();
let ready = false;            // true once OBR is connected (or fallback chosen)
let usingOBR = false;
let suppressSave = false;     // avoid echo-saving while applying remote changes
let saveTimer = null;

const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");

function setStatus(text, cls = "") {
  statusEl.textContent = text;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

// ---------- Persistence ----------
function scheduleSave() {
  if (suppressSave) return;
  setStatus("Saving…", "saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

async function save() {
  try {
    if (usingOBR) {
      await OBR.player.setMetadata({ [META_KEY]: state });
    } else {
      localStorage.setItem(META_KEY, JSON.stringify(state));
    }
    setStatus(usingOBR ? "Saved to your player profile" : "Saved locally");
  } catch (err) {
    console.error(err);
    setStatus("Couldn't save — try again", "error");
  }
}

function applyLoaded(loaded) {
  if (loaded && typeof loaded === "object") {
    state = Object.assign(defaultState(), loaded);
    // ensure inventory always 8 long
    const inv = Array.isArray(state.inventory) ? state.inventory.slice(0, 8) : [];
    while (inv.length < 8) inv.push("");
    state.inventory = inv;
  }
}

// ---------- Rendering ----------
function renderFields() {
  document.querySelectorAll("[data-field]").forEach((el) => {
    const f = el.dataset.field;
    if (el.type === "checkbox") el.checked = !!state[f];
    else el.value = state[f] ?? "";
  });
}

function heartSVG(filled) {
  const fill = filled ? "var(--heart)" : "none";
  const stroke = filled ? "var(--heart)" : "var(--lost)";
  return `<svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 14 L2 7.5 C0.5 6 1 3 3.5 3 C5 3 6 4 8 6 C10 4 11 3 12.5 3 C15 3 15.5 6 14 7.5 Z"
      fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
    ${!filled ? '<path d="M3 4 L13 13" stroke="var(--lost)" stroke-width="1.2"/>' : ""}
  </svg>`;
}

function energySVG(filled) {
  const fill = filled ? "var(--energy)" : "none";
  const stroke = filled ? "var(--energy)" : "var(--lost)";
  return `<svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9 1 L3 9 L7 9 L6 15 L13 6 L9 6 Z"
      fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/>
    ${!filled ? '<path d="M3 3 L13 13" stroke="var(--lost)" stroke-width="1.2"/>' : ""}
  </svg>`;
}

function renderAttrs() {
  const wrap = $("#attrs");
  wrap.innerHTML = "";
  ATTRS.forEach((a) => {
    const div = document.createElement("div");
    div.className = "attr";
    div.innerHTML = `
      <div class="name">${a.toUpperCase()}</div>
      <div class="ctl">
        <button class="step" data-attr="${a}" data-dir="-1" aria-label="Decrease ${a}">–</button>
        <span class="val">${state[a]}</span>
        <button class="step" data-attr="${a}" data-dir="1" aria-label="Increase ${a}">+</button>
      </div>
      <button class="roll-btn" data-roll="${a}" aria-label="Roll ${a}">ROLL</button>`;
    wrap.appendChild(div);
  });
}

function renderTracker(id, label, maxKey, lostKey, svgFn) {
  const max = state[maxKey];
  const lost = Math.min(state[lostKey], max);
  const remaining = max - lost;
  const el = $(id);
  let pips = "";
  for (let i = 0; i < max; i++) {
    const filled = i < remaining;
    pips += `<button class="pip" data-track="${lostKey}" data-index="${i}"
      aria-label="${label} ${i + 1} ${filled ? "(full)" : "(spent)"}">${svgFn(filled)}</button>`;
  }
  el.innerHTML = `
    <div class="tracker-head">
      <span class="lbl">${label} &nbsp;${remaining}/${max}</span>
      <span class="maxctl">
        max
        <button data-maxadj="${maxKey}" data-dir="-1" aria-label="Decrease max ${label}">–</button>
        <button data-maxadj="${maxKey}" data-dir="1" aria-label="Increase max ${label}">+</button>
      </span>
    </div>
    <div class="pips">${pips}</div>`;
}

function renderCounters() {
  const wrap = $("#counters");
  wrap.innerHTML = "";
  COUNTERS.forEach((c) => {
    const div = document.createElement("div");
    div.className = "counter";
    div.innerHTML = `
      <span class="clabel"><span class="pin">${c.icon}</span>${c.label}</span>
      <span class="cval">
        <input type="number" min="0" max="${c.max}" data-counter="${c.key}" value="${state[c.key]}" />
      </span>`;
    wrap.appendChild(div);
  });
}

function renderSlots() {
  const wrap = $("#slots");
  const limit = state.largePouch ? 8 : 4;
  wrap.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const locked = i >= limit;
    const div = document.createElement("div");
    div.className = "slot" + (locked ? " locked" : "");
    div.innerHTML = `
      <span class="num">${i + 1}</span>
      <input type="text" data-slot="${i}" value="${escapeAttr(state.inventory[i] || "")}"
        placeholder="${locked ? "locked" : "item"}" ${locked ? "disabled" : ""} />`;
    wrap.appendChild(div);
  }
}

function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

function renderActions() {
  const wrap = $("#actions");
  if (!wrap) return;
  wrap.innerHTML = "";
  ACTIONS.forEach((a, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-chip";
    btn.dataset.action = String(i);
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = a.name;
    wrap.appendChild(btn);
  });
}

// ---------- Dice rolling ----------
// Heroes of Cerulea uses only D4s. Roll dice equal to the attribute value;
// only the highest single die counts. With 0D or fewer, roll 2D and take the
// LOWEST. Outcome: 1-2 fail, 3 success, 4 success, extra 4s = extra-success.
function d4() { return 1 + Math.floor(Math.random() * 4); }

function rollAttribute(attr) {
  const value = state[attr] | 0;
  let dice;
  let usedLowest = false;
  if (value >= 1) {
    dice = Array.from({ length: value }, d4);
  } else {
    // 0D or fewer: roll 2D, use the lowest
    dice = [d4(), d4()];
    usedLowest = true;
  }
  return buildRollResult(attr, value, dice, usedLowest);
}

// Shared outcome logic, used by both the internal roller and Dice+ results.
function buildRollResult(attr, value, dice, usedLowest) {
  const counted = usedLowest ? Math.min(...dice) : Math.max(...dice);
  const fours = dice.filter((d) => d === 4).length;

  let outcome;
  if (counted <= 2) outcome = "Failed";
  else if (counted === 3) outcome = "Success";
  else outcome = fours > 1 ? `Extra success (×${fours})` : "Success";

  return { attr, value, dice, counted, usedLowest, outcome };
}

function formatRoll(r) {
  const hero = (state.hero || "Hero").trim() || "Hero";
  const name = r.attr.toUpperCase();
  const diceStr = r.dice.join(", ");
  const pick = r.usedLowest ? "lowest" : "highest";
  return `${hero} rolled ${name} (${r.usedLowest ? "0D→2D" : r.value + "D"}): [${diceStr}] → ${pick} ${r.counted} · ${r.outcome}`;
}

const ROLL_LOG_MAX = 6;
const rollLog = [];
const pendingRolls = new Map(); // rollId -> { attr, value, usedLowest }
let dicePlusReady = false;

function pushRoll(line, mine) {
  rollLog.unshift({ line, mine, t: Date.now() });
  if (rollLog.length > ROLL_LOG_MAX) rollLog.length = ROLL_LOG_MAX;
  renderRollFeed();
}

function clearRolls() {
  rollLog.length = 0;
  renderRollFeed();
}

function renderRollFeed() {
  const feed = $("#roll-feed");
  if (!feed) return;
  if (rollLog.length === 0) { feed.hidden = true; feed.innerHTML = ""; }
  else {
    feed.hidden = false;
    feed.innerHTML = rollLog
      .map((e) => `<div class="roll-line${e.mine ? " mine" : ""}">${escapeHtml(e.line)}</div>`)
      .join("");
  }
  const clr = $("#clear-rolls");
  if (clr) clr.hidden = rollLog.length === 0;
  const head = $(".roll-head");
  if (head) head.hidden = rollLog.length === 0;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Finish a roll: log it locally and broadcast to other Hero Sheets.
function finishRoll(r) {
  const line = formatRoll(r);
  pushRoll(line, true);
  if (usingOBR && OBR && OBR.broadcast) {
    try {
      OBR.broadcast.sendMessage(ROLL_CHANNEL, { line }, { destination: "ALL" });
    } catch (err) {
      console.error("Roll broadcast failed", err);
    }
  }
}

function doRoll(attr) {
  const value = state[attr] | 0;
  const usedLowest = value < 1;
  const count = usedLowest ? 2 : value;
  const keep = usedLowest ? "kl1" : "kh1"; // keep lowest (0D) or highest
  const notation = `${count}d4${keep}`;

  // Try Dice+ whenever we're in a room. We don't gate on the ready-check
  // (extension load order races make it unreliable); instead we send the
  // request and rely on the 4s fallback if Dice+ isn't actually present.
  if (usingOBR && OBR && OBR.broadcast && OBR.player) {
    const rollId = `cerulea_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    pendingRolls.set(rollId, { attr, value, usedLowest });
    Promise.all([OBR.player.getId(), OBR.player.getName()])
      .then(([playerId, playerName]) => {
        const payload = {
          rollId,
          playerId,
          playerName: (state.hero || playerName || "Hero"),
          rollTarget: "everyone",
          diceNotation: notation,
          showResults: true, // let Dice+ show its own 3D popup too
          timestamp: Date.now(),
          source: DICE_PLUS_SOURCE,
        };
        console.log("[Cerulea] sending dice-plus/roll-request", payload);
        OBR.broadcast.sendMessage("dice-plus/roll-request", payload, { destination: "ALL" });
      })
      .catch((err) => {
        console.error("[Cerulea] Dice+ request failed, rolling locally", err);
        pendingRolls.delete(rollId);
        finishRoll(rollAttribute(attr));
      });
    // Safety: if Dice+ never answers, fall back after 4s.
    setTimeout(() => {
      if (pendingRolls.has(rollId)) {
        console.warn("[Cerulea] Dice+ did not reply in 4s — falling back to internal roll", rollId);
        pendingRolls.delete(rollId);
        finishRoll(rollAttribute(attr));
      }
    }, 4000);
    return;
  }

  // No Dice+ — use the internal roller.
  finishRoll(rollAttribute(attr));
}

function renderAll() {
  suppressSave = true;
  renderFields();
  renderAttrs();
  renderTracker("#hearts-tracker", "Hearts", "maxHearts", "lostHearts", heartSVG);
  renderTracker("#energy-tracker", "Energy", "maxEnergy", "lostEnergy", energySVG);
  renderCounters();
  renderSlots();
  renderActions();
  suppressSave = false;
}

// ---------- Events ----------
// Text/select/checkbox identity fields
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.field) {
    state[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.field === "largePouch") renderSlots();
    scheduleSave();
  }
  if (el.dataset.counter) {
    let v = parseInt(el.value, 10);
    if (Number.isNaN(v)) v = 0;
    state[el.dataset.counter] = Math.max(0, v);
    scheduleSave();
  }
  if (el.dataset.slot !== undefined && el.dataset.slot !== "") {
    state.inventory[+el.dataset.slot] = el.value;
    scheduleSave();
  }
});

// Buttons: attribute steppers, pip toggles, max adjusters
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  if (btn.dataset.roll) {
    doRoll(btn.dataset.roll);
    return;
  }

  if (btn.dataset.action !== undefined) {
    const idx = +btn.dataset.action;
    const a = ACTIONS[idx];
    const blurb = $("#action-blurb");
    const wrap = $("#actions");
    const wasActive = btn.classList.contains("active");
    wrap.querySelectorAll(".action-chip").forEach((c) => {
      c.classList.remove("active");
      c.setAttribute("aria-expanded", "false");
    });
    if (wasActive) {
      blurb.hidden = true;
      blurb.innerHTML = "";
    } else {
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
      const tag = a.attr ? `<span class="blurb-attr">${a.attr}</span>` : "";
      blurb.innerHTML = `<span class="blurb-name">${a.name}</span>${tag}<span class="blurb-text">${a.text}</span>`;
      blurb.hidden = false;
    }
    return;
  }

  if (btn.dataset.attr) {
    const a = btn.dataset.attr;
    const next = state[a] + (+btn.dataset.dir);
    state[a] = Math.max(-1, Math.min(6, next));
    renderAttrs();
    scheduleSave();
    return;
  }

  if (btn.dataset.track !== undefined) {
    const key = btn.dataset.track;          // lostHearts / lostEnergy
    const idx = +btn.dataset.index;          // 0 = leftmost
    const maxKey = key === "lostHearts" ? "maxHearts" : "maxEnergy";
    const max = state[maxKey];
    // pip i is filled when i < remaining. Clicking sets spent so that this pip flips.
    const remaining = max - Math.min(state[key], max);
    if (idx < remaining) {
      // currently full -> spend down to this pip
      state[key] = max - idx;
    } else {
      // currently spent -> restore up to and including this pip
      state[key] = max - (idx + 1);
    }
    state[key] = Math.max(0, Math.min(max, state[key]));
    renderTracker(
      key === "lostHearts" ? "#hearts-tracker" : "#energy-tracker",
      key === "lostHearts" ? "Hearts" : "Energy",
      maxKey, key,
      key === "lostHearts" ? heartSVG : energySVG
    );
    scheduleSave();
    return;
  }

  if (btn.dataset.maxadj) {
    const maxKey = btn.dataset.maxadj;
    const lostKey = maxKey === "maxHearts" ? "lostHearts" : "lostEnergy";
    state[maxKey] = Math.max(1, Math.min(12, state[maxKey] + (+btn.dataset.dir)));
    state[lostKey] = Math.min(state[lostKey], state[maxKey]);
    renderTracker(
      maxKey === "maxHearts" ? "#hearts-tracker" : "#energy-tracker",
      maxKey === "maxHearts" ? "Hearts" : "Energy",
      maxKey, lostKey,
      maxKey === "maxHearts" ? heartSVG : energySVG
    );
    scheduleSave();
    return;
  }
});

$("#resetBtn").addEventListener("click", () => {
  if (!confirm("Start a new hero? This clears the current sheet.")) return;
  state = defaultState();
  renderAll();
  save();
});

const clearRollsBtn = $("#clear-rolls");
if (clearRollsBtn) clearRollsBtn.addEventListener("click", clearRolls);

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (state.hero || "cerulea-hero").replace(/\s+/g, "_") + ".json";
  a.click();
  URL.revokeObjectURL(url);
});

// ---------- Startup ----------
function startLocalFallback(reason) {
  usingOBR = false;
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) applyLoaded(JSON.parse(raw));
  } catch (_) {}
  ready = true;
  renderAll();
  setStatus(reason || "Offline mode — saved in this browser");
  $("#hint").textContent = "Open inside an Owlbear room to sync to your player profile.";
}

function startWithOBR() {
  usingOBR = true;
  ready = true;
  OBR.player.getMetadata().then((meta) => {
    if (meta && meta[META_KEY]) applyLoaded(meta[META_KEY]);
    renderAll();
    setStatus("Saved to your player profile");
  });

  // React to remote changes (e.g. same sheet open on another device)
  OBR.player.onChange((player) => {
    const incoming = player.metadata && player.metadata[META_KEY];
    if (!incoming) return;
    if (saveTimer) return; // don't clobber a pending local edit mid-save
    suppressSave = true;
    applyLoaded(incoming);
    renderAll();
    suppressSave = false;
  });

  // Listen for dice rolls broadcast by other players in the room.
  if (OBR.broadcast && OBR.broadcast.onMessage) {
    try {
      OBR.broadcast.onMessage(ROLL_CHANNEL, (event) => {
        const data = event && event.data;
        if (data && typeof data.line === "string") pushRoll(data.line, false);
      });
    } catch (err) {
      console.error("Roll listener failed", err);
    }

    // Detect Dice+ and listen for its results on our dedicated channel.
    try {
      OBR.broadcast.onMessage("dice-plus/isReady", (event) => {
        const d = event && event.data;
        if (d && d.ready === true) { dicePlusReady = true; console.log("[Cerulea] Dice+ confirmed ready"); }
      });
      OBR.broadcast.onMessage(`${DICE_PLUS_SOURCE}/roll-result`, (event) => {
        const res = event && event.data;
        console.log("[Cerulea] roll-result received", res);
        if (!res || !res.rollId) return;
        const pending = pendingRolls.get(res.rollId);
        if (!pending) return; // not ours (another player's roll)
        pendingRolls.delete(res.rollId);
        // Pull every d4 face from the result groups (kept and dropped).
        let dice = [];
        const groups = res.result && res.result.groups;
        if (Array.isArray(groups)) {
          groups.forEach((g) => {
            if (g && Array.isArray(g.dice)) {
              g.dice.forEach((die) => { if (typeof die.value === "number") dice.push(die.value); });
            }
          });
        }
        if (dice.length === 0) dice = rollAttribute(pending.attr).dice; // safety
        finishRoll(buildRollResult(pending.attr, pending.value, dice, pending.usedLowest));
      });
      OBR.broadcast.onMessage(`${DICE_PLUS_SOURCE}/roll-error`, (event) => {
        const err = event && event.data;
        if (!err || !err.rollId) return;
        const pending = pendingRolls.get(err.rollId);
        if (!pending) return;
        pendingRolls.delete(err.rollId);
        finishRoll(rollAttribute(pending.attr)); // fall back locally
      });
      // Ask Dice+ if it's there. Retry a few times since extension load
      // order isn't guaranteed — Dice+ may boot after we do.
      let readyTries = 0;
      const askReady = () => {
        if (dicePlusReady || readyTries >= 5) return;
        readyTries++;
        OBR.broadcast.sendMessage("dice-plus/isReady", {
          requestId: `cerulea_${Date.now()}_${readyTries}`,
          timestamp: Date.now(),
        }, { destination: "ALL" });
        setTimeout(askReady, 800);
      };
      askReady();
    } catch (err) {
      console.error("Dice+ integration setup failed", err);
    }
  }
}

// Render immediately so the sheet is usable even before/without Owlbear,
// then try to connect to OBR and upgrade to synced saving.
let started = false;
renderAll();
setStatus("Connecting…");

async function boot() {
  let mod = null;
  try {
    // Load the Owlbear SDK from our own domain. We can't use a CDN like
    // esm.sh because Owlbear serves the popover under a Content Security
    // Policy that only allows scripts from 'self', so the SDK is vendored
    // alongside this file as obr-sdk.js.
    mod = await import("./obr-sdk.js");
  } catch (_) {
    // CDN blocked or offline — stay local.
    if (!started) { started = true; startLocalFallback(); }
    return;
  }

  OBR = mod.default || mod.OBR || mod;

  // OBR.isAvailable is true (synchronously) when we're embedded in an Owlbear
  // iframe. If it's false, we're genuinely standalone — go local immediately.
  let available = false;
  try { available = !!OBR.isAvailable; } catch (_) { available = false; }

  if (!available) {
    if (!started) { started = true; startLocalFallback(); }
    return;
  }

  // We're inside Owlbear. Wait for onReady — give it a generous window, since
  // the SDK + several extensions may take a moment to come up. Only fall back
  // if onReady genuinely never fires.
  const fallbackTimer = setTimeout(() => {
    if (!started) { started = true; startLocalFallback("Couldn't reach Owlbear — saved in this browser"); }
  }, 8000);

  try {
    OBR.onReady(() => {
      if (started) return;
      started = true;
      clearTimeout(fallbackTimer);
      startWithOBR();
    });
  } catch (_) {
    clearTimeout(fallbackTimer);
    if (!started) { started = true; startLocalFallback(); }
  }
}

boot();
