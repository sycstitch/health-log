// api.js — talks to the apps script backend, with an offline queue.
//
// every log goes through logEntry(tab, values, label). if the post fails
// (offline, backend down, whatever), the entry is stashed in localStorage
// and retried automatically when we're back online. nothing is ever dropped.

const QUEUE_KEY = "healthlog.queue.v1";

// the apps script web app url lives in localStorage on this device only —
// it is never in the repo. set once on the first-run setup screen, changeable
// later from settings.
const URL_KEY = "healthlog.appsScriptUrl";

function getBackendUrl() {
  try {
    return (localStorage.getItem(URL_KEY) || "").trim();
  } catch (e) {
    return "";
  }
}

function saveBackendUrl(url) {
  localStorage.setItem(URL_KEY, (url || "").trim());
}

function clearBackendUrl() {
  localStorage.removeItem(URL_KEY);
}

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  if (typeof updateQueueIndicator === "function") updateQueueIndicator();
}

function isConfigured() {
  return getBackendUrl().indexOf("https://") === 0;
}

// plain text/plain post: keeps the request "simple" so the browser skips the
// CORS preflight, which apps script web apps don't answer. the backend still
// reads the body as JSON via e.postData.contents.
async function postToBackend(payload) {
  const res = await fetch(getBackendUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("backend error " + res.status);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

// log one row. resolves with {row} on success; throws Error("queued") when the
// entry was stashed for later, or another Error on a real failure.
async function logEntry(tab, values, label) {
  if (!isConfigured()) throw new Error("not-configured");
  try {
    return await postToBackend({ action: "append", tab: tab, values: [values] });
  } catch (err) {
    const q = loadQueue();
    q.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2),
      tab: tab,
      values: values,
      label: label || tab,
      createdAt: new Date().toISOString(),
    });
    saveQueue(q);
    throw new Error("queued");
  }
}

// send queued entries, oldest first, one at a time. stops at the first
// failure so order is preserved and we don't hammer a dead connection.
async function flushQueue() {
  if (!isConfigured()) return;
  let q = loadQueue();
  let sent = 0;
  while (q.length > 0) {
    const item = q[0];
    try {
      await postToBackend({ action: "append", tab: item.tab, values: [item.values] });
      q = q.slice(1);
      saveQueue(q);
      sent++;
    } catch (err) {
      break;
    }
  }
  if (sent > 0 && typeof toast === "function") {
    toast("synced " + sent + " queued entry" + (sent === 1 ? "" : "ies") + " :)");
    if (typeof loadToday === "function") loadToday();
  }
}

// today's rows for one tab, as [{row, values}]. values[0] comes back as an
// ISO string when the cell holds a date.
async function fetchToday(tab) {
  if (!isConfigured()) return [];
  const data = await postToBackend({ action: "today", tab: tab });
  return (data && data.rows) || [];
}

// dashboard bundle: recent rows for every tab, in one round trip.
// {days, fetchedAt, tabs: {"Mood Log": [[...]], ...}} — dates come back
// as ISO strings, same as fetchToday.
async function fetchDashboard(days) {
  if (!isConfigured()) throw new Error("not-configured");
  return await postToBackend({ action: "dashboard", days: days || 45 });
}

window.addEventListener("online", flushQueue);
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) flushQueue();
});
