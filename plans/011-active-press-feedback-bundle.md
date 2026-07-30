# 011 — Add `:active` press feedback to four touch-first controls

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files (`styles.css`, `js/cop15.js`), 4 rules added
- **Depends on**: Plan 001 (motion tokens) — this plan uses `var(--ease-out)`, apply 001 first.

## Problem

Four clickable elements have only a `:hover` state (which never fires on the
touch devices this app primarily targets, per `CLAUDE.md`: "Used daily on
smartphones/tablets") and no `:active` press feedback at all. Per `AUDIT.md`
§3: "Press feedback: `transform: scale(0.97)` on `:active` with `transition:
transform 160ms ease-out`. Keep it subtle (0.95–0.98)."

**1. Lab Overview KPI cards** (shown on both HOY and Panel dashboards, the
most-viewed screen in the app):

```css
/* styles.css:1224 — current */
.lab-dash-card { background: #fff; border-radius: 12px; padding: 16px; text-align: center; cursor: pointer; border: 1px solid #e2e8f0; transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s; box-shadow: var(--shadow-sm); }
```
(no `:active` rule exists for `.lab-dash-card` anywhere in the file)

**2. Auto-advance status toast "Sí"/"No" buttons** (`js/cop15.js`, shown
repeatedly through every vehicle test's workflow):

```js
/* js/cop15.js:2052-2053 — current, raw inline styles, no shared class, no press feedback */
html += '<button onclick="applyAutoAdvance(\'' + nextStatus + '\')" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">Si</button>';
html += '<button onclick="this.parentElement.remove()" style="background:transparent;color:#94a3b8;border:1px solid #475569;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;">No</button>';
```

**3. Compact/Detailed view-mode toggle** (used across module list views):

```css
/* styles.css:911-915 — current */
.view-mode-toggle button {
    padding: 4px 8px; border: none; border-radius: 6px; cursor: pointer;
    background: transparent; color: #64748b; font-size: var(--fs-2xs, 11px); transition: background-color 0.15s, color 0.15s, box-shadow 0.15s;
}
.view-mode-toggle button.active { background: #fff; font-weight: 700; color: #0f172a; box-shadow: var(--shadow-sm); }
```
(no `:active` rule)

**4. Global confirm/alert modal Confirm/Cancel buttons** (`customConfirm`/
`customAlert`, used everywhere):

```css
/* styles.css:879-892 — current */
.custom-modal-actions button {
    padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 600;
    border: none; cursor: pointer; min-width: 80px; transition: background-color 0.15s, opacity 0.15s;
}
.modal-btn-cancel {
    background: #f1f5f9; color: #475569;
}
.modal-light .modal-btn-cancel { background: #f1f5f9; color: #475569; }
.modal-btn-cancel:hover { background: #e2e8f0; }
.modal-btn-confirm { background: var(--tp-blue); color: #fff; }
.modal-btn-confirm:hover { opacity: 0.9; }
.modal-btn-confirm.modal-type-danger { background: var(--tp-red); }
.modal-btn-confirm.modal-type-warning { background: var(--tp-amber); color: #1a1a2e; }
.modal-btn-confirm.modal-type-success { background: var(--tp-green); color: #fff; }
```
(no `:active` rule)

## Target

**1. Lab Overview KPI cards:**

```css
/* styles.css:1224 — target, add transform to the transition + a new :active rule right after */
.lab-dash-card { background: #fff; border-radius: 12px; padding: 16px; text-align: center; cursor: pointer; border: 1px solid #e2e8f0; transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s var(--ease-out); box-shadow: var(--shadow-sm); }
.lab-dash-card:active { transform: scale(0.97); }
```

**2. Auto-advance toast buttons** — add a shared class for press feedback,
keep each button's distinct inline colors:

```js
/* js/cop15.js:2052-2053 — target */
html += '<button class="auto-advance-btn" onclick="applyAutoAdvance(\'' + nextStatus + '\')" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">Si</button>';
html += '<button class="auto-advance-btn" onclick="this.parentElement.remove()" style="background:transparent;color:#94a3b8;border:1px solid #475569;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;">No</button>';
```

```css
/* styles.css — target, new rule, add near the "auto-advance-toast" styles
   (search for .auto-advance-toast in styles.css and add this immediately
   after that block) */
.auto-advance-btn { transition: transform 0.15s var(--ease-out); }
.auto-advance-btn:active { transform: scale(0.97); }
```

**3. View-mode toggle:**

```css
/* styles.css:911-915 — target */
.view-mode-toggle button {
    padding: 4px 8px; border: none; border-radius: 6px; cursor: pointer;
    background: transparent; color: #64748b; font-size: var(--fs-2xs, 11px); transition: background-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s var(--ease-out);
}
.view-mode-toggle button:active { transform: scale(0.97); }
.view-mode-toggle button.active { background: #fff; font-weight: 700; color: #0f172a; box-shadow: var(--shadow-sm); }
```

**4. Modal Confirm/Cancel buttons:**

```css
/* styles.css:879-892 — target */
.custom-modal-actions button {
    padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 600;
    border: none; cursor: pointer; min-width: 80px; transition: background-color 0.15s, opacity 0.15s, transform 0.15s var(--ease-out);
}
.custom-modal-actions button:active { transform: scale(0.97); }
.modal-btn-cancel {
    background: #f1f5f9; color: #475569;
}
.modal-light .modal-btn-cancel { background: #f1f5f9; color: #475569; }
.modal-btn-cancel:hover { background: #e2e8f0; }
.modal-btn-confirm { background: var(--tp-blue); color: #fff; }
.modal-btn-confirm:hover { opacity: 0.9; }
.modal-btn-confirm.modal-type-danger { background: var(--tp-red); }
.modal-btn-confirm.modal-type-warning { background: var(--tp-amber); color: #1a1a2e; }
.modal-btn-confirm.modal-type-success { background: var(--tp-green); color: #fff; }
```

## Repo conventions to follow

- `.fab:active { transform: scale(0.95); box-shadow: var(--shadow-pressed); }`
  (`styles.css`, search for `.fab:active`) and
  `.v7-next-step-go:active { transform: scale(0.92); box-shadow:
  var(--shadow-sm); }` are the existing exemplars in this codebase for press
  feedback — same `scale(...)` on `:active` pattern, just applied to four
  more elements that were missed.
- Use `var(--ease-out)` from plan 001 for the new `transform` transitions,
  consistent with how that plan standardizes entrance/exit/interaction
  curves across the file.

## Steps

1. Confirm plan 001 has been applied (search `styles.css` for `--ease-out:`
   in the `:root` block — if missing, STOP and apply plan 001 first).
2. Edit `styles.css:1224` (`.lab-dash-card`) — add `transform 0.15s
   var(--ease-out)` to the existing `transition:` list (it currently only
   has `border-color 0.2s, box-shadow 0.2s`... wait, re-check: it already
   lists `transform 0.2s` — change that `0.2s` to `0.15s var(--ease-out)` to
   match the press-feedback duration budget). Add a new line right after:
   `.lab-dash-card:active { transform: scale(0.97); }`.
3. In `js/cop15.js`, edit lines 2052-2053 — add `class="auto-advance-btn"`
   to both `<button>` tags (right after `<button`, before `onclick=`).
4. In `styles.css`, find the `.auto-advance-toast` rule block (search for
   that exact string). Immediately after it, add:
   `.auto-advance-btn { transition: transform 0.15s var(--ease-out); }` and
   `.auto-advance-btn:active { transform: scale(0.97); }`.
5. Edit `styles.css:911-913` (`.view-mode-toggle button`) — add `, transform
   0.15s var(--ease-out)` to the end of the existing `transition:` list.
   Immediately after the rule's closing `}`, add a new line:
   `.view-mode-toggle button:active { transform: scale(0.97); }`.
6. Edit `styles.css:879-881` (`.custom-modal-actions button`) — add `,
   transform 0.15s var(--ease-out)` to the end of the existing `transition:`
   list. Immediately after the rule's closing `}`, add a new line:
   `.custom-modal-actions button:active { transform: scale(0.97); }`.

## Boundaries

- Do NOT change any `:hover` rules — only add new `:active` rules and extend
  existing `transition:` property lists to include `transform`.
- Do NOT change button colors, padding, or any non-motion styling.
- Do NOT apply this `:active` pattern to any element not listed in this
  plan's four numbered items — other buttons/cards in the codebase are out
  of scope here (some already have their own `:active` rules, e.g. `.fab`,
  `.tp-tab`, `.tab`).
- If any cited line's code doesn't match what's shown above (drift since
  commit `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `node --check js/cop15.js` (must pass with no output). Run
  `./build.sh` and confirm it completes without a CSS-related error.
- **Feel check**: On a touch device (or with mouse click-and-hold), tap/click
  each of the four elements and confirm a brief, subtle shrink (roughly 3%)
  is visible on press, releasing back to full size — not jumpy, not
  exaggerated. Specifically test: a Lab Overview KPI card, the auto-advance
  toast's "Sí" button, the compact/detailed view toggle, and a modal's
  Confirm/Cancel button (trigger any confirm dialog to reach it).
- **Done when**: all four elements visibly compress slightly on press and
  cleanly return to full size on release, with no layout jump or flash.
