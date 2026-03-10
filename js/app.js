// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — App Core (Config, Utilities, Platform, Init)          ║
// ╚══════════════════════════════════════════════════════════════════════╝

window.addEventListener('error', (e) => {
  console.error('🔥 Error JS:', e.message, 'en', e.filename, 'línea', e.lineno);
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

let db = JSON.parse(localStorage.getItem('kia_db_v11')) || {
  version: '11.0',
  vehicles: [],
  lastId: 0
};

let activeVehicleId = null;
let currentFilter = 'all';
window._histFilterStatus = 'all';
window._histFilterVin = '';
window._histFilterYear = '';
window._histFilterMonth = '';
window._histPageSize = 25;
let currentUnitSystem = 'SI';




// ======================================================================
// [M01] UTILIDADES GENERALES]
// ======================================================================

    function saveDB() {
        localStorage.setItem('kia_db_v11', JSON.stringify(db));
    }

// ── View Mode (Compact/Detailed) ──
var _viewModes = {};
(function loadViewModes(){
    try { _viewModes = JSON.parse(localStorage.getItem('kia_viewModes') || '{}'); } catch(e){ _viewModes = {}; }
})();
function toggleViewMode(module) {
    _viewModes[module] = _viewModes[module] === 'compact' ? 'detailed' : 'compact';
    localStorage.setItem('kia_viewModes', JSON.stringify(_viewModes));
    // Re-render appropriate module
    if (module === 'kanban' && typeof renderKanban === 'function') renderKanban();
    if (module === 'inv-gases' && typeof invRender === 'function') invRender();
    if (module === 'tp-tested' && typeof tpRender === 'function') tpRender();
}
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

    var overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

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

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
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

function showAlert(message, opts) {
    opts = opts || {};
    showModal({
        title: opts.title || 'Aviso',
        message: message,
        confirmText: opts.confirmText || 'Entendido',
        type: opts.type || 'info',
        showCancel: false,
        onConfirm: opts.onConfirm || null
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
    container.appendChild(toast);
    setTimeout(function(){ if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3200);
}


    function closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
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
function isCountsForPlan(purpose) {
  return purpose === 'COP-Emisiones' || purpose === 'EO-Emisiones';
}
function isOBDPurpose(purpose) {
  return purpose === 'COP-OBD2' || purpose === 'EO-OBD2' || purpose === 'ND-OBD2';
}


function nowLocalDatetimeValue() {
  const d = new Date();
  // Ajuste para que datetime-local muestre hora local correcta
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,16); // "YYYY-MM-DDTHH:MM"
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
// ║  [M15] PLATFORM SWITCHER                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝

var PLATFORM_ORDER = ['cop15', 'testplan', 'results', 'inventory', 'panel'];
var _currentPlatform = 'cop15';

function switchPlatform(platform, swipeDir) {
    if (platform === _currentPlatform) return;

    var oldSection = document.getElementById('platform-' + _currentPlatform);
    var newSection = document.getElementById('platform-' + platform);

    // Swipe animation
    if (swipeDir && oldSection && newSection) {
        var exitClass = swipeDir === 'left' ? 'swipe-exit-left' : 'swipe-exit-right';
        var enterClass = swipeDir === 'left' ? 'swipe-enter-left' : 'swipe-enter-right';

        oldSection.classList.add(exitClass);
        setTimeout(function() {
            oldSection.classList.remove('active', exitClass);
            newSection.classList.add('active', enterClass);
            setTimeout(function() { newSection.classList.remove(enterClass); }, 260);
        }, 240);
    } else {
        document.querySelectorAll('.platform-section').forEach(s => s.classList.remove('active'));
        newSection.classList.add('active');
    }

    // Update top tabs
    document.querySelectorAll('.platform-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('ptab-' + platform).classList.add('active');

    // Update bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
    var bnavEl = document.getElementById('bnav-' + platform);
    if (bnavEl) bnavEl.classList.add('active');

    // Hide floating action bar when leaving COP15
    if (platform !== 'cop15' && typeof toggleActionBar === 'function') toggleActionBar(false);

    // Theme
    const isDark = platform === 'testplan' || platform === 'results' || platform === 'inventory' || platform === 'panel';
    document.body.style.background = isDark ? 'var(--tp-dark)' : 'var(--bg)';
    document.body.style.color = isDark ? 'var(--tp-text)' : 'var(--text)';

    _currentPlatform = platform;

    if (platform === 'testplan') { tpRender(); tpUpdateBadges(); }
    if (platform === 'results') { if(typeof raRestoreTab==='function') raRestoreTab(); else raRender(); raUpdateBadges(); }
    if (platform === 'inventory') { invPreloadData(); if(typeof invRestoreTab==='function') invRestoreTab(); else invRender(); invUpdateBadges(); }
    if (platform === 'panel') { pnRender(); pnUpdateBadges(); }
    if (platform === 'cop15') {
        const active = db.vehicles.filter(v => v.status !== 'archived').length;
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

    window.scrollTo(0, 0);
}

// ── Global VIN Search ──
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

    // Search Results Analyzer
    if (typeof raState !== 'undefined' && raState.tests) {
        var seenVins = {};
        raState.tests.forEach(function(t) {
            var tVin = (t.vin || t.VIN || '').toUpperCase();
            if (tVin.includes(q) && !seenVins[tVin]) {
                seenVins[tVin] = true;
                results.push({
                    module: 'Results',
                    icon: '🧪',
                    vin: tVin,
                    detail: (t.regulation || t.testDesc || '') + (t.verdict ? ' — ' + t.verdict : ''),
                    date: t.date || t.importDate || '',
                    action: 'switchPlatform("results")'
                });
            }
        });
    }

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

    if (results.length === 0) {
        var safeQuery = query.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        res.innerHTML = '<div style="padding:12px;background:#1e293b;border:1px solid #334155;border-radius:0 0 8px 8px;color:#94a3b8;font-size:0.85rem;text-align:center;">No se encontraron resultados para "' + safeQuery + '"</div>';
        return;
    }

    var html = '<div style="background:#1e293b;border:1px solid #334155;border-radius:0 0 8px 8px;overflow:hidden;">';
    results.slice(0, 15).forEach(function(r) {
        html += '<div onclick="' + r.action + ';toggleGlobalSearch();" style="padding:10px 14px;border-bottom:1px solid #0f172a;cursor:pointer;display:flex;align-items:center;gap:10px;" onmouseover="this.style.background=\'#334155\'" onmouseout="this.style.background=\'transparent\'">';
        html += '<span style="font-size:16px;">' + r.icon + '</span>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:0.85rem;font-weight:600;color:#f1f5f9;">' + r.vin + '</div>';
        html += '<div style="font-size:0.75rem;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + r.detail + '</div>';
        html += '</div>';
        html += '<div style="text-align:right;">';
        html += '<span style="font-size:0.65rem;padding:2px 6px;border-radius:4px;background:rgba(99,102,241,0.15);color:#818cf8;">' + r.module + '</span>';
        if (r.date) html += '<div style="font-size:0.65rem;color:#64748b;margin-top:2px;">' + r.date + '</div>';
        html += '</div></div>';
    });
    if (results.length > 15) {
        html += '<div style="padding:8px;text-align:center;font-size:0.75rem;color:#64748b;">...y ' + (results.length - 15) + ' más</div>';
    }
    html += '</div>';
    res.innerHTML = html;
}

// ── Weekly Status PDF Report ──
function generateWeeklyStatusPDF() {
    if (typeof window.jspdf === 'undefined') {
        showToast('jsPDF no está disponible. Verifica la conexión CDN.', 'error');
        return;
    }
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

    // ── Section 3: Results Analyzer ──
    y = addSection('Results Analyzer — Emisiones', y);
    try {
        var raTests = (typeof raState !== 'undefined' && raState.tests) ? raState.tests : [];
        var importedThisWeek = raTests.filter(function(t) {
            var d = t.importDate || t.dateStr || '';
            return d >= weekAgoISO.slice(0, 10);
        }).length;
        var passCount = raTests.filter(function(t) { return typeof raTestVerdict === 'function' && raTestVerdict(t) === 'PASS'; }).length;
        var failCount = raTests.filter(function(t) { return typeof raTestVerdict === 'function' && raTestVerdict(t) === 'FAIL'; }).length;
        var passRate = raTests.length > 0 ? (passCount / raTests.length * 100).toFixed(1) : '—';

        y = addRow('Total pruebas', raTests.length, y);
        y = addRow('Importadas esta semana', importedThisWeek, y);
        y = addRow('Pass rate global', passRate + '%', y, passCount >= failCount ? [16, 185, 129] : [239, 68, 68]);
        y = addRow('PASS / FAIL', passCount + ' / ' + failCount, y);
    } catch (e) { y = addRow('Error', e.message, y, [239, 68, 68]); }
    y += 5;

    // ── Section 4: Inventario ──
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

    // Footer
    y += 10;
    doc.setDrawColor(200, 200, 200);
    doc.line(ML, y, ML + CW, y);
    y += 5;
    setF('italic', 8);
    doc.setTextColor(150, 150, 150);
    doc.text('Generado automáticamente por KIA EmLab Plataforma Integrada — ' + today.toISOString(), ML, y);

    doc.save('KIA-EmLab-Semanal-' + today.toISOString().slice(0, 10) + '.pdf');
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

    function initializeSystem() {
        // Auth gate — must be authenticated before initializing
        if (typeof authInit === 'function' && typeof authState !== 'undefined') {
            if (!authState.sessionActive) {
                if (typeof pnInit === 'function' && (!pnState || pnState.operators.length === 0)) pnInit();
                authInit();
                if (!authState.sessionActive) return; // Wait for login
            }
        }

        parseCSV();
        populateOperators();
        
        // Poblar selector inicial de MODELO
        const modelSelect = document.getElementById('cfg_model');
        const uniqueModels = [...new Set(allConfigurations.map(c => c.Modelo))].sort();
        modelSelect.innerHTML = '<option value="">Seleccionar...</option>';
        uniqueModels.forEach(model => {
            modelSelect.innerHTML += `<option value="${model}">${model}</option>`;
        });
        
        // Inicializar otros selectores
        updateSelectOptions(allConfigurations);
        document.getElementById('configCount').textContent = allConfigurations.length;

        // Initialize visual cascade tree
        if (typeof initCascadeTree === 'function') initCascadeTree();

        updateProgressBar();
        refreshAllLists();
        
	const now = new Date();
	const dt = now.toISOString().slice(0,16);
	if (document.getElementById('test_datetime') && !document.getElementById('test_datetime').value) {
  	document.getElementById('test_datetime').value = dt;
	}

        
        console.log('Sistema inicializado v11.0 CASCADE');

// --- Eventos Ventilador ---
const modeEl  = document.getElementById('test_fan_mode');
const speedEl = document.getElementById('test_fan_speed');

if (modeEl)  modeEl.addEventListener('change', updateFanFieldsByMode);
if (speedEl) speedEl.addEventListener('input', calculateFanFlowFromSpeed);


	initStatusPrevValue();

        // ═══ Init Test Plan Manager ═══
        tpInit();
        tpUpdateBadges();
        tpHookCascadeResult();
        raInit();

        // ═══ Panel Module ═══
        if (typeof pnInit === 'function') { pnInit(); pnUpdateBadges(); }

        // ═══ Restore Soak Timer if running ═══
        if (typeof soakTimerRestore === 'function') soakTimerRestore();

        // ═══ Firebase Cloud Sync (optional) ═══
        try {
            if (typeof fbInit === 'function') { fbInit(); fbHookSaves(); fbUpdateIndicator(); }
        } catch(fbErr) { console.error('Firebase init failed (non-blocking):', fbErr); }
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
    badge.style.display = unread > 0 ? 'inline-block' : 'none';
    badge.textContent = unread > 9 ? '9+' : unread;
}

function toggleNotificationCenter() {
    var el = document.getElementById('notification-center');
    if (!el) return;
    var vis = el.style.display !== 'none';
    el.style.display = vis ? 'none' : 'block';
    if (!vis) renderNotifications();
}

function renderNotifications() {
    var list = document.getElementById('notification-list');
    if (!list) return;
    if (_notificationLog.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;font-size:12px;">Sin notificaciones</div>';
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
    { label: 'COP15 Cascade', icon: '🔬', action: function(){ switchPlatform('cop15'); }, shortcut: 'Ctrl+1', cat: 'nav' },
    { label: 'Test Plan Manager', icon: '📊', action: function(){ switchPlatform('testplan'); }, shortcut: 'Ctrl+2', cat: 'nav' },
    { label: 'Results Analyzer', icon: '🧪', action: function(){ switchPlatform('results'); }, shortcut: 'Ctrl+3', cat: 'nav' },
    { label: 'Lab Inventory', icon: '📦', action: function(){ switchPlatform('inventory'); }, shortcut: 'Ctrl+4', cat: 'nav' },
    { label: 'Panel de Control', icon: '⚙️', action: function(){ switchPlatform('panel'); }, shortcut: 'Ctrl+5', cat: 'nav' },
    { label: 'Guardar Progreso', icon: '💾', action: function(){ if(typeof saveVehicleProgress==='function') saveVehicleProgress(); }, shortcut: 'Ctrl+S', cat: 'action' },
    { label: 'Generar PDF Semanal', icon: '📄', action: function(){ if(typeof generateWeeklyStatusPDF==='function') generateWeeklyStatusPDF(); }, cat: 'action' },
    { label: 'Exportar CSV Resultados', icon: '📊', action: function(){ if(typeof raExportCSV==='function') raExportCSV(); }, cat: 'action' },
    { label: 'Reiniciar Filtros Cascada', icon: '🔄', action: function(){ if(typeof resetFilters==='function') resetFilters(); if(typeof resetCascadeTree==='function') resetCascadeTree(); }, cat: 'action' },
    { label: 'Buscar VIN Global', icon: '🔍', action: function(){ toggleGlobalSearch(); }, cat: 'action' },
    { label: 'Generar Plan Smart', icon: '⚡', action: function(){ switchPlatform('testplan'); setTimeout(function(){ if(typeof tpSmartGenerate==='function') tpSmartGenerate(); }, 300); }, cat: 'action' },
    { label: 'Ver Kanban', icon: '📋', action: function(){ switchPlatform('cop15'); setTimeout(function(){ var t=document.querySelector('.tab[data-tab="kanban"]'); if(t)t.click(); }, 200); }, cat: 'nav' },
    { label: 'Ver Outliers', icon: '⚠️', action: function(){ switchPlatform('results'); setTimeout(function(){ raState.activeTab='ra-outliers'; raRender(); }, 200); }, cat: 'action' },
    { label: 'Ver Tendencias', icon: '📈', action: function(){ switchPlatform('results'); setTimeout(function(){ raState.activeTab='ra-trends'; raRender(); }, 200); }, cat: 'action' }
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
    _cmdFiltered = q ? _commandPaletteCommands.filter(function(c) {
        return c.label.toLowerCase().includes(q) || (c.cat && c.cat.includes(q));
    }) : _commandPaletteCommands;
    _cmdActiveIdx = 0;
    renderCommandResults();
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
    // Ctrl+1-5: Switch platform
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '5') {
        var platforms = ['cop15', 'testplan', 'results', 'inventory', 'panel'];
        e.preventDefault(); switchPlatform(platforms[parseInt(e.key) - 1]); return;
    }
    // Ctrl+S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (typeof saveVehicleProgress === 'function') saveVehicleProgress();
        return;
    }
});
