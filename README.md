# health log

my standalone health log — mood, pain, meds, br, food, vitals, sleep, period — as an installable web app that writes straight into my health tracker google sheet. no server, no build step, no npm. just html/css/js.

## how it works

- the app is a static PWA (this repo). it runs entirely in the browser.
- the backend is a google apps script web app (`backend/Code.gs`). the app calls it with `fetch`, and the script is the only thing that touches my sheet.
- my data lives in the sheet, not in the app and not on the host. the host (github pages) only serves the app files.
- the apps script url is the write key for my sheet. it is **never in this repo** — i paste it into the app on first run on each device, and it's stored in that device's localStorage. i can view or change it later from settings in the app.

## setup (one time)

1. open [script.google.com](https://script.google.com), make a new project, paste in `backend/Code.gs` (the whole file, it's self-contained).
2. set the script timezone to America/Chicago (project settings, the gear icon) so "today" and the datetimes match my sheet.
3. deploy → new deployment → web app. execute as: me. who has access: anyone. copy the web app url — it looks like `https://script.google.com/macros/s/.../exec`.
4. open the app, paste the url on the setup screen. done — it stays on that device.

## deploying the app (github pages)

1. push this repo to github as `health-log` (public is fine — there's no data and no secrets in it).
2. repo settings → pages → deploy from branch → `main`, folder `/ (root)`.
3. open `https://<my-github-username>.github.io/health-log/` on my phone, install it from the browser menu ("add to home screen" / "install app").
4. paste the apps script url on first run, then test-log something small and check the sheet.

## offline

if a log can't reach google (no signal, whatever), it goes into a queue in localStorage and the header shows how many are waiting. they send automatically, oldest first, when i'm back online. nothing gets dropped silently.

## things worth knowing

- the mood log's score + date formulas are written by the backend for the exact row each entry lands on, so they never point at the wrong row. the backend finds the last real entry by looking at column A only — the sheet has helper columns prefilled hundreds of rows down, so a plain append would land in the wrong place.
- the meds early / on time / late marker (against 7pm) is display-only in the app — it doesn't go in the sheet, same as the rows already there. and there is no "missed" button, ever.
- vitals: heart rate can be logged on its own, but systolic and diastolic have to go together.
- in the br section, nothing logs until i hit the one submit button — a whole trip lands as one row.
- the period tab is date / flow / symptoms / cycle day / notes / cycle start? — cycle day + cycle start are prefilled formulas, so the backend writes around them (date, flow, symptoms, then notes) and never touches them. period rows are date-only, no time, so the cycle math stays exact.
- dates: the app sends local datetimes and the backend stores them as real date values in the sheet. if the script timezone isn't America/Chicago, "today" in the history list can be off by a day.

## later

proper google sign-in instead of the url-as-key setup is the planned upgrade, after this version is working. the queue + the sheet schemas stay the same either way.
