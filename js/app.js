// app.js — health log ui. vanilla js, no build step.
//
// vocab here must match the Lists tab in the sheet exactly, so the rows this
// app writes line up with the chat-logged rows and the dashboard formulas.

// ---------- vocab (Lists tab) ----------
const MOODS = ["Great", "Fine", "Meh", "Rough", "Bad"];
const SEVERITIES = ["Background noise", "Bugging me", "Getting in the way", "Shut me down"];
const BODY_PARTS = ["Head", "Jaw/face", "Neck", "Shoulders", "Upper back", "Lower back", "Chest", "Stomach/abdomen", "Arms", "Elbows", "Hands/wrists", "Hips", "Thighs", "Knees", "Lower legs", "Ankles/feet", "Whole body", "Throat", "Anus/rectal", "Vaginal", "Back (general)", "Glutes", "Waist"];
const PAIN_TYPES = ["Sharp", "Stabbing", "Dull ache", "Throbbing/pulsing", "Burning", "Pressure/tightness", "Cramping", "Tingling/numbness", "Soreness/stiffness"];
const CONCUSSION = ["Headache", "Dizziness/lightheaded", "Nausea", "Light sensitivity", "Noise sensitivity", "Brain fog", "Trouble concentrating", "Fatigue", "Blurred vision", "Balance issues", "Ringing in ears", "Memory gaps"];
const DEPRESSION = ["Low motivation", "Hopelessness", "Crying spells", "Loss of interest", "Worthlessness/guilt", "Appetite change", "Irritability"];
const ANXIETY = ["Racing thoughts", "Physical tension", "Panic", "Worry", "Chest tightness", "Feeling on edge"];
const RESTLESSNESS = ["None", "Mild", "Moderate", "Severe"];
const LIBIDO = ["Low", "Normal", "High"];
const SLEEP_QUALITY = ["Good", "Okay", "Bad"];
const FLOW = ["Spotting", "Light", "Medium", "Heavy"];
const PEE_COLORS = ["Pale yellow", "Light yellow", "Dark yellow", "Amber", "Clear"];
const POOP_COLORS = ["Brown", "Green"];
const BRISTOL = ["1", "2", "3", "4", "5", "6", "7"];
const MEDS = ["Abilify", "buspirone"];
const TAMPONS = ["light", "regular", "super", "super+", "ultra"];
const TODAY_TABS = ["Mood Log", "Pain Log", "Food Log", "Vitals", "Period Log"];

// meds target: 7pm. a dose before 7pm reads early, 7–8pm on time, 8pm+ late.
// there is no "missed" state, ever — if it's not logged, it's just not logged.
const MEDS_TARGET_HOUR = 19;

// ---------- tiny helpers ----------
function $(id) { return document.getElementById(id); }
function pad(n) { return String(n).padStart(2, "0"); }

function toLocalInput(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function toDateInput(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
}

// ---------- chip groups ----------
// returns {get(), first(), has(), clear()}. single-select groups keep one pick.
function chipGroup(el, items, multi, extraClass) {
  const sel = new Set();
  items.forEach(function (item) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (extraClass ? " " + extraClass(item) : "");
    b.textContent = item;
    b.addEventListener("click", function () {
      if (sel.has(item)) {
        sel.delete(item);
        b.classList.remove("on");
      } else {
        if (!multi) {
          sel.clear();
          el.querySelectorAll(".chip.on").forEach(function (c) { c.classList.remove("on"); });
        }
        sel.add(item);
        b.classList.add("on");
      }
      refreshUI();
    });
    el.appendChild(b);
  });
  return {
    get: function () { return Array.from(sel); },
    first: function () { const a = Array.from(sel); return a.length ? a[0] : null; },
    has: function () { return sel.size > 0; },
    clear: function () {
      sel.clear();
      el.querySelectorAll(".chip.on").forEach(function (c) { c.classList.remove("on"); });
    },
  };
}

const moodG = chipGroup($("mood-btns"), MOODS, false, function (m) { return ""; });
$("mood-btns").querySelectorAll(".chip").forEach(function (c, i) { c.dataset.mood = MOODS[i]; });
const depG = chipGroup($("dep-chips"), DEPRESSION, true);
const anxG = chipGroup($("anx-chips"), ANXIETY, true);
const restG = chipGroup($("restless-chips"), RESTLESSNESS, false);
const libG = chipGroup($("libido-chips"), LIBIDO, false);
const bodyG = chipGroup($("body-chips"), BODY_PARTS, true);
const typeG = chipGroup($("type-chips"), PAIN_TYPES, true);
const sevG = chipGroup($("severity-btns"), SEVERITIES, false);
$("severity-btns").querySelectorAll(".chip").forEach(function (c, i) { c.dataset.severity = SEVERITIES[i]; });
const concG = chipGroup($("concussion-chips"), CONCUSSION, true);
const medsG = chipGroup($("meds-chips"), MEDS, true);
const PEE_CLASSES = { "Pale yellow": "pee-pale", "Light yellow": "pee-light", "Dark yellow": "pee-dark", "Amber": "pee-amber", "Clear": "danger" };
const peeG = chipGroup($("pee-chips"), PEE_COLORS, false, function (c) { return PEE_CLASSES[c] || ""; });
const POOP_CLASSES = { "Brown": "poop-brown", "Green": "poop-green" };
const poopG = chipGroup($("poop-chips"), POOP_COLORS, true, function (c) { return POOP_CLASSES[c] || ""; });
const bristolG = chipGroup($("bristol-btns"), BRISTOL, true);
const sleepQG = chipGroup($("sleep-quality"), SLEEP_QUALITY, false);
$("sleep-quality").querySelectorAll(".chip").forEach(function (c, i) { c.dataset.sleep = SLEEP_QUALITY[i]; });
const flowG = chipGroup($("flow-btns"), FLOW, false);
$("flow-btns").querySelectorAll(".chip").forEach(function (c, i) { c.dataset.flow = FLOW[i]; });
const TAMPON_CLASSES = { "light": "tamp-light", "regular": "tamp-regular", "super": "tamp-super", "super+": "tamp-superplus", "ultra": "tamp-ultra" };
const tamponG = chipGroup($("tampon-btns"), TAMPONS, false, function (t) { return TAMPON_CLASSES[t] || ""; });

// blood is its own toggle (not part of a group)
let bloodPicked = false;
$("blood-toggle").addEventListener("click", function () {
  bloodPicked = !bloodPicked;
  $("blood-toggle").classList.toggle("on", bloodPicked);
  refreshUI();
});

// ---------- collapsible sections ----------
document.querySelectorAll(".collapsible").forEach(function (sec) {
  const head = sec.querySelector(".section-head");
  const chev = head.querySelector(".chevron");
  head.addEventListener("click", function () {
    const open = sec.classList.toggle("open");
    chev.textContent = open ? "–" : "+";
    if (open && sec.dataset.section === "today") loadToday();
  });
});

// ---------- "when" datetime ----------
// follows the clock (30s tick, and when the tab comes back) until she picks
// a time herself; the "now" button resets it and clears the manual flag.
const whenInput = $("when");
let whenEdited = false;
function setWhenNow() { whenInput.value = toLocalInput(new Date()); }
setWhenNow();
setInterval(function () { if (!whenEdited && !document.hidden) { setWhenNow(); refreshUI(); } }, 30000);
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && !whenEdited) { setWhenNow(); refreshUI(); }
});
whenInput.addEventListener("change", function () { whenEdited = true; refreshUI(); });
$("now-btn").addEventListener("click", function () { whenEdited = false; setWhenNow(); refreshUI(); });

function getWhen() {
  return whenInput.value || toLocalInput(new Date());
}

// sleep night defaults to today
$("sleep-date").value = toDateInput(new Date());
$("period-date").value = toDateInput(new Date());

// ---------- queue indicator ----------
function updateQueueIndicator() {
  const n = loadQueue().length;
  $("queue-count").textContent = n;
  $("queue-indicator").hidden = n === 0;
}

// ---------- meds status ----------
function medsMarker(dateStr) {
  const d = new Date(dateStr);
  const h = d.getHours();
  if (h < MEDS_TARGET_HOUR) return "early";
  if (h < MEDS_TARGET_HOUR + 1) return "on time";
  return "late";
}
function updateMedsStatus() {
  $("meds-status").textContent =
    fmtTime(new Date(getWhen())) + " — " + medsMarker(getWhen()) +
    " (target 7pm). no missed button here, ever.";
}

// ---------- br submit button ----------
// names whatever's picked: "log pee + poop + blood". disabled until something is.
function updateBrButton() {
  const parts = [];
  if (peeG.has()) parts.push("pee");
  if (poopG.has() || bristolG.has()) parts.push("poop");
  if (bloodPicked) parts.push("blood");
  const btn = $("br-submit");
  btn.textContent = parts.length ? "log " + parts.join(" + ") : "log br";
  btn.disabled = parts.length === 0;
}

// ---------- vitals pairing ----------
// heart rate can be logged alone; systolic and diastolic must go together.
function updateVitals() {
  const sys = $("sys").value.trim();
  const dia = $("dia").value.trim();
  const hr = $("hr").value.trim();
  const split = (sys === "") !== (dia === "");
  $("vitals-hint").hidden = !split;
  $("vitals-submit").disabled = split || (sys === "" && dia === "" && hr === "");
}
["sys", "dia", "hr"].forEach(function (id) {
  $(id).addEventListener("input", updateVitals);
});

// ---------- refresh all derived ui ----------
function refreshUI() {
  updateMedsStatus();
  updateBrButton();
  updateVitals();
  $("mood-submit").disabled = !moodG.has();
  $("pain-submit").disabled = !sevG.has();
  $("meds-submit").disabled = !medsG.has();
  $("sleep-submit").disabled = !$("sleep-date").value;
  $("period-submit").disabled = !flowG.has() || !$("period-date").value;
  $("food-submit").disabled = !$("food-name").value.trim();
}
$("food-name").addEventListener("input", refreshUI);
$("sleep-date").addEventListener("change", refreshUI);
$("period-date").addEventListener("change", refreshUI);
$("meal-select").addEventListener("change", refreshUI);

// ---------- submit plumbing ----------
async function submitLog(tab, values, label, done) {
  try {
    await logEntry(tab, values, label);
    toast("logged :)");
  } catch (err) {
    if (err.message === "queued") {
      toast("saved — will sync when you're back online :)");
    } else if (err.message === "not-configured") {
      showSetup();
      return;
    } else {
      toast("hmm, that didn't save — try again?");
      return;
    }
  }
  if (done) done();
  refreshUI();
  loadToday();
}

function numOrBlank(v) {
  v = (v || "").trim();
  return v === "" ? "" : parseFloat(v);
}

// ---------- mood ----------
$("mood-submit").addEventListener("click", function () {
  const row = [
    getWhen(),
    moodG.first(),
    depG.get().join(", "),
    anxG.get().join(", "),
    restG.first() || "",
    libG.first() || "",
    "",
    $("mood-notes").value.trim(),
  ];
  submitLog("Mood Log", row, "mood: " + moodG.first(), function () {
    moodG.clear(); depG.clear(); anxG.clear(); restG.clear(); libG.clear();
    $("mood-notes").value = "";
  });
});

// ---------- pain ----------
$("pain-submit").addEventListener("click", function () {
  const bodies = bodyG.get();
  const other = $("body-other").value.trim();
  if (other) bodies.push(other);
  const row = [
    getWhen(),
    bodies.join(", "),
    typeG.get().join(", "),
    sevG.first(),
    concG.get().join(", "),
    $("pain-doing").value.trim(),
    "",
    "",
    "",
    $("pain-notes").value.trim(),
  ];
  submitLog("Pain Log", row, "pain: " + bodies.join(", "), function () {
    bodyG.clear(); typeG.clear(); sevG.clear(); concG.clear();
    $("body-other").value = ""; $("pain-doing").value = ""; $("pain-notes").value = "";
  });
});

// ---------- meds ----------
// writes a mood log row with only date/time + meds taken filled. the
// early/on time/late marker is display-only — it doesn't go in the sheet,
// same as the rows already there.
$("meds-submit").addEventListener("click", function () {
  const meds = medsG.get();
  const row = [getWhen(), "", "", "", "", "", meds.join(", "), ""];
  submitLog("Mood Log", row, "meds: " + meds.join(", "), function () {
    medsG.clear();
  });
});

// ---------- br ----------
// one submit for the whole trip: pee + poop + blood land as ONE food log row.
$("br-submit").addEventListener("click", function () {
  const parts = [];
  const pee = peeG.first();
  if (pee) parts.push("pee: " + pee.toLowerCase());
  const poopBits = [];
  const colors = poopG.get();
  if (colors.length) poopBits.push(colors.join(", ").toLowerCase());
  const bristol = bristolG.get();
  if (bristol.length) poopBits.push("bristol " + bristol.slice().sort().join(", "));
  if (poopBits.length) parts.push("poop: " + poopBits.join(", "));
  if (bloodPicked) parts.push("blood");
  if (!parts.length) return;
  const row = [getWhen(), "", "", "", parts.join("; ")];
  submitLog("Food Log", row, parts.join("; "), function () {
    peeG.clear(); poopG.clear(); bristolG.clear();
    bloodPicked = false;
    $("blood-toggle").classList.remove("on");
  });
});

// ---------- food ----------
$("food-submit").addEventListener("click", function () {
  const row = [
    getWhen(),
    $("meal-select").value,
    $("food-name").value.trim(),
    $("food-portion").value.trim(),
    $("food-notes").value.trim(),
  ];
  submitLog("Food Log", row, "food: " + row[2], function () {
    $("food-name").value = ""; $("food-portion").value = ""; $("food-notes").value = "";
  });
});
function logWater(oz) {
  var label = oz + " oz";
  submitLog("Food Log", [getWhen(), "Drink", "water", label, ""], "water " + label, null);
}
document.querySelectorAll(".water-btn").forEach(function (btn) {
  btn.addEventListener("click", function () { logWater(btn.dataset.oz); });
});
$("water-custom-btn").addEventListener("click", function () {
  var v = parseFloat($("water-custom").value);
  if (!v || v <= 0) { toast("how much water? put a number in first :)"); return; }
  logWater((Math.round(v * 10) / 10).toString());
  $("water-custom").value = "";
});
$("water-custom").addEventListener("keydown", function (e) {
  if (e.key === "Enter") $("water-custom-btn").click();
});

// ---------- vitals ----------
$("vitals-submit").addEventListener("click", function () {
  const row = [
    getWhen(),
    numOrBlank($("sys").value),
    numOrBlank($("dia").value),
    numOrBlank($("hr").value),
    $("vitals-notes").value.trim(),
  ];
  submitLog("Vitals", row, "vitals", function () {
    $("sys").value = ""; $("dia").value = ""; $("hr").value = ""; $("vitals-notes").value = "";
  });
});

// ---------- sleep ----------
// wake-up details go in the wake-ups column, never only in notes — the
// dashboard counts that column.
$("sleep-submit").addEventListener("click", function () {
  const row = [
    $("sleep-date").value,
    $("bedtime").value,
    $("wakeups").value.trim(),
    $("final-wake").value,
    sleepQG.first() || "",
    $("sleep-notes").value.trim(),
  ];
  submitLog("Sleep Log", row, "sleep: night of " + $("sleep-date").value, function () {
    $("bedtime").value = ""; $("wakeups").value = ""; $("final-wake").value = "";
    sleepQG.clear(); $("sleep-notes").value = "";
  });
});

// ---------- period ----------
$("period-submit").addEventListener("click", function () {
  // period rows are date-only: the cycle day / cycle start formulas in
  // columns D + F do date arithmetic, so a time in column A would skew them.
  const row = [$("period-date").value, flowG.first(), "", $("period-notes").value.trim()];
  submitLog("Period Log", row, "period: " + flowG.first(), function () {
    flowG.clear(); $("period-notes").value = "";
  });
});
// tampon sizes are tap-to-log with the current time.
$("tampon-btns").querySelectorAll(".chip").forEach(function (btn) {
  btn.addEventListener("click", function () {
    const size = btn.textContent;
    submitLog("Period Log", [$("period-date").value, "", "", "tampon: " + size + ", " + fmtTime(new Date(getWhen()))], "tampon: " + size, function () {
      tamponG.clear();
    });
  });
});

// ---------- today view ----------
// pulls today's rows from the sheet (so chat-logged entries show up too)
// and merges in anything still queued, chronological, note text included.
function rowTime(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function describeRow(tab, values) {
  const note = values[7] || values[9] || values[4] || "";
  switch (tab) {
    case "Mood Log": {
      const mood = values[1];
      const meds = values[6];
      const main = mood || (meds ? "meds: " + meds : "mood");
      return { main: main, note: values[7] || "" };
    }
    case "Pain Log":
      return { main: (values[1] || "pain") + (values[3] ? " — " + values[3] : ""), note: values[9] || "" };
    case "Food Log": {
      if (!values[1] && !values[2]) return { main: values[4] || "br", note: "" };
      const bits = [values[1], values[2], values[3]].filter(Boolean);
      return { main: bits.join(" — "), note: values[4] || "" };
    }
    case "Vitals": {
      const bits = [];
      if (values[1] !== "" && values[2] !== "") bits.push(values[1] + "/" + values[2]);
      if (values[3] !== "") bits.push("HR " + values[3]);
      return { main: bits.join(" · ") || "vitals", note: values[4] || "" };
    }
    case "Period Log":
      return { main: (values[1] ? "flow: " + values[1] : "period") + (values[4] ? " — " + values[4] : ""), note: "" };
    default:
      return { main: tab, note: note };
  }
}

async function loadToday() {
  const list = $("today-list");
  const empty = $("today-empty");
  const errEl = $("today-error");
  errEl.hidden = true;
  const entries = [];

  if (isConfigured()) {
    const results = await Promise.allSettled(TODAY_TABS.map(fetchToday));
    let anyOk = false;
    results.forEach(function (r, i) {
      if (r.status !== "fulfilled") return;
      anyOk = true;
      r.value.forEach(function (row) {
        const t = rowTime(row.values[0]);
        if (!t) return;
        const d = describeRow(TODAY_TABS[i], row.values);
        entries.push({ time: t, kind: TODAY_TABS[i].replace(" Log", "").toLowerCase(), main: d.main, note: d.note, queued: false });
      });
    });
    if (!anyOk) errEl.hidden = false;
  }

  loadQueue().forEach(function (item) {
    const t = rowTime(item.values[0]) || rowTime(item.createdAt);
    if (!t) return;
    entries.push({ time: t, kind: item.tab.replace(" Log", "").toLowerCase(), main: item.label, note: "", queued: true });
  });

  entries.sort(function (a, b) { return a.time - b.time; });
  list.innerHTML = "";
  entries.forEach(function (e) {
    const li = document.createElement("li");
    let html = '<span class="today-time">' + fmtTime(e.time) + '</span>' +
      '<span class="today-kind">' + e.kind + "</span>" + escapeHtml(e.main);
    if (e.queued) html += '<span class="pill-queued">queued</span>';
    if (e.note) html += '<div class="today-note">' + escapeHtml(e.note) + "</div>";
    li.innerHTML = html;
    list.appendChild(li);
    const noteEl = li.querySelector(".today-note");
    if (noteEl) clampNote(noteEl);
  });
  empty.hidden = entries.length > 0;
}

// long notes clamp after 3 lines with a fade; tap to expand, tap again to
// collapse. short notes show fully, no fade, no tap target. the section
// re-renders when opened, so measurement happens while it's visible.
function clampNote(el) {
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
  if (el.scrollHeight > lh * 3 + 2) {
    el.classList.add("clamped");
    el.addEventListener("click", function () { el.classList.toggle("expanded"); });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

$("today-refresh").addEventListener("click", loadToday);

// ---------- setup + settings ----------
// the apps script url is stored in localStorage on this device only. it is
// never in the repo, and the app won't log anything until it's saved.
const URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/;

function validUrl(u) { return URL_PATTERN.test((u || "").trim()); }

function showSetup() {
  $("setup-url").value = getBackendUrl();
  $("setup-error").hidden = true;
  $("setup-screen").hidden = false;
  setTimeout(function () { $("setup-url").focus(); }, 100);
}
function hideSetup() { $("setup-screen").hidden = true; }

$("setup-save").addEventListener("click", function () {
  const url = $("setup-url").value.trim();
  if (!validUrl(url)) { $("setup-error").hidden = false; return; }
  saveBackendUrl(url);
  hideSetup();
  toast("you're set — happy logging :)");
  flushQueue();
  loadToday();
});
$("setup-url").addEventListener("keydown", function (e) {
  if (e.key === "Enter") $("setup-save").click();
});

$("settings-btn").addEventListener("click", function () {
  const panel = $("settings-panel");
  const opening = panel.hidden;
  panel.hidden = !opening;
  if (opening) {
    $("settings-url").value = getBackendUrl();
    $("settings-error").hidden = true;
    $("settings-status").textContent = isConfigured()
      ? "connected — logs go straight to the sheet."
      : "no url saved yet — logging is paused until you save one.";
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});
$("settings-close").addEventListener("click", function () { $("settings-panel").hidden = true; });
$("settings-save").addEventListener("click", function () {
  const url = $("settings-url").value.trim();
  if (!validUrl(url)) { $("settings-error").hidden = false; return; }
  saveBackendUrl(url);
  $("settings-error").hidden = true;
  $("settings-status").textContent = "saved — logs go straight to the sheet.";
  toast("url saved :)");
  flushQueue();
  loadToday();
});
$("settings-clear").addEventListener("click", function () {
  clearBackendUrl();
  $("settings-url").value = "";
  $("settings-status").textContent = "url removed — logging is paused until you save one.";
  showSetup();
});

// ---------- boot ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  });
}

updateQueueIndicator();
refreshUI();
if (!isConfigured()) {
  showSetup();
} else {
  flushQueue();
  loadToday();
}
