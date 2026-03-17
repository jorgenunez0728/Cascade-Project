/* ══════════════════════════════════════════════════════════════════════
   SOP LIBRARY MODULE — Standard Operating Procedures
   Guided workflows, checklists, and compliance tracking
   Prefix: sop*
   localStorage key: kia_sop_v1
   ══════════════════════════════════════════════════════════════════════ */

var sopState = {
    procedures: [],     // SOP definitions (templates)
    activeSessions: [], // Currently in-progress SOP executions
    history: [],        // Completed SOP executions
    currentTab: 'sop-procedures'
};

var SOP_STORAGE_KEY = 'kia_sop_v1';

/* ─── Built-in SOP Templates ─── */
var SOP_BUILTIN_TEMPLATES = [
    {
        id: 'sop-cop15-alta',
        name: 'Alta de Vehiculo COP15',
        category: 'cascade',
        cascadePhase: 'alta',
        description: 'Procedimiento completo para registrar un vehiculo nuevo en el sistema COP15.',
        icon: '🚗',
        steps: [
            {
                title: 'Seleccionar Proposito de Prueba',
                description: 'Elegir el tipo de prueba: COP-Emisiones, COP-OBD2, Nuevos Desarrollos, etc.',
                type: 'checklist',
                items: [
                    'Verificar que el proposito corresponde con la orden de trabajo',
                    'Confirmar tipo de prueba con supervisor si es necesario'
                ]
            },
            {
                title: 'Configurar Vehiculo',
                description: 'Usar el catalogo de configuraciones o ingreso manual para definir modelo, motor, transmision.',
                type: 'checklist',
                items: [
                    'Seleccionar modelo del vehiculo',
                    'Verificar año modelo y motor',
                    'Confirmar transmision y traccion',
                    'Revisar regulacion de emisiones aplicable'
                ]
            },
            {
                title: 'Registrar VIN',
                description: 'Ingresar el numero de identificacion vehicular de 17 digitos.',
                type: 'checklist',
                items: [
                    'Ingresar VIN completo (17 caracteres)',
                    'Verificar que el VIN no este duplicado en el sistema',
                    'Confirmar que el VIN coincide con el vehiculo fisico'
                ]
            },
            {
                title: 'Datos del Operador',
                description: 'Registrar quien realiza el alta y datos adicionales.',
                type: 'checklist',
                items: [
                    'Seleccionar operador responsable',
                    'Registrar odometro inicial',
                    'Agregar notas si aplica'
                ]
            },
            {
                title: 'Confirmar Alta',
                description: 'Revisar todos los datos y confirmar el registro.',
                type: 'checklist',
                items: [
                    'Revisar resumen de configuracion',
                    'Confirmar que todos los campos estan completos',
                    'Dar clic en Registrar Vehiculo'
                ]
            }
        ]
    },
    {
        id: 'sop-cop15-operacion',
        name: 'Operacion de Vehiculo COP15',
        category: 'cascade',
        cascadePhase: 'operacion',
        description: 'Procedimiento para la fase de operacion: preacondicionamiento, carga de datos y soak.',
        icon: '🔧',
        steps: [
            {
                title: 'Seleccionar Vehiculo Activo',
                description: 'Elegir el vehiculo en estado "Registrado" o "En Progreso" del selector.',
                type: 'checklist',
                items: [
                    'Verificar que el vehiculo tiene status correcto',
                    'Confirmar que es el vehiculo correcto (VIN visible)'
                ]
            },
            {
                title: 'Preacondicionamiento',
                description: 'Completar los ciclos de preacondicionamiento requeridos.',
                type: 'checklist',
                items: [
                    'Verificar combustible adecuado (nivel y tipo)',
                    'Realizar ciclos de preacondicionamiento segun norma',
                    'Registrar temperaturas iniciales',
                    'Verificar condiciones ambientales del laboratorio'
                ]
            },
            {
                title: 'Configurar Dynamometro',
                description: 'Ajustar parametros del dinamometro para la prueba.',
                type: 'checklist',
                items: [
                    'Ingresar ETW (Equivalent Test Weight)',
                    'Configurar coeficientes de resistencia (Target A, B, C)',
                    'Verificar coeficientes de dinamometro (Dyno A, B, C)',
                    'Confirmar unidades (lbs/N)'
                ]
            },
            {
                title: 'Periodo de Soak',
                description: 'Iniciar el periodo de reposo del vehiculo.',
                type: 'checklist',
                items: [
                    'Activar temporizador de soak',
                    'Registrar hora de inicio del soak',
                    'Verificar temperatura del laboratorio esta en rango',
                    'No mover el vehiculo durante el periodo de soak'
                ]
            },
            {
                title: 'Guardar Datos de Operacion',
                description: 'Asegurar que toda la informacion esta capturada.',
                type: 'checklist',
                items: [
                    'Guardar progreso del vehiculo',
                    'Verificar que la barra de progreso refleja los datos capturados'
                ]
            }
        ]
    },
    {
        id: 'sop-cop15-liberacion',
        name: 'Liberacion de Vehiculo COP15',
        category: 'cascade',
        cascadePhase: 'liberacion',
        description: 'Procedimiento para completar la prueba y liberar el vehiculo.',
        icon: '✅',
        steps: [
            {
                title: 'Verificar Datos Completos',
                description: 'Revisar que todos los campos obligatorios esten llenos.',
                type: 'checklist',
                items: [
                    'Revisar panel de Quick Review',
                    'Verificar que no hay campos marcados en rojo',
                    'Confirmar datos de dinamometro estan completos'
                ]
            },
            {
                title: 'Ingresar Resultados de Prueba',
                description: 'Cargar los resultados de emisiones obtenidos.',
                type: 'checklist',
                items: [
                    'Registrar fecha de prueba',
                    'Ingresar odometro final',
                    'Capturar resultados de emisiones si aplica'
                ]
            },
            {
                title: 'Firmas y Aprobacion',
                description: 'Obtener las firmas necesarias para la liberacion.',
                type: 'checklist',
                items: [
                    'Obtener firma del operador',
                    'Obtener firma del supervisor/lider',
                    'Agregar observaciones finales si aplica'
                ]
            },
            {
                title: 'Generar Documentacion',
                description: 'Crear el PDF del reporte y archivar.',
                type: 'checklist',
                items: [
                    'Generar PDF del reporte de prueba',
                    'Verificar que el PDF contiene toda la informacion',
                    'Marcar vehiculo como "Ready Release"',
                    'Archivar vehiculo cuando sea apropiado'
                ]
            }
        ]
    },
    {
        id: 'sop-inicio-turno',
        name: 'Inicio de Turno',
        category: 'operacion',
        description: 'Checklist de actividades al iniciar un turno en el laboratorio.',
        icon: '🌅',
        steps: [
            {
                title: 'Verificacion de Instalaciones',
                description: 'Revision inicial del estado del laboratorio.',
                type: 'checklist',
                items: [
                    'Verificar que el laboratorio esta limpio y ordenado',
                    'Revisar que la temperatura esta dentro de rango (20-30 C)',
                    'Confirmar ventilacion y extractores funcionando',
                    'Verificar iluminacion adecuada'
                ]
            },
            {
                title: 'Revision de Equipos',
                description: 'Verificar que los equipos estan listos para operar.',
                type: 'checklist',
                items: [
                    'Encender analizadores de gases',
                    'Verificar que el dinamometro esta operativo',
                    'Revisar niveles de gases de referencia (PSI)',
                    'Confirmar calibracion vigente de equipos criticos'
                ]
            },
            {
                title: 'Revision de Pendientes',
                description: 'Revisar el estado de vehiculos y pruebas en curso.',
                type: 'checklist',
                items: [
                    'Revisar vehiculos en soak (temporizadores activos)',
                    'Verificar plan de pruebas de la semana',
                    'Revisar alertas del sistema (inventario, calibraciones)',
                    'Registrar inicio de turno en la bitacora'
                ]
            }
        ]
    },
    {
        id: 'sop-fin-turno',
        name: 'Fin de Turno',
        category: 'operacion',
        description: 'Checklist de cierre al finalizar un turno en el laboratorio.',
        icon: '🌙',
        steps: [
            {
                title: 'Guardar Progreso',
                description: 'Asegurar que todos los datos del turno estan guardados.',
                type: 'checklist',
                items: [
                    'Guardar todos los vehiculos en progreso',
                    'Verificar que los resultados de pruebas estan registrados',
                    'Actualizar bitacora con actividades del turno'
                ]
            },
            {
                title: 'Apagar Equipos',
                description: 'Seguir el procedimiento de apagado de equipos.',
                type: 'checklist',
                items: [
                    'Apagar analizadores de gases (segun procedimiento)',
                    'Dejar dinamometro en modo standby o apagar',
                    'Cerrar valvulas de gases que no se necesiten',
                    'Verificar que no hay fugas de gas'
                ]
            },
            {
                title: 'Limpieza y Orden',
                description: 'Dejar el laboratorio listo para el siguiente turno.',
                type: 'checklist',
                items: [
                    'Limpiar area de trabajo',
                    'Organizar herramientas y materiales',
                    'Reportar cualquier anomalia o pendiente',
                    'Registrar fin de turno en la bitacora'
                ]
            }
        ]
    },
    {
        id: 'sop-cambio-gas',
        name: 'Cambio de Cilindro de Gas',
        category: 'inventario',
        description: 'Procedimiento seguro para cambiar un cilindro de gas en el laboratorio.',
        icon: '🔴',
        steps: [
            {
                title: 'Preparacion',
                description: 'Verificar el cilindro nuevo y preparar el area.',
                type: 'checklist',
                items: [
                    'Identificar el gas y concentracion del cilindro nuevo',
                    'Verificar fecha de expiracion del cilindro nuevo',
                    'Verificar trazabilidad (EPA, NIST) del cilindro nuevo',
                    'Tener llave de cilindro a la mano'
                ]
            },
            {
                title: 'Desconexion del Cilindro Viejo',
                description: 'Retirar el cilindro agotado de forma segura.',
                type: 'checklist',
                items: [
                    'Cerrar la valvula del cilindro viejo',
                    'Purgar la linea de gas',
                    'Desconectar el regulador',
                    'Asegurar el cilindro viejo con cadena/correa'
                ]
            },
            {
                title: 'Conexion del Cilindro Nuevo',
                description: 'Instalar y verificar el nuevo cilindro.',
                type: 'checklist',
                items: [
                    'Posicionar y asegurar el cilindro nuevo',
                    'Conectar el regulador (verificar rosca correcta)',
                    'Abrir la valvula lentamente',
                    'Verificar que no hay fugas (solucion jabonosa)',
                    'Registrar PSI inicial'
                ]
            },
            {
                title: 'Registro en Sistema',
                description: 'Actualizar el inventario con el cambio.',
                type: 'checklist',
                items: [
                    'Actualizar inventario: dar de baja cilindro viejo',
                    'Registrar cilindro nuevo con serial y datos',
                    'Actualizar zona de almacenamiento',
                    'Verificar lectura de PSI en inventario'
                ]
            }
        ]
    }
];

/* ─── Initialization ─── */
function sopInit() {
    var stored = localStorage.getItem(SOP_STORAGE_KEY);
    if (stored) {
        try {
            var parsed = JSON.parse(stored);
            sopState.procedures = parsed.procedures || [];
            sopState.activeSessions = parsed.activeSessions || [];
            sopState.history = parsed.history || [];
        } catch(e) {
            console.warn('SOP: Error loading state', e);
        }
    }
    // Ensure builtin templates are present
    SOP_BUILTIN_TEMPLATES.forEach(function(tpl) {
        if (!sopState.procedures.find(function(p) { return p.id === tpl.id; })) {
            sopState.procedures.push(JSON.parse(JSON.stringify(tpl)));
        }
    });
    sopSave();
    sopUpdateBadge();
}

function sopSave() {
    try {
        localStorage.setItem(SOP_STORAGE_KEY, JSON.stringify({
            procedures: sopState.procedures,
            activeSessions: sopState.activeSessions,
            history: sopState.history
        }));
    } catch(e) {
        console.warn('SOP: Error saving state', e);
    }
}

function sopUpdateBadge() {
    var badge = document.getElementById('sop-count-badge');
    if (badge) {
        var active = sopState.activeSessions.length;
        badge.textContent = active > 0 ? active + ' activos' : sopState.procedures.length + ' SOPs';
    }
}

/* ─── Tab Switching ─── */
function sopSwitchTab(tabId) {
    sopState.currentTab = tabId;
    var tabs = document.querySelectorAll('#sop-tabs-bar .tp-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    // Find the clicked tab
    tabs.forEach(function(t) {
        if (t.getAttribute('onclick') && t.getAttribute('onclick').indexOf(tabId) > -1) {
            t.classList.add('active');
        }
    });
    sopRender();
}

/* ─── Main Render ─── */
function sopRender() {
    var container = document.getElementById('sop-content');
    if (!container) return;

    switch(sopState.currentTab) {
        case 'sop-procedures': container.innerHTML = sopRenderProcedures(); break;
        case 'sop-active': container.innerHTML = sopRenderActive(); break;
        case 'sop-history': container.innerHTML = sopRenderHistory(); break;
        case 'sop-templates': container.innerHTML = sopRenderTemplates(); break;
        default: container.innerHTML = sopRenderProcedures();
    }
}

/* ─── Render: Procedures List ─── */
function sopRenderProcedures() {
    var categories = {
        'cascade': { label: 'Flujo Cascade (COP15)', icon: '🔬' },
        'operacion': { label: 'Operacion del Laboratorio', icon: '🏭' },
        'inventario': { label: 'Inventario y Equipos', icon: '📦' },
        'custom': { label: 'Personalizados', icon: '📝' }
    };

    var html = '';

    // Category filter chips
    html += '<div class="sop-categories">';
    html += '<div class="sop-category-chip active" onclick="sopFilterCategory(\'all\')">Todos</div>';
    Object.keys(categories).forEach(function(cat) {
        html += '<div class="sop-category-chip" onclick="sopFilterCategory(\'' + cat + '\')">' +
                categories[cat].icon + ' ' + categories[cat].label + '</div>';
    });
    html += '</div>';

    // Group procedures by category
    Object.keys(categories).forEach(function(cat) {
        var procs = sopState.procedures.filter(function(p) { return p.category === cat; });
        if (procs.length === 0) return;

        html += '<div class="tp-card" style="margin-bottom:14px;">';
        html += '<div class="tp-card-title">' + categories[cat].icon + ' ' + categories[cat].label +
                '<span class="tp-badge" style="background:#f1f5f9;color:#64748b;">' + procs.length + '</span></div>';

        procs.forEach(function(proc) {
            var activeSession = sopState.activeSessions.find(function(s) { return s.procedureId === proc.id; });
            var totalSteps = proc.steps.length;
            var totalItems = 0;
            proc.steps.forEach(function(s) { if (s.items) totalItems += s.items.length; });

            html += '<div class="sop-procedure-card' + (activeSession ? ' sop-active' : '') + '" onclick="sopStartProcedure(\'' + proc.id + '\')">';
            html += '<div style="display:flex;align-items:flex-start;gap:12px;">';
            html += '<div style="font-size:24px;flex-shrink:0;">' + (proc.icon || '📋') + '</div>';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px;">' + proc.name + '</div>';
            html += '<div style="font-size:11px;color:#64748b;line-height:1.3;margin-bottom:6px;">' + proc.description + '</div>';
            html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
            html += '<span style="font-size:10px;color:#94a3b8;">' + totalSteps + ' pasos</span>';
            html += '<span style="font-size:10px;color:#94a3b8;">' + totalItems + ' items</span>';
            if (activeSession) {
                var progress = sopCalcProgress(activeSession);
                html += '<span style="font-size:10px;font-weight:700;color:var(--accent-sop);">En progreso: ' + progress + '%</span>';
            }
            html += '</div>';
            html += '</div>';
            html += '<div style="font-size:18px;color:#cbd5e1;flex-shrink:0;">›</div>';
            html += '</div>';
            html += '</div>';
        });

        html += '</div>';
    });

    return html;
}

/* ─── Render: Active Sessions ─── */
function sopRenderActive() {
    if (sopState.activeSessions.length === 0) {
        return '<div class="tp-card" style="text-align:center;padding:40px 20px;">' +
               '<div style="font-size:36px;margin-bottom:10px;">📋</div>' +
               '<div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Sin procedimientos activos</div>' +
               '<div style="font-size:12px;color:#64748b;">Inicia un procedimiento desde la pestaña "Procedimientos" o desde el flujo Cascade.</div>' +
               '</div>';
    }

    var html = '';
    sopState.activeSessions.forEach(function(session, idx) {
        var proc = sopState.procedures.find(function(p) { return p.id === session.procedureId; });
        if (!proc) return;

        var progress = sopCalcProgress(session);
        html += '<div class="tp-card">';
        html += '<div class="tp-card-title">' + (proc.icon || '📋') + ' ' + proc.name;
        html += '<div style="display:flex;gap:6px;">';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopAbandonSession(' + idx + ')" style="font-size:10px;padding:4px 10px;min-height:30px;">Abandonar</button>';
        html += '</div></div>';

        // Progress bar
        html += '<div class="sop-progress">';
        html += '<div class="sop-progress-bar"><div class="sop-progress-fill" style="width:' + progress + '%;"></div></div>';
        html += '<div class="sop-progress-text">' + progress + '%</div>';
        html += '</div>';

        // Started info
        html += '<div style="font-size:10px;color:#94a3b8;margin-bottom:12px;">Iniciado: ' + new Date(session.startedAt).toLocaleString('es-MX') + '</div>';

        // Steps
        html += sopRenderSteps(proc, session, idx);

        html += '</div>';
    });

    return html;
}

/* ─── Render Steps for a Session ─── */
function sopRenderSteps(proc, session, sessionIdx) {
    var html = '';

    proc.steps.forEach(function(step, stepIdx) {
        var stepState = (session.stepsState && session.stepsState[stepIdx]) || {};
        var checkedItems = stepState.checked || [];
        var totalItems = step.items ? step.items.length : 0;
        var checkedCount = checkedItems.filter(Boolean).length;
        var isComplete = totalItems > 0 && checkedCount === totalItems;
        var isActive = !isComplete && (stepIdx === 0 || sopIsStepComplete(proc, session, stepIdx - 1));
        var isLocked = !isComplete && !isActive;

        var stepClass = 'sop-step';
        if (isComplete) stepClass += ' sop-step-completed';
        else if (isActive) stepClass += ' sop-step-active';
        else stepClass += ' sop-step-locked';

        html += '<div class="' + stepClass + '">';

        // Step number
        html += '<div class="sop-step-number">';
        if (isComplete) html += '✓';
        else html += (stepIdx + 1);
        html += '</div>';

        // Step content
        html += '<div class="sop-step-content">';
        html += '<div class="sop-step-title">' + step.title + '</div>';
        html += '<div class="sop-step-desc">' + step.description + '</div>';

        // Checklist items
        if (step.items && !isLocked) {
            html += '<div class="sop-checklist">';
            step.items.forEach(function(item, itemIdx) {
                var isChecked = checkedItems[itemIdx] === true;
                html += '<div class="sop-check-item' + (isChecked ? ' checked' : '') + '" onclick="sopToggleItem(' + sessionIdx + ',' + stepIdx + ',' + itemIdx + ')">';
                html += '<div class="sop-check-box">' + (isChecked ? '✓' : '') + '</div>';
                html += '<span>' + item + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // Notes input for active step
        if (isActive && step.items) {
            html += '<div style="margin-top:8px;">';
            html += '<input class="sop-data-input" type="text" placeholder="Notas opcionales para este paso..." ' +
                    'value="' + (stepState.notes || '').replace(/"/g, '&quot;') + '" ' +
                    'onchange="sopSaveStepNote(' + sessionIdx + ',' + stepIdx + ',this.value)">';
            html += '</div>';
        }

        html += '</div>'; // step-content
        html += '</div>'; // step
    });

    // Check if all steps complete
    var allComplete = proc.steps.every(function(step, idx) {
        return sopIsStepComplete(proc, session, idx);
    });

    if (allComplete) {
        html += '<div class="sop-summary">';
        html += '<div class="sop-summary-icon">🎉</div>';
        html += '<div class="sop-summary-title">Procedimiento Completado</div>';
        html += '<div class="sop-summary-detail">Todos los pasos han sido completados exitosamente.</div>';
        html += '<button class="tp-btn tp-btn-primary" style="margin-top:12px;background:var(--tp-green);" onclick="sopCompleteSession(' + sessionIdx + ')">Finalizar y Guardar en Historial</button>';
        html += '</div>';
    }

    return html;
}

/* ─── Render: History ─── */
function sopRenderHistory() {
    if (sopState.history.length === 0) {
        return '<div class="tp-card" style="text-align:center;padding:40px 20px;">' +
               '<div style="font-size:36px;margin-bottom:10px;">📜</div>' +
               '<div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:4px;">Sin historial</div>' +
               '<div style="font-size:12px;color:#64748b;">Aqui aparecera el registro de procedimientos completados.</div>' +
               '</div>';
    }

    var html = '<div class="tp-card">';
    html += '<div class="tp-card-title">Procedimientos Completados <span class="tp-badge" style="background:#f0fdf4;color:#16a34a;">' + sopState.history.length + '</span></div>';

    // Sort by completion date desc
    var sorted = sopState.history.slice().sort(function(a,b) {
        return new Date(b.completedAt) - new Date(a.completedAt);
    });

    sorted.forEach(function(record) {
        var proc = sopState.procedures.find(function(p) { return p.id === record.procedureId; });
        var name = proc ? proc.name : record.procedureId;
        var icon = proc ? (proc.icon || '📋') : '📋';

        html += '<div class="sop-history-item">';
        html += '<div class="sop-history-status" style="background:var(--tp-green);"></div>';
        html += '<div class="sop-history-info">';
        html += '<div class="sop-history-name">' + icon + ' ' + name + '</div>';
        html += '<div class="sop-history-meta">' +
                'Duracion: ' + sopFormatDuration(record.startedAt, record.completedAt) +
                (record.operator ? ' | Operador: ' + record.operator : '') +
                '</div>';
        html += '</div>';
        html += '<div class="sop-history-date">' + new Date(record.completedAt).toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) + '</div>';
        html += '</div>';
    });

    html += '</div>';

    // Clear history button
    if (sopState.history.length > 0) {
        html += '<div style="text-align:center;margin-top:10px;">';
        html += '<button class="tp-btn tp-btn-ghost" onclick="sopClearHistory()" style="font-size:11px;">Limpiar Historial</button>';
        html += '</div>';
    }

    return html;
}

/* ─── Render: Templates ─── */
function sopRenderTemplates() {
    var html = '<div class="tp-card">';
    html += '<div class="tp-card-title">Plantillas Disponibles</div>';
    html += '<div style="font-size:12px;color:#64748b;margin-bottom:14px;">Las plantillas predefinidas no se pueden eliminar. Puedes crear tus propios procedimientos personalizados.</div>';

    sopState.procedures.forEach(function(proc) {
        var isBuiltin = SOP_BUILTIN_TEMPLATES.some(function(t) { return t.id === proc.id; });
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border:1px solid #f1f5f9;border-radius:10px;margin-bottom:6px;">';
        html += '<span style="font-size:18px;">' + (proc.icon || '📋') + '</span>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:12px;font-weight:700;color:#0f172a;">' + proc.name + '</div>';
        html += '<div style="font-size:10px;color:#64748b;">' + proc.steps.length + ' pasos | Categoria: ' + proc.category + '</div>';
        html += '</div>';
        if (isBuiltin) {
            html += '<span style="font-size:9px;padding:2px 8px;background:#f1f5f9;color:#64748b;border-radius:6px;font-weight:700;">Predefinido</span>';
        } else {
            html += '<button class="tp-btn tp-btn-ghost" onclick="sopDeleteProcedure(\'' + proc.id + '\')" style="font-size:10px;padding:4px 8px;min-height:28px;color:var(--tp-red);">Eliminar</button>';
        }
        html += '</div>';
    });

    html += '</div>';
    return html;
}

/* ─── Actions ─── */

function sopStartProcedure(procId) {
    // Check if already active
    var existing = sopState.activeSessions.find(function(s) { return s.procedureId === procId; });
    if (existing) {
        // Switch to active tab and show it
        sopSwitchTab('sop-active');
        return;
    }

    var proc = sopState.procedures.find(function(p) { return p.id === procId; });
    if (!proc) return;

    var session = {
        procedureId: procId,
        startedAt: new Date().toISOString(),
        operator: typeof getCurrentOperator === 'function' ? getCurrentOperator() : '',
        stepsState: {}
    };

    // Initialize steps state
    proc.steps.forEach(function(step, idx) {
        session.stepsState[idx] = {
            checked: step.items ? new Array(step.items.length).fill(false) : [],
            notes: ''
        };
    });

    sopState.activeSessions.push(session);
    sopSave();
    sopUpdateBadge();

    if (typeof showToast === 'function') {
        showToast('Procedimiento iniciado: ' + proc.name, 'success');
    }

    sopSwitchTab('sop-active');
}

function sopToggleItem(sessionIdx, stepIdx, itemIdx) {
    var session = sopState.activeSessions[sessionIdx];
    if (!session) return;

    if (!session.stepsState[stepIdx]) {
        session.stepsState[stepIdx] = { checked: [], notes: '' };
    }

    var checked = session.stepsState[stepIdx].checked;
    checked[itemIdx] = !checked[itemIdx];

    sopSave();
    sopRender();

    // Log to panel shift log if available
    if (checked[itemIdx] && typeof pnAddShiftEntry === 'function') {
        var proc = sopState.procedures.find(function(p) { return p.id === session.procedureId; });
        if (proc && proc.steps[stepIdx]) {
            var itemText = proc.steps[stepIdx].items[itemIdx];
            pnAddShiftEntry('SOP: ' + proc.name + ' - ' + itemText);
        }
    }
}

function sopSaveStepNote(sessionIdx, stepIdx, value) {
    var session = sopState.activeSessions[sessionIdx];
    if (!session) return;
    if (!session.stepsState[stepIdx]) {
        session.stepsState[stepIdx] = { checked: [], notes: '' };
    }
    session.stepsState[stepIdx].notes = value;
    sopSave();
}

function sopCompleteSession(sessionIdx) {
    var session = sopState.activeSessions[sessionIdx];
    if (!session) return;

    var record = {
        procedureId: session.procedureId,
        startedAt: session.startedAt,
        completedAt: new Date().toISOString(),
        operator: session.operator,
        stepsState: session.stepsState
    };

    sopState.history.push(record);
    sopState.activeSessions.splice(sessionIdx, 1);
    sopSave();
    sopUpdateBadge();

    if (typeof showToast === 'function') {
        showToast('Procedimiento completado y archivado', 'success');
    }

    // Log to panel
    if (typeof pnAddShiftEntry === 'function') {
        var proc = sopState.procedures.find(function(p) { return p.id === record.procedureId; });
        if (proc) {
            pnAddShiftEntry('SOP Completado: ' + proc.name);
        }
    }

    sopRender();
}

function sopAbandonSession(sessionIdx) {
    if (typeof showCustomConfirm === 'function') {
        showCustomConfirm(
            'Abandonar Procedimiento',
            'Se perdera el progreso de este procedimiento. ¿Continuar?',
            function() {
                sopState.activeSessions.splice(sessionIdx, 1);
                sopSave();
                sopUpdateBadge();
                sopRender();
                if (typeof showToast === 'function') showToast('Procedimiento abandonado', 'warning');
            },
            'danger'
        );
    } else {
        if (confirm('¿Abandonar este procedimiento? Se perdera el progreso.')) {
            sopState.activeSessions.splice(sessionIdx, 1);
            sopSave();
            sopUpdateBadge();
            sopRender();
        }
    }
}

function sopDeleteProcedure(procId) {
    var isBuiltin = SOP_BUILTIN_TEMPLATES.some(function(t) { return t.id === procId; });
    if (isBuiltin) {
        if (typeof showToast === 'function') showToast('No se pueden eliminar procedimientos predefinidos', 'warning');
        return;
    }

    if (typeof showCustomConfirm === 'function') {
        showCustomConfirm('Eliminar Procedimiento', '¿Eliminar este procedimiento personalizado?', function() {
            sopState.procedures = sopState.procedures.filter(function(p) { return p.id !== procId; });
            sopState.activeSessions = sopState.activeSessions.filter(function(s) { return s.procedureId !== procId; });
            sopSave();
            sopUpdateBadge();
            sopRender();
        }, 'danger');
    }
}

function sopClearHistory() {
    if (typeof showCustomConfirm === 'function') {
        showCustomConfirm('Limpiar Historial', '¿Eliminar todo el historial de procedimientos completados?', function() {
            sopState.history = [];
            sopSave();
            sopRender();
            if (typeof showToast === 'function') showToast('Historial limpiado', 'info');
        }, 'danger');
    }
}

function sopFilterCategory(cat) {
    // Toggle visual active state on chips
    document.querySelectorAll('.sop-category-chip').forEach(function(chip) {
        chip.classList.remove('active');
        if (cat === 'all' && chip.textContent.trim() === 'Todos') chip.classList.add('active');
        else if (chip.getAttribute('onclick') && chip.getAttribute('onclick').indexOf("'" + cat + "'") > -1) chip.classList.add('active');
    });

    // Filter cards visibility
    // For simplicity, re-render with filter
    sopRender();
}

/* ─── Create Custom SOP Modal ─── */
function sopShowCreateModal() {
    var html = '<div style="max-width:500px;margin:40px auto;background:#fff;border-radius:16px;padding:24px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.15);">';
    html += '<button onclick="this.closest(\'[id$=sopCreateModal]\').style.display=\'none\'" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">✕</button>';
    html += '<h3 style="margin:0 0 16px;font-size:16px;font-weight:800;color:#0f172a;">Crear Nuevo Procedimiento</h3>';

    html += '<div style="display:flex;flex-direction:column;gap:12px;">';
    html += '<div><label style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;display:block;">Nombre del Procedimiento</label>';
    html += '<input id="sop-new-name" class="sop-data-input" type="text" placeholder="Ej: Verificacion de Fugas"></div>';

    html += '<div><label style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;display:block;">Descripcion</label>';
    html += '<textarea id="sop-new-desc" class="sop-data-input" rows="2" placeholder="Describe brevemente el procedimiento..." style="min-height:60px;resize:vertical;"></textarea></div>';

    html += '<div><label style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;display:block;">Categoria</label>';
    html += '<select id="sop-new-cat" class="sop-data-input" style="cursor:pointer;"><option value="operacion">Operacion del Laboratorio</option><option value="inventario">Inventario y Equipos</option><option value="custom">Personalizado</option></select></div>';

    html += '<div><label style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;display:block;">Pasos (un paso por linea, usa ; para separar items del checklist)</label>';
    html += '<textarea id="sop-new-steps" class="sop-data-input" rows="5" placeholder="Paso 1: Titulo; item1; item2; item3&#10;Paso 2: Titulo; item1; item2" style="min-height:100px;resize:vertical;font-family:monospace;font-size:12px;"></textarea></div>';

    html += '<button class="tp-btn tp-btn-primary" onclick="sopCreateCustom()" style="background:var(--accent-sop);margin-top:4px;">Crear Procedimiento</button>';
    html += '</div>';
    html += '</div>';

    // Create modal overlay
    var modal = document.createElement('div');
    modal.id = 'sopCreateModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.3);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:modalFadeIn 0.2s ease;';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = html;
    document.body.appendChild(modal);
}

function sopCreateCustom() {
    var name = document.getElementById('sop-new-name').value.trim();
    var desc = document.getElementById('sop-new-desc').value.trim();
    var cat = document.getElementById('sop-new-cat').value;
    var stepsRaw = document.getElementById('sop-new-steps').value.trim();

    if (!name) {
        if (typeof showToast === 'function') showToast('Ingresa un nombre para el procedimiento', 'warning');
        return;
    }

    // Parse steps
    var steps = [];
    var lines = stepsRaw.split('\n').filter(function(l) { return l.trim(); });
    lines.forEach(function(line) {
        var parts = line.split(';').map(function(s) { return s.trim(); }).filter(Boolean);
        if (parts.length > 0) {
            var title = parts[0].replace(/^Paso\s*\d+\s*:\s*/i, '');
            var items = parts.slice(1);
            steps.push({
                title: title,
                description: '',
                type: 'checklist',
                items: items.length > 0 ? items : ['Completar este paso']
            });
        }
    });

    if (steps.length === 0) {
        steps.push({ title: 'Paso 1', description: '', type: 'checklist', items: ['Completar'] });
    }

    var newProc = {
        id: 'sop-custom-' + Date.now(),
        name: name,
        category: cat,
        description: desc || 'Procedimiento personalizado',
        icon: '📝',
        steps: steps
    };

    sopState.procedures.push(newProc);
    sopSave();
    sopUpdateBadge();

    // Close modal
    var modal = document.getElementById('sopCreateModal');
    if (modal) modal.remove();

    if (typeof showToast === 'function') showToast('Procedimiento creado: ' + name, 'success');
    sopRender();
}

/* ─── Cascade Integration ─── */

// Called by COP15 when switching tabs to show contextual SOP banner
function sopGetCascadeBanner(phase) {
    var phaseMap = {
        'alta': 'sop-cop15-alta',
        'seguimiento': 'sop-cop15-operacion',
        'liberacion': 'sop-cop15-liberacion'
    };

    var procId = phaseMap[phase];
    if (!procId) return '';

    var proc = sopState.procedures.find(function(p) { return p.id === procId; });
    if (!proc) return '';

    var activeSession = sopState.activeSessions.find(function(s) { return s.procedureId === procId; });
    var progress = activeSession ? sopCalcProgress(activeSession) : 0;

    var html = '<div class="sop-context-banner" onclick="sopStartAndShow(\'' + procId + '\')">';
    html += '<div class="sop-context-icon">📋</div>';
    html += '<div class="sop-context-text">';
    if (activeSession) {
        html += '<strong>SOP: ' + proc.name + '</strong><br>Progreso: ' + progress + '% completado';
    } else {
        html += '<strong>Guia disponible: ' + proc.name + '</strong><br>Toca para iniciar el procedimiento paso a paso';
    }
    html += '</div>';
    html += '<div class="sop-context-action">' + (activeSession ? 'Continuar ›' : 'Iniciar ›') + '</div>';
    html += '</div>';

    return html;
}

function sopStartAndShow(procId) {
    // Start if not active
    var existing = sopState.activeSessions.find(function(s) { return s.procedureId === procId; });
    if (!existing) {
        sopStartProcedure(procId);
    }

    // Switch to SOP module, active tab
    if (typeof switchPlatform === 'function') {
        switchPlatform('sop');
    }
    sopSwitchTab('sop-active');
}

/* ─── Export History ─── */
function sopExportHistory() {
    if (sopState.history.length === 0) {
        if (typeof showToast === 'function') showToast('No hay historial para exportar', 'info');
        return;
    }

    var text = 'HISTORIAL DE PROCEDIMIENTOS SOP\n';
    text += 'Exportado: ' + new Date().toLocaleString('es-MX') + '\n';
    text += '═══════════════════════════════════════\n\n';

    sopState.history.forEach(function(record, idx) {
        var proc = sopState.procedures.find(function(p) { return p.id === record.procedureId; });
        text += (idx + 1) + '. ' + (proc ? proc.name : record.procedureId) + '\n';
        text += '   Iniciado: ' + new Date(record.startedAt).toLocaleString('es-MX') + '\n';
        text += '   Completado: ' + new Date(record.completedAt).toLocaleString('es-MX') + '\n';
        text += '   Duracion: ' + sopFormatDuration(record.startedAt, record.completedAt) + '\n';
        if (record.operator) text += '   Operador: ' + record.operator + '\n';
        text += '\n';
    });

    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'sop-historial-' + new Date().toISOString().split('T')[0] + '.txt';
    a.click();
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast('Historial exportado', 'success');
}

/* ─── Helpers ─── */

function sopCalcProgress(session) {
    var proc = sopState.procedures.find(function(p) { return p.id === session.procedureId; });
    if (!proc) return 0;

    var totalItems = 0;
    var checkedItems = 0;

    proc.steps.forEach(function(step, idx) {
        if (step.items) {
            totalItems += step.items.length;
            var stepState = session.stepsState[idx];
            if (stepState && stepState.checked) {
                checkedItems += stepState.checked.filter(Boolean).length;
            }
        }
    });

    return totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
}

function sopIsStepComplete(proc, session, stepIdx) {
    var step = proc.steps[stepIdx];
    if (!step || !step.items || step.items.length === 0) return true;

    var stepState = session.stepsState[stepIdx];
    if (!stepState || !stepState.checked) return false;

    return stepState.checked.filter(Boolean).length === step.items.length;
}

function sopFormatDuration(start, end) {
    var ms = new Date(end) - new Date(start);
    var mins = Math.floor(ms / 60000);
    if (mins < 60) return mins + ' min';
    var hrs = Math.floor(mins / 60);
    var remainMins = mins % 60;
    return hrs + 'h ' + remainMins + 'min';
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(sopInit, 100);
    });
} else {
    setTimeout(sopInit, 100);
}
