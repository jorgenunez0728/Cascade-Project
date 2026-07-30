# 002 — Stop VIN field from shaking on every keystroke

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: HIGH
- **Category**: Purpose & frequency / Interruptibility
- **Estimated scope**: 2 files (`js/cop15.js`, `js/app.js`), ~10 lines changed

## Problem

`js/cop15.js:783-793` validates the VIN field on every `input` event:

```js
/* js/cop15.js:783-793 — current */
if (vinInput) {
    vinInput.addEventListener('input', function() {
        // [V7-E4] VIN Smart Input: auto-uppercase, strip spaces/dashes
        vinInput.value = vinInput.value.toUpperCase().replace(/[\s\-]/g, '');
        validateField(vinInput, {
            required: true,
            exactLength: 17,
            pattern: /^[A-HJ-NPR-Z0-9]{17}$/,
            patternMsg: '17 caracteres alfanuméricos (sin I, O, Q)'
        });
        // [V7-E4] Check duplicates
        if (vinInput.value.length === 17) v7CheckVinDuplicate(vinInput.value);
    });
```

`validateField` (`js/app.js:869-899`) shakes the field whenever it's invalid
and non-empty:

```js
/* js/app.js:894-899 — current */
input.classList.remove('field-valid', 'field-error', 'field-missing');
if (val.length > 0) {
    input.classList.add(valid ? 'field-valid' : 'field-error');
    // [R3-M7] Shake on validation error
    if (!valid && typeof shakeElement === 'function') shakeElement(input);
}
```

Since `exactLength: 17` fails for every VIN length from 1 to 16 characters,
`shakeElement(vinInput)` fires on **literally every keystroke** while typing a
17-character VIN — the single most-repeated field in the app. This is not an
error state; it's the normal, expected state of "still typing." Per
`AUDIT.md` §1, "It looks cool" / decorative motion on a 100+/day field is not
a purpose, and a shake specifically communicates "you made a mistake," which
is false here 16 times out of 17.

Separately, `shakeElement` itself has an interruptibility bug (`AUDIT.md` §4 —
keyframes restart from zero, so rapid retriggers look broken):

```js
/* js/app.js:3679-3682 — current */
function shakeElement(el) {
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.add('field-shake');
    setTimeout(function() { el.classList.remove('field-shake'); }, 400);
}
```

```css
/* styles.css:1332 — current */
.field-shake { animation: fieldShake 0.35s ease-in-out; }
```

Adding a class that's already present is a no-op in the DOM — if `shakeElement`
is called again before the 400ms timeout removes the class, the second call's
`classList.add('field-shake')` does nothing (class already there), so the
animation does NOT restart; it just keeps running its original 350ms timeline
and gets cut off by whichever `setTimeout` fires first. This is the exact
"keyframe restart looks broken when retriggered" failure mode named in
`AUDIT.md` §4, made visible by finding #1's every-keystroke retriggering.

## Target

Two independent fixes:

**1. Only validate/shake the VIN on meaningful moments, not every keystroke.**
Keep live uppercasing/duplicate-check on `input`, but move the shake-producing
`validateField` call to fire only once the field is "complete enough to
judge" (17 chars entered) or on blur:

```js
/* js/cop15.js:783-799 — target */
if (vinInput) {
    vinInput.addEventListener('input', function() {
        // [V7-E4] VIN Smart Input: auto-uppercase, strip spaces/dashes
        vinInput.value = vinInput.value.toUpperCase().replace(/[\s\-]/g, '');
        // Only judge/shake once the user has typed a full 17-char VIN (or cleared
        // the field back to valid/empty) — mid-typing lengths are not an error.
        if (vinInput.value.length === 0 || vinInput.value.length === 17) {
            validateField(vinInput, {
                required: true,
                exactLength: 17,
                pattern: /^[A-HJ-NPR-Z0-9]{17}$/,
                patternMsg: '17 caracteres alfanuméricos (sin I, O, Q)'
            });
        } else {
            // Clear any stale valid/error state while mid-typing, but don't shake.
            vinInput.classList.remove('field-valid', 'field-error', 'field-missing');
        }
        // [V7-E4] Check duplicates
        if (vinInput.value.length === 17) v7CheckVinDuplicate(vinInput.value);
    });
```

(The existing `blur` listener right after this block already calls
`validateField` again — leave that one exactly as-is; it correctly catches
"user left the field incomplete.")

**2. Make `shakeElement` retrigger-safe** with a forced reflow, matching the
pattern already used correctly elsewhere in this file for the autosave
indicator (`js/app.js` `_autoSaveIndicator`, which does `void
ind.offsetWidth` before re-adding its animation class):

```js
/* js/app.js:3679-3682 — target */
function shakeElement(el) {
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('field-shake');
    void el.offsetWidth; // force reflow so re-adding the class restarts the keyframe
    el.classList.add('field-shake');
    setTimeout(function() { el.classList.remove('field-shake'); }, 400);
}
```

## Repo conventions to follow

- `js/app.js`'s `_autoSaveIndicator` function (search for `void ind.offsetWidth`)
  already implements the remove→reflow→add pattern for safe animation
  retriggering — copy that exact pattern for `shakeElement`.
- `validateField`'s existing `blur` listener pattern (immediately after the
  `input` listener in the same `setupAltaValidation` IIFE) is left untouched —
  it's the correct place for "did the user leave this field wrong" checks.

## Steps

1. In `js/cop15.js`, locate the `vinInput.addEventListener('input', ...)`
   block (around line 783). Replace the unconditional `validateField(...)`
   call with the length-gated version shown in Target — validate only at
   length 0 or 17, otherwise just clear stale `field-valid`/`field-error`
   classes without calling `validateField` (which would shake).
2. In `js/app.js`, locate `function shakeElement(el) {` (around line 3679).
   Change the body to remove-then-reflow-then-add the `field-shake` class, as
   shown in Target.
3. Leave everything else in both files untouched — no other call sites of
   `shakeElement` or `validateField` change.

## Boundaries

- Do NOT change the `blur` listener that follows the `input` listener in
  `setupAltaValidation` — it already does the right thing.
- Do NOT change `.field-shake`/`fieldShake` CSS — only the JS retrigger logic.
- Do NOT apply the length-gating pattern to other fields' `validateField`
  calls elsewhere in the codebase — this plan is scoped to the VIN field only,
  since it's the one field validated character-by-character against a fixed
  length. Other fields validate on blur already or use different rules.
- If the cited code doesn't match what's shown above (drift since commit
  `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: `node --check js/cop15.js` and `node --check js/app.js`
  (both must pass with no output).
- **Feel check**: Open the Alta de Vehículo form, click into the VIN field,
  and type a valid 17-character VIN one character at a time. Confirm:
  - The field does NOT shake or turn red while typing characters 1-16.
  - Once the 17th character is typed, the field settles into its valid/green
    state (or shakes once if the final VIN fails the pattern check).
  - Clear the field with backspace one character at a time — no shake during
    that either, until it's fully empty (which is a valid/neutral state, not
    an error, so it also shouldn't shake per the `required` rule only firing
    when the user tries to submit/blur with it empty).
  - Type an intentionally invalid 17-char string (e.g. contains a lowercase
    "i" — wait, it auto-uppercases; use one with an "I", "O", or "Q") twice in
    a row without leaving the field (delete the last char and retype it) —
    confirm the shake visibly restarts each time rather than looking cut off
    or not firing on the second attempt.
- **Done when**: typing a full 17-char VIN produces at most one shake (only if
  the final result is actually invalid), and rapid re-triggers of the shake on
  the same element visibly restart from zero each time.
