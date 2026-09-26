// ╔══════════════════════════════════════════════════════════════════════╗
// ║  2.1.0 — Roles del laboratorio y permisos                           ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// La regla que el laboratorio pidió y que este archivo fija: LIBERAR y APROBAR
// solo Signatario y Assistant Manager / Manager — nadie más, ni por rol ni por
// estar certificado en la matriz de competencias. Y renombrar los roles no puede
// dejar a nadie con más (ni con cero) permisos por accidente.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = {};
const src = f => SRC[f] || (SRC[f] = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
function extraer(f, nombre) {
    const S = src(f);
    const m = new RegExp('(?:^|\\n)function\\s+' + nombre + '\\s*\\(').exec(S);
    if (!m) throw new Error('no encontré function ' + nombre);
    let i = S.indexOf('{', m.index + m[0].length - 1), d = 0;
    for (; i < S.length; i++) { if (S[i] === '{') d++; else if (S[i] === '}') { d--; if (d === 0) break; } }
    return S.slice(m.index + (S[m.index] === '\n' ? 1 : 0), i + 1);
}
function extraerVar(f, nombre) {
    const S = src(f);
    const i0 = S.indexOf('\nvar ' + nombre + ' =');
    if (i0 < 0) throw new Error('no encontré var ' + nombre);
    let i = S.indexOf('=', i0) + 1;
    while (S[i] === ' ') i++;
    if (S[i] !== '[' && S[i] !== '{') return S.slice(i0 + 1, S.indexOf(';', i0) + 1);
    const abre = S[i], cierra = abre === '[' ? ']' : '}';
    let d = 0;
    for (; i < S.length; i++) { if (S[i] === abre) d++; else if (S[i] === cierra) { d--; if (d === 0) break; } }
    return S.slice(i0 + 1, i + 1) + ';';
}

const ctx = { console, Object, Array, String, Math, JSON, Date };
vm.createContext(ctx);
['AUTH_ROLES', 'AUTH_ROLE_DEFAULT', 'AUTH_ROLE_PERMS', 'AUTH_PERM_LABELS', 'AUTH_ROLE_ALIASES']
    .forEach(n => vm.runInContext(extraerVar('auth.js', n), ctx));
['_authFoldRole', '_authNormalizeRole', 'authRoleHas', 'authRolesWith', 'authCan']
    .forEach(n => vm.runInContext(extraer('auth.js', n), ctx));
['PN_PIN_LEN_DEFAULT', 'PN_PIN_LEN_PRIVILEGED'].forEach(n => vm.runInContext(extraerVar('panel.js', n), ctx));
vm.runInContext(extraer('panel.js', 'pnPinLenForRole'), ctx);
vm.runInContext('this.R = { AUTH_ROLES, AUTH_ROLE_PERMS, AUTH_PERM_LABELS, AUTH_ROLE_DEFAULT };', ctx);
const R = ctx.R;

let pasaron = 0, fallaron = 0;
function ok(nombre, cond, detalle) {
    if (cond) { pasaron++; console.log('  ok  ' + nombre); }
    else { fallaron++; console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
const J = JSON.stringify;
const ROLES = ['Practicante', 'Técnico', 'Especialista / Especialista Sr', 'Signatario', 'Assistant Manager / Manager'];

console.log('\n== Los roles del laboratorio ==');
ok('son 5, en orden de autoridad', J(R.AUTH_ROLES.map(r => r.key)) === J(ROLES), J(R.AUTH_ROLES.map(r => r.key)));
ok('cada rol tiene su lista de permisos', ROLES.every(r => Array.isArray(R.AUTH_ROLE_PERMS[r])));
ok('los niveles suben de 1 a 5', J(R.AUTH_ROLES.map(r => r.level)) === '[1,2,3,4,5]');
ok('un rol sin definir cae al de MENOR privilegio', R.AUTH_ROLE_DEFAULT === 'Practicante');

console.log('\n== Liberar y aprobar: Signatario y Assistant Manager / Manager, nadie más ==');
['test.release', 'test.approve'].forEach(p => {
    ok(p + ': solo los dos roles de autoridad', J(ctx.authRolesWith(p)) === J(['Signatario', 'Assistant Manager / Manager']), J(ctx.authRolesWith(p)));
});
ok('Signatario y AM/Manager tienen permisos idénticos',
    R.AUTH_PERM_LABELS.every(p => ctx.authRoleHas('Signatario', p.perm) === ctx.authRoleHas('Assistant Manager / Manager', p.perm)));
ok('borrar vehículos y editar límites: solo los roles de autoridad',
    J(ctx.authRolesWith('test.delete')) === J(['Signatario', 'Assistant Manager / Manager']) &&
    J(ctx.authRolesWith('regulation.manage')) === J(['Signatario', 'Assistant Manager / Manager']));
ok('corregir archivados y administrar usuarios: solo los roles de autoridad',
    J(ctx.authRolesWith('test.retro_edit')) === J(['Signatario', 'Assistant Manager / Manager']) &&
    J(ctx.authRolesWith('users.manage')) === J(['Signatario', 'Assistant Manager / Manager']));
ok('el Practicante apoya en Consumibles', ctx.authRoleHas('Practicante', 'inventory.manage'));
ok('todos registran y operan', ROLES.every(r => ctx.authRoleHas(r, 'test.register') && ctx.authRoleHas(r, 'test.operate')));
ok('la autoridad es acumulativa: cada rol puede todo lo del rol de abajo',
    ROLES.every((r, i) => i === 0 || R.AUTH_PERM_LABELS.every(p => !ctx.authRoleHas(ROLES[i - 1], p.perm) || ctx.authRoleHas(r, p.perm))));
ok('la matriz de permisos nombra todo lo que los roles otorgan',
    Object.keys(R.AUTH_ROLE_PERMS).every(r => R.AUTH_ROLE_PERMS[r].every(p => p === '*' || R.AUTH_PERM_LABELS.some(l => l.perm === p))));

console.log('\n== Los nombres anteriores se traducen (migración) ==');
const casos = { 'Supervisor': 'Signatario', 'Coordinador': 'Assistant Manager / Manager', 'Ingeniero': 'Especialista / Especialista Sr',
    'Técnico': 'Técnico', 'tecnico': 'Técnico', ' SUPERVISOR ': 'Signatario', 'Manager': 'Assistant Manager / Manager',
    'Assistant Manager': 'Assistant Manager / Manager', 'Especialista Sr': 'Especialista / Especialista Sr', 'especialista': 'Especialista / Especialista Sr',
    'signatario': 'Signatario', 'Practicante': 'Practicante' };
Object.keys(casos).forEach(k => ok('"' + k + '" → ' + casos[k], ctx._authNormalizeRole(k) === casos[k], ctx._authNormalizeRole(k)));
ok('un rol inventado no existe (no hereda permisos)', ctx._authNormalizeRole('Jefe supremo') === null && !ctx.authRoleHas('Jefe supremo', 'test.register'));
ok('un Técnico viejo YA NO libera (antes sí)', !ctx.authRoleHas('Técnico', 'test.release'));
ok('un Supervisor viejo sí libera: ahora es Signatario', ctx.authRoleHas('Supervisor', 'test.release'));

console.log('\n== Las competencias ya no dan permisos ==');
ctx.pnState = { operators: [{ id: 7, name: 'T', role: 'Técnico', skills: { release: { lvl: 3 }, cop_appr: { lvl: 3 } } }] };
ctx.authGetCurrentUser = () => ({ id: 7, name: 'T', role: 'Técnico' });
ok('un Técnico certificado como liberador NO puede liberar', ctx.authCan('test.release') === false);
ok('ni aprobar', ctx.authCan('test.approve') === false);
ctx.authGetCurrentUser = () => ({ id: 8, name: 'S', role: 'Signatario' });
ok('un Signatario libera por su rol, sin depender de la matriz', ctx.authCan('test.release') === true);
ctx.authGetCurrentUser = () => null;
ok('sin sesión no se puede nada', ctx.authCan('test.register') === false);

console.log('\n== El PIN largo sigue al rol, con nombres viejos o nuevos ==');
ok('Signatario → PIN largo', ctx.pnPinLenForRole('Signatario') === ctx.PN_PIN_LEN_PRIVILEGED);
ok('"Supervisor" (viejo) → PIN largo', ctx.pnPinLenForRole('Supervisor') === ctx.PN_PIN_LEN_PRIVILEGED);
ok('Técnico → PIN normal', ctx.pnPinLenForRole('Técnico') === ctx.PN_PIN_LEN_DEFAULT);

console.log('\n' + pasaron + ' pasaron, ' + fallaron + ' fallaron\n');
process.exit(fallaron ? 1 : 0);
