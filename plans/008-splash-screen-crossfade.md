# 008 — Mask the splash-screen crossfade over live content

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`styles.css`), 1 keyframe changed

## Problem

`splashHide()` only fades the splash screen's opacity out over 500ms; it
never masks or hides the already-rendered, already-interactive app content
sitting directly underneath it:

```js
/* js/app.js:4246-4250 — current */
function splashHide() {
    var splash = document.getElementById('splash-screen');
    if (!splash) return;
    splash.classList.add('splash-exit');
    setTimeout(function() { splash.style.display = 'none'; }, 500);
}
```

```css
/* styles.css:1628-1634 — current */
.splash-exit {
    animation: splashFadeOut 0.5s ease forwards;
}
@keyframes splashFadeOut {
    from { opacity: 1; }
    to { opacity: 0; pointer-events: none; }
}
```

`.splash-screen` is a fully opaque, full-viewport overlay
(`background: linear-gradient(135deg, #05141f 0%, #0a1628 50%, #0f1d30
100%)`, `position: fixed; inset: 0; z-index: 99999`). For the full 500ms
fade, the solid dark splash content (logo, progress bar) thins out directly
on top of the already-rendered dashboard beneath it — a textbook double-expose
crossfade per `AUDIT.md` §7 ("A jarring crossfade that shows two overlapping
states can be masked with subtle `filter: blur(2px)` during the
transition"). This happens on **every cold load and every reload** — the
single most-seen transition in the app.

## Target

Add a `filter: blur()` ramp to the existing fade-out keyframe so the splash
dissolves into a soft blur as it thins, rather than staying crisp while
becoming transparent (which is what makes the underlying app legible/jarring
during the overlap):

```css
/* styles.css:1628-1634 — target */
.splash-exit {
    animation: splashFadeOut 0.5s ease forwards;
}
@keyframes splashFadeOut {
    from { opacity: 1; filter: blur(0); }
    to { opacity: 0; filter: blur(6px); pointer-events: none; }
}
```

## Repo conventions to follow

- Keep the existing `0.5s` duration and `pointer-events: none` end-state —
  this plan only adds a `filter` ramp, it doesn't change timing or
  interactivity.
- `6px` stays well under `AUDIT.md` §5's "keep transition-time `filter:
  blur()` under 20px — heavy blur is expensive" budget.

## Steps

1. Open `styles.css`, locate `@keyframes splashFadeOut` (around line
   1632-1634).
2. Add `filter: blur(0);` to the `from { }` rule (alongside the existing
   `opacity: 1;`).
3. Add `filter: blur(6px);` to the `to { }` rule (alongside the existing
   `opacity: 0; pointer-events: none;`).
4. Leave `.splash-exit`'s `animation:` line and `js/app.js:4246-4250`
   unchanged — no JS changes needed for this plan.

## Boundaries

- Do NOT change the 500ms duration or the `setTimeout(..., 500)` in
  `js/app.js` — they must stay in sync (the `filter`/`opacity` ramp and the
  JS timeout that hides the element need matching durations).
- Do NOT touch `.splash-screen`'s entrance (`splashFadeIn`) — only the exit
  (`splashFadeOut`) is in scope.
- Do NOT increase blur beyond ~6-8px — heavier blur is expensive per
  `AUDIT.md` §5 and unnecessary for a full-screen mask at this duration.
- If the cited code doesn't match what's shown above (drift since commit
  `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: run `./build.sh` and confirm it completes without a
  CSS-related error.
- **Feel check**: Do a hard reload of the app (clear cache or open in a
  private window) and watch the splash-to-dashboard transition. Confirm the
  splash screen now visibly softens/blurs as it fades rather than staying
  sharp while the dashboard shows through underneath. In DevTools Animations
  panel, set playback to 10% during a reload and confirm the mid-transition
  frame reads as "a soft blur dissolving" rather than "two sharp layers
  overlapping."
- **Done when**: the cold-load transition no longer shows a legible
  double-exposure of splash content and dashboard content at the same time.
