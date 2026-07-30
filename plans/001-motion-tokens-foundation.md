# 001 — Introduce shared easing/duration motion tokens

- **Status**: DONE
- **Commit**: ab531df
- **Severity**: MEDIUM
- **Category**: Easing & duration / Cohesion & tokens
- **Estimated scope**: 1 file (`styles.css`), ~14 call sites edited in the same file

## Problem

`styles.css` has zero shared easing/duration CSS custom properties. Every
transition/animation hardcodes its own duration and curve ad hoc. Confirmed via
direct grep on the current file:

- 20+ distinct hand-typed duration literals (`0.2s`×68, `0.15s`×45, `0.3s`×29,
  `0.25s`×10, plus stray `0.4s`, `0.5s`, `0.6s`, `0.35s`, `0.18s`, `120ms`, etc.)
- `ease` used bare 63 times
- 5 different hand-typed `cubic-bezier()` curves with no names/tokens:
  `cubic-bezier(0.34, 1.56, 0.64, 1)` ×3, `cubic-bezier(0.16, 1, 0.3, 1)` ×1,
  `cubic-bezier(0.4, 0, 0.2, 1)` ×1, `cubic-bezier(0,0,0.2,1)` ×2,
  `cubic-bezier(0.4,0,1,1)` ×2

Representative examples of bare `ease` on UI entrances/exits that should use a
strong custom curve instead (per `AUDIT.md` §2, "Built-in CSS easings are too
weak for deliberate motion"):

```css
/* styles.css:855 — current, global confirm/alert dialog overlay */
.custom-modal-overlay {
    animation: modalFadeIn 0.25s ease; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
```

```css
/* styles.css:1985 — current, Cascade field-help "?" popup (all 7 modules) */
.cascade-tooltip-popup {
    ...
    padding: 20px; animation: modalFadeIn 0.2s ease;
}
```

```css
/* styles.css:2278 — current, Inventory floor-plan cylinder tooltip */
.inv-cylinder-tooltip { ...animation: tooltipFadeIn 0.15s ease; }
```

```js
/* js/app.js:1134 — current, confirm/alert dialog EXIT path (customConfirm close()) */
overlay.style.transition = 'opacity 0.15s ease';
```

```css
/* styles.css:2436 — current, draft-resume banner entrance */
.v7-draft-banner { ...animation: v7SlideDown 0.3s ease; }
```

```css
/* styles.css:2188, 2203-2204 — current, accordion/drill-down entrances (representative
   of a repeated pattern also at 2062-2063 tabFadeIn/tabFadeOut, 2132) */
details.acc > .acc-body, details.acc > div:not(summary) { overflow: hidden; animation: accordionOpen 0.3s ease; }
.drill-down-enter { animation: drillIn 0.25s ease both; }
.drill-down-exit { animation: drillOut 0.2s ease both; }
```

```js
/* js/cop15.js:2047 — current, auto-advance status toast shown during vehicle-status transitions */
toast.style.cssText = '...animation:slideUp 0.3s ease;...';
```

## Target

Add a token block near the top of `styles.css`, inside the existing `:root { ... }`
block (search for the first `:root {` — it already holds `--kia-red`,
`--shadow-*`, etc.; add these alongside them, do not create a second `:root`):

```css
/* target — new tokens inside the existing :root block */
:root {
  /* ...existing tokens... */

  /* Motion tokens (introduced by plan 001) */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);        /* strong ease-out for UI entrances/exits */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);    /* strong ease-in-out for on-screen movement */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);     /* iOS-like drawer/sheet curve */

  --dur-fast: 150ms;    /* button press feedback, small popovers */
  --dur-base: 200ms;    /* dropdowns, tooltips, standard entrances */
  --dur-slow: 300ms;    /* modals, drawers */
}
```

Then swap every bare-`ease` UI entrance/exit onto `var(--ease-out)` (keep the
existing duration unless it already fell inside plan 001's target — do NOT
change durations here, that's out of scope; only the curve changes in this
plan):

```css
/* styles.css:855 — target */
.custom-modal-overlay {
    animation: modalFadeIn 0.25s var(--ease-out); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
```

```css
/* styles.css:1985 — target */
.cascade-tooltip-popup {
    ...
    padding: 20px; animation: modalFadeIn 0.2s var(--ease-out);
}
```

```css
/* styles.css:2278 — target */
.inv-cylinder-tooltip { ...animation: tooltipFadeIn 0.15s var(--ease-out); }
```

```js
/* js/app.js:1134 — target */
overlay.style.transition = 'opacity 0.15s var(--ease-out)';
```

```css
/* styles.css:2436 — target */
.v7-draft-banner { ...animation: v7SlideDown 0.3s var(--ease-out); }
```

```css
/* styles.css:2188, 2203-2204 — target */
details.acc > .acc-body, details.acc > div:not(summary) { overflow: hidden; animation: accordionOpen 0.3s var(--ease-out); }
.drill-down-enter { animation: drillIn 0.25s var(--ease-out) both; }
.drill-down-exit { animation: drillOut 0.2s var(--ease-out) both; }
```

```js
/* js/cop15.js:2047 — target */
toast.style.cssText = '...animation:slideUp 0.3s var(--ease-out);...';
```

Also apply `var(--ease-out)` to these additional bare-`ease` UI entrances found
in the same sweep (grep `animation:.*\bease\b` and `transition:.*\bease\b` in
`styles.css` after adding the tokens to catch every remaining one — the list
above is representative, not exhaustive; every bare-`ease` hit on a UI
entrance/exit/hover-color-change transition should move to the matching
token). Do NOT touch:
- `ease-in-out` occurrences (already correct per AUDIT.md §2 for on-screen movement — leave as-is).
- `linear` occurrences (correct for constant motion like progress bars/marquees — leave as-is).
- The bounce curves at `styles.css:861,2423,2465` (`cubic-bezier(0.34, 1.56, 0.64, 1)`) — those are handled by plan 008, not this one.
- Anything already fixed in a prior pass: `.platform-section.swipe-*` keyframes, `.toast` entrance (already `cubic-bezier(0.16, 1, 0.3, 1)`), `.detail-back-btn`, `.inv-floorplan-toolbar button`.

## Repo conventions to follow

- All existing design tokens (colors, shadows, spacing, radii) live in a single
  `:root { }` block at the top of `styles.css` — e.g. `--kia-red`, `--shadow-sm`,
  `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--space-sm` through `--space-2xl`,
  `--radius-md`/`--radius-lg`/`--radius-xl`. Add the new `--ease-*`/`--dur-*`
  tokens into that same block, following the existing naming style (lowercase,
  hyphenated, `--category-variant`).
- The codebase already uses `var(--token-name)` everywhere else (e.g.
  `box-shadow: var(--shadow-md)`) — use the same `var(...)` syntax for the new
  motion tokens, not raw values.

## Steps

1. Open `styles.css`, find the first `:root {` block (near the top of the file,
   alongside `--kia-red` and the `--shadow-*`/`--space-*` tokens). Add the six
   new custom properties (`--ease-out`, `--ease-in-out`, `--ease-drawer`,
   `--dur-fast`, `--dur-base`, `--dur-slow`) exactly as shown in Target, with
   the same comments.
2. Edit `styles.css:855` (`.custom-modal-overlay`) — replace `ease` with
   `var(--ease-out)` in the `animation:` line.
3. Edit `styles.css:1985` (`.cascade-tooltip-popup`) — replace `ease` with
   `var(--ease-out)`.
4. Edit `styles.css:2278` (`.inv-cylinder-tooltip`) — replace `ease` with
   `var(--ease-out)`.
5. Edit `js/app.js:1134` — replace `'opacity 0.15s ease'` with
   `'opacity 0.15s var(--ease-out)'`.
6. Edit `styles.css:2436` (`.v7-draft-banner`) — replace `ease` with
   `var(--ease-out)`.
7. Edit `styles.css:2188` (`accordionOpen` usage on `details.acc > .acc-body`
   etc.) and `styles.css:2203-2204` (`.drill-down-enter`/`.drill-down-exit`) —
   replace `ease` with `var(--ease-out)` in each `animation:` line.
8. Edit `js/cop15.js:2047` — replace `ease` with `var(--ease-out)` inside the
   `toast.style.cssText` string.
9. Run `grep -n "animation:.*\bease\b\|transition:.*\bease\b" styles.css` and
   review every remaining hit. For each one that animates a UI
   entrance/exit/hover-color-change (not `ease-in-out`, not `linear`, not the
   three bounce-curve lines reserved for plan 008), replace `ease` with
   `var(--ease-out)`. Skip anything already covered by the prior fix pass
   (swipe transitions, `.toast`, `.detail-back-btn`, `.inv-floorplan-toolbar
   button`).

## Boundaries

- Do NOT change any duration values in this plan — only the easing curve.
- Do NOT touch the bounce curves (`cubic-bezier(0.34, 1.56, 0.64, 1)`) at
  `styles.css:861,2423,2465` — that's plan 008's scope.
- Do NOT touch `ease-in-out` or `linear` usages.
- Do NOT add new dependencies or a preprocessor — plain CSS custom properties only.
- If a cited line's code doesn't match what's shown above (drift since commit
  `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `node --check js/app.js` and `node --check js/cop15.js` (must
  pass with no output). Open `styles.css` and confirm the new `:root` block
  has valid syntax (no unclosed braces) by running `./build.sh` and checking
  it completes without a CSS-related error in the console output.
- **Feel check**: Open the app, trigger a confirm dialog (e.g. delete a test
  plan row) and a Cascade "?" tooltip. In DevTools → Rendering → set
  `prefers-reduced-motion` off, then Animations panel → set playback to 10%
  and confirm both entrances now visibly "snap in and settle" (fast start,
  gentle finish) rather than the flat, mechanical feel of default `ease`.
- **Done when**: `grep -c "var(--ease-out)" styles.css` returns at least 10,
  and `grep -n "animation:.*\bease\b\|transition:.*\bease\b" styles.css`
  returns only `ease-in-out`/`linear` lines and the three reserved bounce-curve
  lines.
