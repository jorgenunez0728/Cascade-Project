# 010 — Switch soak timer bar from animated `width` to `transform: scaleX()`

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 2 files (`index.html`, `js/cop15.js`), 5 lines changed

## Problem

The soak timer progress bar animates the layout property `width`, driven by
`setInterval(soakTimerTick, 1000)` for the entire soak duration — which per
`CLAUDE.md` can run for hours on a handheld device:

```html
<!-- index.html:517 — current -->
<div id="soak_timer_bar" style="height:100%;width:0%;background:#10b981;border-radius:3px;transition:width 1s linear;"></div>
```

```js
/* js/cop15.js:5271-5272 — current, the interval that drives it every second for hours */
_soakTimer.interval = setInterval(soakTimerTick, 1000);
soakTimerTick();
```

Four call sites mutate `.style.width` on this element:

```js
/* js/cop15.js:5302 — current, reset */
document.getElementById('soak_timer_bar').style.width = '0%';
```
```js
/* js/cop15.js:5324 — current, on completion inside soakTimerTick */
document.getElementById('soak_timer_bar').style.width = '100%';
```
```js
/* js/cop15.js:5380 — current, every-second tick update */
document.getElementById('soak_timer_bar').style.width = pct.toFixed(1) + '%';
```
```js
/* js/cop15.js:5407 — current, "timer expired while app was closed" recovery path */
document.getElementById('soak_timer_bar').style.width = '100%';
```

Per `AUDIT.md` §5: "`width`/`height`/`margin`/`padding`/`top`/`left` trigger
layout + paint + composite" — `transform`/`opacity` are the only properties
that should animate. This bar is a simple horizontal fill inside a
fixed-size track (`#soak_timer_bar_wrap`, `height:6px`), which is exactly the
case `AUDIT.md` §8 names as a `transform`-friendly pattern
("`translate` percentages ... as tools for these — no hardcoded pixel
offsets" — the same principle applies to `scaleX` for a fill-from-left bar).

## Target

Make the bar element always full track width, and drive the visual fill via
`transform: scaleX()` from a fixed `transform-origin: left` instead of
`width`:

```html
<!-- index.html:517 — target -->
<div id="soak_timer_bar" style="height:100%;width:100%;transform:scaleX(0);transform-origin:left;background:#10b981;border-radius:3px;transition:transform 1s linear;"></div>
```

```js
/* js/cop15.js:5302 — target */
document.getElementById('soak_timer_bar').style.transform = 'scaleX(0)';
```
```js
/* js/cop15.js:5324 — target */
document.getElementById('soak_timer_bar').style.transform = 'scaleX(1)';
```
```js
/* js/cop15.js:5380 — target */
document.getElementById('soak_timer_bar').style.transform = 'scaleX(' + (pct / 100).toFixed(4) + ')';
```
```js
/* js/cop15.js:5407 — target */
document.getElementById('soak_timer_bar').style.transform = 'scaleX(1)';
```

All `.style.background = ...` lines (5303, 5325, 5381) stay exactly as they
are — `background-color` is a fine property to keep animating/setting
directly (it's not a layout property), this plan only touches `width`.

## Repo conventions to follow

- No existing bar in this codebase already uses the `scaleX` pattern — this
  is a new pattern for this file. Keep it minimal and inline, matching the
  existing style of directly setting `.style.<prop>` from JS (don't
  introduce a helper function for this single use case).

## Steps

1. Edit `index.html:517` — change `width:0%` to `width:100%`, add
   `transform:scaleX(0);transform-origin:left;` right after it, and change
   `transition:width 1s linear` to `transition:transform 1s linear`.
2. Edit `js/cop15.js:5302` — change `.style.width = '0%';` to
   `.style.transform = 'scaleX(0)';`.
3. Edit `js/cop15.js:5324` — change `.style.width = '100%';` to
   `.style.transform = 'scaleX(1)';`.
4. Edit `js/cop15.js:5380` — change
   `.style.width = pct.toFixed(1) + '%';` to
   `.style.transform = 'scaleX(' + (pct / 100).toFixed(4) + ')';`.
5. Edit `js/cop15.js:5407` — change `.style.width = '100%';` to
   `.style.transform = 'scaleX(1)';`.
6. Leave every `.style.background = ...` line on this element untouched.

## Boundaries

- Do NOT change `#soak_timer_bar_wrap`'s CSS (the track container) — only
  `#soak_timer_bar` (the fill).
- Do NOT change the `1s` duration or the `setInterval(soakTimerTick, 1000)`
  cadence.
- Do NOT touch any `.style.background` assignment on this element.
- If any cited line's code doesn't match what's shown above (drift since
  commit `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `node --check js/cop15.js` (must pass with no output).
- **Feel check**: Start a soak timer (or use a short test duration if the app
  supports one) and watch the bar fill over the first minute. Confirm it
  fills smoothly left-to-right exactly as before (visually indistinguishable
  from the old `width`-based fill). Let it run to completion (or trigger the
  completion path) and confirm the bar reaches fully filled. In DevTools
  Performance panel, record ~10 seconds of an active soak tick and confirm
  no "Layout" events are attributed to `#soak_timer_bar` (only
  "Composite Layers").
- **Done when**: the bar visually fills identically to before, and Chrome
  DevTools Rendering → "Layout Shift Regions"/Performance panel shows no
  layout thrashing from this element during a running timer.
