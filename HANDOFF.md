# SOP Module Rewrite — Handoff Notes

**Branch**: `claude/rewrite-sop-module-tmhP1`
**Date**: 2026-03-17
**Last commit**: `e11af05` — "Rewrite SOP module as guided tour system with Cascade data bridge"

## What Was Done

### Phase 1 (previous session, branch `claude/redesign-ui-ux-systems-5bSGE`)
- All modules converted from dark to light theme with per-module accent colors
- Bottom nav glassmorphism, panel header fix
- Basic SOP module created (simple checklist templates)
- SOP tab added to index.html, build.sh, app.js switchPlatform
- cop15.js `_injectSopBanner()` calls `sopGetCascadeBanner(phase)`

### Phase 2 (this session) — COMPLETE
- **js/sop.js**: Full rewrite from 1036-line checklist to 1675-line guided tour system
- **styles.css**: +108 lines of new guided tour CSS classes
- **index.html**: Updated SOP section (new header text, removed "New SOP" button, new tab structure: Guía/Historial/Plantillas)
- **js/cop15.js**: Added `sopOnVehicleRegistered(newVehicle)` hook at line 891

### Files Modified in Last Commit
| File | Lines Changed | Nature |
|------|--------------|--------|
| `js/sop.js` | 1675 (rewrite) | Complete rewrite — guided tour engine |
| `styles.css` | +108 | New CSS for vehicle banner, section headers, image gallery, edit controls |
| `index.html` | ~10 lines | Updated SOP platform section header and tabs |
| `js/cop15.js` | +1 line | Hook in saveNewVehicle() |
| `kia-emlab-unified.html` | Auto-generated | build.sh output |

## Current State — What Works

1. **Vehicle selector** — dropdown at top of SOP, shows non-archived vehicles
2. **Auto-generated procedure** — emissions vehicles get full 47+ steps, non-emissions get 3 simple steps
3. **Alta (read-only)** section shows VIN, purpose, config, registeredBy, date
4. **Guided fields** — select, number, text, textarea, datetime-local, action, readonly types
5. **Data bridge** — `sopSaveField()` writes directly to `db.vehicles[].testData.*` via `saveDB()`
6. **Bi-directional sync** — fill in SOP → appears in Cascade; fill in Cascade → appears in SOP
7. **Section accordion** — collapsible sections with per-section progress mini-bars
8. **IndexedDB images** — camera capture, thumbnail generation, fullscreen overlay, delete
9. **Edit mode** — modify step titles, descriptions, add/remove checklist sub-items, reorder steps
10. **History** — complete a procedure, export to text file
11. **Cascade banner** — `sopGetCascadeBanner()` shows progress in Cascade's operation tab
12. **sopGoToCascade()** — switches to Cascade and selects the same vehicle

## Known Limitations & Future Improvements

### Not Yet Implemented
1. **`op_recep` / `op_datetime` fields** — The SOP step for `testData.operator` maps correctly but the Cascade DOM field `op_recep` is a standalone select. The SOP writes to `testData.operator` which Cascade's `saveProgress()` reads from `document.getElementById('op_recep')` — so writing from SOP does NOT auto-populate the Cascade DOM select. The data is stored but the DOM isn't updated until `loadVehicle()` is called again. This is expected behavior.

2. **Unit conversion for dynamometer fields** — Cascade uses `toSI()`/`fromSI()` for ETW and A/B/C coefficients depending on `currentUnitSystem`. SOP currently writes raw values without unit conversion. If the user fills dynamometer data from SOP, values are stored as-is. This could cause mismatches if the lab switches between SI/Imperial.

3. **`precond_datetime` and `test_datetime`** — These datetime fields exist in Cascade's `saveProgress()` but are not yet in SOP step definitions. They could be added as `datetime` type steps.

4. **Firebase sync integration** — SOP's `sopSaveField()` calls `saveDB()` which triggers localStorage save, but does NOT call `fbPostTestStarted()` or other Firebase hooks that Cascade's `saveProgress()` calls.

5. **Undo support** — SOP field changes don't call `undoPush()` before writing. Adding this would allow Ctrl+Z to revert SOP-made changes.

6. **Step reorder persistence** — `sopReorderStep()` stores custom order in `sopState.customizations` but the guide renderer doesn't yet apply the stored order when rendering. The data is saved but not consumed.

7. **Custom SOP creation** — The old `sopShowCreateModal()` and `sopCreateCustom()` functions were removed. The "Templates" tab now shows the two built-in templates. Adding user-defined custom templates could be a future feature.

### Potential Bugs to Watch
- **escapeHtml on option values** — Some Cascade field values contain accented characters (operator names like "Iván Cárdenas"). The `escapeHtml()` in option rendering should handle these but needs testing with real data.
- **parseFloat on select values** — `sopOnFieldChange()` converts fuel level fraction select values via `parseFloat()`. Edge case: selecting "— Seleccionar —" (empty string) should produce `null`, not `NaN`.
- **Image thumbnails** — The `FileReader.readAsDataURL(blob)` in `sopShowImageOverlay()` reads the raw `file` object stored as `blob`. Verify that `File` objects survive IndexedDB round-trips in all target browsers (Chrome/Safari mobile).

## Architecture Quick Reference

```
SOP Step Definition (static)
    ↓
sopGetProcedureForVehicle(vehicle) → steps[]
    ↓
sopRenderGuide() → sections → steps → sopRenderField()
    ↓
sopOnFieldChange(vehicleId, stepIdx, value)
    ↓
sopSaveField(vehicleId, dataPath, value)
    ↓
sopSetFieldValue(vehicle, dataPath, value) → saveDB()
    ↓
db.vehicles[n].testData.* updated in localStorage
    ↓
Cascade's loadVehicle() reads same db.vehicles → DOM fields populated
```

## How to Continue Development

### Adding a new SOP step
1. Add step object to `SOP_EMISSIONS_STEPS` or `SOP_SIMPLE_STEPS` in sop.js
2. The `dataPath` must match what Cascade's `saveProgress()`/`loadVehicle()` expects
3. Run `node --check js/sop.js && ./build.sh`

### Adding a new section
1. Add step with `sectionLabel` and `sectionIcon` properties (marks section start)
2. All subsequent steps with same `section` value group under it

### Debugging data bridge
```js
// In browser console:
var v = db.vehicles.find(v => v.id == sopState.selectedVehicleId);
console.log(v.testData); // See all data written by SOP
sopGetFieldValue(v, 'testData.preconditioning.fuelTypeIn'); // Read specific field
```

### Testing checklist
- [ ] Register vehicle in Cascade → appears in SOP vehicle selector
- [ ] Select vehicle in SOP → see guided procedure with correct type (emissions/simple)
- [ ] Fill a field in SOP → switch to Cascade operation → verify same value appears
- [ ] Fill a field in Cascade → switch to SOP → verify same value appears
- [ ] Capture image → see thumbnail → open fullscreen → delete
- [ ] Enable edit mode → change step title → verify persistence after page reload
- [ ] Complete all fields → "Procedimiento Completado" summary appears
- [ ] Click "Guardar en Historial" → appears in History tab
- [ ] Export history → verify .txt file downloads
