// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Candado del F05 (COP15-F05): la salida del PDF no cambia           ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Decisión del laboratorio (ronda 2.2.x): el F05 NO se modifica. Esta prueba
// genera el PDF real (generateCOP15PDF + jsPDF de vendor/) para un vehículo fijo,
// con reloj, zona horaria e idioma congelados, y compara su huella con la guardada
// en tests/fixtures/f05-golden.json. Si falla, algo cambió lo que imprime el F05.
//
// Para regenerar la huella A PROPÓSITO (cuando el laboratorio apruebe un cambio al
// formato): F05_UPDATE=1 node tests/f05.e2e.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPO = path.resolve(process.env.F05_REPO || path.join(__dirname, '..'));
const GOLDEN = path.join(__dirname, 'fixtures', 'f05-golden.json');

// Firma PNG determinista (escala de grises en RGBA, como la de SignaturePad).
function firmaPNG() {
    const crc32 = (buf) => { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; };
    const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
    const W = 200, H = 60, raw = Buffer.alloc((W * 4 + 1) * H, 255);
    for (let y = 0; y < H; y++) {
        raw[y * (W * 4 + 1)] = 0;
        for (let x = 0; x < W; x++) {
            const on = Math.abs(y - (30 + 18 * Math.sin(x / 12))) < 2;
            const o = y * (W * 4 + 1) + 1 + x * 4;
            if (on) { raw[o] = raw[o + 1] = raw[o + 2] = 0; }
            raw[o + 3] = 255;
        }
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
    return 'data:image/png;base64,' + png.toString('base64');
}

const SEED = (firma) => {
    const sig = (n, r) => ({ signerName: n, signerRole: r, signedAt: '2026-09-20T17:30:00.000Z', dataUrl: firma, sessionUserId: n });
    localStorage.setItem('kia_auth_session', JSON.stringify({
        operatorId: 'ana', operatorName: 'Ana Signataria', expiresAt: '2099-01-01T00:00:00.000Z' }));
    localStorage.setItem('kia_panel_v1', JSON.stringify({
        operators: [{ id: 'ana', name: 'Ana Signataria', role: 'Signatario', active: true }], tasks: [], projects: [], alerts: [] }));
    localStorage.setItem('kia_db_v11', JSON.stringify({ lastId: 1, vehicles: [{
        id: 'vf05', vin: '3KPFT51B7TE407968', status: 'archived', purpose: 'COP-Emisiones', configCode: 'CL4-TEST',
        registeredAt: '2026-09-18T15:00:00.000Z', archivedAt: '2026-09-21T16:00:00.000Z',
        config: { Modelo: 'CL4', 'MODEL YEAR (VIN)': '2026', TRANSMISSION: '6MT', 'EMISSION REGULATION': 'PRE-EURO 7',
                  'DRIVE TYPE': 'L - LHD', 'ENGINE CAPACITY': '1.0', REGION: 'EUROPE', 'BODY TYPE': '5DR' },
        timeline: [{ timestamp: '2026-09-18T15:00:00.000Z', user: 'Ana Signataria', action: 'Alta' }],
        testData: {
            operator: 'Ivan', odometer: '69', datetime: '2026-09-18T15:00:00.000Z',
            preconditioning: { responsible: 'Osvaldo', datetime: '2026-09-19T14:00:00.000Z', cycle: 'WLTC', soakTimeH: '12', ok: 'yes' },
            etw: '1612.7', targetA: '102.5', targetB: '0.147', targetC: '0.03544', dynoA: '43.4', dynoB: '-0.1655', dynoC: '0.0359',
            testResponsible: 'Ivan', testDatetime: '2026-09-20T16:01:00.000Z',
            signatures: { releaser: sig('Ana Signataria', 'Liberador'), approver: sig('Beto Aprobador', 'Aprobador') },
            gasResults: {
                liberador: { values: { CO: 0.195, NOx: 0.0063, THC: 0.0166, NMHC: 0.0126, PM: 0.0023, CO2: 135.41 },
                             capturedBy: 'Ana Signataria', capturedAt: '2026-09-20T17:00:00.000Z', passedLimits: true },
                aprobador: { values: { CO: 0.195, NOx: 0.0063, THC: 0.0166, NMHC: 0.0126, PM: 0.0023, CO2: 135.41 },
                             matchedLiberador: true }
            }
        }
    }] }));
    localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
    localStorage.setItem('kia_help_dismissed', JSON.stringify({ '*': true }));
    localStorage.setItem('kia_tour_done', '1');
    ['global', 'today', 'testplan', 'inventory', 'panel', 'cop', 'cop15'].forEach(m => localStorage.setItem('kia_tour_done_' + m, '1'));
};

/** Quita del PDF lo que cambia en cada corrida (fechas de creación e ID del archivo). */
function normalizar(pdf) {
    return pdf
        .replace(/\/CreationDate \([^)]*\)/g, '/CreationDate ()')
        .replace(/\/ModDate \([^)]*\)/g, '/ModDate ()')
        .replace(/\/ID \[[^\]]*\]/g, '/ID []');
}

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 },
        timezoneId: 'America/Mexico_City', locale: 'es-MX' });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-09-28T16:00:00.000Z'));
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await page.addInitScript(SEED, firmaPNG());
    await page.goto('file://' + path.join(REPO, 'index.html'));
    await page.waitForFunction(() => typeof generateCOP15PDF === 'function' && window.jspdf, null, { timeout: 15000 });

    const out = await page.evaluate(() => {
        const doc = generateCOP15PDF('vf05', { returnDoc: true, silent: true });
        if (!doc) return { err: 'generateCOP15PDF no devolvió documento' };
        return { pdf: doc.output(), pages: doc.getNumberOfPages() };
    });
    await browser.close();

    if (out.err) { console.log('  FALLA  ' + out.err); process.exitCode = 1; return; }
    const norm = normalizar(out.pdf);
    const sha = crypto.createHash('sha256').update(norm, 'latin1').digest('hex');
    const actual = { sha256: sha, bytes: norm.length, pages: out.pages };

    if (process.env.F05_UPDATE === '1') {
        fs.writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + '\n');
        console.log('  huella del F05 guardada: ' + sha.slice(0, 16) + '… (' + norm.length + ' bytes, ' + out.pages + ' pág.)');
        return;
    }
    const gold = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    const iguales = gold.sha256 === sha;
    console.log((iguales ? '  ok  ' : '  FALLA  ') + 'el F05 sale idéntico al aprobado (' + sha.slice(0, 16) + '… vs ' + gold.sha256.slice(0, 16) + '…)');
    if (errores.length) console.log('  (errores de página: ' + errores.slice(0, 3).join(' | ') + ')');
    if (!iguales) {
        console.log('     bytes: ' + norm.length + ' vs ' + gold.bytes + ' · páginas: ' + out.pages + ' vs ' + gold.pages);
        process.exitCode = 1;
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
