# 003 — Debounce the Kanban search box

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: HIGH
- **Category**: Purpose & frequency / Interruptibility
- **Estimated scope**: 1 file (`js/cop15.js`), ~3 lines changed

## Problem

`js/cop15.js:5489` wires the Kanban board's search input directly to
`renderKanban()` on every keystroke, undebounced:

```js
/* js/cop15.js:5489 — current */
html += '<input type="text" placeholder="Buscar VIN, modelo, operador..." value="' + (_kanbanFilters.search || '') + '" oninput="_kanbanFilters.search=this.value;renderKanban();" style="flex:1 1 140px;min-width:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">';
```

`renderKanban()` rebuilds every column's cards from scratch and, on each
call, re-plays the entrance stagger animation on the whole board:

```js
/* js/cop15.js:5611-5614 — current */
if (typeof animateStaggerChildren === 'function') {
    var cols = kanbanEl.querySelectorAll('.kanban-col-body');
    cols.forEach(function(col) {
        animateStaggerChildren(col, '.anim-card-hover', 40);
    });
}
```

So every single character typed into the search box tears down and re-fades
every card on the pipeline board. This is exactly the failure mode `AUDIT.md`
§4 names: "`@keyframes` on ... rapidly-triggered UI" — the whole board
visibly flickers to blank and re-fades in on each keystroke.

The codebase already has the right pattern elsewhere and just isn't using it
here — `js/testplan.js` debounces its equivalent search/slider inputs:

```js
/* js/testplan.js:6-7 — current, exists and works correctly */
var _tpDebouncedDashRender = debounce(tpRenderDashTable, 250);
var _tpDebouncedRender = debounce(tpRender, 250);
```

```js
/* js/testplan.js:1199 — current, correct pattern to copy */
<input class="tp-input" placeholder="Buscar config..." style="max-width:220px;" id="tp-dash-search" oninput="_tpDebouncedDashRender()">
```

## Target

Add a debounced wrapper for `renderKanban` in `js/cop15.js` and use it in the
search box's `oninput`:

```js
/* js/cop15.js — target, add near the top of the Kanban section (wherever
   renderKanban is defined, add this one line right before the function or
   in the same module-scope area as other kanban state vars like _kanbanFilters) */
var _kanbanDebouncedRender = debounce(renderKanban, 250);
```

```js
/* js/cop15.js:5489 — target */
html += '<input type="text" placeholder="Buscar VIN, modelo, operador..." value="' + (_kanbanFilters.search || '') + '" oninput="_kanbanFilters.search=this.value;_kanbanDebouncedRender();" style="flex:1 1 140px;min-width:0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">';
```

Leave the sort `<select>` (line 5490), operator `<select>` (line 5497), and
"✕ Limpiar" button (line 5505) calling `renderKanban()` directly and
undebounced — those are discrete, single-shot actions (a dropdown pick or a
button click), not the rapid-repeat text-input case this plan targets.

## Repo conventions to follow

- `debounce(fn, ms)` is already a shared utility used by `testplan.js` (see
  `js/testplan.js:6-7`) — confirm it's defined in `js/app.js` (search for
  `function debounce`) and reuse that exact function; do not write a second
  debounce implementation.
- `js/testplan.js:1199` is the exemplar: a debounced render function assigned
  to a module-scope `var`, called directly from `oninput` with no arguments.

## Steps

1. Confirm `debounce` is defined once, shared, and accessible from
   `js/cop15.js` (it's loaded after `app.js` per the script load order in
   `CLAUDE.md`, so a global `function debounce(fn, ms) {...}` in `app.js` is
   directly callable). If for some reason it is NOT globally accessible, STOP
   and report — do not duplicate the function.
2. In `js/cop15.js`, near `renderKanban`'s definition (around line 5450) or
   alongside `_kanbanFilters`'s declaration, add:
   `var _kanbanDebouncedRender = debounce(renderKanban, 250);`
3. Edit line 5489's `oninput` attribute: replace
   `_kanbanFilters.search=this.value;renderKanban();` with
   `_kanbanFilters.search=this.value;_kanbanDebouncedRender();`.
4. Leave lines 5490, 5497, and 5505 unchanged.

## Boundaries

- Do NOT debounce the sort/filter `<select>` `onchange` handlers or the
  "Limpiar" button — only the free-text search `oninput`.
- Do NOT modify `animateStaggerChildren` or the stagger-replay logic itself —
  that's correct behavior for a genuine re-render; the fix here is reducing
  how often a re-render happens, not changing what a re-render does.
- Do NOT introduce a new debounce implementation if `debounce` already exists
  globally — reuse it.
- If `debounce` is not found anywhere in the codebase (contradicting the
  `testplan.js` usage cited above), STOP and report instead of writing one.

## Verification

- **Mechanical**: `node --check js/cop15.js` (must pass with no output).
- **Feel check**: Open COP15 → Kanban tab, type a multi-character search query
  quickly (e.g. "TOYOTA") into the search box. Confirm:
  - The board does NOT visibly flicker/re-fade after each individual
    keystroke.
  - After you stop typing (~250ms pause), the board updates once to the
    filtered result with the normal stagger-fade.
  - The sort dropdown, operator dropdown, and "✕ Limpiar" button still update
    the board immediately (no added delay) since those weren't debounced.
- **Done when**: typing a 6+ character search query produces exactly one
  board re-render (visible as one stagger-fade), not one per keystroke.
