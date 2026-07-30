# 005 — Throttle floor-plan zone drag/resize re-renders to one per frame

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: HIGH
- **Category**: Performance
- **Estimated scope**: 1 file (`js/inventory.js`), ~10 lines changed

## Problem

The Inventory floor-plan zone drag/resize handler calls `invRender()` — a full
`innerHTML` rebuild of the entire floor-plan tab (all zones, cylinders,
labels, resize handles) — synchronously on every raw `pointermove`/`mousemove`
event, unthrottled:

```js
/* js/inventory.js:2895-2926 — current */
function onPointerMove(e) {
    if (!_invFloorPlanDrag.active) return;
    e.preventDefault();
    var clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    var clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
    var svgPt = getSvgPoint(clientX, clientY);
    var lay = invState.zoneLayout[_invFloorPlanDrag.zoneId];
    var orig = _invFloorPlanDrag.origLayout;

    if (_invFloorPlanDrag.resizing) {
        var dx = svgPt.x - _invFloorPlanDrag.startX;
        var dy = svgPt.y - _invFloorPlanDrag.startY;
        var h = _invFloorPlanDrag.handle;
        if (h === 'se') {
            lay.w = Math.max(100, orig.w + dx);
            lay.h = Math.max(80, orig.h + dy);
        } else if (h === 'ne') {
            lay.w = Math.max(100, orig.w + dx);
            var newH = orig.h - dy;
            if (newH >= 80) { lay.h = newH; lay.y = orig.y + dy; }
        } else if (h === 'sw') {
            var newW = orig.w - dx;
            if (newW >= 100) { lay.w = newW; lay.x = orig.x + dx; }
            lay.h = Math.max(80, orig.h + dy);
        }
    } else {
        lay.x = Math.max(0, svgPt.x - _invFloorPlanDrag.offsetX);
        lay.y = Math.max(0, svgPt.y - _invFloorPlanDrag.offsetY);
    }
    // Live re-render
    invRender();
}
```

Raw pointer/mouse move events can fire far more often than the display's
refresh rate (especially on high-polling-rate mice or touchscreens), so this
handler can trigger dozens of full-component rebuilds per second. Per
`AUDIT.md` §5: "CSS (and WAAPI) beat rAF-based JS under load — use CSS for
predetermined motion, JS/springs for dynamic and gesture-driven motion" — the
standard fix for uncoalesced high-frequency input handlers driving expensive
work is to batch them into `requestAnimationFrame`, capping the work to once
per rendered frame. This is a touch-first feature (`inv-floorplan-container`
has `touch-action: none`) used by lab techs editing the floor plan, per
`CLAUDE.md`.

Note: the gas-slot drag ghost handler at `js/inventory.js:3055` (a *different*
`onPointerMove` in a different closure) is **already correct** — it moves a
single ghost element's `style.left`/`style.top` directly with no full
re-render, and is explicitly out of scope for this plan.

## Target

Coalesce the zone-layout mutation (cheap, keep synchronous) from the
re-render (expensive) using a single pending-frame flag scoped to this
closure:

```js
/* js/inventory.js — target, add near var _invFloorPlanDrag (line 2449) or
   immediately before the onPointerMove function definition (line 2895) —
   same enclosing scope as onPointerMove so both can see it */
var _invFloorPlanRenderPending = false;
```

```js
/* js/inventory.js:2895-2926 — target */
function onPointerMove(e) {
    if (!_invFloorPlanDrag.active) return;
    e.preventDefault();
    var clientX = e.clientX !== undefined ? e.clientX : e.touches[0].clientX;
    var clientY = e.clientY !== undefined ? e.clientY : e.touches[0].clientY;
    var svgPt = getSvgPoint(clientX, clientY);
    var lay = invState.zoneLayout[_invFloorPlanDrag.zoneId];
    var orig = _invFloorPlanDrag.origLayout;

    if (_invFloorPlanDrag.resizing) {
        var dx = svgPt.x - _invFloorPlanDrag.startX;
        var dy = svgPt.y - _invFloorPlanDrag.startY;
        var h = _invFloorPlanDrag.handle;
        if (h === 'se') {
            lay.w = Math.max(100, orig.w + dx);
            lay.h = Math.max(80, orig.h + dy);
        } else if (h === 'ne') {
            lay.w = Math.max(100, orig.w + dx);
            var newH = orig.h - dy;
            if (newH >= 80) { lay.h = newH; lay.y = orig.y + dy; }
        } else if (h === 'sw') {
            var newW = orig.w - dx;
            if (newW >= 100) { lay.w = newW; lay.x = orig.x + dx; }
            lay.h = Math.max(80, orig.h + dy);
        }
    } else {
        lay.x = Math.max(0, svgPt.x - _invFloorPlanDrag.offsetX);
        lay.y = Math.max(0, svgPt.y - _invFloorPlanDrag.offsetY);
    }
    // Coalesce rapid pointermove events into at most one re-render per frame.
    if (!_invFloorPlanRenderPending) {
        _invFloorPlanRenderPending = true;
        requestAnimationFrame(function() {
            _invFloorPlanRenderPending = false;
            invRender();
        });
    }
}
```

## Repo conventions to follow

- `_invFloorPlanDrag` (`js/inventory.js:2449`) is a module-scope `var` shared
  across `onPointerDown`/`onPointerMove`/`onPointerUp` in the same enclosing
  function — declare `_invFloorPlanRenderPending` the same way, right next to
  it, following the existing `_inv*` naming prefix convention from
  `CLAUDE.md` ("`inv*` = Inventory").
- Do not introduce a generic/reusable rAF-throttle helper — this codebase has
  no such utility and this is the only call site that needs it; a local flag
  is consistent with the codebase's plain-function style.

## Steps

1. Open `js/inventory.js`, locate `var _invFloorPlanDrag = { active: false, ...`
   (around line 2449). Immediately after that line, add:
   `var _invFloorPlanRenderPending = false;`
2. Locate `function onPointerMove(e) {` (around line 2895, inside the same
   enclosing function as `_invFloorPlanDrag`'s usage — confirm by checking
   `onPointerDown`/`onPointerUp` are defined nearby, as shown in the Problem
   section).
3. Replace the final two lines of that function —
   ```js
       // Live re-render
       invRender();
   }
   ```
   — with:
   ```js
       // Coalesce rapid pointermove events into at most one re-render per frame.
       if (!_invFloorPlanRenderPending) {
           _invFloorPlanRenderPending = true;
           requestAnimationFrame(function() {
               _invFloorPlanRenderPending = false;
               invRender();
           });
       }
   }
   ```
4. Leave everything above that (the resize/move math, `onPointerDown`,
   `onPointerUp`, event listener wiring) unchanged.

## Boundaries

- Do NOT touch the second `onPointerMove` at `js/inventory.js:3055` (gas-slot
  drag ghost) — it's a different, already-correct implementation.
- Do NOT change `invRender()` itself, or attempt to make it do a partial/
  targeted DOM update instead of a full rebuild — that's a larger refactor
  out of scope for this plan; this plan only caps how *often* the existing
  full rebuild can fire.
- Do NOT add a generic rAF-throttle utility function — keep the fix local to
  this closure with a single boolean flag, as shown.
- If the cited code doesn't match what's shown above (drift since commit
  `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `node --check js/inventory.js` (must pass with no output).
- **Feel check**: Open Inventory → floor plan (zone-map tab), enter edit mode,
  and drag a zone around the SVG canvas quickly in circles for a few seconds
  on both desktop (mouse) and a touch device if available. Confirm:
  - The zone visibly follows the pointer with no perceptible added lag
    compared to before the change.
  - In DevTools Performance panel, record a ~3s drag and confirm the number
    of "Recalculate Style"/"Layout" events during the drag drops noticeably
    compared to a pre-fix recording (roughly capped to the number of actual
    animation frames rendered, not the raw pointermove event count).
  - Release the drag (pointerup) and confirm the zone lands at the correct
    final position — no visible snap-back or stale intermediate position.
  - Try a resize handle drag too (not just a move) and confirm the same
    smoothness and correct final size.
- **Done when**: dragging/resizing a zone feels at least as smooth as before
  (ideally smoother under rapid movement), and the final committed
  position/size after release is always correct.
