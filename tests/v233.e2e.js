const { chromium } = require('playwright');
// Verificación en navegador de v23.3: botones en lugar de listas (uiChipsEnhance),
// "Otro…" con texto libre, checklist de liberación, Historial → Completar con
// checklist y SOC opcional, y la liberación por lote en pausa.
const path = require('path');
const REPO = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const fallos = [];
function chk(nombre, cond, detalle) {
  if (cond) { console.log('  ok  ' + nombre); return; }
  fallos.push(nombre); console.log('  FALLA  ' + nombre + (detalle ? ' — ' + detalle : ''));
}
const SEED = () => {
  localStorage.setItem('kia_auth_session', JSON.stringify({ operatorId:'op-test', operatorName:'Jorge Nunez', expiresAt:new Date(Date.now()+11*3600e3).toISOString() }));
  localStorage.setItem('kia_panel_v1', JSON.stringify({ operators:[{id:'op-test',name:'Jorge Nunez',role:'Administrador',active:true},{id:'op-2',name:'Ivan Cardenas',role:'Técnico',active:true}], tasks:[],projects:[],alerts:[] }));
  localStorage.setItem('kia_current_operator','Jorge Nunez');
  localStorage.setItem('kia_fb_sync_modules', JSON.stringify({}));
  const cfg = {'REGION':'EUROPE','EMISSION REGULATION':'PRE-EURO 7','Modelo':'CL4'};
  localStorage.setItem('kia_db_v11', JSON.stringify({ lastId:3, vehicles:[
    { id:'v1', vin:'KNATEST00001', status:'testing', configCode:'CFG1', purpose:'COP-Emisiones', timeline:[], config:cfg,
      testData:{ preconditioning:{ fuelTypeIn:'E10 especial', cycle:'WLTP' }, testVerification:{ tunnel:'RMT2' } } },
    { id:'v2', vin:'KNATEST00002', status:'ready-release', configCode:'CFG1', purpose:'COP-Emisiones', timeline:[], config:cfg, testData:{} },
    { id:'v3', vin:'KNATEST00003', status:'archived', archivedAt:'2026-09-10T12:00:00Z', configCode:'CFG1', purpose:'COP-Emisiones', timeline:[], config:cfg,
      testData:{ signatures:{ releaser:{signerName:'X', signedAt:'2026-09-10T11:00:00Z', dataUrl:'data:image/png;base64,AA'}, approver:{signerName:'Y', signedAt:'2026-09-10T12:00:00Z', dataUrl:'data:image/png;base64,AA'} } } }
  ]}));
  localStorage.setItem('kia_help_dismissed', JSON.stringify({'*':true}));
  localStorage.setItem('kia_tour_done','1');
  ['global','today','testplan','inventory','panel','cop','cop15'].forEach(m=>localStorage.setItem('kia_tour_done_'+m,'1'));
};
(async()=>{
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await (await browser.newContext({ viewport:{width:800,height:1200} })).newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(SEED);
  await page.goto('file://'+path.join(REPO,'index.html'));
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{ switchPlatform('cop15'); document.querySelector('.tab[data-tab="seguimiento"]').click(); });
  await page.waitForTimeout(500);
  await page.evaluate(()=>{ const s=document.getElementById('activeVehSelect'); s.value='v1'; loadVehicle(); document.querySelectorAll('#seguimiento details, details.acc').forEach(d=>d.open=true); });
  await page.waitForTimeout(600);
  const r1 = await page.evaluate(()=>({
    chipGroups: document.querySelectorAll('.ui-chips').length,
    fuelChips: [...document.querySelector('#fuel_typein').nextElementSibling.querySelectorAll('button')].map(b=>b.textContent+(b.classList.contains('is-on')?'*':'')),
    tunnelOn: document.querySelector('#test_tunnel + .ui-chips .is-on')?.textContent,
    opChips: [...document.querySelector('#op_recep + .ui-chips').querySelectorAll('button')].map(b=>b.textContent),
  }));
  chk('las 23 listas marcadas se pintan como botones', r1.chipGroups >= 23, r1.chipGroups);
  chk('un valor "Otro" guardado se carga y se ve elegido', r1.fuelChips.some(t => t.indexOf('E10 especial') === 0 && t.endsWith('*')), JSON.stringify(r1.fuelChips));
  chk('el valor guardado de Túnel aparece elegido', r1.tunnelOn === 'RMT2', r1.tunnelOn);
  chk('los operadores salen como botones', r1.opChips.length >= 2);
  // click Magna chip, then Otro
  await page.click('#fuel_typein + .ui-chips button[data-v="Magna"]');
  const v1 = await page.evaluate(()=>document.getElementById('fuel_typein').value);
  await page.evaluate(()=>{ document.querySelector('#fuel_typepre + .ui-chips [data-other-open]').click();
    const i=document.querySelector('#fuel_typepre + .ui-chips input'); i.value='Gasolina E5 prueba';
    document.querySelector('#fuel_typepre + .ui-chips [data-other-ok]').click(); });
  const v2 = await page.evaluate(()=>document.getElementById('fuel_typepre').value);
  await page.evaluate(()=>document.querySelector('#test_fan_mode + .ui-chips button[data-v="speed"]').click());
  const fanSpeedEnabled = await page.evaluate(()=>!document.getElementById('test_fan_speed').disabled);
  chk('tocar un botón escribe el valor en el campo real', v1 === 'Magna', v1);
  chk('"Otro…" guarda lo tecleado, no la palabra Otro', v2 === 'Gasolina E5 prueba', v2);
  chk('el onchange original sigue corriendo (modo de ventilador)', fanSpeedEnabled);
  // Liberación checklist
  await page.evaluate(()=>{ document.querySelector('.tab[data-tab="liberacion"]').click(); const s=document.getElementById('releaseVehSelect'); s.value='v2'; loadRelease(); });
  await page.waitForTimeout(400);
  chk('la tarjeta del checklist aparece en Liberación', await page.evaluate(()=>document.getElementById('lib-checklist-card').style.display === 'block'));
  // Historial Completar for legacy v3
  await page.evaluate(()=>{ histOpenCompleteModal('v3'); });
  await page.waitForTimeout(400);
  const r3 = await page.evaluate(()=>({ checklist: !!document.getElementById('hist-checklist'), opcional: document.body.innerText.includes('Opcional'), legacy: releaseChecklistRows(db.vehicles.find(v=>v.id==='v3')).legacy }));
  chk('Completar muestra el checklist', r3.checklist);
  chk('el SOC de prueba sale como Opcional en una prueba vieja', r3.opcional);
  chk('la prueba vieja se reconoce como anterior al checklist', r3.legacy);
  chk('Completar usa botones también', await page.evaluate(()=>document.querySelectorAll('#hist-complete-root .ui-chips').length > 0));
  // change one legacy row and save
  await page.click('#hist-checklist button[onclick*="\'objects\',\'cardaq\',\'na\'"]');
  await page.evaluate(()=>histSaveCompleteModal());
  await page.waitForTimeout(300);
  const cl = await page.evaluate(()=>db.vehicles.find(v=>v.id==='v3').testData.releaseChecklist);
  chk('la corrección del checklist se guarda y queda marcada retro', cl && cl.objects && cl.objects.cardaq === 'na' && cl.retro === true, JSON.stringify(cl));
  chk('la liberación por lote no tiene botón', await page.evaluate(()=>document.getElementById('v7-batch-release').innerHTML === ''));
  chk('sin errores de página', errs.length === 0, errs.join(' | '));
  await browser.close();
  console.log(fallos.length ? '\n' + fallos.length + ' fallo(s)' : '\ntodo pasó');
  process.exitCode = fallos.length ? 1 : 0;
})();
