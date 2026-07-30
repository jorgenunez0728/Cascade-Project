# 009 — Replace implicit `transition: all` on progress bar, toggles, and login screen

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 2 files (`styles.css`, `js/auth.js`), 5 rules changed

## Problem

A bare `transition: <duration>` with no property name defaults
`transition-property` to `all` per the CSS spec's initial value — this is an
*implicit* `transition: all`, invisible to a literal `grep "transition:\s*all"`
sweep, but functionally identical: it animates every animatable property that
changes, including layout ones, on every state change. `AUDIT.md` §5:
"`transition: all` animates unintended properties off-GPU — always a
finding."

**1. Main progress bar** — updated from 2 call sites in `js/cop15.js`, fires
on nearly every vehicle-list mutation:

```css
/* styles.css:87 — current */
.progress-bar { height: 100%; background: var(--kia-red); width: 0%; transition: 0.3s; }
```

```js
/* js/cop15.js:906,914 — current, only `width` is ever mutated */
document.getElementById('mainProgress').style.width = '0%';
document.getElementById('mainProgress').style.width = percentage + '%';
```

**2. Catalog-mode toggle label and slider** (`index.html:149,154` Internal/
External mode toggle) and **the ETW SI/EN unit toggle** (`index.html:596`,
same `.slider` class) — used on every vehicle-entry form:

```css
/* styles.css:156-161 — current */
.mode-label { font-weight: bold; color: #94a3b8; cursor: pointer; transition: 0.2s; }
.mode-label.active { color: var(--kia-red); }
.switch { position: relative; display: inline-block; width: 50px; height: 24px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background: #cbd5e1; border-radius: 34px; transition: .4s; }
.slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; transition: .4s; border-radius: 50%; }
input:checked + .slider { background: var(--kia-red); }
input:checked + .slider:before { transform: translateX(26px); }
```

Only `color` ever changes on `.mode-label` (via `.active`), only
`background` (i.e. `background-color`) ever changes on `.slider` (via
`input:checked`), and only `transform` ever changes on `.slider:before` (via
`input:checked`).

**3. Operator-picker / login screen** (`js/auth.js`) — rendered on every 12h
session start and every "Cambiar usuario" tap (v15.6 PIN wall):

```js
/* js/auth.js:82 — current (also identical at line 97) */
html += '<button onclick="authBypassForOperator(' + idx + ')" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;background:#111827;border:2px solid #1e293b;border-radius:12px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor=\'' + c + '\'" onmouseout="this.style.borderColor=\'#1e293b\'">';
```

Only `border-color` (via the inline `onmouseover`/`onmouseout` handlers) ever
changes on these buttons.

## Target

Name the exact properties that actually change in each case:

```css
/* styles.css:87 — target */
.progress-bar { height: 100%; background: var(--kia-red); width: 0%; transition: width 0.3s; }
```

```css
/* styles.css:156-161 — target */
.mode-label { font-weight: bold; color: #94a3b8; cursor: pointer; transition: color 0.2s; }
.mode-label.active { color: var(--kia-red); }
.switch { position: relative; display: inline-block; width: 50px; height: 24px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top:0; left:0; right:0; bottom:0; background: #cbd5e1; border-radius: 34px; transition: background-color .4s; }
.slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; transition: transform .4s; border-radius: 50%; }
input:checked + .slider { background: var(--kia-red); }
input:checked + .slider:before { transform: translateX(26px); }
```

```js
/* js/auth.js:82 and :97 — target, both occurrences */
'...border-radius:12px;cursor:pointer;transition:border-color 0.2s;" onmouseover=...'
```

## Repo conventions to follow

- A prior fix pass already did the identical replacement for
  `.detail-back-btn` and `.inv-floorplan-toolbar button` in `styles.css`
  (search for `transition: background-color 0.2s, color 0.2s;` and
  `transition: box-shadow 0.2s, background-color 0.2s, color 0.2s,
  border-color 0.2s;`) — follow the same "name only what actually changes"
  approach.

## Steps

1. Edit `styles.css:87` — change `.progress-bar`'s `transition: 0.3s;` to
   `transition: width 0.3s;`.
2. Edit `styles.css:156` — change `.mode-label`'s `transition: 0.2s;` to
   `transition: color 0.2s;`.
3. Edit `styles.css:160` — change `.slider`'s `transition: .4s;` to
   `transition: background-color .4s;`.
4. Edit `styles.css:161` — change `.slider:before`'s `transition: .4s;` to
   `transition: transform .4s;`.
5. Edit `js/auth.js:82` — change `transition:all 0.2s;` to
   `transition:border-color 0.2s;` inside the inline `style="..."` string.
6. Edit `js/auth.js:97` — same change as step 5 (the second, near-identical
   operator-button block).

## Boundaries

- Do NOT change any duration values — only the `transition-property` (adding
  the explicit property name where it was previously implicit/bare).
- Do NOT touch `.switch`/`.switch input` structural rules — only the
  `transition:` lines on `.mode-label`, `.slider`, `.slider:before`, and the
  two `auth.js` inline styles.
- Do NOT modify `js/cop15.js:906,914` — those already correctly set only
  `style.width`, no change needed there.
- If any cited line's code doesn't match what's shown above (drift since
  commit `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `node --check js/auth.js` (must pass with no output). Run
  `./build.sh` and confirm it completes without a CSS-related error.
- **Feel check**: Trigger a vehicle-list action that moves the main progress
  bar (e.g. releasing a vehicle) and confirm it still animates its width
  smoothly. Toggle the Internal/External catalog mode switch and the ETW
  SI/EN switch — confirm both still animate their color/slide exactly as
  before. Open the operator picker / "Cambiar usuario" screen and hover over
  an operator button (desktop) — confirm the border color still transitions
  smoothly.
- **Done when**: `grep -n "transition: 0\.\|transition: \.4s\|transition:all" styles.css js/auth.js`
  returns zero matches for these five specific lines, and all four visual
  behaviors above are unchanged.
