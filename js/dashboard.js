// dashboard.js — insights from the sheet, computed here in the browser.
//
// fetches one bundle from the apps script backend ({action:"dashboard"}) and
// turns it into small stat cards. never invents numbers: every card says
// plainly when there isn't enough data yet.
//
// the dashboard fetches when first opened and again on every return visit
// (showing the last good data meanwhile), plus a manual refresh button.

const MOOD_SCORES = { "Great": 0, "Fine": 1, "Meh": 2, "Rough": 3, "Bad": 4 };
const MOOD_WORDS = ["Great", "Fine", "Meh", "Rough", "Bad"];
const SEV_SCORES = { "Background noise": 1, "Bugging me": 2, "Getting in the way": 3, "Shut me down": 4 };
const SEV_WORDS = ["", "Background noise", "Bugging me", "Getting in the way", "Shut me down"];
const DASH_DAYS = 45; // window the backend returns; cycle math needs ~40 days back

let dashCache = null;

// ---------- small helpers ----------
function dashEl(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function dPad(n) { return String(n).padStart(2, "0"); }
function dayKey(d) {
  return d.getFullYear() + "-" + dPad(d.getMonth() + 1) + "-" + dPad(d.getDate());
}
function addDays(d, n) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function fmtDay(d) {
  return d.toLocaleDateString([], { month: "short", day: "numeric" }).toLowerCase();
}
function fmtClock(d) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}
function fmtNum(n, digits) {
  return (Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)).toString();
}
function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce(function (a, b) { return a + b; }, 0) / nums.length;
}
function nearestWord(score, words) {
  const i = Math.max(0, Math.min(words.length - 1, Math.round(score)));
  return words[i];
}
// a cell value -> Date or null. the backend serializes sheet dates as ISO strings.
function cellDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function rowsFor(tabs, tab) {
  return (tabs && tabs[tab]) || [];
}
function inWindow(d, start) {
  return !!d && dayKey(d) >= dayKey(start);
}
// "HH:MM" string, or an ISO string from a sheet time value, -> minutes
// since midnight. ISO times are read back in local time, which matches the
// script timezone (america/chicago) on her devices.
function parseClock(v) {
  if (typeof v !== "string" || !v) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  return null;
}
function sleepHours(r) {
  const bed = parseClock(r[1]);
  const wake = parseClock(r[3]);
  if (bed == null || wake == null) return null;
  const hrs = ((wake - bed + 1440) % 1440) / 60;
  if (hrs <= 0 || hrs > 16) return null;
  return hrs;
}

// ---------- per-card math ----------
function moodStats(moodRows, weekStart) {
  const scores = [];
  const counts = { "Great": 0, "Fine": 0, "Meh": 0, "Rough": 0, "Bad": 0 };
  moodRows.forEach(function (r) {
    const d = cellDate(r[0]);
    if (!inWindow(d, weekStart)) return;
    const m = (r[1] || "").trim();
    if (m in MOOD_SCORES) { scores.push(MOOD_SCORES[m]); counts[m]++; }
  });
  if (!scores.length) return null;
  const a = avg(scores);
  let common = null, commonN = 0;
  Object.keys(counts).forEach(function (m) {
    if (counts[m] > commonN) { commonN = counts[m]; common = m; }
  });
  const bits = Object.keys(counts)
    .filter(function (m) { return counts[m] > 0; })
    .map(function (m) { return counts[m] + " " + m.toLowerCase(); });
  return { avg: a, word: nearestWord(a, MOOD_WORDS), n: scores.length, common: common, breakdown: bits.join(" · ") };
}

function sleepStats(sleepRows, weekStart) {
  const hours = [];
  let nights = 0, withWakeups = 0;
  sleepRows.forEach(function (r) {
    const d = cellDate(r[0]);
    if (!inWindow(d, weekStart)) return;
    nights++;
    if ((r[2] || "").trim() !== "") withWakeups++;
    const h = sleepHours(r);
    if (h != null) hours.push(h);
  });
  if (!nights) return null;
  return { nights: nights, withWakeups: withWakeups, avgHrs: avg(hours) };
}

function painStats(painRows, weekStart) {
  let n = 0;
  const sev = [];
  const parts = {};
  painRows.forEach(function (r) {
    const d = cellDate(r[0]);
    if (!inWindow(d, weekStart)) return;
    n++;
    const s = (r[3] || "").trim();
    if (s in SEV_SCORES) sev.push(SEV_SCORES[s]);
    (r[1] || "").split(",").forEach(function (bp) {
      bp = bp.trim();
      if (bp) parts[bp] = (parts[bp] || 0) + 1;
    });
  });
  if (!n) return null;
  const top = Object.keys(parts)
    .sort(function (a, b) { return parts[b] - parts[a]; })
    .slice(0, 2)
    .map(function (bp) { return { part: bp, n: parts[bp] }; });
  const a = avg(sev);
  return { n: n, top: top, avgSev: a, sevWord: a == null ? null : nearestWord(a, SEV_WORDS) };
}

function medsStats(moodRows) {
  const days = {};
  let last = null;
  moodRows.forEach(function (r) {
    if (!((r[6] || "").trim())) return;
    const d = cellDate(r[0]);
    if (!d) return;
    days[dayKey(d)] = true;
    if (!last || d > last) last = d;
  });
  // a streak counts back from today, or yesterday if today's dose isn't
  // logged yet — today not being logged yet doesn't break it.
  const today = new Date();
  let cursor = days[dayKey(today)] ? today : addDays(today, -1);
  let streak = 0;
  while (days[dayKey(cursor)]) { streak++; cursor = addDays(cursor, -1); }
  return { streak: streak, last: last };
}

function waterStats(foodRows) {
  const now = new Date();
  const todayK = dayKey(now);
  const weekStart = addDays(now, -6);
  let todayOz = 0, weekOz = 0;
  foodRows.forEach(function (r) {
    if ((r[1] || "") !== "Drink") return;
    if ((r[2] || "").toLowerCase() !== "water") return;
    const m = String(r[3] || "").match(/([\d.]+)\s*oz/i);
    if (!m) return;
    const oz = parseFloat(m[1]);
    if (isNaN(oz)) return;
    const d = cellDate(r[0]);
    if (!d) return;
    if (dayKey(d) === todayK) todayOz += oz;
    if (inWindow(d, weekStart)) weekOz += oz;
  });
  return { today: todayOz, avg7: weekOz / 7 };
}

function stressStats(stressRows, weekStart) {
  const perDay = [];
  stressRows.forEach(function (r) {
    const d = cellDate(r[0]);
    if (!inWindow(d, weekStart)) return;
    const vals = [];
    for (let i = 1; i <= 24; i++) {
      if (typeof r[i] === "number" && !isNaN(r[i])) vals.push(r[i]);
    }
    if (vals.length) perDay.push({ date: d, avg: avg(vals) });
  });
  if (!perDay.length) return null;
  let calmest = perDay[0];
  perDay.forEach(function (x) { if (x.avg < calmest.avg) calmest = x; });
  return { avg: avg(perDay.map(function (x) { return x.avg; })), days: perDay.length, calmest: calmest };
}

function periodStats(periodRows) {
  let lastStart = null, lastRow = null;
  periodRows.forEach(function (r) {
    const d = cellDate(r[0]);
    if (!d) return;
    if (!lastRow || d > lastRow) lastRow = d;
    if ((r[5] || "") === "START" && (!lastStart || d > lastStart)) lastStart = d;
  });
  if (!lastRow) return null;
  const now = new Date();
  // a cycle counts as in progress if it started in the last 45 days.
  if (lastStart && (startOfDay(now) - startOfDay(lastStart)) / 86400000 <= 45) {
    const day = Math.round((startOfDay(now) - startOfDay(lastStart)) / 86400000) + 1;
    return { kind: "cycle", day: day, start: lastStart };
  }
  const ago = Math.round((startOfDay(now) - startOfDay(lastRow)) / 86400000);
  return { kind: "since", ago: ago, date: lastRow };
}

function relationshipStats(tabs) {
  const now = new Date();
  const start14 = addDays(now, -13);
  const todayK = dayKey(now);

  // stress -> mood: avg mood on high-stress days vs low-stress days
  const moodByDay = {};
  rowsFor(tabs, "Mood Log").forEach(function (r) {
    const d = cellDate(r[0]);
    if (!inWindow(d, start14)) return;
    const m = (r[1] || "").trim();
    if (m in MOOD_SCORES) (moodByDay[dayKey(d)] = moodByDay[dayKey(d)] || []).push(MOOD_SCORES[m]);
  });
  const stressByDay = {};
  rowsFor(tabs, "Stress Log").forEach(function (r) {
    const d = cellDate(r[0]);
    if (!inWindow(d, start14)) return;
    const vals = [];
    for (let i = 1; i <= 24; i++) {
      if (typeof r[i] === "number" && !isNaN(r[i])) vals.push(r[i]);
    }
    if (vals.length) stressByDay[dayKey(d)] = avg(vals);
  });
  const high = [], low = [];
  Object.keys(stressByDay).forEach(function (k) {
    if (!moodByDay[k]) return;
    const m = avg(moodByDay[k]);
    if (stressByDay[k] >= 40) high.push(m);
    else if (stressByDay[k] < 30) low.push(m);
  });

  // sleep -> next-day pain: pain entries the day after 8h+ nights vs shorter
  const painByDay = {};
  rowsFor(tabs, "Pain Log").forEach(function (r) {
    const d = cellDate(r[0]);
    if (!d) return;
    const k = dayKey(d);
    painByDay[k] = (painByDay[k] || 0) + 1;
  });
  const longNights = [], shortNights = [];
  rowsFor(tabs, "Sleep Log").forEach(function (r) {
    const d = cellDate(r[0]);
    if (!inWindow(d, start14)) return;
    const hrs = sleepHours(r);
    if (hrs == null) return;
    const next = dayKey(addDays(d, 1));
    if (next > todayK) return; // the next day hasn't happened yet
    const c = painByDay[next] || 0;
    if (hrs >= 8) longNights.push(c); else shortNights.push(c);
  });

  return {
    stressMood: (high.length >= 3 && low.length >= 3)
      ? { high: avg(high), highN: high.length, low: avg(low), lowN: low.length } : null,
    sleepPain: (longNights.length >= 3 && shortNights.length >= 3)
      ? { long: avg(longNights), longN: longNights.length, short: avg(shortNights), shortN: shortNights.length } : null,
  };
}

// ---------- render ----------
function setHtml(id, html) {
  dashEl(id).innerHTML = html;
}
function emptyLine(msg) {
  return '<p class="dash-empty">' + esc(msg) + "</p>";
}

function renderDashboard(data) {
  const tabs = data.tabs || {};
  const weekStart = addDays(new Date(), -6);

  const mood = moodStats(rowsFor(tabs, "Mood Log"), weekStart);
  setHtml("dash-mood", mood
    ? '<p class="stat">average: <span class="big">' + esc(mood.word.toLowerCase()) + " (" + fmtNum(mood.avg, 1) + ")</span></p>" +
      '<p class="dash-sub">most common: ' + esc(mood.common.toLowerCase()) + " · " + esc(mood.breakdown) + "</p>"
    : emptyLine("no mood entries in the last 7 days."));

  const sleep = sleepStats(rowsFor(tabs, "Sleep Log"), weekStart);
  setHtml("dash-sleep", sleep
    ? '<p class="stat">avg <span class="big">' + (sleep.avgHrs == null ? "—" : fmtNum(sleep.avgHrs, 1) + " hrs") + "</span> in bed · " + sleep.nights + " night" + (sleep.nights === 1 ? "" : "s") + "</p>" +
      '<p class="dash-sub">wake-ups on ' + sleep.withWakeups + " of " + sleep.nights + "</p>"
    : emptyLine("no sleep logged in the last 7 days."));

  const pain = painStats(rowsFor(tabs, "Pain Log"), weekStart);
  setHtml("dash-pain", pain
    ? '<p class="stat"><span class="big">' + pain.n + " entr" + (pain.n === 1 ? "y" : "ies") + "</span>" +
      (pain.sevWord ? " · avg severity: " + esc(pain.sevWord.toLowerCase()) : "") + "</p>" +
      (pain.top.length
        ? '<p class="dash-sub">top: ' + pain.top.map(function (t) { return esc(t.part.toLowerCase()) + " (" + t.n + ")"; }).join(", ") + "</p>"
        : "")
    : emptyLine("no pain entries in the last 7 days."));

  const meds = medsStats(rowsFor(tabs, "Mood Log"));
  setHtml("dash-meds", meds.streak > 0
    ? '<p class="stat">current streak: <span class="big">' + meds.streak + " night" + (meds.streak === 1 ? "" : "s") + "</span> :)</p>" +
      (meds.last ? '<p class="dash-sub">last logged ' + fmtDay(meds.last) + "</p>" : "")
    : (meds.last
      ? emptyLine("no meds logged in the last few days — last one was " + fmtDay(meds.last) + ".")
      : emptyLine("no meds logged yet.")));

  const water = waterStats(rowsFor(tabs, "Food Log"));
  setHtml("dash-water", (water.today > 0 || water.avg7 > 0)
    ? '<p class="stat">today: <span class="big">' + fmtNum(water.today, 0) + " oz</span></p>" +
      '<p class="dash-sub">7-day avg: ' + fmtNum(water.avg7, 0) + " oz/day</p>"
    : emptyLine("no water logged yet."));

  const stress = stressStats(rowsFor(tabs, "Stress Log"), weekStart);
  setHtml("dash-stress", stress
    ? '<p class="stat">avg <span class="big">' + fmtNum(stress.avg, 0) + "</span> / 100 · " + stress.days + " day" + (stress.days === 1 ? "" : "s") + "</p>" +
      '<p class="dash-sub">calmest: ' + fmtDay(stress.calmest.date) + " (" + fmtNum(stress.calmest.avg, 0) + ")</p>"
    : emptyLine("no stress data in the last 7 days."));

  const period = periodStats(rowsFor(tabs, "Period Log"));
  setHtml("dash-period", !period ? emptyLine("no period data yet.")
    : period.kind === "cycle"
      ? '<p class="stat">cycle day <span class="big">' + period.day + "</span></p>" +
        '<p class="dash-sub">started ' + fmtDay(period.start) + "</p>"
      : '<p class="stat">last period day: <span class="big">' + fmtDay(period.date) + "</span></p>" +
        '<p class="dash-sub">' + period.ago + " day" + (period.ago === 1 ? "" : "s") + " ago</p>");

  const rel = relationshipStats(tabs);
  let linksHtml = "";
  if (rel.stressMood) {
    linksHtml += '<p class="stat">stress vs mood: high-stress days avg <span class="big">' +
      esc(nearestWord(rel.stressMood.high, MOOD_WORDS).toLowerCase()) + " (" + fmtNum(rel.stressMood.high, 2) + ")</span> · " +
      "low-stress days avg <span class=\"big\">" + esc(nearestWord(rel.stressMood.low, MOOD_WORDS).toLowerCase()) +
      " (" + fmtNum(rel.stressMood.low, 2) + ")</span></p>" +
      '<p class="dash-sub">' + rel.stressMood.highN + " high-stress days, " + rel.stressMood.lowN + " low-stress days</p>";
  }
  if (rel.sleepPain) {
    linksHtml += '<p class="stat">sleep vs next-day pain: after 8h+ nights, <span class="big">' +
      fmtNum(rel.sleepPain.long, 1) + " entries</span> next day · after shorter nights, <span class=\"big\">" +
      fmtNum(rel.sleepPain.short, 1) + " entries</span></p>" +
      '<p class="dash-sub">' + rel.sleepPain.longN + " long nights, " + rel.sleepPain.shortN + " short nights</p>";
  }
  if (!linksHtml) {
    linksHtml = emptyLine("not enough overlapping days yet — keep logging and check back once there's a couple weeks of data.");
  }
  setHtml("dash-links", linksHtml);
}

// ---------- fetch + tab switching ----------
async function loadDashboard(force) {
  const errEl = dashEl("dash-error");
  const loadEl = dashEl("dash-loading");
  errEl.hidden = true;
  if (!isConfigured()) {
    loadEl.hidden = true;
    errEl.textContent = "connect the app first — paste your apps script url in settings.";
    errEl.hidden = false;
    return;
  }
  if (dashCache && !force) {
    renderDashboard(dashCache);
  } else {
    loadEl.hidden = false;
  }
  try {
    const data = await fetchDashboard(DASH_DAYS);
    dashCache = data;
    renderDashboard(data);
    dashEl("dash-updated").textContent = "updated " + fmtClock(new Date()) + " · last " + DASH_DAYS + " days from the sheet.";
  } catch (err) {
    if (err.message && err.message.indexOf("unknown action") !== -1) {
      // the app is newer than the deployed script — the dashboard action
      // doesn't exist there yet.
      errEl.textContent = "the app updated but the script didn't — re-paste Code.gs in apps script and deploy a new version (same url), then refresh here.";
    } else if (!dashCache) {
      errEl.textContent = "couldn't reach the sheet — check your connection and try again.";
    }
    errEl.hidden = false;
  } finally {
    loadEl.hidden = true;
  }
}

function switchTab(which) {
  const tracking = which === "tracking";
  dashEl("tab-tracking").classList.toggle("on", tracking);
  dashEl("tab-dashboard").classList.toggle("on", !tracking);
  dashEl("tab-tracking").setAttribute("aria-selected", tracking ? "true" : "false");
  dashEl("tab-dashboard").setAttribute("aria-selected", !tracking ? "true" : "false");
  dashEl("view-tracking").hidden = !tracking;
  dashEl("view-dashboard").hidden = tracking;
  if (!tracking) loadDashboard(false);
  window.scrollTo(0, 0);
}

dashEl("tab-tracking").addEventListener("click", function () { switchTab("tracking"); });
dashEl("tab-dashboard").addEventListener("click", function () { switchTab("dashboard"); });
dashEl("dash-refresh").addEventListener("click", function () { loadDashboard(true); });
