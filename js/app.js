// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — App Core (Config, Utilities, Platform, Init)          ║
// ╚══════════════════════════════════════════════════════════════════════╝

// [v17.13] Los últimos errores internos se conservan en memoria para adjuntarlos
// al reporte de bugs (botón 🐞). Solo RAM: nada se persiste ni se envía solo.
window._bugRecentErrors = [];
function _bugRecordError(type, message, source, line) {
  try {
    window._bugRecentErrors.push({
      at: new Date().toISOString(), type: type,
      message: String(message || '').slice(0, 300),
      source: source ? String(source).split('/').pop() : '', line: line || 0
    });
    if (window._bugRecentErrors.length > 20) window._bugRecentErrors.shift();
  } catch (err) {}
}

window.addEventListener('error', (e) => {
  console.error('🔥 Error JS:', e.message, 'en', e.filename, 'línea', e.lineno);
  _bugRecordError('error', e.message, e.filename, e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  var reason = e && e.reason;
  _bugRecordError('promesa', (reason && reason.message) ? reason.message : reason, '', 0);
});

// ======================================================================
// [M00] CONFIGURACIÓN Y CONSTANTES]
// ======================================================================

    const CSV_CONFIGURATIONS = `codigo_config_text,Modelo,MODEL YEAR (VIN),TRANSMISSION,ENVIRONMENT PACKAGE,EMISSION REGULATION,DRIVE TYPE,ENGINE CAPACITY,TIRE ASSY,REGION,BODY TYPE,ENGINE PACKAGE
BL7m-26 MODEL-6MT-0-EURO-5-LHD-1400cc KAPPA-185/65 R15-MEXICO-4DR-DCVVT,BL7m,26 MODEL,6MT,0,EURO-5,LHD,1400cc KAPPA,185/65 R15,MEXICO,4DR,DCVVT
BL7m-26 MODEL-6MT-0-EURO-5-LHD-1600cc GAMMA-185/65 R15-MEXICO-5DR-DCVVT,BL7m,26 MODEL,6MT,0,EURO-5,LHD,1600cc GAMMA,185/65 R15,MEXICO,5DR,DCVVT
BL7m-26 MODEL-6MT-0-EURO-5-LHD-1600cc GAMMA-185/65 R15-MEXICO-4DR-DCVVT,BL7m,26 MODEL,6MT,0,EURO-5,LHD,1600cc GAMMA,185/65 R15,MEXICO,4DR,DCVVT
BL7m-26 MODEL-6MT-0-EURO-6C-LHD-1400cc KAPPA-185/65 R15-GENERAL-5DR-0,BL7m,26 MODEL,6MT,0,EURO-6C,LHD,1400cc KAPPA,185/65 R15,GENERAL,5DR,0
BL7m-26 MODEL-6MT-0-EURO-6C-LHD-1400cc KAPPA-185/65 R15-GENERAL-4DR-0,BL7m,26 MODEL,6MT,0,EURO-6C,LHD,1400cc KAPPA,185/65 R15,GENERAL,4DR,0
BL7m-26 MODEL-6MT-0-EURO-6C-LHD-1600cc GAMMA-205/50 R17-GENERAL-5DR-DCVVT,BL7m,26 MODEL,6MT,0,EURO-6C,LHD,1600cc GAMMA,205/50 R17,GENERAL,5DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-2-LHD-1400cc KAPPA-205/55 R16-GENERAL-5DR-0,BL7m,26 MODEL,6AT,0,EURO-2,LHD,1400cc KAPPA,205/55 R16,GENERAL,5DR,0
BL7m-26 MODEL-6AT-0-EURO-2-LHD-1400cc KAPPA-205/50 R17-GENERAL-4DR-0,BL7m,26 MODEL,6AT,0,EURO-2,LHD,1400cc KAPPA,205/50 R17,GENERAL,4DR,0
BL7m-26 MODEL-6AT-0-EURO-2-LHD-1400cc KAPPA-185/65 R15-GENERAL-4DR-0,BL7m,26 MODEL,6AT,0,EURO-2,LHD,1400cc KAPPA,185/65 R15,GENERAL,4DR,0
BL7m-26 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-205/50 R17-GENERAL-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,205/50 R17,GENERAL,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-205/55 R16-MIDDLE EAST-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,205/55 R16,MIDDLE EAST,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-205/50 R17-GENERAL-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,205/50 R17,GENERAL,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-185/65 R15-MIDDLE EAST-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,185/65 R15,MIDDLE EAST,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/55 R16-MIDDLE EAST-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/55 R16,MIDDLE EAST,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/55 R16-MEXICO-5DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/55 R16,MEXICO,5DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/55 R16-MEXICO-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/55 R16,MEXICO,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/50 R17-MIDDLE EAST-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/50 R17,MIDDLE EAST,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/50 R17-GENERAL-5DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/50 R17,GENERAL,5DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/50 R17-GENERAL-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/50 R17,GENERAL,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-185/65 R15-MIDDLE EAST-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,185/65 R15,MIDDLE EAST,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-185/65 R15-MEXICO-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,185/65 R15,MEXICO,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-205/50 R17-MEXICO-4DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,205/50 R17,MEXICO,4DR,DCVVT
BL7m-26 MODEL-6AT-0-EURO-6C-LHD-1400cc KAPPA-185/65 R15-GENERAL-5DR-0,BL7m,26 MODEL,6AT,0,EURO-6C,LHD,1400cc KAPPA,185/65 R15,GENERAL,5DR,0
BL7m-26 MODEL-6AT-0-EURO-6C-LHD-1400cc KAPPA-185/65 R15-GENERAL-4DR-0,BL7m,26 MODEL,6AT,0,EURO-6C,LHD,1400cc KAPPA,185/65 R15,GENERAL,4DR,0
BL7m-26 MODEL-6AT-0-EURO-6C-LHD-1600cc GAMMA-205/50 R17-GENERAL-5DR-DCVVT,BL7m,26 MODEL,6AT,0,EURO-6C,LHD,1600cc GAMMA,205/50 R17,GENERAL,5DR,DCVVT
BL7m-27 MODEL-6MT-0-EURO-2-LHD-1400cc KAPPA-185/65 R15-GENERAL-5DR-0,BL7m,27 MODEL,6MT,0,EURO-2,LHD,1400cc KAPPA,185/65 R15,GENERAL,5DR,0
BL7m-27 MODEL-6MT-0-EURO-2-LHD-1400cc KAPPA-185/65 R15-GENERAL-4DR-0,BL7m,27 MODEL,6MT,0,EURO-2,LHD,1400cc KAPPA,185/65 R15,GENERAL,4DR,0
BL7m-27 MODEL-6MT-0-EURO-4-LHD-1400cc KAPPA-205/55 R16-GENERAL-5DR-0,BL7m,27 MODEL,6MT,0,EURO-4,LHD,1400cc KAPPA,205/55 R16,GENERAL,5DR,0
BL7m-27 MODEL-6MT-0-EURO-4-LHD-1400cc KAPPA-205/55 R16-GENERAL-4DR-0,BL7m,27 MODEL,6MT,0,EURO-4,LHD,1400cc KAPPA,205/55 R16,GENERAL,4DR,0
BL7m-27 MODEL-6MT-0-EURO-4-LHD-1400cc KAPPA-185/65 R15-GENERAL-4DR-0,BL7m,27 MODEL,6MT,0,EURO-4,LHD,1400cc KAPPA,185/65 R15,GENERAL,4DR,0
BL7m-27 MODEL-6MT-0-EURO-4-LHD-1600cc GAMMA-185/65 R15-GENERAL-5DR-DCVVT,BL7m,27 MODEL,6MT,0,EURO-4,LHD,1600cc GAMMA,185/65 R15,GENERAL,5DR,DCVVT
BL7m-27 MODEL-6MT-0-EURO-4-LHD-1600cc GAMMA-185/65 R15-GENERAL-4DR-DCVVT,BL7m,27 MODEL,6MT,0,EURO-4,LHD,1600cc GAMMA,185/65 R15,GENERAL,4DR,DCVVT
BL7m-27 MODEL-6MT-0-EURO-5-LHD-1400cc KAPPA-185/65 R15-GENERAL-4DR-0,BL7m,27 MODEL,6MT,0,EURO-5,LHD,1400cc KAPPA,185/65 R15,GENERAL,4DR,0
BL7m-27 MODEL-6MT-0-EURO-5-LHD-1400cc KAPPA-185/65 R15-MEXICO-4DR-DCVVT,BL7m,27 MODEL,6MT,0,EURO-5,LHD,1400cc KAPPA,185/65 R15,MEXICO,4DR,DCVVT
BL7m-27 MODEL-6MT-0-EURO-5-LHD-1600cc GAMMA-185/65 R15-MEXICO-5DR-DCVVT,BL7m,27 MODEL,6MT,0,EURO-5,LHD,1600cc GAMMA,185/65 R15,MEXICO,5DR,DCVVT
BL7m-27 MODEL-6MT-0-EURO-5-LHD-1600cc GAMMA-185/65 R15-MEXICO-4DR-DCVVT,BL7m,27 MODEL,6MT,0,EURO-5,LHD,1600cc GAMMA,185/65 R15,MEXICO,4DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1400cc KAPPA-205/55 R16-GENERAL-5DR-0,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1400cc KAPPA,205/55 R16,GENERAL,5DR,0
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1400cc KAPPA-205/55 R16-GENERAL-4DR-0,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1400cc KAPPA,205/55 R16,GENERAL,4DR,0
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1400cc KAPPA-205/50 R17-GENERAL-5DR-0,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1400cc KAPPA,205/50 R17,GENERAL,5DR,0
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1400cc KAPPA-185/65 R15-GENERAL-5DR-0,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1400cc KAPPA,185/65 R15,GENERAL,5DR,0
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1400cc KAPPA-185/65 R15-GENERAL-4DR-0,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1400cc KAPPA,185/65 R15,GENERAL,4DR,0
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-205/55 R16-GENERAL-5DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,205/55 R16,GENERAL,5DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-205/55 R16-GENERAL-4DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,205/55 R16,GENERAL,4DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-205/50 R17-GENERAL-5DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,205/50 R17,GENERAL,5DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-205/50 R17-GENERAL-4DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,205/50 R17,GENERAL,4DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1400cc KAPPA-205/55 R16-GENERAL-5DR-0,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1400cc KAPPA,205/55 R16,GENERAL,5DR,0
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1400cc KAPPA-205/50 R17-GENERAL-5DR-0,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1400cc KAPPA,205/50 R17,GENERAL,5DR,0
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1400cc KAPPA-185/65 R15-GENERAL-5DR-0,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1400cc KAPPA,185/65 R15,GENERAL,5DR,0
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1400cc KAPPA-185/65 R15-GENERAL-4DR-0,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1400cc KAPPA,185/65 R15,GENERAL,4DR,0
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-205/55 R16-GENERAL-5DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,205/55 R16,GENERAL,5DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-205/55 R16-GENERAL-4DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,205/55 R16,GENERAL,4DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-205/50 R17-GENERAL-5DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,205/50 R17,GENERAL,5DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-205/50 R17-GENERAL-4DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,205/50 R17,GENERAL,4DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-185/65 R15-GENERAL-5DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,185/65 R15,GENERAL,5DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-5-LHD-1400cc KAPPA-205/55 R16-GENERAL-4DR-0,BL7m,27 MODEL,6AT,0,EURO-5,LHD,1400cc KAPPA,205/55 R16,GENERAL,4DR,0
BL7m-27 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/55 R16-MEXICO-5DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/55 R16,MEXICO,5DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/55 R16-MEXICO-4DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/55 R16,MEXICO,4DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/50 R17-MEXICO-5DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/50 R17,MEXICO,5DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/50 R17-MEXICO-4DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/50 R17,MEXICO,4DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-185/65 R15-MEXICO-4DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,185/65 R15,MEXICO,4DR,DCVVT
BL7m-27 MODEL-6AT-0-EURO-5-LHD-2000cc NU-205/50 R17-MEXICO-5DR-DCVVT,BL7m,27 MODEL,6AT,0,EURO-5,LHD,2000cc NU,205/50 R17,MEXICO,5DR,DCVVT
NX4m-26 MODEL-8AT 4WD-0-SULEV 30-LHD-2500CC THETA-III-235/60 R18-CANADA-WGN LONG-0,NX4m,26 MODEL,8AT 4WD,0,SULEV 30,LHD,2500CC THETA-III,235/60 R18,CANADA,WGN LONG,0
NX4m-26 MODEL-8AT 4WD-0-SULEV 30-LHD-2500CC THETA-III-235/65 R17-CANADA-WGN LONG-0,NX4m,26 MODEL,8AT 4WD,0,SULEV 30,LHD,2500CC THETA-III,235/65 R17,CANADA,WGN LONG,0
CL4-26 MODEL-6MT-0-EURO-5-LHD-2000cc NU-PE-205/55 R16-MEXICO-4DR-ATKINSON,CL4,26 MODEL,6MT,0,EURO-5,LHD,2000cc NU-PE,205/55 R16,MEXICO,4DR,ATKINSON
CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0,CL4,26 MODEL,6MT,0,PRE-EURO 7,LHD,1000cc KAPPA PE,205/55 R16,EUROPE,5DR,0
CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-WGN-0,CL4,26 MODEL,6MT,0,PRE-EURO 7,LHD,1000cc KAPPA PE,205/55 R16,EUROPE,WGN,0
CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-225/45 R17-EUROPE-5DR-0,CL4,26 MODEL,6MT,0,PRE-EURO 7,LHD,1000cc KAPPA PE,225/45 R17,EUROPE,5DR,0
CL4-26 MODEL-6MT-0-PRE-EURO 7-LHD-1000cc KAPPA PE-225/45 R17-EUROPE-WGN-0,CL4,26 MODEL,6MT,0,PRE-EURO 7,LHD,1000cc KAPPA PE,225/45 R17,EUROPE,WGN,0
CL4-26 MODEL-6MT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0,CL4,26 MODEL,6MT,MILD HEV,PRE-EURO 7,LHD,1000cc KAPPA PE,205/55 R16,EUROPE,5DR,0
CL4-26 MODEL-6MT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-WGN-0,CL4,26 MODEL,6MT,MILD HEV,PRE-EURO 7,LHD,1000cc KAPPA PE,205/55 R16,EUROPE,WGN,0
CL4-26 MODEL-6MT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-225/45 R17-EUROPE-5DR-0,CL4,26 MODEL,6MT,MILD HEV,PRE-EURO 7,LHD,1000cc KAPPA PE,225/45 R17,EUROPE,5DR,0
CL4-26 MODEL-6MT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-225/45 R17-EUROPE-WGN-0,CL4,26 MODEL,6MT,MILD HEV,PRE-EURO 7,LHD,1000cc KAPPA PE,225/45 R17,EUROPE,WGN,0
CL4-26 MODEL-6MT-MILD HEV-PRE-EURO 7-RHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0,CL4,26 MODEL,6MT,MILD HEV,PRE-EURO 7,RHD,1000cc KAPPA PE,205/55 R16,EUROPE,5DR,0
CL4-26 MODEL-6MT-MILD HEV-PRE-EURO 7-RHD-1000cc KAPPA PE-205/55 R16-EUROPE-WGN-0,CL4,26 MODEL,6MT,MILD HEV,PRE-EURO 7,RHD,1000cc KAPPA PE,205/55 R16,EUROPE,WGN,0
CL4-26 MODEL-6MT-MILD HEV-PRE-EURO 7-RHD-1000cc KAPPA PE-225/45 R17-EUROPE-5DR-0,CL4,26 MODEL,6MT,MILD HEV,PRE-EURO 7,RHD,1000cc KAPPA PE,225/45 R17,EUROPE,5DR,0
CL4-26 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-225/45 R17-MIDDLE EAST-4DR-0,CL4,26 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,225/45 R17,MIDDLE EAST,4DR,0
CL4-26 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-225/45 R17-GENERAL-4DR-0,CL4,26 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,225/45 R17,GENERAL,4DR,0
CL4-26 MODEL-6AT-0-EURO-2-RHD-1600cc GAMMA-205/55 R16-GENERAL-4DR-0,CL4,26 MODEL,6AT,0,EURO-2,RHD,1600cc GAMMA,205/55 R16,GENERAL,4DR,0
CL4-26 MODEL-6AT-0-EURO-2-RHD-1600cc GAMMA-225/45 R17-GENERAL-5DR-0,CL4,26 MODEL,6AT,0,EURO-2,RHD,1600cc GAMMA,225/45 R17,GENERAL,5DR,0
CL4-26 MODEL-6AT-0-EURO-2-RHD-1600cc GAMMA-225/45 R17-GENERAL-4DR-0,CL4,26 MODEL,6AT,0,EURO-2,RHD,1600cc GAMMA,225/45 R17,GENERAL,4DR,0
CL4-26 MODEL-6AT-0-EURO-3-LHD-2000cc NU-235/40 R18-GENERAL-4DR-0,CL4,26 MODEL,6AT,0,EURO-3,LHD,2000cc NU,235/40 R18,GENERAL,4DR,0
CL4-26 MODEL-6AT-0-EURO-4-LHD-1600cc GAMMA-205/55 R16-MIDDLE EAST-4DR-0,CL4,26 MODEL,6AT,0,EURO-4,LHD,1600cc GAMMA,205/55 R16,MIDDLE EAST,4DR,0
CL4-26 MODEL-6AT-0-EURO-4-LHD-2000cc NU-205/55 R16-MIDDLE EAST-4DR-0,CL4,26 MODEL,6AT,0,EURO-4,LHD,2000cc NU,205/55 R16,MIDDLE EAST,4DR,0
CL4-26 MODEL-6AT-0-EURO-4-LHD-2000cc NU-225/45 R17-MIDDLE EAST-4DR-0,CL4,26 MODEL,6AT,0,EURO-4,LHD,2000cc NU,225/45 R17,MIDDLE EAST,4DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/55 R16-MIDDLE EAST-4DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/55 R16,MIDDLE EAST,4DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/55 R16-EUROPE-5DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/55 R16,EUROPE,5DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-205/55 R16-RUSSIA-5DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,205/55 R16,RUSSIA,5DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-1600cc GAMMA-225/45 R17-EUROPE-5DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,1600cc GAMMA,225/45 R17,EUROPE,5DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-205/55 R16-MIDDLE EAST-4DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,205/55 R16,MIDDLE EAST,4DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-235/40 R18-EUROPE-5DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,235/40 R18,EUROPE,5DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-235/40 R18-GENERAL-5DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,235/40 R18,GENERAL,5DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-235/40 R18-GENERAL-4DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,235/40 R18,GENERAL,4DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-225/45 R17-MIDDLE EAST-4DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,225/45 R17,MIDDLE EAST,4DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-225/45 R17-GENERAL-5DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,225/45 R17,GENERAL,5DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-225/45 R17-GENERAL-4DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,225/45 R17,GENERAL,4DR,0
CL4-26 MODEL-6AT-0-EURO-5-LHD-2000cc NU-225/45 R17-RUSSIA-4DR-0,CL4,26 MODEL,6AT,0,EURO-5,LHD,2000cc NU,225/45 R17,RUSSIA,4DR,0
CL4-26 MODEL-8AT-0-EURO-2-LHD-1600CC GAMMA-II-235/40 R18-MIDDLE EAST-4DR-0,CL4,26 MODEL,8AT,0,EURO-2,LHD,1600CC GAMMA-II,235/40 R18,MIDDLE EAST,4DR,0
CL4-26 MODEL-8AT-0-EURO-2-LHD-1600CC GAMMA-II-235/40 R18-GENERAL-5DR-0,CL4,26 MODEL,8AT,0,EURO-2,LHD,1600CC GAMMA-II,235/40 R18,GENERAL,5DR,0
CL4-26 MODEL-8AT-0-EURO-2-LHD-1600CC GAMMA-II-235/40 R18-GENERAL-4DR-0,CL4,26 MODEL,8AT,0,EURO-2,LHD,1600CC GAMMA-II,235/40 R18,GENERAL,4DR,0
CL4-26 MODEL-8AT-0-EURO-2-RHD-1600CC GAMMA-II-235/40 R18-GENERAL-5DR-0,CL4,26 MODEL,8AT,0,EURO-2,RHD,1600CC GAMMA-II,235/40 R18,GENERAL,5DR,0
CL4-26 MODEL-8AT-0-EURO-2-RHD-1600CC GAMMA-II-235/40 R18-GENERAL-4DR-0,CL4,26 MODEL,8AT,0,EURO-2,RHD,1600CC GAMMA-II,235/40 R18,GENERAL,4DR,0
CL4-26 MODEL-8AT-0-EURO-4-LHD-1600CC GAMMA-II-235/40 R18-MIDDLE EAST-4DR-0,CL4,26 MODEL,8AT,0,EURO-4,LHD,1600CC GAMMA-II,235/40 R18,MIDDLE EAST,4DR,0
CL4-26 MODEL-8AT-0-EURO-5-LHD-1600CC GAMMA-II-235/40 R18-MIDDLE EAST-4DR-0,CL4,26 MODEL,8AT,0,EURO-5,LHD,1600CC GAMMA-II,235/40 R18,MIDDLE EAST,4DR,0
CL4-26 MODEL-8AT-0-EURO-5-LHD-1600CC GAMMA-II-235/40 R18-MEXICO-5DR-0,CL4,26 MODEL,8AT,0,EURO-5,LHD,1600CC GAMMA-II,235/40 R18,MEXICO,5DR,0
CL4-26 MODEL-8AT-0-EURO-5-LHD-1600CC GAMMA-II-235/40 R18-MEXICO-4DR-0,CL4,26 MODEL,8AT,0,EURO-5,LHD,1600CC GAMMA-II,235/40 R18,MEXICO,4DR,0
CL4-26 MODEL-8AT-0-EURO-5-RHD-1600CC GAMMA-II-235/40 R18-AUSTRALIA-5DR-0,CL4,26 MODEL,8AT,0,EURO-5,RHD,1600CC GAMMA-II,235/40 R18,AUSTRALIA,5DR,0
CL4-26 MODEL-8AT-0-EURO-5-RHD-1600CC GAMMA-II-235/40 R18-AUSTRALIA-4DR-0,CL4,26 MODEL,8AT,0,EURO-5,RHD,1600CC GAMMA-II,235/40 R18,AUSTRALIA,4DR,0
CL4-26 MODEL-8AT-0-SULEV 30-LHD-1600CC GAMMA-II-235/40 R18-CANADA-5DR-0,CL4,26 MODEL,8AT,0,SULEV 30,LHD,1600CC GAMMA-II,235/40 R18,CANADA,5DR,0
CL4-26 MODEL-8AT-0-SULEV 30-LHD-1600CC GAMMA-II-235/40 R18-CANADA-4DR-0,CL4,26 MODEL,8AT,0,SULEV 30,LHD,1600CC GAMMA-II,235/40 R18,CANADA,4DR,0
CL4-26 MODEL-8AT-0-SULEV 30-LHD-1600CC GAMMA-II-235/40 R18-USA-5DR-0,CL4,26 MODEL,8AT,0,SULEV 30,LHD,1600CC GAMMA-II,235/40 R18,USA,5DR,0
CL4-26 MODEL-8AT-0-SULEV 30-LHD-1600CC GAMMA-II-235/40 R18-USA-4DR-0,CL4,26 MODEL,8AT,0,SULEV 30,LHD,1600CC GAMMA-II,235/40 R18,USA,4DR,0
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-205/55 R16-EUROPE-5DR-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,205/55 R16,EUROPE,5DR,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-205/55 R16-EUROPE-WGN-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,205/55 R16,EUROPE,WGN,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-235/40 R18-EUROPE-5DR-HIGH POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,235/40 R18,EUROPE,5DR,HIGH POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-235/40 R18-EUROPE-5DR-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,235/40 R18,EUROPE,5DR,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-235/40 R18-EUROPE-WGN-HIGH POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,235/40 R18,EUROPE,WGN,HIGH POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-235/40 R18-EUROPE-WGN-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,235/40 R18,EUROPE,WGN,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-225/45 R17-EUROPE-5DR-HIGH POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,225/45 R17,EUROPE,5DR,HIGH POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-225/45 R17-EUROPE-5DR-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,225/45 R17,EUROPE,5DR,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-225/45 R17-EUROPE-WGN-HIGH POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,225/45 R17,EUROPE,WGN,HIGH POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-LHD-1600CC GAMMA-II-225/45 R17-EUROPE-WGN-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,LHD,1600CC GAMMA-II,225/45 R17,EUROPE,WGN,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-RHD-1600CC GAMMA-II-205/55 R16-EUROPE-5DR-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,RHD,1600CC GAMMA-II,205/55 R16,EUROPE,5DR,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-RHD-1600CC GAMMA-II-235/40 R18-EUROPE-5DR-HIGH POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,RHD,1600CC GAMMA-II,235/40 R18,EUROPE,5DR,HIGH POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-RHD-1600CC GAMMA-II-235/40 R18-EUROPE-WGN-HIGH POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,RHD,1600CC GAMMA-II,235/40 R18,EUROPE,WGN,HIGH POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-RHD-1600CC GAMMA-II-235/40 R18-EUROPE-WGN-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,RHD,1600CC GAMMA-II,235/40 R18,EUROPE,WGN,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-RHD-1600CC GAMMA-II-225/45 R17-EUROPE-5DR-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,RHD,1600CC GAMMA-II,225/45 R17,EUROPE,5DR,LOW POWER
CL4-26 MODEL-7DCT-0-PRE-EURO 7-RHD-1600CC GAMMA-II-225/45 R17-EUROPE-WGN-LOW POWER,CL4,26 MODEL,7DCT,0,PRE-EURO 7,RHD,1600CC GAMMA-II,225/45 R17,EUROPE,WGN,LOW POWER
CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0,CL4,26 MODEL,7DCT,MILD HEV,PRE-EURO 7,LHD,1000cc KAPPA PE,205/55 R16,EUROPE,5DR,0
CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-205/55 R16-EUROPE-WGN-0,CL4,26 MODEL,7DCT,MILD HEV,PRE-EURO 7,LHD,1000cc KAPPA PE,205/55 R16,EUROPE,WGN,0
CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-225/45 R17-EUROPE-5DR-0,CL4,26 MODEL,7DCT,MILD HEV,PRE-EURO 7,LHD,1000cc KAPPA PE,225/45 R17,EUROPE,5DR,0
CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-LHD-1000cc KAPPA PE-225/45 R17-EUROPE-WGN-0,CL4,26 MODEL,7DCT,MILD HEV,PRE-EURO 7,LHD,1000cc KAPPA PE,225/45 R17,EUROPE,WGN,0
CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-RHD-1000cc KAPPA PE-205/55 R16-EUROPE-5DR-0,CL4,26 MODEL,7DCT,MILD HEV,PRE-EURO 7,RHD,1000cc KAPPA PE,205/55 R16,EUROPE,5DR,0
CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-RHD-1000cc KAPPA PE-205/55 R16-EUROPE-WGN-0,CL4,26 MODEL,7DCT,MILD HEV,PRE-EURO 7,RHD,1000cc KAPPA PE,205/55 R16,EUROPE,WGN,0
CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-RHD-1000cc KAPPA PE-225/45 R17-EUROPE-5DR-0,CL4,26 MODEL,7DCT,MILD HEV,PRE-EURO 7,RHD,1000cc KAPPA PE,225/45 R17,EUROPE,5DR,0
CL4-26 MODEL-7DCT-MILD HEV-PRE-EURO 7-RHD-1000cc KAPPA PE-225/45 R17-EUROPE-WGN-0,CL4,26 MODEL,7DCT,MILD HEV,PRE-EURO 7,RHD,1000cc KAPPA PE,225/45 R17,EUROPE,WGN,0
CL4-26 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-205/55 R16-MEXICO-4DR-ATKINSON,CL4,26 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,205/55 R16,MEXICO,4DR,ATKINSON
CL4-26 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-235/40 R18-MEXICO-5DR-ATKINSON,CL4,26 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,235/40 R18,MEXICO,5DR,ATKINSON
CL4-26 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-235/40 R18-MEXICO-4DR-ATKINSON,CL4,26 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,235/40 R18,MEXICO,4DR,ATKINSON
CL4-26 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-225/45 R17-MEXICO-4DR-ATKINSON,CL4,26 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,225/45 R17,MEXICO,4DR,ATKINSON
CL4-26 MODEL-CVT-0-EURO-5-RHD-2000cc NU-PE-205/55 R16-AUSTRALIA-5DR-ATKINSON,CL4,26 MODEL,CVT,0,EURO-5,RHD,2000cc NU-PE,205/55 R16,AUSTRALIA,5DR,ATKINSON
CL4-26 MODEL-CVT-0-EURO-5-RHD-2000cc NU-PE-205/55 R16-AUSTRALIA-4DR-ATKINSON,CL4,26 MODEL,CVT,0,EURO-5,RHD,2000cc NU-PE,205/55 R16,AUSTRALIA,4DR,ATKINSON
CL4-26 MODEL-CVT-0-EURO-5-RHD-2000cc NU-PE-225/45 R17-AUSTRALIA-5DR-ATKINSON,CL4,26 MODEL,CVT,0,EURO-5,RHD,2000cc NU-PE,225/45 R17,AUSTRALIA,5DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-205/55 R16-CANADA-5DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,205/55 R16,CANADA,5DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-205/55 R16-CANADA-4DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,205/55 R16,CANADA,4DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-205/55 R16-USA-4DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,205/55 R16,USA,4DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-235/40 R18-USA-5DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,235/40 R18,USA,5DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-235/40 R18-USA-4DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,235/40 R18,USA,4DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-225/45 R17-CANADA-5DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,225/45 R17,CANADA,5DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-225/45 R17-CANADA-4DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,225/45 R17,CANADA,4DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-225/45 R17-USA-5DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,225/45 R17,USA,5DR,ATKINSON
CL4-26 MODEL-CVT-0-SULEV 30-LHD-2000cc NU-PE-225/45 R17-USA-4DR-ATKINSON,CL4,26 MODEL,CVT,0,SULEV 30,LHD,2000cc NU-PE,225/45 R17,USA,4DR,ATKINSON
CL4-27 MODEL-6MT-0-EURO-5-LHD-2000cc NU-PE-205/55 R16-MEXICO-4DR-ATKINSON,CL4,27 MODEL,6MT,0,EURO-5,LHD,2000cc NU-PE,205/55 R16,MEXICO,4DR,ATKINSON
CL4-27 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-205/55 R16-GENERAL-4DR-0,CL4,27 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,205/55 R16,GENERAL,4DR,0
CL4-27 MODEL-6AT-0-EURO-2-LHD-1600cc GAMMA-225/45 R17-GENERAL-4DR-0,CL4,27 MODEL,6AT,0,EURO-2,LHD,1600cc GAMMA,225/45 R17,GENERAL,4DR,0
CL4-27 MODEL-6AT-0-EURO-2-RHD-1600cc GAMMA-225/45 R17-GENERAL-4DR-0,CL4,27 MODEL,6AT,0,EURO-2,RHD,1600cc GAMMA,225/45 R17,GENERAL,4DR,0
CL4-27 MODEL-8AT-0-EURO-4-LHD-1600CC GAMMA-II-235/40 R18-GENERAL-4DR-0,CL4,27 MODEL,8AT,0,EURO-4,LHD,1600CC GAMMA-II,235/40 R18,GENERAL,4DR,0
CL4-27 MODEL-8AT-0-EURO-5-LHD-1600CC GAMMA-II-235/40 R18-MEXICO-5DR-0,CL4,27 MODEL,8AT,0,EURO-5,LHD,1600CC GAMMA-II,235/40 R18,MEXICO,5DR,0
CL4-27 MODEL-8AT-0-EURO-5-LHD-1600CC GAMMA-II-235/40 R18-MEXICO-4DR-0,CL4,27 MODEL,8AT,0,EURO-5,LHD,1600CC GAMMA-II,235/40 R18,MEXICO,4DR,0
CL4-27 MODEL-8AT-0-BRAZIL L8-LHD-1600CC GAMMA-II-235/40 R18-BRAZIL-5DR-0,CL4,27 MODEL,8AT,0,BRAZIL L8,LHD,1600CC GAMMA-II,235/40 R18,BRAZIL,5DR,0
CL4-27 MODEL-8AT-0-BRAZIL L8-LHD-1600CC GAMMA-II-235/40 R18-BRAZIL-4DR-0,CL4,27 MODEL,8AT,0,BRAZIL L8,LHD,1600CC GAMMA-II,235/40 R18,BRAZIL,4DR,0
CL4-27 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-205/55 R16-MEXICO-4DR-ATKINSON,CL4,27 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,205/55 R16,MEXICO,4DR,ATKINSON
CL4-27 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-235/40 R18-MEXICO-5DR-ATKINSON,CL4,27 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,235/40 R18,MEXICO,5DR,ATKINSON
CL4-27 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-235/40 R18-MEXICO-4DR-ATKINSON,CL4,27 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,235/40 R18,MEXICO,4DR,ATKINSON
CL4-27 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-225/45 R17-MEXICO-5DR-ATKINSON,CL4,27 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,225/45 R17,MEXICO,5DR,ATKINSON
CL4-27 MODEL-CVT-0-EURO-5-LHD-2000cc NU-PE-225/45 R17-MEXICO-4DR-ATKINSON,CL4,27 MODEL,CVT,0,EURO-5,LHD,2000cc NU-PE,225/45 R17,MEXICO,4DR,ATKINSON
CL4-27 MODEL-CVT-0-BRAZIL L8-LHD-2000cc NU-PE-235/40 R18-BRAZIL-5DR-ATKINSON,CL4,27 MODEL,CVT,0,BRAZIL L8,LHD,2000cc NU-PE,235/40 R18,BRAZIL,5DR,ATKINSON
CL4-27 MODEL-CVT-0-BRAZIL L8-LHD-2000cc NU-PE-235/40 R18-BRAZIL-4DR-ATKINSON,CL4,27 MODEL,CVT,0,BRAZIL L8,LHD,2000cc NU-PE,235/40 R18,BRAZIL,4DR,ATKINSON
CL4-27 MODEL-CVT-0-BRAZIL L8-LHD-2000cc NU-PE-225/45 R17-BRAZIL-5DR-ATKINSON,CL4,27 MODEL,CVT,0,BRAZIL L8,LHD,2000cc NU-PE,225/45 R17,BRAZIL,5DR,ATKINSON
CL4-27 MODEL-CVT-0-BRAZIL L8-LHD-2000cc NU-PE-225/45 R17-BRAZIL-4DR-ATKINSON,CL4,27 MODEL,CVT,0,BRAZIL L8,LHD,2000cc NU-PE,225/45 R17,BRAZIL,4DR,ATKINSON
SV1m-27 MODEL-1DT-0-220V-LHD-160KW (FR) + 70KW (RR)-235/45 R19-GENERAL-WGN-LOW POWER,SV1m,27 MODEL,1DT,0,220V,LHD,160KW (FR) + 70KW (RR),235/45 R19,GENERAL,WGN,LOW POWER
SV1m-27 MODEL-1DT-0-220V-LHD-160KW-215/60 R17-GENERAL-WGN-0,SV1m,27 MODEL,1DT,0,220V,LHD,160KW,215/60 R17,GENERAL,WGN,0
SV1m-27 MODEL-1DT-0-120V-LHD-160KW (FR) + 70KW (RR)-235/45 R19-USA-WGN-HIGH POWER,SV1m,27 MODEL,1DT,0,120V,LHD,160KW (FR) + 70KW (RR),235/45 R19,USA,WGN,HIGH POWER
SV1m-27 MODEL-1DT-0-120V-LHD-160KW-215/50 R19-CANADA-WGN-0,SV1m,27 MODEL,1DT,0,120V,LHD,160KW,215/50 R19,CANADA,WGN,0`;

// Build version injected by build.sh — used by firebase-sync.js to detect available updates.
var APP_BUILD = '__BUILD_VERSION__';

// Human-facing app version label (semantic). Update on meaningful releases — debe coincidir
// con la entrada más reciente de APP_VERSION_HISTORY (abajo) y con CHANGELOG.md.
var APP_VERSION = '17.14';

// v16.6: historial de versiones para Datos → Sistema y el pill del topbar — resumen curado de
// CHANGELOG.md (más reciente primero). Actualizar aquí en cada ronda junto con APP_VERSION.
var APP_VERSION_HISTORY = [
    { version: '17.14', date: '24 ago 2026', title: 'Homologación Europa: coeficientes de dinamómetro y CO₂ desde el Alta', bullets: [
        'Para vehículos Europa, el Alta ahora pide los datos del ICMS (f0, f1, f2, TM y el CO₂ declarado) desde el primer paso, en vez de tener que buscarlos vehículo por vehículo ya empezada la prueba.',
        'Importa UNA vez el Excel del ICMS en Datos → ⋯ Más → 🇪🇺 Homologación y el Alta se autollena. Puedes subir las dos descargas por separado (coeficientes y CO₂): se fusionan por MC code.',
        'A partir del segundo vehículo de la misma configuración ya no hay que buscar nada: la plataforma recuerda el enlace y lo llena sola.',
        'El CoP ahora compara el CO₂: cada vehículo contra SU valor declarado, con una tolerancia que tú configuras, y muestra por VIN con qué coeficientes de dinamómetro se corrió.',
        'La ficha se guarda en el vehículo y queda en la auditoría, así que siempre se puede demostrar con qué targets se probó cada uno.'
    ]},
    { version: '17.13b', date: '24 ago 2026', title: 'El token de bugs ya se comparte de verdad con todos los dispositivos', bullets: [
        'Guardar el token de GitHub seguía diciendo "guardado solo en este dispositivo" en algunos equipos. Ahora se configura UNA sola vez, desde cualquier dispositivo, y llega al resto del laboratorio.',
        'La causa: la app tarda hasta 12 segundos en darse cuenta de que la sincronización de ese equipo necesita el modo alterno. Si guardabas antes de ese momento, el intento fallaba y ya no se reintentaba. Ahora, si el guardado falla, se reintenta solo por la vía alterna.'
    ]},
    { version: '17.13a', date: '24 ago 2026', title: 'Correcciones del botón 🐞 en dispositivos con "REST Sync"', bullets: [
        'La pestaña Datos → 🐞 Bugs ya no se borra entera cuando la sincronización viene a medias: si algo falla, solo esa sección avisa y el resto (cola pendiente y configuración) sigue en pantalla.',
        'Guardar el token de GitHub ya funciona en los dispositivos cuyo indicador dice "REST Sync" — antes se guardaba solo en ese dispositivo y no se compartía con los demás del laboratorio.',
        '"Probar conexión" ahora prueba el token que está escrito en pantalla, sin obligar a guardarlo primero.'
    ]},
    { version: '17.13', date: '22 ago 2026', title: 'Botón 🐞 para reportar fallas con captura de pantalla', bullets: [
        'Un botón 🐞 flotante, visible en cualquier pantalla de la plataforma: al tocarlo toma solo una captura de lo que estás viendo y abre una ventana para que cuentes qué pasó.',
        'Puedes Descartar (no se guarda absolutamente nada) o Enviar. Al enviar, el reporte se publica como issue en el repositorio de GitHub del proyecto, con la captura y los datos técnicos (versión, pantalla, tamaño, errores internos recientes) ya adjuntos — el técnico no tiene que explicar nada de eso.',
        'Sin internet o sin token configurado el reporte no se pierde: queda en cola (el 🐞 muestra cuántos esperan) y se envía solo al recuperar la conexión.',
        'Datos → ⋯ Más → 🐞 Bugs: bandeja con todos los reportes enviados, su issue y su estado. "Actualizar estados" pregunta a GitHub cuáles ya cerraste y los marca como resueltos aquí.',
        'La conexión con GitHub (token + repositorio) se configura UNA vez desde cualquier dispositivo y se comparte con todos los demás del laboratorio.'
    ]},
    { version: '17.12', date: '21 ago 2026', title: 'Bug grave: dos vehículos podían compartir el mismo identificador', bullets: [
        'Elegir un vehículo en Operación cargaba OTRO (el selector mostraba uno y la ficha seguía con el anterior). Causa: el id se generaba con un contador local (++db.lastId) y la sincronización fusiona vehículos por VIN conservando el id del equipo que los creó, sin adelantar ese contador — dos dispositivos emitían el mismo id sin enterarse.',
        'El mismo id repetido tenía dos consecuencias peores y silenciosas: el borrador de captura se guardaba en una clave por id, así que dos vehículos compartían borrador; y "Eliminar vehículo" filtraba por id, así que borraba LOS DOS de un golpe.',
        'Los ids nuevos ya no pueden repetirse entre dispositivos, y al arrancar (y tras cada sincronización) la plataforma detecta y repara los duplicados que ya existan, dejando constancia en Datos → Auditoría. El temporizador de soak y el "último vehículo activo" se reapuntan solos porque guardan el VIN.',
        'Además, si el vehículo seleccionado ya no existe, Operación y Liberación limpian la pantalla y avisan en vez de dejar cargado el anterior; y "Guardar avance" ya no se queda girando fingiendo que guardó.'
    ]},
    { version: '17.11', date: '21 ago 2026', title: '"Ad-hoc" pasa a llamarse "Fuera de Plan" + filtros de Historial', bullets: [
        'El término "ad-hoc" desaparece de la interfaz: la casilla del Alta, el distintivo del Historial y el de la Cola ahora dicen "Fuera de Plan", que es lo que la marca significa (trabajo que no acredita el plan semanal).',
        'Historial: filtro nuevo por Propósito (COP-Emisiones, ND-Emisiones, Correlación…), con las opciones tomadas de los registros que existen de verdad.',
        'Historial: el filtro de Estado no ofrecía "Pendiente Aprobación" — un vehículo esperando aprobación no se podía filtrar. Agregado, junto con una opción "Fuera de Plan" para listar de un toque las pruebas marcadas así.',
        'Ayuda contextual nueva en la casilla "Prueba fuera de plan" del Alta, y aviso corregido: decía que la aprobación se enviaría por Power Automate, un flujo eliminado en v15.6.'
    ]},
    { version: '17.10', date: '21 ago 2026', title: 'Liberación: elegir contra qué regulación se comparan los gases', bullets: [
        'Un vehículo cuya "regulación" no es una norma con límites (típico del alta manual, donde el campo era texto libre y terminaba con la transmisión "6DCT", "N/A" o el voltaje de un EV) dejaba la Liberación bloqueada: el único camino era irse a Datos → Regulaciones y volver. Ahora el liberador elige ahí mismo contra qué regulación comparar, y el botón de enviar a aprobación se desbloquea.',
        'La elección se guarda en el vehículo, aparece en su línea de tiempo, en la auditoría, en la pantalla del aprobador (que está verificando contra esa norma, no contra la del alta) y en el PDF COP15-F05, que antes releía el dato del alta y podía citar una norma distinta a la usada para validar.',
        'Cuando sí hay perfil, la tabla de gases ahora dice contra qué regulación está comparando, con un botón "Cambiar" — corregir un alta equivocada ya no obliga a repetir la prueba.',
        'Alta manual: "Regulación" pasó de texto libre a un selector de las regulaciones configuradas (con "Otra (escribir)" y "Definir al liberar"), y se agregó un campo opcional de Transmisión — el hueco que hacía que la transmisión acabara capturada como si fuera la norma de emisiones.'
    ]},
    { version: '17.9', date: '21 ago 2026', title: 'Topbar en una sola fila + menú "⋯" legible + configs manuales que sobreviven', bullets: [
        'La barra superior ya no envuelve a una segunda fila casi vacía en tablet/teléfono: sin las 5 pestañas (ocultas desde v16.8) no queda nada que envolver. El indicador de sincronización recorta su texto con elipsis en vez de forzar el salto de línea.',
        'El menú "⋯" pasó de cajas altas medio vacías (botones y wrappers mezclados, estirados) a filas de menú uniformes con icono + etiqueta, y el estado de conexión junto al pill de versión en un pie propio. En escritorio la barra ancha se ve igual que antes.',
        'Bug corregido: las configuraciones creadas a mano (Gestor de Configuraciones) desaparecían de la cascada al recargar la página — la fusión solo ocurría al guardarlas, no al arrancar. Seguían listadas en el gestor, pero ningún desplegable de Alta las mostraba.',
        'Cuando la cascada no encuentra ninguna configuración, la tarjeta ahora explica el caso y ofrece el botón "➕ Nueva configuración manual" en vez de terminar en un callejón sin salida.'
    ]},
    { version: '17.8', date: '15 ago 2026', title: 'Mapa de zonas por teclado + limpieza final de tipografía', bullets: [
        'El mapa de zonas de Consumibles (mover un cilindro entre posiciones) era solo por mouse/dedo — ahora también se opera por teclado: Enter sobre un cilindro lo selecciona, Enter sobre una posición vacía lo mueve ahí, Escape cancela. Cada paso se anuncia a lectores de pantalla.',
        'Tipografía sub-12px eliminada en js/auth.js y js/firebase-sync.js (login/PIN, ajustes de sincronización) — con esto ya no queda ningún archivo del proyecto con texto por debajo del mínimo.',
        'Bug de contraste encontrado al revisar auth.js: los 7 colores de avatar de operador fallaban como texto (la pantalla de "elige tu usuario", lo primero que ve cualquier técnico) — misma corrección que la paleta P1-P10 de Plan (v17.4).',
        'Un colorcito de "por vencer" en el mapa de zonas y tres tamaños de fuente en decimales (8.5px/10.5px/11.5px) que los barridos anteriores no habían detectado, también corregidos.'
    ]},
    { version: '17.7', date: '15 ago 2026', title: 'Accesibilidad — módulo CoP (Fase 8, última) + cierre del overhaul', bullets: [
        'Octavo y último módulo migrado: CoP (validador Type 1 de Conformidad de Producción + Control SPC). Con esto quedan migrados los 7 módulos de la plataforma más la fundación — overhaul de accesibilidad v17.0-v17.7 completo.',
        'Tabla de VINes × gases con encabezados <th scope="col"> y aria-label por celda ("Formaldehído — VIN 3N1...") — antes cada casilla numérica era indistinguible por lectores de pantalla.',
        'Tres selects de familia/región sin etiqueta reciben aria-label.',
        'Nota de alcance: js/auth.js y js/firebase-sync.js (pantalla de login/PIN y ajustes de sincronización) no formaban parte de los 7 módulos planeados — quedan con tipografía sub-12px pendiente para una ronda futura.'
    ]},
    { version: '17.6', date: '15 ago 2026', title: 'Accesibilidad — módulo Proyectos (Fase 7)', bullets: [
        'Séptimo módulo migrado: Proyectos (tarjetas/portafolio, Tabla, Kanban, Línea de tiempo, Gantt, Curva S, Carga por responsable, importador de Excel).',
        'Mejora al helper compartido a11yDialog: ahora se autodesactiva si su modal fue removido del documento sin pasar por su propio cierre — necesario porque el importador reconstruye su ventana completa en cada paso (elegir archivo → mapear columnas → confirmar). Beneficia a los ~30 modales de toda la app que ya lo usan, no solo a este.',
        'Los indicadores de avance/vencidos/bloqueados del detalle de proyecto migrados a los tokens de contraste verificado.'
    ]},
    { version: '17.5', date: '15 ago 2026', title: 'Accesibilidad — módulo Datos/Panel (Fase 6)', bullets: [
        'Sexto módulo migrado: Datos (Dashboard, Reportes, Ejecutivo, Turnaround, Usuarios, Bitácora, Alertas, Inteligencia, Sistema, Calendario, Proyectos, Regulaciones, Archivos) — el que mezcla renderizado clásico con las 6 pestañas Alpine.',
        'Encontrado y corregido el único hueco real de teclado en las pestañas Alpine: las celdas del calendario (`<div @click>`) no tenían equivalente de teclado. El resto de la interfaz Alpine ya usaba botones reales — se revisó cada @click del módulo uno por uno para confirmarlo.',
        '30+ colores de estado migrados a los tokens verificados (severidad de alertas, matriz de habilidades, indicadores de auditoría).',
        'Las 13 pestañas de Datos navegan con flechas/Home/End.'
    ]},
    { version: '17.4', date: '15 ago 2026', title: 'Accesibilidad — módulo Plan (Fase 5)', bullets: [
        'Quinto módulo migrado: Plan (Dashboard, Plan Semanal, Recuperación, Producción, Probados, Familias, Reglas, Historial Semanal, Calendario, Simulador).',
        'Bug sistémico encontrado: la paleta de 10 colores de prioridad (P1..P10) de la barra de Recuperación fallaba contraste en 9 de 10 — texto blanco casi ilegible sobre la mayoría de las barras. Recalculada completa: mismos matices, oscurecidos hasta pasar el mínimo, sin perder la distinción visual entre prioridades.',
        'Las tarjetas de configuración (chips de Modelo/Motor/Transmisión/Año/Región…) que aparecen en cada tabla del módulo tenían el texto a 7-8px por defecto — subidas a 12px.',
        'Este módulo ya usaba el modal compartido y accesible de la plataforma (showModal) para todos sus diálogos — no tenía overlays propios que arreglar.'
    ]},
    { version: '17.3', date: '15 ago 2026', title: 'Accesibilidad — módulo Consumibles (Fase 4)', bullets: [
        'Cuarto módulo migrado: Consumibles (Gases, Equipos, Mtto, Captura, Predicción, Combustible, Mapa de zonas, Gráficas, Config, Reporte, Trazabilidad) — el más grande hasta ahora, 12 pestañas.',
        'El modal compartido de la mayoría de las altas/ediciones (Cilindro, Instrumento, Actividad, Zona…) se abría/cerraba desde ~20 funciones distintas sin ningún punto común — se resolvió observando el propio modal en vez de tocar cada cierre uno por uno: ahora todos atrapan el foco, cierran con Escape y devuelven el foco al botón que los abrió.',
        'Encontrado y corregido un bug real de contraste: la ficha de detalle de un cilindro (fecha de recepción, vigencia, trazabilidad, historial) tenía texto gris casi invisible sobre fondo blanco.',
        'Nota de alcance: el mapa de zonas (arrastrar cilindro a una posición) sigue siendo solo por mouse/dedo — mover un cilindro por teclado queda pendiente para una ronda futura, ya que es una interacción nueva, no un ajuste de presentación.'
    ]},
    { version: '17.2', date: '14 ago 2026', title: 'Accesibilidad — módulo Pruebas/COP15 (Fase 3)', bullets: [
        'Tercer módulo migrado: Pruebas (Alta, Operación, Liberación, Cola, Historial, Consumibles) — los formularios más largos de la app.',
        'La firma digital (gate de liberación de vehículos) no tenía NINGUNA accesibilidad — sin atrapar el foco, sin Escape, sin devolver el foco al cerrar. Corregido: es la pieza más crítica del flujo de liberación.',
        'Las 6 pestañas de Pruebas (Alta/Operación/Liberación/Cola/Historial/Consumibles) ya se navegan con flechas de teclado.',
        'Más de 60 colores de estado migrados a los tokens con contraste verificado — verdes/ámbares/rojos de PASA/FALLA, tarjetas kanban, checklist de preacondicionamiento, timer de soak.',
        'Las tarjetas del kanban de vehículos (antes solo clicables con mouse) ya son alcanzables con Tab.'
    ]},
    { version: '17.1', date: '14 ago 2026', title: 'Accesibilidad — módulo HOY (Fase 2)', bullets: [
        'Segunda fase del overhaul de interfaz: primer módulo migrado por completo (HOY, la pantalla más vista). Se encontraron y corrigieron tres bugs de contraste reales (no solo teóricos) — texto casi invisible en el resumen "Lab Status", en el panel de Backup y en los encabezados de esas mismas tarjetas, restos de un tema oscuro que se eliminó hace varias rondas pero cuyos colores nunca se migraron.',
        'Los `<div onclick>` de tarjetas y filas de alerta ahora son alcanzables con Tab (nuevo helper compartido a11yClickables, reutilizable por los módulos siguientes) — antes solo funcionaban con mouse o dedo.',
        'El modal de "Nueva actividad" de HOY ahora atrapa el foco y regresa al botón que lo abrió al cerrar; el buscador global y el centro de notificaciones cierran con Escape.',
        'Once campos sin etiqueta (sliders de configuración de gráficos, buscador de glosario, notas rápidas, fecha de liberación estimada) ahora tienen aria-label.'
    ]},
    { version: '17.0', date: '14 ago 2026', title: 'Fundación de accesibilidad (Fase 1)', bullets: [
        'Primera fase de un overhaul de interfaz hacia un sistema propio inspirado en GOV.UK: contraste AA real en todos los colores de estado, tipografía mínima de 12px, un solo foco de teclado visible en toda la app (antes había tres reglas compitiendo entre sí, y varias pantallas lo suprimían del todo).',
        'Las 5 pestañas raíz y la barra inferior ahora son botones navegables por teclado (antes eran divs con onclick, invisibles para quien no usa mouse); un solo landmark principal en vez de seis "main" duplicados; enlace para saltar al contenido.',
        'Se quitó el efecto glass/neumorfismo de la barra superior y las pestañas — bordes planos, sombras sutiles.',
        'Nuevos tokens de color con texto y relleno separados (antes el mismo verde/ámbar/rojo se usaba como texto Y como fondo, y en ambos casos fallaba el contraste mínimo); nuevos helpers compartidos (a11yTablist, a11yDialog, a11yAnnounce, tokenColor) para que los 7 módulos no reinventen cada patrón.',
        'Fase 1 = fundación (styles.css, index.html, helpers). La migración módulo por módulo (HOY, Pruebas, Consumibles, Plan, Datos, Proyectos, CoP) sigue en rondas siguientes.'
    ]},
    { version: '16.8', date: '6 ago 2026', title: 'Proyectos como Project Manager completo', bullets: [
        'Importar desde Excel: sube tu .xlsx/.csv o pega la tabla y los pasos se cargan solos. NO hace falta un formato especial — se detectan las columnas y puedes corregirlas antes de guardar. Reimportar el mismo archivo actualiza, no duplica.',
        'Cuatro vistas nuevas: 📌 Kanban (arrastra entre estatus), 👥 Carga por responsable (quién es el cuello de botella), 📈 Curva S (avance comprometido vs real) y 🗂️ Portafolio (todos los proyectos con semáforo, para reportar a jefatura).',
        'Hitos (◆), línea base y dependencias con ruta crítica en el Gantt: el retraso queda documentado en vez de desaparecer cuando alguien recorre una fecha.',
        'Desde HOY puedes dar de alta un pendiente directo en un proyecto, y mover una tarea suelta a uno con un toque.',
        'Arreglado: el filtro "Solo míos" de HOY no filtraba los pasos de proyecto ni los mantenimientos — mostraba los de todos.'
    ]},
    { version: '16.7', date: '6 ago 2026', title: 'Versión siempre visible + historial completo', bullets: [
        'APP_VERSION estaba pegado en "14.0" desde hace varias rondas — el pill del topbar nunca reflejó en qué versión real estaba parado el laboratorio. Corregido y con una regla para no volver a congelarse.',
        'El pill de versión (menú ⋯ del topbar) ahora es un chip visible y SIEMPRE clickeable — antes era texto casi invisible (10px, apenas gris) y solo reaccionaba si había una actualización pendiente.',
        'Nuevo "🗂️ Historial de Versiones" en Datos → Sistema: todo lo que se ha agregado, ronda por ronda, con la actual siempre marcada.'
    ]},
    { version: '16.6', date: '6 ago 2026', title: 'Seguimiento de Proyectos', bullets: [
        'Nuevo módulo Proyectos (Datos → ⋯ Más → 🗂️ Proyectos): bitácora con tabla, línea de tiempo y Gantt para reparaciones o proyectos de inversión — no solo mantenimiento.',
        'Arreglada la vista de Plan → Familias (se veía con franjas negras y letra diminuta).',
        'Las alertas y el calendario de Datos ahora se actualizan solos, sin tener que recargar la página.'
    ]},
    { version: '16.5', date: '5 ago 2026', title: 'Mapa como retícula + menos campos', bullets: [
        'El mapa del cuarto de gases ya no es un plano roto — ahora es una retícula que se ajusta sola al tamaño de cada zona.',
        'Formularios más cortos (Cilindro, Instrumento, Mantenimiento, Zona) con autollenado.',
        'Sin espacio muerto en pantallas anchas (HOY, listas de cilindros).'
    ]},
    { version: '16.4', date: '5 ago 2026', title: 'Plan Maestro de Mantenimiento (COP15-F11)', bullets: [
        'Integración completa del formato oficial COP15-F11: calibración y mantenimiento preventivo de los 49 instrumentos.',
        'Pestaña 🛠️ Mtto nueva en Consumibles: vencidos y de esta semana con un toque.',
        'Exportación/importación de los 4 CSV oficiales + PDF del Plan Maestro.'
    ]},
    { version: '16.3', date: '16 jul 2026', title: 'Almacén de Archivos', bullets: [
        'Datos → ☁️ Archivos: sube y baja un documento (.zip, .pdf, .xlsx…) compartido entre todos los dispositivos, 5MB.'
    ]},
    { version: '16.2', date: '15 jul 2026', title: 'Conteos correctos', bullets: [
        'Corregido un bug que hacía fallar en silencio el cálculo de REQ (volumen requerido) entre configuraciones parecidas.',
        'HOY ya no se queda pegado en "0% cobertura" permanentemente.',
        'Una sola definición de cobertura en toda la plataforma.'
    ]},
    { version: '16.1', date: '15 jul 2026', title: 'Fix cascada EV', bullets: [
        'Los vehículos eléctricos (SV1m) ya se pueden dar de alta — la cascada ocultaba su regulación (voltaje de carga).'
    ]},
    { version: '16.0', date: '10 jul 2026', title: 'Plataforma autoguiada', bullets: [
        'Tooltips de ayuda (?) en los 7 módulos, banners por pestaña y recorridos guiados.',
        'Glosario del laboratorio con buscador.'
    ]},
    { version: '15.9', date: '9 jul 2026', title: 'HOY como tablero de actividades', bullets: [
        'HOY se rediseñó como un tablero único (estilo Monday) con vehículos, plan, inventario y calidad.',
        'El consumo de gas y gasolina ahora se APRENDE de la operación real, ya no es un descuento fijo.'
    ]},
    { version: '15.8', date: '5 jul 2026', title: 'Edición retroactiva', bullets: [
        'Historial → "📝 Completar": edita datos faltantes de vehículos archivados antes del cambio, con firma y auditoría.',
        'Presupuesto Anual y vista de todo el año en el Plan.'
    ]},
    { version: '15.7', date: '3 jul 2026', title: 'Control SPC', bullets: [
        'Nueva sub-pestaña CoP → 📈 Control SPC: cartas I-MR, Cpk y alarmas estadísticas por familia y gas.',
        '% del límite y aviso de valores improbables en Liberación.'
    ]},
    { version: '15.6', date: '2 jul 2026', title: 'Sync confiable + Seguridad real', bullets: [
        'Arreglado el bug que dejaba dispositivos con datos viejos sin actualizar (service worker congelado).',
        'Firebase Auth + PIN por operador, con bloqueo tras 5 intentos fallidos.',
        'Eliminados los módulos muertos (Results Analyzer, Power Automate).'
    ]},
    { version: '15.5', date: '2 jul 2026', title: 'Pulir y Endurecer', bullets: [
        '16 arreglos de fondo: seguridad (XSS), fechas en hora local, sincronización sin pérdida de datos.',
        'Tema oscuro eliminado (un solo tema claro), topbar móvil optimizado.'
    ]},
    { version: 'Ronda 5', date: '11 mar 2026', title: 'Experiencia de app nativa', bullets: [
        'Modo pantalla completa, autoguardado silencioso, formularios inteligentes, calendario unificado, plantillas rápidas.'
    ]},
    { version: 'Ronda 4', date: '11 mar 2026', title: 'Gráficas e inteligencia cruzada', bullets: [
        'Motor de configuración de gráficas, deshacer (Ctrl+Z), reportes PDF con gráficas, búsqueda cruzada, panel de Inteligencia.'
    ]},
    { version: 'Ronda 3', date: '2026', title: 'PWA y accesibilidad', bullets: [
        'App instalable, accesibilidad, seguridad, impresión optimizada, recorrido de bienvenida.'
    ]},
    { version: 'Ronda 2', date: '2026', title: 'Estadística y predicción', bullets: [
        'Cartas de control estadístico (SPC), predicción semanal, árbol visual COP15, códigos de barras/QR.'
    ]},
    { version: 'Ronda 1', date: '2026', title: 'Primeras mejoras de uso diario', bullets: [
        'Portapapeles, tablero kanban, temporizador de soak, paleta de comandos (Ctrl+K).'
    ]},
    { version: 'Fundación', date: '2026', title: 'Base de la plataforma', bullets: [
        'Registro de vehículos COP15, plan de pruebas, inventario de laboratorio, sincronización con Firebase.'
    ]}
];

// Format a build timestamp YYYYMMDDHHmm into a technical label (YYYY-MM-DD HH:mm).
function formatBuildLabel(buildTs) {
    if (!buildTs || buildTs === '__BUILD_VERSION__' || String(buildTs).length < 12) return 'dev';
    var s = String(buildTs);
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + ' ' + s.slice(8, 10) + ':' + s.slice(10, 12);
}

// Format a build timestamp into a readable Spanish publication date, e.g. "3 jun 2026, 18:23".
function formatBuildDateES(buildTs) {
    if (!buildTs || buildTs === '__BUILD_VERSION__' || String(buildTs).length < 12) return null;
    var s = String(buildTs);
    var d = new Date(
        +s.slice(0, 4), (+s.slice(4, 6)) - 1, +s.slice(6, 8),
        +s.slice(8, 10), +s.slice(10, 12)
    );
    if (isNaN(d.getTime())) return null;
    try {
        return d.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return formatBuildLabel(buildTs);
    }
}

// Reusable version info for the topbar, Panel and exports.
function getAppVersionInfo() {
    var built = (APP_BUILD && APP_BUILD !== '__BUILD_VERSION__' && String(APP_BUILD).length >= 12);
    return {
        version: APP_VERSION,
        build: built ? String(APP_BUILD) : null,
        buildLabel: formatBuildLabel(APP_BUILD),
        publishedES: built ? formatBuildDateES(APP_BUILD) : null,
        isDev: !built
    };
}

// Update the topbar version pill. status: 'uptodate' | 'outdated' | undefined.
// remoteBuild + downloadUrl are passed in when status === 'outdated' so the user
// can click straight to the new build.
// v16.6: el pill SIEMPRE es clickeable — sin actualización pendiente, lleva al historial de
// versiones completo (Datos → Sistema); con actualización pendiente, prioriza abrir la nueva
// build. Antes el pill era casi invisible (10px, opacidad 0.4) y solo clickeaba si había
// actualización — el usuario nunca sabía en qué versión estaba parado.
function updateVersionDisplay(status, remoteBuild, downloadUrl) {
    var el = document.getElementById('app-version-info');
    if (!el) return;
    var info = getAppVersionInfo();
    var dateLabel = info.publishedES ? ('Publicada ' + info.publishedES) : 'dev';
    var statusBadge = '';
    var title = info.publishedES ? ('Versión ' + info.version + ' · Publicada ' + info.publishedES + ' · toca para ver el historial completo') : 'Versión de desarrollo (sin build) · toca para ver el historial completo';
    var onclickJs = "switchPlatform('panel');if(typeof pnSwitchTab==='function')pnSwitchTab('pn-system');";
    el.classList.remove('app-version-pill--outdated', 'app-version-pill--uptodate');
    if (status === 'outdated' && remoteBuild) {
        statusBadge = ' <span class="app-version-pill-badge">Actualizar</span>';
        el.classList.add('app-version-pill--outdated');
        title = 'Versión ' + info.version + ' (' + dateLabel + ') · Disponible: ' + (formatBuildDateES(remoteBuild) || formatBuildLabel(remoteBuild)) + ' · toca para actualizar';
        if (downloadUrl) {
            onclickJs = "window.open('" + downloadUrl.replace(/'/g, "\\'") + "','_blank')";
        }
    } else if (status === 'uptodate') {
        statusBadge = ' <span class="app-version-pill-dot">●</span>';
        el.classList.add('app-version-pill--uptodate');
    }
    el.title = title;
    el.innerHTML = '<strong>KIA EmLab v' + info.version + '</strong> · 📅 ' + dateLabel + statusBadge;
    el.setAttribute('onclick', onclickJs);
}

let allConfigurations = [];
let currentFilters = {};

    const CONFIG = {
        operators: [
            'Iván Cárdenas',
            'Osvaldo Medina',
            'Nayeli Treviño',
            'Jorge Nuñez',
            
        ],
        statusLabels: {
            'registered': 'Registrado',
            'in-progress': 'En Progreso',
            'testing': 'En Prueba',
            'ready-release': 'Listo para Liberar',
            'pending-approval': 'Pendiente Aprobación',
            'archived': 'Archivado'
        }
    };

    const fieldMapping = {
        'Modelo': 'cfg_model',
        'MODEL YEAR (VIN)': 'cfg_year',
        'ENGINE CAPACITY': 'cfg_engine',
        'TRANSMISSION': 'cfg_transmission',
        'ENVIRONMENT PACKAGE': 'cfg_envpkg',
        'EMISSION REGULATION': 'cfg_regulation',
        'REGION': 'cfg_region',
        'TIRE ASSY': 'cfg_tires',
        'BODY TYPE': 'cfg_body',
        'DRIVE TYPE': 'cfg_drive',
        'ENGINE PACKAGE': 'cfg_enginepkg'
    };

const UNIT_CONVERSION = {
  lb_to_kg: 0.45359237,
  kg_to_lb: 2.2046226218,

  lbf_to_N: 4.4482216153,
  N_to_lbf: 0.2248089431,

  mph_to_kmh: 1.609344,
  kmh_to_mph: 0.6213711922
};

// ======================================================================
// [R3] CORE UTILITIES — Security, Data Integrity, Performance
// ======================================================================

// ── [R3-M5] escapeHtml — XSS prevention ──
function escapeHtml(text) {
    var map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
    return String(text == null ? '' : text).replace(/[&<>"']/g, function(m) { return map[m]; });
}

// ── [v15.5] preserveFocus: re-render sin perder el foco ni el caret ──
// Para listas con filtro en vivo cuyo innerHTML se reconstruye en cada tecla
// (el input necesita un id para poder re-encontrarlo tras el render).
function preserveFocus(renderFn) {
    var ae = document.activeElement;
    var id = ae ? ae.id : '';
    var selStart = null, selEnd = null;
    if (id && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
        try { selStart = ae.selectionStart; selEnd = ae.selectionEnd; } catch(e) {}
    }
    renderFn();
    if (id) {
        var el = document.getElementById(id);
        if (el && el !== document.activeElement) {
            try {
                el.focus();
                if (selStart !== null && el.setSelectionRange) el.setSelectionRange(selStart, selEnd);
            } catch(e) {}
        }
    }
}

// ── Iniciales de avatar a partir de un nombre (tolera espacios múltiples) ──
function authInitials(name) {
    return String(name == null ? '' : name).trim().split(/\s+/)
        .map(function(w) { return w[0] || ''; }).join('').substring(0, 2).toUpperCase();
}

// ── [R3-M6] safeParse — Corruption-safe localStorage parsing ──
function safeParse(key, fallback) {
    try {
        var raw = localStorage.getItem(key);
        if (!raw) return fallback;
        var parsed = JSON.parse(raw);
        return (typeof parsed === 'object' && parsed !== null) ? parsed : fallback;
    } catch(e) {
        console.error('Corrupted localStorage key: ' + key, e);
        try { showToast('Datos corruptos en ' + key + '. Usando valores por defecto.', 'error'); } catch(e2) {}
        return fallback;
    }
}

// ── [R3-M3] debounce — Performance utility ──
function debounce(fn, ms) {
    var timer; return function() {
        var ctx = this, args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function() { fn.apply(ctx, args); }, ms);
    };
}

let db = safeParse('kia_db_v11', {
  version: '11.0',
  vehicles: [],
  lastId: 0
});

// ======================================================================
// [M00c] REGULATION PROFILES — Emission gas limits per regulation
// ======================================================================
var REGS_LS_KEY = 'kia_regulations_v1';
var _regulationsData = null;

var DEFAULT_REGULATION_PROFILES = [
    {
        id: 'reg_euro5', name: 'EURO-5', shortName: 'EURO-5',
        gases: [
            { field: 'CO',   label: 'CO',   unit: 'g/km', limit: 1.0 },
            { field: 'CO2',  label: 'CO₂',  unit: 'g/km', limit: null },
            { field: 'THC',  label: 'THC',  unit: 'g/km', limit: 0.1 },
            { field: 'NOx',  label: 'NOx',  unit: 'g/km', limit: 0.06 },
            { field: 'NMHC', label: 'NMHC', unit: 'g/km', limit: 0.068 }
        ]
    },
    {
        id: 'reg_euro6c', name: 'EURO-6C', shortName: 'EURO-6C',
        gases: [
            { field: 'CO',   label: 'CO',   unit: 'g/km', limit: 1.0 },
            { field: 'CO2',  label: 'CO₂',  unit: 'g/km', limit: null },
            { field: 'THC',  label: 'THC',  unit: 'g/km', limit: 0.1 },
            { field: 'NOx',  label: 'NOx',  unit: 'g/km', limit: 0.06 },
            { field: 'NMHC', label: 'NMHC', unit: 'g/km', limit: 0.068 }
        ]
    },
    {
        id: 'reg_euro2', name: 'EURO-2', shortName: 'EURO-2',
        gases: [
            { field: 'CO',  label: 'CO',  unit: 'g/km', limit: 2.2 },
            { field: 'CO2', label: 'CO₂', unit: 'g/km', limit: null },
            { field: 'THC', label: 'THC+NOx', unit: 'g/km', limit: 0.5 }
        ]
    },
    {
        id: 'reg_euro4', name: 'EURO-4', shortName: 'EURO-4',
        gases: [
            { field: 'CO',   label: 'CO',   unit: 'g/km', limit: 1.0 },
            { field: 'CO2',  label: 'CO₂',  unit: 'g/km', limit: null },
            { field: 'THC',  label: 'THC',  unit: 'g/km', limit: 0.1 },
            { field: 'NOx',  label: 'NOx',  unit: 'g/km', limit: 0.08 },
            { field: 'NMHC', label: 'NMHC', unit: 'g/km', limit: 0.068 }
        ]
    },
    {
        id: 'reg_sulev30', name: 'SULEV 30', shortName: 'SULEV 30',
        gases: [
            { field: 'CO',   label: 'CO',   unit: 'g/mi', limit: 1.0 },
            { field: 'CO2',  label: 'CO₂',  unit: 'g/mi', limit: null },
            { field: 'NMHC', label: 'NMHC', unit: 'g/mi', limit: 0.01 },
            { field: 'NOx',  label: 'NOx',  unit: 'g/mi', limit: 0.02 }
        ]
    },
    {
        id: 'reg_preeuro7', name: 'PRE-EURO 7', shortName: 'PRE-EURO 7',
        gases: [
            { field: 'CO',   label: 'CO',   unit: 'g/km', limit: 1.0 },
            { field: 'CO2',  label: 'CO₂',  unit: 'g/km', limit: null },
            { field: 'THC',  label: 'THC',  unit: 'g/km', limit: 0.1 },
            { field: 'NOx',  label: 'NOx',  unit: 'g/km', limit: 0.06 },
            { field: 'NMHC', label: 'NMHC', unit: 'g/km', limit: 0.068 }
        ]
    }
];

function loadRegulations() {
    if (_regulationsData) return _regulationsData;
    var saved = safeParse(REGS_LS_KEY, null);
    if (!saved || !saved.profiles || saved.profiles.length === 0) {
        _regulationsData = { profiles: JSON.parse(JSON.stringify(DEFAULT_REGULATION_PROFILES)) };
        saveRegulations();
    } else {
        _regulationsData = saved;
    }
    return _regulationsData;
}

function saveRegulations() {
    if (!_regulationsData) return;
    try { localStorage.setItem(REGS_LS_KEY, JSON.stringify(_regulationsData)); } catch(e) {}
}

function getRegulationProfile(regulationName) {
    if (!regulationName) return null;
    var data = loadRegulations();
    var norm = regulationName.trim().toUpperCase();
    return data.profiles.find(function(p) {
        return p.name.toUpperCase() === norm || p.shortName.toUpperCase() === norm;
    }) || null;
}

function getAllRegulationProfiles() {
    return loadRegulations().profiles;
}

let activeVehicleId = null;
let currentFilter = 'all';
window._histFilterStatus = 'all';
window._histFilterVin = '';
window._histFilterPurpose = '';
window._histFilterYear = '';
window._histFilterMonth = '';
window._histPageSize = 25;
let currentUnitSystem = 'SI';




// ======================================================================
// [M00b] THEME — solo tema claro unificado (v15.5)
// El dark mode se eliminó: se auto-activaba por preferencia del sistema y se
// parchaba con selectores frágiles sobre ~540 estilos inline. Decisión de
// producto: un solo tema claro estable en todos los dispositivos del lab.
// ======================================================================

function themeInit() {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.removeItem('kia_theme_pref'); } catch(e) {}
}

// ======================================================================
// [v15.5] UX unificada para los modales-contenedor legacy
// (substitutionModal, configModal, invModal, fbModal): ESC y click en el
// fondo cierran, y hay animación de entrada. Los sitios de apertura/cierre
// existentes (style.display) siguen funcionando sin cambios — aquí solo se
// observa el atributo style de cada contenedor.
// ======================================================================
var _MODAL_UX_IDS = ['substitutionModal', 'configModal', 'invModal', 'fbModal'];

function _modalUxClose(el) {
    // El escáner de códigos vive dentro de invModal: apagar la cámara al cerrar
    if (el.id === 'invModal' && typeof invScanStop === 'function') { try { invScanStop(); } catch(e) {} }
    el.style.display = 'none';
    if (el._modalTrigger && document.contains(el._modalTrigger)) {
        try { el._modalTrigger.focus(); } catch(e) {}
    }
    el._modalTrigger = null;
}

// ── [v15.6] Recarga tras actualización del service worker ──
// Recarga inmediata solo en la ventana segura (recién cargada la app y sin
// modal abierto); en cualquier otro caso, aviso persistente con botón.
var _appLoadedAt = Date.now();

function _swSafeToReload() {
    if (Date.now() - _appLoadedAt > 15000) return false;
    var openModal = document.querySelector(
        '#substitutionModal[style*="flex"], #configModal[style*="block"], ' +
        '#invModal[style*="block"], #fbModal[style*="block"], .custom-modal-overlay');
    return !openModal;
}

function _swPromptReload() {
    if (_swSafeToReload()) { location.reload(); return; }
    if (document.getElementById('sw-update-banner')) return; // ya visible
    var bar = document.createElement('div');
    bar.id = 'sw-update-banner';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;bottom:74px;left:50%;transform:translateX(-50%);z-index:4000;' +
        'background:#05141f;color:#f8fafc;border:1px solid rgba(255,255,255,0.2);border-radius:12px;' +
        'padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 12px 28px rgba(0,0,0,0.35);font-size:13px;';
    bar.innerHTML = '⬆️ Nueva versión disponible' +
        '<button onclick="location.reload()" style="padding:8px 14px;background:var(--kia-red,#bb162b);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;min-height:40px;">Actualizar ahora</button>' +
        '<button onclick="document.getElementById(\'sw-update-banner\').remove()" aria-label="Cerrar" style="background:none;border:none;color:rgba(255,255,255,0.6);cursor:pointer;font-size:16px;padding:4px;">✕</button>';
    document.body.appendChild(bar);
}

// ── [v15.5] Menú "⋯" de la topbar (móvil): colapsa los controles secundarios ──
function topbarMoreToggle() {
    var group = document.getElementById('topbar-more-group');
    var btn = document.getElementById('topbar-more-btn');
    if (!group) return;
    var open = group.classList.toggle('open');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
        setTimeout(function() {
            document.addEventListener('click', function _closeMore(e) {
                if (!group.contains(e.target) && e.target !== btn) {
                    group.classList.remove('open');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                    document.removeEventListener('click', _closeMore);
                }
            });
        }, 0);
    }
}

function modalUxInit() {
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        for (var i = _MODAL_UX_IDS.length - 1; i >= 0; i--) {
            var el = document.getElementById(_MODAL_UX_IDS[i]);
            if (el && el.style.display && el.style.display !== 'none') {
                _modalUxClose(el);
                e.stopPropagation();
                return;
            }
        }
    });
    _MODAL_UX_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', function(e) {
            if (e.target === el) _modalUxClose(el);
        });
        new MutationObserver(function() {
            if (el.style.display && el.style.display !== 'none' && !el.classList.contains('modal-anim-in')) {
                el._modalTrigger = (document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;
                el.classList.add('modal-anim-in');
                setTimeout(function() { el.classList.remove('modal-anim-in'); }, 250);
            }
        }).observe(el, { attributes: true, attributeFilter: ['style'] });
    });
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7] SMART INTEGRATION ENGINE — Event Bus                         ║
// ╚══════════════════════════════════════════════════════════════════════╝

var _eventBus = {};

function emitEvent(name, data) {
    var handlers = _eventBus[name];
    if (!handlers) return;
    for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](data); } catch(e) { console.error('EventBus error on "' + name + '":', e); }
    }
}

function onEvent(name, handler) {
    if (!_eventBus[name]) _eventBus[name] = [];
    _eventBus[name].push(handler);
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-A5] Resource Conflict Detection                                ║
// ╚══════════════════════════════════════════════════════════════════════╝

function checkResourceConflicts() {
    var conflicts = [];
    var activeVehicles = (db.vehicles || []).filter(function(v) { return v.status === 'testing'; });
    // Check for two vehicles on same dyno at the same time
    var dynoUsers = {};
    activeVehicles.forEach(function(v) {
        var dyno = v.testData && v.testData.dynoId ? v.testData.dynoId : 'default';
        if (!dynoUsers[dyno]) dynoUsers[dyno] = [];
        dynoUsers[dyno].push(v);
    });
    Object.keys(dynoUsers).forEach(function(dyno) {
        if (dynoUsers[dyno].length > 1) {
            conflicts.push({
                type: 'dyno',
                resource: dyno,
                vehicles: dynoUsers[dyno].map(function(v) { return v.vin; }),
                message: 'Conflicto: ' + dynoUsers[dyno].length + ' vehículos asignados al dyno ' + dyno
            });
        }
    });
    // Check for cylinder conflicts (same gas cylinder used by concurrent tests)
    if (typeof invState !== 'undefined' && invState.gases) {
        var inUse = invState.gases.filter(function(g) { return g.status === 'In use'; });
        if (inUse.length > 0 && activeVehicles.length > 1) {
            conflicts.push({
                type: 'gas_concurrency',
                message: activeVehicles.length + ' pruebas simultáneas comparten cilindros en uso'
            });
        }
    }
    return conflicts;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-C] Session Memory                                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

function resumeLastSession() {
    // C1: Check for active vehicle < 24h
    try {
        var saved = localStorage.getItem('kia_active_vehicle');
        if (saved) {
            var ctx = JSON.parse(saved);
            if (ctx && ctx.vehicleId && (Date.now() - ctx.timestamp) < 86400000) {
                var vehicle = (db.vehicles || []).find(function(v) { return v.id == ctx.vehicleId && v.status !== 'archived'; });
                if (vehicle) {
                    var vinShort = vehicle.vin ? '...' + vehicle.vin.slice(-4) : '';
                    _showResumeToast(vehicle, ctx, vinShort);
                    return;
                }
            }
        }
    } catch(e) { console.warn('resumeLastSession error:', e); }

    // C3: Restore last module if no vehicle to resume
    _restoreLastModule();
}

function _showResumeToast(vehicle, ctx, vinShort) {
    var toast = document.createElement('div');
    toast.className = 'v7-resume-toast';
    toast.innerHTML = '<div class="v7-resume-toast-text">Retomar VIN ' + vinShort + '?</div>' +
        '<div class="v7-resume-toast-actions">' +
        '<button class="btn btn-primary btn-sm" id="v7-resume-yes">Si</button>' +
        '<button class="btn btn-ghost btn-sm" id="v7-resume-no">No</button>' +
        '</div>';
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 50);

    document.getElementById('v7-resume-yes').onclick = function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
        switchPlatform('cop15');
        setTimeout(function() {
            // Navigate to last tab
            if (ctx.lastTab) {
                var tabEl = document.querySelector('.tab[data-tab="' + ctx.lastTab + '"]');
                if (tabEl) tabEl.click();
            }
            setTimeout(function() {
                var sel = document.getElementById('activeVehSelect');
                if (sel) { sel.value = ctx.vehicleId; loadVehicle(); }
                // Restore scroll position
                if (ctx.scrollPosition) {
                    setTimeout(function() { window.scrollTo({ top: ctx.scrollPosition, behavior: 'smooth' }); }, 200);
                }
            }, 200);
        }, 300);
    };
    document.getElementById('v7-resume-no').onclick = function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
        localStorage.removeItem('kia_active_vehicle');
        _restoreLastModule();
    };
    // Auto-dismiss after 10s
    setTimeout(function() {
        if (toast.parentNode) { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }
    }, 10000);
}

function _restoreLastModule() {
    var lastMod = localStorage.getItem('kia_last_module');
    if (lastMod) {
        var parts = lastMod.split(':');
        var platform = parts[0];
        // Accept both new tab names and legacy section names via PLATFORM_SECTION_MAP
        if (platform && platform !== 'today' && (PLATFORM_ORDER.indexOf(platform) !== -1 || PLATFORM_SECTION_MAP[platform])) {
            switchPlatform(platform);
            if (parts[1]) {
                setTimeout(function() {
                    var section = PLATFORM_SECTION_MAP[platform] || platform;
                    if (section === 'inventory' && typeof invSwitchTab === 'function') invSwitchTab(parts[1]);
                    else if (section === 'testplan' && typeof tpSwitchTab === 'function') tpSwitchTab(parts[1]);
                    else if (section === 'panel' && typeof pnSwitchTab === 'function') pnSwitchTab(parts[1]);
                }, 200);
            }
        }
    }
}

function saveActiveVehicleContext(vehicleId, extraCtx) {
    if (!vehicleId) { localStorage.removeItem('kia_active_vehicle'); return; }
    var vehicle = (db.vehicles || []).find(function(v) { return v.id == vehicleId; });
    if (!vehicle || vehicle.status === 'archived') { localStorage.removeItem('kia_active_vehicle'); return; }
    var ctx = {
        vehicleId: vehicleId,
        vin: vehicle.vin,
        lastTab: localStorage.getItem('kia_cop15_activeTab') || 'seguimiento',
        scrollPosition: window.scrollY,
        timestamp: Date.now()
    };
    if (extraCtx) Object.assign(ctx, extraCtx);
    localStorage.setItem('kia_active_vehicle', JSON.stringify(ctx));
}

// ======================================================================
// [M01] UTILIDADES GENERALES]
// ======================================================================

    function saveDB() {
        try {
            localStorage.setItem('kia_db_v11', JSON.stringify(db));
        } catch(e) {
            console.error('saveDB: localStorage lleno', e);
            try { showToast('⚠️ Almacenamiento lleno — no se guardó COP15. Libera espacio en Panel → Sistema.', 'error'); } catch(e2) {}
            return false;
        }
        // [R6] Notify Alpine components of data change
        window.dispatchEvent(new CustomEvent('data:saved', { detail: { module: 'cop15' } }));
        return true;
    }

// ── [Fase 2.2] Debounced save wrapper for focusout/auto-save scenarios ──
var _debouncedSaveDB = debounce(function() { saveDB(); }, 500);

// ══════════════════════════════════════════════════════════════════════
// [v17.12] IDENTIDAD DE VEHÍCULO — ids únicos ENTRE DISPOSITIVOS
//
// `++db.lastId` era un contador puramente local. La sincronización fusiona
// vehículos POR VIN y conserva el id del dispositivo que los creó, pero nunca
// adelantaba `db.lastId`: la tablet que recibía los vehículos 1..10 de otro
// equipo seguía con su `lastId` en 3 y el siguiente alta nacía con el id 4, ya
// ocupado. A partir de ahí, TODA búsqueda `db.vehicles.find(v => v.id == id)`
// devolvía el primero de los dos: elegir un vehículo en Operación cargaba otro,
// el borrador de captura se compartía entre ambos y `deleteVehicleCascade`
// (`filter(x => x.id != id)`) borraba los dos de un golpe.
//
// nextVehicleId() emite un id irrepetible (marca de tiempo + azar, verificado
// contra los ya usados) y dedupeVehicleIds() repara los duplicados que ya
// existan, al arrancar y después de cada fusión con la nube.
// ══════════════════════════════════════════════════════════════════════

function nextVehicleId() {
    var used = {};
    ((db && db.vehicles) || []).forEach(function(v) { if (v) used[String(v.id)] = true; });
    var id;
    // Date.now()*1000 ≈ 1.8e15, muy por debajo de Number.MAX_SAFE_INTEGER (9e15)
    for (var i = 0; i < 100; i++) {
        id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        if (!used[String(id)]) break;
    }
    if (db) db.lastId = id; // se mantiene por compatibilidad: "último id emitido"
    return id;
}

// Reapunta las referencias por id que SÍ se pueden resolver sin ambigüedad
// (las que guardan también el VIN). Las demás se descartan a propósito.
function _vehicleIdRepairRefs(vin, oldId, newId) {
    try {
        var soak = JSON.parse(localStorage.getItem('kia_soak_timer') || 'null');
        if (soak && soak.vehicleId == oldId && soak.vin && soak.vin === vin) {
            soak.vehicleId = newId;
            localStorage.setItem('kia_soak_timer', JSON.stringify(soak));
        }
    } catch(e) {}
    try {
        var ctx = JSON.parse(localStorage.getItem('kia_active_vehicle') || 'null');
        if (ctx && ctx.vehicleId == oldId) {
            if (ctx.vin && ctx.vin === vin) {
                ctx.vehicleId = newId;
                localStorage.setItem('kia_active_vehicle', JSON.stringify(ctx));
            } else {
                localStorage.removeItem('kia_active_vehicle');
            }
        }
    } catch(e) {}
    // El borrador de captura vivía en `kia_cop15_draft_<id>`: con el id duplicado lo
    // compartían DOS vehículos distintos, así que su contenido es ambiguo y
    // restaurarlo podría pegar los datos de uno en el otro. Se descarta.
    try { localStorage.removeItem('kia_cop15_draft_' + oldId); } catch(e) {}
}

/**
 * Reasigna un id nuevo a cada vehículo cuyo id esté repetido (o vacío), conservando
 * el id del primero que aparece. Devuelve cuántos reparó. Idempotente y barata:
 * una pasada sobre db.vehicles; si no hay duplicados no escribe nada.
 */
function dedupeVehicleIds() {
    if (!db || !Array.isArray(db.vehicles)) return 0;
    var seen = {};
    var repaired = [];
    db.vehicles.forEach(function(v) {
        if (!v) return;
        var key = String(v.id);
        if (v.id === undefined || v.id === null || v.id === '' || seen[key]) {
            var oldId = v.id;
            v.id = nextVehicleId();
            seen[String(v.id)] = true;
            repaired.push({ vin: v.vin || '', oldId: oldId, newId: v.id });
        } else {
            seen[key] = true;
        }
    });
    if (repaired.length === 0) return 0;
    repaired.forEach(function(r) { _vehicleIdRepairRefs(r.vin, r.oldId, r.newId); });
    saveDB();
    try {
        if (typeof auditLog === 'function') {
            auditLog('cop15', 'id_duplicado_reparado', { type: 'system', id: 'vehicles', label: 'Identidad de vehículos' },
                repaired.length + ' vehículo(s) con id repetido recibieron uno nuevo: ' +
                repaired.map(function(r) { return (r.vin || '?') + ' (' + r.oldId + '→' + r.newId + ')'; }).join(', '));
        }
    } catch(e) {}
    console.warn('dedupeVehicleIds: ' + repaired.length + ' id(s) de vehículo duplicados reparados', repaired);
    return repaired.length;
}
// ══════════════════════════════════════════════════
// AUDIT TRAIL — Centralized mutation logging
// [v15.5] Trail en memoria + persistencia debounced: antes cada evento hacía
// JSON.parse+filter+stringify del arreglo completo (hasta 5000 entradas) y subía
// TODO el arreglo a Firestore — el costo por-acción más alto de la app.
// ══════════════════════════════════════════════════
var AUDIT_LS_KEY = 'kia_audit_trail';
// 2000 ≈ ~90 días reales de historia y mantiene el documento de Firestore
// lejos de su límite de 1MB (5000 entradas lo rozaban)
var AUDIT_MAX = 2000;
var AUDIT_PURGE_DAYS = 90;

var _auditTrail = null;        // caché en memoria (lazy)
var _auditDirty = false;       // hay cambios sin persistir

function _auditEnsureLoaded() {
    if (_auditTrail === null) {
        try { _auditTrail = JSON.parse(localStorage.getItem(AUDIT_LS_KEY) || '[]'); } catch(e) { _auditTrail = []; }
        if (!Array.isArray(_auditTrail)) _auditTrail = [];
    }
    return _auditTrail;
}

// Hook para el sync: tras un merge del pull que escribe localStorage directo
function auditReloadFromStorage() { _auditTrail = null; _auditDirty = false; }

function _auditPersistNow() {
    if (!_auditDirty || _auditTrail === null) return;
    // FIFO cap + purga >90 días (solo aquí, no en cada evento)
    if (_auditTrail.length > AUDIT_MAX) _auditTrail = _auditTrail.slice(-AUDIT_MAX);
    var cutoff = new Date(Date.now() - AUDIT_PURGE_DAYS * 86400000).toISOString();
    _auditTrail = _auditTrail.filter(function(e) { return e.ts >= cutoff; });
    try { localStorage.setItem(AUDIT_LS_KEY, JSON.stringify(_auditTrail)); _auditDirty = false; } catch(e) {}
    // Compartir el historial entre dispositivos (fbPush ya coalesce 2s por colección)
    try {
        if (typeof fbPush === 'function' && typeof fbSync !== 'undefined' && fbSync.enabled
            && typeof fbSyncModules !== 'undefined' && fbSyncModules.audit) {
            fbPush('audit', _auditTrail);
        }
    } catch(e) {}
}
var _auditPersistDebounced = debounce(_auditPersistNow, 2500);

// Flush síncrono a localStorage al ocultar/cerrar la página (el push pendiente
// se recupera en el siguiente arranque vía fbPushAll)
window.addEventListener('pagehide', _auditPersistNow);
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') _auditPersistNow();
});

function auditLog(module, action, entity, details) {
    var user = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
    _auditEnsureLoaded().push({
        id: 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        ts: new Date().toISOString(),
        user: user ? { name: user.name, role: user.role } : { name: 'Sistema', role: '' },
        mod: module,
        action: action,
        entity: entity || null,
        details: details || ''
    });
    _auditDirty = true;
    _auditPersistDebounced();
}

function auditGetTrail() {
    return _auditEnsureLoaded().slice();
}

function auditExportCSV() {
    var trail = auditGetTrail();
    var csv = 'Fecha,Usuario,Rol,Modulo,Accion,Entidad,Detalle\n';
    trail.forEach(function(e) {
        csv += [e.ts, e.user.name, e.user.role, e.mod, e.action,
                (e.entity ? e.entity.type + ':' + (e.entity.label || e.entity.id) : ''),
                '"' + (e.details || '').replace(/"/g,'""') + '"'].join(',') + '\n';
    });
    var blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'audit_trail_' + localToday() + '.csv';
    a.click();
}

// ── View Mode (Compact/Detailed) ──
var _viewModes = {};
(function loadViewModes(){
    try { _viewModes = JSON.parse(localStorage.getItem('kia_viewModes') || '{}'); } catch(e){ _viewModes = {}; }
})();
function getViewMode(module) { return _viewModes[module] || 'detailed'; }
function renderViewModeToggle(module, isLight) {
    var mode = getViewMode(module);
    return '<div class="view-mode-toggle' + (isLight ? ' light' : '') + '">' +
        '<button class="' + (mode==='detailed'?'active':'') + '" onclick="event.stopPropagation();_viewModes[\'' + module + '\']=\'detailed\';localStorage.setItem(\'kia_viewModes\',JSON.stringify(_viewModes));' +
        (module==='kanban'?'renderKanban()':module==='inv-gases'?'invRender()':'tpRender()') + '">Detalle</button>' +
        '<button class="' + (mode==='compact'?'active':'') + '" onclick="event.stopPropagation();_viewModes[\'' + module + '\']=\'compact\';localStorage.setItem(\'kia_viewModes\',JSON.stringify(_viewModes));' +
        (module==='kanban'?'renderKanban()':module==='inv-gases'?'invRender()':'tpRender()') + '">Compacto</button>' +
        '</div>';
}

// ── Real-time Field Validation ──
function validateField(input, rules) {
    if (!input) return false;
    var val = (input.value || '').trim();
    var hint = input.parentElement ? input.parentElement.querySelector('.field-hint') : null;

    // Create hint element if it doesn't exist
    if (!hint && input.parentElement) {
        hint = document.createElement('div');
        hint.className = 'field-hint';
        input.parentElement.appendChild(hint);
    }

    var valid = true;
    var msg = '';

    if (rules.required && !val) {
        valid = false; msg = 'Campo requerido';
    } else if (rules.minLength && val.length < rules.minLength) {
        valid = false; msg = 'Mínimo ' + rules.minLength + ' caracteres';
    } else if (rules.exactLength && val.length !== rules.exactLength && val.length > 0) {
        valid = false; msg = 'Debe tener exactamente ' + rules.exactLength + ' caracteres';
    } else if (rules.pattern && val && !rules.pattern.test(val)) {
        valid = false; msg = rules.patternMsg || 'Formato inválido';
    }

    input.classList.remove('field-valid', 'field-error', 'field-missing');
    if (val.length > 0) {
        input.classList.add(valid ? 'field-valid' : 'field-error');
        // [R3-M7] Shake on validation error
        if (!valid && typeof shakeElement === 'function') shakeElement(input);
    }
    if (hint) {
        hint.textContent = valid ? '' : msg;
        hint.className = 'field-hint ' + (valid ? 'field-hint-success' : 'field-hint-error');
    }
    return valid;
}

// ── Loading Indicators ──
function setBtnLoading(btn, isLoading, loadingText) {
    if (!btn) return;
    if (isLoading) {
        btn._origText = btn.innerHTML;
        btn.innerHTML = '<span class="loading-spinner" style="vertical-align:middle;margin-right:6px;"></span>' + (loadingText || 'Guardando...');
        btn.classList.add('btn-loading');
        btn.disabled = true;
    } else {
        btn.innerHTML = btn._origText || btn.innerHTML;
        btn.classList.remove('btn-loading');
        btn.disabled = false;
    }
}

function showOverlayLoading(message) {
    var existing = document.getElementById('_loadingOverlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = '_loadingOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = '<div class="loading-spinner loading-overlay-spinner"></div><div class="loading-overlay-text">' + (message || 'Procesando...') + '</div>';
    document.body.appendChild(overlay);
    return overlay;
}

function hideOverlayLoading() {
    var overlay = document.getElementById('_loadingOverlay');
    if (overlay) overlay.remove();
}

// ── Custom Modal System ──
function showModal(opts) {
    var title = opts.title || '';
    var message = opts.message || '';
    var confirmText = opts.confirmText || 'Aceptar';
    var cancelText = opts.cancelText || 'Cancelar';
    var onConfirm = opts.onConfirm || null;
    var onCancel = opts.onCancel || null;
    var type = opts.type || 'info'; // danger, warning, info, success
    var showCancel = opts.showCancel !== false;
    var isLight = _currentPlatform === 'cop15';

    // [R3-M2] Save previous focus for restoration
    var _prevFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title || 'Diálogo');

    var icons = {danger:'⚠️',warning:'⚡',info:'ℹ️',success:'✅'};
    var box = document.createElement('div');
    box.className = 'custom-modal-box' + (isLight ? ' modal-light' : '');
    box.innerHTML = '<div class="custom-modal-title">' + (icons[type]||'') + ' ' + title + '</div>' +
        '<div class="custom-modal-message">' + message + '</div>' +
        '<div class="custom-modal-actions">' +
        (showCancel ? '<button class="modal-btn-cancel" id="_modal_cancel">' + cancelText + '</button>' : '') +
        '<button class="modal-btn-confirm modal-type-' + type + '" id="_modal_confirm">' + confirmText + '</button>' +
        '</div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var confirmBtn = box.querySelector('#_modal_confirm');
    var cancelBtn = box.querySelector('#_modal_cancel');
    confirmBtn.focus();

    function close() {
        if (overlay.parentNode) {
            overlay.classList.add('modal-closing');
            setTimeout(function() {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                if (_prevFocus && _prevFocus.focus) try { _prevFocus.focus(); } catch(e){}
            }, 200);
        } else {
            if (_prevFocus && _prevFocus.focus) try { _prevFocus.focus(); } catch(e){}
        }
    }

    // [R3-M2] Focus trap — Tab/Shift+Tab cycle within modal
    var focusableEls = box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var firstFocusable = focusableEls[0];
    var lastFocusable = focusableEls[focusableEls.length - 1];
    overlay.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { close(); if(onCancel) onCancel(); return; }
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
            if (document.activeElement === firstFocusable) { e.preventDefault(); lastFocusable.focus(); }
        } else {
            if (document.activeElement === lastFocusable) { e.preventDefault(); firstFocusable.focus(); }
        }
    });

    confirmBtn.addEventListener('click', function(){ close(); if(onConfirm) onConfirm(); });
    if (cancelBtn) cancelBtn.addEventListener('click', function(){ close(); if(onCancel) onCancel(); });
    overlay.addEventListener('click', function(e){ if(e.target === overlay){ close(); if(onCancel) onCancel(); } });
}

function showConfirm(message, onConfirm, opts) {
    opts = opts || {};
    showModal({
        title: opts.title || 'Confirmar',
        message: message,
        confirmText: opts.confirmText || 'Sí, continuar',
        cancelText: opts.cancelText || 'Cancelar',
        type: opts.type || 'warning',
        onConfirm: onConfirm,
        onCancel: opts.onCancel || null
    });
}

// ── Copy to Clipboard Utility ──
function copyToClipboard(text, btnEl) {
    var fallback = function() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch(e) {}
        document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(fallback);
    } else { fallback(); }
    // Visual feedback on button
    if (btnEl) {
        var orig = btnEl.textContent;
        btnEl.textContent = '✅';
        btnEl.style.pointerEvents = 'none';
        setTimeout(function(){ btnEl.textContent = orig; btnEl.style.pointerEvents = ''; }, 1500);
    }
    showToast('Copiado al portapapeles', 'success');
}

// ── Toast Notification System ──
function showToast(msg, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('role', 'status');
        document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = msg;

    var hasUndo = arguments.length >= 4 && typeof arguments[3] === 'function';
    if (hasUndo) {
        var undoBtn = document.createElement('button');
        undoBtn.textContent = ' Deshacer';
        undoBtn.style.cssText = 'margin-left:8px;padding:2px 8px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;cursor:pointer;font-size: var(--fs-sm);font-weight:700;';
        var undoFn = arguments[3];
        undoBtn.onclick = function() { undoFn(); dismiss(); };
        toast.appendChild(undoBtn);
    }

    // Progress bar with CSS animation
    var dur = hasUndo ? 8000 : 4000;
    var durSec = (dur / 1000) + 's';
    toast.style.setProperty('--toast-duration', durSec);

    var progressBar = document.createElement('div');
    progressBar.className = 'toast-progress';
    toast.appendChild(progressBar);

    container.appendChild(toast);

    // Timer with pause on hover/touch
    var remaining = dur;
    var startTime = Date.now();
    var timer = setTimeout(dismiss, dur);

    function pause() {
        clearTimeout(timer);
        remaining -= (Date.now() - startTime);
        if (remaining < 0) remaining = 0;
        toast.classList.add('toast-paused');
    }

    function resume() {
        toast.classList.remove('toast-paused');
        startTime = Date.now();
        timer = setTimeout(dismiss, remaining);
    }

    function dismiss() {
        clearTimeout(timer);
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }

    toast.addEventListener('mouseenter', pause);
    toast.addEventListener('mouseleave', resume);
    toast.addEventListener('touchstart', pause, { passive: true });
    toast.addEventListener('touchend', resume);
}

// ── Custom Confirm Dialog (replaces native confirm()) ──
function showConfirmDialog(opts) {
    opts = opts || {};
    var title = opts.title || 'Confirmar';
    var message = opts.message || '¿Estás seguro?';
    var type = opts.type || 'warning';
    var confirmText = opts.confirmText || 'Sí';
    var cancelText = opts.cancelText || 'Cancelar';

    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';

        var typeColor = type === 'danger' ? 'modal-type-danger' : type === 'warning' ? 'modal-type-warning' : 'modal-type-info';

        overlay.innerHTML =
            '<div class="custom-modal-box modal-light" role="dialog" aria-modal="true">' +
                '<div class="custom-modal-title">' + title + '</div>' +
                '<div class="custom-modal-message">' + message.replace(/\n/g, '<br>') + '</div>' +
                '<div class="custom-modal-actions">' +
                    '<button class="modal-btn modal-btn-cancel" data-action="cancel">' + cancelText + '</button>' +
                    '<button class="modal-btn modal-btn-confirm ' + typeColor + '" data-action="confirm">' + confirmText + '</button>' +
                '</div>' +
            '</div>';

        function close(result) {
            if (overlay.parentNode) {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.15s var(--ease-out)';
                setTimeout(function() {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 150);
            }
            resolve(result);
            if (result && typeof opts.onConfirm === 'function') opts.onConfirm();
            if (!result && typeof opts.onCancel === 'function') opts.onCancel();
        }

        overlay.querySelector('[data-action="confirm"]').addEventListener('click', function() { close(true); });
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', function() { close(false); });
        overlay.addEventListener('click', function(e) { if (e.target === overlay) close(false); });

        document.body.appendChild(overlay);
        overlay.querySelector('[data-action="cancel"]').focus();
    });
}


    function closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

// ══════════════════════════════════════════════════════════════════════
// [R4-M1] CHART CONFIGURATION ENGINE
// ══════════════════════════════════════════════════════════════════════

var CHART_CONFIG_LS_KEY = 'kia_chart_configs';

var CHART_DEFAULTS = {
    height: 320, yMin: null, yMax: null,
    pointRadius: 4, borderWidth: 2, tension: 0.1,
    legendPosition: 'bottom', legendFontSize: 10,
    gridColor: 'rgba(30,41,59,0.5)', gridDisplay: true,
    tickFontSize: 9, tickColor: '#64748b',
    animationDuration: 400, colorPalette: 'default'
};

var CHART_COLOR_PALETTES = {
    default:    ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'],
    vivid:      ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#d35400'],
    pastel:     ['#74b9ff','#55efc4','#ffeaa7','#fab1a0','#a29bfe','#81ecec','#fd79a8','#00cec9'],
    monochrome: ['#2d3436','#636e72','#b2bec3','#dfe6e9','#0984e3','#74b9ff','#a29bfe','#6c5ce7']
};

var _chartConfigs = {};
function chartConfigLoad() {
    try { var s = localStorage.getItem(CHART_CONFIG_LS_KEY); if (s) _chartConfigs = JSON.parse(s); } catch(e) { _chartConfigs = {}; }
}
function chartConfigSave() {
    try { localStorage.setItem(CHART_CONFIG_LS_KEY, JSON.stringify(_chartConfigs)); } catch(e) {}
}
function chartConfigGet(chartId) {
    return Object.assign({}, CHART_DEFAULTS, _chartConfigs[chartId] || {});
}
function chartConfigSet(chartId, key, val) {
    if (!_chartConfigs[chartId]) _chartConfigs[chartId] = {};
    _chartConfigs[chartId][key] = val;
    chartConfigSave();
}
function chartConfigReset(chartId) {
    delete _chartConfigs[chartId];
    chartConfigSave();
    showToast('Configuracion del grafico restaurada', 'success');
}

function chartConfigApply(chartId, instanceVar) {
    var chart = window[instanceVar];
    if (!chart) return;
    var cfg = chartConfigGet(chartId);
    // Scales
    if (chart.options.scales && chart.options.scales.y) {
        var yS = chart.options.scales.y;
        yS.min = cfg.yMin !== null ? cfg.yMin : undefined;
        yS.max = cfg.yMax !== null ? cfg.yMax : undefined;
        if (yS.ticks) { yS.ticks.font = yS.ticks.font || {}; yS.ticks.font.size = cfg.tickFontSize; yS.ticks.color = cfg.tickColor; }
        if (yS.grid) { yS.grid.display = cfg.gridDisplay; yS.grid.color = cfg.gridColor; }
    }
    if (chart.options.scales && chart.options.scales.x) {
        var xS = chart.options.scales.x;
        if (xS.ticks) { xS.ticks.font = xS.ticks.font || {}; xS.ticks.font.size = cfg.tickFontSize; }
        if (xS.grid) { xS.grid.display = cfg.gridDisplay; }
    }
    // Legend
    var leg = chart.options.plugins && chart.options.plugins.legend;
    if (leg) {
        if (cfg.legendPosition === 'hidden') { leg.display = false; }
        else { leg.display = true; leg.position = cfg.legendPosition; if (leg.labels) { leg.labels.font = leg.labels.font || {}; leg.labels.font.size = cfg.legendFontSize; } }
    }
    // Dataset styles — only for primary data series, skip control lines (borderDash)
    chart.data.datasets.forEach(function(ds) {
        if (ds.borderDash && ds.borderDash.length > 0) return;
        if (ds._isControlLine) return;
        if (typeof ds.pointRadius === 'number' && ds.pointRadius !== 0) ds.pointRadius = cfg.pointRadius;
        if (ds.borderWidth) ds.borderWidth = cfg.borderWidth;
        ds.tension = cfg.tension;
    });
    chart.options.animation = { duration: cfg.animationDuration };
    // Resize wrapper
    var wrapper = document.getElementById(chartId + '-wrapper');
    if (wrapper) wrapper.style.height = cfg.height + 'px';
    chart.resize();
    chart.update();
}

function chartConfigAutoFit(chartId, instanceVar) {
    var chart = window[instanceVar];
    if (!chart) return;
    var allVals = [];
    chart.data.datasets.forEach(function(d) { d.data.forEach(function(v) { if (v !== null && v !== undefined && !isNaN(v)) allVals.push(v); }); });
    if (allVals.length === 0) return;
    var dMin = Math.min.apply(null, allVals), dMax = Math.max.apply(null, allVals);
    var range = dMax - dMin;
    var pad = range > 0 ? range * 0.10 : Math.abs(dMax) * 0.10 || 0.1;
    var yMin = Math.max(0, dMin - pad), yMax = dMax + pad;
    var dec = range < 1 ? 4 : range < 10 ? 2 : 0;
    yMin = parseFloat(yMin.toFixed(dec)); yMax = parseFloat(yMax.toFixed(dec));
    chartConfigSet(chartId, 'yMin', yMin);
    chartConfigSet(chartId, 'yMax', yMax);
    chartConfigSet(chartId, 'height', 320);
    chartConfigApply(chartId, instanceVar);
    // Update inputs if visible
    var el1 = document.getElementById(chartId + '-ymin'); if (el1) el1.value = yMin;
    var el2 = document.getElementById(chartId + '-ymax'); if (el2) el2.value = yMax;
    var el3 = document.getElementById(chartId + '-height-val'); if (el3) el3.textContent = '320px';
    var el4 = document.getElementById(chartId + '-height-slider'); if (el4) el4.value = 320;
}

function chartConfigBuildPanel(chartId, instanceVar, opts) {
    opts = opts || {};
    var cfg = chartConfigGet(chartId);
    var paletteOptions = Object.keys(CHART_COLOR_PALETTES).map(function(k) {
        return '<option value="' + k + '" ' + (cfg.colorPalette === k ? 'selected' : '') + '>' + k.charAt(0).toUpperCase() + k.slice(1) + '</option>';
    }).join('');
    var legendOpts = ['bottom','top','left','right','hidden'].map(function(v) {
        return '<option value="' + v + '" ' + (cfg.legendPosition === v ? 'selected' : '') + '>' + (v === 'hidden' ? 'Oculta' : v.charAt(0).toUpperCase() + v.slice(1)) + '</option>';
    }).join('');

    return '<details class="chart-config-panel" ' + (window['_ccOpen_' + chartId] ? 'open' : '') + '>' +
        '<summary onclick="window[\'_ccOpen_' + chartId + '\']=!this.parentElement.open;">⚙️ Configurar Grafico</summary>' +
        '<div style="padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
        // Row 1: Height
        '<div style="grid-column:1/-1;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">' +
                '<label class="cfg-label">Altura: <strong id="' + chartId + '-height-val" class="cfg-value">' + cfg.height + 'px</strong></label>' +
                '<button onclick="chartConfigAutoFit(\'' + chartId + '\',\'' + instanceVar + '\')" class="tp-btn tp-btn-primary" style="font-size: var(--fs-xs);padding:2px 8px;">Auto-fit</button>' +
            '</div>' +
            '<input type="range" aria-label="Altura del gráfico" id="' + chartId + '-height-slider" min="200" max="600" step="20" value="' + cfg.height + '" oninput="chartConfigSet(\'' + chartId + '\',\'height\',+this.value);document.getElementById(\'' + chartId + '-height-val\').textContent=this.value+\'px\';chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');">' +
        '</div>' +
        // Row 2: Y min / Y max
        '<div>' +
            '<label class="cfg-label" style="display:block;margin-bottom:2px;">Eje Y min</label>' +
            '<input type="number" step="any" aria-label="Eje Y mínimo" id="' + chartId + '-ymin" class="tp-input" placeholder="Auto" value="' + (cfg.yMin !== null ? cfg.yMin : '') + '" onchange="chartConfigSet(\'' + chartId + '\',\'yMin\',this.value===\'\'?null:+this.value);chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');" style="width:100%;font-size: var(--fs-sm);">' +
        '</div>' +
        '<div>' +
            '<label class="cfg-label" style="display:block;margin-bottom:2px;">Eje Y max</label>' +
            '<input type="number" step="any" aria-label="Eje Y máximo" id="' + chartId + '-ymax" class="tp-input" placeholder="Auto" value="' + (cfg.yMax !== null ? cfg.yMax : '') + '" onchange="chartConfigSet(\'' + chartId + '\',\'yMax\',this.value===\'\'?null:+this.value);chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');" style="width:100%;font-size: var(--fs-sm);">' +
        '</div>' +
        // Row 3: Point radius / Line width
        '<div>' +
            '<label class="cfg-label">Puntos: <strong class="cfg-value">' + cfg.pointRadius + '</strong></label>' +
            '<input type="range" aria-label="Tamaño de puntos" min="0" max="10" step="1" value="' + cfg.pointRadius + '" oninput="chartConfigSet(\'' + chartId + '\',\'pointRadius\',+this.value);this.previousElementSibling.querySelector(\'strong\').textContent=this.value;chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');">' +
        '</div>' +
        '<div>' +
            '<label class="cfg-label">Linea: <strong class="cfg-value">' + cfg.borderWidth + 'px</strong></label>' +
            '<input type="range" aria-label="Grosor de línea" min="1" max="5" step="0.5" value="' + cfg.borderWidth + '" oninput="chartConfigSet(\'' + chartId + '\',\'borderWidth\',+this.value);this.previousElementSibling.querySelector(\'strong\').textContent=this.value+\'px\';chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');">' +
        '</div>' +
        // Row 4: Tension / Animation
        '<div>' +
            '<label class="cfg-label">Curvatura: <strong class="cfg-value">' + cfg.tension + '</strong></label>' +
            '<input type="range" aria-label="Curvatura de línea" min="0" max="0.4" step="0.05" value="' + cfg.tension + '" oninput="chartConfigSet(\'' + chartId + '\',\'tension\',+this.value);this.previousElementSibling.querySelector(\'strong\').textContent=this.value;chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');">' +
        '</div>' +
        '<div>' +
            '<label class="cfg-label">Animacion: <strong class="cfg-value">' + cfg.animationDuration + 'ms</strong></label>' +
            '<input type="range" aria-label="Duración de animación" min="0" max="800" step="100" value="' + cfg.animationDuration + '" oninput="chartConfigSet(\'' + chartId + '\',\'animationDuration\',+this.value);this.previousElementSibling.querySelector(\'strong\').textContent=this.value+\'ms\';chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');">' +
        '</div>' +
        // Row 5: Legend / Palette
        '<div>' +
            '<label class="cfg-label" style="display:block;margin-bottom:2px;">Leyenda</label>' +
            '<select class="tp-select" aria-label="Posición de leyenda" style="font-size: var(--fs-xs);width:100%;" onchange="chartConfigSet(\'' + chartId + '\',\'legendPosition\',this.value);chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');">' + legendOpts + '</select>' +
        '</div>' +
        '<div>' +
            '<label class="cfg-label" style="display:block;margin-bottom:2px;">Paleta</label>' +
            '<select class="tp-select" aria-label="Paleta de colores" style="font-size: var(--fs-xs);width:100%;" onchange="chartConfigSet(\'' + chartId + '\',\'colorPalette\',this.value);chartConfigApplyColors(\'' + chartId + '\',\'' + instanceVar + '\');">' + paletteOptions + '</select>' +
        '</div>' +
        // Row 6: Grid toggle / Font size
        '<div>' +
            '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size: var(--fs-xs);color:var(--tp-dim);">' +
                '<input type="checkbox" ' + (cfg.gridDisplay ? 'checked' : '') + ' onchange="chartConfigSet(\'' + chartId + '\',\'gridDisplay\',this.checked);chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');" style="accent-color:var(--tp-amber);">' +
                'Mostrar grid' +
            '</label>' +
        '</div>' +
        '<div>' +
            '<label class="cfg-label">Font ticks: <strong class="cfg-value">' + cfg.tickFontSize + '</strong></label>' +
            '<input type="range" aria-label="Tamaño de fuente de ejes" min="7" max="14" step="1" value="' + cfg.tickFontSize + '" oninput="chartConfigSet(\'' + chartId + '\',\'tickFontSize\',+this.value);this.previousElementSibling.querySelector(\'strong\').textContent=this.value;chartConfigApply(\'' + chartId + '\',\'' + instanceVar + '\');">' +
        '</div>' +
        // Row 7: Export + Reset
        '<div style="grid-column:1/-1;display:flex;gap:6px;margin-top:4px;">' +
            '<button onclick="chartExportPNG(\'' + instanceVar + '\',\'' + chartId + '\')" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);flex:1;">📷 PNG</button>' +
            '<button onclick="chartExportPDF(\'' + instanceVar + '\',\'' + chartId + '\')" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);flex:1;">📄 PDF</button>' +
            '<button onclick="chartConfigReset(\'' + chartId + '\');' + (opts.rerenderFn || '') + '" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);flex:1;color:var(--tp-red);">↺ Reset</button>' +
        '</div>' +
        '</div></details>';
}

function chartConfigApplyColors(chartId, instanceVar) {
    var chart = window[instanceVar];
    if (!chart) return;
    var cfg = chartConfigGet(chartId);
    var palette = CHART_COLOR_PALETTES[cfg.colorPalette] || CHART_COLOR_PALETTES['default'];
    var ci = 0;
    chart.data.datasets.forEach(function(ds) {
        if (ds.borderDash && ds.borderDash.length > 0) return;
        if (ds._isControlLine) return;
        ds.borderColor = palette[ci % palette.length];
        if (!Array.isArray(ds.backgroundColor)) ds.backgroundColor = palette[ci % palette.length] + '20';
        ci++;
    });
    chart.update();
}

function chartExportPNG(instanceVar, chartId) {
    var chart = window[instanceVar];
    if (!chart) { showToast('Grafico no disponible', 'error'); return; }
    var a = document.createElement('a');
    a.download = 'KIA-EmLab-' + (chartId || 'chart') + '.png';
    a.href = chart.toBase64Image('image/png', 1);
    a.click();
    showToast('PNG exportado', 'success');
}

function chartExportPDF(instanceVar, chartId) {
    var chart = window[instanceVar];
    if (!chart || typeof window.jspdf === 'undefined') { showToast('jsPDF o grafico no disponible', 'error'); return; }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    doc.setFontSize(14);
    doc.setTextColor(5, 20, 31);
    doc.text('KIA EmLab — ' + (chartId || 'Chart'), 15, 15);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(new Date().toLocaleString(), 15, 22);
    var img = chart.toBase64Image('image/png', 1);
    doc.addImage(img, 'PNG', 15, 28, 245, 140);
    doc.save('KIA-EmLab-' + (chartId || 'chart') + '.pdf');
    showToast('PDF exportado', 'success');
}

// ══════════════════════════════════════════════════════════════════════
// [R4-M2] SNAPSHOT UNDO ENGINE
// ══════════════════════════════════════════════════════════════════════

var UNDO_MAX = 10;
var _undoStack = [];

function undoPush(module, actionLabel) {
    var snapshot = {};
    try {
        if (module === 'cop15' || module === 'all') snapshot.cop15 = JSON.stringify(db);
        if (module === 'testplan' || module === 'all') snapshot.testplan = typeof tpState !== 'undefined' ? JSON.stringify(tpState) : null;

        if (module === 'inventory' || module === 'all') snapshot.inventory = typeof invState !== 'undefined' ? JSON.stringify(invState) : null;
    } catch(e) { console.error('Undo snapshot failed:', e); return; }
    _undoStack.push({ module: module, label: actionLabel, timestamp: new Date().toISOString(), data: snapshot });
    if (_undoStack.length > UNDO_MAX) _undoStack.shift();
}

function undoPop() {
    if (_undoStack.length === 0) { showToast('No hay acciones para deshacer', 'info'); return; }
    var entry = _undoStack.pop();
    try {
        if (entry.data.cop15) { var restored = JSON.parse(entry.data.cop15); Object.keys(restored).forEach(function(k) { db[k] = restored[k]; }); saveDB(); }
        if (entry.data.testplan && typeof tpState !== 'undefined') { var restored = JSON.parse(entry.data.testplan); Object.keys(restored).forEach(function(k) { tpState[k] = restored[k]; }); if (typeof tpSave === 'function') tpSave(); }

        if (entry.data.inventory && typeof invState !== 'undefined') { var restored = JSON.parse(entry.data.inventory); Object.keys(restored).forEach(function(k) { invState[k] = restored[k]; }); if (typeof invSave === 'function') invSave(); }
    } catch(e) { console.error('Undo restore failed:', e); showToast('Error al deshacer', 'error'); return; }
    // Re-render affected modules
    if (entry.data.cop15 && typeof refreshAllLists === 'function') refreshAllLists();
    if (entry.data.testplan && typeof tpRender === 'function') tpRender();

    if (entry.data.inventory && typeof invRender === 'function') invRender();
    showToast('Deshecho: ' + entry.label, 'success');
}

// ══════════════════════════════════════════════════════════════════════
// [R4-M7] ENTITY NOTES SYSTEM
// ══════════════════════════════════════════════════════════════════════

var NOTES_LS_KEY = 'kia_entity_notes';
var _entityNotes = {};
try { var _nr = localStorage.getItem(NOTES_LS_KEY); if (_nr) _entityNotes = JSON.parse(_nr); } catch(e) { _entityNotes = {}; }

function noteAdd(entityType, entityId, text) {
    var key = entityType + ':' + entityId;
    if (!_entityNotes[key]) _entityNotes[key] = [];
    _entityNotes[key].push({ id: Date.now(), text: text, timestamp: new Date().toISOString() });
    try { localStorage.setItem(NOTES_LS_KEY, JSON.stringify(_entityNotes)); } catch(e) {}
}
function noteGet(entityType, entityId) { return _entityNotes[entityType + ':' + entityId] || []; }
function noteDelete(entityType, entityId, noteId) {
    var key = entityType + ':' + entityId;
    if (!_entityNotes[key]) return;
    _entityNotes[key] = _entityNotes[key].filter(function(n) { return n.id !== noteId; });
    if (_entityNotes[key].length === 0) delete _entityNotes[key];
    try { localStorage.setItem(NOTES_LS_KEY, JSON.stringify(_entityNotes)); } catch(e) {}
}
function noteCount(entityType, entityId) { return noteGet(entityType, entityId).length; }

function noteBuildButton(entityType, entityId) {
    var c = noteCount(entityType, entityId);
    return '<button onclick="noteShowModal(\'' + entityType + '\',\'' + entityId + '\')" class="tp-btn tp-btn-ghost" style="font-size: var(--fs-xs);position:relative;padding:3px 8px;">' +
        '📝 Notas' + (c > 0 ? ' <span style="background:var(--tp-amber);color:#000;font-size: var(--fs-xs);border-radius:50%;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;margin-left:2px;">' + c + '</span>' : '') +
        '</button>';
}

function noteShowModal(entityType, entityId) {
    var notes = noteGet(entityType, entityId);
    var html = '<div style="max-height:300px;overflow-y:auto;margin-bottom:10px;">';
    if (notes.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--tp-dim);font-size: var(--fs-sm);">Sin notas</div>';
    } else {
        notes.slice().reverse().forEach(function(n) {
            html += '<div style="padding:8px;margin-bottom:6px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-bg);">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
            html += '<span style="font-size: var(--fs-xs);color:var(--tp-dim);">' + new Date(n.timestamp).toLocaleString('es-MX') + '</span>';
            html += '<button onclick="noteDelete(\'' + entityType + '\',\'' + entityId + '\',' + n.id + ');noteShowModal(\'' + entityType + '\',\'' + entityId + '\');" style="background:none;border:none;color:var(--tp-red);cursor:pointer;font-size:12px;padding:0 4px;">×</button>';
            html += '</div>';
            html += '<div style="font-size: var(--fs-sm);color:var(--tp-text);white-space:pre-wrap;">' + escapeHtml(n.text) + '</div>';
            html += '</div>';
        });
    }
    html += '</div>';
    html += '<div style="display:flex;gap:6px;">';
    html += '<input type="text" id="_noteInput" aria-label="Agregar nota" class="tp-input" placeholder="Agregar nota..." style="flex:1;font-size: var(--fs-sm);padding:8px;" onkeydown="if(event.key===\'Enter\'){var v=this.value.trim();if(v){noteAdd(\'' + entityType + '\',\'' + entityId + '\',v);noteShowModal(\'' + entityType + '\',\'' + entityId + '\');}}">';
    html += '<button onclick="var inp=document.getElementById(\'_noteInput\');var v=inp.value.trim();if(v){noteAdd(\'' + entityType + '\',\'' + entityId + '\',v);noteShowModal(\'' + entityType + '\',\'' + entityId + '\');}" class="tp-btn tp-btn-primary" style="font-size: var(--fs-xs);padding:8px 14px;">+</button>';
    html += '</div>';

    showModal('Notas — ' + entityType + ':' + entityId.substring(0, 15), html, []);
}

function round(x, decimals = 4) {
  if (!isFinite(x)) return '';
  const p = Math.pow(10, decimals);
  return Math.round(x * p) / p;
}


function truncateMiddle(str, max = 34) {
  if (!str) return '';
  str = String(str);
  if (str.length <= max) return str;

  const dots = '...';
  const keep = Math.floor((max - dots.length) / 2);
  return str.slice(0, keep) + dots + str.slice(-keep);
}


function isEmissionsPurpose(purpose) {
  return purpose === 'COP-Emisiones' || purpose === 'EO-Emisiones' || purpose === 'ND-Emisiones';
}

function nowLocalDatetimeValue() {
  const d = new Date();
  // Ajuste para que datetime-local muestre hora local correcta
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16); // "YYYY-MM-DDTHH:MM"
}

// ── Fechas de calendario en hora LOCAL (el lab opera en UTC-6: toISOString()
//    después de ~18:00 ya es "mañana"; usar estos helpers para días calendario) ──
function localDateStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function localToday() { return localDateStr(new Date()); }
// Parse 'YYYY-MM-DD' como fecha LOCAL (new Date('YYYY-MM-DD') parsea UTC y corre el día)
function parseLocalDate(ymd) {
  if (ymd instanceof Date) return ymd;
  var p = String(ymd || '').slice(0, 10).split('-');
  return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
}


function setAltaDatetimeIfEmpty(force = false) {
  const el = document.getElementById('reg_datetime');
  if (!el) return;
  if (force || !el.value) el.value = nowLocalDatetimeValue();
}


function setPrecondDatetimeIfEmpty(force = false) {
  const el = document.getElementById('precond_datetime');
  if (!el) return;
  if (force || !el.value) el.value = nowLocalDatetimeValue();
}



// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M14b] TAB CACHE SYSTEM — Persistent tab panels with lazy render  ║
// ╚══════════════════════════════════════════════════════════════════════╝

var _tabCache = {};

/**
 * Initialize tab caching for a module.
 * Creates persistent sub-divs inside the content container so tabs don't re-render on switch.
 * @param {string} moduleId - Module prefix (e.g., 'pn', 'inv', 'ra', 'tp')
 * @param {string[]} tabIds - Array of tab IDs
 */
function tabCacheInit(moduleId, tabIds) {
    var container = document.getElementById(moduleId + '-content');
    if (!container) return;
    _tabCache[moduleId] = { tabs: tabIds, dirty: {}, rendered: {} };
    tabIds.forEach(function(tabId) {
        var div = document.createElement('div');
        div.id = tabId + '-cached';
        div.className = 'alpine-tab-panel';
        div.style.display = 'none';
        container.appendChild(div);
    });
}

/**
 * Switch to a tab with caching. Only re-renders if tab is dirty or never rendered.
 * @param {string} moduleId - Module prefix
 * @param {string} tabId - Target tab ID
 * @param {function} renderFn - Function(el) that renders content into the tab div
 */
function tabCacheSwitch(moduleId, tabId, renderFn) {
    var cache = _tabCache[moduleId];
    if (!cache) {
        var c = document.getElementById(moduleId + '-content');
        try { renderFn(c); } catch (err) { _tabRenderError(c, err); }
        return;
    }

    // Swap content IMMEDIATELY and reliably. The previous implementation wrapped
    // the swap in setTimeout(200) + document.startViewTransition(), which on
    // Chrome/Brave could leave the swap stranded (button highlighted but the
    // *-cached div display never toggled → "resalta pero no cambia"). We now do
    // the display toggle synchronously and keep only non-blocking CSS animations.
    cache.tabs.forEach(function(id) {
        var el = document.getElementById(id + '-cached');
        if (!el) return;
        if (id === tabId) {
            el.style.display = '';
            el.classList.remove('tab-content-exit');
            el.classList.add('tab-content-enter');
            setTimeout(function() { el.classList.remove('tab-content-enter'); }, 200);
        } else {
            el.style.display = 'none';
            el.classList.remove('tab-content-exit', 'tab-content-enter');
        }
    });

    var target = document.getElementById(tabId + '-cached');
    if (!target) return;
    if (!cache.rendered[tabId] || cache.dirty[tabId]) {
        if (!cache.rendered[tabId]) target.innerHTML = _skeletonHTML();
        // Show skeleton one frame, then render. Wrap in try/catch so a failing
        // renderer shows a visible error instead of a silent blank ("dead") tab.
        requestAnimationFrame(function() {
            try {
                renderFn(target);
                cache.rendered[tabId] = true;
                cache.dirty[tabId] = false;
            } catch (err) {
                _tabRenderError(target, err);
                cache.rendered[tabId] = false; // allow retry on next switch
            }
        });
    }
}

/** Render a visible error box into a tab when its renderer throws. */
function _tabRenderError(target, err) {
    if (!target) { console.error('tab render error', err); return; }
    var msg = (err && err.message) ? err.message : String(err);
    target.innerHTML = '<div class="tp-card" style="border-left:3px solid var(--tp-red,#ef4444);padding:12px;">' +
        '<b style="color:var(--tp-red,#ef4444);">Error al renderizar esta sección</b>' +
        '<pre style="white-space:pre-wrap;font-size: var(--fs-xs);color:var(--tp-dim,#64748b);margin-top:6px;overflow:auto;">' +
        msg.replace(/</g, '&lt;') + '</pre></div>';
}

/**
 * Mark a tab (or all tabs) as needing re-render on next switch.
 */
function tabCacheInvalidate(moduleId, tabId) {
    var cache = _tabCache[moduleId];
    if (!cache) return;
    if (tabId) {
        cache.dirty[tabId] = true;
        // If currently visible, re-render immediately
        var el = document.getElementById(tabId + '-cached');
        if (el && el.style.display !== 'none') {
            cache.rendered[tabId] = false;
        }
    } else {
        cache.tabs.forEach(function(id) { cache.dirty[id] = true; });
    }
}

/**
 * Force re-render of the currently visible tab in a module.
 */
/**
 * Animate a drill-down navigation: exit old content, render new, enter.
 * @param {string} containerId - DOM id of the container element
 * @param {function} renderFn - Function that updates the container content
 */
function navigateToDetail(containerId, renderFn) {
    var container = document.getElementById(containerId);
    if (!container) { renderFn(); return; }
    container.classList.add('drill-down-exit');
    setTimeout(function() {
        container.classList.remove('drill-down-exit');
        renderFn();
        container.classList.add('drill-down-enter');
        setTimeout(function() {
            container.classList.remove('drill-down-enter');
        }, 250);
    }, 200);
}
window.navigateToDetail = navigateToDetail;

/**
 * Generate skeleton placeholder HTML for loading state.
 */
function _skeletonHTML() {
    return '<div style="padding:12px;">' +
        '<div class="skeleton-grid">' +
        '<div class="skeleton skeleton-kpi"></div>' +
        '<div class="skeleton skeleton-kpi"></div>' +
        '<div class="skeleton skeleton-kpi"></div>' +
        '</div>' +
        '<div class="skeleton-card">' +
        '<div class="skeleton skeleton-line long"></div>' +
        '<div class="skeleton skeleton-line medium"></div>' +
        '<div class="skeleton skeleton-line short"></div>' +
        '</div>' +
        '</div>';
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M15] PLATFORM SWITCHER                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Root tabs: 4 workflow-oriented tabs (was 6 feature tabs)
var PLATFORM_ORDER = ['today', 'plan', 'pruebas', 'datos', 'cop'];
var _currentPlatform = 'today';

// Maps any platform name (including legacy aliases) to the root tab it belongs to
var PLATFORM_TAB_GROUP = {
    'today': 'today',
    'plan': 'plan',      'testplan': 'plan',
    'pruebas': 'pruebas', 'cop15': 'pruebas', 'inventory': 'pruebas',
    'datos': 'datos',    'panel': 'datos',
    'cop': 'cop',
};

// Maps any platform name to the actual DOM section ID suffix (platform-XXX)
var PLATFORM_SECTION_MAP = {
    'today': 'today',
    'plan': 'testplan',   'testplan': 'testplan',
    'pruebas': 'cop15',   'cop15': 'cop15',    'inventory': 'inventory',
    'datos': 'panel',     'panel': 'panel',
    'cop': 'cop',
};

function switchPlatform(platform, swipeDir) {
    // Resolve the actual section and root tab
    var sectionId = PLATFORM_SECTION_MAP[platform] || platform;
    var tabGroup  = PLATFORM_TAB_GROUP[platform] || platform;

    // Exact same call — nothing to do
    if (platform === _currentPlatform) return;

    var oldSectionId = PLATFORM_SECTION_MAP[_currentPlatform] || _currentPlatform;
    var oldSection = document.getElementById('platform-' + oldSectionId);
    var newSection = document.getElementById('platform-' + sectionId);

    if (!newSection) return;

    // Only animate DOM sections if they actually differ
    if (sectionId !== oldSectionId) {
        if (swipeDir && oldSection && newSection) {
            var exitClass = swipeDir === 'left' ? 'swipe-exit-left' : 'swipe-exit-right';
            var enterClass = swipeDir === 'left' ? 'swipe-enter-left' : 'swipe-enter-right';

            oldSection.classList.add(exitClass);
            setTimeout(function() {
                oldSection.classList.remove('active', exitClass);
                newSection.classList.add('active', enterClass);
                setTimeout(function() { newSection.classList.remove(enterClass); }, 150);
            }, 110);
        } else {
            // Cambio de sección síncrono y fiable. (Antes usaba document.startViewTransition,
            // que de forma intermitente dejaba la sección sin cambiar — mismo problema que
            // ya se corrigió en el motor de tabs.) [v15.5] Con una entrada corta de
            // opacity/transform vía CSS — el toggle sigue siendo síncrono.
            document.querySelectorAll('.platform-section').forEach(function(s) { s.classList.remove('active', 'platform-enter'); });
            newSection.classList.add('active', 'platform-enter');
            setTimeout(function() { newSection.classList.remove('platform-enter'); }, 200);
        }
    }

    // Update top tabs — highlight the root tab group
    document.querySelectorAll('.platform-tab').forEach(function(t) { t.classList.remove('active'); });
    var ptabEl = document.getElementById('ptab-' + tabGroup);
    if (ptabEl) ptabEl.classList.add('active');
    if (typeof a11yTablistSync === 'function') {
        a11yTablistSync(document.getElementById('platformBar'), ptabEl);
    }

    // Update bottom nav — highlight the root tab group
    document.querySelectorAll('.bottom-nav-item').forEach(function(b) { b.classList.remove('active'); b.removeAttribute('aria-current'); });
    var bnavEl = document.getElementById('bnav-' + tabGroup);
    if (bnavEl) { bnavEl.classList.add('active'); bnavEl.setAttribute('aria-current', 'page'); }

    // Hide floating action bar when leaving COP15
    if (sectionId !== 'cop15' && typeof toggleActionBar === 'function') toggleActionBar(false);

    // Theme — unified light theme for all modules
    document.body.style.background = 'var(--bg)';
    document.body.style.color = 'var(--text)';

    _currentPlatform = platform;

    // [V7-C3] Save last module visited (store resolved section name for backward compat)
    localStorage.setItem('kia_last_module', sectionId);

    if (sectionId === 'today') { dailyDashRender(); }
    if (sectionId === 'testplan') { tpRender(); tpUpdateBadges(); }

    if (sectionId === 'inventory') { invPreloadData(); if(typeof invRestoreTab==='function') invRestoreTab(); else invRender(); invUpdateBadges(); }
    if (sectionId === 'panel') { pnRender(); pnUpdateBadges(); }
    if (sectionId === 'cop') { if (typeof copRender === 'function') copRender(); }
    if (sectionId === 'cop15') {
        var active = db.vehicles.filter(function(v) { return v.status !== 'archived'; }).length;
        document.getElementById('cop15-count-badge').textContent = active + ' activos';
        // Restore COP15 active tab
        var savedCop15Tab = localStorage.getItem('kia_cop15_activeTab');
        if (savedCop15Tab) {
            var tabEl = document.querySelector('.tab[data-tab="' + savedCop15Tab + '"]');
            if (tabEl) {
                document.querySelectorAll('.tab, .tab-panel').forEach(function(el){ el.classList.remove('active'); });
                tabEl.classList.add('active');
                var panel = document.getElementById('panel-' + savedCop15Tab);
                if (panel) panel.classList.add('active');
                if (savedCop15Tab === 'kanban' && typeof renderKanban === 'function') renderKanban();
            }
        }
    }

    // Update vehicle checklist visibility
    if (typeof vclUpdate === 'function') vclUpdate();

    // v16.0: primera visita a este módulo → recorrido guiado corto (solo desktop)
    if (typeof _tourMaybeAutoStart === 'function') _tourMaybeAutoStart(sectionId);

    // Instant: el smooth-scroll competía con la animación de entrada y se
    // percibía como un salto; el smooth queda para navegación intra-vista
    window.scrollTo(0, 0);
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  Sub-tab overflow menu ("⋯ Más") — navigation simplification         ║
// ╚══════════════════════════════════════════════════════════════════════╝

/** Toggle the advanced-tabs dropdown for a module tab bar. */
/** Deep-link helper for the "Hoy" dashboard cards: switch platform, optional
 *  sub-tab, then optionally invoke an action (e.g. open an edit modal) by name. */
function dashGo(platform, tabId, action, id) {
    // Pre-fijar el sub-tab destino ANTES de cambiar de plataforma, para que el
    // restore-de-tab que hace switchPlatform (p.ej. invRestoreTab) aterrice ahí
    // y no compita con el invSwitchTab posterior (causaba que la lectura de gases
    // "no jalara" mientras la calibración sí, porque esa abre un modal encima).
    if (tabId) {
        try {
            if (platform === 'inventory') { localStorage.setItem('kia_inv_activeTab', tabId); if (typeof invState !== 'undefined') invState.activeTab = tabId; }
            else if (platform === 'cop15') { localStorage.setItem('kia_cop15_activeTab', tabId); }
        } catch (e) {}
    }
    if (typeof switchPlatform === 'function') switchPlatform(platform);
    setTimeout(function() {
        if (tabId) {
            if (platform === 'inventory' && typeof invSwitchTab === 'function') invSwitchTab(tabId);
            else if (platform === 'testplan' && typeof tpSwitchTab === 'function') tpSwitchTab(tabId);
            else if (platform === 'panel' && typeof pnSwitchTab === 'function') pnSwitchTab(tabId);
        }
        if (action && typeof window[action] === 'function') {
            setTimeout(function() { try { window[action](id); } catch(e) {} }, 220);
        }
    }, 160);
}

function _tabMoreReset(menu) {
    if (!menu) return;
    menu.style.position = ''; menu.style.top = ''; menu.style.left = ''; menu.style.right = '';
    menu.style.maxHeight = ''; menu.style.overflowY = ''; menu.style.zIndex = ''; menu.style.display = '';
}
function _tabMoreClose(wrap) {
    if (!wrap) return;
    wrap.classList.remove('open');
    var menu = wrap.__tabMoreMenu || (wrap.querySelector ? wrap.querySelector('.tp-tab-more-menu') : null);
    if (menu) {
        if (menu.parentNode !== wrap) wrap.appendChild(menu); // devolver el menú a su wrap
        _tabMoreReset(menu);
    }
}
function toggleTabMore(btn) {
    var wrap = btn && btn.closest ? btn.closest('.tp-tab-more-wrap') : null;
    if (!wrap) return;
    var wasOpen = wrap.classList.contains('open');
    // Cerrar cualquier menú abierto (y devolverlo a su wrap)
    document.querySelectorAll('.tp-tab-more-wrap.open').forEach(_tabMoreClose);
    if (wasOpen) return;
    var menu = wrap.querySelector('.tp-tab-more-menu');
    if (!menu) { wrap.classList.add('open'); return; }
    wrap.__tabMoreMenu = menu;
    // Portal: mover el menú a <body> para que position:fixed escape del contenedor
    // de la barra (.tp-tabs tiene backdrop-filter y .platform-section tiene contain:layout,
    // que de otro modo lo anclan/recortan). Por eso "se contenía dentro de la barra".
    document.body.appendChild(menu);
    wrap.classList.add('open');
    var r = btn.getBoundingClientRect();
    var W = 220;
    menu.style.position = 'fixed';
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8)) + 'px';
    menu.style.right = 'auto';
    menu.style.maxHeight = Math.max(120, window.innerHeight - r.bottom - 16) + 'px';
    menu.style.overflowY = 'auto';
    menu.style.zIndex = '9999';
    menu.style.display = 'flex'; // el menú ya no es descendiente de .open; mostrarlo explícitamente
    // En captura (antes del onclick inline del item, que usa this.closest('.tp-tab-more-wrap')),
    // devolver el menú a su wrap y cerrar — así la navegación funciona y el menú se oculta.
    if (!menu.__tabMoreHooked) {
        menu.__tabMoreHooked = true;
        menu.addEventListener('click', function() { _tabMoreClose(wrap); }, true);
    }
}

// Close the overflow menu when clicking elsewhere (capture once globally).
document.addEventListener('click', function(e) {
    var t = e.target;
    if (t && t.closest && (t.closest('.tp-tab-more-wrap') || t.closest('.tp-tab-more-menu'))) return;
    document.querySelectorAll('.tp-tab-more-wrap.open').forEach(_tabMoreClose);
});

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M16] DAILY DASHBOARD — Vista Hoy                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

function dailyDashRender() {
    var el = document.getElementById('daily-dash-content');
    if (!el) return;

    var now = new Date();
    var days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    var months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var hour = now.getHours();
    var greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';

    var html = '';

    // v16.0: banner de ayuda de esta pestaña
    if (typeof helpBannerHTML === 'function') html += helpBannerHTML('today');

    // ── Header ──
    html += '<div class="daily-dash-header">';
    html += '<div class="daily-dash-greeting">' + greeting + '</div>';
    html += '<div class="daily-dash-date">' + days[now.getDay()] + ' ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear() + '</div>';
    html += '</div>';

    // ── [v15-P1] Resumen del Lab (fuente única: renderLabOverview, KPI + pipeline) ──
    html += '<div id="hoy-lab-overview" style="margin-bottom:8px;"></div>';

    // ── [v15.9] Mi Turno (compacto — la lista de vehículos vive ahora en el tablero) ──
    var currentOp = '';
    try {
        if (typeof authGetCurrentUser === 'function') { var u = authGetCurrentUser(); if (u && u.name) currentOp = u.name; }
        if (!currentOp) currentOp = localStorage.getItem('kia_last_operator') || '';
    } catch(e) {}
    if (currentOp) {
        var releasedToday = (db.vehicles || []).filter(function(v) {
            return v.status === 'archived' && v.archivedAt && localDateStr(new Date(v.archivedAt)) === localToday() &&
                (v.registeredBy === currentOp || (v.testData && v.testData.testResponsible === currentOp));
        }).length;
        var testingToday = (db.vehicles || []).filter(function(v) {
            return v.status === 'testing' && (v.registeredBy === currentOp || (v.testData && v.testData.testResponsible === currentOp));
        }).length;
        var shiftTarget = 8;
        var shiftPct = Math.min(100, Math.round((releasedToday / shiftTarget) * 100));
        html += '<div class="v7-mi-turno-card" style="margin-bottom:10px;">';
        html += '<div class="v7-mi-turno-header">';
        html += '<span class="v7-mi-turno-avatar">' + currentOp.charAt(0).toUpperCase() + '</span>';
        html += '<div><div class="v7-mi-turno-name">' + currentOp + '</div>';
        html += '<div class="v7-mi-turno-stats">Hoy: ' + releasedToday + ' liberados, ' + testingToday + ' en test</div></div>';
        html += '<div class="v7-shift-ring">' + buildProgressRing(shiftPct, 52, shiftPct >= 100 ? tokenColor('--ok-fill') : tokenColor('--info-fill')) + '</div>';
        html += '</div></div>';
    }

    // ── [v15.9] TABLERO DE ACTIVIDADES (estilo Monday: filas homogéneas por categoría) ──
    // Sustituye las antiguas secciones sueltas (Captura de Hoy, Soak, Vehículos Activos,
    // Alertas de Inventario, Plan Semanal): todo son filas del mismo formato ahora.
    var acts = dashCollectActivities();
    html += dashRenderBoard(acts, currentOp);

    // ── Quick Actions ──
    html += '<div class="daily-dash-section">';
    html += '<div class="daily-dash-section-title">⚡ Acceso Rápido</div>';
    html += '<div class="daily-dash-quick-actions">';
    html += '<div class="daily-dash-action" onclick="switchPlatform(\'cop15\');setTimeout(function(){var t=document.querySelector(\'.tab[data-tab=alta]\');if(t)t.click();},150);"><span class="daily-dash-action-icon">➕</span>Alta Vehículo</div>';

    // Last edited vehicle shortcut
    var lastVehicle = (db.vehicles || []).filter(function(v){ return v.status !== 'archived'; }).sort(function(a,b) {
        var tA = a.timeline && a.timeline.length ? a.timeline[a.timeline.length-1].timestamp : a.registeredAt || '';
        var tB = b.timeline && b.timeline.length ? b.timeline[b.timeline.length-1].timestamp : b.registeredAt || '';
        return tB > tA ? 1 : -1;
    })[0];
    if (lastVehicle) {
        var lModel = lastVehicle.config ? (lastVehicle.config.Modelo || '') : '';
        html += '<div class="daily-dash-action" onclick="switchPlatform(\'cop15\');setTimeout(function(){var s=document.getElementById(\'activeVehSelect\');if(s){s.value=\'' + lastVehicle.id + '\';loadVehicle();var t=document.querySelector(\'.tab[data-tab=seguimiento]\');if(t)t.click();}},200);"><span class="daily-dash-action-icon">📝</span>Último: ' + lModel + '</div>';
    } else {
        html += '<div class="daily-dash-action" onclick="dashGo(\'inventory\',\'inv-readings\')"><span class="daily-dash-action-icon">🧪</span>Captura</div>';
    }

    html += '<div class="daily-dash-action" onclick="switchPlatform(\'inventory\')"><span class="daily-dash-action-icon">📦</span>Inventario</div>';
    html += '<div class="daily-dash-action" onclick="switchPlatform(\'panel\');if(typeof pnSwitchTab===\'function\')pnSwitchTab(\'pn-reports\');"><span class="daily-dash-action-icon">📤</span>Reportes</div>';
    html += '<div class="daily-dash-action" onclick="switchPlatform(\'panel\')"><span class="daily-dash-action-icon">⚙️</span>Panel</div>';
    html += '</div></div>';


    el.innerHTML = html;

    // [v15-P1] Render cross-module overview from the single source
    var _hov = document.getElementById('hoy-lab-overview');
    if (_hov && typeof renderLabOverview === 'function') renderLabOverview(_hov, { sections: ['kpi', 'pipeline'] });

    // v16.0: banners/tooltips de ayuda (render síncrono — sin caché de pestañas de por medio)
    _dashRegisterHelp();
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
    a11yClickables(el);
}

// v16.0: CASCADE_TOOLTIPS se define en cop15.js, que carga DESPUÉS de app.js — hay que
// registrar las claves de HOY en tiempo de ejecución (no al parsear), una sola vez.
var _dashHelpRegistered = false;
function _dashRegisterHelp() {
    if (_dashHelpRegistered) return;
    if (typeof CASCADE_TOOLTIPS === 'undefined') return;
    _dashHelpRegistered = true;
    Object.assign(CASCADE_TOOLTIPS, {
        'dash-board-help': { title: 'Tablero de hoy', text: 'Todo lo pendiente del día agrupado por tipo: vehículos, pruebas del plan, inventario y tareas manuales. Toca cualquier fila para ir directo a resolverla.' },
        'dash-task-title': { title: 'Título de la actividad', text: 'Describe la tarea en pocas palabras, como la escribirías en un pizarrón. Ejemplo: Pedir gas de calibración CO/N2.' },
        'dash-task-cat': { title: 'Categoría', text: 'En qué grupo del tablero aparecerá esta tarea. Usa "Manuales" si no encaja en las categorías automáticas.' },
        'dash-task-assignee': { title: 'Responsable', text: 'A quién se le asigna la tarea. Déjalo vacío si es para cualquiera del turno.' },
        'dash-task-project': { title: 'Proyecto', text: 'Si el pendiente pertenece a un proyecto (una reparación, un proyecto de inversión), elígelo aquí y se registra como un paso de ese proyecto en vez de quedar como tarea suelta. Aparecerá en su tabla, su Gantt y su línea de tiempo.' },
        'dash-task-due': { title: 'Fecha límite', text: 'Cuándo debe estar lista la tarea. Se usa para marcarla urgente cuando se acerca la fecha.' }
    });
    if (typeof HELP_TABS !== 'undefined') {
        HELP_TABS['today'] = { title: 'Tu día en un vistazo', text: 'Todo lo pendiente de hoy en un solo tablero: vehículos con su etapa, pruebas del plan, inventario y tareas. Toca cualquier fila para ir directo a resolverla.', tips: [
            'El stepper N/8 muestra en qué paso del proceso va cada vehículo activo.',
            'El chip 📅 de fecha es la liberación esperada — tócalo para fijarla manualmente.',
            'Usa "➕ Actividad" para anotar pendientes que no vienen de otro módulo.'
        ]};
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// v15.9 — TABLERO DE ACTIVIDADES DE HOY (estilo Monday: filas homogéneas agrupadas)
// Modelo unificado: cada fuente (gases, plan, vehículos, alertas, consumo, tareas
// manuales) se normaliza a {id, cat, icon, title, meta, status, progress?, assignee?,
// urgency, checkbox?, action, stage?, eta?} y se pinta con el MISMO formato de fila.
// ═══════════════════════════════════════════════════════════════════════════════
var DASH_CATS = {
    vehiculos:  { label: 'Vehículos',            icon: '🚗', accent: 'var(--accent-cascade)' },
    plan:       { label: 'Plan de hoy',          icon: '📋', accent: 'var(--accent-testplan)' },
    inventario: { label: 'Inventario',           icon: '📦', accent: 'var(--accent-inventory)' },
    calidad:    { label: 'Calidad',              icon: '🔬', accent: 'var(--accent-cop)' },
    proyectos:  { label: 'Proyectos',            icon: '🗂️', accent: 'var(--accent-panel)' },
    manuales:   { label: 'Actividades manuales', icon: '📝', accent: 'var(--accent-panel)' }
};
var DASH_CAT_ORDER = ['vehiculos', 'plan', 'inventario', 'calidad', 'proyectos', 'manuales'];
var DASH_STATUS_LABEL = { pendiente: 'Pendiente', encurso: 'En curso', hecho: 'Hecho', atrasado: 'Atrasado' };

function dashCollectActivities() {
    var acts = [];
    var hoy = localToday();

    // 1) Toma de gases del día + 2) captura de producción atrasada
    if (typeof invReadingStatusToday === 'function') {
        var rd = invReadingStatusToday();
        if (rd.inUseTotal > 0) {
            var rdDone = rd.capturedToday >= rd.inUseTotal;
            acts.push({ id: 'act-gasread', cat: 'inventario', icon: '🧪',
                title: 'Toma de gases del día',
                meta: rd.capturedToday + '/' + rd.inUseTotal + ' cilindros capturados',
                status: rdDone ? 'hecho' : 'pendiente',
                progress: { done: rd.capturedToday, total: rd.inUseTotal },
                urgency: rdDone ? 0 : 2,
                action: { label: 'Capturar', js: "dashGo('inventory','inv-readings')" } });
        }
        if (rd.inUseTotal > 0 && (rd.daysSinceLast === null || rd.daysSinceLast >= 3)) {
            acts.push({ id: 'act-prod', cat: 'inventario', icon: '📅',
                title: rd.daysSinceLast === null ? 'Sin capturas de producción registradas' : 'Captura de producción atrasada',
                meta: rd.daysSinceLast === null ? '' : 'Van ' + rd.daysSinceLast + ' días desde la última',
                status: 'atrasado', urgency: 3,
                action: { label: 'Capturar ahora', js: "dashGo('inventory','inv-readings')" } });
        }
    }

    // 3) Pruebas y preacondicionamientos que tocan HOY según el plan semanal aceptado
    if (typeof tpState !== 'undefined' && tpState.weeklyPlans) {
        var planIdx = -1;
        for (var pi = tpState.weeklyPlans.length - 1; pi >= 0; pi--) {
            if (tpState.weeklyPlans[pi] && tpState.weeklyPlans[pi].accepted && tpState.weeklyPlans[pi].items) { planIdx = pi; break; }
        }
        if (planIdx >= 0) {
            var hoyKey = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][new Date().getDay()];
            tpState.weeklyPlans[planIdx].items.forEach(function(item, ii) {
                var isTest = item.testDay === hoyKey, isPre = item.preconDay === hoyKey;
                if (!isTest && !isPre) return;
                acts.push({ id: 'act-plan-' + ii + (isTest ? 't' : 'p'), cat: 'plan', icon: isTest ? '🏭' : '🔧',
                    title: (isTest ? 'Prueba' : 'Preacondicionamiento') + ': ' + ((item.mod || '') + ' ' + (item.reg || '')).trim(),
                    meta: (item.desc || '') + (item.tier ? ' · P' + item.tier : ''),
                    status: item.completed ? 'hecho' : 'pendiente',
                    urgency: item.completed ? 0 : 2,
                    checkbox: { js: 'tpToggleWeeklyItem(' + planIdx + ',' + ii + ');dailyDashRender();', checked: !!item.completed },
                    action: { label: '▶ Iniciar', js: "switchPlatform('testplan')" } });
            });
        }
    }

    // 4) Vehículos activos: stepper N/8 + soak propio + ETA de liberación
    var soakData = null;
    try { soakData = JSON.parse(localStorage.getItem('kia_soak_timer')); } catch (e) {}
    (db.vehicles || []).filter(function(v) { return v.status !== 'archived'; }).forEach(function(v) {
        var st = typeof cascadeVehicleStage === 'function' ? cascadeVehicleStage(v) : null;
        var eta = typeof cascadeVehicleETA === 'function' ? cascadeVehicleETA(v) : null;
        var next = typeof getNextStep === 'function' ? getNextStep(v) : null;
        var model = v.config ? (v.config.Modelo || '') : '';
        var vinShort = v.vin ? '…' + v.vin.slice(-6) : '';
        var status = v.status === 'registered' ? 'pendiente' : 'encurso';
        if (eta && eta.tone === 'late') status = 'atrasado';
        var soakTxt = '';
        if (st && st.index === 4 && soakData && soakData.endTime > Date.now() && (!soakData.vehicleId || soakData.vehicleId == v.id)) {
            var rem = soakData.endTime - Date.now();
            soakTxt = '⏱ Soak: ' + Math.floor(rem / 3600000) + 'h ' + Math.floor((rem % 3600000) / 60000) + 'm restantes';
        }
        acts.push({ id: 'act-veh-' + v.id, cat: 'vehiculos', icon: '🚗',
            title: ((model ? model + ' ' : '') + vinShort).trim(),
            meta: (v.purpose || '') + (soakTxt ? ' · ' + soakTxt : ''),
            status: status, urgency: status === 'atrasado' ? 3 : 1,
            assignee: (v.testData && v.testData.testResponsible) || v.registeredBy || '',
            stage: st, eta: eta, vehicleId: v.id,
            action: next ? { label: next.icon + ' ' + next.action, js: 'v7GoToVehicle(' + v.id + ",'" + (next.goto || '') + "')" }
                         : { label: 'Ver', js: 'v7GoToVehicle(' + v.id + ')' } });
    });

    // 5) Aprobaciones pendientes (doble ciego) → Calidad
    (db.vehicles || []).filter(function(v) { return v.status === 'pending-approval'; }).forEach(function(v) {
        acts.push({ id: 'act-appr-' + v.id, cat: 'calidad', icon: '🔏',
            title: 'Aprobar liberación: ' + (v.vin ? '…' + v.vin.slice(-6) : '#' + v.id),
            meta: 'Doble ciego pendiente', status: 'pendiente', urgency: 3,
            action: { label: 'Aprobar', js: 'v7GoToVehicle(' + v.id + ",'approval-tab')" } });
    });

    // 6) Alertas de inventario con deep-link por ítem
    if (typeof invState !== 'undefined' && invState.gases) {
        invState.gases.forEach(function(g) {
            if (typeof invGasExpiry === 'function') {
                var exp = invGasExpiry(g);
                if (exp.status === 'expired') acts.push({ id: 'act-gexp-' + g.id, cat: 'inventario', icon: '⚠️',
                    title: g.formula + ' #' + g.controlNo + ' VENCIDO', meta: exp.text || '', status: 'atrasado', urgency: 3,
                    action: { label: 'Reemplazar', js: "dashGo('inventory','inv-gases','invEditGas','" + g.id + "')" } });
            }
            if (typeof invGasLevel === 'function') {
                var lvl = invGasLevel(g);
                if (lvl.pct < 15 && lvl.pct >= 0) acts.push({ id: 'act-glvl-' + g.id, cat: 'inventario', icon: '📉',
                    title: g.formula + ' #' + g.controlNo + ' al ' + Math.round(lvl.pct) + '%', meta: 'Nivel bajo', status: 'pendiente', urgency: 2,
                    action: { label: 'Reponer', js: "dashGo('inventory','inv-gases','invEditGas','" + g.id + "')" } });
            }
        });
        if (typeof invCalStatus === 'function') {
            (invState.equipment || []).forEach(function(e) {
                var st = invCalStatus(e);
                if (st.code === 'vencido') acts.push({ id: 'act-cal-' + e.id, cat: 'inventario', icon: '🔧',
                    title: e.name + ': calibración VENCIDA', meta: 'hace ' + Math.abs(st.days) + ' días', status: 'atrasado', urgency: 3,
                    action: { label: 'Calibrar', js: "dashGo('inventory','inv-equipment','invEditEquipment','" + e.id + "')" } });
                else if (st.code === 'porvencer') acts.push({ id: 'act-cal-' + e.id, cat: 'inventario', icon: '🔧',
                    title: e.name + ': calibrar en ' + st.days + ' días', meta: e.nextCalDate, status: 'pendiente', urgency: st.days <= 7 ? 2 : 1,
                    action: { label: 'Calibrar', js: "dashGo('inventory','inv-equipment','invEditEquipment','" + e.id + "')" } });
            });
        }
        // v16.4: mantenimiento preventivo (COP15-F11) — vencidos y programados para esta semana
        if (typeof invMaintOverdue === 'function') {
            invMaintOverdue().forEach(function(o) {
                acts.push({ id: 'act-mtto-' + o.act.id, cat: 'inventario', icon: '🛠️',
                    title: (o.asset ? o.asset.name + ': ' : '') + o.act.desc + ' — vencido',
                    meta: 'Desde semana ' + o.lastWeek + ' (' + o.count + ' semana' + (o.count > 1 ? 's' : '') + ' sin registrar)',
                    assignee: (o.act && o.act.responsible) || '',
                    status: 'atrasado', urgency: 3,
                    checkbox: { js: "invMaintMarkDone('" + o.act.id + "');dailyDashRender();", checked: false },
                    action: { label: 'Ver', js: "dashGo('inventory','inv-maint')" } });
            });
        }
        if (typeof invMaintDueThisWeek === 'function') {
            invMaintDueThisWeek().forEach(function(d) {
                acts.push({ id: 'act-mtto-week-' + d.act.id, cat: 'inventario', icon: '🛠️',
                    title: (d.asset ? d.asset.name + ': ' : '') + d.act.desc,
                    meta: 'Mantenimiento de esta semana · ' + (d.act.responsible || ''),
                    assignee: d.act.responsible || '',
                    status: 'pendiente', urgency: 2,
                    checkbox: { js: "invMaintMarkDone('" + d.act.id + "');dailyDashRender();", checked: false },
                    action: { label: 'Ver', js: "dashGo('inventory','inv-maint')" } });
            });
        }
    }

    // 6b) v16.6: pasos de proyectos vencidos y de esta semana (Proyectos, en Datos)
    if (typeof pnProjectsOverdueSteps === 'function') {
        pnProjectsOverdueSteps().forEach(function(o) {
            acts.push({ id: 'act-proj-' + o.step.id, cat: 'proyectos', icon: o.blocked ? '🚧' : '🗂️',
                title: o.project.name + ': ' + o.step.title,
                meta: (o.blocked ? 'Bloqueado' + (o.step.roadblock ? ' — ' + o.step.roadblock : '') : 'Vencido (' + o.step.targetDate + ')') + (o.step.responsible ? ' · 👤 ' + o.step.responsible : ''),
                // v16.8: sin assignee, el filtro "Solo míos" dejaba pasar TODOS los
                // pasos (la condición es `!a.assignee || a.assignee === currentOp`),
                // así que mostraba los de los demás. Mismo bug en mantenimiento.
                assignee: o.step.responsible || '',
                status: 'atrasado', urgency: 3,
                checkbox: o.blocked ? undefined : { js: "pnProjectStepDone('" + o.project.id + "','" + o.step.id + "');dailyDashRender();", checked: false },
                action: { label: 'Ver', js: "window._pnSelectedProject='" + o.project.id + "';dashGo('panel','pn-projects')" } });
        });
    }
    if (typeof pnProjectsDueThisWeek === 'function') {
        pnProjectsDueThisWeek().forEach(function(d) {
            acts.push({ id: 'act-proj-week-' + d.step.id, cat: 'proyectos', icon: '🗂️',
                title: d.project.name + ': ' + d.step.title,
                meta: 'Esta semana (' + d.step.targetDate + ')' + (d.step.responsible ? ' · 👤 ' + d.step.responsible : ''),
                assignee: d.step.responsible || '',
                status: 'pendiente', urgency: 2,
                checkbox: { js: "pnProjectStepDone('" + d.project.id + "','" + d.step.id + "');dailyDashRender();", checked: false },
                action: { label: 'Ver', js: "window._pnSelectedProject='" + d.project.id + "';dashGo('panel','pn-projects')" } });
        });
    }

    // 7) Consumo proyectado insuficiente (modelo aprendido, números vivos)
    if (typeof invForecastGasNeeds === 'function') {
        try {
            invForecastGasNeeds().forEach(function(f, fi) {
                acts.push({ id: 'act-cons-' + fi, cat: 'inventario', icon: f.kind === 'fuel' ? '⛽' : '🧪',
                    title: 'Faltarán ~' + f.deficit + ' ' + f.unit + ' de ' + f.name,
                    meta: 'Para ' + f.pruebasPend + ' pruebas pendientes (' + (f.scope === 'semana' ? 'esta semana' : 'plan completo') + ') · disponible ' + f.disponible + ' de ' + f.requerido + ' requeridos',
                    status: f.severidad === 'critical' ? 'atrasado' : 'pendiente',
                    urgency: f.severidad === 'critical' ? 3 : 2,
                    action: { label: 'Ver predicción', js: "dashGo('inventory','inv-predict')" } });
            });
        } catch (e) {}
    }

    // 8) Alertas cross-módulo (Panel) — sin duplicar las de inventario/consumo (ya arriba)
    if (typeof pnGetActiveAlerts === 'function') {
        try {
            pnGetActiveAlerts().forEach(function(a, ai) {
                if (a.source === 'Inventario' || a.source === 'Consumo' || a.source === 'Mantenimiento' || a.source === 'Proyectos') return;
                var cat = a.source === 'Test Plan' ? 'plan' : a.source === 'CoP SPC' ? 'calidad' : null;
                if (a.source === 'COP15') { if (a.level !== 'CRITICA') return; cat = 'calidad'; }
                if (!cat) return;
                acts.push({ id: 'act-al-' + ai, cat: cat, icon: '🚨', title: a.message, meta: a.source,
                    status: a.level === 'CRITICA' ? 'atrasado' : 'pendiente',
                    urgency: a.level === 'CRITICA' ? 3 : 2,
                    action: { label: 'Revisar', js: a.source === 'Test Plan' ? "switchPlatform('testplan')" : a.source === 'CoP SPC' ? "switchPlatform('cop')" : "switchPlatform('panel');if(typeof pnSwitchTab==='function')pnSwitchTab('pn-alerts');" } });
            });
        } catch (e) {}
    }

    // 9) Tareas manuales (pnState.tasks, sincronizadas entre dispositivos)
    if (typeof pnState !== 'undefined' && pnState.tasks) {
        pnState.tasks.filter(function(t) { return !t.deleted; }).forEach(function(t) {
            var late = !t.done && t.due && t.due < hoy;
            acts.push({ id: 'act-task-' + t.id, cat: DASH_CATS[t.cat] ? t.cat : 'manuales', icon: '📝',
                title: t.title,
                meta: (t.assignee ? '👤 ' + t.assignee : '') + (t.due ? (t.assignee ? ' · ' : '') + '📅 ' + t.due : '') + (t.done && t.doneAt ? ' · ✓ ' + new Date(t.doneAt).toLocaleDateString('es-MX') : ''),
                status: t.done ? 'hecho' : late ? 'atrasado' : 'pendiente',
                urgency: late ? 3 : t.done ? 0 : 1,
                assignee: t.assignee || '',
                checkbox: { js: "pnTaskToggle('" + t.id + "')", checked: !!t.done },
                // v16.8: promover una tarea suelta a paso de un proyecto (solo si
                // hay proyectos activos y la tarea sigue abierta)
                action2: (!t.done && typeof pnProjectPickerOptions === 'function' && pnProjectPickerOptions(''))
                    ? { label: '🗂️', aria: 'Mover a un proyecto: ' + t.title, js: "pnPromoteTaskToProject('" + t.id + "')", ghost: true } : null,
                action: { label: '🗑', aria: 'Eliminar actividad: ' + t.title, js: "pnTaskDelete('" + t.id + "')", ghost: true } });
        });
    }

    return acts;
}

function dashRenderRow(a) {
    var h = '<div class="dash-row dash-row--' + a.status + '">';
    if (a.checkbox) {
        h += '<input type="checkbox" class="dash-row-check" aria-label="Marcar completada: ' + escapeHtml(a.title) + '" ' + (a.checkbox.checked ? 'checked' : '') + ' onchange="' + a.checkbox.js + '">';
    } else {
        h += '<span class="dash-row-icon">' + a.icon + '</span>';
    }
    h += '<div class="dash-row-main">';
    h += '<div class="dash-row-title">' + escapeHtml(a.title) + '</div>';
    var metaBits = [];
    if (a.meta) metaBits.push(escapeHtml(a.meta));
    if (a.assignee && (!a.meta || a.meta.indexOf(a.assignee) === -1)) metaBits.push('👤 ' + escapeHtml(a.assignee));
    if (metaBits.length) h += '<div class="dash-row-meta">' + metaBits.join(' · ') + '</div>';
    if (a.stage) {
        h += '<div class="dash-stepper" title="Etapa ' + a.stage.index + ' de ' + a.stage.total + ': ' + a.stage.label + '">';
        for (var s = 1; s <= a.stage.total; s++) {
            h += '<span class="dash-step' + (s < a.stage.index || a.stage.done ? ' done' : s === a.stage.index ? ' now' : '') + '"></span>';
        }
        h += '<span class="dash-stepper-label">' + a.stage.index + '/' + a.stage.total + ' · ' + a.stage.label + '</span></div>';
    }
    if (a.progress && a.progress.total) {
        var ppct = Math.round((a.progress.done / a.progress.total) * 100);
        h += '<div class="daily-dash-week-bar" style="max-width:180px;margin-top:4px;"><div class="daily-dash-week-fill" style="width:' + ppct + '%"></div></div>';
    }
    h += '</div>';
    h += '<div class="dash-row-side">';
    if (a.eta) {
        var etaD = new Date(a.eta.date + 'T12:00:00');
        h += '<span class="dash-eta dash-eta--' + a.eta.tone + '" role="button" tabindex="0" onclick="dashEtaEdit(' + a.vehicleId + ', this, event)" ' +
             'title="Liberación esperada (' + (a.eta.source === 'manual' ? 'fijada manualmente' : 'estimada') + ') — toca para fijar/cambiar" ' +
             'aria-label="Liberación esperada ' + (a.eta.source === 'manual' ? 'fijada manualmente' : 'estimada') + ', toca para cambiar">' +
             '📅 ' + etaD.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + (a.eta.source === 'manual' ? ' ✎' : '') + '</span>';
    }
    h += '<span class="dash-chip dash-chip--' + a.status + '">' + (DASH_STATUS_LABEL[a.status] || a.status) + '</span>';
    // v16.8: action2 = acción secundaria opcional (hoy: mover una tarea a un proyecto)
    if (a.action2) h += '<button class="dash-row-action' + (a.action2.ghost ? ' dash-row-action--ghost' : '') + '" title="' + escapeHtml(a.action2.aria || a.action2.label) + '" aria-label="' + escapeHtml(a.action2.aria || a.action2.label) + '" onclick="event.stopPropagation();' + a.action2.js + '">' + a.action2.label + '</button>';
    if (a.action) h += '<button class="dash-row-action' + (a.action.ghost ? ' dash-row-action--ghost' : '') + '" aria-label="' + escapeHtml(a.action.aria || a.action.label) + '" onclick="event.stopPropagation();' + a.action.js + '">' + a.action.label + '</button>';
    h += '</div></div>';
    return h;
}

function dashRenderBoard(acts, currentOp) {
    var onlyMine = !!window._dashOnlyMine;
    var shown = (onlyMine && currentOp)
        ? acts.filter(function(a) { return !a.assignee || a.assignee === currentOp; })
        : acts;
    var pend = shown.filter(function(a) { return a.status !== 'hecho'; }).length;

    var h = '<div class="dash-board">';
    h += '<div class="dash-board-header" data-help="dash-board-help">';
    h += '<span class="dash-board-title">📌 Actividades de hoy</span>';
    h += '<span class="dash-chip dash-chip--' + (pend ? 'pendiente' : 'hecho') + '">' + (pend ? pend + ' pendientes' : 'al día ✓') + '</span>';
    h += '<span style="flex:1"></span>';
    if (currentOp) h += '<label class="dash-board-toggle"><input type="checkbox" ' + (onlyMine ? 'checked' : '') + ' onchange="window._dashOnlyMine=this.checked;dailyDashRender();"> Solo míos</label>';
    h += '<button class="dash-row-action" onclick="dashTaskModalOpen()">➕ Actividad</button>';
    h += '</div>';

    DASH_CAT_ORDER.forEach(function(cat) {
        var rows = shown.filter(function(a) { return a.cat === cat; });
        if (!rows.length) return;
        rows.sort(function(x, y) {
            return ((x.status === 'hecho' ? 1 : 0) - (y.status === 'hecho' ? 1 : 0)) || (y.urgency - x.urgency);
        });
        var c = DASH_CATS[cat];
        var pendN = rows.filter(function(a) { return a.status !== 'hecho'; }).length;
        h += '<details class="dash-group dash-group--' + cat + '" open>';
        h += '<summary><span class="dash-group-icon">' + c.icon + '</span><span class="dash-group-name">' + c.label + '</span>' +
             '<span class="dash-group-count' + (pendN ? '' : ' ok') + '">' + (pendN ? pendN + ' pendiente' + (pendN === 1 ? '' : 's') : '✓ al día') + '</span></summary>';
        // v16.5: <details> no aplica display:grid a su contenido (el navegador lo envuelve
        // internamente) — el grid de 2 columnas en desktop necesita un contenedor propio.
        h += '<div class="dash-group-rows">';
        rows.forEach(function(a) { h += dashRenderRow(a); });
        h += '</div></details>';
    });
    if (!shown.length) h += '<div class="daily-dash-empty">Sin actividades. ¡Todo en orden! 👍</div>';
    h += '</div>';
    return h;
}

// ETA de liberación: fijar/cambiar manualmente desde la fila (auditado)
function dashEtaEdit(vehicleId, el, ev) {
    if (ev) ev.stopPropagation();
    if (el.querySelector('input')) return;
    var v = (db.vehicles || []).find(function(x) { return x.id == vehicleId; });
    var cur = v && v.expectedReleaseAt ? v.expectedReleaseAt : '';
    el.innerHTML = '📅 <input type="date" aria-label="Fecha estimada de liberación" value="' + cur + '" onclick="event.stopPropagation()" ' +
                   'onchange="dashSetExpectedRelease(' + vehicleId + ', this.value)" ' +
                   'style="font-size: var(--fs-sm);border:1px solid var(--border);border-radius:4px;padding:1px 3px;">';
    var inp = el.querySelector('input');
    if (inp && inp.showPicker) { try { inp.showPicker(); } catch (e) {} }
}

function dashSetExpectedRelease(vehicleId, dateStr) {
    var v = (db.vehicles || []).find(function(x) { return x.id == vehicleId; });
    if (!v) return;
    var prev = v.expectedReleaseAt || '(auto)';
    if (dateStr) v.expectedReleaseAt = dateStr; else delete v.expectedReleaseAt;
    if (typeof auditLog === 'function') auditLog('cop15', 'expected_release_set', { type: 'vehicle', id: v.id, label: v.vin }, prev + ' → ' + (dateStr || '(auto)'));
    saveDB();
    dailyDashRender();
}

// ── Mini-modal "➕ Actividad" (tareas manuales → pnState.tasks) ──
function dashTaskModalOpen() {
    if (document.getElementById('dash-task-modal')) return;
    var ops = (typeof pnState !== 'undefined' && pnState.operators)
        ? pnState.operators.filter(function(o) { return o.active !== false && !o.deleted; }) : [];
    var html = '<div class="dash-task-overlay" id="dash-task-modal" onclick="if(event.target===this)dashTaskModalClose()">';
    html += '<div class="dash-task-box">';
    html += '<div style="font-weight:800;font-size:14px;margin-bottom:10px;">➕ Nueva actividad</div>';
    html += '<label class="dash-task-field">Título<input type="text" id="dash-task-title" placeholder="p.ej. Pedir gas de calibración CO/N2"></label>';
    // v16.8: si el pendiente pertenece a un proyecto, nace ahí en vez de quedar
    // como tarea suelta — es lo que pidió el usuario ("doy de alta algo nuevo
    // desde HOY y se registra en el proyecto"). Sin proyectos activos, ni se muestra.
    var projOpts = (typeof pnProjectPickerOptions === 'function') ? pnProjectPickerOptions('') : '';
    if (projOpts) {
        html += '<label class="dash-task-field" data-help="dash-task-project">Proyecto' +
                '<select id="dash-task-project" onchange="dashTaskProjectChanged()">' +
                '<option value="">— ninguno (tarea suelta) —</option>' + projOpts + '</select></label>';
    }
    html += '<label class="dash-task-field" id="dash-task-cat-wrap">Categoría<select id="dash-task-cat">' +
            DASH_CAT_ORDER.map(function(c) { return '<option value="' + c + '"' + (c === 'manuales' ? ' selected' : '') + '>' + DASH_CATS[c].label + '</option>'; }).join('') + '</select></label>';
    html += '<label class="dash-task-field">Responsable<select id="dash-task-assignee"><option value="">— sin asignar —</option>' +
            ops.map(function(o) { return '<option>' + escapeHtml(o.name) + '</option>'; }).join('') + '</select></label>';
    html += '<label class="dash-task-field">Fecha límite<input type="date" id="dash-task-due"></label>';
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">';
    html += '<button class="btn btn-ghost" onclick="dashTaskModalClose()">Cancelar</button>';
    html += '<button class="btn" style="background:var(--accent-cascade);color:#fff;font-weight:700;" onclick="dashTaskModalSave()">Guardar</button></div>';
    html += '</div></div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstChild);
    if (typeof cascadeInjectTooltips === 'function') cascadeInjectTooltips();
    var box = document.getElementById('dash-task-modal');
    if (typeof a11yDialog === 'function' && box) {
        window._dashTaskA11yClose = a11yDialog(box, { onClose: function () {
            var m = document.getElementById('dash-task-modal');
            if (m) m.remove();
        }});
    } else {
        var t = document.getElementById('dash-task-title');
        if (t) t.focus();
    }
}
function dashTaskModalClose() {
    if (window._dashTaskA11yClose) {
        var fn = window._dashTaskA11yClose;
        window._dashTaskA11yClose = null;
        fn();
    } else {
        var m = document.getElementById('dash-task-modal');
        if (m) m.remove();
    }
}

// Al elegir proyecto, la categoría deja de aplicar (el paso vive en el
// proyecto, no en una categoría del tablero) — se oculta para no confundir.
function dashTaskProjectChanged() {
    var sel = document.getElementById('dash-task-project');
    var wrap = document.getElementById('dash-task-cat-wrap');
    if (wrap) wrap.style.display = (sel && sel.value) ? 'none' : '';
}

function dashTaskModalSave() {
    var title = (document.getElementById('dash-task-title') || {}).value || '';
    var assignee = (document.getElementById('dash-task-assignee') || {}).value || '';
    var due = (document.getElementById('dash-task-due') || {}).value || '';
    var projectId = (document.getElementById('dash-task-project') || {}).value || '';

    // v16.8: con proyecto elegido, el pendiente nace como paso del proyecto.
    if (projectId && typeof pnProjectStepAddQuick === 'function') {
        var step = pnProjectStepAddQuick(projectId, { title: title, responsible: assignee, targetDate: due });
        if (!step) { if (typeof showToast === 'function') showToast('Escribe un título para la actividad', 'warning'); return; }
        dashTaskModalClose();
        if (typeof showToast === 'function') showToast('Registrada en el proyecto', 'success');
        dailyDashRender();
        return;
    }

    if (typeof pnTaskAdd !== 'function') return;
    var task = pnTaskAdd({
        title: title,
        cat: (document.getElementById('dash-task-cat') || {}).value || 'manuales',
        assignee: assignee,
        due: due
    });
    if (task) {
        dashTaskModalClose();
        if (typeof showToast === 'function') showToast('Actividad creada', 'success');
        dailyDashRender();
    }
}

// Refresco vivo del tablero: data:saved (saveDB/invSave) con debounce + tick de 60 s
// (solo mientras HOY está visible — el countdown fino de soak vive en el badge global)
var _dashRefreshT = null;
window.addEventListener('data:saved', function() {
    var sec = document.getElementById('platform-today');
    if (!sec || !sec.classList.contains('active')) return;
    clearTimeout(_dashRefreshT);
    _dashRefreshT = setTimeout(function() { try { dailyDashRender(); } catch (e) {} }, 400);
});
setInterval(function() {
    var sec = document.getElementById('platform-today');
    if (sec && sec.classList.contains('active')) { try { dailyDashRender(); } catch (e) {} }
}, 60000);

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [M17] VEHICLE INLINE CHECKLIST                                     ║
// ╚══════════════════════════════════════════════════════════════════════╝

var _vclOpen = false;

/** Field definitions for the checklist — grouped by section */
var VCL_FIELDS = [
    { section: 'Recepción', items: [
        { label: 'Operador', path: 'testData.operator', fieldId: 'op_recep' },
        { label: 'Odómetro', path: 'testData.odometer', fieldId: 'op_odo' },
        { label: 'Fecha Recepción', path: 'testData.datetime', fieldId: 'op_datetime' },
        { label: 'Tipo Combustible', path: 'testData.preconditioning.fuelTypeIn', fieldId: 'fuel_typein' },
        { label: 'Nivel Combustible', path: 'testData.preconditioning.fuelLevelIn', fieldId: 'fuel_levelin' },
        { label: 'Presión Llantas', path: 'testData.preconditioning.tirePressurePsi', fieldId: 'tire_pressure_in' }
    ]},
    { section: 'Preacondicionamiento', items: [
        { label: 'Responsable', path: 'testData.preconditioning.responsible', fieldId: 'precond_responsible' },
        { label: 'Fecha Preacond.', path: 'testData.preconditioning.datetime', fieldId: 'precond_datetime' },
        { label: 'Combustible Prueba', path: 'testData.preconditioning.fuelTypeTest', fieldId: 'fuel_typepre' },
        { label: 'Nivel (L)', path: 'testData.preconditioning.fuelLevelPre', fieldId: 'fuel_levelpre' },
        { label: 'Ciclo', path: 'testData.preconditioning.cycle', fieldId: 'precond_cycle' },
        { label: 'Cumple Preacond.', path: 'testData.preconditioning.ok', fieldId: 'precond_ok' }
    ]},
    { section: 'Dinamómetro', items: [
        { label: 'ETW', path: 'testData.etw', fieldId: 'etw' },
        { label: 'Target A', path: 'testData.tA', fieldId: 'tA' },
        { label: 'Target B', path: 'testData.tB', fieldId: 'tB' },
        { label: 'Target C', path: 'testData.tC', fieldId: 'tC' },
        { label: 'Dyno A', path: 'testData.dA', fieldId: 'dA' },
        { label: 'Dyno B', path: 'testData.dB', fieldId: 'dB' },
        { label: 'Dyno C', path: 'testData.dC', fieldId: 'dC' }
    ]},
    { section: 'Verificación Prueba', items: [
        { label: 'Túnel', path: 'testData.testVerification.tunnel', fieldId: 'test_tunnel' },
        { label: 'Dinamómetro On', path: 'testData.testVerification.dyno', fieldId: 'test_dyno_on' },
        { label: 'Ventilador', path: 'testData.testVerification.fanMode', fieldId: 'test_fan_mode' },
        { label: 'Inercia OK', path: 'testData.testVerification.inertiaOk', fieldId: 'test_inertia_ok' },
        { label: 'Cadenas', path: 'testData.testVerification.chains', fieldId: 'test_chains' },
        { label: 'Eslingas', path: 'testData.testVerification.slings', fieldId: 'test_slings' }
    ]}
];

/** Get nested value from object by dot-separated path */
function _vclGetPath(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
        if (cur === undefined || cur === null) return undefined;
        cur = cur[parts[i]];
    }
    return cur;
}

/** Toggle checklist panel visibility */
function vclTogglePanel() {
    _vclOpen = !_vclOpen;
    var panel = document.getElementById('vcl-panel');
    if (panel) panel.style.display = _vclOpen ? 'block' : 'none';
    if (_vclOpen) vclRender();
}

/** Update checklist visibility (show only when vehicle loaded in COP15) */
function vclUpdate() {
    var toggle = document.getElementById('vcl-toggle');
    if (!toggle) return;

    var show = _currentPlatform === 'cop15' && typeof activeVehicleId !== 'undefined' && activeVehicleId;
    if (show) {
        var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
        if (!vehicle || !isEmissionsPurpose(vehicle.purpose)) show = false;
    }

    toggle.style.display = show ? 'flex' : 'none';
    if (!show && _vclOpen) {
        _vclOpen = false;
        var panel = document.getElementById('vcl-panel');
        if (panel) panel.style.display = 'none';
    }

    if (show) vclUpdateBadge();
}

/** Update the badge count (missing fields) */
function vclUpdateBadge() {
    var badge = document.getElementById('vcl-badge-count');
    if (!badge) return;
    var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle) return;

    var missing = 0;
    VCL_FIELDS.forEach(function(section) {
        section.items.forEach(function(item) {
            var val = _vclGetPath(vehicle, item.path);
            if (val === undefined || val === null || val === '') missing++;
        });
    });
    badge.textContent = missing;
    badge.style.display = missing > 0 ? 'block' : 'none';
}

/** Render checklist panel content */
function vclRender() {
    var panel = document.getElementById('vcl-panel');
    if (!panel || !activeVehicleId) return;

    var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle) { panel.innerHTML = ''; return; }

    var totalFields = 0, filledFields = 0;
    VCL_FIELDS.forEach(function(s) {
        s.items.forEach(function(item) {
            totalFields++;
            var val = _vclGetPath(vehicle, item.path);
            if (val !== undefined && val !== null && val !== '') filledFields++;
        });
    });

    var pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
    var model = vehicle.config ? (vehicle.config.Modelo || '') : '';
    var vinShort = vehicle.vin ? '...' + vehicle.vin.slice(-4) : '';

    var html = '';
    html += '<div class="vcl-panel-header">';
    html += '<div class="vcl-panel-title">' + model + ' ' + vinShort + '</div>';
    html += '<div class="vcl-panel-pct">' + filledFields + '/' + totalFields + ' (' + pct + '%)</div>';
    html += '</div>';
    html += '<div class="vcl-progress"><div class="vcl-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="vcl-list">';

    VCL_FIELDS.forEach(function(section) {
        html += '<div class="vcl-section-title">' + section.section + '</div>';
        section.items.forEach(function(item) {
            var val = _vclGetPath(vehicle, item.path);
            var filled = val !== undefined && val !== null && val !== '';
            var cls = filled ? 'vcl-item vcl-item-done' : 'vcl-item vcl-item-missing';
            var icon = filled ? '✓' : '✗';

            html += '<div class="' + cls + '" onclick="vclGoToField(\'' + item.fieldId + '\')">';
            html += '<div class="vcl-item-icon">' + icon + '</div>';
            html += '<span>' + item.label + '</span>';
            if (filled) html += '<span style="margin-left:auto;font-size: var(--fs-xs);color:var(--muted);max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + val + '</span>';
            html += '</div>';
        });
    });

    html += '</div>';
    panel.innerHTML = html;
}

/** Navigate to a field from the checklist */
function vclGoToField(fieldId) {
    // Ensure we're on the operation tab
    var tab = document.querySelector('.tab[data-tab="seguimiento"]');
    if (tab && !tab.classList.contains('active')) tab.click();

    setTimeout(function() {
        var field = document.getElementById(fieldId);
        if (!field) return;

        // Open parent accordion if closed
        var acc = field.closest('details.acc');
        if (acc && !acc.open) acc.open = true;

        setTimeout(function() {
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Flash highlight
            field.style.transition = 'box-shadow 0.3s';
            field.style.boxShadow = '0 0 0 3px rgba(187,22,43,0.3)';
            setTimeout(function() { field.style.boxShadow = ''; }, 1500);
            field.focus();
        }, 100);
    }, 50);

    // Close panel on mobile
    if (window.innerWidth < 768) {
        _vclOpen = false;
        var panel = document.getElementById('vcl-panel');
        if (panel) panel.style.display = 'none';
    }
}

// ── Global VIN Search ──
function _globalSearchEscHandler(e) {
    if (e.key === 'Escape') toggleGlobalSearch();
}
function toggleGlobalSearch() {
    var bar = document.getElementById('globalSearchBar');
    if (!bar) return;
    var visible = bar.style.display !== 'none';
    bar.style.display = visible ? 'none' : 'block';
    if (!visible) {
        var inp = document.getElementById('globalVinInput');
        if (inp) { inp.value = ''; inp.focus(); }
        var res = document.getElementById('globalSearchResults');
        if (res) res.innerHTML = '';
        document.addEventListener('keydown', _globalSearchEscHandler);
    } else {
        document.removeEventListener('keydown', _globalSearchEscHandler);
    }
}

function globalVinSearch(query) {
    var res = document.getElementById('globalSearchResults');
    if (!res) return;
    if (!query || query.length < 3) { res.innerHTML = ''; return; }

    var q = query.toUpperCase();
    var results = [];

    // Search COP15 vehicles
    (db.vehicles || []).forEach(function(v) {
        if ((v.vin || '').toUpperCase().includes(q)) {
            results.push({
                module: 'COP15',
                icon: '🚗',
                vin: v.vin,
                detail: (v.config && v.config['Modelo'] ? v.config['Modelo'] + ' — ' : '') + (CONFIG.statusLabels[v.status] || v.status),
                date: v.registeredAt ? new Date(v.registeredAt).toLocaleDateString('es-MX') : '',
                action: 'switchPlatform("cop15")'
            });
        }
    });

    // Search Test Plan tested list
    if (typeof tpState !== 'undefined' && tpState.testedList) {
        var seenTP = {};
        tpState.testedList.forEach(function(t) {
            var note = t.note || '';
            var vinMatch = note.match(/VIN:\s*(\S+)/i);
            if (vinMatch) {
                var tVin = vinMatch[1].toUpperCase();
                if (tVin.includes(q) && !seenTP[tVin]) {
                    seenTP[tVin] = true;
                    results.push({
                        module: 'Test Plan',
                        icon: '📋',
                        vin: tVin,
                        detail: t.configText ? t.configText.substring(0, 40) + '...' : '',
                        date: t.date || '',
                        action: 'switchPlatform("testplan")'
                    });
                }
            }
        });
    }

    // ═══ [R4-M4] Cross-module search: Inventory gases + equipment ═══
    if (typeof invState !== 'undefined') {
        (invState.gases || []).forEach(function(g) {
            var searchStr = ((g.controlNo || '') + ' ' + (g.formula || '') + ' ' + (g.gasType || '') + ' ' + (g.concNominal || '')).toUpperCase();
            if (searchStr.includes(q)) {
                results.push({
                    module: 'Inventario',
                    icon: '🧪',
                    vin: g.formula + ' ' + (g.concNominal || '') + ' #' + (g.controlNo || ''),
                    detail: 'Zona: ' + (g.zone || '—') + ' | PSI: ' + (g.readings && g.readings.length > 0 ? g.readings[g.readings.length-1].psi : '—'),
                    date: g.validUntil || '',
                    action: 'switchPlatform("inventory")'
                });
            }
        });
        (invState.equipment || []).forEach(function(e) {
            var searchStr = ((e.name || '') + ' ' + (e.serialNo || '') + ' ' + (e.kmmId || '')).toUpperCase();
            if (searchStr.includes(q)) {
                results.push({
                    module: 'Inventario',
                    icon: '🔧',
                    vin: e.name || 'Equipo',
                    detail: 'S/N: ' + (e.serialNo || '—') + ' | KMM: ' + (e.kmmId || '—'),
                    date: e.nextCalDate || '',
                    action: 'switchPlatform("inventory")'
                });
            }
        });
    }

    // [R4-M4] Also search COP15 by configCode and model
    (db.vehicles || []).forEach(function(v) {
        var configStr = ((v.configCode || '') + ' ' + (v.config && v.config['Modelo'] ? v.config['Modelo'] : '')).toUpperCase();
        if (configStr.includes(q) && !(v.vin || '').toUpperCase().includes(q)) {
            results.push({
                module: 'COP15',
                icon: '🚗',
                vin: v.configCode || v.vin || '?',
                detail: (v.config && v.config['Modelo'] ? v.config['Modelo'] + ' — ' : '') + (CONFIG.statusLabels[v.status] || v.status),
                date: v.registeredAt ? new Date(v.registeredAt).toLocaleDateString('es-MX') : '',
                action: 'switchPlatform("cop15")'
            });
        }
    });

    if (results.length === 0) {
        res.innerHTML = '<div style="padding:12px;background:var(--kia-dark);border:1px solid var(--border-strong);border-radius:0 0 8px 8px;color:#94a3b8;font-size:0.85rem;text-align:center;">No se encontraron resultados para "' + escapeHtml(query) + '"</div>';
        return;
    }

    var html = '<div style="background:var(--kia-dark);border:1px solid var(--border-strong);border-radius:0 0 8px 8px;overflow:hidden;">';
    results.slice(0, 15).forEach(function(r) {
        html += '<div onclick="' + r.action + ';toggleGlobalSearch();" style="padding:10px 14px;border-bottom:1px solid #000;cursor:pointer;display:flex;align-items:center;gap:10px;" onmouseover="this.style.background=\'#334155\'" onmouseout="this.style.background=\'transparent\'">';
        html += '<span style="font-size:16px;">' + r.icon + '</span>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:0.85rem;font-weight:600;color:#f1f5f9;">' + escapeHtml(r.vin) + '</div>';
        html += '<div style="font-size:0.75rem;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(r.detail) + '</div>';
        html += '</div>';
        html += '<div style="text-align:right;">';
        html += '<span style="font-size:0.65rem;padding:2px 6px;border-radius:4px;background:rgba(99,102,241,0.15);color:#a5b4fc;">' + escapeHtml(r.module) + '</span>';
        if (r.date) html += '<div style="font-size:0.65rem;color:#94a3b8;margin-top:2px;">' + escapeHtml(r.date) + '</div>';
        html += '</div></div>';
    });
    if (results.length > 15) {
        html += '<div style="padding:8px;text-align:center;font-size:0.75rem;color:#94a3b8;">...y ' + (results.length - 15) + ' más</div>';
    }
    html += '</div>';
    res.innerHTML = html;
}

// [R3-M3] Debounced version for input events
var _debouncedGlobalVinSearch = debounce(function(val) { globalVinSearch(val); }, 250);

// ── Weekly Status PDF Report ──
function generateWeeklyStatusPDF(opts) {
    if (typeof window.jspdf === 'undefined') {
        if (!(opts && opts.silent) && typeof showToast === 'function') showToast('jsPDF no esta disponible. Verifica la conexion CDN.', 'error');
        return;
    }
    if (!(opts && opts.silent)) showOverlayLoading('Generando PDF semanal...');
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    var W = doc.internal.pageSize.getWidth();
    var ML = 15, MR = 15, CW = W - ML - MR;
    var y = 15;
    var today = new Date();
    var weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    var weekAgoISO = weekAgo.toISOString();

    // Helper functions
    function setF(style, size) { doc.setFontSize(size); doc.setFont('helvetica', style); }
    function addSection(title, yPos) {
        doc.setDrawColor(187, 22, 43);
        doc.setFillColor(187, 22, 43);
        doc.rect(ML, yPos, CW, 7, 'F');
        setF('bold', 11);
        doc.setTextColor(255, 255, 255);
        doc.text(title, ML + 3, yPos + 5);
        doc.setTextColor(0, 0, 0);
        return yPos + 10;
    }
    function addRow(label, value, yPos, color) {
        setF('normal', 9);
        doc.setTextColor(80, 80, 80);
        doc.text(label, ML + 3, yPos);
        setF('bold', 9);
        if (color) doc.setTextColor(color[0], color[1], color[2]);
        else doc.setTextColor(0, 0, 0);
        doc.text(String(value), ML + CW / 2, yPos);
        doc.setTextColor(0, 0, 0);
        return yPos + 5;
    }

    // Header
    setF('bold', 16);
    doc.setTextColor(187, 22, 43);
    doc.text('KIA Laboratorio de Emisiones', ML, y);
    y += 6;
    setF('normal', 10);
    doc.setTextColor(100, 100, 100);
    doc.text('Reporte Semanal — ' + today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), ML, y);
    y += 3;
    doc.setDrawColor(187, 22, 43);
    doc.setLineWidth(0.5);
    doc.line(ML, y, ML + CW, y);
    y += 8;

    // ── Section 1: COP15 Pipeline ──
    y = addSection('COP15 — Pipeline de Vehículos', y);
    var statuses = ['registered', 'in-progress', 'testing', 'ready-release'];
    statuses.forEach(function(s) {
        var count = (db.vehicles || []).filter(function(v) { return v.status === s; }).length;
        y = addRow(CONFIG.statusLabels[s] || s, count, y);
    });
    var archivedThisWeek = (db.vehicles || []).filter(function(v) {
        return v.status === 'archived' && v.archivedAt && v.archivedAt >= weekAgoISO;
    }).length;
    y = addRow('Liberados esta semana', archivedThisWeek, y, [16, 185, 129]);
    y += 5;

    // ── Section 2: Test Plan ──
    y = addSection('Test Plan — Progreso', y);
    try {
        var analysis = typeof tpGetAnalysis === 'function' ? tpGetAnalysis() : [];
        var totalReq = analysis.reduce(function(s, a) { return s + a.required; }, 0);
        var totalTested = analysis.reduce(function(s, a) { return s + a.testedN; }, 0);
        var deficit = Math.max(0, totalReq - totalTested);
        y = addRow('Pruebas requeridas', totalReq, y);
        y = addRow('Probadas', totalTested, y, [16, 185, 129]);
        y = addRow('Déficit', deficit, y, deficit > 0 ? [239, 68, 68] : [16, 185, 129]);
        // v16.2: misma definición de cobertura que el badge del Plan y la tarjeta HOY
        // (% de configs vigentes al día) — antes cada superficie mostraba un número distinto.
        if (typeof tpCoverageSummary === 'function') {
            var cov = tpCoverageSummary();
            y = addRow('Cobertura (configs al día)', cov.pct + '%', y, cov.pct >= 80 ? [16, 185, 129] : cov.pct >= 50 ? [245, 158, 11] : [239, 68, 68]);
        }

        // Active weekly plan completion
        var plans = (typeof tpState !== 'undefined' && tpState.weeklyPlans) ? tpState.weeklyPlans : [];
        if (plans.length > 0) {
            var latest = plans[plans.length - 1];
            var done = latest.items ? latest.items.filter(function(i) { return i.completed; }).length : 0;
            var total = latest.items ? latest.items.length : 0;
            var pct = total > 0 ? Math.round(done / total * 100) : 0;
            y = addRow('Plan semanal activo', done + '/' + total + ' (' + pct + '%)', y);
            var subs = latest.items ? latest.items.filter(function(i) { return i.substituted; }).length : 0;
            if (subs > 0) y = addRow('Sustituciones', subs, y, [245, 158, 11]);
        }

        var testedThisWeek = (typeof tpState !== 'undefined' && tpState.testedList) ?
            tpState.testedList.filter(function(t) { return t.date && t.date >= weekAgoISO.slice(0, 10); }).length : 0;
        y = addRow('Probados esta semana', testedThisWeek, y);
    } catch (e) { y = addRow('Error cargando datos', e.message, y, [239, 68, 68]); }
    y += 5;

    // ── Section 3: Inventario ──
    y = addSection('Inventario — Alertas', y);
    try {
        var gases = (typeof invState !== 'undefined' && invState.gases) ? invState.gases : [];
        var equip = (typeof invState !== 'undefined' && invState.equipment) ? invState.equipment : [];

        var lowGas = gases.filter(function(g) {
            if (!g.readings || g.readings.length === 0 || g.status !== 'In use') return false;
            return g.readings[g.readings.length - 1].psi < 500;
        }).length;
        var expiredGas = gases.filter(function(g) {
            return g.validUntil && new Date(g.validUntil) < today;
        }).length;
        var calExpired = equip.filter(function(e) {
            return e.nextCalDate && new Date(e.nextCalDate) < today;
        }).length;
        var calWarning = equip.filter(function(e) {
            if (!e.nextCalDate) return false;
            var diff = (new Date(e.nextCalDate) - today) / (1000 * 60 * 60 * 24);
            return diff > 0 && diff < 7;
        }).length;

        y = addRow('Cilindros con presión baja (<500 psi)', lowGas, y, lowGas > 0 ? [239, 68, 68] : [16, 185, 129]);
        y = addRow('Gases vencidos', expiredGas, y, expiredGas > 0 ? [239, 68, 68] : [16, 185, 129]);
        y = addRow('Equipos calibración vencida', calExpired, y, calExpired > 0 ? [239, 68, 68] : [16, 185, 129]);
        y = addRow('Equipos cal. próxima a vencer (<7d)', calWarning, y, calWarning > 0 ? [245, 158, 11] : [16, 185, 129]);
    } catch (e) { y = addRow('Error', e.message, y, [239, 68, 68]); }

    // ═══ [R4-M3] Embed chart images if available ═══
    var chartsToEmbed = [
        { instance: '_tpBurndownChart', title: 'Burndown - Test Plan' },
        { instance: '_raComplianceChart', title: 'Compliance Rate - Resultados' },
        { instance: '_raTrendChart', title: 'Trend Analysis - Resultados' },
        { instance: '_invChartInstance', title: 'Consumo - Inventario' }
    ];
    var embeddedAny = false;
    chartsToEmbed.forEach(function(ch) {
        try {
            var chart = window[ch.instance];
            if (!chart || typeof chart.toBase64Image !== 'function') return;
            if (y > PH - 80) { doc.addPage(); y = 20; }
            if (!embeddedAny) {
                y += 5;
                setF('bold', 11); doc.setTextColor(5, 20, 31);
                doc.text('Graficos', ML, y); y += 3;
                doc.setDrawColor(239, 68, 68); doc.setLineWidth(0.5);
                doc.line(ML, y, ML + CW, y); y += 5;
                embeddedAny = true;
            }
            setF('normal', 9); doc.setTextColor(80);
            doc.text(ch.title, ML, y); y += 3;
            var img = chart.toBase64Image('image/png', 1);
            var imgH = 45;
            if (y + imgH > PH - 20) { doc.addPage(); y = 20; }
            doc.addImage(img, 'PNG', ML, y, CW, imgH);
            y += imgH + 5;
        } catch(e) { /* skip chart if error */ }
    });

    // Footer
    if (y > PH - 20) { doc.addPage(); y = 20; }
    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(ML, y, ML + CW, y);
    y += 5;
    setF('italic', 8);
    doc.setTextColor(150, 150, 150);
    doc.text('Generado automáticamente por KIA EmLab Plataforma Integrada — ' + today.toISOString(), ML, y);

    if (opts && opts.returnBase64) {
        if (!(opts && opts.silent)) hideOverlayLoading();
        // jsPDF 2.5.x: 'base64' is not a valid output type — use datauristring + strip prefix.
        var _dataUri = doc.output('datauristring');
        return (typeof _dataUri === 'string' && _dataUri.indexOf(',') >= 0)
            ? _dataUri.split(',')[1]
            : '';
    }
    doc.save('KIA-EmLab-Semanal-' + localDateStr(today) + '.pdf');
    hideOverlayLoading();
    showToast('Reporte PDF semanal generado', 'success');
}

// ── Swipe Navigation ──
// High threshold (150px) + must be decisively horizontal to prevent accidental swipes
(function() {
    var _swStartX = 0, _swStartY = 0, _swStartTime = 0, _swTracking = false;

    document.addEventListener('touchstart', function(e) {
        // Don't track swipes starting on inputs, selects, textareas, canvas, or buttons
        var tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'CANVAS' || tag === 'BUTTON') return;
        // Don't track if inside a modal
        if (e.target.closest('#configModal, #invModal, #fbModal, .modal-overlay')) return;
        // Don't track if inside horizontal scrollable areas (tabs)
        if (e.target.closest('.tp-tabs, .tabs')) return;

        _swStartX = e.touches[0].clientX;
        _swStartY = e.touches[0].clientY;
        _swStartTime = Date.now();
        _swTracking = true;
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (!_swTracking) return;
        _swTracking = false;

        var dx = e.changedTouches[0].clientX - _swStartX;
        var dy = e.changedTouches[0].clientY - _swStartY;
        var dt = Date.now() - _swStartTime;

        var absDx = Math.abs(dx);
        var absDy = Math.abs(dy);

        // Requirements for a valid swipe:
        // 1. At least 150px horizontal distance (decisivo)
        // 2. Horizontal distance must be at least 3x the vertical (clearly horizontal)
        // 3. Must complete within 600ms (not a slow drag)
        if (absDx < 150 || absDy * 3 > absDx || dt > 600) return;

        var idx = PLATFORM_ORDER.indexOf(_currentPlatform);
        if (idx === -1) return;

        if (dx < 0 && idx < PLATFORM_ORDER.length - 1) {
            // Swipe left → next module
            switchPlatform(PLATFORM_ORDER[idx + 1], 'left');
        } else if (dx > 0 && idx > 0) {
            // Swipe right → previous module
            switchPlatform(PLATFORM_ORDER[idx - 1], 'right');
        }
    }, { passive: true });
})();

// ═══════════════════════════════════════════════════════════════
// [v17.0] Accessibility helpers — compartidos por los 7 módulos.
// Ver CLAUDE.md / plan v17.0 para el porqué de cada uno.
// ═══════════════════════════════════════════════════════════════

// Cablea navegación por teclado (flechas/Home/End) en un grupo role="tab".
// Idempotente: se puede llamar en cada render sin duplicar listeners.
function a11yTablist(container) {
    if (!container || container._a11yWired) return;
    container._a11yWired = true;
    if (!container.getAttribute('role')) container.setAttribute('role', 'tablist');
    var tabs = function () {
        return Array.prototype.slice.call(container.querySelectorAll('[role="tab"]'))
            .filter(function (t) { return t.offsetParent !== null; });
    };
    var focusTab = function (list, i) {
        var t = list[(i + list.length) % list.length];
        if (t) { t.focus(); t.click(); }
    };
    container.addEventListener('keydown', function (e) {
        var list = tabs(), i = list.indexOf(document.activeElement);
        if (i < 0) return;
        var k = e.key;
        if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); focusTab(list, i + 1); }
        else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); focusTab(list, i - 1); }
        else if (k === 'Home') { e.preventDefault(); focusTab(list, 0); }
        else if (k === 'End') { e.preventDefault(); focusTab(list, list.length - 1); }
    });
}

// Marca cuál tab está activa (aria-selected + tabindex roving). Llamar al
// final de cada switch de pestaña, junto con el toggle de la clase .active.
function a11yTablistSync(container, activeEl) {
    if (!container) return;
    container.querySelectorAll('[role="tab"]').forEach(function (t) {
        var on = (t === activeEl);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
    });
}

// Trampa de foco + Escape + devolución de foco al abridor. Devuelve una
// función de cierre que el llamador debe invocar al cerrar el modal.
function a11yDialog(el, opts) {
    opts = opts || {};
    var opener = document.activeElement;
    el.setAttribute('role', opts.alert ? 'alertdialog' : 'dialog');
    el.setAttribute('aria-modal', 'true');
    if (opts.labelId) el.setAttribute('aria-labelledby', opts.labelId);

    var SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
              'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    var focusable = function () {
        return Array.prototype.slice.call(el.querySelectorAll(SEL))
            .filter(function (n) { return n.offsetParent !== null; });
    };
    var onKey = function (e) {
        // Si el nodo ya no está en el documento (p.ej. un wizard que reconstruye su overlay
        // en cada paso, ver pnProjImportOpen) el listener queda huérfano hasta que algo lo
        // remueva explícitamente. En vez de exigirle a cada llamador ese cuidado, se
        // autodesactiva en cuanto detecta que ya no tiene nada que atrapar.
        if (!document.contains(el)) { document.removeEventListener('keydown', onKey, true); return; }
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        var list = focusable(); if (!list.length) return;
        var first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    function close() {
        document.removeEventListener('keydown', onKey, true);
        if (opts.onClose) opts.onClose();
        if (opener && opener.focus) opener.focus();
    }
    document.addEventListener('keydown', onKey, true);
    var init = focusable();
    if (init.length) init[0].focus(); else el.focus();
    return close;
}

// Anuncia un mensaje a lectores de pantalla vía una región aria-live única
// (reutilizada, no crea una nueva por cada llamada).
function a11yAnnounce(msg, assertive) {
    var id = 'a11y-live-' + (assertive ? 'assertive' : 'polite');
    var r = document.getElementById(id);
    if (!r) {
        r = document.createElement('div');
        r.id = id; r.className = 'sr-only';
        r.setAttribute('role', assertive ? 'alert' : 'status');
        r.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
        document.body.appendChild(r);
    }
    r.textContent = '';
    setTimeout(function () { r.textContent = msg; }, 50);
}

// Puente de color para contextos donde var(--token) no funciona: Chart.js
// (backgroundColor/borderColor) y jsPDF (setFillColor/setTextColor, que
// exigen componentes RGB numéricos). Sin esto, migrar el CSS dejaría
// gráficos y PDFs con la paleta vieja.
var _tokenCache = {};
function tokenColor(name) {
    if (_tokenCache[name]) return _tokenCache[name];
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return (_tokenCache[name] = v || '#000000');
}
function tokenRGB(name) {
    var h = tokenColor(name).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function tokenAlpha(name, a) {
    var c = tokenRGB(name);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}

// Hace alcanzables por teclado los `<div onclick>` que la app genera vía
// template strings (patrón repetido en los 7 módulos: tarjetas, filas de
// alerta, resultados de búsqueda). Idempotente — no toca elementos que ya
// tienen tabindex/role. Llamar al final de cada render que inyecte HTML
// dinámico, igual que cascadeInjectTooltips().
function a11yClickables(container) {
    container = container || document;
    var els = container.querySelectorAll(
        '[onclick]:not(button):not(a):not(input):not(select):not(textarea):not([tabindex]):not([role])'
    );
    els.forEach(function (el) {
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
    });
}

// Listener único (delegado): Enter/Espacio activan cualquier elemento
// role="button" que no sea ya un <button>/<a> nativo.
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('role') === 'button' &&
        t.tagName !== 'BUTTON' && t.tagName !== 'A') {
        e.preventDefault();
        t.click();
    }
});

    function initializeSystem() {
        // Theme init — apply before any UI renders
        try { themeInit(); } catch(e) { console.error('themeInit error:', e); }
        try { modalUxInit(); } catch(e) { console.error('modalUxInit error:', e); }
        try { a11yTablist(document.getElementById('platformBar')); } catch(e) { console.error('a11yTablist error:', e); }

        // Show local build in the topbar version pill (Firebase will call again with remote status)
        try { updateVersionDisplay(); } catch(e) { console.error('version display error:', e); }

        // [R5-M1] Splash screen
        if (typeof splashShow === 'function') splashShow();

        // Auth gate — must be authenticated before initializing
        try {
        if (typeof authInit === 'function' && typeof authState !== 'undefined') {
            if (!authState.sessionActive) {
                if (typeof pnInit === 'function' && (!pnState || pnState.operators.length === 0)) pnInit();
                authInit();
                if (!authState.sessionActive) { if (typeof splashHide === 'function') splashHide(); return; }
            }
        }
        } catch(e) { console.error('auth error:', e); }

        if (typeof splashUpdate === 'function') splashUpdate('Cargando configuraciones...', 20);
        try { parseCSV(); } catch(e) { console.error('parseCSV error:', e); }
        try { populateOperators(); } catch(e) { console.error('populateOperators error:', e); }
        try { if (typeof authRenderOperatorPicker === 'function') authRenderOperatorPicker(); } catch(e) { console.error('op picker error:', e); }
        
        // Poblar selector inicial de MODELO
        try {
        var modelSelect = document.getElementById('cfg_model');
        var uniqueModels = [...new Set(allConfigurations.map(function(c){ return c.Modelo; }))].sort();
        if (modelSelect) {
            modelSelect.innerHTML = '<option value="">Seleccionar...</option>';
            uniqueModels.forEach(function(model) {
                modelSelect.innerHTML += '<option value="' + model + '">' + model + '</option>';
            });
        }

        // Inicializar otros selectores
        updateSelectOptions(allConfigurations);
        var configCountEl = document.getElementById('configCount');
        if (configCountEl) configCountEl.textContent = allConfigurations.length;
        } catch(e) { console.error('model select error:', e); }

        // Initialize visual cascade tree
        try { if (typeof initCascadeTree === 'function') initCascadeTree(); } catch(e) { console.error('initCascadeTree error:', e); }

        // Antes de poblar cualquier selector: los <option> llevan el id como valor, así
        // que un id repetido haría que elegir un vehículo cargara otro.
        try {
            var _dupIds = dedupeVehicleIds();
            if (_dupIds > 0 && typeof showToast === 'function') {
                showToast('Se repararon ' + _dupIds + ' vehículo(s) con identificador repetido (ver Datos → Auditoría).', 'warning');
            }
        } catch(e) { console.error('dedupeVehicleIds error:', e); }
        try { updateProgressBar(); } catch(e) { console.error('updateProgressBar error:', e); }
        try { refreshAllLists(); } catch(e) { console.error('refreshAllLists error:', e); }

        try {
	var now = new Date();
	var dt = now.toISOString().slice(0,16);
	if (document.getElementById('test_datetime') && !document.getElementById('test_datetime').value) {
  	document.getElementById('test_datetime').value = dt;
	}
        } catch(e) {}


        console.log('Sistema inicializado v11.0 CASCADE');

// --- Eventos Ventilador ---
var modeEl  = document.getElementById('test_fan_mode');
var speedEl = document.getElementById('test_fan_speed');

if (modeEl)  modeEl.addEventListener('change', updateFanFieldsByMode);
if (speedEl) speedEl.addEventListener('input', calculateFanFlowFromSpeed);


	try { initStatusPrevValue(); } catch(e) {}

        // ═══ Init Test Plan Manager ═══
        if (typeof splashUpdate === 'function') splashUpdate('Iniciando módulos...', 50);
        try { tpInit(); } catch(e) { console.error('tpInit error:', e); }
        try { tpUpdateBadges(); } catch(e) {}
        try { tpHookCascadeResult(); } catch(e) {}
        // v15.6: results.js y approvals.js se eliminaron definitivamente; limpiar sus claves residuales
        try { ['kia_results_v1', 'kia_pa_config', 'kia_pa_queue'].forEach(function(k) { localStorage.removeItem(k); }); } catch(e) {}

        // ═══ Auto-plan semanal (viernes 14:00 deadline) ═══
        try {
            if (typeof tpAutoGenerateIfNeeded === 'function') {
                setTimeout(tpAutoGenerateIfNeeded, 3000);
            }
        } catch(e) { console.error('autoplan error:', e); }

        // ═══ Lab Inventory badges ═══
        try { if (typeof invPreloadData === 'function') invPreloadData(); } catch(e) {}
        try { if (typeof invUpdateBadges === 'function') invUpdateBadges(); } catch(e) {}

        // ═══ Panel Module ═══
        try { if (typeof pnInit === 'function') { pnInit(); pnUpdateBadges(); } } catch(e) {}

        // ═══ Restore Soak Timer if running ═══
        if (typeof splashUpdate === 'function') splashUpdate('Restaurando estado...', 80);
        try { if (typeof soakTimerRestore === 'function') soakTimerRestore(); } catch(e) {}

        // ═══ Firebase Cloud Sync (optional) ═══
        try {
            if (typeof fbInit === 'function') { fbInit(); fbHookSaves(); fbUpdateIndicator(); }
        } catch(fbErr) { console.error('Firebase init failed (non-blocking):', fbErr); }

        // ═══ [R4-M1] Load chart configurations ═══
        try { chartConfigLoad(); } catch(e) {}

        // ═══ [R3-M6] Health check at boot — enhanced [Fase 5.3] ═══
        try {
            var lsUsage = _getLocalStorageUsage();
            var lsPercent = Math.round((lsUsage / (5 * 1024 * 1024)) * 100);
            if (lsPercent > 90) {
                showToast('Almacenamiento al ' + lsPercent + '%. Considere purgar datos antiguos.', 'warning');
            } else if (lsPercent > 80) {
                showToast('Almacenamiento al ' + lsPercent + '%. Considere exportar datos y ejecutar compactación desde Panel > Salud del Sistema.', 'warning');
            }
            console.log('Storage: ' + _formatBytes(lsUsage) + ' (' + lsPercent + '%)');
        } catch(e) { console.error('Health check error:', e); }

        // ═══ [R3-M1] PWA — Register Service Worker ═══
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').then(function(reg) {
                console.log('SW registered:', reg.scope);
                window._swReg = reg;
                // [v15.6] Buscar actualización al arrancar y al volver a la app
                // (throttle 5 min) — antes nadie llamaba reg.update() y los
                // dispositivos podían quedarse en versiones viejas
                try { reg.update(); } catch(e) {}
                var _lastSwCheck = Date.now();
                document.addEventListener('visibilitychange', function() {
                    if (document.visibilityState === 'visible' && Date.now() - _lastSwCheck > 300000) {
                        _lastSwCheck = Date.now();
                        try { reg.update(); } catch(e) {}
                    }
                });
            }).catch(function(err) { console.log('SW registration skipped:', err.message); });

            // [Fase 4.3 → v15.6] El SW nuevo (skipWaiting+claim) avisa con SW_UPDATED:
            // recargar de inmediato si el usuario aún no empezó a trabajar; si no,
            // toast persistente con botón — nunca recargar a mitad de una captura
            navigator.serviceWorker.addEventListener('message', function(event) {
                if (event.data && event.data.type === 'SW_UPDATED') _swPromptReload();
            });
        }

        // ═══ [R3-M1] Online/Offline indicator ═══
        _updateOnlineStatus();
        window.addEventListener('online', _updateOnlineStatus);
        window.addEventListener('offline', _updateOnlineStatus);

        // ═══ [R3-M1] PWA install prompt ═══
        window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window._deferredInstallPrompt = e;
            var installBtn = document.getElementById('pwa-install-btn');
            if (installBtn) installBtn.style.display = '';
        });

        // ═══ [R3-M9] Onboarding tour — first visit ═══
        if (!localStorage.getItem('kia_tour_done')) {
            setTimeout(function() { if (typeof startTour === 'function') startTour(); }, 1500);
        }

        // ═══ [V7] Session Memory — Resume or Restore ═══
        try {
            if (typeof resumeLastSession === 'function') resumeLastSession();
        } catch(v7err) { console.error('V7 resumeLastSession error:', v7err); }

        // ═══ [V7-D3] Check for expired soak timers from previous session ═══
        try {
            if (typeof v7CheckExpiredSoak === 'function') v7CheckExpiredSoak();
        } catch(v7err) { console.error('V7 soakCheck error:', v7err); }

        // ═══ [V7-A1] Event Bus — wire cross-module events ═══
        try {
            onEvent('vehicle:registered', function(data) {
                if (typeof v7UpdateNextStepBanner === 'function') v7UpdateNextStepBanner();
            });
            onEvent('vehicle:statusChanged', function(data) {
                if (typeof v7UpdateNextStepBanner === 'function') v7UpdateNextStepBanner();
                var conflicts = checkResourceConflicts();
                if (conflicts.length > 0) {
                    conflicts.forEach(function(c) { showToast(c.message, 'warning'); });
                }
            });
        } catch(v7err) { console.error('V7 eventBus wiring error:', v7err); }

        // ═══ Daily Dashboard (initial render) ═══
        try {
            if (typeof dailyDashRender === 'function') dailyDashRender();
        } catch(dashErr) { console.error('dailyDashRender error:', dashErr); }

        // ═══ [v17.13] Botón flotante de reporte de bugs ═══
        try {
            if (typeof bugFabInit === 'function') bugFabInit();
        } catch(bugErr) { console.error('bugFabInit error:', bugErr); }

        // [R5-M1] Finalize splash
        if (typeof splashUpdate === 'function') splashUpdate('Listo', 100);
        setTimeout(function() { if (typeof splashHide === 'function') splashHide(); }, 400);

        // [R5-M1] Restore immersive mode if previously active
        if (localStorage.getItem('kia_immersive_prefs') === '1') {
            setTimeout(function() { immersiveEnter(); }, 600);
        }
        }

window.addEventListener('DOMContentLoaded', initializeSystem);

// ══════════════════════════════════════════════════════════════════════
// [M20] NOTIFICATION CENTER
// ══════════════════════════════════════════════════════════════════════

var _notificationLog = [];
var _notifMaxItems = 50;

// Wrap showToast to also log notifications
(function() {
    var _origShowToast = showToast;
    showToast = function(msg, type) {
        _origShowToast(msg, type);
        addNotification(msg, type);
    };
})();

function addNotification(msg, type) {
    _notificationLog.unshift({ message: msg, type: type || 'info', timestamp: Date.now(), read: false });
    if (_notificationLog.length > _notifMaxItems) _notificationLog.pop();
    updateNotifBadge();
}

function updateNotifBadge() {
    var badge = document.getElementById('notif-badge');
    if (!badge) return;
    var unread = _notificationLog.filter(function(n) { return !n.read; }).length;
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? '9+' : unread;
}

function _notifCenterEscHandler(e) {
    if (e.key === 'Escape') toggleNotificationCenter();
}
function toggleNotificationCenter() {
    var el = document.getElementById('notification-center');
    if (!el) return;
    var vis = el.style.display !== 'none';
    el.style.display = vis ? 'none' : 'block';
    if (!vis) {
        renderNotifications();
        document.addEventListener('keydown', _notifCenterEscHandler);
    } else {
        document.removeEventListener('keydown', _notifCenterEscHandler);
    }
}

function renderNotifications() {
    var list = document.getElementById('notification-list');
    if (!list) return;
    if (_notificationLog.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:30px;color:#475569;font-size:12px;">Sin notificaciones</div>';
        return;
    }
    var icons = { success: '✅', error: '❌', warning: '⚡', info: 'ℹ️' };
    list.innerHTML = _notificationLog.map(function(n, i) {
        var ago = _timeAgo(n.timestamp);
        return '<div class="notif-item' + (n.read ? '' : ' notif-unread') + '" onclick="_notificationLog[' + i + '].read=true;this.classList.remove(\'notif-unread\');updateNotifBadge();">' +
            '<span class="notif-icon">' + (icons[n.type] || 'ℹ️') + '</span>' +
            '<div class="notif-body"><div class="notif-msg">' + n.message + '</div><div class="notif-time">' + ago + '</div></div>' +
            '<button class="notif-dismiss" onclick="event.stopPropagation();_notificationLog.splice(' + i + ',1);renderNotifications();updateNotifBadge();">×</button>' +
            '</div>';
    }).join('');
    a11yClickables(list);
}

function clearAllNotifications() {
    _notificationLog = [];
    renderNotifications();
    updateNotifBadge();
}

function _timeAgo(ts) {
    var diff = Date.now() - ts;
    if (diff < 60000) return 'ahora';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
    return Math.floor(diff / 86400000) + 'd';
}

// Close notification center when clicking elsewhere
document.addEventListener('click', function(e) {
    var nc = document.getElementById('notification-center');
    if (nc && nc.style.display !== 'none') {
        if (!nc.contains(e.target) && !e.target.closest('[onclick*="toggleNotificationCenter"]')) {
            nc.style.display = 'none';
        }
    }
});

// ══════════════════════════════════════════════════════════════════════
// [M21] COMMAND PALETTE + KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════════════

var _commandPaletteCommands = [
    { label: 'Plan Semanal', icon: '📋', action: function(){ switchPlatform('plan'); }, shortcut: 'Ctrl+1', cat: 'nav' },
    { label: 'Pruebas (COP15)', icon: '🔬', action: function(){ switchPlatform('pruebas'); }, shortcut: 'Ctrl+2', cat: 'nav' },
    { label: 'Datos y Análisis', icon: '📊', action: function(){ switchPlatform('datos'); }, shortcut: 'Ctrl+3', cat: 'nav' },
    { label: 'Vista Hoy', icon: '🏠', action: function(){ switchPlatform('today'); }, shortcut: 'Ctrl+4', cat: 'nav' },
    { label: 'Consumibles (Inventario)', icon: '📦', action: function(){ switchPlatform('inventory'); }, cat: 'nav' },
    { label: 'Panel de Control', icon: '⚙️', action: function(){ switchPlatform('panel'); }, cat: 'nav' },
    { label: 'Guardar Progreso', icon: '💾', action: function(){ if(typeof saveVehicleProgress==='function') saveVehicleProgress(); }, shortcut: 'Ctrl+S', cat: 'action' },
    { label: 'Generar PDF Semanal', icon: '📄', action: function(){ if(typeof generateWeeklyStatusPDF==='function') generateWeeklyStatusPDF(); }, cat: 'action' },
    { label: 'Deshacer Ultima Accion', icon: '↶', action: function(){ undoPop(); }, shortcut: 'Ctrl+Z', cat: 'action' },
    { label: 'Reiniciar Filtros Cascada', icon: '🔄', action: function(){ if(typeof resetFilters==='function') resetFilters(); if(typeof resetCascadeTree==='function') resetCascadeTree(); }, cat: 'action' },
    { label: 'Buscar VIN Global', icon: '🔍', action: function(){ toggleGlobalSearch(); }, cat: 'action' },
    { label: 'Generar Plan Smart', icon: '⚡', action: function(){ switchPlatform('testplan'); setTimeout(function(){ if(typeof tpSmartGenerate==='function') tpSmartGenerate(); }, 300); }, cat: 'action' },
    { label: 'Ver Kanban', icon: '📋', action: function(){ switchPlatform('cop15'); setTimeout(function(){ var t=document.querySelector('.tab[data-tab="kanban"]'); if(t)t.click(); }, 200); }, cat: 'nav' },
    { label: 'Configurar Regulaciones', icon: '⚗️', action: function(){ switchPlatform('panel'); setTimeout(function(){ pnSwitchTab('pn-regulations'); }, 200); }, cat: 'nav' }
];
var _cmdActiveIdx = 0;
var _cmdFiltered = [];

function openCommandPalette() {
    var el = document.getElementById('command-palette-overlay');
    if (!el) return;
    el.style.display = 'block';
    var input = document.getElementById('command-palette-input');
    input.value = '';
    _cmdActiveIdx = 0;
    filterCommands('');
    setTimeout(function(){ input.focus(); }, 50);
}

function closeCommandPalette() {
    var el = document.getElementById('command-palette-overlay');
    if (el) el.style.display = 'none';
}

function filterCommands(query) {
    var q = query.toLowerCase().trim();
    // [R4-M4] Power search: prefix > searches across all modules
    if (q.startsWith('>') && q.length > 1) {
        var searchQ = q.slice(1).trim();
        _cmdFiltered = _globalCrossSearchForPalette(searchQ);
        _cmdActiveIdx = 0;
        renderCommandResults();
        return;
    }
    _cmdFiltered = q ? _commandPaletteCommands.filter(function(c) {
        return c.label.toLowerCase().includes(q) || (c.cat && c.cat.includes(q));
    }) : _commandPaletteCommands;
    _cmdActiveIdx = 0;
    renderCommandResults();
}

function _globalCrossSearchForPalette(q) {
    var results = [];
    var qUp = q.toUpperCase();
    // COP15 vehicles
    (db.vehicles || []).slice(-50).forEach(function(v) {
        if (((v.vin||'')+(v.configCode||'')).toUpperCase().includes(qUp)) {
            results.push({ label: v.vin + ' — ' + (v.configCode || '').substring(0,30), icon: '🚗', action: function(){ switchPlatform('cop15'); }, cat: 'COP15' });
        }
    });
    // Inventory
    if (typeof invState !== 'undefined') {
        (invState.gases || []).slice(0,30).forEach(function(g) {
            if (((g.formula||'')+(g.controlNo||'')).toUpperCase().includes(qUp)) {
                results.push({ label: g.formula + ' #' + (g.controlNo||''), icon: '🧪', action: function(){ switchPlatform('inventory'); }, cat: 'Inventario' });
            }
        });
    }
    return results.slice(0, 15);
}

function renderCommandResults() {
    var el = document.getElementById('command-palette-results');
    if (!el) return;
    el.innerHTML = _cmdFiltered.map(function(c, i) {
        return '<div class="cmd-item' + (i === _cmdActiveIdx ? ' cmd-active' : '') + '" onclick="executeCommand(' + i + ')" onmouseenter="_cmdActiveIdx=' + i + ';renderCommandResults();">' +
            '<span class="cmd-icon">' + c.icon + '</span>' +
            '<span class="cmd-label">' + c.label + '</span>' +
            (c.shortcut ? '<span class="cmd-shortcut">' + c.shortcut + '</span>' : '') +
            '</div>';
    }).join('');
}

function executeCommand(idx) {
    var cmd = _cmdFiltered[idx];
    if (cmd && cmd.action) { closeCommandPalette(); cmd.action(); }
}

function handleCommandKey(e) {
    if (e.key === 'Escape') { closeCommandPalette(); e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { _cmdActiveIdx = Math.min(_cmdActiveIdx + 1, _cmdFiltered.length - 1); renderCommandResults(); e.preventDefault(); return; }
    if (e.key === 'ArrowUp') { _cmdActiveIdx = Math.max(_cmdActiveIdx - 1, 0); renderCommandResults(); e.preventDefault(); return; }
    if (e.key === 'Enter') { executeCommand(_cmdActiveIdx); e.preventDefault(); return; }
}

// Global keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl+K: Command palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault(); openCommandPalette(); return;
    }
    // Escape: Close modals/palette/notification center
    if (e.key === 'Escape') {
        var palette = document.getElementById('command-palette-overlay');
        if (palette && palette.style.display !== 'none') { closeCommandPalette(); e.preventDefault(); return; }
        var nc = document.getElementById('notification-center');
        if (nc && nc.style.display !== 'none') { nc.style.display = 'none'; e.preventDefault(); return; }
    }
    // Ctrl+1-4: Switch platform (4 root tabs)
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '4') {
        var platforms = ['plan', 'pruebas', 'datos', 'today'];
        e.preventDefault(); switchPlatform(platforms[parseInt(e.key) - 1]); return;
    }
    // Ctrl+Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault(); undoPop(); return;
    }
    // Ctrl+S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (typeof saveVehicleProgress === 'function') saveVehicleProgress();
        return;
    }
});


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [R2-M10] CROSS-MODULE RISK DASHBOARD                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

function renderLabDashboard(container) {
    var alerts = [];

    // ── COP15 Module ──
    var vehicles = (typeof db !== 'undefined' && db.vehicles) ? db.vehicles : [];
    var active = vehicles.filter(function(v) { return v.status !== 'archived'; });
    var now = Date.now();
    // Ventana rodante de 7 días como timestamp: las comparaciones de abajo usan
    // .getTime() y aritmética sobre este valor, así que debe ser numérico (no la
    // fecha-string que usa pnRenderExecutive).
    var weekAgo = now - 7 * 86400000;

    // Find oldest stalled vehicle
    var oldest = null;
    var oldestHours = 0;
    active.forEach(function(v) {
        var lastUp = v.lastModified || v.registeredAt;
        if (!lastUp) return;
        var h = (now - new Date(lastUp).getTime()) / 3600000;
        if (h > oldestHours) { oldestHours = h; oldest = v; }
    });
    if (oldest && oldestHours > 48) {
        var vinShort = '...' + (oldest.vin || '').slice(-6);
        var daysStalled = Math.floor(oldestHours / 24);
        alerts.push({ level: 'CRITICO', color: tokenColor('--danger-fill'), module: 'COP15',
            message: 'VIN ' + vinShort + ' lleva ' + daysStalled + 'd en "' + (oldest.status || '?') + '"',
            action: 'cop15' });
    }
    if (active.length > 10) {
        alerts.push({ level: 'ALTO', color: tokenColor('--warn-fill'), module: 'COP15',
            message: active.length + ' vehiculos activos — considerar agilizar liberaciones',
            action: 'cop15' });
    }

    // ── Test Plan Module ──
    // v16.2: tpGetAnalysis() devuelve un ARRAY por config (no un objeto agregado) — esto
    // leía .totalReq/.totalDone/.coveragePct que nunca existieron, así que la cobertura
    // aquí siempre daba 0% y el déficit "NaN tests". tpCoverageSummary() es LA fuente de
    // verdad de cobertura en toda la plataforma (mismo % que el badge del Plan).
    var tpCov = null;
    if (typeof tpCoverageSummary === 'function') {
        try { tpCov = tpCoverageSummary(); } catch(e) {}
    }
    if (tpCov && tpCov.vigentes > 0) {
        if (tpCov.pct < 50) {
            alerts.push({ level: 'CRITICO', color: tokenColor('--danger-fill'), module: 'Test Plan',
                message: 'Cobertura al ' + tpCov.pct + '%. Deficit: ' + tpCov.deficit + ' tests',
                action: 'testplan' });
        } else if (tpCov.pct < 80) {
            alerts.push({ level: 'MEDIO', color: tokenColor('--warn-fill'), module: 'Test Plan',
                message: 'Cobertura al ' + tpCov.pct + '%. Deficit: ' + tpCov.deficit + ' tests',
                action: 'testplan' });
        }
    }

    // ── Inventory Module ──
    var invGases = (typeof invState !== 'undefined' && invState.gases) ? invState.gases : [];
    var criticalGases = invGases.filter(function(g) {
        if (!g.readings || g.readings.length === 0 || g.status === 'Empty') return false;
        var last = g.readings[g.readings.length - 1];
        return last.psi < (g.reorderPSI || 500);
    });
    if (criticalGases.length > 0) {
        alerts.push({ level: 'ALTO', color: tokenColor('--danger-fill'), module: 'Inventario',
            message: criticalGases.length + ' gas(es) bajo nivel de reorden',
            action: 'inventory' });
    }

    // ── Weekly productivity ──
    var thisWeekReleased = vehicles.filter(function(v) {
        if (v.status !== 'archived' || !v.archivedAt) return false;
        return new Date(v.archivedAt).getTime() >= weekAgo;
    }).length;
    var lastWeekReleased = vehicles.filter(function(v) {
        if (v.status !== 'archived' || !v.archivedAt) return false;
        var t = new Date(v.archivedAt).getTime();
        return t >= weekAgo - 7*86400000 && t < weekAgo;
    }).length;
    var diff = thisWeekReleased - lastWeekReleased;

    // Sort alerts by severity
    var levelOrder = { 'CRITICO': 0, 'ALTO': 1, 'MEDIO': 2, 'BAJO': 3 };
    alerts.sort(function(a, b) { return (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9); });

    // Render
    var html = '<div class="lab-dash">';
    html += '<h3 style="margin:0 0 12px;font-size:14px;color:var(--text);">🏭 Lab Status — Vista Consolidada de Riesgos</h3>';

    // Consolidated alerts
    if (alerts.length > 0) {
        html += '<div class="lab-dash-alerts">';
        alerts.forEach(function(a) {
            html += '<div class="lab-dash-alert" onclick="switchPlatform(\'' + a.action + '\')" style="cursor:pointer;">' +
                '<span class="lab-dash-alert-badge" style="background:' + a.color + '20;color:' + a.color + ';">' + a.level + '</span>' +
                '<span class="lab-dash-alert-mod">' + a.module + '</span>' +
                '<span style="flex:1;font-size: var(--fs-xs);color:var(--text);">' + a.message + '</span>' +
                '<span style="font-size: var(--fs-xs);color:#475569;">→</span></div>';
        });
        html += '</div>';
    } else {
        html += '<div style="padding:12px;text-align:center;background:var(--ok-bg);border:1px solid var(--ok-text);border-radius:8px;font-size:12px;color:var(--ok-text);font-weight:700;">✅ Sin alertas activas — Laboratorio operando normalmente</div>';
    }

    // Module summary cards
    html += '<div class="lab-dash-grid">';

    // COP15 card
    var byStatus = {};
    active.forEach(function(v) { byStatus[v.status] = (byStatus[v.status] || 0) + 1; });
    html += '<div class="lab-dash-card" onclick="switchPlatform(\'cop15\')">' +
        '<div class="lab-dash-card-header" style="color:var(--info-text);">COP15</div>' +
        '<div class="lab-dash-card-metric">' + active.length + '</div>' +
        '<div class="lab-dash-card-sub">activos</div>' +
        '<div class="lab-dash-card-detail">' +
        (byStatus['registered'] || 0) + ' reg · ' + (byStatus['in-progress'] || 0) + ' prog · ' +
        (byStatus['testing'] || 0) + ' test · ' + (byStatus['ready-release'] || 0) + ' listo</div></div>';

    // Test Plan card
    html += '<div class="lab-dash-card" onclick="switchPlatform(\'testplan\')">' +
        '<div class="lab-dash-card-header" style="color:var(--warn-text);">Test Plan</div>' +
        '<div class="lab-dash-card-metric">' + (tpCov ? tpCov.pct : '—') + '%</div>' +
        '<div class="lab-dash-card-sub">configs al día</div>' +
        '<div class="lab-dash-card-detail">Deficit: ' + (tpCov ? tpCov.deficit : '—') + ' tests</div></div>';

    // Inventory card
    html += '<div class="lab-dash-card" onclick="switchPlatform(\'inventory\')">' +
        '<div class="lab-dash-card-header" style="color:var(--info-text);">Inventario</div>' +
        '<div class="lab-dash-card-metric">' + invGases.length + '</div>' +
        '<div class="lab-dash-card-sub">cilindros</div>' +
        '<div class="lab-dash-card-detail">' + (criticalGases.length > 0 ? '<span style="color:var(--danger-text);">' + criticalGases.length + ' criticos</span>' : 'Niveles OK') + '</div></div>';

    html += '</div>';

    // Weekly productivity
    html += '<div style="margin-top:10px;padding:10px;background:#1e293b;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size: var(--fs-sm);color:var(--muted);">Productividad semanal:</span>' +
        '<span style="font-size:13px;font-weight:700;color:' + (diff >= 0 ? tokenColor('--ok-text') : tokenColor('--danger-text')) + ';">' +
        thisWeekReleased + ' liberados ' + (diff !== 0 ? '(' + (diff > 0 ? '↑' : '↓') + ' ' + Math.abs(diff) + ' vs sem pasada)' : '(= sem pasada)') +
        '</span></div>';

    html += '</div>';
    container.innerHTML = html;
    a11yClickables(container);
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [R2-M7] BACKUP HEALTH DASHBOARD + AUTO-BACKUP TO INDEXEDDB        ║
// ╚══════════════════════════════════════════════════════════════════════╝

var _backupDBName = 'kia_emlab_backups';
var _backupStoreName = 'snapshots';
var _backupMaxCount = 5;

function _openBackupDB(callback) {
    var req = indexedDB.open(_backupDBName, 1);
    req.onupgradeneeded = function(e) {
        var idb = e.target.result;
        if (!idb.objectStoreNames.contains(_backupStoreName)) {
            idb.createObjectStore(_backupStoreName, { keyPath: 'id', autoIncrement: true });
        }
    };
    req.onsuccess = function(e) { callback(e.target.result); };
    req.onerror = function() { console.warn('IndexedDB backup error'); };
}

function autoBackup() {
    _openBackupDB(function(idb) {
        var snapshot = {
            timestamp: new Date().toISOString(),
            db: localStorage.getItem('kia_db_v11') || '{}',
            tpState: localStorage.getItem('kia_testplan_v1') || '{}',
            invState: localStorage.getItem('kia_lab_inventory') || '{}'
        };
        snapshot.sizeBytes = (snapshot.db + snapshot.tpState + snapshot.invState).length * 2;

        // Count vehicles for preview
        try {
            var parsed = JSON.parse(snapshot.db);
            snapshot.vehicleCount = (parsed.vehicles || []).length;
            snapshot.activeCount = (parsed.vehicles || []).filter(function(v) { return v.status !== 'archived'; }).length;
        } catch(e) { snapshot.vehicleCount = 0; snapshot.activeCount = 0; }

        var tx = idb.transaction(_backupStoreName, 'readwrite');
        var store = tx.objectStore(_backupStoreName);
        store.add(snapshot);

        tx.oncomplete = function() {
            // Prune old snapshots beyond max
            var readTx = idb.transaction(_backupStoreName, 'readwrite');
            var readStore = readTx.objectStore(_backupStoreName);
            var countReq = readStore.count();
            countReq.onsuccess = function() {
                if (countReq.result > _backupMaxCount) {
                    var cursor = readStore.openCursor();
                    var toDelete = countReq.result - _backupMaxCount;
                    cursor.onsuccess = function(e) {
                        var c = e.target.result;
                        if (c && toDelete > 0) {
                            c.delete();
                            toDelete--;
                            c.continue();
                        }
                    };
                }
            };
        };
    });
}

// Hook into saveDB to auto-backup
var _origSaveDB = saveDB;
saveDB = function() {
    _origSaveDB();
    autoBackup();
};

function _formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

function _getLocalStorageUsage() {
    var total = 0;
    for (var key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            total += (localStorage[key].length + key.length) * 2;
        }
    }
    return total;
}

// ── [Fase 5.3] Run all module compaction functions ──
function renderBackupStatus(container) {
    var usage = _getLocalStorageUsage();
    var maxBytes = 5 * 1024 * 1024;
    var pct = Math.round((usage / maxBytes) * 100);
    var barColor = pct > 90 ? tokenColor('--danger-fill') : pct > 80 ? tokenColor('--warn-fill') : tokenColor('--ok-fill');

    var html = '<div class="backup-dashboard">' +
        '<h3 style="margin:0 0 12px;font-size:14px;color:var(--text);">💾 Backup & Almacenamiento</h3>';

    // Storage bar
    html += '<div class="backup-card">' +
        '<div style="display:flex;justify-content:space-between;font-size: var(--fs-sm);margin-bottom:4px;">' +
        '<span>localStorage</span><span>' + _formatBytes(usage) + ' / 5 MB (' + pct + '%)</span></div>' +
        '<div style="height:8px;background:#1e293b;border-radius:4px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:4px;"></div></div></div>';

    // Backup snapshots (async from IndexedDB)
    html += '<div class="backup-card" id="backupSnapshotsList">' +
        '<div style="font-size: var(--fs-sm);color:var(--muted);">Cargando snapshots...</div></div>';

    // Actions
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
        '<button class="btn-secondary" onclick="downloadFullBackup()" style="font-size: var(--fs-sm);padding:6px 14px;">📥 Descargar Backup Completo</button>' +
        '<button class="btn-secondary" onclick="openRestoreBackup()" style="font-size: var(--fs-sm);padding:6px 14px;">♻️ Restaurar desde Backup</button>' +
        '</div></div>';

    container.innerHTML = html;

    // Load snapshots from IndexedDB
    _openBackupDB(function(idb) {
        var tx = idb.transaction(_backupStoreName, 'readonly');
        var store = tx.objectStore(_backupStoreName);
        var all = store.getAll();
        all.onsuccess = function() {
            var snapshots = all.result || [];
            var el = document.getElementById('backupSnapshotsList');
            if (!el) return;
            if (snapshots.length === 0) {
                el.innerHTML = '<div style="font-size: var(--fs-sm);color:var(--muted);">Sin snapshots automáticos aún</div>';
                return;
            }
            var sHtml = '<div style="font-size: var(--fs-sm);font-weight:700;color:var(--text);margin-bottom:6px;">' + snapshots.length + ' snapshots en IndexedDB</div>';
            snapshots.reverse().forEach(function(s) {
                var ago = _timeAgo(s.timestamp);
                sHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size: var(--fs-xs);">' +
                    '<span style="color:#a78bfa;">' + ago + '</span>' +
                    '<span style="color:var(--muted);">' + _formatBytes(s.sizeBytes || 0) + ' · ' + (s.vehicleCount || 0) + ' veh (' + (s.activeCount || 0) + ' activos)</span>' +
                    '</div>';
            });
            el.innerHTML = sHtml;
        };
    });
}

function downloadFullBackup() {
    var backup = {
        exportDate: new Date().toISOString(),
        version: 'kia-emlab-backup-v1',
        db: JSON.parse(localStorage.getItem('kia_db_v11') || '{}'),
        tpState: JSON.parse(localStorage.getItem('kia_testplan_v1') || '{}'),
        invState: JSON.parse(localStorage.getItem('kia_lab_inventory') || '{}'),
        manualConfigs: JSON.parse(localStorage.getItem('kia_manual_configs') || '[]')
    };
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'kia-emlab-backup_' + localToday() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup completo descargado', 'success');
}

function openRestoreBackup() {
    _openBackupDB(function(idb) {
        var tx = idb.transaction(_backupStoreName, 'readonly');
        var store = tx.objectStore(_backupStoreName);
        var all = store.getAll();
        all.onsuccess = function() {
            var snapshots = (all.result || []).reverse();
            if (snapshots.length === 0) {
                showToast('No hay snapshots disponibles para restaurar', 'warning');
                return;
            }
            var html = '<div style="max-height:300px;overflow-y:auto;">';
            snapshots.forEach(function(s, i) {
                var ago = _timeAgo(s.timestamp);
                var dt = new Date(s.timestamp).toLocaleString('es-MX');
                html += '<div class="backup-restore-item" onclick="restoreFromBackup(' + s.id + ')" style="cursor:pointer;padding:10px;margin-bottom:6px;background:#1e293b;border-radius:8px;border:1px solid #334155;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                    '<span style="font-size:12px;font-weight:700;color:var(--text);">' + dt + '</span>' +
                    '<span style="font-size: var(--fs-xs);color:var(--muted);">' + ago + '</span></div>' +
                    '<div style="font-size: var(--fs-xs);color:var(--muted);margin-top:4px;">' + _formatBytes(s.sizeBytes || 0) + ' · ' + (s.vehicleCount || 0) + ' vehículos (' + (s.activeCount || 0) + ' activos)</div>' +
                    '</div>';
            });
            html += '</div>';
            html += '<div style="margin-top:10px;padding:8px;background:var(--warn-bg);border-radius:6px;font-size: var(--fs-xs);color:var(--warn-text);">' +
                '⚠️ Restaurar reemplazará TODOS los datos actuales. Se creará un backup automático antes de restaurar.</div>';
            showModal(html, 'Restaurar desde Backup');
        };
    });
}

function restoreFromBackup(snapshotId) {
    showConfirm('¿Restaurar este backup? Se hará un backup automático de los datos actuales antes de restaurar.', function() {
        // Auto-backup current state first
        autoBackup();

        _openBackupDB(function(idb) {
            var tx = idb.transaction(_backupStoreName, 'readonly');
            var store = tx.objectStore(_backupStoreName);
            var req = store.get(snapshotId);
            req.onsuccess = function() {
                var s = req.result;
                if (!s) { showToast('Snapshot no encontrado', 'error'); return; }
                localStorage.setItem('kia_db_v11', s.db);
                localStorage.setItem('kia_testplan_v1', s.tpState);
                localStorage.setItem('kia_lab_inventory', s.invState);

                showToast('Datos restaurados. Recargando...', 'success');
                setTimeout(function() { location.reload(); }, 1500);
            };
        });
    }, { title: 'Confirmar Restauración', type: 'warning', confirmText: 'Restaurar' });
}

// ══════════════════════════════════════════════════════════════════════
// [R3-M1] PWA — Online/Offline Status + Install Prompt
// ══════════════════════════════════════════════════════════════════════

function _updateOnlineStatus() {
    var badge = document.getElementById('online-status-badge');
    if (!badge) return;
    if (navigator.onLine) {
        badge.textContent = '🟢';
        badge.title = 'Conectado a internet';
    } else {
        badge.textContent = '🔴';
        badge.title = 'Sin conexión — modo offline';
    }
}

function pwaInstall() {
    if (!window._deferredInstallPrompt) return;
    window._deferredInstallPrompt.prompt();
    window._deferredInstallPrompt.userChoice.then(function(choice) {
        if (choice.outcome === 'accepted') showToast('App instalada exitosamente', 'success');
        window._deferredInstallPrompt = null;
        var btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'none';
    });
}

// ══════════════════════════════════════════════════════════════════════
// [R3-M7] MICRO-INTERACTIONS — Shake
// ══════════════════════════════════════════════════════════════════════

function shakeElement(el) {
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('field-shake');
    void el.offsetWidth; // force reflow so re-adding the class restarts the keyframe
    el.classList.add('field-shake');
    setTimeout(function() { el.classList.remove('field-shake'); }, 400);
}

// ══════════════════════════════════════════════════════════════════════
// [R3-M9] ONBOARDING TOUR
// ══════════════════════════════════════════════════════════════════════

// v16.0: recorridos por módulo. 'global' conserva los 5 pasos originales tal cual
// (para no re-mostrarlo a usuarios que ya lo vieron — persistencia con alias 'kia_tour_done').
var TOURS = {
    global: [
        { target: '.platform-bar', title: 'Navegación', text: 'Usa estas 5 pestañas para navegar: Hoy (resumen), Plan (plan semanal), Pruebas (COP15 + inventario), Datos (reportes + panel) y CoP (validador + Control SPC).', position: 'bottom' },
        { target: '#ptab-pruebas', title: 'Pruebas', text: 'Aquí registras vehículos, operas pruebas de emisiones, liberas resultados y gestionas consumibles del laboratorio.', position: 'bottom' },
        { target: '#panel-alta', title: 'Registro de Vehículos', text: 'Selecciona configuración del vehículo, captura VIN y registra para iniciar el flujo COP15.', position: 'top', tab: 'alta' },
        { target: '#ptab-plan', title: 'Plan', text: 'Gestiona el plan de pruebas semanal, prioriza configuraciones y monitorea cobertura.', position: 'bottom' },
        { target: '#ptab-datos', title: 'Datos', text: 'Resultados de pruebas, reportes, panel de control, operadores y configuración del sistema.', position: 'bottom' }
    ],
    today: [
        { target: '.daily-dash-header', title: 'Tu día en un vistazo', text: 'Aquí ves la fecha y el resumen cruzado del laboratorio (vehículos, plan, inventario).', position: 'bottom' },
        { target: '.dash-board-header', title: 'Tablero de actividades', text: 'Todo lo pendiente de hoy agrupado por tipo: vehículos, plan, inventario, calidad y tareas manuales.', position: 'bottom' },
        { target: '.dash-group--vehiculos', title: 'Vehículos', text: 'Cada vehículo activo muestra su etapa (N/8) y la fecha de liberación esperada — tócala para fijarla manualmente.', position: 'top' },
        { target: '.daily-dash-quick-actions', title: 'Acceso rápido', text: 'Atajos directos a Alta de vehículo, Inventario, Reportes y Panel.', position: 'top' }
    ],
    testplan: [
        { target: '#tp-tabs-bar', title: 'Pestañas del Plan', text: 'Navega entre resumen, plan semanal, recuperación, producción, familias, reglas y más.', position: 'bottom' },
        { target: '#tp-weekly-cap', title: 'Capacidad semanal', text: 'Define cuántas pruebas caben esta semana y usa ⚡ Generación Inteligente para repartirlas.', position: 'bottom', tab: 'tp-weekly' },
        { target: '[data-help="tp-priority-help"]', title: 'Recuperación', text: 'Clasifica todo lo pendiente por prioridad (P1..P10) y reparte en las semanas disponibles.', position: 'top', tab: 'tp-recovery' },
        { target: '[data-help="tp-csvimport-help"]', title: 'Producción', text: 'Importa el CSV del plan de producción — se fusiona con lo anterior, no lo borra.', position: 'top', tab: 'tp-production' }
    ],
    inventory: [
        { target: '#inv-tabs-bar', title: 'Pestañas de Inventario', text: 'Navega entre resumen, cilindros, equipos, captura diaria, predicción, combustible y mapa.', position: 'bottom' },
        { target: '[data-help="inv-readings-help"]', title: 'Captura diaria', text: 'Captura el PSI de cada cilindro en uso — de estas lecturas la plataforma APRENDE el consumo.', position: 'bottom', tab: 'inv-readings' },
        { target: '[onclick="invShowAddGas()"]', title: 'Alta de cilindro', text: 'Registra un cilindro nuevo con su fórmula, concentración, zona y vigencia.', position: 'bottom', tab: 'inv-gases' },
        { target: '[data-help="inv-equipment-help"]', title: 'Equipos y Calibración', text: 'Semáforo de calibración por instrumento. El botón "✅ Calibrado" registra la calibración en dos toques — fecha y certificado — y calcula sola la próxima fecha.', position: 'bottom', tab: 'inv-equipment' },
        { target: '[data-help="inv-maint-help"]', title: 'Mantenimiento', text: 'Vencidos y de esta semana arriba, con "✔ Hecho" de un toque. El Plan Maestro de 52 semanas queda plegado abajo para consulta.', position: 'bottom', tab: 'inv-maint' },
        { target: '[data-help="inv-predict-model"]', title: 'Predicción', text: 'Consumo aprendido y proyección: ¿alcanza el gas/combustible para el plan?', position: 'top', tab: 'inv-predict' }
    ],
    panel: [
        { target: '#pn-tabs-bar', title: 'Pestañas de Datos', text: 'Resumen, reportes, ejecutivo, turnaround, operadores, bitácora, alertas, auditoría y más.', position: 'bottom' },
        { target: '[data-help="pn-reports-help"]', title: 'Centro de Reportes', text: 'Un solo lugar para exportar cada CSV/PDF del laboratorio — lee la descripción de cada fila.', position: 'bottom', tab: 'pn-reports' },
        { target: '[data-help="pn-alerts-help"]', title: 'Alertas', text: 'Todas las alertas activas de todos los módulos, incluidas las de consumo y SPC.', position: 'bottom', tab: 'pn-alerts' },
        { target: '[data-help="pn-projects-help"]', title: 'Proyectos', text: 'Da seguimiento a reparaciones o proyectos de inversión: pasos, responsables, fechas y una línea de tiempo — como un tablero de Loop, pero adentro del laboratorio.', position: 'bottom', tab: 'pn-projects' },
        { target: '[data-help="pn-audit-help"]', title: 'Auditoría', text: 'El control de cambios de toda la plataforma: quién hizo qué y cuándo.', position: 'top', tab: 'pn-audit' }
    ],
    cop: [
        { target: '[data-help="cop-family-help"]', title: 'Familia a evaluar', text: 'Elige región y familia — la tabla se llena con los VINes ya probados de esa familia.', position: 'bottom' },
        { target: '[data-help="cop-verdict-help"]', title: 'Veredicto en vivo', text: 'El veredicto CONCORDANTE/NO CONCORDANTE se recalcula con cada valor capturado (mínimo 3 VINes).', position: 'top' },
        { title: 'Control SPC', text: 'La sub-pestaña 📈 Control SPC detecta corrimientos y tendencias antes de fallar un límite regulatorio.' }
    ],
    cop15: [
        { target: '.cascade-tree-intro', title: 'Alta de vehículo', text: 'Arma la configuración con la cascada (cada selección filtra las siguientes) y captura el VIN.', position: 'bottom', tab: 'alta' },
        { target: '.tab[data-tab="seguimiento"]', title: 'Operación', text: 'Captura el flujo completo: recepción → preacondicionamiento → soak → dinamómetro → verificación.', position: 'bottom', tab: 'seguimiento' },
        { target: '[data-help="lib-gas-help"]', title: 'Liberación doble-ciego', text: 'Liberador y Aprobador capturan los resultados por separado; si coinciden, se archiva.', position: 'top', tab: 'liberacion' },
        { target: '[data-help="hist-filter-help"]', title: 'Historial', text: 'Vehículos archivados: genera su PDF, completa datos retroactivos y consulta su control de cambios.', position: 'top', tab: 'dashboard' }
    ]
};
var _tourModule = 'global';
var _tourCurrent = 0;

function _tourStorageKey(moduleKey) { return 'kia_tour_done_' + moduleKey; }
function _tourMarkDone(moduleKey) {
    try {
        localStorage.setItem(_tourStorageKey(moduleKey), '1');
        if (moduleKey === 'global') localStorage.setItem('kia_tour_done', '1');
    } catch (e) {}
}
function _tourIsDone(moduleKey) {
    try {
        if (moduleKey === 'global') return !!localStorage.getItem('kia_tour_done') || !!localStorage.getItem(_tourStorageKey('global'));
        return !!localStorage.getItem(_tourStorageKey(moduleKey));
    } catch (e) { return false; }
}

// Primera visita a un módulo (llamado desde switchPlatform) → lanza su tour corto, solo desktop.
function _tourMaybeAutoStart(moduleKey) {
    if (!TOURS[moduleKey] || _tourIsDone(moduleKey) || window.innerWidth < 768) return;
    setTimeout(function() {
        if (typeof _currentPlatform !== 'undefined' && (PLATFORM_SECTION_MAP[_currentPlatform] || _currentPlatform) !== moduleKey) return;
        startTour(moduleKey);
    }, 800);
}

function startTour(moduleKey) {
    _tourModule = (moduleKey && TOURS[moduleKey]) ? moduleKey : 'global';
    _tourCurrent = 0;
    _renderTourStep();
}

function _renderTourStep() {
    // Remove existing
    var old = document.getElementById('tour-overlay');
    if (old) old.remove();

    var steps = TOURS[_tourModule] || TOURS.global;

    if (_tourCurrent >= steps.length) {
        _tourMarkDone(_tourModule);
        showToast('Recorrido completado. Puedes reiniciarlo con el botón ?', 'success');
        return;
    }

    var step = steps[_tourCurrent];

    // Navigate to correct tab if needed
    if (step.tab) {
        var tabEl = document.querySelector('.tab[data-tab="' + step.tab + '"]') || document.querySelector('.tp-tab[onclick*="' + step.tab + '"]');
        if (tabEl) tabEl.click();
    }

    // Si el target del paso no existe en el DOM (dato vacío, tab distinta, etc.), no lo rompas: sáltalo.
    if (step.target && !document.querySelector(step.target)) {
        _tourCurrent++;
        _renderTourStep();
        return;
    }
    var targetEl = step.target ? document.querySelector(step.target) : null;
    var overlay = document.createElement('div');
    overlay.id = 'tour-overlay';
    overlay.className = 'tour-overlay';

    var tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';
    tooltip.innerHTML = '<div class="tour-title">' + escapeHtml(step.title) + '</div>' +
        '<div class="tour-text">' + escapeHtml(step.text) + '</div>' +
        '<div class="tour-footer">' +
        '<span class="tour-progress">Paso ' + (_tourCurrent + 1) + ' de ' + steps.length + '</span>' +
        '<div class="tour-actions">' +
        (_tourCurrent > 0 ? '<button class="tour-btn" onclick="_tourPrev()">Anterior</button>' : '') +
        '<button class="tour-btn" onclick="_tourSkip()">Saltar</button>' +
        '<button class="tour-btn tour-btn-primary" onclick="_tourNext()">' + (_tourCurrent === steps.length - 1 ? 'Finalizar' : 'Siguiente') + '</button>' +
        '</div></div>';

    overlay.appendChild(tooltip);
    document.body.appendChild(overlay);

    // Position tooltip near target
    if (targetEl) {
        var rect = targetEl.getBoundingClientRect();
        targetEl.style.position = targetEl.style.position || 'relative';
        targetEl.style.zIndex = '100001';
        targetEl.classList.add('tour-highlight');

        var pos = step.position || 'bottom';
        if (pos === 'bottom') {
            tooltip.style.top = (rect.bottom + 12) + 'px';
            tooltip.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 320)) + 'px';
        } else {
            tooltip.style.top = Math.max(10, rect.top - 160) + 'px';
            tooltip.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 320)) + 'px';
        }
    } else {
        tooltip.style.top = '50%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translate(-50%,-50%)';
    }
}

function _tourNext() {
    _cleanTourHighlight();
    _tourCurrent++;
    _renderTourStep();
}

function _tourPrev() {
    _cleanTourHighlight();
    _tourCurrent--;
    _renderTourStep();
}

function _tourSkip() {
    _cleanTourHighlight();
    var old = document.getElementById('tour-overlay');
    if (old) old.remove();
    _tourMarkDone(_tourModule);
    showToast('Recorrido saltado. Reinicia con el botón ?', 'info');
}

function _cleanTourHighlight() {
    document.querySelectorAll('.tour-highlight').forEach(function(el) {
        el.classList.remove('tour-highlight');
        el.style.zIndex = '';
    });
}

// ══════════════════════════════════════════════════════════════════════
// [v16.0] AYUDA / AUTOGUÍA — banners por pestaña, glosario, menú de ayuda
// Cada módulo (testplan.js/inventory.js/panel.js/cop_validator.js) agrega sus
// claves a HELP_TABS con Object.assign al final de su archivo (cargan después
// de app.js). Este módulo (app.js) registra las suyas (today) dentro de
// dailyDashRender con guard idempotente — ver _helpTodayRegistered más abajo.
// ══════════════════════════════════════════════════════════════════════

var HELP_TABS = {};

function helpDismissed() {
    try { return JSON.parse(localStorage.getItem('kia_help_dismissed')) || {}; } catch (e) { return {}; }
}
function helpDismiss(tabId) {
    var d = helpDismissed();
    d[tabId] = 1;
    try { localStorage.setItem('kia_help_dismissed', JSON.stringify(d)); } catch (e) {}
    var el = document.getElementById('help-banner-' + tabId);
    if (el) el.remove();
}

/** Banner corto y descartable para una pestaña. Devuelve '' si no hay contenido o ya se descartó — úsalo prepend en el HTML de cada render de pestaña. */
function helpBannerHTML(tabId) {
    var h = HELP_TABS[tabId];
    if (!h || helpDismissed()[tabId]) return '';
    return '<div class="help-banner" id="help-banner-' + tabId + '">' +
        '<span class="help-banner-icon" aria-hidden="true">💡</span>' +
        '<span class="help-banner-text"><b>' + escapeHtml(h.title) + ':</b> ' + escapeHtml(h.text) + '</span>' +
        '<span class="help-banner-actions">' +
        '<button type="button" class="help-banner-more" onclick="helpShowTab(\'' + tabId + '\')">Ver más</button>' +
        '<button type="button" class="help-banner-ok" onclick="helpDismiss(\'' + tabId + '\')" aria-label="Cerrar ayuda de esta pestaña">Entendido ✓</button>' +
        '</span></div>';
}

/** Botón ℹ️ para poner junto al título de una pestaña: reabre la ayuda aunque el banner ya se haya descartado. */
function helpTabButtonHTML(tabId) {
    if (!HELP_TABS[tabId]) return '';
    return '<button type="button" class="help-tab-btn" onclick="helpShowTab(\'' + tabId + '\')" aria-label="Ayuda de esta pestaña" title="Ayuda de esta pestaña">ℹ️</button>';
}

/**
 * v16.0 — Inserta el banner de ayuda como PRIMER elemento del contenedor cacheado de una
 * pestaña (tp-, inv-, pn- no-Alpine), sin tener que tocar cada función de render:
 * tabCacheSwitch() posee y reemplaza por completo el innerHTML de "<tabId>-cached" en cada
 * re-render, así que el banner se re-inserta aquí después. Idempotente (no duplica) y
 * respeta kia_help_dismissed (helpBannerHTML devuelve '' si el usuario ya lo cerró).
 */
function helpInjectBannerIntoCachedTab(moduleId, tabId) {
    if (typeof helpBannerHTML !== 'function') return;
    var target = document.getElementById(tabId + '-cached');
    if (!target || target.querySelector('#help-banner-' + tabId)) return;
    var html = helpBannerHTML(tabId);
    if (html) target.insertAdjacentHTML('afterbegin', html);
}

/** Versión diferida (doble RAF) — usar tras tpRender()/invRender()/pnRender(), que pueden
 *  posponer el render real de la pestaña vía tabCacheSwitch(). */
function helpInjectBannerDeferred(moduleId, tabId) {
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            helpInjectBannerIntoCachedTab(moduleId, tabId);
        });
    });
}

function _helpCloseModal() {
    document.querySelectorAll('.custom-modal-overlay').forEach(function(o) { if (o.parentNode) o.parentNode.removeChild(o); });
}

/** Modal completo de ayuda de una pestaña (título + texto + tips accionables). */
function helpShowTab(tabId) {
    var h = HELP_TABS[tabId];
    if (!h) { showToast('Sin ayuda registrada para esta sección', 'info'); return; }
    var html = '<div style="text-align:left;font-size:13px;line-height:1.6;">' + escapeHtml(h.text) + '</div>';
    if (h.tips && h.tips.length) {
        html += '<ul style="text-align:left;margin:10px 0 0;padding-left:18px;font-size:12.5px;line-height:1.6;">' +
            h.tips.map(function(t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('') + '</ul>';
    }
    html += '<div style="margin-top:14px;text-align:left;border-top:1px solid var(--border);padding-top:10px;">' +
        '<button type="button" class="help-banner-more" onclick="helpShowGlossary()">📖 Ver glosario del laboratorio</button></div>';
    showModal({ title: '💡 ' + h.title, message: html, showCancel: false, confirmText: 'Entendido', type: 'info' });
}

// ── Glosario del laboratorio (v16.0 · C5) ──
var HELP_GLOSSARY = [
    { term: 'Soak', def: 'Tiempo de reposo térmico del vehículo en la cámara climatizada antes de la prueba, para que el motor y los fluidos lleguen a una temperatura estable y controlada (mínimo 12h estándar).' },
    { term: 'Preacondicionamiento', def: 'Conjunto de pasos previos a la prueba (ciclo de manejo, verificación de combustible/llantas/DTCs) que aseguran que el vehículo llega en condiciones válidas para medir emisiones.' },
    { term: 'Doble ciego', def: 'El Liberador captura los resultados de gases y firma; después el Aprobador los vuelve a capturar SIN ver los del Liberador. Si coinciden, se libera; si no, se marca desacuerdo y se revisa.' },
    { term: 'CoP (Conformity of Production)', def: 'Conformidad de Producción: validación estadística de que los vehículos que salen de línea siguen cumpliendo los límites de emisión certificados, usando muestreo secuencial de varios VINes de la misma familia.' },
    { term: 'Quality Audit', def: 'Auditoría de calidad interna (no regulatoria): verificación periódica de una familia fuera del esquema CoP, aplicable según la política del laboratorio por región.' },
    { term: 'VIN', def: 'Número de Identificación Vehicular: 17 caracteres alfanuméricos únicos por vehículo. No usa las letras I, O ni Q (se confunden con 1 y 0).' },
    { term: 'ETW', def: 'Estimated Test Weight — Peso Estimado de Prueba: la masa que el dinamómetro simula para reproducir la inercia real del vehículo durante el ciclo.' },
    { term: 'Target / Dyno Set (A, B, C)', def: 'Coeficientes de resistencia al avance del coast-down (A = fuerza constante, B = proporcional a la velocidad, C = proporcional al cuadrado de la velocidad). Target = valor teórico calculado; Dyno Set = valor configurado en el dinamómetro. Deben coincidir para que la prueba sea válida.' },
    { term: 'Bin / LimitSet', def: 'Nombre del conjunto de límites regulatorios que aplica a una prueba (ej. "EURO-5", "SULEV 30"). Define qué gases se miden y cuánto pueden emitir como máximo.' },
    { term: '% del límite', def: 'El valor medido de un gas expresado como porcentaje de su límite regulatorio. 100% = justo en el límite; por encima de 100% = FALLA.' },
    { term: 'FE por balance de carbono', def: 'Estimación informativa (NO certificada) del rendimiento de combustible calculada a partir del CO₂ medido, usando la relación de balance de carbono del combustible.' },
    { term: 'I-MR (carta de control)', def: 'Carta estadística de Individuos y Rango Móvil: grafica cada resultado en el tiempo junto a la media y los límites de control (±3σ), para detectar si el proceso se sale de su comportamiento normal.' },
    { term: 'Reglas de Nelson (R1/R2/R3)', def: 'Reglas de alarma sobre la carta I-MR: R1 = un punto fuera de ±3σ; R2 = 8 puntos seguidos del mismo lado de la media (corrimiento); R3 = 6 puntos seguidos subiendo o bajando (tendencia). Cualquiera enciende la alarma de esa familia.' },
    { term: 'Cpk', def: 'Índice de capacidad del proceso frente al límite regulatorio: (Límite − media) / 3σ. Cpk ≥ 1.33 = proceso capaz; Cpk < 1.0 = resultados peligrosamente cerca del límite.' },
    { term: 'UCL / LCL', def: 'Límite de Control Superior / Inferior de una carta de control (media ± 3σ). NO son el límite regulatorio — son el rango normal de variación del propio proceso del laboratorio.' },
    { term: 'σ (sigma)', def: 'Desviación estándar del proceso, estimada a partir del rango móvil entre ensayos consecutivos (σ = MR̄ / 1.128). Mide qué tan dispersos están los resultados.' },
    { term: 'Familia de emisiones', def: 'Agrupación de configuraciones de vehículo que comparten Modelo, Motor, Transmisión, Año modelo y Regulación — se prueban y analizan juntas porque su comportamiento de emisiones es equivalente.' },
    { term: 'Déficit / ratio por 1000', def: 'Cuántas pruebas exige una configuración según su volumen de producción (ratio de pruebas por cada 1000 unidades fabricadas). Déficit = pruebas requeridas menos las ya realizadas.' },
    { term: 'Tier / Prioridad (P1..P5)', def: 'Nivel de urgencia asignado a cada configuración pendiente en el Plan de Recuperación. P1 = más urgente (ej. COP Europa), hasta P5 (ej. eléctricos) — se atienden en ese orden según la capacidad disponible.' },
    { term: 'PSI', def: 'Libras por pulgada cuadrada — unidad de presión con la que se mide el contenido de los cilindros de gas de calibración.' },
    { term: 'DTC', def: 'Diagnostic Trouble Code — Código de Falla Diagnóstica almacenado en la computadora del vehículo (ECU). Un vehículo con DTCs confirmados o permanentes no es apto para la prueba de emisiones.' },
    { term: 'Carta de captura diaria', def: 'El registro diario de PSI de cada cilindro de gas en uso y del nivel de los tanques de combustible. La plataforma usa estas lecturas para aprender cuánto consume cada tipo de prueba y predecir si el inventario alcanza.' },
    { term: 'Trazabilidad (calibración)', def: 'Organismo de acreditación que respalda el certificado de calibración de un instrumento (ej. EMA, ANAB, NVLAP) — evidencia de que la medición es confiable y auditable.' },
    { term: 'EMA / ANAB / NVLAP', def: 'Organismos de acreditación de laboratorios de calibración: EMA (México), ANAB y NVLAP (Estados Unidos). Un certificado con su sello es trazable internacionalmente.' },
    { term: 'Calibración Interna vs Externa', def: 'Interna: la realiza el propio laboratorio con sus patrones. Externa: la realiza un proveedor certificado fuera del laboratorio (en sitio o en sus instalaciones).' },
    { term: 'NO OPERABLE', def: 'Estatus que debe asignarse a un equipo crítico cuya calibración está vencida — no debe usarse para pruebas hasta recalibrarse (COP15-F11).' },
    { term: 'Crítico NMX', def: 'Marca si un instrumento es crítico para la validez de la prueba bajo la normatividad mexicana (NMX) — si vence su calibración, dispara el aviso de NO OPERABLE.' },
    { term: 'Semana del Plan Maestro', def: 'Numeración simple 1-52 del año (similar a WEEKNUM de Excel) usada para programar y dar seguimiento al mantenimiento preventivo — no es la semana ISO 8601.' }
];

function helpShowGlossary() {
    var html = '<div style="text-align:left;">' +
        '<input type="text" id="help-glossary-search" aria-label="Buscar término en el glosario" placeholder="Buscar término…" oninput="helpFilterGlossary(this.value)" ' +
        'style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;box-sizing:border-box;">' +
        '<div id="help-glossary-list" style="max-height:360px;overflow-y:auto;"></div></div>';
    showModal({ title: '📖 Glosario del laboratorio', message: html, showCancel: false, confirmText: 'Cerrar', type: 'info' });
    helpFilterGlossary('');
    setTimeout(function() { var i = document.getElementById('help-glossary-search'); if (i) i.focus(); }, 60);
}
function helpFilterGlossary(q) {
    var list = document.getElementById('help-glossary-list');
    if (!list) return;
    var qn = (q || '').toLowerCase().trim();
    var items = HELP_GLOSSARY.filter(function(g) {
        return !qn || g.term.toLowerCase().indexOf(qn) !== -1 || g.def.toLowerCase().indexOf(qn) !== -1;
    });
    if (!items.length) { list.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px 0;">Sin resultados. Prueba con otra palabra.</div>'; return; }
    list.innerHTML = items.map(function(g) {
        return '<div style="padding:8px 0;border-bottom:1px solid var(--border);">' +
            '<div style="font-weight:700;font-size:13px;">' + escapeHtml(g.term) + '</div>' +
            '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + escapeHtml(g.def) + '</div></div>';
    }).join('');
}

/** Lanza un tour (o avisa por toast si estamos en móvil, donde el overlay del tour se oculta por CSS). */
function helpStartTourFromMenu(moduleKey) {
    _helpCloseModal();
    if (window.innerWidth < 768) {
        showToast('El recorrido guiado funciona mejor en pantalla grande (tablet/PC). Usa los banners 💡 y los botones ? de cada pestaña.', 'info');
        return;
    }
    if (typeof startTour === 'function') startTour(moduleKey);
}

/** Menú del botón ? del topbar: tour de este módulo, tour general, glosario. */
function helpMenuOpen() {
    var moduleKey = (typeof PLATFORM_SECTION_MAP !== 'undefined') ? (PLATFORM_SECTION_MAP[_currentPlatform] || _currentPlatform) : 'today';
    var moduleLabels = { today: 'Hoy', testplan: 'Plan', cop15: 'Pruebas', inventory: 'Inventario', panel: 'Datos', cop: 'CoP' };
    var moduleLabel = moduleLabels[moduleKey] || moduleKey;
    var html = '<div style="display:flex;flex-direction:column;gap:8px;text-align:left;">' +
        '<button type="button" class="help-menu-item" onclick="helpStartTourFromMenu(\'' + moduleKey + '\')">🧭 Recorrido guiado de ' + escapeHtml(moduleLabel) + '</button>' +
        '<button type="button" class="help-menu-item" onclick="helpStartTourFromMenu(\'global\')">🗺️ Recorrido general de la plataforma</button>' +
        '<button type="button" class="help-menu-item" onclick="_helpCloseModal();helpShowGlossary()">📖 Glosario del laboratorio</button>' +
        '</div>';
    showModal({ title: '❓ Ayuda', message: html, showCancel: false, confirmText: 'Cerrar', type: 'info' });
}

// ══════════════════════════════════════════════════════════════════════
// [R5-M2] Auto-Save Engine (on blur / visibility change)
// ══════════════════════════════════════════════════════════════════════

var _autoSaveRegistry = {};

/**
 * Register a module for auto-save on blur.
 * @param {string} module - Module id (e.g. 'cop15')
 * @param {Function} saveFn - The save function to call
 * @param {Function} dirtyFn - Returns true if there are unsaved changes
 */
function autoSaveInit(module, saveFn, dirtyFn) {
    _autoSaveRegistry[module] = { saveFn: saveFn, dirtyFn: dirtyFn, lastSaveTs: 0 };
}

function _autoSaveFlush(source) {
    Object.keys(_autoSaveRegistry).forEach(function(mod) {
        var reg = _autoSaveRegistry[mod];
        if (reg.dirtyFn && reg.dirtyFn()) {
            reg.saveFn();
            reg.lastSaveTs = Date.now();
            _autoSaveIndicator(mod);
        }
    });
}

function _autoSaveIndicator(module) {
    var ind = document.getElementById('autosave-indicator');
    if (!ind) {
        ind = document.createElement('div');
        ind.id = 'autosave-indicator';
        ind.className = 'autosave-indicator';
        document.body.appendChild(ind);
    }
    var now = new Date();
    var timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    ind.textContent = '✓ Guardado ' + timeStr;
    ind.classList.remove('autosave-show');
    void ind.offsetWidth;
    ind.classList.add('autosave-show');
}

// Listen for visibility change and window blur
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') _autoSaveFlush('visibilitychange');
});
window.addEventListener('blur', function() { _autoSaveFlush('windowblur'); });
window.addEventListener('beforeunload', function(e) {
    var dirty = Object.keys(_autoSaveRegistry).some(function(mod) {
        return _autoSaveRegistry[mod].dirtyFn && _autoSaveRegistry[mod].dirtyFn();
    });
    if (dirty) {
        _autoSaveFlush('beforeunload');
    }
});

// ══════════════════════════════════════════════════════════════════════
// [R5-M8] Templates & Quick Presets — Unified Template Engine
// ══════════════════════════════════════════════════════════════════════

var _templates = safeParse('kia_templates', { cop15: [], results: [], inventory: [] });

function templateSave(module, name, data) {
    if (!_templates[module]) _templates[module] = [];
    // Check limit
    if (_templates[module].length >= 20) {
        // Remove least used
        _templates[module].sort(function(a, b) { return (a.usageCount || 0) - (b.usageCount || 0); });
        _templates[module].shift();
    }
    _templates[module].push({
        id: 'tpl_' + Date.now(),
        name: name,
        data: data,
        usageCount: 0,
        createdAt: new Date().toISOString()
    });
    _templatesPersist();
    showToast('Plantilla "' + name + '" guardada', 'success');
}

function templateApply(module, templateId) {
    var tpl = (_templates[module] || []).find(function(t) { return t.id === templateId; });
    if (!tpl) { showToast('Plantilla no encontrada', 'error'); return null; }
    tpl.usageCount = (tpl.usageCount || 0) + 1;
    _templatesPersist();
    return tpl.data;
}

function templateDelete(module, templateId) {
    if (!_templates[module]) return;
    _templates[module] = _templates[module].filter(function(t) { return t.id !== templateId; });
    _templatesPersist();
    showToast('Plantilla eliminada', 'info');
}

function templateGetAll(module) {
    return (_templates[module] || []).sort(function(a, b) { return (b.usageCount || 0) - (a.usageCount || 0); });
}

function _templatesPersist() {
    localStorage.setItem('kia_templates', JSON.stringify(_templates));
}

/**
 * Render a template manager modal for a given module.
 */
function templateRenderManager(module, applyCallback) {
    var list = templateGetAll(module);
    var html = '<div style="max-height:50vh;overflow-y:auto;">';
    if (list.length === 0) {
        html += '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px;">No hay plantillas guardadas</div>';
    } else {
        list.forEach(function(tpl) {
            html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);">';
            html += '<div>';
            html += '<div style="font-size:12px;font-weight:700;color:var(--text);">' + escapeHtml(tpl.name) + '</div>';
            html += '<div style="font-size: var(--fs-xs);color:var(--muted);">Usado ' + (tpl.usageCount || 0) + 'x · ' + new Date(tpl.createdAt).toLocaleDateString('es-MX') + '</div>';
            html += '</div>';
            html += '<div style="display:flex;gap:6px;">';
            html += '<button onclick="var d=templateApply(\'' + module + '\',\'' + tpl.id + '\');if(d && typeof ' + (applyCallback || 'null') + '===\'function\') ' + (applyCallback || 'null') + '(d);closeModal();" class="btn-primary" style="padding:4px 12px;font-size: var(--fs-xs);">Aplicar</button>';
            html += '<button onclick="templateDelete(\'' + module + '\',\'' + tpl.id + '\');templateRenderManager(\'' + module + '\',\'' + (applyCallback || '') + '\');" style="padding:4px 8px;font-size: var(--fs-xs);background:none;border:1px solid var(--danger-fill);color:var(--danger-text);border-radius:4px;cursor:pointer;">✕</button>';
            html += '</div></div>';
        });
    }
    html += '</div>';
    showModal(html, 'Plantillas — ' + module.toUpperCase());
}

/**
 * Render quick-access preset buttons for a module.
 * @param {string} module - Module name
 * @param {string} containerId - Element to insert buttons into
 * @param {string} applyCallback - Function name to call with template data
 */
// ══════════════════════════════════════════════════════════════════════
// [R5-M1] Immersive Mode — App-like fullscreen experience
// ══════════════════════════════════════════════════════════════════════

var _immersiveActive = false;

function immersiveToggle() {
    _immersiveActive ? immersiveExit() : immersiveEnter();
}

// v17.9: sincroniza etiqueta y title del ítem "Pantalla completa" del menú "⋯".
function _immersiveSyncButton(active) {
    var btn = document.getElementById('immersive-toggle-btn');
    if (!btn) return;
    var label = btn.querySelector('.tbm-label');
    var text = active ? 'Salir de pantalla completa' : 'Pantalla completa';
    if (label) label.textContent = text;
    btn.title = active ? 'Salir del Modo App (pantalla completa)' : 'Modo App (pantalla completa)';
    btn.setAttribute('aria-label', text);
}

function immersiveEnter() {
    _immersiveActive = true;
    document.body.classList.add('immersive-mode');
    // Request fullscreen
    var docEl = document.documentElement;
    if (docEl.requestFullscreen) docEl.requestFullscreen().catch(function(){});
    else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
    // v17.9: el botón es un ítem de menú (icono + etiqueta). Reescribir su
    // innerHTML borraba la etiqueta y dejaba una fila con un icono suelto.
    _immersiveSyncButton(true);
    localStorage.setItem('kia_immersive_prefs', '1');
    showToast('Modo App activado', 'success');
}

function immersiveExit() {
    _immersiveActive = false;
    document.body.classList.remove('immersive-mode');
    if (document.exitFullscreen) document.exitFullscreen().catch(function(){});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    _immersiveSyncButton(false);
    localStorage.removeItem('kia_immersive_prefs');
}

// Auto-collapse header on scroll down, reveal on scroll up
(function() {
    var lastScrollY = 0;
    var ticking = false;
    window.addEventListener('scroll', function() {
        if (!_immersiveActive) return;
        if (!ticking) {
            requestAnimationFrame(function() {
                var bar = document.querySelector('.platform-bar');
                if (!bar) return;
                var currentY = window.scrollY;
                if (currentY > lastScrollY && currentY > 80) {
                    bar.classList.add('header-hidden');
                } else {
                    bar.classList.remove('header-hidden');
                }
                lastScrollY = currentY;
                ticking = false;
            });
            ticking = true;
        }
    });
})();

// Listen for fullscreen exit (ESC key) to sync state
document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement && _immersiveActive) {
        immersiveExit();
    }
});

// ── Splash Screen ──
function splashShow() {
    var splash = document.getElementById('splash-screen');
    if (!splash) {
        splash = document.createElement('div');
        splash.id = 'splash-screen';
        splash.className = 'splash-screen';
        splash.innerHTML =
            '<div class="splash-content">' +
            '<div class="splash-logo">KIA</div>' +
            '<div class="splash-subtitle">Laboratorio de Emisiones</div>' +
            '<div class="splash-bar-track"><div class="splash-bar-fill" id="splash-progress"></div></div>' +
            '<div class="splash-status" id="splash-status">Iniciando...</div>' +
            '</div>';
        document.body.appendChild(splash);
    }
    splash.style.display = 'flex';
}

function splashUpdate(msg, pct) {
    var statusEl = document.getElementById('splash-status');
    var progressEl = document.getElementById('splash-progress');
    if (statusEl) statusEl.textContent = msg;
    if (progressEl) progressEl.style.width = pct + '%';
}

function splashHide() {
    var splash = document.getElementById('splash-screen');
    if (!splash) return;
    splash.classList.add('splash-exit');
    setTimeout(function() { splash.style.display = 'none'; }, 500);
}

// ══════════════════════════════════════════════════════════════════════
// [R5-M4] Micro-Animations & Visual Polish — JS Helpers
// ══════════════════════════════════════════════════════════════════════

/**
 * Animate a number counting from `from` to `to` inside an element.
 * @param {HTMLElement} el - The element to animate
 * @param {number} to - Target value
 * @param {object} [opts] - Options: duration (ms), suffix (e.g. '%'), decimals
 */
function animateCounter(el, to, opts) {
    if (!el) return;
    opts = opts || {};
    var duration = opts.duration || 800;
    var suffix = opts.suffix || '';
    var decimals = opts.decimals || 0;
    var from = parseFloat(el.dataset.animValue) || 0;
    el.dataset.animValue = to;

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = (decimals > 0 ? to.toFixed(decimals) : Math.round(to)) + suffix;
        return;
    }

    var startTime = null;
    function step(ts) {
        if (!startTime) startTime = ts;
        var progress = Math.min((ts - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        var current = from + (to - from) * eased;
        el.textContent = (decimals > 0 ? current.toFixed(decimals) : Math.round(current)) + suffix;
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            if (from !== to) el.classList.add('anim-counter-bounce');
            setTimeout(function(){ el.classList.remove('anim-counter-bounce'); }, 500);
        }
    }
    requestAnimationFrame(step);
}

/**
 * Apply staggered fade-in animation to child elements of a container.
 * @param {HTMLElement} container - Parent element
 * @param {string} [selector] - Child selector (default: direct children)
 * @param {number} [delayMs] - Delay between items in ms (default: 40)
 */
function animateStaggerChildren(container, selector, delayMs) {
    if (!container || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    delayMs = delayMs || 40;
    var children = selector ? container.querySelectorAll(selector) : container.children;
    for (var i = 0; i < children.length; i++) {
        children[i].classList.add('anim-stagger');
        children[i].style.animationDelay = (i * delayMs) + 'ms';
    }
}

/**
 * Flash-highlight an element as newly inserted.
 */
/**
 * Animate removal of an element (slide-out then remove from DOM).
 */
/**
 * Show confetti burst at a position (CSS-only, lightweight).
 * @param {number} [x] - Center X (default: viewport center)
 * @param {number} [y] - Center Y (default: viewport center)
 */
function animateConfetti(x, y) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var container = document.createElement('div');
    container.className = 'anim-confetti-container';
    if (x !== undefined && y !== undefined) {
        container.style.left = x + 'px';
        container.style.top = y + 'px';
    }
    var colors = ['#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4'];
    for (var i = 0; i < 6; i++) {
        var p = document.createElement('div');
        p.className = 'anim-confetti-particle';
        p.style.backgroundColor = colors[i];
        p.style.setProperty('--cx', (Math.random() * 120 - 60) + 'px');
        p.style.setProperty('--cy', (Math.random() * -100 - 30) + 'px');
        p.style.setProperty('--cr', (Math.random() * 720 - 360) + 'deg');
        p.style.animationDelay = (i * 50) + 'ms';
        container.appendChild(p);
    }
    document.body.appendChild(container);
    setTimeout(function(){ if (container.parentNode) container.parentNode.removeChild(container); }, 1800);
}

/**
 * Show skeleton loading placeholders in a container.
 * @param {HTMLElement} container - Where to show skeletons
 * @param {number} [count] - Number of skeleton items (default: 3)
 */
/**
 * Build a progress ring SVG string.
 * @param {number} pct - Percentage 0-100
 * @param {number} size - SVG size in px
 * @param {string} color - Stroke color
 * @returns {string} SVG HTML
 */
// ══════════════════════════════════════════════════════════════════════
// [R6] Alpine.js Reactive Infrastructure
// ══════════════════════════════════════════════════════════════════════

document.addEventListener('alpine:init', function() {
    // Global shared store
    Alpine.store('app', {
        currentUser: null,
        init: function() {
            this.currentUser = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
        }
    });

    // Register Panel module as Alpine component
    if (typeof panelAlpineComponent === 'function') {
        Alpine.data('panelModule', panelAlpineComponent);
    }
});

function buildProgressRing(pct, size, color) {
    var r = (size - 6) / 2;
    var c = Math.PI * 2 * r;
    var offset = c - (pct / 100) * c;
    return '<svg width="' + size + '" height="' + size + '" style="display:block;">' +
        '<circle cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="4"/>' +
        '<circle class="progress-ring-circle" cx="' + size/2 + '" cy="' + size/2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '"/>' +
        '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="' + color + '" font-size="' + Math.round(size/3.5) + '" font-weight="800">' + Math.round(pct) + '%</text>' +
        '</svg>';
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7] HELPER FUNCTIONS                                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7GoToVehicle(vehicleId, gotoSection) {
    switchPlatform('cop15');
    setTimeout(function() {
        if (gotoSection === 'approval-tab') {
            var tabEl = document.querySelector('.tab[data-tab="liberacion"]');
            if (tabEl) tabEl.click();
            setTimeout(function() {
                if (typeof libSwitchSubtab === 'function') libSwitchSubtab('aprobador');
                var sel = document.getElementById('approvalVehSelect');
                if (sel) { sel.value = vehicleId; if (typeof loadApproval === 'function') loadApproval(); }
            }, 200);
        } else if (gotoSection === 'release-tab' || gotoSection === 'release-action') {
            var tabEl = document.querySelector('.tab[data-tab="liberacion"]');
            if (tabEl) tabEl.click();
            setTimeout(function() {
                if (typeof libSwitchSubtab === 'function') libSwitchSubtab('liberador');
                var sel = document.getElementById('releaseVehSelect');
                if (sel) { sel.value = vehicleId; if (typeof loadRelease === 'function') loadRelease(); }
            }, 200);
        } else {
            var tabEl = document.querySelector('.tab[data-tab="seguimiento"]');
            if (tabEl) tabEl.click();
            setTimeout(function() {
                var sel = document.getElementById('activeVehSelect');
                if (sel) { sel.value = vehicleId; loadVehicle(); }
                // Open specific accordion if requested
                if (gotoSection) {
                    setTimeout(function() {
                        var acc = document.getElementById(gotoSection);
                        if (acc && acc.tagName === 'DETAILS') acc.open = true;
                        else if (acc) acc.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                }
            }, 200);
        }
    }, 300);
}

// [V7-D2] Floating Next Step Banner
function v7UpdateNextStepBanner() {
    var banner = document.getElementById('v7-next-step-banner');
    if (!banner) return;
    if (!activeVehicleId) { banner.classList.remove('show'); return; }
    var vehicle = (db.vehicles || []).find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle || vehicle.status === 'archived') { banner.classList.remove('show'); return; }
    var step = typeof getNextStep === 'function' ? getNextStep(vehicle) : null;
    if (!step) { banner.classList.remove('show'); return; }
    banner.innerHTML = '<span class="v7-next-step-icon">' + step.icon + '</span>' +
        '<span class="v7-next-step-text">Siguiente: ' + step.action + '</span>' +
        '<button class="v7-next-step-go" onclick="v7GoToVehicleStep(\'' + (step.goto || '') + '\')">&rarr;</button>';
    banner.classList.add('show');
}

function v7GoToVehicleStep(gotoSection) {
    if (!gotoSection) return;
    if (gotoSection === 'approval-tab') {
        var tabEl = document.querySelector('.tab[data-tab="liberacion"]');
        if (tabEl) tabEl.click();
        setTimeout(function() {
            if (typeof libSwitchSubtab === 'function') libSwitchSubtab('aprobador');
            var sel = document.getElementById('approvalVehSelect');
            if (sel && activeVehicleId) { sel.value = activeVehicleId; if (typeof loadApproval === 'function') loadApproval(); }
        }, 200);
    } else if (gotoSection === 'release-tab' || gotoSection === 'release-action') {
        var tabEl = document.querySelector('.tab[data-tab="liberacion"]');
        if (tabEl) tabEl.click();
        setTimeout(function() {
            if (typeof libSwitchSubtab === 'function') libSwitchSubtab('liberador');
            var sel = document.getElementById('releaseVehSelect');
            if (sel && activeVehicleId) { sel.value = activeVehicleId; if (typeof loadRelease === 'function') loadRelease(); }
        }, 200);
    } else if (gotoSection === 'soak-section') {
        var soakEl = document.getElementById('soak-section') || document.getElementById('acc-soak');
        if (soakEl) {
            if (soakEl.tagName === 'DETAILS') soakEl.open = true;
            soakEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        var acc = document.getElementById(gotoSection);
        if (acc) {
            if (acc.tagName === 'DETAILS') acc.open = true;
            acc.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Focus first input
            setTimeout(function() {
                var firstInput = acc.querySelector('input:not([type=hidden]),select,textarea');
                if (firstInput) firstInput.focus();
            }, 400);
        }
    }
}
