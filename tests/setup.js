/**
 * Vitest Setup — Load global-scope JS files in order.
 *
 * Since the app uses global scope (no ES modules), we use vm.runInThisContext
 * so that all function declarations land on the global scope.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

const ROOT = resolve(import.meta.dirname, '..');

// Minimal DOM elements the scripts expect at parse time
document.body.innerHTML = `
  <div id="unsaved-dot"></div>
  <div id="btn-save"></div>
  <div id="cfg_model"><option value="">Seleccionar...</option></div>
  <div id="configCount">0</div>
  <div id="vin"></div>
  <div id="vehiclePurpose"></div>
  <div id="test_datetime"></div>
  <div id="test_fan_mode"></div>
  <div id="test_fan_speed"></div>
  <div id="v7-quick-picks" style="display:none;"></div>
  <div id="v7-smart-configs" style="display:none;"></div>
  <div id="v7-favorites" style="display:none;"></div>
  <div id="v7-next-step-banner"></div>
  <div id="op-content"></div>
  <div id="platform-cop15"></div>
  <div id="platform-testplan"></div>
  <div id="platform-results"></div>
  <div id="platform-inventory"></div>
  <div id="platform-panel"></div>
  <div id="platform-today"></div>
`;

// Stub APIs not available in jsdom
globalThis.Chart = function() { return { destroy: function(){}, update: function(){}, data: { datasets: [] } }; };
if (!globalThis.matchMedia) {
  globalThis.matchMedia = function() {
    return { matches: false, addEventListener: function(){}, removeEventListener: function(){} };
  };
}
// Stub Notification API
globalThis.Notification = globalThis.Notification || { permission: 'default', requestPermission: function() { return Promise.resolve('denied'); } };

// Suppress console noise during script loading
const origConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = function() {};
console.warn = function() {};

// Load scripts in dependency order using vm.runInThisContext
// This makes function/var declarations available on the global scope
const scripts = ['js/app.js', 'js/cop15.js', 'js/inventory.js', 'js/testplan.js', 'js/results.js', 'js/panel.js'];

for (const script of scripts) {
  try {
    const code = readFileSync(resolve(ROOT, script), 'utf-8');
    vm.runInThisContext(code, { filename: script });
  } catch (e) {
    // Some scripts may fail on DOM-dependent init — that's OK for unit tests
    origConsole.error(`Setup: ${script} load error (non-blocking):`, e.message);
  }
}

// Restore console
console.log = origConsole.log;
console.warn = origConsole.warn;
