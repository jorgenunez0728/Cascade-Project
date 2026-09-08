// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Guardia de código muerto — corre en `npm test`, falla el build.     ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// POR QUÉ EXISTE. Todo en esta app vive en el ámbito global (a propósito: un
// solo archivo, offline). Eso significa que NADA avisa cuando una función deja
// de tener llamadores: no hay linter de módulos, no hay `import` que se rompa.
// La auditoría de v23.1 encontró ~42 funciones inalcanzables (~543 líneas),
// incluidos dos subsistemas completos —el motor de plantillas y el predictor de
// sustituciones— y DOS alias cuyo comentario afirmaba falsamente que alguien
// los llamaba. Todas habrían caído aquí en el commit que las creó.
//
// CÓMO FUNCIONA. Recorre `js/*.js`, saca las funciones de nivel superior, y
// busca cada nombre en TODO el repo (js + index.html + sw.js + tests) fuera de
// su propia definición. Cuenta como referencia cualquier aparición: llamada,
// `onclick="f()"` dentro de un template string, `window['f']`, etc. Es
// deliberadamente PERMISIVO — un falso negativo (no detectar código muerto) es
// barato; un falso positivo que rompa el build de alguien, no.
//
// CÓMO AÑADIR UNA EXCEPCIÓN. Si una función es un punto de entrada legítimo sin
// llamadores en el repo (la llama la consola, un `onclick` que aún no existe, o
// es una API pública a propósito), añádela a ALLOWLIST con el motivo. Un
// comentario `// @entrypoint` en la línea anterior a la función hace lo mismo.

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const JS_DIR = path.join(REPO, 'js');

// Puntos de entrada legítimos sin llamador en el repo. Cada uno con su motivo.
const ALLOWLIST = {
    initializeSystem: 'lo llama el DOMContentLoaded de index.html',
};

/** Quita SOLO los comentarios, conservando las cadenas: los `onclick="f()"` se
 *  construyen dentro de template literals y ésos SÍ son referencias reales.
 *  Una mención en un comentario NO lo es — ése fue justamente el caso de
 *  `tpGenerateWeekly`/`fbSetStation`, cuyos comentarios afirmaban falsamente
 *  que alguien los llamaba. */
function stripComments(src) {
    let out = '', i = 0, n = src.length;
    while (i < n) {
        const c = src[i], c2 = src[i + 1];
        if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; out += c; i++;
            while (i < n && src[i] !== q) { if (src[i] === '\\') { out += src[i]; i++; } out += src[i]; i++; }
            out += q; i++; continue;
        }
        out += c; i++;
    }
    return out;
}

/** Quita cadenas y comentarios para que un nombre citado no cuente como definición. */
function stripCode(src) {
    let out = '', i = 0, n = src.length;
    while (i < n) {
        const c = src[i], c2 = src[i + 1];
        if (c === '/' && c2 === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && c2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; i++;
            while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
            i++; out += ' '; continue;
        }
        out += c; i++;
    }
    return out;
}

const jsFiles = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort();

// Todo el texto donde puede aparecer una referencia (incluidas cadenas: los
// onclick se construyen dentro de template literals).
const haystack = [];
jsFiles.forEach(f => haystack.push({ file: 'js/' + f, text: stripComments(fs.readFileSync(path.join(JS_DIR, f), 'utf8')) }));
['index.html', 'sw.js'].forEach(f => {
    const p = path.join(REPO, f);
    if (fs.existsSync(p)) haystack.push({ file: f, text: fs.readFileSync(p, 'utf8') });
});
const testsDir = path.join(REPO, 'tests');
if (fs.existsSync(testsDir)) {
    fs.readdirSync(testsDir).filter(f => f.endsWith('.js') && f !== 'deadcode.node.js')
        .forEach(f => haystack.push({ file: 'tests/' + f, text: stripComments(fs.readFileSync(path.join(testsDir, f), 'utf8')) }));
}

// Declaraciones de nivel superior. `cop15.js` tiene funciones top-level
// indentadas 3-4 espacios, así que no se puede anclar en `^function`: se exige
// profundidad de llaves 0 en código ya despojado de cadenas y comentarios.
const defs = [];   // {name, file, line}
jsFiles.forEach(f => {
    const raw = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
    const code = stripCode(raw);
    let depth = 0, line = 1;
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (ch === '\n') { line++; continue; }
        if (ch === '{') { depth++; continue; }
        if (ch === '}') { depth--; continue; }
        if (depth !== 0) continue;
        if (ch !== 'f') continue;
        const m = /^function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(code.slice(i, i + 120));
        if (!m) continue;
        // Sólo DECLARACIONES. Una expresión de función con nombre —`x = function f(){}`
        // y sobre todo el IIFE `(function f(){ ... })()`— ya se está ejecutando o ya
        // tiene su referencia, así que no es huérfana. `setupAltaValidation`
        // (cop15.js) es exactamente ese caso y fue el primer falso positivo.
        let k = i - 1;
        while (k >= 0 && /\s/.test(code[k])) k--;
        const before = k >= 0 ? code[k] : '';
        if (before && !'};'.includes(before)) continue;
        defs.push({ name: m[1], file: 'js/' + f, line });
    }
});

// `// @entrypoint` en la línea anterior exime a la función.
const exempt = new Set(Object.keys(ALLOWLIST));
defs.forEach(d => {
    const lines = fs.readFileSync(path.join(REPO, d.file), 'utf8').split('\n');
    const prev = (lines[d.line - 2] || '') + (lines[d.line - 3] || '');
    if (/@entrypoint/.test(prev)) exempt.add(d.name);
});

// Un nombre está vivo si aparece en cualquier sitio que NO sea su(s) definición(es).
const defCount = {};
defs.forEach(d => { defCount[d.name] = (defCount[d.name] || 0) + 1; });

const orphans = [];
defs.forEach(d => {
    if (exempt.has(d.name)) return;
    if (orphans.some(o => o.name === d.name)) return;
    const re = new RegExp('\\b' + d.name.replace(/\$/g, '\\$') + '\\b', 'g');
    let hits = 0;
    for (const h of haystack) {
        const found = h.text.match(re);
        if (found) hits += found.length;
    }
    // Cada definición aporta 1 aparición. Si no hay ninguna más, nadie la usa.
    if (hits <= defCount[d.name]) orphans.push(d);
});

if (orphans.length) {
    console.error('\n✗ ' + orphans.length + ' función(es) de nivel superior sin ninguna referencia:\n');
    orphans.forEach(o => console.error('   ' + o.file + ':' + o.line + '  ' + o.name));
    console.error('\nBórralas, conéctalas, o —si son un punto de entrada legítimo— añádelas');
    console.error('a ALLOWLIST en tests/deadcode.node.js con el motivo, o marca la función');
    console.error('con un comentario `// @entrypoint` en la línea anterior.\n');
    process.exit(1);
}

console.log('✓ código muerto: 0 huérfanas de ' + defs.length + ' funciones de nivel superior en ' + jsFiles.length + ' módulos');
process.exit(0);
