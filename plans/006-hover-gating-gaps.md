# 006 — Close remaining ungated hover-transform gaps

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 1 file (`styles.css`), ~10 lines changed

## Problem

A prior pass added a `@media (hover: hover) and (pointer: fine)` block
(`styles.css:1314-1329`) to stop hover-triggered transforms from sticking
after a tap on this touch-first app. Two live, pervasive hover-transform rules
were missed by that sweep, plus one dead duplicate rule sits outside the
gated block as a landmine.

**1. `.cascade-help-btn:hover`** — the v16.0 accessibility "?" tooltip button
injected next to form fields across all 7 modules (`CASCADE_TOOLTIPS`,
`cascadeInjectTooltips`):

```css
/* styles.css:1969-1972 — current, NOT inside the gated media block */
.cascade-help-btn:hover {
    background: var(--accent-cascade, #bb162b); color: #fff;
    transform: scale(1.15);
}
```

**2. `.anim-card-hover:hover`** — confirmed live on the Kanban pipeline cards
(`js/cop15.js:5554`, entrance-animated via `js/cop15.js:5613`) and the Lab
Overview KPI mini-cards (`js/panel.js:314`):

```css
/* styles.css:1484-1490 — current, NOT inside the gated media block */
.anim-card-hover { transition: transform 0.2s ease, box-shadow 0.25s ease; }
.anim-card-hover:hover {
    transform: translateY(-2px) scale(1.008);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}
```

On touch, a tap leaves both of these visually "stuck" scaled/lifted until the
user taps elsewhere — per `AUDIT.md` §6, "ungated `:hover` motion."

**3. Landmine (not a live bug today, but a correctness trap):** a duplicate,
ungated `.daily-dash-card:hover` rule exists later in the file, at equal CSS
specificity to the gated combined selector, so source order means this one
would silently win and re-enable the exact motion the gated block was meant
to prevent — if `.daily-dash-card` is ever reused:

```css
/* styles.css:1314-1316 — current, inside the gated block, includes .daily-dash-card */
.card:hover, .tp-card:hover, .daily-dash-card:hover, .lab-dash-card:hover {
    box-shadow: var(--shadow-md); transform: translateY(-1px);
}
```

```css
/* styles.css:1821-1823 — current, ungated duplicate, comes later so it wins */
.daily-dash-card:hover {
    box-shadow: var(--shadow-md); transform: translateY(-1px);
}
```

Confirmed via `grep -rn "daily-dash-card\b" js/*.js index.html`: the class is
not applied anywhere today, so this is currently inert — but it's a footgun
worth removing while touching this exact area of the file.

## Target

Move rules 1 and 2 into the existing gated block, keep their non-transform
transition properties (`background-color`/`color` for the help button) as
unconditional (harmless on touch), and delete the dead duplicate:

```css
/* styles.css:1969 area — target: keep only the non-transform hover feedback here */
/* (leave .cascade-help-btn's base rule, including its `transition:` line, untouched — only its :hover block moves) */
```

```css
/* styles.css:1314-1329 — target, add these two lines inside the existing block */
@media (hover: hover) and (pointer: fine) {
    .card:hover, .tp-card:hover, .daily-dash-card:hover, .lab-dash-card:hover {
        box-shadow: var(--shadow-md); transform: translateY(-1px);
    }
    .tp-metric:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }
    .bottom-nav-item:hover .bnav-icon { transform: translateY(-1px); }
    .vcl-toggle:hover { transform: scale(1.1); }
    .interactive-hover:hover { transform: translateY(-1px); }
    .inv-cylinder:hover { stroke-width: 3; transform: scale(1.15); transform-origin: center; }
    .fab:hover { transform: scale(1.08); box-shadow: var(--shadow-xl); }
    .v7-config-chip:hover, .v7-fav-chip:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .cascade-help-btn:hover { background: var(--accent-cascade, #bb162b); color: #fff; transform: scale(1.15); }
    .anim-card-hover:hover { transform: translateY(-2px) scale(1.008); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
}
```

```css
/* styles.css:1969-1972 — target, remove this rule from its original location
   (moved into the gated block above) */
/* (deleted) */
```

```css
/* styles.css:1484-1490 — target */
.anim-card-hover { transition: transform 0.2s ease, box-shadow 0.25s ease; }
/* .anim-card-hover:hover rule removed from here (moved into the gated block above) */
```

```css
/* styles.css:1821-1823 — target */
/* (deleted entirely — dead duplicate) */
```

## Repo conventions to follow

- The gated block already exists at `styles.css:1314-1329` (added in a prior
  pass, header comment `[R3-M2] ACCESSIBILITY — Hover gating (touch is
  primary input here)`) — extend that exact block, don't create a second one.
- The established pattern in that block (see `.fab:hover`, `.inv-cylinder:hover`)
  is: move the ENTIRE `:hover` rule body into the gated block, don't split
  properties across two locations.

## Steps

1. Open `styles.css`, locate the gated block at line 1314
   (`@media (hover: hover) and (pointer: fine) {`). Before its closing `}`
   (line 1329), add two new lines:
   `.cascade-help-btn:hover { background: var(--accent-cascade, #bb162b); color: #fff; transform: scale(1.15); }`
   and
   `.anim-card-hover:hover { transform: translateY(-2px) scale(1.008); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }`
2. Locate the original `.cascade-help-btn:hover { ... }` rule (around line
   1969, inside the "CASCADE FIELD TOOLTIPS" section) and delete it. Leave
   the base `.cascade-help-btn { ... }` rule (including its `transition:`
   line) untouched.
3. Locate the original `.anim-card-hover:hover { ... }` rule (around line
   1487, right after `.anim-card-hover { transition: ... }`) and delete it.
   Leave the base `.anim-card-hover { transition: ... }` rule untouched.
4. Locate the dead duplicate `.daily-dash-card:hover { box-shadow: ...;
   transform: ...; }` rule (around line 1821) and delete it entirely —
   `.daily-dash-card:hover` is already covered by the combined selector
   inside the gated block from step 1's context (line 1315), so nothing is
   lost.

## Boundaries

- Do NOT touch any other rule inside the existing gated block.
- Do NOT change `.cascade-help-btn`'s or `.anim-card-hover`'s base
  (non-`:hover`) rules.
- Do NOT remove `.daily-dash-card`'s other rules (e.g. its base style, icon,
  or any non-hover rule) — only the dead `:hover` duplicate.
- If any of the cited rules don't match what's shown above (drift since
  commit `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: run `./build.sh` and confirm it completes without a
  CSS-related error. `grep -c "\.cascade-help-btn:hover\|\.anim-card-hover:hover\|\.daily-dash-card:hover"  styles.css` should return exactly 2 (only the two newly-added lines inside the gated block remain, plus zero for the deleted daily-dash-card rule — total should be 2, not 3+).
- **Feel check**: On a touch device (or Chrome DevTools device toolbar with
  touch simulation on), tap a Cascade field's "?" help button and tap a
  Kanban pipeline card. Confirm neither one stays visually scaled/lifted
  after the tap ends (no stuck hover state). On a real mouse/trackpad,
  confirm hovering both still shows the intended lift/scale feedback.
- **Done when**: no `:hover` rule containing `transform` exists anywhere in
  `styles.css` outside the `@media (hover: hover) and (pointer: fine)` block
  (verify with `grep -B2 "transform" styles.css | grep ":hover"` and manually
  confirm every hit is inside the gated block's line range).
