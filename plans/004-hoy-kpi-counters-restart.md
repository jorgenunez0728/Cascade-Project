# 004 — Stop HOY/Lab Overview KPI counters and card grid from re-animating on unrelated saves

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: HIGH
- **Category**: Interruptibility
- **Estimated scope**: 1 file (`js/panel.js`), ~15 lines changed

## Problem

`renderLabOverview` (`js/panel.js:267-363`) — used by both the HOY dashboard
and the Panel dashboard, per `CLAUDE.md` "the one source for cross-module
KPIs" — already has a memoization cache, but the cache key includes a
generation counter that bumps on **every** `data:saved` event anywhere in the
app, not just ones that actually change this section's displayed numbers:

```js
/* js/panel.js:254-255 — current */
var _labOverviewGen = 0;      // se incrementa con cada 'data:saved' (saveDB/invSave)
window.addEventListener('data:saved', function() { _labOverviewGen++; });
```

```js
/* js/panel.js:257-264 — current */
function _labOverviewKey(sections) {
    var vCount = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles.length : 0;
    var tpStamp = (typeof tpState !== 'undefined' && tpState) ? (tpState._lastSave || 0) : 0;
    var opsSig = (typeof pnState !== 'undefined' && pnState.operators)
        ? pnState.operators.length + ':' + pnState.operators.filter(function(o) { return o.active; }).length : '0:0';
    var gasCount = (typeof invState !== 'undefined' && invState.gases) ? invState.gases.length : 0;
    var syncStamp = (typeof fbSync !== 'undefined' && fbSync.lastSync) ? fbSync.lastSync.getTime() : 0;
    return [_labOverviewGen, vCount, tpStamp, opsSig, gasCount, syncStamp, localToday(), sections.join(',')].join('|');
}
```

Because `_labOverviewGen` is the first (and least specific) field in the key,
`memoKey` changes on literally any save in the app (a gas reading, an
unrelated plan edit, a Firebase sync tick), which invalidates the cache and
forces the full path below — even when none of the six actual KPI numbers
changed:

```js
/* js/panel.js:354-362 — current */
el.innerHTML = html;
_labOverviewCache[sectionsKey] = { key: memoKey, html: html };
el.querySelectorAll('.pn-kpi-num[data-kpi-target]').forEach(function(numEl) {
    var t = parseFloat(numEl.dataset.kpiTarget) || 0;
    if (typeof animateCounter === 'function') animateCounter(numEl, t, { suffix: numEl.dataset.kpiSuffix || '' });
    else numEl.textContent = t + (numEl.dataset.kpiSuffix || '');
});
var grid = el.querySelector('.pn-lab-kpi-grid');
if (grid && typeof animateStaggerChildren === 'function') animateStaggerChildren(grid, '.tp-card', 60);
```

Every `el.innerHTML = html` replace creates brand-new DOM nodes, so
`animateCounter`'s own from-value tracking (`el.dataset.animValue`, see
`js/app.js:4269-4270`) never helps here — the new `<div class="pn-kpi-num">`
node has no prior `dataset.animValue`, so every counter genuinely restarts
its 800ms count-up from 0, and `animateStaggerChildren` re-applies
`.anim-stagger`/`animFadeInUp` to the whole KPI grid — every single time,
during ordinary save bursts (per `CLAUDE.md`'s `data:saved` listener,
debounced 400ms, plus a 60s tick) while a technician has HOY open as a status
board. Per `AUDIT.md` §4, this is exactly the "keyframe/animation retriggers
on every re-render instead of settling" problem — it defeats the board's
purpose as an at-a-glance display (`AUDIT.md` §1: "prevent a jarring change"
is a valid purpose; here the jarring change is self-inflicted by the
animation, not the data).

The existing cache-hit path (used when `memoKey` doesn't change) already does
the right thing — it's the exemplar to extend:

```js
/* js/panel.js:275-283 — current, correct behavior on a true cache hit */
var cached = _labOverviewCache[sectionsKey];
if (cached && cached.key === memoKey) {
    el.innerHTML = cached.html;
    // Contadores al valor final sin re-animar (los datos no cambiaron)
    el.querySelectorAll('.pn-kpi-num[data-kpi-target]').forEach(function(numEl) {
        numEl.textContent = (parseFloat(numEl.dataset.kpiTarget) || 0) + (numEl.dataset.kpiSuffix || '');
    });
    return;
}
```

## Target

Don't try to make `_labOverviewGen`/`_labOverviewKey` more precise (risky —
it exists specifically to catch state changes the other signals miss, like
plan-item `completed` toggles or alert-list changes). Instead, after
computing `html` on the "cache miss" path, compare it against the **previous
render's actual HTML** (not the memo key) — if the freshly-generated markup is
byte-identical to what's already on screen, nothing visually changed, so skip
the animations exactly like the true cache-hit path does:

```js
/* js/panel.js:354-363 — target, replaces the current block */
var prevCached = _labOverviewCache[sectionsKey];
var contentUnchanged = !!(prevCached && prevCached.html === html);
el.innerHTML = html;
_labOverviewCache[sectionsKey] = { key: memoKey, html: html };
if (contentUnchanged) {
    // Same visual content as last render (only the memo key changed, e.g. an
    // unrelated save elsewhere bumped _labOverviewGen) — set final values,
    // don't replay the count-up/stagger animations.
    el.querySelectorAll('.pn-kpi-num[data-kpi-target]').forEach(function(numEl) {
        numEl.textContent = (parseFloat(numEl.dataset.kpiTarget) || 0) + (numEl.dataset.kpiSuffix || '');
    });
} else {
    el.querySelectorAll('.pn-kpi-num[data-kpi-target]').forEach(function(numEl) {
        var t = parseFloat(numEl.dataset.kpiTarget) || 0;
        if (typeof animateCounter === 'function') animateCounter(numEl, t, { suffix: numEl.dataset.kpiSuffix || '' });
        else numEl.textContent = t + (numEl.dataset.kpiSuffix || '');
    });
    var grid = el.querySelector('.pn-lab-kpi-grid');
    if (grid && typeof animateStaggerChildren === 'function') animateStaggerChildren(grid, '.tp-card', 60);
}
```

## Repo conventions to follow

- The existing cache-hit branch (`js/panel.js:275-283`) already establishes
  the pattern "when nothing changed, set `textContent` directly instead of
  calling `animateCounter`" — the target code reuses that exact same
  no-animation branch body, just reached via a different condition (HTML
  equality instead of memo-key equality).
- `_labOverviewCache` is a plain object keyed by `sectionsKey`
  (`{ key: memoKey, html: html }`) — the target code reads `prevCached.html`
  before overwriting the cache entry, so read it into a local variable first
  (as shown) rather than reading `_labOverviewCache[sectionsKey]` again after
  the overwrite.

## Steps

1. Open `js/panel.js`, locate `function renderLabOverview(el, opts) {`
   (around line 267).
2. Find the block starting at `el.innerHTML = html;` (around line 354, after
   the `if (has('alerts') && ...)` section closes) through the end of the
   function (around line 363).
3. Replace that block with the Target code above: capture `prevCached` before
   overwriting `_labOverviewCache[sectionsKey]`, compute `contentUnchanged`,
   then branch — unchanged path sets `textContent` directly (copy the exact
   two lines from the existing cache-hit branch at lines 279-281), changed
   path keeps the existing `animateCounter`/`animateStaggerChildren` calls
   unchanged.
4. Do not touch `_labOverviewGen`, `_labOverviewKey`, or the early cache-hit
   `if (cached && cached.key === memoKey)` block (lines 274-283) — leave the
   existing memoization exactly as it is; this plan only changes what happens
   on a cache **miss**.

## Boundaries

- Do NOT modify `_labOverviewGen` or `_labOverviewKey` — they're deliberately
  broad to avoid stale data; narrowing them risks a real bug (stale alerts/plan
  items) which is out of scope for an animation fix.
- Do NOT modify `animateCounter` or `animateStaggerChildren` themselves.
- Do NOT change the `data:saved` listener or the 400ms debounce / 60s tick in
  `js/app.js:2318-2327` — this plan fixes the effect (unnecessary
  re-animation), not the trigger frequency (which is legitimate — the board
  should refresh promptly after a save, just without replaying animations
  when nothing visually changed).
- If the cited code doesn't match what's shown above (drift since commit
  `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `node --check js/panel.js` (must pass with no output).
- **Feel check**: Open HOY (or Panel dashboard) on one device/tab. On a
  second device/tab (or the same one), save something unrelated to the KPI
  numbers — e.g. add a gas cylinder reading whose PSI doesn't cross the
  "Gases Bajos" threshold, or toggle an operator's active state without
  changing the active count. Confirm:
  - The KPI numbers do NOT visibly restart their count-up animation.
  - The KPI card grid does NOT re-fade/re-stagger.
  - Now make a change that DOES change a displayed number (e.g. release a
    vehicle so "Liberados Hoy" increments) — confirm the counter and stagger
    DO animate normally in this case.
  - In DevTools → Rendering → toggle `prefers-reduced-motion` and confirm the
    no-change path is unaffected (it already skips animation) and the
    real-change path still respects reduced motion via `animateCounter`'s
    existing check.
- **Done when**: an unrelated save while HOY is open produces zero visible
  animation on the Lab Overview strip, and a save that actually changes a KPI
  value still animates exactly as before.
