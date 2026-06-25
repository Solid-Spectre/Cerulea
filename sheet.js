// Heroes of Cerulea — Hero Sheet
// Persists one hero per player via OBR player metadata.
// Falls back to localStorage when opened outside Owlbear (e.g. for testing).
//
// The Owlbear SDK is imported dynamically so that a CDN failure (or running
// the file outside Owlbear) degrades gracefully into local-save mode instead
// of taking the whole sheet down.

let OBR = null;

const META_KEY = "rodeo.cerulea.heroSheet/v1";
const ATTRS = ["might", "bravery", "insight"];
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
      </div>`;
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

function renderAll() {
  suppressSave = true;
  renderFields();
  renderAttrs();
  renderTracker("#hearts-tracker", "Hearts", "maxHearts", "lostHearts", heartSVG);
  renderTracker("#energy-tracker", "Energy", "maxEnergy", "lostEnergy", energySVG);
  renderCounters();
  renderSlots();
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
}

// Render immediately so the sheet is usable even before/without Owlbear,
// then try to connect to OBR and upgrade to synced saving.
let started = false;
renderAll();
setStatus("Connecting…");

async function boot() {
  let mod = null;
  try {
    mod = await import("https://esm.sh/@owlbear-rodeo/sdk@3");
  } catch (_) {
    // CDN blocked or offline — stay local.
    if (!started) { started = true; startLocalFallback(); }
    return;
  }

  OBR = mod.default || mod.OBR || mod;

  // OBR.isReady is true only inside an Owlbear iframe. If we never become
  // ready within a short window, fall back to local saving.
  const fallbackTimer = setTimeout(() => {
    if (!started) { started = true; startLocalFallback(); }
  }, 1500);

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
