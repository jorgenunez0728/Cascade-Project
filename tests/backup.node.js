// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [2.3.0] Capacidad de la nube y respaldo diario (js/firebase-sync.js)║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// Cada módulo viaja como UN documento de Firestore (límite duro 1 MiB). Con
// 42 vehículos el de COP15 ya pesaba ~753 KB y el respaldo diario (tres
// módulos en un solo documento) pasaba de 1 MiB y fallaba en silencio.
// Aquí se prueban las funciones PURAS que miden, deciden y arman.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-sync.js'), 'utf8');
const PANEL = fs.readFileSync(path.join(__dirname, '..', 'js', 'panel.js'), 'utf8');

/** Extrae una función de nivel superior por nombre, emparejando llaves. */
function extraer(src, nombre) {
    const re = new RegExp('(?:^|\\n)function\\s+' + nombre + '\\s*\\(');
    const m = re.exec(src);
    if (!m) throw new Error('no encontré function ' + nombre);
    let i = src.indexOf('{', m.index + m[0].length - 1);
    let d = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) break; }
    }
    return src.slice(m.index + (src[m.index] === '\n' ? 1 : 0), i + 1);
}
/** Extrae `var NOMBRE = …;` (una línea o un objeto literal). */
function extraerVar(src, nombre) {
    const re = new RegExp('(?:^|\\n)var\\s+' + nombre + '\\s*=');
    const m = re.exec(src);
    if (!m) throw new Error('no encontré var ' + nombre);
    let i = m.index + m[0].length, d = 0;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '{' || c === '[') d++;
        else if (c === '}' || c === ']') d--;
        else if (c === ';' && d === 0) break;
    }
    return src.slice(m.index + (src[m.index] === '\n' ? 1 : 0), i + 1);
}

const ctx = { console, Date, JSON, Object, Array, String, Number, Math, isNaN, parseInt, parseFloat, Error };
vm.createContext(ctx);
['FB_DOC_MAX_BYTES', 'FB_DOC_SAFE_BYTES', 'FB_CAPACITY_WARN_PCT', 'FB_CAPACITY_CRIT_PCT', 'FB_CAPACITY_LABELS',
 'FB_BACKUP_FORMAT', 'FB_BACKUP_CHUNK_CHARS', 'FB_BACKUP_DAILY_DAYS', 'FB_BACKUP_MONTHLY_DAYS']
    .forEach(n => vm.runInContext(extraerVar(SRC, n), ctx));
['_fbUtf8Bytes', 'fbFirestoreValueSize', 'fbFirestoreDocSize', 'fbModuleDocBytes', 'fbQuotaCheckSize',
 'fbCapacityLevel', '_fbImagesSize', 'fbVehicleWeight', 'fbCapacityRows',
 '_fbSplitChunks', 'fbBackupRetention', 'fbBackupAssemble', 'fbBackupStatusEval']
    .forEach(n => vm.runInContext(extraer(SRC, n), ctx, { filename: 'firebase-sync.js' }));
vm.runInContext(extraer(PANEL, '_pnVehicleDate'), ctx, { filename: 'panel.js' });

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

// ── Tamaño según Firestore ─────────────────────────────────────────────────
console.log('\n== fbFirestoreValueSize / fbFirestoreDocSize ==');
{
    const v = ctx.fbFirestoreValueSize;
    ok('texto = bytes UTF-8 + 1', v('abc') === 4);
    ok('acento cuenta 2 bytes', v('ñ') === 3);
    ok('emoji (par sustituto) cuenta 4 bytes', v('😀') === 5);
    ok('número = 8 (entero o decimal)', v(1) === 8 && v(236.1022958823832) === 8);
    ok('booleano = 1, null = 1', v(true) === 1 && v(null) === 1);
    ok('mapa = nombre + 1 + valor', v({ a: 'b' }) === 4);
    ok('arreglo = suma de valores', v([1, 2]) === 16);
    ok('un campo undefined no se guarda', v({ a: 'b', x: undefined }) === 4);

    // Ejemplo OFICIAL de la documentación de Firestore ("Storage size calculations"):
    // users/jeff/tasks/my_task_id con 4 campos = 147 bytes.
    const doc = ctx.fbFirestoreDocSize(
        { type: 'Personal', done: false, priority: 1, description: 'Learn Cloud Firestore' },
        ['users', 'jeff', 'tasks', 'my_task_id']);
    ok('reproduce el ejemplo oficial de Firestore (147 bytes)', doc === 147, 'dio ' + doc);

    // Una firma en base64 pesa lo mismo en JSON y en Firestore (+1 vs +2 comillas).
    const b64 = 'data:image/png;base64,' + 'A'.repeat(12000);
    ok('una firma pesa ~lo mismo que su texto', Math.abs(v(b64) - b64.length) <= 1);
}

console.log('\n== fbQuotaCheckSize: el tope es el documento real ==');
{
    const chico = ctx.fbQuotaCheckSize({ vehicles: [{ vin: 'X' }] }, 'cop15');
    ok('un módulo chico pasa', chico.allowed === true && chico.bytes > 0);
    const grande = ctx.fbQuotaCheckSize({ blob: 'x'.repeat(1010000) }, 'cop15');
    ok('uno que no cabe en un documento se detiene', grande.allowed === false);
    ok('…y el motivo dice qué hacer', /Datos → Sistema/.test(grande.reason || ''));
    // Lo que el tope viejo (JSON > 900 KB) bloqueaba aunque SÍ cabía:
    const antes = ctx.fbQuotaCheckSize({ blob: 'x'.repeat(950000) }, 'cop15');
    ok('950 000 caracteres ya no se bloquean (el viejo tope de 900 KB sí)', antes.allowed === true);
}

// ── Qué pesa en los vehículos ──────────────────────────────────────────────
console.log('\n== fbVehicleWeight ==');
{
    const firma = 'data:image/png;base64,' + 'B'.repeat(10000);
    const veh = {
        vin: 'KNA6BA1D5T1000065', config: { MODEL: 'SELTOS' },
        timeline: [{ timestamp: '2026-09-01T10:00:00Z', action: 'Alta', user: 'Ivan' }],
        testData: {
            signatures: { releaser: { signerName: 'A', dataUrl: firma }, approver: { signerName: 'B', dataUrl: firma } },
            gasResults: { liberador: { values: { CO: 0.2 }, profile: { name: 'EURO-6', gases: [{ field: 'CO', limit: 1 }] } } }
        }
    };
    const w = ctx.fbVehicleWeight([veh, { vin: 'X', testData: {} }]);
    ok('cuenta los vehículos', w.count === 2);
    ok('detecta las dos firmas como imágenes', w.images >= 20000 && w.images <= 20100, 'images=' + w.images);
    ok('cuenta el perfil congelado', w.profiles > 0);
    ok('cuenta la línea de tiempo', w.timeline > 0);
    ok('las partes no exceden el total', w.images + w.profiles + w.timeline + w.rest === w.total);
    ok('uno sin firmas no suma imágenes', w.withImages === 1);
    ok('promedio por vehículo', w.avg === Math.round(w.total / 2));
}

console.log('\n== fbCapacityRows / fbCapacityLevel ==');
{
    ok('< 75 % ok', ctx.fbCapacityLevel(74.9) === 'ok');
    ok('75 % alto', ctx.fbCapacityLevel(75) === 'alto');
    ok('90 % crítico', ctx.fbCapacityLevel(90) === 'critico');
    const rows = ctx.fbCapacityRows([
        { col: 'panel', data: { a: 'x'.repeat(1000) } },
        { col: 'cop15', data: { a: 'x'.repeat(800000) } }
    ], 1000000, 'KIA-EMLAB', 'dev1');
    ok('ordena del más lleno al más vacío', rows[0].col === 'cop15');
    ok('cop15 al ~80 % sale alto', rows[0].level === 'alto', 'pct=' + rows[0].pct);
    ok('etiqueta legible', rows[0].label === 'Vehículos (COP15)');
    ok('free = límite - usado', rows[0].free === 1000000 - rows[0].bytes);
}

// ── Fragmentos del respaldo ────────────────────────────────────────────────
console.log('\n== _fbSplitChunks ==');
{
    const s = 'abcdefghij'.repeat(1000);
    const ch = ctx._fbSplitChunks(s, 3000);
    ok('une exactamente el original', ch.join('') === s);
    ok('ningún fragmento pasa del tamaño', ch.every(c => c.length <= 3000));
    ok('4 fragmentos para 10 000 caracteres de a 3 000', ch.length === 4);
    // Un emoji justo en el borde no se parte.
    const e = 'x'.repeat(2999) + '😀' + 'y'.repeat(10);
    const ce = ctx._fbSplitChunks(e, 3000);
    ok('no parte un emoji en la frontera', ce.join('') === e && ce.every(c => {
        const last = c.charCodeAt(c.length - 1);
        return !(last >= 0xD800 && last <= 0xDBFF);
    }));
    ok('texto vacío = un fragmento vacío', ctx._fbSplitChunks('', 10).length === 1);
}

console.log('\n== fbBackupRetention ==');
{
    const today = '2026-09-28';
    const dias = [];
    for (let i = 0; i < 45; i++) {
        const d = new Date(Date.parse(today + 'T00:00:00Z') - i * 86400000);
        dias.push(d.toISOString().slice(0, 10));
    }
    const viejos = ['2026-05-03', '2026-05-10', '2026-05-20', '2025-09-01', '2024-01-15'];
    const r = ctx.fbBackupRetention(dias.concat(viejos), today);
    ok('conserva los 31 días más recientes (0..30)', dias.slice(0, 31).every(d => r.keep.includes(d)));
    ok('de agosto (fuera de 30 días) conserva solo el primero que existe',
        r.keep.includes('2026-08-15') && r.drop.includes('2026-08-20'));
    ok('de mayo conserva el 3 y borra el 10 y el 20',
        r.keep.includes('2026-05-03') && r.drop.includes('2026-05-10') && r.drop.includes('2026-05-20'));
    ok('más de un año: se borra', r.drop.includes('2025-09-01') && r.drop.includes('2024-01-15'));
    ok('ninguna fecha queda en las dos listas', r.keep.every(d => !r.drop.includes(d)));
    ok('ignora basura', ctx.fbBackupRetention(['', 'hola', null], today).keep.length === 0);
}

console.log('\n== fbBackupAssemble ==');
{
    const data = { vehicles: [{ vin: 'A', n: 1 }, { vin: 'B', n: 2 }] };
    const json = JSON.stringify(data);
    const trozos = ctx._fbSplitChunks(json, 10);
    const run = 'r1';
    const parts = trozos.map((t, i) => ({ run, module: 'cop15', i, n: trozos.length, json: t }));
    const meta = { run, modules: { cop15: { chunks: trozos.length } } };
    // Fragmentos en desorden y uno de OTRA corrida del mismo día.
    const revueltas = parts.slice().reverse().concat([{ run: 'otro', module: 'cop15', i: 0, n: 1, json: '{"x":1}' }]);
    const out = ctx.fbBackupAssemble(revueltas, meta);
    ok('arma el módulo aunque lleguen en desorden', JSON.stringify(out.cop15) === json);
    ok('ignora fragmentos de otra corrida', out.cop15.x === undefined);
    let lanzo = false;
    try { ctx.fbBackupAssemble(parts.slice(1), meta); } catch (e) { lanzo = /Faltan fragmentos/.test(e.message); }
    ok('si falta un fragmento NO restaura a medias', lanzo);
}

console.log('\n== fbBackupStatusEval ==');
{
    const now = Date.parse('2026-09-28T15:00:00Z');
    const bien = ctx.fbBackupStatusEval({ ok: true, lastOkAt: '2026-09-28T08:00:00Z', lastAttemptAt: '2026-09-28T08:00:00Z', modulesOk: 7 }, now, true);
    ok('respaldo de hoy: sin alerta', bien.alert === null);
    ok('el texto dice cuándo y cuántos módulos', /2026-09-28 08:00/.test(bien.text) && /7 módulos/.test(bien.text));
    const fallo = ctx.fbBackupStatusEval({ ok: false, error: 'HTTP 403', lastOkAt: '2026-09-27T08:00:00Z', lastAttemptAt: '2026-09-28T08:00:00Z' }, now, true);
    ok('un intento fallido avisa (ALTA) con el motivo', fallo.alert && fallo.alert.level === 'ALTA' && /HTTP 403/.test(fallo.alert.message));
    const viejo = ctx.fbBackupStatusEval({ ok: false, error: 'x', lastOkAt: '2026-09-20T08:00:00Z', lastAttemptAt: '2026-09-28T08:00:00Z' }, now, true);
    ok('más de 3 días sin respaldo es CRÍTICA', viejo.alert && viejo.alert.level === 'CRITICA' && /8 días/.test(viejo.alert.message));
    const nunca = ctx.fbBackupStatusEval({ ok: false, error: 'x', lastAttemptAt: '2026-09-28T08:00:00Z' }, now, true);
    ok('nunca hubo respaldo nuevo y ya se intentó: CRÍTICA', nunca.alert && nunca.alert.level === 'CRITICA');
    const apagado = ctx.fbBackupStatusEval({ ok: false, lastAttemptAt: '2026-09-28T08:00:00Z' }, now, false);
    ok('con la sincronización apagada no alarma', apagado.alert === null);
    const virgen = ctx.fbBackupStatusEval({}, now, true);
    ok('equipo que nunca intentó: sin alerta', virgen.alert === null);
}

console.log('\n== _pnVehicleDate (Antigüedad de Datos) ==');
{
    ok('lee registeredAt, que es lo que escribe el alta', ctx._pnVehicleDate({ registeredAt: '2026-01-01T00:00:00Z' }) === '2026-01-01T00:00:00Z');
    ok('respaldo: primer evento de la línea de tiempo', ctx._pnVehicleDate({ timeline: [{ timestamp: '2026-02-02' }] }) === '2026-02-02');
    ok('sin fecha: null', ctx._pnVehicleDate({}) === null);
}

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron');
if (fallaron) process.exitCode = 1;
