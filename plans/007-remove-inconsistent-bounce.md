# 007 — Remove inconsistent bounce curve from 3 components

- **Status**: TODO
- **Commit**: ab531df
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`styles.css`), 3 rules changed
- **Depends on**: Plan 001 (motion tokens) — this plan uses `var(--ease-out)`, apply 001 first.

## Problem

Three components use a springy overshoot curve, `cubic-bezier(0.34, 1.56, 0.64, 1)`,
while every other modal in the same file uses plain `ease` (or, after plan
001, `var(--ease-out)`), and the app's own toast uses a third, different,
non-bouncy curve:

```css
/* styles.css:861 — current */
.custom-modal-box {
    ...
    box-shadow: var(--shadow-xl); animation: modalSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    ...
}
```

```css
/* styles.css:2423 — current */
.v7-resume-toast {
    ...
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
    opacity: 0;
}
```

```css
/* styles.css:2465-2469 — current */
.v7-soak-modal {
    ...
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
    opacity: 0; max-width: 360px; width: 90%;
}
```

Per `AUDIT.md` §7: "Motion should match the product's personality — playful
can be bouncier, a dashboard stays crisp. Mismatched personality across
components is a finding." `CLAUDE.md` describes this app as an industrial
lab-instrument dashboard, not a playful consumer app, and none of these three
are drag-to-dismiss gestures or other "playful moment" cases where
`AUDIT.md` §4 says bounce is appropriate ("reserve visible bounce for
drag-to-dismiss and playful moments") — they're a generic confirm dialog, a
resume-session toast, and a soak-timer-complete modal. Meanwhile the main
`.toast` component right next to `.v7-resume-toast` in the same file uses yet
a *third*, different, non-bouncy curve (`cubic-bezier(0.16, 1, 0.3, 1)`), and
the primary confirm/alert overlay (`.custom-modal-overlay`) uses plain `ease`
— so today there are three different, uncoordinated entrance "personalities"
competing in the same app.

## Target

Remove the bounce; standardize all three on the shared `--ease-out` token
from plan 001 (same curve now used for every other UI entrance in the app):

```css
/* styles.css:861 — target */
.custom-modal-box {
    ...
    box-shadow: var(--shadow-xl); animation: modalSlideIn 0.3s var(--ease-out);
    ...
}
```

```css
/* styles.css:2423 — target */
.v7-resume-toast {
    ...
    transition: transform 0.3s var(--ease-out), opacity 0.3s var(--ease-out);
    opacity: 0;
}
```

```css
/* styles.css:2465-2469 — target */
.v7-soak-modal {
    ...
    transition: transform 0.3s var(--ease-out), opacity 0.3s var(--ease-out);
    opacity: 0; max-width: 360px; width: 90%;
}
```

## Repo conventions to follow

- Plan 001 introduces `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` in the
  file's `:root` block — use `var(--ease-out)` exactly as plan 001's other
  swap sites do (e.g. `.custom-modal-overlay` at `styles.css:855`).
- Keep the durations (`0.3s` in all three cases) unchanged — this plan only
  changes the curve, not the timing.

## Steps

1. Confirm plan 001 has already been applied (search `styles.css` for
   `--ease-out:` inside the `:root` block — if it's not there, STOP and apply
   plan 001 first).
2. Edit `styles.css:861` (`.custom-modal-box`'s `animation:` line) — replace
   `cubic-bezier(0.34, 1.56, 0.64, 1)` with `var(--ease-out)`.
3. Edit `styles.css:2423` (`.v7-resume-toast`'s `transition:` line) — replace
   `cubic-bezier(0.34, 1.56, 0.64, 1)` with `var(--ease-out)`, and also add
   `var(--ease-out)` to the `opacity 0.3s` part (currently bare) so both
   transitioned properties share the same curve.
4. Edit `styles.css:2465-2469` (`.v7-soak-modal`'s `transition:` line) —
   same two changes as step 3.

## Boundaries

- Do NOT change any duration values.
- Do NOT touch `.custom-modal-overlay` (`styles.css:855`) or `.toast`
  (`styles.css:831`) — those are already handled by plan 001 / a prior fix
  pass respectively.
- Do NOT remove bounce from any component not listed here — this plan is
  scoped to exactly these three selectors.
- If the cited code doesn't match what's shown above (drift since commit
  `ab531df`), STOP and report instead of improvising.

## Verification

- **Mechanical**: run `./build.sh` and confirm it completes without a
  CSS-related error. `grep -n "cubic-bezier(0.34, 1.56, 0.64, 1)" styles.css`
  should return zero matches after this plan (down from 3).
- **Feel check**: Trigger a confirm dialog (e.g. delete a plan row), and — if
  reachable in a dev/test flow — the "resume session" toast and the soak-timer
  completion modal. Confirm all three now settle into place with a crisp
  decelerate (fast start, no overshoot/wobble at the end) rather than
  springing past their final size and bouncing back. In DevTools Animations
  panel, set playback to 10% and confirm no overshoot frame appears past the
  final scale/position.
- **Done when**: none of the three components visibly overshoots on entrance,
  and all three feel consistent with the rest of the app's modal/toast
  entrances.
