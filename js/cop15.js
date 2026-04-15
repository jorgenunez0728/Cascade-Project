// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KIA EmLab — COP15 Cascade Module                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── Unsaved Changes Tracking + Auto-Save [R5-M2] ──
var _unsavedChanges = false;

function markUnsaved() {
    _unsavedChanges = true;
    var dot = document.getElementById('unsaved-dot');
    if (dot) { dot.style.display = 'inline'; dot.textContent = '●'; }
    var btn = document.getElementById('btn-save');
    if (btn && !btn.classList.contains('btn-unsaved')) {
        btn.classList.add('btn-unsaved');
        btn.textContent = '💾 Guardar *';
    }
}

function clearUnsaved() {
    _unsavedChanges = false;
    var dot = document.getElementById('unsaved-dot');
    if (dot) dot.style.display = 'none';
    var btn = document.getElementById('btn-save');
    if (btn) {
        btn.classList.remove('btn-unsaved');
        btn.textContent = '💾 Guardar';
    }
}

/** [R5-M2] Silent auto-save: calls saveProgress without UI fanfare */
function _autoSaveSilent() {
    if (!activeVehicleId || !_unsavedChanges) return;
    var vehicle = db.vehicles.find(function(v){ return v.id == activeVehicleId; });
    if (!vehicle) return;
    // Save without button animation or toast
    saveProgress({ silent: true });
}

// ── [Fase 2.2] Debounced auto-save for focusout scenarios ──
var _debouncedAutoSaveSilent = debounce(function() { if (_unsavedChanges) _autoSaveSilent(); }, 500);

function setupUnsavedTracking() {
    var container = document.getElementById('op-content');
    if (!container) return;
    container.addEventListener('input', markUnsaved);
    container.addEventListener('change', markUnsaved);
    // [R5-M2] Register auto-save on blur/visibility change
    autoSaveInit('cop15', _autoSaveSilent, function(){ return _unsavedChanges; });

    // [R5-M2][Fase 2.2] Auto-save when individual fields lose focus (debounced)
    container.addEventListener('focusout', function(e) {
        if (_unsavedChanges && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
            _debouncedAutoSaveSilent();
        }
    });
}

// [M02] FILTRO CASCADA]
// ======================================================================

    function parseCSV() {
        // Check for user-imported CSV first, fall back to embedded
        const customCSV = localStorage.getItem('kia_config_csv_raw');
        const csvSource = customCSV || CSV_CONFIGURATIONS;
        const lines = csvSource.trim().split('\n');
        const headers = lines[0].split(',');
        
        allConfigurations = [];
        for(let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const config = {};
            headers.forEach((header, index) => {
                config[header] = values[index] || '';
            });
            allConfigurations.push(config);
        }

setAltaDatetimeIfEmpty(true);
        
        console.log(`Configuraciones cargadas: ${allConfigurations.length}${customCSV ? ' (CSV importado)' : ' (embebido)'}`);
    }

    function cascadeFilter(changedField) {
        // Guardar el valor seleccionado
        const selectId = fieldMapping[changedField];
        if(selectId) {
            const value = document.getElementById(selectId).value;
            if(value) {
                currentFilters[changedField] = value;
                document.getElementById(selectId).classList.add('selected');
            } else {
                delete currentFilters[changedField];
                document.getElementById(selectId).classList.remove('selected');
            }
        }
        
        // Filtrar configuraciones basadas en los filtros actuales
        let filtered = allConfigurations.filter(config => {
            for(let field in currentFilters) {
                if(config[field] !== currentFilters[field]) {
                    return false;
                }
            }
            return true;
        });
        
        // Actualizar todos los selectores con opciones disponibles
        updateSelectOptions(filtered);
        
        // Actualizar contador
        document.getElementById('configCount').textContent = filtered.length;
        
        // Mostrar resultado
        displayConfigResult(filtered);
    }


    function updateSelectOptions(filtered) {
        // Para cada campo, obtener valores únicos de las configuraciones filtradas
        Object.keys(fieldMapping).forEach(csvField => {
            const selectId = fieldMapping[csvField];
            const select = document.getElementById(selectId);
            if(!select) return;
            
            // Si este campo ya está seleccionado, no lo modificamos
            if(currentFilters[csvField]) return;
            
            // Obtener valores únicos
            const uniqueValues = [...new Set(filtered.map(c => c[csvField]))].filter(v => v).sort();
            
            // Guardar la opción actual
            const currentValue = select.value;
            
            // Reconstruir opciones
            select.innerHTML = '<option value="">Todos</option>';
            uniqueValues.forEach(val => {
                const option = document.createElement('option');
                option.value = val;
                option.textContent = val;
                select.appendChild(option);
            });
            
            // Restaurar valor si aún existe
            if(currentValue && uniqueValues.includes(currentValue)) {
                select.value = currentValue;
            }
        });
    }


    function displayConfigResult(filtered) {
        const resultDiv = document.getElementById('cfg_result');
        
        if(Object.keys(currentFilters).length === 0) {
            resultDiv.className = 'config-result empty';
            resultDiv.innerHTML = '<strong>Código de Configuración:</strong> Seleccione al menos el MODELO';
            return;
        }
        
        if(filtered.length === 0) {
            resultDiv.className = 'config-result empty';
            resultDiv.innerHTML = '<strong>⚠️ No hay configuraciones</strong> que coincidan con estos filtros';
            return;
        }
        
        resultDiv.className = 'config-result complete';
        
        if(filtered.length === 1) {
            const config = filtered[0];
            resultDiv.innerHTML = `
                <strong>✅ CONFIGURACIÓN ÚNICA ENCONTRADA:</strong><br>
                <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
                    <div style="font-family: monospace; color: var(--kia-red); font-weight: bold;flex:1;">
                        ${config.codigo_config_text}
                    </div>
                    <button onclick="copyToClipboard('${config.codigo_config_text.replace(/'/g,"\\'")}', this)" style="background:var(--kia-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">📋 Copiar</button>
                </div>
                <div style="margin-top: 10px; font-size: 0.9rem; color: #475569;">
                    <strong>Modelo:</strong> ${config.Modelo} |
                    <strong>Año:</strong> ${config['MODEL YEAR (VIN)']} |
                    <strong>Motor:</strong> ${config['ENGINE CAPACITY']}<br>
                    <strong>Transmisión:</strong> ${config.TRANSMISSION} |
 			<strong>Env:</strong> ${config['ENVIRONMENT PACKAGE']} |
                    <strong>Regulación:</strong> ${config['EMISSION REGULATION']}
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <strong>📋 ${filtered.length} CONFIGURACIONES POSIBLES</strong><br>
                <div style="margin-top: 10px; font-size: 0.85rem;">
                    Continúe filtrando para reducir las opciones...
                </div>
            `;
        }
    }


    function resetFilters() {
        currentFilters = {};
        
        // Limpiar todos los selectores
        Object.values(fieldMapping).forEach(selectId => {
            const select = document.getElementById(selectId);
            if(select) {
                select.value = '';
                select.classList.remove('selected');
            }
        });
        
        // Reiniciar con todas las configuraciones
        updateSelectOptions(allConfigurations);
        document.getElementById('configCount').textContent = allConfigurations.length;
        
        const resultDiv = document.getElementById('cfg_result');
        resultDiv.className = 'config-result empty';
        resultDiv.innerHTML = '<strong>Código de Configuración:</strong> Seleccione al menos el MODELO';
    }



// [M02b] VISUAL CASCADE TREE
// ======================================================================

var cascadeSelections = {};
var cascadeAutoSelected = {};

var cascadeFieldLabels = {
    'Modelo': 'MODELO',
    'MODEL YEAR (VIN)': 'AÑO',
    'ENGINE CAPACITY': 'MOTOR',
    'TRANSMISSION': 'TRANSMISIÓN',
    'ENVIRONMENT PACKAGE': 'ENV PKG',
    'EMISSION REGULATION': 'REGULACIÓN',
    'REGION': 'REGIÓN',
    'TIRE ASSY': 'LLANTAS',
    'BODY TYPE': 'CARROCERÍA',
    'DRIVE TYPE': 'DRIVE',
    'ENGINE PACKAGE': 'ENG PKG'
};

function getCascadeOptionsForLevel(fieldName) {
    var filtered = allConfigurations.filter(function(config) {
        for (var f in cascadeSelections) {
            if (config[f] !== cascadeSelections[f]) return false;
        }
        return true;
    });
    var counts = {};
    filtered.forEach(function(config) {
        var val = config[fieldName];
        if (val) counts[val] = (counts[val] || 0) + 1;
    });
    var options = Object.keys(counts).sort().map(function(val) {
        return { value: val, count: counts[val] };
    });
    return { options: options, totalFiltered: filtered.length };
}

function renderCascadeTree() {
    var fields = Object.keys(fieldMapping);
    var levelsEl = document.getElementById('cascade-levels');
    var breadcrumbEl = document.getElementById('cascade-breadcrumb');
    if (!levelsEl || !breadcrumbEl) return;

    // Determine which levels are completed/active/pending
    var firstUnselected = -1;
    for (var i = 0; i < fields.length; i++) {
        if (!cascadeSelections[fields[i]]) {
            firstUnselected = i;
            break;
        }
    }
    if (firstUnselected === -1) firstUnselected = fields.length;

    // Render breadcrumb
    var crumbHtml = '';
    if (firstUnselected === 0) {
        crumbHtml = '<span class="cascade-breadcrumb-placeholder">Seleccione un modelo para comenzar</span>';
    } else {
        for (var b = 0; b < firstUnselected; b++) {
            if (b > 0) crumbHtml += '<span class="cascade-breadcrumb-sep">›</span>';
            var autoTag = cascadeAutoSelected[fields[b]] ? ' <span style="font-size:0.6rem;opacity:0.6;">auto</span>' : '';
            crumbHtml += '<span class="cascade-breadcrumb-item" onclick="deselectCascadeLevel(\'' + fields[b] + '\')">' +
                '<span class="crumb-label">' + cascadeFieldLabels[fields[b]] + ':</span> ' +
                cascadeSelections[fields[b]] + autoTag + '</span>';
        }
    }
    breadcrumbEl.innerHTML = crumbHtml;

    // Render levels
    var html = '';
    for (var lvl = 0; lvl < fields.length; lvl++) {
        var field = fields[lvl];
        var label = cascadeFieldLabels[field];
        var state = 'pending';
        if (cascadeSelections[field]) {
            state = 'completed';
        } else if (lvl === firstUnselected) {
            state = 'active';
        }

        html += '<div class="cascade-level ' + state + '">';
        html += '<div class="cascade-level-header">';
        html += '<span><span class="level-step">' + (lvl + 1) + '</span>' + label + '</span>';
        if (state === 'completed') {
            html += '<span class="level-change" onclick="deselectCascadeLevel(\'' + field + '\')">cambiar</span>';
        }
        html += '</div>';

        if (state === 'active') {
            var data = getCascadeOptionsForLevel(field);
            html += '<div class="cascade-chips">';
            if (data.options.length === 0) {
                html += '<span style="color:#94a3b8;font-size:0.85rem;">Sin opciones disponibles</span>';
            } else {
                data.options.forEach(function(opt) {
                    var escaped = opt.value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;');
                    var escapedAttr = opt.value.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"');
                    html += '<button class="cascade-chip" onclick="selectCascadeChip(\'' + field + '\',\'' + escapedAttr + '\')">' +
                        escaped + ' <span class="chip-count">(' + opt.count + ')</span></button>';
                });
            }
            html += '</div>';
        } else if (state === 'completed') {
            // Show selected value inline in header (already via breadcrumb)
        } else {
            // Pending — just the collapsed header
        }

        html += '</div>';
    }
    levelsEl.innerHTML = html;

    // Update counter
    var totalFiltered = allConfigurations.filter(function(config) {
        for (var f in cascadeSelections) {
            if (config[f] !== cascadeSelections[f]) return false;
        }
        return true;
    });
    document.getElementById('configCount').textContent = totalFiltered.length;
    displayConfigResult(totalFiltered);
}

function selectCascadeChip(fieldName, value) {
    var fields = Object.keys(fieldMapping);
    var idx = fields.indexOf(fieldName);

    // Set this selection
    cascadeSelections[fieldName] = value;

    // Clear all subsequent selections
    for (var i = idx + 1; i < fields.length; i++) {
        delete cascadeSelections[fields[i]];
        delete cascadeAutoSelected[fields[i]];
    }

    // Sync hidden select and call existing cascadeFilter
    var selectId = fieldMapping[fieldName];
    var selectEl = document.getElementById(selectId);
    if (selectEl) {
        selectEl.value = value;
        selectEl.classList.add('selected');
    }
    currentFilters[fieldName] = value;

    // Clear downstream filters and selects
    for (var j = idx + 1; j < fields.length; j++) {
        delete currentFilters[fields[j]];
        var sid = fieldMapping[fields[j]];
        var sel = document.getElementById(sid);
        if (sel) {
            sel.value = '';
            sel.classList.remove('selected');
        }
    }

    // Update hidden selects via existing filter logic
    var filtered = allConfigurations.filter(function(config) {
        for (var f in currentFilters) {
            if (config[f] !== currentFilters[f]) return false;
        }
        return true;
    });
    updateSelectOptions(filtered);

    // Auto-advance: if next level has only 1 option, auto-select it
    renderCascadeTree();
    autoAdvanceCascade();
}

function autoAdvanceCascade() {
    var fields = Object.keys(fieldMapping);
    for (var i = 0; i < fields.length; i++) {
        if (!cascadeSelections[fields[i]]) {
            var data = getCascadeOptionsForLevel(fields[i]);
            if (data.options.length === 1) {
                // Auto-select the only option
                cascadeSelections[fields[i]] = data.options[0].value;
                cascadeAutoSelected[fields[i]] = true;
                currentFilters[fields[i]] = data.options[0].value;
                var selectId = fieldMapping[fields[i]];
                var selectEl = document.getElementById(selectId);
                if (selectEl) {
                    selectEl.value = data.options[0].value;
                    selectEl.classList.add('selected');
                }
                // Continue checking next levels
                var filtered = allConfigurations.filter(function(config) {
                    for (var f in currentFilters) {
                        if (config[f] !== currentFilters[f]) return false;
                    }
                    return true;
                });
                updateSelectOptions(filtered);
            } else {
                break;
            }
        }
    }
    renderCascadeTree();
}

function deselectCascadeLevel(fieldName) {
    var fields = Object.keys(fieldMapping);
    var idx = fields.indexOf(fieldName);

    // Clear this and all subsequent selections
    for (var i = idx; i < fields.length; i++) {
        delete cascadeSelections[fields[i]];
        delete cascadeAutoSelected[fields[i]];
        delete currentFilters[fields[i]];
        var selectId = fieldMapping[fields[i]];
        var selectEl = document.getElementById(selectId);
        if (selectEl) {
            selectEl.value = '';
            selectEl.classList.remove('selected');
        }
    }

    // Rebuild filtered options
    var filtered = allConfigurations.filter(function(config) {
        for (var f in currentFilters) {
            if (config[f] !== currentFilters[f]) return false;
        }
        return true;
    });
    updateSelectOptions(filtered);
    renderCascadeTree();
}

function resetCascadeTree() {
    cascadeSelections = {};
    cascadeAutoSelected = {};
    resetFilters();
    renderCascadeTree();
}

function initCascadeTree() {
    if (!allConfigurations || allConfigurations.length === 0) return;
    cascadeSelections = {};
    cascadeAutoSelected = {};
    renderCascadeTree();
}

// [M03] INTERFAZ Y NAVEGACIÓN]
// ======================================================================

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // [R5-M2] Auto-save silently instead of blocking modal
            if (_unsavedChanges && tab.dataset.tab !== 'seguimiento') {
                _autoSaveSilent();
            }
            _switchToCop15Tab(tab);
        });
    });

    function _switchToCop15Tab(tab) {
        document.querySelectorAll('.tab, .tab-panel').forEach(function(el){ el.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        localStorage.setItem('kia_cop15_activeTab', tab.dataset.tab);
        if (tab.dataset.tab === 'kanban') renderKanban();
        var isOp = tab.dataset.tab === 'seguimiento';
        toggleActionBar(isOp && !!activeVehicleId);
        refreshAllLists();
        updateProgressBar();
        // Re-inject tooltips for the new tab
        cascadeInjectTooltips();
    }

    // Setup real-time field validation for Alta form
    (function setupAltaValidation() {
        var vinInput = document.getElementById('vin');
        var purposeSelect = document.getElementById('vehiclePurpose');
        var regOperator = document.getElementById('reg_operator');

        if (vinInput) {
            vinInput.addEventListener('input', function() {
                // [V7-E4] VIN Smart Input: auto-uppercase, strip spaces/dashes
                vinInput.value = vinInput.value.toUpperCase().replace(/[\s\-]/g, '');
                validateField(vinInput, {
                    required: true,
                    exactLength: 17,
                    pattern: /^[A-HJ-NPR-Z0-9]{17}$/,
                    patternMsg: '17 caracteres alfanuméricos (sin I, O, Q)'
                });
                // [V7-E4] Check duplicates
                if (vinInput.value.length === 17) v7CheckVinDuplicate(vinInput.value);
            });
            vinInput.addEventListener('blur', function() {
                validateField(vinInput, {
                    required: true,
                    exactLength: 17,
                    pattern: /^[A-HJ-NPR-Z0-9]{17}$/,
                    patternMsg: '17 caracteres alfanuméricos (sin I, O, Q)'
                });
            });
        }
        if (purposeSelect) {
            purposeSelect.addEventListener('change', function() {
                validateField(purposeSelect, { required: true });
            });
        }
        if (regOperator) {
            regOperator.addEventListener('change', function() {
                validateField(regOperator, { required: true });
            });
        }
    })();

    // Setup unsaved changes tracking
    try { setupUnsavedTracking(); } catch(e) {}

    // Inject field help tooltips (CASCADE_TOOLTIPS may not be ready yet)
    try { cascadeInjectTooltips(); } catch(e) {}

    function toggleMode() {
        const isExternal = document.getElementById('modeToggle').checked;
        document.getElementById('container-internal').style.display = isExternal ? 'none' : 'block';
        document.getElementById('container-external').style.display = isExternal ? 'block' : 'none';
        document.getElementById('lblInt').classList.toggle('active', !isExternal);
        document.getElementById('lblExt').classList.toggle('active', isExternal);
    }


    function setMode(mode) {
        document.getElementById('modeToggle').checked = (mode === 'external');
        toggleMode();
    }


    var _operatorSelectIds = ['reg_operator', 'op_recep', 'test_responsible', 'precond_responsible', 'simple_operator'];

    function populateOperators() {
        const operators = _operatorSelectIds.map(function(id) { return document.getElementById(id); });
        operators.forEach(select => {
            if(select) {
                select.innerHTML = '<option value="">Seleccionar...</option>';
                CONFIG.operators.forEach(op => {
                    select.innerHTML += `<option value="${op}">${op}</option>`;
                });
                // Listen for changes to remember last operator
                select.addEventListener('change', function() {
                    if (this.value) localStorage.setItem('kia_last_operator', this.value);
                });
            }
        });
    }

    function autoFillOperators() {
        var last = localStorage.getItem('kia_last_operator');
        if (!last) return;
        _operatorSelectIds.forEach(function(id) {
            var sel = document.getElementById(id);
            if (sel && !sel.value) {
                // Check if the operator exists in options
                var opts = Array.from(sel.options).map(function(o) { return o.value; });
                if (opts.includes(last)) sel.value = last;
            }
        });
    }


function scrollToTopOp(){
  document.getElementById('panel-seguimiento')?.scrollIntoView({behavior:'smooth', block:'start'});
}


function setupAccordionSingleOpen(containerId, defaultOpenId = '') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const accs = Array.from(container.querySelectorAll('details.acc'));
  if (accs.length === 0) return;

  // 1) Estado inicial: cerrar todos
  accs.forEach(d => d.removeAttribute('open'));

  // 2) Abrir uno por default (por id) o el primero
  let def = defaultOpenId ? document.getElementById(defaultOpenId) : null;
  if (!def || !accs.includes(def)) def = accs[0];
  def.setAttribute('open', '');

  // 3) Regla: solo uno abierto durante uso
  accs.forEach(d => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      accs.forEach(other => {
        if (other !== d) other.removeAttribute('open');
      });
      setTimeout(() => d.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
    });
  });
}

    function updateProgressBar() {
        const total = db.vehicles.length;
        if(total === 0) {
            document.getElementById('mainProgress').style.width = '0%';
            document.getElementById('progressText').textContent = 'Sin vehículos';
            return;
        }
        
        const archived = db.vehicles.filter(v => v.status === 'archived').length;
        const percentage = Math.round((archived / total) * 100);
        
        document.getElementById('mainProgress').style.width = percentage + '%';
        document.getElementById('progressText').textContent = `${archived}/${total} completados (${percentage}%)`;
    }



// [M04] REGISTRO DE VEHÍCULOS]
// ======================================================================

    // [R3-M6] VIN ISO 3779 checksum validation
    function _vinCheckDigit(vin) {
        var translitMap = {A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9};
        var weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
        var sum = 0;
        for (var i = 0; i < 17; i++) {
            var c = vin[i];
            var val = /\d/.test(c) ? parseInt(c) : (translitMap[c] || 0);
            sum += val * weights[i];
        }
        var rem = sum % 11;
        return rem === 10 ? 'X' : String(rem);
    }

    function validateVIN(input) {
        input.value = input.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
        const counter = document.getElementById('vinCounter');
        const length = input.value.length;
        counter.textContent = `${length}/17 caracteres`;

        if(length === 17) {
            counter.style.color = '#10b981';
            counter.textContent += ' ✓';

            // [R3-M6] Checksum validation
            var checkResult = _vinCheckDigit(input.value);
            var checksumHint = document.getElementById('vin-checksum-hint');
            if (!checksumHint) {
                checksumHint = document.createElement('div');
                checksumHint.id = 'vin-checksum-hint';
                checksumHint.style.cssText = 'font-size:10px;padding:2px 0;margin-top:2px;';
                counter.parentElement.appendChild(checksumHint);
            }
            if (input.value[8] === checkResult) {
                checksumHint.style.color = '#10b981';
                checksumHint.textContent = '✅ Check digit válido (ISO 3779)';
            } else {
                checksumHint.style.color = '#f59e0b';
                checksumHint.textContent = '⚠️ Check digit no coincide (esperado: ' + checkResult + ')';
            }
            // Real-time duplicate check
            var vin = input.value;
            var dupActive = db.vehicles.find(function(v) { return v.vin === vin && v.status !== 'archived'; });
            var dupArchived = db.vehicles.find(function(v) { return v.vin === vin && v.status === 'archived'; });
            var warning = document.getElementById('vin-dup-warning');
            if (!warning) {
                warning = document.createElement('div');
                warning.id = 'vin-dup-warning';
                warning.style.cssText = 'font-size:12px;padding:6px 10px;border-radius:6px;margin-top:4px;';
                counter.parentElement.appendChild(warning);
            }
            if (dupActive) {
                warning.style.display = 'block';
                warning.style.background = 'rgba(239,68,68,0.1)';
                warning.style.color = '#ef4444';
                warning.style.border = '1px solid rgba(239,68,68,0.3)';
                warning.textContent = '⚠️ VIN ya existe como vehiculo activo (' + (CONFIG.statusLabels[dupActive.status] || dupActive.status) + ')';
            } else if (dupArchived) {
                warning.style.display = 'block';
                warning.style.background = 'rgba(245,158,11,0.1)';
                warning.style.color = '#f59e0b';
                warning.style.border = '1px solid rgba(245,158,11,0.3)';
                warning.textContent = '⚠️ VIN existe en archivados (se creará nuevo registro)';
            } else {
                warning.style.display = 'none';
            }
        } else if(length > 0) {
            counter.style.color = '#f59e0b';
            var warning = document.getElementById('vin-dup-warning');
            if (warning) warning.style.display = 'none';
        } else {
            counter.style.color = '#64748b';
            var warning = document.getElementById('vin-dup-warning');
            if (warning) warning.style.display = 'none';
        }
    }

    function validateVehicleData() {
        const vin = document.getElementById('vin').value;
        const purpose = document.getElementById('vehiclePurpose').value;
        const operator = document.getElementById('reg_operator').value;
        const isExternal = document.getElementById('modeToggle').checked;
        
        if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
            showToast('VIN debe ser exactamente 17 caracteres alfanuméricos (sin I, O, Q)', 'error');
            return false;
        }

        if(db.vehicles.some(v => v.vin === vin && v.status !== 'archived')) {
            showToast('Este VIN ya existe en el sistema con estado activo', 'error');
            return false;
        }

        // Warn if VIN exists in archived vehicles (duplicate detection)
        if(db.vehicles.some(v => v.vin === vin && v.status === 'archived')) {
            showToast('Este VIN ya fue probado anteriormente (archivado)', 'warning');
        }

        if(!purpose) {
            showToast('Debe seleccionar un propósito', 'error');
            return false;
        }

        if(!operator) {
            showToast('Debe seleccionar un operador', 'error');
            return false;
        }

        if(!isExternal) {
            if(!currentFilters['Modelo']) {
                showToast('Debe seleccionar al menos el MODELO', 'error');
                return false;
            }
        } else {
            const manModel = document.getElementById('man_model').value;
            const manEngine = document.getElementById('man_engine').value;

            if(!manModel || !manEngine) {
                showToast('Debe completar los campos manuales de modelo y motor', 'error');
                return false;
            }
        }
        
        return true;
    }

    function confirmAlta() {
        if(!validateVehicleData()) return;
        
        const isExternal = document.getElementById('modeToggle').checked;
        const vin = document.getElementById('vin').value;
        const purpose = document.getElementById('vehiclePurpose').value;
        const operator = document.getElementById('reg_operator').value;
        
        let config = {};
        let configCode = 'MANUAL';
        
        if(!isExternal) {
            // Buscar la configuración exacta
            let filtered = allConfigurations.filter(c => {
                for(let field in currentFilters) {
                    if(c[field] !== currentFilters[field]) return false;
                }
                return true;
            });
            
            if(filtered.length === 1) {
                configCode = filtered[0].codigo_config_text;
            } else if(filtered.length > 1) {
                configCode = `MULTI (${filtered.length} opciones)`;
            }
            
            config = {...currentFilters};
        } else {
            config = {
                'Modelo': document.getElementById('man_model').value,
                'ENGINE CAPACITY': document.getElementById('man_engine').value,
                'EMISSION REGULATION': document.getElementById('man_regulation').value || 'N/A'
            };
        }
        
setAltaDatetimeIfEmpty(true);

        const summary = `
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; line-height: 1.8;">
                <strong>VIN:</strong> ${vin}<br>
                <strong>Propósito:</strong> ${purpose}<br>
                <strong>Código Config:</strong> ${configCode}<br>
                <strong>Modelo:</strong> ${config['Modelo']}<br>
                <strong>Motor:</strong> ${config['ENGINE CAPACITY'] || 'N/A'}<br>
		<strong>Env Package:</strong> ${config['ENVIRONMENT PACKAGE'] || 'N/A'}<br>
                <strong>Regulación:</strong> ${config['EMISSION REGULATION'] || 'N/A'}<br>
                <strong>Operador:</strong> ${operator}<br>
                <strong>Modo:</strong> ${isExternal ? 'Manual' : 'Catálogo'}
            </div>
        `;
        
        document.getElementById('summaryBody').innerHTML = summary;
        document.getElementById('modalConfirm').style.display = 'flex';
    }


    function saveNewVehicle() {
        const isExternal = document.getElementById('modeToggle').checked;
        
        let config = {};
        let configCode = 'MANUAL';
        
        if(!isExternal) {
            let filtered = allConfigurations.filter(c => {
                for(let field in currentFilters) {
                    if(c[field] !== currentFilters[field]) return false;
                }
                return true;
            });
            
            if(filtered.length === 1) {
                configCode = filtered[0].codigo_config_text;
            }
            
            config = {...currentFilters};
        } else {
            config = {
                'Modelo': document.getElementById('man_model').value,
                'ENGINE CAPACITY': document.getElementById('man_engine').value,
                'EMISSION REGULATION': document.getElementById('man_regulation').value || 'N/A'
            };
        }
        
        const newVehicle = {
            id: ++db.lastId,
            vin: document.getElementById('vin').value,
            purpose: document.getElementById('vehiclePurpose').value,
            config: config,
            configCode: configCode,
            status: 'registered',
            registeredBy: document.getElementById('reg_operator').value,
            registeredAt: new Date().toISOString(),
            timeline: [
                {
                    timestamp: new Date().toISOString(),
                    user: document.getElementById('reg_operator').value,
                    action: 'Vehículo Registrado',
                    data: { status: 'registered', configCode: configCode }
                }
            ],
            testData: {},
            notes: []
        };
        
        db.vehicles.push(newVehicle);
        compactTimelineEntries();
        saveDB();
        auditLog('cop15', 'vehicle_registered', {type:'vehicle', id:newVehicle.id, label:newVehicle.vin}, 'Config: ' + configCode);
        if (typeof fbPostVehicleRegistered === 'function') fbPostVehicleRegistered(newVehicle.vin, newVehicle.configCode);

        closeModal('modalConfirm');
        showToast('Vehículo registrado exitosamente', 'success');

        // [V7-E1] Track purpose usage
        v7TrackPurposeUsage(newVehicle.purpose);
        // [V7-E2] Track config usage
        v7TrackConfigUsage(newVehicle.configCode, newVehicle.config);
        // [V7-A1] Emit event
        if (typeof emitEvent === 'function') emitEvent('vehicle:registered', { vehicle: newVehicle });

setAltaDatetimeIfEmpty(true);
        
        // Reset
        document.getElementById('vin').value = '';
        document.getElementById('vehiclePurpose').value = '';
        resetCascadeTree();
        validateVIN(document.getElementById('vin'));
        
        refreshAllLists();
        updateProgressBar();
    }


// ======================================================================
// [M05] OPERACIÓN Y SEGUIMIENTO]
// ======================================================================



function updateOperationBlocksByPurpose(purpose) {
  const emBlock = document.getElementById('op-emissions-block');
  const simpleBlock = document.getElementById('op-simple-block');
  if (!emBlock || !simpleBlock) return;

  const em = isEmissionsPurpose(purpose);
  emBlock.style.display = em ? 'block' : 'none';
  simpleBlock.style.display = em ? 'none' : 'block';

  // Si no es emisiones, oculta verificación en prueba por seguridad
  if (!em) {
    const card = document.getElementById('test-verify-card');
    if (card) card.style.display = 'none';
  }
}


function toggleActionBar(show) {
  var bar = document.querySelector('.action-bar');
  if (bar) bar.classList.toggle('hidden', !show);
}

function loadVehicle() {
  activeVehicleId = document.getElementById('activeVehSelect').value;
  const content = document.getElementById('op-content');
  setupAccordionSingleOpen('op-emissions-block');

  if (!activeVehicleId) {
    content.style.display = 'none';
    toggleActionBar(false);
    return;
  }

  const vehicle = db.vehicles.find(v => v.id == activeVehicleId);
  if (!vehicle) return;

  // [V7-C1] Save active vehicle context
  if (typeof saveActiveVehicleContext === 'function') saveActiveVehicleContext(activeVehicleId);

  // [V7-C2] Restore draft if exists
  v7RestoreDraft(activeVehicleId);

  updateOperationBlocksByPurpose(vehicle.purpose);
  content.style.display = 'block';
  toggleActionBar(true);

  document.getElementById('vehicleInfo').innerHTML = `
    📋 <strong>VIN:</strong> ${vehicle.vin} |
    <strong>Propósito:</strong> ${vehicle.purpose} |
    <strong>Config:</strong> ${vehicle.configCode} |
    <strong>Estado:</strong> <span class="status-badge status-${vehicle.status}">${CONFIG.statusLabels[vehicle.status]}</span>
  `;

  document.getElementById('op_status').value =
    (vehicle.status === 'registered') ? 'in-progress' : vehicle.status;

  updateTestVerificationVisibility();
  initStatusPrevValue();

  // ===== MODO SIMPLE =====
  if (!isEmissionsPurpose(vehicle.purpose)) {
    const s = vehicle.testData?.simple || {};
    document.getElementById('simple_operator').value = s.operator || '';
    document.getElementById('simple_datetime').value = s.datetime || '';
    document.getElementById('simple_notes').value = s.notes || '';
    autoFillOperators();
    return;
  }

  // ===== EMISIONES =====
  const td = vehicle.testData || {};
  const p  = td.preconditioning || {};
  const tv = td.testVerification || {};

// ✅ Preacond (responsable + datetime)
document.getElementById('precond_datetime').value = p.datetime ?? '';
document.getElementById('precond_responsible').value = p.responsible ?? '';

if (!document.getElementById('precond_datetime').value) {
  setPrecondDatetimeIfEmpty(true);
}

  document.getElementById('test_responsible').value = td.testResponsible ?? '';
  document.getElementById('test_datetime').value    = td.testDatetime ?? '';

  document.getElementById('op_odo').value           = td.odometer ?? '';
  document.getElementById('tire_pressure').value    = p.tirePressurePsi ?? '';

  document.getElementById('fuel_typein').value      = p.fuelTypeIn ?? '';
  document.getElementById('fuel_levelin').value     =
    (p.fuelLevelFractionIn == null) ? '' : String(p.fuelLevelFractionIn);

  document.getElementById('fuel_typepre').value     = p.fuelTypePre ?? '';
  document.getElementById('fuel_levelpre').value    = p.fuelLevelLitersPre ?? '';

  document.getElementById('precond_cycle').value    = p.cycle ?? '';
document.getElementById('precond_datetime').value = p.datetime ?? '';
document.getElementById('precond_responsible').value = p.responsible ?? '';
  document.getElementById('soak_time').value        = p.soakTimeH ?? '';
  document.getElementById('odo_pretest').value      = p.odoPretestKm ?? '';
  document.getElementById('precond_ok').value       = p.ok ?? '';

  document.getElementById('dtc_pending_before').value   = p.dtc?.pendingBefore ?? 'no';
  document.getElementById('dtc_confirmed_before').value = p.dtc?.confirmedBefore ?? 'no';
  document.getElementById('dtc_permanent_before').value = p.dtc?.permanentBefore ?? 'no';

  document.getElementById('tank_capacity').value    = p.tankCapacityL ?? '';
  document.getElementById('tire_pressure_in').value = p.tirePressureInPsi ?? '';
  document.getElementById('battery_soc').value      = p.batterySocPct ?? '';

  document.getElementById('test_tunnel').value      = tv.tunnel ?? '';
  document.getElementById('test_dyno_on').value     = tv.dyno ?? '';
  document.getElementById('test_fan_mode').value    = tv.fanMode ?? '';
  document.getElementById('test_fan_speed').value   = tv.fanSpeedKmh ?? '';
  document.getElementById('test_fan_flow').value    = tv.fanFlowM3Min ?? '';
  updateFanFieldsByMode();

  document.getElementById('test_inertia_ok').value  = tv.inertiaOk ?? '';
  document.getElementById('test_chains').value      = tv.chains ?? '';
  document.getElementById('test_slings').value      = tv.slings ?? '';
  document.getElementById('test_hood').value        = tv.hood ?? '';
  document.getElementById('test_rear_rollers').value= tv.rearRollers ?? '';
  document.getElementById('test_screen').value      = tv.screen ?? '';
  document.getElementById('test_mex_waitcheck').value = tv.mexWaitCheck ?? '';
  document.getElementById('test_verify_notes').value  = tv.notes ?? '';

  const storedSI = {
    etw: td.etw || 0, tA: td.targetA || 0, dA: td.dynoA || 0,
    tB: td.targetB || 0, dB: td.dynoB || 0, tC: td.targetC || 0, dC: td.dynoC || 0
  };

  const show = fromSI(storedSI, currentUnitSystem);
  document.getElementById('etw').value = show.etw ? round(show.etw, 2) : '';
  document.getElementById('tA').value  = show.tA  ? round(show.tA, 4) : '';
  document.getElementById('dA').value  = show.dA  ? round(show.dA, 4) : '';
  document.getElementById('tB').value  = show.tB  ? round(show.tB, 6) : '';
  document.getElementById('dB').value  = show.dB  ? round(show.dB, 6) : '';
  document.getElementById('tC').value  = show.tC  ? round(show.tC, 8) : '';
  document.getElementById('dC').value  = show.dC  ? round(show.dC, 8) : '';

  // Auto-fill empty operator fields with last used
  autoFillOperators();

  // Show readiness checklist
  updateReadinessChecklist();

  // Auto-suggest dates based on cascade logic
  autoSuggestDates();

  // Update vehicle inline checklist
  if (typeof vclUpdate === 'function') vclUpdate();
}


function updateTestVerificationVisibility() {
  const status = document.getElementById('op_status')?.value;
  const card = document.getElementById('test-verify-card');
  if (!card) return;

  card.style.display = (status === 'testing') ? 'block' : 'none';
}

function initStatusPrevValue() {
  const st = document.getElementById('op_status');
  if (st && !st.dataset.prev) st.dataset.prev = st.value || 'in-progress';
}

function handleStatusChange(selectEl) {
  if (!selectEl) return;

  const vehicle = db.vehicles.find(v => v.id == activeVehicleId);
  const isEm = vehicle ? isEmissionsPurpose(vehicle.purpose) : true;

  const prev = selectEl.dataset.prev || selectEl.value || 'in-progress';
  const next = selectEl.value;

  // ✅ Si va a Ready-Release:
  if (next === 'ready-release') {
    if (isEm) {
      // Solo Emisiones: validación completa COP15-F05
      const missing = validateReadyForRelease();
      if (missing.length > 0) {
        selectEl.value = prev;
        updateTestVerificationVisibility();
        showMissingPopup(missing);
        return;
      }
    } else {
      // ✅ Modo simple: validación ligera (opcional)
      const missingSimple = validateReadyForReleaseSimple();
      if (missingSimple.length > 0) {
        selectEl.value = prev;
        showMissingPopup(missingSimple);
        return;
      }
    }
  }

  // ✅ aceptar cambio
  selectEl.dataset.prev = next;
  updateTestVerificationVisibility();
  if (typeof smartFormApplyByStatus === 'function') smartFormApplyByStatus(next);
  if (typeof smartFormUpdateBadges === 'function') smartFormUpdateBadges();
  // [V7-A1] Emit status change event
  if (typeof emitEvent === 'function') emitEvent('vehicle:statusChanged', { vehicleId: activeVehicleId, from: prev, to: next });
  // [V7-D2] Update floating next step banner
  if (typeof v7UpdateNextStepBanner === 'function') v7UpdateNextStepBanner();
}


// ======================================================================
// [M06] CONVERSIÓN DE UNIDADES SI / EN]
// ======================================================================


function toSI(values, system) {
  if (system === 'SI') return values;

  // EN -> SI
  const kF = UNIT_CONVERSION.lbf_to_N;
  const kV = UNIT_CONVERSION.mph_to_kmh;

  return {
    etw: values.etw * UNIT_CONVERSION.lb_to_kg,
    tA: values.tA * kF,
    dA: values.dA * kF,
    tB: values.tB * (kF / kV),
    dB: values.dB * (kF / kV),
    tC: values.tC * (kF / (kV * kV)),
    dC: values.dC * (kF / (kV * kV))
  };
}

function fromSI(values, system) {
  if (system === 'SI') return values;

  // SI -> EN
  const kF = UNIT_CONVERSION.N_to_lbf;
  const kV = UNIT_CONVERSION.kmh_to_mph;

  return {
    etw: values.etw * UNIT_CONVERSION.kg_to_lb,
    tA: values.tA * kF,
    dA: values.dA * kF,
    tB: values.tB * (kF / kV),
    dB: values.dB * (kF / kV),
    tC: values.tC * (kF / (kV * kV)),
    dC: values.dC * (kF / (kV * kV))
  };
}


function toggleUnits() {
  // A) sistema viejo (antes de cambiar)
  const oldSystem = currentUnitSystem;

  // B) sistema nuevo según el switch
  const isEN = document.getElementById('unitSwitch').checked;
  const newSystem = isEN ? 'EN' : 'SI';

  // C) leer lo que está actualmente en pantalla (en el sistema viejo)
  const currentDisplay = {
    etw: parseFloat(document.getElementById('etw').value) || 0,
    tA:  parseFloat(document.getElementById('tA').value) || 0,
    dA:  parseFloat(document.getElementById('dA').value) || 0,
    tB:  parseFloat(document.getElementById('tB').value) || 0,
    dB:  parseFloat(document.getElementById('dB').value) || 0,
    tC:  parseFloat(document.getElementById('tC').value) || 0,
    dC:  parseFloat(document.getElementById('dC').value) || 0
  };

  // D) convertir: old -> SI -> new
  const asSI  = toSI(currentDisplay, oldSystem);
  const asNew = fromSI(asSI, newSystem);

  // E) ahora sí, actualizar variable global
  currentUnitSystem = newSystem;

  // F) Activar visual del toggle
  document.getElementById('unitSI').classList.toggle('active', !isEN);
  document.getElementById('unitEN').classList.toggle('active', isEN);

  // G) Cambiar texto de unidades (etiquetas)
  document.querySelectorAll('.unit-text').forEach(el => {
    const type = el.dataset.unit;

    if (currentUnitSystem === 'SI') {
      if (type === 'etw') el.innerHTML = 'kg';
      if (type === 'force') el.innerHTML = 'N';
      if (type === 'force-speed') el.innerHTML = 'N/(km/h)';
      if (type === 'force-speed2') el.innerHTML = 'N/(km/h)<sup>2</sup>';
    } else {
      if (type === 'etw') el.innerHTML = 'lb';
      if (type === 'force') el.innerHTML = 'lbf';
      if (type === 'force-speed') el.innerHTML = 'lbf/(mph)';
      if (type === 'force-speed2') el.innerHTML = 'lbf/(mph)<sup>2</sup>';
    }
  });

  // H) (la parte que te faltaba) actualizar NÚMEROS en pantalla
  document.getElementById('etw').value = asNew.etw ? round(asNew.etw, 2) : '';
  document.getElementById('tA').value  = asNew.tA  ? round(asNew.tA, 4) : '';
  document.getElementById('dA').value  = asNew.dA  ? round(asNew.dA, 4) : '';
  document.getElementById('tB').value  = asNew.tB  ? round(asNew.tB, 6) : '';
  document.getElementById('dB').value  = asNew.dB  ? round(asNew.dB, 6) : '';
  document.getElementById('tC').value  = asNew.tC  ? round(asNew.tC, 8) : '';
  document.getElementById('dC').value  = asNew.dC  ? round(asNew.dC, 8) : '';
}


// ======================================================================
// [M07] VENTILADOR]
// ======================================================================



function updateFanFieldsByMode() {
  const modeEl  = document.getElementById('test_fan_mode');
  const speedEl = document.getElementById('test_fan_speed');
  const flowEl  = document.getElementById('test_fan_flow');
  if (!modeEl || !speedEl || !flowEl) return;

  const mode = modeEl.value;

  // Reset base
  speedEl.disabled = false;
  speedEl.readOnly = false;

  flowEl.disabled = true;
  flowEl.readOnly = true;

  // --- Caso 1: Speed Follow ---
  if (mode === 'speed_follow') {
    speedEl.value = 'Speed Follow';
    flowEl.value  = 'Speed Follow';

    speedEl.disabled = true;   // no editable
    flowEl.disabled  = true;   // no editable
    return;
  }

  // --- Caso 2: Velocidad (km/h) ---
  if (mode === 'speed') {
    // Si venía de Speed Follow, limpia para que el usuario capture número
    if (speedEl.value === 'Speed Follow') speedEl.value = '';
    if (flowEl.value === 'Speed Follow') flowEl.value = '';

    speedEl.disabled = false;      // editable
    speedEl.readOnly = false;

    flowEl.disabled = false;       // habilitado
    flowEl.readOnly = true;        // pero NO editable (se calcula)
    calculateFanFlowFromSpeed();   // calcula al cambiar a modo speed
    return;
  }

  // --- Caso 3: Sin selección ---
  // Limpia y bloquea ambos
  speedEl.value = '';
  flowEl.value  = '';
  flowEl.disabled = true;
  flowEl.readOnly = true;
}


function calculateFanFlowFromSpeed() {
  const modeEl  = document.getElementById('test_fan_mode');
  const speedEl = document.getElementById('test_fan_speed');
  const flowEl  = document.getElementById('test_fan_flow');
  if (!modeEl || !speedEl || !flowEl) return;

  // Solo calculamos si el modo es "speed"
  if (modeEl.value !== 'speed') return;

  // Convertir texto a número
  const speedKmh = parseFloat(String(speedEl.value).replace(',', '.'));
  if (!isFinite(speedKmh) || speedKmh < 0) {
    flowEl.value = '';
    return;
  }

  // Conversión (México) usando área 0.4*0.8 y km/h -> m/min
  // Basado en el formato COP15-F05 (nota de cálculo México) [1](https://kiamotorsna.sharepoint.com/sites/KMX-Quality-QA/Shared%20Documents/2.%20Information/QMS/3.%20External%20Audits/2025%20-%20Re-certification%20Audit%20BV/Documents%20BV/Corrective%20Actions/3.%20Evidencias%20NC_4.4.2/6.%20COP15-F05%20Vehicle%20Inspection%20Sheet.pdf?web=1)
  const area = 0.4 * 0.8; // m²
  let flowM3Min = (speedKmh * 1000 / 60) * area;

  // Límite México 150 m³/min max [1](https://kiamotorsna.sharepoint.com/sites/KMX-Quality-QA/Shared%20Documents/2.%20Information/QMS/3.%20External%20Audits/2025%20-%20Re-certification%20Audit%20BV/Documents%20BV/Corrective%20Actions/3.%20Evidencias%20NC_4.4.2/6.%20COP15-F05%20Vehicle%20Inspection%20Sheet.pdf?web=1)
  if (flowM3Min > 150) flowM3Min = 150;

  flowEl.value = flowM3Min.toFixed(1);
}


// ======================================================================
// [M08] VALIDACIÓN CAMPOS OBLIGATORIOS]
// ======================================================================


function clearMissingMarks() {
  document.querySelectorAll('.field-missing').forEach(el => el.classList.remove('field-missing'));
}

function isEmptyValue(el) {
  if (!el) return true;
  const v = (el.value ?? '').toString().trim();
  return v === '' || v === 'Seleccionar…' || v === 'Seleccionar...' || v === '-- Seleccionar --';
}


function addMissing(missing, id, label) {
  missing.push({ id, label });
  const el = document.getElementById(id);
  if (el) el.classList.add('field-missing');
}

function validateReadyForRelease() {
  clearMissingMarks();
  const missing = [];

  // ===== Recepción =====
  if (isEmptyValue(document.getElementById('op_recep'))) addMissing(missing, 'op_recep', 'Operador de Recepción');
  if (isEmptyValue(document.getElementById('op_odo'))) addMissing(missing, 'op_odo', 'Odómetro (km)');
  if (isEmptyValue(document.getElementById('op_datetime'))) addMissing(missing, 'op_datetime', 'Fecha/Hora Recepción');
  if (isEmptyValue(document.getElementById('fuel_typein'))) addMissing(missing, 'fuel_typein', 'Tipo de combustible (Recepción)');
  if (isEmptyValue(document.getElementById('fuel_levelin'))) addMissing(missing, 'fuel_levelin', 'Nivel de combustible (fracción)');
  if (isEmptyValue(document.getElementById('tank_capacity'))) addMissing(missing, 'tank_capacity', 'Capacidad del tanque (L)');
  if (isEmptyValue(document.getElementById('tire_pressure_in'))) addMissing(missing, 'tire_pressure_in', 'Presión de llantas inicial (psi)');
  if (isEmptyValue(document.getElementById('battery_soc'))) addMissing(missing, 'battery_soc', 'Estado de batería (SOC %)');

  // ===== Preacondicionamiento =====
  if (isEmptyValue(document.getElementById('tire_pressure'))) addMissing(missing, 'tire_pressure', 'Presión de llantas (Preacond.)');
if (isEmptyValue(document.getElementById('precond_datetime')))
  addMissing(missing, 'precond_datetime', 'Fecha/Hora de Preacondicionamiento');
  if (isEmptyValue(document.getElementById('fuel_levelpre'))) addMissing(missing, 'fuel_levelpre', 'Nivel de combustible (L) Preacond.');
  if (isEmptyValue(document.getElementById('fuel_typepre'))) addMissing(missing, 'fuel_typepre', 'Tipo de combustible (Preacond.)');
  if (isEmptyValue(document.getElementById('precond_cycle'))) addMissing(missing, 'precond_cycle', 'Ciclo de preacondicionamiento');
  if (isEmptyValue(document.getElementById('soak_time'))) addMissing(missing, 'soak_time', 'Tiempo de reposo (h)');
if (isEmptyValue(document.getElementById('precond_responsible')))
  addMissing(missing, 'precond_responsible', 'Persona a cargo (Preacondicionamiento)');
  if (isEmptyValue(document.getElementById('odo_pretest'))) addMissing(missing, 'odo_pretest', 'Odómetro para prueba (km)');
  if (isEmptyValue(document.getElementById('precond_ok'))) addMissing(missing, 'precond_ok', 'Cumple preacondicionamiento');
  // DTC (siempre seleccionados por default pero lo validamos por robustez)
  if (isEmptyValue(document.getElementById('dtc_pending_before'))) addMissing(missing, 'dtc_pending_before', 'DTC Pendiente (antes)');
  if (isEmptyValue(document.getElementById('dtc_confirmed_before'))) addMissing(missing, 'dtc_confirmed_before', 'DTC Confirmado (antes)');
  if (isEmptyValue(document.getElementById('dtc_permanent_before'))) addMissing(missing, 'dtc_permanent_before', 'DTC Permanente (antes)');

  // ===== Verificación en Prueba (según COP15-F05) =====
  // El formato COP15-F05 lista estos items en “Verificación en Prueba” incluyendo ventilador y flujo máx 150. [1](https://kiamotorsna.sharepoint.com/sites/KMX-Quality-QA/Shared%20Documents/2.%20Information/QMS/3.%20External%20Audits/2025%20-%20Re-certification%20Audit%20BV/Documents%20BV/Corrective%20Actions/3.%20Evidencias%20NC_4.4.2/6.%20COP15-F05%20Vehicle%20Inspection%20Sheet.pdf)
  if (isEmptyValue(document.getElementById('test_tunnel'))) addMissing(missing, 'test_tunnel', 'Túnel (RMT1/RMT2)');
  if (isEmptyValue(document.getElementById('test_dyno_on'))) addMissing(missing, 'test_dyno_on', 'Dinamómetro (Encendido/Apagado)');
  if (isEmptyValue(document.getElementById('test_fan_mode'))) addMissing(missing, 'test_fan_mode', 'Ventilador (modo)');

// ===== Datos de prueba requeridos por COP15-F05 =====
if (isEmptyValue(document.getElementById('test_responsible')))
  addMissing(missing, 'test_responsible', 'Persona a cargo de la prueba');

if (isEmptyValue(document.getElementById('test_datetime')))
  addMissing(missing, 'test_datetime', 'Fecha/Hora de la prueba');  

// Ventilador: reglas
  const fanModeEl = document.getElementById('test_fan_mode');
  const fanMode = fanModeEl ? fanModeEl.value : '';

  if (fanMode === 'speed') {
    // En modo velocidad, debe existir velocidad numérica y flujo calculado (máx 150). [1](https://kiamotorsna.sharepoint.com/sites/KMX-Quality-QA/Shared%20Documents/2.%20Information/QMS/3.%20External%20Audits/2025%20-%20Re-certification%20Audit%20BV/Documents%20BV/Corrective%20Actions/3.%20Evidencias%20NC_4.4.2/6.%20COP15-F05%20Vehicle%20Inspection%20Sheet.pdf)
    const sp = document.getElementById('test_fan_speed');
    const fl = document.getElementById('test_fan_flow');

    const spNum = parseFloat(String(sp?.value || '').replace(',', '.'));
    if (!isFinite(spNum) || spNum <= 0) addMissing(missing, 'test_fan_speed', 'Velocidad del ventilador (km/h)');

    const flNum = parseFloat(String(fl?.value || '').replace(',', '.'));
    if (!isFinite(flNum) || flNum <= 0) addMissing(missing, 'test_fan_flow', 'Flujo del ventilador (m³/min)');
    if (isFinite(flNum) && flNum > 150) addMissing(missing, 'test_fan_flow', 'Flujo del ventilador (máx 150 m³/min, México)');
  }

  if (fanMode === 'speed_follow') {
    // En speed follow, tus campos dicen “Speed Follow” y están bloqueados (eso ya cuenta como válido)
  }

  if (isEmptyValue(document.getElementById('test_inertia_ok'))) addMissing(missing, 'test_inertia_ok', 'Parámetros de Inercia');
  if (isEmptyValue(document.getElementById('test_chains'))) addMissing(missing, 'test_chains', 'Cadenas de amarre 1 y 2');
  if (isEmptyValue(document.getElementById('test_slings'))) addMissing(missing, 'test_slings', 'Eslinga 1 y 2');
  if (isEmptyValue(document.getElementById('test_hood'))) addMissing(missing, 'test_hood', 'Capó del vehículo');
  if (isEmptyValue(document.getElementById('test_rear_rollers'))) addMissing(missing, 'test_rear_rollers', 'Rodillos traseros');
  if (isEmptyValue(document.getElementById('test_screen'))) addMissing(missing, 'test_screen', 'Pantalla');
  if (isEmptyValue(document.getElementById('test_mex_waitcheck'))) addMissing(missing, 'test_mex_waitcheck', 'Verificación FTP75–HWY (México)');

  return missing;
}


function validateReadyForReleaseSimple() {
  clearMissingMarks();
  const missing = [];

  // mínimos para modo simple:
  if (isEmptyValue(document.getElementById('simple_operator')))
    addMissing(missing, 'simple_operator', 'Operador (Formato Simple)');

  if (isEmptyValue(document.getElementById('simple_datetime')))
    addMissing(missing, 'simple_datetime', 'Fecha/Hora (Formato Simple)');

  return missing;
}

function showMissingPopup(missing) {
  showToast('Faltan ' + missing.length + ' campos para Liberación. Se marcaron en rojo.', 'error');

  // Scroll y focus al primero
  const first = document.getElementById(missing[0].id);
  if (first) {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { try { first.focus(); } catch(e){} }, 250);
  }
}


// ======================================================================
// [M09] GUARDAR PROGRESO]
// ======================================================================



function saveProgress(opts) {
  var silent = opts && opts.silent;
  if (!activeVehicleId) {
    if (!silent) showToast('No hay vehículo seleccionado', 'error');
    return;
  }

  // Save button feedback (skip in silent/auto-save mode)
  var saveBtn = document.getElementById('btn-save');
  if (saveBtn && !silent) { setBtnLoading(saveBtn, true, 'Guardando...'); }

  const vehicle = db.vehicles.find(v => v.id == activeVehicleId);
  if (!vehicle) return;
  vehicle.lastModified = new Date().toISOString();

  const isEm = isEmissionsPurpose(vehicle.purpose);

  // ==================== MODO SIMPLE ====================
  if (!isEm) {
    vehicle.testData = vehicle.testData || {};
    vehicle.testData.simple = {
      operator: document.getElementById('simple_operator')?.value || '',
      datetime: document.getElementById('simple_datetime')?.value || '',
      notes: document.getElementById('simple_notes')?.value || '',
      lastUpdated: new Date().toISOString()
    };

    const newStatus = document.getElementById('op_status')?.value || 'in-progress';
    if (newStatus !== vehicle.status) {
      vehicle.status = newStatus;
      vehicle.timeline = vehicle.timeline || [];
      vehicle.timeline.push({
        timestamp: new Date().toISOString(),
        user: vehicle.testData.simple.operator || 'Sistema',
        action: `Estado cambiado a: ${CONFIG.statusLabels[newStatus]}`,
        data: { status: newStatus }
      });
    }

    vehicle.timeline = vehicle.timeline || [];
    vehicle.timeline.push({
      timestamp: new Date().toISOString(),
      user: vehicle.testData.simple.operator || 'Sistema',
      action: 'Datos de operación (formato simple) actualizados',
      data: { operator: vehicle.testData.simple.operator || '', result: vehicle.testData.simple.resultado || '', status: vehicle.status }
    });

    saveDB();
    if (!silent) auditLog('cop15', 'operation_saved', {type:'vehicle', id:vehicle.id, label:vehicle.vin}, 'Simple — status: ' + (CONFIG.statusLabels[vehicle.status] || vehicle.status));
    if ((newStatus === 'testing' || newStatus === 'in-progress') && typeof fbPostTestStarted === 'function') fbPostTestStarted(vehicle.vin);
    clearUnsaved();
    if (saveBtn && !silent) { setBtnLoading(saveBtn, false); }
    if (!silent) showToast('Progreso guardado (formato simple)', 'success');
    refreshAllLists();
    updateProgressBar();
    return;
  }

const precondDatetime = document.getElementById('precond_datetime')?.value || '';

  // ==================== EMISIONES ====================
  const odometer = parseFloat(document.getElementById('op_odo')?.value || '');
  if (isFinite(odometer) && odometer < 0) {
    showToast('El odómetro no puede ser negativo', 'error');
    return;
  }

  const mode = document.getElementById('test_fan_mode')?.value || '';
  const testVerification = (document.getElementById('op_status')?.value === 'testing')
    ? {
        tunnel: document.getElementById('test_tunnel')?.value || '',
        dyno: document.getElementById('test_dyno_on')?.value || '',
        fanMode: mode,
        fanSpeedKmh: (mode === 'speed')
          ? (parseFloat(String(document.getElementById('test_fan_speed')?.value || '').replace(',', '.')) || null)
          : null,
        fanFlowM3Min: (mode === 'speed')
          ? (parseFloat(String(document.getElementById('test_fan_flow')?.value || '').replace(',', '.')) || null)
          : null,
        inertiaOk: document.getElementById('test_inertia_ok')?.value || '',
        chains: document.getElementById('test_chains')?.value || '',
        slings: document.getElementById('test_slings')?.value || '',
        hood: document.getElementById('test_hood')?.value || '',
        rearRollers: document.getElementById('test_rear_rollers')?.value || '',
        screen: document.getElementById('test_screen')?.value || '',
        mexWaitCheck: document.getElementById('test_mex_waitcheck')?.value || '',
        notes: document.getElementById('test_verify_notes')?.value || ''
      }
    : (vehicle.testData?.testVerification || null); // ← PRESERVE existing data when not in testing mode

const precondResponsible = document.getElementById('precond_responsible')?.value || '';

  const preconditioning = {
  datetime: precondDatetime,
  responsible: precondResponsible, // ✅ NUEVO
    tirePressurePsi: (document.getElementById('tire_pressure')?.value !== '') ? parseInt(document.getElementById('tire_pressure')?.value) : null,
    fuelTypeIn: document.getElementById('fuel_typein')?.value || '',
    fuelLevelFractionIn: (document.getElementById('fuel_levelin')?.value !== '') ? parseFloat(document.getElementById('fuel_levelin')?.value) : null,
    fuelTypePre: document.getElementById('fuel_typepre')?.value || '',
    fuelLevelLitersPre: (document.getElementById('fuel_levelpre')?.value !== '') ? parseInt(document.getElementById('fuel_levelpre')?.value) : null,
    tankCapacityL: (document.getElementById('tank_capacity')?.value !== '') ? parseInt(document.getElementById('tank_capacity')?.value) : null,
    tirePressureInPsi: (document.getElementById('tire_pressure_in')?.value !== '') ? parseInt(document.getElementById('tire_pressure_in')?.value) : null,
    batterySocPct: (document.getElementById('battery_soc')?.value !== '') ? parseInt(document.getElementById('battery_soc')?.value) : null,
    cycle: document.getElementById('precond_cycle')?.value || '',
    soakTimeH: (document.getElementById('soak_time')?.value !== '') ? parseFloat(document.getElementById('soak_time')?.value) : null,
    odoPretestKm: (document.getElementById('odo_pretest')?.value !== '') ? parseInt(document.getElementById('odo_pretest')?.value) : null,
    ok: document.getElementById('precond_ok')?.value || '',
    dtc: {
      pendingBefore: document.getElementById('dtc_pending_before')?.value || 'no',
      confirmedBefore: document.getElementById('dtc_confirmed_before')?.value || 'no',
      permanentBefore: document.getElementById('dtc_permanent_before')?.value || 'no'
    }
  };

  const rawValues = {
    etw: parseFloat(document.getElementById('etw')?.value) || 0,
    tA:  parseFloat(document.getElementById('tA')?.value)  || 0,
    dA:  parseFloat(document.getElementById('dA')?.value)  || 0,
    tB:  parseFloat(document.getElementById('tB')?.value)  || 0,
    dB:  parseFloat(document.getElementById('dB')?.value)  || 0,
    tC:  parseFloat(document.getElementById('tC')?.value)  || 0,
    dC:  parseFloat(document.getElementById('dC')?.value)  || 0
  };

  const siValues = toSI(rawValues, currentUnitSystem);

  vehicle.testData = {
    operator: document.getElementById('op_recep')?.value || '',
    testResponsible: document.getElementById('test_responsible')?.value || '',
    testDatetime: document.getElementById('test_datetime')?.value || '',
    odometer: isFinite(odometer) ? odometer : null,
    datetime: document.getElementById('op_datetime')?.value || '',
    notes: document.getElementById('op_notes')?.value || '',
    preconditioning,
    testVerification,
    unitSystem: 'SI',
    inputSystem: currentUnitSystem,
    etw: siValues.etw,
    targetA: siValues.tA,
    dynoA: siValues.dA,
    targetB: siValues.tB,
    dynoB: siValues.dB,
    targetC: siValues.tC,
    dynoC: siValues.dC,
    lastUpdated: new Date().toISOString()
  };

  vehicle.timeline = vehicle.timeline || [];
  const newStatus = document.getElementById('op_status')?.value || 'in-progress';
  if (newStatus !== vehicle.status) {
    vehicle.status = newStatus;
    vehicle.timeline.push({
      timestamp: new Date().toISOString(),
      user: vehicle.testData.operator || 'Sistema',
      action: `Estado cambiado a: ${CONFIG.statusLabels[newStatus]}`,
      data: { status: newStatus }
    });
  }

  vehicle.timeline.push({
    timestamp: new Date().toISOString(),
    user: vehicle.testData.operator || 'Sistema',
    action: 'Datos de prueba actualizados',
    data: { operator: vehicle.testData.operator || '', odometer: vehicle.testData.odometer || '', fan_mode: vehicle.testData.fan_mode || '', precond_ok: vehicle.testData.precond_ok || '', status: vehicle.status }
  });

  saveDB();
  if (newStatus === 'testing' && typeof fbPostTestStarted === 'function') fbPostTestStarted(vehicle.vin);
  clearUnsaved();
  if (saveBtn && !silent) { setBtnLoading(saveBtn, false); }
  if (!silent) showToast('Progreso guardado exitosamente', 'success');
  refreshAllLists();
  updateProgressBar();

  // Update readiness checklist after save
  updateReadinessChecklist();

  // Update vehicle inline checklist
  if (typeof vclUpdate === 'function') { vclUpdate(); if (_vclOpen) vclRender(); }

  // Mejora A: Auto-advance suggestion
  if (isEm) checkAutoAdvance(vehicle);
}


// ======================================================================
// [M09a] READINESS CHECKLIST
// ======================================================================

function updateReadinessChecklist() {
    var el = document.getElementById('readiness-checklist');
    if (!el || !activeVehicleId) { if (el) el.style.display = 'none'; return; }

    var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle || !isEmissionsPurpose(vehicle.purpose)) { el.style.display = 'none'; return; }

    var td = vehicle.testData || {};
    var p = td.preconditioning || {};
    var tv = td.testVerification || {};

    // Section checks
    var sections = [
        {
            name: 'Recepcion',
            fields: [td.operator, td.odometer, td.datetime],
            total: 3
        },
        {
            name: 'Preacond',
            fields: [p.datetime, p.responsible, p.tirePressurePsi, p.fuelTypeIn, p.cycle, p.ok],
            total: 6
        },
        {
            name: 'Test',
            fields: [td.testResponsible, td.testDatetime, tv.tunnel, tv.dyno, tv.fanMode, tv.inertiaOk, tv.chains],
            total: 7
        }
    ];

    var html = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';
    html += '<span style="font-weight:700;color:#475569;font-size:11px;">Progreso:</span>';

    sections.forEach(function(s) {
        var filled = s.fields.filter(function(f) { return f !== undefined && f !== null && f !== ''; }).length;
        var pct = Math.round((filled / s.total) * 100);
        var icon = pct === 100 ? '✅' : pct >= 50 ? '⚠️' : '❌';
        var color = pct === 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
        html += '<span style="font-size:11px;padding:3px 8px;border-radius:6px;background:' + color + '10;color:' + color + ';border:1px solid ' + color + '30;">' + icon + ' ' + s.name + ' ' + filled + '/' + s.total + '</span>';
    });

    html += '</div>';
    el.style.display = 'block';
    el.innerHTML = html;
}

// ======================================================================
// [M09b] AUTO-AVANCE DE STATUS
// ======================================================================

function checkAutoAdvance(vehicle) {
  if (!vehicle || !vehicle.testData) return;
  var status = vehicle.status;
  var td = vehicle.testData;
  var p = td.preconditioning || {};
  var statusEl = document.getElementById('op_status');
  if (!statusEl) return;

  var suggestion = null;
  var nextStatus = null;
  var missingCount = 0;

  if (status === 'registered' || status === 'in-progress') {
    // Check if preconditioning section is complete
    var precondFields = [p.datetime, p.responsible, p.cycle, p.ok];
    var filled = precondFields.filter(function(f) { return f && f !== ''; }).length;
    missingCount = precondFields.length - filled;

    if (filled === precondFields.length && p.ok === 'Si') {
      // Check soak timer
      var soakData = null;
      try { soakData = JSON.parse(localStorage.getItem('kia_soak_timer')); } catch(e) {}
      var soakDone = !soakData || !soakData.endTime || soakData.endTime <= Date.now();

      if (soakDone) {
        suggestion = 'Preacondicionamiento completo. ¿Avanzar a "En Prueba"?';
        nextStatus = 'testing';
      } else {
        var remaining = soakData.endTime - Date.now();
        var hrs = Math.floor(remaining / 3600000);
        var mins = Math.floor((remaining % 3600000) / 60000);
        suggestion = 'Precond OK. Soak restante: ' + hrs + 'h ' + mins + 'm';
        nextStatus = null; // Don't suggest advance yet
      }
    } else if (status === 'registered' && filled >= 2) {
      suggestion = 'Precond en progreso (' + filled + '/' + precondFields.length + '). ¿Avanzar a "En Progreso"?';
      nextStatus = 'in-progress';
    }
  } else if (status === 'testing') {
    // Check if test verification is complete
    var tv = td.testVerification || {};
    var testFields = [tv.tunnel, tv.dyno, tv.fanMode, tv.inertiaOk, tv.chains, tv.slings, tv.hood];
    var filledTest = testFields.filter(function(f) { return f && f !== ''; }).length;
    missingCount = testFields.length - filledTest;

    if (filledTest === testFields.length && td.testResponsible && td.testDatetime) {
      suggestion = 'Verificacion de prueba completa. ¿Avanzar a "Listo para Liberacion"?';
      nextStatus = 'ready-release';
    }
  }

  if (!suggestion) return;

  // Remove any existing auto-advance toast
  var existing = document.querySelector('.auto-advance-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.className = 'auto-advance-toast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;background:#1e293b;color:#f8fafc;padding:12px 18px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;font-size:12px;max-width:90vw;animation:slideUp 0.3s ease;border:1px solid #334155;';

  var icon = status === 'testing' ? '🏁' : '⚡';
  var html = '<span>' + icon + ' ' + suggestion + '</span>';
  if (nextStatus) {
    html += '<button onclick="applyAutoAdvance(\'' + nextStatus + '\')" style="background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">Si</button>';
    html += '<button onclick="this.parentElement.remove()" style="background:transparent;color:#94a3b8;border:1px solid #475569;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;">No</button>';
  } else {
    html += '<button onclick="this.parentElement.remove()" style="background:transparent;color:#94a3b8;border:1px solid #475569;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer;">OK</button>';
  }
  toast.innerHTML = html;
  document.body.appendChild(toast);

  // Auto-dismiss after 8 seconds
  setTimeout(function() { if (toast.parentElement) toast.remove(); }, 8000);
}

function applyAutoAdvance(nextStatus) {
  var statusEl = document.getElementById('op_status');
  if (!statusEl) return;

  // Remove toast
  var toast = document.querySelector('.auto-advance-toast');
  if (toast) toast.remove();

  // If advancing to ready-release, validate first
  if (nextStatus === 'ready-release') {
    var missing = validateReadyForRelease();
    if (missing.length > 0) {
      showToast('Faltan campos para liberacion', 'warning');
      showMissingPopup(missing);
      return;
    }
  }

  statusEl.value = nextStatus;
  statusEl.dataset.prev = nextStatus;
  updateTestVerificationVisibility();

  // Update vehicle status
  var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
  if (vehicle) {
    vehicle.status = nextStatus;
    vehicle.timeline = vehicle.timeline || [];
    vehicle.timeline.push({
      timestamp: new Date().toISOString(),
      user: vehicle.testData?.operator || vehicle.testData?.testResponsible || 'Sistema',
      action: 'Auto-avance a: ' + (CONFIG.statusLabels[nextStatus] || nextStatus),
      data: { status: nextStatus, autoAdvance: true }
    });
    saveDB();
    refreshAllLists();

    // Auto-fill test datetime when advancing to testing
    if (nextStatus === 'testing') {
      var testDt = document.getElementById('test_datetime');
      if (testDt && !testDt.value) {
        var tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2);
        testDt.value = tomorrow.toISOString().slice(0, 16).replace('T', 'T') || tomorrow.toISOString().slice(0, 10) + 'T08:00';
      }
    }
  }

  showToast('Estado avanzado a: ' + (CONFIG.statusLabels[nextStatus] || nextStatus), 'success');
}

// ======================================================================
// [M10] LIBERACIÓN]
// ======================================================================


function loadRelease() {
  activeVehicleId = document.getElementById('releaseVehSelect').value;
  const content = document.getElementById('lib-content');

  if (!activeVehicleId) {
    content.style.display = 'none';
    return;
  }

  const vehicle = db.vehicles.find(v => v.id == activeVehicleId);
  if (!vehicle) return;

  content.style.display = 'block';

  document.getElementById('releaseInfo').innerHTML = `
    📋 <strong>VIN:</strong> ${vehicle.vin} | 
    <strong>Config:</strong> ${vehicle.configCode}
  `;

if (vehicle.status !== 'ready-release') {
  showToast('Este vehículo aún no está "Listo para Liberación".', 'warning');
  document.getElementById('releaseVehSelect').value = '';
  content.style.display = 'none';
  return;
}

  // ✅ DECLARAR testData ANTES
  const testData = vehicle.testData || {};
  const isEm = isEmissionsPurpose(vehicle.purpose);

  // ✅ RAMA SIMPLE (NO EMISIONES)
  if (!isEm) {
    const s = (testData.simple || {});
    document.getElementById('testSummary').innerHTML = `
      <div style="background:#f8fafc; padding:15px; border-radius:8px;">
        <strong>Propósito:</strong> ${vehicle.purpose}<br>
        <strong>Operador:</strong> ${s.operator || 'N/A'}<br>
        <strong>Fecha/Hora:</strong> ${s.datetime || 'N/A'}<br>
        <strong>Notas:</strong> ${s.notes ? s.notes : '<em>Sin notas</em>'}
      </div>
    `;
    _renderUsedCylinders(vehicle);
    renderTimeline(vehicle);
    return;
  }

  // ✅ RAMA EMISIONES (tu lógica actual)
  document.getElementById('testSummary').innerHTML = `
    <div style="background: #f8fafc; padding: 15px; border-radius: 8px;">
      ${testData.odometer ? `<strong>Odómetro:</strong> ${testData.odometer} km<br>` : ''}
      ${testData.targetA ? `<strong>Target A:</strong> ${testData.targetA} lbs<br>` : ''}
      ${testData.targetB ? `<strong>Target B:</strong> ${testData.targetB} lbs<br>` : ''}
      ${testData.targetC ? `<strong>Target C:</strong> ${testData.targetC} lbs<br>` : ''}
      ${testData.operator ? `<strong>Operador:</strong> ${testData.operator}<br>` : ''}
      ${!testData.odometer && !testData.targetA ? '<em>No hay datos de prueba registrados</em>' : ''}
    </div>
  `;

  // Show gas cylinders used (from traceability log)
  _renderUsedCylinders(vehicle);

  renderTimeline(vehicle);

  // Mandatory scanned results sheet capture (emissions only)
  if (typeof paRenderDocUpload === 'function') paRenderDocUpload(vehicle.id);
  if (typeof paUpdateReleaseButtonState === 'function') paUpdateReleaseButtonState(vehicle.id);
}

function _renderUsedCylinders(vehicle) {
    var container = document.getElementById('testSummary');
    if (!container || !vehicle.vin) return;
    if (typeof invTraceByVin !== 'function') return;

    var traces = invTraceByVin(vehicle.vin);
    if (traces.length === 0) return;

    // Collect all unique cylinders across all usage entries for this VIN
    var seen = {};
    var cylinders = [];
    traces.forEach(function(entry) {
        if (!entry.cylinders) return;
        entry.cylinders.forEach(function(c) {
            if (!seen[c.id]) {
                seen[c.id] = true;
                cylinders.push(c);
            }
        });
    });

    if (cylinders.length === 0) return;

    var html = '<div style="margin-top:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;">' +
        '<div style="font-weight:700;font-size:12px;margin-bottom:6px;">🔗 Gases utilizados (' + cylinders.length + ' cilindros)</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">';

    cylinders.forEach(function(c) {
        html += '<div style="background:#fff;border:1px solid #d1fae5;border-radius:6px;padding:4px 8px;font-size:10px;">' +
            '<strong>' + c.controlNo + '</strong> ' + c.formula +
            (c.lotNumber ? ' · Lote: <span style="color:#0f766e;font-weight:600;">' + c.lotNumber + '</span>' : '') +
            (c.psi !== null && c.psi !== undefined ? ' · ' + c.psi + ' PSI' : '') +
            '</div>';
    });

    html += '</div></div>';
    container.insertAdjacentHTML('beforeend', html);
}

   var _tlFilter = 'all';

   function _tlClassifyAction(action) {
       var a = (action || '').toLowerCase();
       if (a.includes('status') || a.includes('estado') || a.includes('moved to') || a.includes('cambió')) return 'status';
       if (a.includes('error') || a.includes('rollback') || a.includes('revert')) return 'error';
       if (a.includes('release') || a.includes('liberado') || a.includes('archivado') || a.includes('auto-')) return 'system';
       return 'data';
   }

   function _tlClassifyPhase(action) {
       var a = (action || '').toLowerCase();
       if (a.includes('register') || a.includes('alta') || a.includes('recep')) return 'Recepción';
       if (a.includes('precond') || a.includes('soak') || a.includes('preacond')) return 'Preacondicionamiento';
       if (a.includes('test') || a.includes('prueba') || a.includes('emisi')) return 'Prueba';
       if (a.includes('release') || a.includes('libera') || a.includes('archiv')) return 'Liberación';
       return 'General';
   }

   var _tlTypeConfig = {
       status: { color: '#3b82f6', icon: '🔵', label: 'Status' },
       data:   { color: '#f59e0b', icon: '🟡', label: 'Datos' },
       system: { color: '#10b981', icon: '🟢', label: 'Sistema' },
       error:  { color: '#ef4444', icon: '🔴', label: 'Error' }
   };

   function renderTimeline(vehicle) {
       var container = document.getElementById('vehicleTimeline');
       if (!container) return;

       if (!vehicle.timeline || vehicle.timeline.length === 0) {
           container.innerHTML = '<em>No hay actividades registradas</em>';
           return;
       }

       // Filter toggle + Notes button
       var filterHtml = '<div class="tl-filters" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
           '<button class="tl-filter-btn' + (_tlFilter==='all'?' active':'') + '" onclick="_tlFilter=\'all\';renderTimeline(db.vehicles.find(function(v){return v.id==activeVehicleId}))">Todos</button>' +
           '<button class="tl-filter-btn' + (_tlFilter==='status'?' active':'') + '" onclick="_tlFilter=\'status\';renderTimeline(db.vehicles.find(function(v){return v.id==activeVehicleId}))">Solo Status</button>' +
           (typeof noteBuildButton === 'function' ? '<span style="margin-left:auto;">' + noteBuildButton('vehicle', String(vehicle.id)) + '</span>' : '') +
           '</div>';

       // Group by phase
       var phases = {};
       var phaseOrder = ['Recepción', 'Preacondicionamiento', 'Prueba', 'Liberación', 'General'];
       var phaseFirstTs = {};
       var phaseLastTs = {};

       vehicle.timeline.forEach(function(item) {
           var type = _tlClassifyAction(item.action);
           if (_tlFilter !== 'all' && type !== _tlFilter) return;

           var phase = _tlClassifyPhase(item.action);
           if (!phases[phase]) phases[phase] = [];
           phases[phase].push(item);

           var ts = new Date(item.timestamp).getTime();
           if (!phaseFirstTs[phase] || ts < phaseFirstTs[phase]) phaseFirstTs[phase] = ts;
           if (!phaseLastTs[phase] || ts > phaseLastTs[phase]) phaseLastTs[phase] = ts;
       });

       var html = filterHtml + '<div class="tl-track">';

       phaseOrder.forEach(function(phase) {
           if (!phases[phase] || phases[phase].length === 0) return;
           var durMs = (phaseLastTs[phase] || 0) - (phaseFirstTs[phase] || 0);
           var durStr = '';
           if (durMs > 0) {
               var h = Math.floor(durMs / 3600000);
               var m = Math.floor((durMs % 3600000) / 60000);
               durStr = h > 24 ? Math.round(h/24) + 'd ' + (h%24) + 'h' : h + 'h ' + m + 'm';
           }

           html += '<div class="tl-phase">' +
               '<div class="tl-phase-header"><span class="tl-phase-name">' + phase + '</span>' +
               (durStr ? '<span class="tl-phase-dur">' + durStr + '</span>' : '') + '</div>';

           phases[phase].forEach(function(item) {
               var d = new Date(item.timestamp);
               var type = _tlClassifyAction(item.action);
               var cfg = _tlTypeConfig[type];
               var timeStr = d.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});
               var dateStr = d.toLocaleDateString('es-MX', {day:'numeric',month:'short'});

               html += '<div class="tl-item">' +
                   '<div class="tl-dot" style="background:' + cfg.color + ';"></div>' +
                   '<div class="tl-content">' +
                   '<div class="tl-time">' + dateStr + ' ' + timeStr + '</div>' +
                   '<div class="tl-action">' + escapeHtml(item.action || '') + '</div>' +
                   (item.user ? '<div class="tl-user">' + escapeHtml(item.user) + '</div>' : '') +
                   '</div></div>';
           });

           html += '</div>';
       });

       html += '</div>';
       container.innerHTML = html;
   }



    function finishRelease(isRetest) {
        if(!activeVehicleId) {
            showToast('No hay vehículo seleccionado', 'error');
            return;
        }

        const vehicle = db.vehicles.find(v => v.id == activeVehicleId);
        if(!vehicle) return;

        // Mandatory: emissions vehicles need a captured results-sheet photo
        if (!isRetest && typeof isEmissionsPurpose === 'function' && isEmissionsPurpose(vehicle.purpose)) {
            if (!vehicle.testData || !vehicle.testData.scannedReportCaptured) {
                showToast('Falta capturar la hoja de resultados antes de liberar', 'error');
                return;
            }
        }

        // Save snapshot for rollback on error
        const prevStatus = vehicle.status;
        const prevTimeline = JSON.parse(JSON.stringify(vehicle.timeline || []));

        if(!isRetest) {
            vehicle.status = 'archived';
            vehicle.archivedAt = new Date().toISOString();
            vehicle.timeline.push({
                timestamp: new Date().toISOString(),
                user: 'Sistema',
                action: 'Vehículo Liberado y Archivado',
                data: { status: 'archived' }
            });
            try {
                exportSingleArchivedVehicle(vehicle.id);
                tpAutoFeedFromRelease(vehicle);
                invLogTestUsage(vehicle);

                // Try exact match first, then offer flexible substitution
                var exactMatch = tpAutoMarkWeeklyCompletion(vehicle.configCode);
                if (!exactMatch && typeof tpFindFlexibleMatches === 'function') {
                    var flexMatches = tpFindFlexibleMatches(vehicle.configCode, vehicle.config);
                    if (flexMatches.length > 0) {
                        // Store pending substitution data and show modal AFTER release completes
                        window._pendingSubstitution = {
                            configCode: vehicle.configCode,
                            vin: vehicle.vin,
                            matches: flexMatches
                        };
                    }
                }

                auditLog('cop15', 'vehicle_released', {type:'vehicle', id:vehicle.id, label:vehicle.vin}, 'Liberado y archivado');
                if (typeof fbPostTestCompleted === 'function') { var _res = vehicle.testData && vehicle.testData.resultado ? vehicle.testData.resultado : (vehicle.testData && vehicle.testData.simple && vehicle.testData.simple.resultado ? vehicle.testData.simple.resultado : ''); fbPostTestCompleted(vehicle.vin, _res); }
                if (typeof fbPostVehicleReleased === 'function') fbPostVehicleReleased(vehicle.vin);
                showToast('Vehículo liberado. JSON descargado.', 'success');
                // [R5-M4] Confetti burst on vehicle release
                if (typeof animateConfetti === 'function') animateConfetti();
            } catch(e) {
                // Rollback on cross-module error
                vehicle.status = prevStatus;
                vehicle.timeline = prevTimeline;
                delete vehicle.archivedAt;
                showToast('Error en liberación: ' + e.message + '. Cambios revertidos.', 'error');
                console.error('finishRelease rollback:', e);
                return;
            }
        } else {
            vehicle.status = 'registered';
            vehicle.timeline.push({
                timestamp: new Date().toISOString(),
                user: 'Sistema',
                action: 'Retest solicitado - Vehículo regresado a estado inicial',
                data: { status: 'registered', retest: true }
            });
            auditLog('cop15', 'vehicle_retest', {type:'vehicle', id:vehicle.id, label:vehicle.vin}, 'Retest solicitado');
            showToast('Vehículo marcado para nueva prueba', 'info');
        }

        saveDB();
        refreshAllLists();
        updateProgressBar();

        // [R3-M7] Confetti celebration on successful release
        if (!isRetest && typeof showConfetti === 'function') showConfetti();

        // [V7-A1] Emit event
        if (typeof emitEvent === 'function') emitEvent('vehicle:released', { vehicle: vehicle, isRetest: isRetest });

        document.getElementById('releaseVehSelect').value = '';
        document.getElementById('lib-content').style.display = 'none';

        // [V7-D4] Post-Release Quick Actions
        if (!isRetest) {
            var vinShort = vehicle.vin ? '...' + vehicle.vin.slice(-4) : '';
            v7ShowPostReleaseActions(vinShort);
        }

        // Show flexible substitution modal if pending
        if (window._pendingSubstitution) {
            showSubstitutionModal(window._pendingSubstitution);
            window._pendingSubstitution = null;
        }
    }


// ======================================================================

// [M10b] FLEXIBLE SUBSTITUTION MODAL
// ======================================================================

function showSubstitutionModal(data) {
    var modal = document.getElementById('substitutionModal');
    if (!modal) return;

    var html = '<div style="font-size:0.85rem;color:#64748b;margin-bottom:16px;">' +
        'El vehículo <strong style="color:#1e293b;">' + data.vin + '</strong> con configuración ' +
        '<span style="font-family:monospace;font-size:0.75rem;background:#f1f5f9;padding:2px 6px;border-radius:4px;">' + (data.configCode.length > 50 ? data.configCode.substring(0, 48) + '..' : data.configCode) + '</span>' +
        ' no coincide exactamente con ninguna configuración pendiente en el plan semanal.' +
        '</div>' +
        '<div style="font-size:0.85rem;font-weight:700;color:#1e293b;margin-bottom:10px;">Configuraciones similares encontradas:</div>';

    data.matches.slice(0, 5).forEach(function(m, idx) {
        var borderClr = m.diffs.length === 1 ? '#10b981' : m.diffs.length === 2 ? '#f59e0b' : '#ef4444';
        html += '<div style="border:1px solid ' + borderClr + '30;border-left:3px solid ' + borderClr + ';border-radius:8px;padding:12px;margin-bottom:10px;background:' + borderClr + '05;">';
        html += '<div style="font-size:0.8rem;font-weight:600;color:#1e293b;margin-bottom:6px;">' + (m.item.desc.length > 60 ? m.item.desc.substring(0, 58) + '..' : m.item.desc) + '</div>';

        // Show differences
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">';
        m.diffs.forEach(function(d) {
            html += '<span style="font-size:0.7rem;padding:3px 8px;border-radius:4px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;">' +
                d.label + ': <s>' + d.planned + '</s> → <strong>' + d.actual + '</strong></span>';
        });
        html += '</div>';

        html += '<div style="display:flex;gap:8px;align-items:center;">';
        html += '<span style="font-size:0.7rem;color:#64748b;">' + m.diffs.length + ' diferencia' + (m.diffs.length > 1 ? 's' : '') + '</span>';
        html += '<button class="btn-primary" onclick="applySubstitution(' + m.planIdx + ',' + m.itemIdx + ',\'' + data.configCode.replace(/'/g, "\\'") + '\',\'' + data.vin + '\',' + idx + ')" ' +
            'style="margin-left:auto;padding:6px 16px;font-size:0.8rem;border-radius:6px;">Sustituir</button>';
        html += '</div></div>';
    });

    html += '<div style="text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">' +
        '<button class="btn-secondary" onclick="closeSubstitutionModal()" style="padding:8px 20px;font-size:0.85rem;">No sustituir, solo liberar</button>' +
        '</div>';

    document.getElementById('substitutionContent').innerHTML = html;
    modal.style.display = 'flex';

    // Store diffs for applying
    window._substitutionData = data;
}

function applySubstitution(planIdx, itemIdx, configCode, vin, matchIdx) {
    var data = window._substitutionData;
    if (!data || !data.matches[matchIdx]) return;
    var m = data.matches[matchIdx];

    if (typeof tpSubstituteItem === 'function') {
        tpSubstituteItem(planIdx, itemIdx, configCode, vin, m.diffs);
        showToast('Sustitución aplicada: el vehículo ' + vin + ' toma el lugar de la configuración planeada.', 'success');
    }

    closeSubstitutionModal();
}

function closeSubstitutionModal() {
    var modal = document.getElementById('substitutionModal');
    if (modal) modal.style.display = 'none';
    window._substitutionData = null;
}

// ======================================================================

// [M11] HISTORIAL Y DASHBOARD]
// ======================================================================

    function renderHistoryFilters() {
        var bar = document.getElementById('historyFilterBar');
        if (!bar) return;

        var statusF = window._histFilterStatus || 'all';
        var vinQ = window._histFilterVin || '';
        var yearF = window._histFilterYear || '';
        var monthF = window._histFilterMonth || '';

        // Build year options from data
        var yearsSet = {};
        (db.vehicles || []).forEach(function(v) {
            if (v.registeredAt) yearsSet[new Date(v.registeredAt).getFullYear()] = true;
        });
        var years = Object.keys(yearsSet).sort(function(a, b) { return b - a; });
        var yearOpts = '<option value="">Todos</option>' + years.map(function(y) {
            return '<option value="' + y + '"' + (yearF === y ? ' selected' : '') + '>' + y + '</option>';
        }).join('');

        var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        var monthOpts = '<option value="">Todos</option>' + monthNames.map(function(m, i) {
            var val = String(i + 1);
            return '<option value="' + val + '"' + (monthF === val ? ' selected' : '') + '>' + m + '</option>';
        }).join('');

        var statusOpts = [
            {v:'all', l:'Todos'},
            {v:'active', l:'Activos'},
            {v:'archived', l:'Archivados'},
            {v:'registered', l: CONFIG.statusLabels['registered'] || 'Registrado'},
            {v:'in-progress', l: CONFIG.statusLabels['in-progress'] || 'En Progreso'},
            {v:'testing', l: CONFIG.statusLabels['testing'] || 'En Prueba'},
            {v:'ready-release', l: CONFIG.statusLabels['ready-release'] || 'Listo para Liberar'}
        ];
        var statusHtml = statusOpts.map(function(o) {
            return '<option value="' + o.v + '"' + (statusF === o.v ? ' selected' : '') + '>' + o.l + '</option>';
        }).join('');

        bar.innerHTML = '<div class="hist-filter-bar">' +
            '<div><label>Estado</label><select onchange="window._histFilterStatus=this.value;renderHistory();">' + statusHtml + '</select></div>' +
            '<div><label>VIN</label><input type="text" value="' + vinQ + '" oninput="window._histFilterVin=this.value;renderHistory();" placeholder="Buscar VIN..."></div>' +
            '<div><label>Año</label><select onchange="window._histFilterYear=this.value;if(!this.value){window._histFilterMonth=\'\';} renderHistory();">' + yearOpts + '</select></div>' +
            '<div><label>Mes</label><select onchange="window._histFilterMonth=this.value;renderHistory();"' + (!yearF ? ' disabled' : '') + '>' + monthOpts + '</select></div>' +
            '<div class="hist-filter-actions"><button class="btn-secondary" onclick="histFilterReset()" style="min-height:40px;font-size:0.8rem;padding:8px 14px;">Limpiar</button></div>' +
        '</div>';
    }

    function histFilterReset() {
        window._histFilterStatus = 'all';
        window._histFilterVin = '';
        window._histFilterYear = '';
        window._histFilterMonth = '';
        window._histPageSize = 25;
        renderHistory();
    }

    function histShowMore() {
        window._histPageSize = (window._histPageSize || 25) + 25;
        renderHistory();
    }

    function renderHistory() {
        renderHistoryFilters();
        const container = document.getElementById('historyList');
        const total = db.vehicles.length;

        let vehicles = db.vehicles;

        // Status filter
        var statusF = window._histFilterStatus || 'all';
        if (statusF === 'archived') {
            vehicles = vehicles.filter(v => v.status === 'archived');
        } else if (statusF === 'active') {
            vehicles = vehicles.filter(v => v.status !== 'archived');
        } else if (statusF !== 'all') {
            vehicles = vehicles.filter(v => v.status === statusF);
        }

        // VIN search
        var vinQ = (window._histFilterVin || '').toUpperCase();
        if (vinQ) {
            vehicles = vehicles.filter(v => (v.vin || '').toUpperCase().includes(vinQ));
        }

        // Year filter
        var yearF = window._histFilterYear || '';
        if (yearF) {
            vehicles = vehicles.filter(v => new Date(v.registeredAt).getFullYear() === parseInt(yearF));
        }

        // Month filter (only if year is set)
        var monthF = window._histFilterMonth || '';
        if (monthF && yearF) {
            vehicles = vehicles.filter(v => (new Date(v.registeredAt).getMonth() + 1) === parseInt(monthF));
        }

        if(vehicles.length === 0) {
            container.innerHTML = '<div class="hist-filter-count">' + 0 + ' de ' + total + ' registros</div>' +
                '<p style="text-align: center; color: #94a3b8; padding: 20px;">No hay registros con estos filtros</p>';
            return;
        }

        var filtered = vehicles.length;
        var pageSize = window._histPageSize || 25;
        var showing = Math.min(pageSize, filtered);
        vehicles = vehicles.slice(0, pageSize);
        var hasMore = filtered > pageSize;

        container.innerHTML = `
            <div class="hist-filter-count" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span>Mostrando ${showing} de ${filtered} registros${filtered !== total ? ' (' + total + ' total)' : ''}</span>
                <button class="btn-secondary batch-pdf-btn" id="batchPdfBtn" onclick="batchPDFExport()" style="display:none;padding:4px 12px;font-size:11px;font-weight:700;">PDF Seleccionados</button>
                <button class="btn-secondary" onclick="window.print()" style="padding:4px 12px;font-size:11px;font-weight:700;" title="Imprimir tabla de historial">🖨️ Imprimir</button>
            </div>
            <table class="history-table">
                <thead>
                    <tr>
                        <th style="width:30px;"><input type="checkbox" onchange="histToggleAll(this.checked)" title="Seleccionar todos"></th>
                        <th>VIN</th>
                        <th>Código Config</th>
                        <th>Propósito</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${vehicles.map(v => {
                        const cfg = v.config || {};
                        const modelo = escapeHtml(cfg['Modelo'] || '');
                        const motor = escapeHtml(cfg['ENGINE CAPACITY'] || '');
                        const reg = escapeHtml(cfg['EMISSION REGULATION'] || '');
                        const safeVin = escapeHtml(v.vin);
                        const safePurpose = escapeHtml(v.purpose);
                        const safeConfigCode = escapeHtml(truncateMiddle(v.configCode, 30));
                        return `
                        <tr>
                            <td><input type="checkbox" class="hist-chk" data-vid="${v.id}" onchange="histUpdateBatchBtn()"></td>
                            <td><strong>${safeVin}</strong></td>
                            <td>
                                ${modelo ? `<div style="font-weight:600;font-size:0.85rem;">${modelo}</div>` : ''}
                                <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:2px;">
                                    ${motor ? `<span style="font-size:0.7rem;padding:1px 5px;border-radius:3px;background:#dbeafe;color:#1d4ed8;">${motor}</span>` : ''}
                                    ${reg ? `<span style="font-size:0.7rem;padding:1px 5px;border-radius:3px;background:#fef3c7;color:#92400e;">${reg}</span>` : ''}
                                </div>
                                <div style="font-family:monospace;font-size:0.7rem;color:#94a3b8;margin-top:2px;">${safeConfigCode}</div>
                            </td>
                            <td>${safePurpose}</td>
                            <td><span class="status-badge status-${escapeHtml(v.status)}">${escapeHtml(CONFIG.statusLabels[v.status])}</span></td>
                            <td>${new Date(v.registeredAt).toLocaleDateString('es-MX')}</td>
                            <td>
                                <button class="btn-secondary" onclick="generateCOP15PDF(${parseInt(v.id)})" style="padding:5px 10px;font-size:0.75rem;" title="Generar PDF COP15-F05">
                                    PDF
                                </button>
                                ${v.status === 'archived' ? `<button class="btn-secondary" onclick="purgeSingleVehicle(${parseInt(v.id)})" style="padding:5px 10px;font-size:0.75rem;background:#7f1d1d;color:#fca5a5;margin-left:4px;" title="Purgar del sistema">
                                    Purgar
                                </button>` : ''}
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
            ${hasMore ? `<div style="text-align:center;margin-top:12px;"><button class="btn-secondary" onclick="histShowMore()" style="padding:10px 24px;font-size:0.85rem;">Mostrar 25 más (${filtered - showing} restantes)</button></div>` : ''}
        `;
    }

    function filterHistory(filter) {
        window._histFilterStatus = filter;
        currentFilter = filter;
        renderHistory();
    }

// ── [R2-M4] Batch PDF Export helpers ──
function histToggleAll(checked) {
    document.querySelectorAll('.hist-chk').forEach(function(cb) { cb.checked = checked; });
    histUpdateBatchBtn();
}

function histUpdateBatchBtn() {
    var checked = document.querySelectorAll('.hist-chk:checked');
    var btn = document.getElementById('batchPdfBtn');
    if (!btn) return;
    if (checked.length > 0) {
        btn.style.display = '';
        btn.textContent = 'PDF ' + checked.length + ' seleccionados';
    } else {
        btn.style.display = 'none';
    }
}

function batchPDFExport() {
    var ids = [];
    document.querySelectorAll('.hist-chk:checked').forEach(function(cb) {
        ids.push(parseInt(cb.dataset.vid));
    });
    if (ids.length === 0) { showToast('Selecciona al menos un vehículo', 'warning'); return; }

    showConfirm(
        '<p>Generar PDF con <strong>' + ids.length + ' vehículos</strong> en un solo documento?</p>' +
        '<p style="font-size:11px;color:#64748b;">Cada vehículo será una página del PDF.</p>',
        function() { _doBatchPDF(ids); },
        { title: 'Batch PDF Export', type: 'info', confirmText: 'Generar PDF' }
    );
}

function _doBatchPDF(ids) {
    if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
        showToast('jsPDF no disponible', 'error');
        return;
    }
    var jsPDF = (window.jspdf && window.jspdf.jsPDF) || jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    var total = ids.length;
    var overlay = document.createElement('div');
    overlay.id = 'batch-pdf-overlay';
    overlay.innerHTML = '<div class="batch-pdf-progress"><div class="batch-pdf-title">Generando PDF...</div>' +
        '<div class="batch-pdf-bar"><div class="batch-pdf-fill" id="batchPdfFill"></div></div>' +
        '<div id="batchPdfStatus" style="font-size:12px;color:#94a3b8;">0/' + total + '</div></div>';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(overlay);

    var idx = 0;
    function next() {
        if (idx >= total) {
            overlay.remove();
            var dateStr = new Date().toISOString().slice(0,10);
            doc.save('COP15-F05_Batch_' + dateStr + '.pdf');
            showToast(total + ' vehículos exportados a PDF', 'success');
            return;
        }
        if (idx > 0) doc.addPage();
        var vehicle = db.vehicles.find(function(v) { return v.id === ids[idx]; });
        if (vehicle) {
            _renderVehiclePDFPage(doc, vehicle);
        }
        idx++;
        var fill = document.getElementById('batchPdfFill');
        var st = document.getElementById('batchPdfStatus');
        if (fill) fill.style.width = Math.round((idx/total)*100) + '%';
        if (st) st.textContent = idx + '/' + total;
        setTimeout(next, 50);
    }
    next();
}

function _renderVehiclePDFPage(doc, vehicle) {
    var ML = 14, y = 14;
    var W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('KIA EmLab — COP15-F05', ML, y); y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('VIN: ' + (vehicle.vin || 'N/A') + '  |  Config: ' + (vehicle.configCode || 'N/A'), ML, y); y += 5;
    doc.text('Propósito: ' + (vehicle.purpose || '') + '  |  Estado: ' + (vehicle.status || '') + '  |  Fecha: ' + new Date(vehicle.registeredAt).toLocaleDateString('es-MX'), ML, y); y += 7;

    // Preconditioning data
    var td = vehicle.testData || {};
    var p = td.preconditioning || {};
    var tv = td.testVerification || {};

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Preacondicionamiento', ML, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    var preRows = [
        ['Responsable: ' + (p.responsible || '-'), 'Fecha: ' + (p.datetime || '-'), 'Ciclo: ' + (p.cycle || '-')],
        ['Presión llantas: ' + (p.tirePressurePsi || '-') + ' psi', 'Comb. entrada: ' + (p.fuelTypeIn || '-'), 'Nivel: ' + (p.fuelLevelFractionIn || '-')],
        ['Soak (h): ' + (p.soakTimeH != null ? p.soakTimeH : '-'), 'Precond OK: ' + (p.ok || '-'), 'Odo pretest: ' + (p.odoPretestKm || '-') + ' km']
    ];
    preRows.forEach(function(row) {
        var colW = (W - ML*2) / row.length;
        row.forEach(function(cell, ci) { doc.text(cell, ML + ci*colW, y); });
        y += 4;
    });
    y += 3;

    // Test verification
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Verificación de Prueba', ML, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    var tvRows = [
        ['Responsable: ' + (td.testResponsible || '-'), 'Fecha: ' + (td.testDatetime || '-'), 'Túnel: ' + (tv.tunnel || '-')],
        ['Dinamómetro: ' + (tv.dyno || '-'), 'Ventilador: ' + (tv.fanMode || '-') + ' ' + (tv.fanSpeedKmh || '-') + 'km/h', 'Inercia: ' + (tv.inertiaOk || '-')],
        ['Cadenas: ' + (tv.chains || '-'), 'Eslingas: ' + (tv.slings || '-'), 'Cofre: ' + (tv.hood || '-')]
    ];
    tvRows.forEach(function(row) {
        var colW = (W - ML*2) / row.length;
        row.forEach(function(cell, ci) { doc.text(cell, ML + ci*colW, y); });
        y += 4;
    });
    y += 3;

    // Coefficients
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Coeficientes', ML, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('ETW: ' + (td.etw || '-') + '  A: ' + (td.targetA || '-') + '/' + (td.dynoA || '-') +
             '  B: ' + (td.targetB || '-') + '/' + (td.dynoB || '-') +
             '  C: ' + (td.targetC || '-') + '/' + (td.dynoC || '-'), ML, y);
    y += 6;

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text('Generado: ' + new Date().toLocaleString('es-MX') + '  |  KIA EmLab Batch Export', ML, doc.internal.pageSize.getHeight() - 8);
    doc.setTextColor(0);
}


function refreshAllLists() {
  // Render kanban if panel is visible
  var kanbanPanel = document.getElementById('panel-kanban');
  if (kanbanPanel && kanbanPanel.classList.contains('active')) renderKanban();
  const activeSelect = document.getElementById('activeVehSelect');
  const releaseSelect = document.getElementById('releaseVehSelect');

  if (!activeSelect || !releaseSelect) return;

  activeSelect.innerHTML = '<option value="">-- Seleccionar Vehículo --</option>';
  releaseSelect.innerHTML = '<option value="">-- Seleccionar --</option>';

  const activeVehicles = db.vehicles.filter(v => v.status !== 'archived');
  const readyVehicles  = db.vehicles.filter(v => v.status === 'ready-release');

  // ✅ Activos
  activeVehicles.forEach(v => {
    const statusLabel  = (CONFIG.statusLabels && CONFIG.statusLabels[v.status]) ? CONFIG.statusLabels[v.status] : v.status;
    const purposeLabel = v.purpose || 'N/A';

    const opt = document.createElement('option');
    opt.value = v.id;
    const shortCfg = truncateMiddle(v.configCode, 34);
opt.textContent = `${v.vin} | ${purposeLabel} | ${shortCfg} [${statusLabel}]`;
// Tooltip con la info completa (en PC se ve al pasar el mouse)
opt.title = `VIN: ${v.vin}\nPropósito: ${purposeLabel}\nConfig: ${v.configCode}\nEstado: ${statusLabel}`;
// Por si luego quieres mostrarlo en UI sin recalcular:
opt.dataset.fullConfig = v.configCode;
    activeSelect.appendChild(opt);
  });

  // ✅ Listos para liberación
  readyVehicles.forEach(v => {
    const purposeLabel = v.purpose || 'N/A';

    const opt = document.createElement('option');
    opt.value = v.id;
const shortCfg = truncateMiddle(v.configCode, 34);
opt.textContent = `${v.vin} | ${purposeLabel} | ${shortCfg}`;
opt.title = `VIN: ${v.vin}\nPropósito: ${purposeLabel}\nConfig: ${v.configCode}`;
opt.dataset.fullConfig = v.configCode;
    releaseSelect.appendChild(opt);
  });

  renderHistory();
}


// ======================================================================

// [M12] IMPORTAR / EXPORTAR]
// ======================================================================


    function exportDatabase() {
        const dataStr = JSON.stringify(db, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kia_db_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        showToast('Base de datos exportada', 'success');
    }


    function confirmReset() {
        showConfirm('¿SEGURO que desea BORRAR TODOS los datos? Esta acción NO se puede deshacer.', function(){
            showConfirm('ÚLTIMA CONFIRMACIÓN: Se borrarán TODOS los vehículos y pruebas.', function(){
                localStorage.removeItem('kia_db_v11');
                location.reload();
            }, {title:'Última confirmación', type:'danger', confirmText:'Borrar todo'});
        }, {title:'Resetear base de datos', type:'danger', confirmText:'Sí, borrar'});
    }


function exportAndPurgeArchived() {
  const archived = db.vehicles.filter(v => v.status === 'archived');

  if (archived.length === 0) {
    showToast('No hay vehículos archivados para exportar.', 'info');
    return;
  }

  // 1) Construir paquete de archivo
  const archivePack = {
    schema: 'kia_archive_v11',
    exportedAt: new Date().toISOString(),
    vehicles: archived
  };

  // 2) Descargar JSON
  const dataStr = JSON.stringify(archivePack, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `kia_archive_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // 3) Purgar del DB (reduce localStorage)
  // Seguridad: confirmación antes de borrar del sistema
  showConfirmDialog({
    title: '⚠️ Purgar vehículos archivados',
    message: '✅ Archivo descargado.\n\n¿Deseas PURGAR (borrar del sistema) ' + archived.length + ' vehículos archivados?\nEsto reduce el tamaño del localStorage.\n\n⚠️ Asegúrate de guardar el archivo descargado.',
    type: 'danger',
    confirmText: 'Purgar',
    cancelText: 'Cancelar'
  }).then(function(ok) {
    if (!ok) return;

    // Elimina del db principal
    auditLog('cop15', 'archive_purged', {type:'batch'}, archived.length + ' vehículos archivados purgados');
    db.vehicles = db.vehicles.filter(v => v.status !== 'archived');

    saveDB();
    refreshAllLists();
    updateProgressBar();

    showToast('Purga completada. Se removieron ' + archived.length + ' vehículos archivados.', 'success');
  });
}


function triggerImportArchive() {
  const input = document.getElementById('archiveFileInput');
  if (input) input.click();
}


function handleImportArchive(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result;
      const data = JSON.parse(text);

      if (!data || !Array.isArray(data.vehicles)) {
        showToast('Archivo inválido. No contiene "vehicles".', 'error');
        return;
      }

      // Store parsed data and show status selection modal
      window._importArchiveData = data;
      const modal = document.getElementById('importModal') || document.createElement('div');
      modal.id = 'importModal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9000;display:flex;align-items:center;justify-content:center;';
      modal.innerHTML = '<div style="background:#fff;border-radius:14px;padding:24px;max-width:380px;width:90%;">' +
        '<h3 style="margin:0 0 8px;color:#0f172a;">Importar ' + data.vehicles.length + ' vehículos</h3>' +
        '<p style="font-size:11px;color:#64748b;margin-bottom:14px;">Selecciona el estado destino:</p>' +
        '<div style="display:grid;gap:6px;">' +
        '<button onclick="executeArchiveImport(\'registered\')" style="padding:10px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Registrado</button>' +
        '<button onclick="executeArchiveImport(\'in-progress\')" style="padding:10px;background:#f59e0b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">En Progreso</button>' +
        '<button onclick="executeArchiveImport(\'ready-release\')" style="padding:10px;background:#10b981;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Listo para Liberar</button>' +
        '<button onclick="executeArchiveImport(\'archived\')" style="padding:10px;background:#64748b;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Archivado</button>' +
        '<button onclick="this.closest(\'#importModal\').remove();" style="padding:8px;background:#e2e8f0;border:none;border-radius:8px;cursor:pointer;">Cancelar</button>' +
        '</div></div>';
      document.body.appendChild(modal);

    } catch (e) {
      console.error(e);
      showToast('Error leyendo el archivo. Asegúrate de que sea un JSON válido.', 'error');
    } finally {
      event.target.value = '';
    }
  };

  reader.readAsText(file);
}

function executeArchiveImport(targetStatus) {
  const data = window._importArchiveData;
  if (!data) return;
  const modal = document.getElementById('importModal');
  if (modal) modal.remove();

  let imported = 0, skipped = 0;

  data.vehicles.forEach(v => {
    if (!v?.vin) return;
    if (db.vehicles.some(x => x.vin === v.vin && x.status !== 'archived')) { skipped++; return; }

    const clone = structuredClone ? structuredClone(v) : JSON.parse(JSON.stringify(v));
    clone.id = ++db.lastId;
    clone.status = targetStatus;
    clone.timeline = clone.timeline || [];
    clone.timeline.push({
      timestamp: new Date().toISOString(),
      user: 'Sistema',
      action: 'Importado desde archivo. Estado: ' + (CONFIG.statusLabels[targetStatus] || targetStatus),
      data: { status: targetStatus }
    });
    db.vehicles.push(clone);
    imported++;
  });

  saveDB();
  if (imported > 0) auditLog('cop15', 'vehicles_imported', {type:'batch'}, imported + ' vehículos importados desde archivo');
  refreshAllLists();
  updateProgressBar();
  window._importArchiveData = null;
  showToast('Importación: ' + imported + ' importados, ' + skipped + ' omitidos por duplicado.', imported > 0 ? 'success' : 'warning');
}


function exportSingleArchivedVehicle(vehicleId) {
  const v = db.vehicles.find(x => x.id == vehicleId);
  if (!v || v.status !== 'archived') return;
  const pack = { schema: 'kia_archive_v11_single', exportedAt: new Date().toISOString(), vehicles: [v] };
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kia_archive_' + v.vin + '_' + new Date().toISOString().split('T')[0] + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

function purgeSingleVehicle(vehicleId) {
  const v = db.vehicles.find(x => x.id == vehicleId);
  if (!v) return;
  showConfirmDialog({ title: '⚠️ Purgar vehículo', message: 'Purgar VIN ' + (v.vin||'?') + ' del sistema?', type: 'danger', confirmText: 'Purgar', cancelText: 'Cancelar' }).then(function(ok) {
    if (!ok) return;
    auditLog('cop15', 'vehicle_purged', {type:'vehicle', id:vehicleId, label:v.vin}, 'Purgado del sistema');
    db.vehicles = db.vehicles.filter(x => x.id != vehicleId);
    saveDB(); refreshAllLists(); updateProgressBar(); renderHistory();
  });
}

// ── [Fase 5.3] Timeline compaction — keeps last 50 entries per vehicle ──
function compactTimelineEntries() {
    var changed = false;
    (db.vehicles || []).forEach(function(v) {
        if (v.timeline && v.timeline.length > 50) {
            v.timeline = v.timeline.slice(-50);
            changed = true;
        }
    });
    return changed;
}

function buildF05Data(vehicle) {
  const td = vehicle.testData || {};
  const pre = td.preconditioning || {};
  const tv  = td.testVerification || {};

  return {
    vin: vehicle.vin,
    fechaHora: td.datetime,
    operador: td.operator,

    recepcion: {
      odometro: td.odometer,
      combustible: `${pre.fuelTypeIn || ''} ${pre.fuelLevelFractionIn || ''}`,
      tanque: pre.tankCapacityL,
      llantas: pre.tirePressureInPsi,
      bateria: pre.batterySocPct
    },

    preacond: {
fechaHora: pre.datetime,
      ciclo: pre.cycle,
      soak: pre.soakTimeH,
      ok: pre.ok
    },

    dtc: pre.dtc || {},

    dinamometro: {
      etw: td.etw,
      A: `${td.targetA} / ${td.dynoA}`,
      B: `${td.targetB} / ${td.dynoB}`,
      C: `${td.targetC} / ${td.dynoC}`
    },

    prueba: {
      tunel: tv.tunnel,
      ventilador: tv.fanMode,
      inercia: tv.inertiaOk,
      cadenas: tv.chains,
      eslingas: tv.slings,
      capo: tv.hood,
      rodillos: tv.rearRollers,
      pantalla: tv.screen
    }
  };
}


// ======================================================================

// [M13] GENERADOR PDF COP15-F05]
// ======================================================================

const KIA_LOGO_B64 = 'data:image/png;base64,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V95vin8bqZ+if/D7aJ95vir8bqZ7IT/4fbTxU1USiFX3m+Kvxupn6J/8Ptp4p95vir8bqZ+if/D7aKaqJRCr7zfFX43Uz9E/+H20T7zfFX43Uz9E/wDh9vomqiUQqPBvin8bqZ+id/BVHBtigXP876Vf80/+CmoiURCw5wcRGzsN1fxe2JLA3eyThcrj4AuH61I7LzLnCmAqSJHDdJgSxIHaxiC6JFNrXc463/UsvRKOMDU9361e0eiLqqLAREQEREBERAREQEREBERAREQCsC4gpWYncmcUSspLxpiPEkXBkOE0ue43GgA1Kz1WxGNewte0OaRYg9UHn7kzw24xxm+FP16DMUCkA6mOzkjRR+S1wuPMhTPy0y0wngCltk6BTYcKJb8JNPaHRohsLku31tssya0NFmgADoFeFtAeSIiwEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAsEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERARLhEBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERARLjvRAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREuO9AREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQERCgxnMTGFGwNhqNiGvOjNkYL2scYLOZwLjYaX8V1+VmZmFcyqfNTuGJuJGZKxBDisjNDHgkXBtc6eKwrjQbz5FVVvMW+nD1Bt8MKMfCDjCLgrNSQgVF7pel4gYZYvePRc7mLWOB/vi2iD0Ebv8ArV6sYbi4NxuCr0Ba9zWzawdltMSsHEsaaEaaYXwocvBERzmg9RcW10us8jxmQIL40VwZDY0ucTs0AXJXmxxHYumMeZm1mtMhxTTZSJ7il3FujGsJF7jTV3MfIoPRXB9dkcTYck6/THRHSU8ztYHaN5XBt7WIubbLuFrrhrHLkZhQEWcJOxB6em5bFQEVgebG5HhZU5z1t7EHIit5j377JzG9kFyKgJVUBFaSQTqqcxtf50F6LjD3Ftxa6c53FiEH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CDLBpYYgcy5BFtwLrP8AI/h+pGA6sMSVioxa5iAjSYiklkMn3xbfUnxOvzreIHfY+xVsO4INF8b3qHn/AIxC/wASw/LHKXD2Z/Djhf3c51Pqso2L7kqUqwNjQ7RXkAke+F+/6VmHG96h5/4xC/xLt+ENh/oAw5cFp5Yuvh2rkGqhlLxFUuAKLTMxGRqbc2f2gDrX3u4c19juslyn4bJek4iZinHtbfiOrsPOyG5xdCDu919SRrpe2qkZy96oGuvv0QA0Wt07lpKdyTmo3EKzNFtbhCC0tPuPszzGzA067Ld1ksgxDN/CkbHOXlVwxLzTZSNPQSyHGewlrCQRrbzXW5A4AmctMAQ8MTNQh1B7JmJG7ZjSBZ1tNfJbBa0gWAsPNA03v9KC87LH8bYVoWMKFHotfkIc3KRRs4asPRzT0I3WQKwjVBE2Nw6ZjYOno0fLTH0WXlXO5ocvFeQR5/Bv7FWNkxn1ikMlsVZimBJn0XsgxALs7hyW6X+11LGypZBrTI7J7DmVklMClxI85UJsD3RNx3Xc4DXlFgABddHnvkZTcxZ6FiCn1GNR8RwIYZDmobyGOAuRzeXeLLdFksgicMsOJaQl3U2RzDZGkiQAXPZe2mp5gSPn6LtsD8M0/MYpgYmzPxO7EMzCic7ZYEmG6x+Ffp4DRSbslkFsCEyDDZChgNhsFmtaAAB0AHcFyq0Xv3q5AREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQdBjjC1DxfQ30bEEgyckXPDzDdoOYbHzXNgzD1Jwth6XodElGysjL37KG3YXJPt3XcogIiICIiAiIgIiICWREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERB/9k=';


function generateCOP15PDF(vehicleId, opts) {
  const vehicle = db.vehicles.find(v => v.id == vehicleId);
  if (!vehicle) { if (!(opts && opts.silent)) showToast('No hay vehículo seleccionado.', 'error'); return null; }
  if (!(opts && opts.silent)) showOverlayLoading('Generando PDF...');

  if (!isEmissionsPurpose(vehicle.purpose)) {
    if (!(opts && opts.silent)) showToast('PDF COP15-F05 solo aplica para Emisiones. Este vehículo: ' + vehicle.purpose, 'warning');
    return null;
  }

  // ---------- Extraer datos ----------
  const td  = vehicle.testData || {};
  const pre = td.preconditioning || {};
  const tv  = td.testVerification || {};
  const dtc = pre.dtc || {};
  const notes = td.notes || '';  // comentarios de recepción
  const tvNotes = tv.notes || ''; // comentarios de verificación

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  // ---------- Constantes de página ----------
  const W  = doc.internal.pageSize.getWidth();   // ~279.4
  const H  = doc.internal.pageSize.getHeight();  // ~215.9
  const ML = 8;                                   // margen izq
  const CW = W - ML - 8;                         // ancho útil

  // ---------- Colores (modifica aquí) ----------
  const RED     = [187, 22, 43];
  const DARK    = [5, 20, 31];
  const GRAY_BG = [232, 232, 232];
  const WHITE   = [255, 255, 255];
  const BLACK   = [0, 0, 0];
  const LT_BLUE = [205, 225, 248];
  const LT_GREEN= [205, 242, 205];
  const BORDER  = [165, 165, 165];

  let y = 8; // cursor vertical — todo empieza aquí

  // ---------- Helpers ----------
  function setF(s, sz) { doc.setFontSize(sz); doc.setFont('helvetica', s); }

  // cell() — el bloque fundamental del PDF
  // x,y = posición; w,h = tamaño; text = contenido
  // opts: fill, stroke, font, sz, align, color, valign, pad
  function cell(x, yy, w, h, text, opts = {}) {
    const { fill=null, stroke=BORDER, font='normal', sz=7, align='left',
            color=BLACK, valign='middle', pad=1.5 } = opts;
    if (fill) { doc.setFillColor(...fill); doc.rect(x, yy, w, h, 'F'); }
    if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(0.25); doc.rect(x, yy, w, h, 'S'); }
    if (text == null || String(text).trim() === '') return;
    doc.setTextColor(...color); setF(font, sz);
    let tx = align==='center' ? x+w/2 : align==='right' ? x+w-pad : x+pad;
    const lines = doc.splitTextToSize(String(text), w - pad*2);
    const lH = sz * 0.38;
    const totH = lines.length * lH;
    let ty = valign==='middle' ? yy+(h-totH)/2+lH*0.8 : valign==='top' ? yy+pad+sz*0.35 : yy+h-pad;
    lines.forEach((l,i) => doc.text(l, tx, ty + i*lH, {align}));
  }

  // hline — línea horizontal roja de separación
  function hline(thickness) {
    doc.setDrawColor(...DARK); doc.setLineWidth(thickness||1);
    doc.line(ML, y, ML+CW, y); y += 1.5;
  }

  // =====================================================
  //  HEADER (barra negra superior con logo KIA)
  // =====================================================
  doc.setFillColor(...BLACK); doc.rect(ML, y, CW, 16, 'F');
  // Logo KIA como imagen (en lugar de texto)
  try { doc.addImage(KIA_LOGO_B64, 'PNG', ML+2, y+1.5, 28, 13); } catch(e) {
    // Fallback: si falla la imagen, usar texto
    doc.setTextColor(...WHITE); setF('bold', 16); doc.text('KIA', ML+5, y+8);
    doc.setTextColor(...WHITE); setF('normal', 5.5); doc.text('Movement that inspires', ML+5, y+12.5);
  }
  doc.setTextColor(...WHITE);
  setF('bold', 12); doc.text('Hoja de Inspección de Vehículo', ML+CW/2, y+9, {align:'center'});

  // Info box (derecha)
  const ix = ML+CW-58;
  doc.setFillColor(...WHITE); doc.rect(ix, y+1, 56, 14, 'F');
  doc.setTextColor(...BLACK); setF('normal', 5.5);
  const hoy = new Date().toLocaleDateString('es-MX');
  doc.text('Document#: COP15-F05', ix+2, y+4.5);
  doc.text('Revisión: 7', ix+2, y+7.5);
  doc.text('Emission date: 28-11-2025', ix+2, y+10.5);
  doc.text('Page: 1 of 1    Dept: QA', ix+2, y+13.5);
  y += 18;

  // =====================================================
  //  VIN
  // =====================================================
const vinText = `${vehicle.vin || ''} ${vehicle.configCode || ''}`.trim();
  cell(ML, y, 22, 7, 'VIN + Código', {fill:GRAY_BG, font:'bold', sz:8, align:'center'});
 cell(ML+22, y, CW-22, 7, vinText, { sz: 12, font:'bold', align:'center' });
  y += 7;

  // =====================================================
  //  PERSONAS A CARGO
  // =====================================================
  const pW = (CW - 22) / 3;
  const recDT = td.datetime ? new Date(td.datetime).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}) : '';
const preDT = pre.datetime ? new Date(pre.datetime).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}) : '';
  const tstDT = td.testDatetime ? new Date(td.testDatetime).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}) : '';
  cell(ML, y, 22, 8, 'Fecha y Hora', {fill:GRAY_BG, font:'bold', sz:6.5, align:'center'});
  cell(ML+22, y, pW, 8, 'Recepción:'+'\n'+(recDT||''), {fill:LT_BLUE, font:'bold', sz:6.5, align:'center'});
  cell(ML+22+pW, y, pW, 8, 'Preacondicionamiento:'+'\n'+(preDT||''), {fill:LT_BLUE, font:'bold', sz:6.5, align:'center'});
  cell(ML+22+pW*2, y, pW, 8, 'Prueba:'+'\n'+(tstDT||''), {fill:LT_BLUE, font:'bold', sz:6.5, align:'center'});
  y += 8;

  cell(ML, y, 22, 7, 'Persona a cargo', {fill:GRAY_BG, font:'bold', sz:6.5, align:'center'});
  cell(ML+22, y, pW, 7, (td.operator||''), {sz:5.5, valign:'middle', align:'center'});
  cell(ML+22+pW, y, pW, 7, (pre.responsible||''), {sz:5.5, valign:'middle', align:'center'});
  cell(ML+22+pW*2, y, pW, 7, (td.testResponsible||''), {sz:5.5, valign:'middle', align:'center'});
  y += 7 + 1;

  hline(1.2);

// =====================================================
//  RECEPCIÓN (izq) + PREACONDICIONAMIENTO (der) 50/50
// =====================================================
{
  const halfW = CW / 2;

  // Encabezados
  cell(ML,         y, halfW, 7, 'Recepción',            { fill: LT_BLUE, font:'bold', sz:10, align:'center' });
  cell(ML + halfW, y, halfW, 7, 'Preacondicionamiento', { fill: LT_BLUE, font:'bold', sz:10, align:'center' });
  y += 7;

  const blockY = y;

  // =========================
  // GRID COMÚN (misma altura para izq y der)
  // =========================
  const ROW_H = 4;     // alto de fila
  const ROWS  = 12;    // 0..11
  const gridH = ROW_H * ROWS;      // 48mm
  const bottomY = blockY + gridH;

  const rowY  = (r) => blockY + r * ROW_H;
  const spanH = (n) => n * ROW_H;

  // =========================
  // IZQUIERDA: INSPECCIÓN FÍSICA (en GRID)
  // =========================
  {
    const lx = ML;
    const w  = halfW;

    const pvW = 22, puW = 12;
    const plW = w - pvW - puW;

    const safeNotes = (notes || '').toString();
    const recepText = safeNotes.trim()
      ? ('Observaciones: ' + safeNotes)
      : 'El vehículo no presentó ningún detalle físico en la inspección inicial.';

    // r0-r1 (2 filas): Inspección Física + comentario (respuesta)
    cell(lx,      rowY(0), plW,     spanH(2), 'Inspección Física',
         { fill: GRAY_BG, font:'bold', sz:6.8, align:'center' });
    cell(lx+plW,  rowY(0), pvW+puW, spanH(2), recepText,
         { fill:[248,248,248], font:'italic', sz:6, align:'center', valign:'middle' });

    // r2-r3: Odómetro
    cell(lx,           rowY(2), plW, spanH(2), 'Odómetro', { font:'bold', sz:7 });
    cell(lx+plW,       rowY(2), pvW, spanH(2), td.odometer || '', { align:'center', sz:8, font:'bold' });
    cell(lx+plW+pvW,   rowY(2), puW, spanH(2), 'km/mi', { align:'center', sz:5.5, fill: GRAY_BG });

    // r4-r5: Combustible
    const fuelDesc = (pre.fuelTypeIn || '') + (pre.fuelLevelFractionIn ? ` (${pre.fuelLevelFractionIn})` : '');
    cell(lx,         rowY(4), plW,     spanH(2), 'Nivel y tipo de combustible', { font:'bold', sz:6.2 });
    cell(lx+plW,     rowY(4), pvW+puW, spanH(2), fuelDesc, { align:'center', sz:6 });

    // r6-r7: Capacidad tanque
    cell(lx,         rowY(6), plW, spanH(2), 'Capacidad del tanque de combustible', { font:'bold', sz:6.0 });
    cell(lx+plW,     rowY(6), pvW, spanH(2), pre.tankCapacityL || '', { align:'center', sz:8, font:'bold' });
    cell(lx+plW+pvW, rowY(6), puW, spanH(2), 'L', { align:'center', sz:6, fill: GRAY_BG });

    // r8-r9: Presión llantas
    cell(lx,         rowY(8), plW, spanH(2), 'Presión de llantas', { font:'bold', sz:7 });
    cell(lx+plW,     rowY(8), pvW, spanH(2), pre.tirePressureInPsi || '', { align:'center', sz:8, font:'bold' });
    cell(lx+plW+pvW, rowY(8), puW, spanH(2), 'psi', { align:'center', sz:6, fill: GRAY_BG });

    // r10-r11: SOC
    cell(lx,         rowY(10), plW, spanH(2), 'Estado de la batería (SOC)', { font:'bold', sz:6.2 });
    cell(lx+plW,     rowY(10), pvW, spanH(2), pre.batterySocPct || '', { align:'center', sz:8, font:'bold' });
    cell(lx+plW+pvW, rowY(10), puW, spanH(2), '%', { align:'center', sz:6, fill: GRAY_BG });
  }

  // =========================
  // DERECHA: PREACONDICIONAMIENTO (GRID estable, sin rebasar)
  // =========================
  {
    const rx = ML + halfW;
    const condW = halfW * 0.37;
    const dtcW  = halfW * 0.31;
    const dynoW = halfW - condW - dtcW;

    // ---- 1) Condiciones (suma 12 filas exactas) ----
    {
      const x = rx;
      const w = condW;
      const cLW = w * 0.55, cVW = w * 0.25, cUW = w * 0.20;

      cell(x, rowY(0), w, spanH(1), 'Condiciones Iniciales',
           { fill: GRAY_BG, font:'bold', sz:6.2, align:'center' });

      cell(x,          rowY(1), cLW, spanH(2), 'Presión de llantas', { font:'bold', sz:6.2 });
      cell(x + cLW,    rowY(1), cVW, spanH(2), pre.tirePressurePsi || '', { align:'center', sz:7, font:'bold' });
      cell(x + cLW+cVW,rowY(1), cUW, spanH(2), 'psi', { align:'center', sz:5.3, fill: GRAY_BG });

      cell(x,     rowY(3), cLW,     spanH(2), 'Nivel y tipo de combustible', { font:'bold', sz:5.8 });
      cell(x+cLW, rowY(3), cVW+cUW, spanH(2), pre.fuelTypePre || '', { align:'center', sz:6.0, font:'bold' });

      cell(x,     rowY(5), cLW,     spanH(2), 'Ciclo de Preacondicionamiento', { font:'bold', sz:5.3 });
      cell(x+cLW, rowY(5), cVW+cUW, spanH(2), pre.cycle || '', { align:'center', sz:7, font:'bold' });

      cell(x, rowY(7), w, spanH(1), 'Validación Precon para Prueba',
           { fill: GRAY_BG, font:'bold', sz:5.3, align:'center' });

      cell(x,     rowY(8), cLW, spanH(2), 'Tiempo de reposo', { font:'bold', sz:6.0 });
      cell(x+cLW, rowY(8), cVW, spanH(2), pre.soakTimeH ? pre.soakTimeH+' h' : '',
           { align:'center', sz:6.3, font:'bold' });

      const okTxt = pre.ok === 'yes' ? 'Sí cumple' : pre.ok === 'no' ? 'No cumple' : '';
      const okClr = pre.ok === 'yes' ? [0,120,0] : pre.ok === 'no' ? [200,0,0] : BLACK;
      cell(x+cLW+cVW, rowY(8), cUW, spanH(2), okTxt,
           { align:'center', sz:4.6, font:'bold', color: okClr });

      cell(x,     rowY(10), cLW,     spanH(2), 'Odómetro para Prueba', { font:'bold', sz:6.0 });
      cell(x+cLW, rowY(10), cVW+cUW, spanH(2), pre.odoPretestKm ? pre.odoPretestKm+' km' : '',
           { align:'center', sz:7, font:'bold' });
    }

    // ---- 2) DTC (12 filas exactas) ----
    {
      const x = rx + condW;
      const w = dtcW;
      const dLW = w * 0.40, dBW = w * 0.30, dAW = w * 0.30;
      const yesNo = (v) => (v === 'yes' ? 'Sí' : v === 'no' ? 'No' : '');

      cell(x, rowY(0), w, spanH(4),
           'Validación con DTC\nScanner del vehículo\npara la prueba',
           { fill: LT_BLUE, font:'bold', sz:5.2, align:'center' });

      cell(x,         rowY(4), dLW, spanH(2), '', { fill: GRAY_BG });
      cell(x+dLW,     rowY(4), dBW, spanH(2), 'Antes', { fill: GRAY_BG, font:'bold', sz:4.5, align:'center' });
      cell(x+dLW+dBW, rowY(4), dAW, spanH(2), 'Después', { fill: GRAY_BG, font:'bold', sz:4.5, align:'center' });

      cell(x,         rowY(6), dLW, spanH(2), 'DTC Pendiente', { font:'bold', sz:5.3, align:'center' });
      cell(x+dLW,     rowY(6), dBW, spanH(2), yesNo(dtc.pendingBefore), { align:'center', sz:6.2 });
      cell(x+dLW+dBW, rowY(6), dAW, spanH(2), 'No', { align:'center', sz:6.2 });

      cell(x,         rowY(8), dLW, spanH(2), 'DTC Confirmado', { font:'bold', sz:5.3, align:'center' });
      cell(x+dLW,     rowY(8), dBW, spanH(2), yesNo(dtc.confirmedBefore), { align:'center', sz:6.2 });
      cell(x+dLW+dBW, rowY(8), dAW, spanH(2), 'No', { align:'center', sz:6.2 });

      cell(x,         rowY(10), dLW, spanH(2), 'DTC Permanente', { font:'bold', sz:5.3, align:'center' });
      cell(x+dLW,     rowY(10), dBW, spanH(2), yesNo(dtc.permanentBefore), { align:'center', sz:6.2 });
      cell(x+dLW+dBW, rowY(10), dAW, spanH(2), 'No', { align:'center', sz:6.2 });

    }

    // ---- 3) Inercia/Dyno (12 filas exactas) ----
    {
      const x = rx + condW + dtcW;
      const w = dynoW;
      const nLW = w * 0.45, nVW = w * 0.55;

      cell(x, rowY(0), w, spanH(3), 'Parámetros de inercia SI / EN',
           { fill: LT_BLUE, font:'bold', sz:5.6, align:'center' });

      cell(x,     rowY(3), nLW, spanH(3), 'ETW', { font:'bold', sz:7, align:'center'});
      cell(x+nLW, rowY(3), nVW, spanH(3), td.etw ? td.etw+' kg' : '', { align:'center', sz:8, font:'bold' });

      cell(x,     rowY(6), nLW, spanH(2), 'Target A\nDyno Set', { font:'bold', sz:5.1, align:'center'});
      cell(x+nLW, rowY(6), nVW, spanH(2),`${td.targetA || ''}\n${td.dynoA || ''}`,{ align:'center', sz:6.8, font:'bold' });


      cell(x,     rowY(8), nLW, spanH(2), 'Target B\nDyno Set', { font:'bold', sz:5.1, align:'center'});
      cell(x+nLW, rowY(8),  nVW, spanH(2), `${td.targetB||''}\n${td.dynoB||''}`, { align:'center', sz:6.8, font:'bold' });

      cell(x,     rowY(10), nLW, spanH(2), 'Target C\nDyno Set', { font:'bold', sz:5.1, align:'center'});
      cell(x+nLW, rowY(10), nVW, spanH(2), `${td.targetC||''}\n${td.dynoC||''}`, { align:'center', sz:6.8, font:'bold' });
    }
  }

  // Línea roja pegada al borde inferior del bloque
  y = bottomY;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(1.2);
  doc.line(ML, y, ML + CW, y);
  y += 0.6;
}


  // =====================================================
  //  DETALLES DE PRUEBA EN REPORTE DE VETS ADJUNTO
  // =====================================================
  doc.setTextColor(...DARK); setF('bold', 10);
  doc.text('Detalles de Prueba en Reporte de VETS Adjunto', ML+CW/2, y+5, {align:'center'});
  y += 7;

  // ---- VERIFICACIÓN EN PRUEBA (HORIZONTAL FULL WIDTH) ----
  cell(ML, y, CW, 5, 'Verificación en Prueba', {fill:LT_BLUE, font:'bold', sz:8, align:'center'});
  y += 5;

  // 3 sets of 3 columns = 9 columns, 4+ rows
  const vItems = [
    ['Túnel', 'RMT1 ó RMT2', tv.tunnel || ''],
    ['Dinamómetro', 'Encendido', tv.dyno==='on'?'Encendido':tv.dyno||''],
    ['Ventilador', tv.fanMode==='speed'?(tv.fanSpeedKmh||'')+' km/h':tv.fanMode==='speed_follow'?'Speed Follow':tv.fanMode||'', ''],
    ['Flujo ventilador', 'Cert.MX 150 m³/min', tv.fanFlowM3Min?tv.fanFlowM3Min+' m³/min':''],
    ['Parámetros Inercia', 'Confirmar', tv.inertiaOk==='ok'?'OK':tv.inertiaOk||''],
    ['Cadenas 1 y 2', 'Tensadas', tv.chains==='tight'?'OK':tv.chains||''],
    ['Eslinga 1 y 2', 'Tensadas', tv.slings==='secured'?'OK':tv.slings||''],
    ['Capó', 'Abierto/Cerrado', tv.hood==='open'?'Abierto':tv.hood==='closed'?'Cerrado':tv.hood||''],
    ['Rodillos Traseros', 'Asegurados', tv.rearRollers==='secured'?'OK':tv.rearRollers||''],
    ['Pantalla', 'Asegurada', tv.screen==='secured'?'OK':tv.screen||''],
    ['Ventilador check', 'Asegurado', ''],
    ['FTP75-HWY espera', 'Capó cerrado (MX)', (tv.mexWaitCheck==='ok'||tv.mexWaitCheck==='fan_off')?'OK':tv.mexWaitCheck||''],
  ];

  // Layout: 3 sets x 3 cols (Param, Cond, Conf) in 4 rows
  const vCols = 3; // sets across
  const vSetW = CW / vCols;
  const vpW2 = vSetW * 0.38, vcW2 = vSetW * 0.35, vfW2 = vSetW * 0.27;
  const vRowH = 5.5;
  const vItemsPerCol = Math.ceil(vItems.length / vCols);

  // Headers for each set
  for (let s = 0; s < vCols; s++) {
    const sx = ML + s * vSetW;
    cell(sx, y, vpW2, 3.5, 'Parámetro', {fill:GRAY_BG, font:'bold', sz:4.5, align:'center'});
    cell(sx+vpW2, y, vcW2, 3.5, 'Condición', {fill:GRAY_BG, font:'bold', sz:4.5, align:'center'});
    cell(sx+vpW2+vcW2, y, vfW2, 3.5, 'Conf.', {fill:GRAY_BG, font:'bold', sz:4.5, align:'center'});
  }
  y += 3.5;

  for (let r = 0; r < vItemsPerCol; r++) {
    for (let s = 0; s < vCols; s++) {
      const idx = s * vItemsPerCol + r;
      const item = vItems[idx];
      const sx = ML + s * vSetW;
      if (item) {
        cell(sx, y, vpW2, vRowH, item[0], {font:'bold', sz:4.5, align:'center'});
        cell(sx+vpW2, y, vcW2, vRowH, item[1], {sz:4, align:'center'});
        cell(sx+vpW2+vcW2, y, vfW2, vRowH, item[2], {sz:5, align:'center', font:'bold'});
      } else {
        cell(sx, y, vpW2, vRowH, '', {}); cell(sx+vpW2, y, vcW2, vRowH, '', {}); cell(sx+vpW2+vcW2, y, vfW2, vRowH, '', {});
      }
    }
    y += vRowH;
  }

  y += 1;
  doc.setDrawColor(...BLACK); doc.setLineWidth(1); doc.line(ML, y, ML+CW, y); y += 1.5;

  // ---- LIBERACIÓN (HORIZONTAL FULL WIDTH) ----
  const rH = 5.5; // row height for document items
  cell(ML, y, CW, 5, 'Liberación', {fill:LT_GREEN, font:'bold', sz:8, align:'center'});
  y += 5;

  // Left: Inspección Final + Objetos a retirar | Right: Documentos + Firma
  const libLW = CW * 0.5;
  const libRW = CW - libLW;
  const libStartY = y;

  // == LEFT SIDE: Inspección Final ==
  cell(ML, y, libLW, 6, 'Inspección Final del Vehículo', {fill:GRAY_BG, font:'bold', sz:5.5, align:'center'});
  y += 6;

  const inspNotes = tvNotes.trim()
    ? 'Observaciones: ' + tvNotes
    : 'El vehículo no presentó ningún detalle físico en la inspección final.';
  cell(ML, y, libLW, 7, inspNotes, {sz:4.5, font:'italic', color:[80,80,80], align:'center'});
  y += 7;

  // Objects to remove
  cell(ML, y, libLW*0.65, 4.9, 'Objetos a retirar del vehículo', {fill:GRAY_BG, font:'bold', sz:4.5, align:'center'});
  cell(ML+libLW*0.65, y, libLW*0.35, 4.9, 'Confirmación', {fill:GRAY_BG, font:'bold', sz:4.5, align:'center'});
  y += 4.9;

  ['KDS con VCI','CARDAQ','Control Remoto','Radio','GSI'].forEach(item => {
    cell(ML, y, libLW*0.65, 4.5, item, {font:'bold', sz:5});
    cell(ML+libLW*0.65, y, libLW*0.35, 4.5, '', {});
    y += 4.5;
  });

  // == RIGHT SIDE: Evidencia documental ==
  let ry = libStartY;
  const rx = ML + libLW;
  cell(rx, ry, libRW, 4, 'Evidencia documental necesaria por prueba', {fill:LT_GREEN, font:'bold', sz:5.5, align:'center'});
  ry += 4;
  cell(rx, ry, libRW*0.72, 3.5, '', {fill:GRAY_BG});
  cell(rx+libRW*0.72, ry, libRW*0.28, 3.5, 'Confirmación', {fill:GRAY_BG, font:'bold', sz:4.5, align:'center'});
  ry += 3.5;

  const docLW2 = libRW*0.72, docCW2 = libRW*0.28;
  ['Hoja de Inspección COP15-F05 Completa',
   'Reporte STARS VETS COP15-F31',
   'Reporte OBFCM (Solo Europa)',
   'Reporte Coast/Down Quick Check (Solo Europa)',
   'Solicitud de Ensayo COP15-F02 (Solo Cert. MX)',
   'Cotización COP15-F03 (Solo Cert. MX)'
  ].forEach(item => {
    cell(rx, ry, docLW2, rH, item, {sz:4.5, align:'center'});
    cell(rx+docLW2, ry, docCW2, rH, '', {});
    ry += rH;
  });

  // Bottom: Comentarios (left) + Firma (right)
  const bottomLibY = Math.max(y, ry) + 1;
  cell(ML, bottomLibY, CW*0.5, 12, 'Comentarios:', {font:'bold', sz:6, valign:'top'});
  cell(ML+CW*0.5, bottomLibY, CW*0.5, 12, 'Liberador\nDebe ser personal signatario\no gerente de laboratorio', {sz:5, align:'left', font:'italic', color:[130,130,130]});
  y = bottomLibY + 13;

  // =====================================================
  //  FOOTER
  // =====================================================
  const fY = H - 10;
  doc.setDrawColor(...RED); doc.setLineWidth(0.5); doc.line(ML, fY, ML+CW, fY);
  doc.setTextColor(...RED); setF('bold', 5.5);
  doc.text('Anexar Evidencia de Aprobación de Resultados vía Teams a la documentación archivada en físico', ML+CW/2, fY+3.5, {align:'center'});
  doc.setTextColor(150,150,150); setF('normal', 4.5);
  doc.text('Config: '+(vehicle.configCode||'N/A')+' | Propósito: '+(vehicle.purpose||'')+' | Generado: '+new Date().toLocaleString('es-MX'), ML+2, fY+7);

  // =====================================================
  //  GUARDAR
  // =====================================================
  // Return base64 if requested (used by Power Automate webhook integration)
  if (opts && opts.returnBase64) {
      if (!(opts && opts.silent)) hideOverlayLoading();
      return doc.output('base64');
  }

  const fname = 'COP15-F05_'+(vehicle.vin||'SIN-VIN')+'_'+new Date().toISOString().split('T')[0]+'.pdf';
  doc.save(fname);
  hideOverlayLoading();
  showToast('PDF generado: ' + fname, 'success');
}


// ======================================================================

function openConfigPanel() {
    document.getElementById('configModal').style.display = 'block';
    document.getElementById('configCount').textContent = allConfigurations.length;
    var modalCount = document.getElementById('configCountModal'); if (modalCount) modalCount.textContent = allConfigurations.length;
    const isCustom = !!localStorage.getItem('kia_config_csv_raw');
    const srcEl = document.getElementById('configSource');
    var modalSrc = document.getElementById('configSourceModal');
    var srcHtml = isCustom
        ? '<span style="color:#f59e0b;">CSV importado</span> <button onclick="showConfirm(\'Restaurar CSV original embebido?\',function(){localStorage.removeItem(\'kia_config_csv_raw\');parseCSV();openConfigPanel();showToast(\'CSV restaurado\',\'success\');},{title:\'Restaurar CSV\',type:\'warning\',confirmText:\'Restaurar\'})" style="font-size:10px;padding:2px 8px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:5px;cursor:pointer;margin-left:6px;">Restaurar original</button>'
        : '<span style="color:#94a3b8;">CSV embebido (original)</span>';
    if (srcEl) srcEl.innerHTML = srcHtml;
    if (modalSrc) modalSrc.innerHTML = srcHtml;
}
function handleConfigCSVImport(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const oldCount = allConfigurations.length;
        const st = document.getElementById('configCSVStatus');
        // [Fase 5.4] Save state for rollback before import
        if (typeof undoPush === 'function') undoPush('cop15', 'Pre-importación CSV');
        try {
            localStorage.setItem('kia_config_csv_raw', e.target.result);
            parseCSV();
            // Repopulate cascade select options
            const modelSelect = document.getElementById('cfg_model');
            if (modelSelect) {
                const uniqueModels = [...new Set(allConfigurations.map(c => c.Modelo))].sort();
                modelSelect.innerHTML = '<option value="">Seleccionar...</option>';
                uniqueModels.forEach(m => { modelSelect.innerHTML += '<option value="'+m+'">'+m+'</option>'; });
            }
            document.getElementById('configCount').textContent = allConfigurations.length;
            var mc = document.getElementById('configCountModal'); if (mc) mc.textContent = allConfigurations.length;
            const srcEl = document.getElementById('configSource');
            if (srcEl) srcEl.innerHTML = '<span style="color:#f59e0b;">CSV importado</span>';
            var ms = document.getElementById('configSourceModal'); if (ms) ms.innerHTML = '<span style="color:#f59e0b;">CSV importado</span>';
            st.innerHTML = '<span style="color:#16a34a;">OK: '+allConfigurations.length+' configs (antes: '+oldCount+'). Los vehiculos ya registrados no se afectan.</span>';
        } catch(err) {
            // [Fase 5.4] Rollback on failure
            if (typeof undoPop === 'function') undoPop();
            st.innerHTML = '<span style="color:#dc2626;">Error: '+err.message+'. Se restauró el estado anterior.</span>';
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}


// ======================================================================
// [R2-M5] MANUAL CONFIGURATION MANAGER
// ======================================================================

var _manualConfigFields = [
    { key: 'Modelo', label: 'Modelo' },
    { key: 'MODEL YEAR (VIN)', label: 'Año Modelo (VIN)' },
    { key: 'ENGINE CAPACITY', label: 'Motor' },
    { key: 'TRANSMISSION', label: 'Transmisión' },
    { key: 'ENVIRONMENT PACKAGE', label: 'Environment Package' },
    { key: 'EMISSION REGULATION', label: 'Regulación Emisiones' },
    { key: 'DRIVE TYPE', label: 'Tipo Drive' },
    { key: 'TIRE ASSY', label: 'Llantas' },
    { key: 'REGION', label: 'Región' },
    { key: 'BODY TYPE', label: 'Carrocería' },
    { key: 'ENGINE PACKAGE', label: 'Engine Package' }
];

function getManualConfigs() {
    try { return JSON.parse(localStorage.getItem('kia_manual_configs')) || []; }
    catch(e) { return []; }
}

function _saveManualConfigs(configs) {
    localStorage.setItem('kia_manual_configs', JSON.stringify(configs));
}

function _buildConfigCode(cfg) {
    return [cfg['Modelo'], cfg['MODEL YEAR (VIN)'], cfg['TRANSMISSION'],
            cfg['ENVIRONMENT PACKAGE'], cfg['EMISSION REGULATION'], cfg['DRIVE TYPE'],
            cfg['ENGINE CAPACITY'], cfg['TIRE ASSY'], cfg['REGION'],
            cfg['BODY TYPE'], cfg['ENGINE PACKAGE']].filter(Boolean).join('-');
}

function _getExistingValues(key) {
    var vals = new Set();
    allConfigurations.forEach(function(c) { if (c[key]) vals.add(c[key]); });
    return Array.from(vals).sort();
}

function openManualConfigForm(editIdx) {
    var existing = (editIdx !== undefined) ? getManualConfigs()[editIdx] : null;
    var html = '<div class="mcf-form">';

    _manualConfigFields.forEach(function(f) {
        var dlId = 'mcf_dl_' + f.key.replace(/[^a-zA-Z]/g, '');
        var existingVals = _getExistingValues(f.key);
        html += '<div class="mcf-field">' +
            '<label class="mcf-label">' + f.label + ' <span style="color:#ef4444;">*</span></label>' +
            '<input type="text" class="mcf-input" id="mcf_' + f.key.replace(/[^a-zA-Z]/g, '') + '" ' +
            'data-key="' + f.key + '" list="' + dlId + '" value="' + (existing ? (existing[f.key] || '') : '') + '" ' +
            'oninput="updateManualConfigPreview()" autocomplete="off" placeholder="Escribe o selecciona...">' +
            '<datalist id="' + dlId + '">' +
            existingVals.map(function(v) { return '<option value="' + v + '">'; }).join('') +
            '</datalist></div>';
    });

    html += '<div class="mcf-preview" id="mcfPreview">' +
        '<div style="font-size:10px;color:#64748b;margin-bottom:2px;">Código generado:</div>' +
        '<div id="mcfPreviewCode" style="font-family:monospace;font-size:11px;color:var(--kia-red);font-weight:700;word-break:break-all;">-</div>' +
        '</div></div>';

    showModal(html, editIdx !== undefined ? 'Editar Configuración Manual' : 'Nueva Configuración Manual',
        [{ text: 'Guardar', class: 'btn-primary', onclick: 'saveManualConfig(' + (editIdx !== undefined ? editIdx : -1) + ')' }]
    );
    setTimeout(updateManualConfigPreview, 50);
}

function updateManualConfigPreview() {
    var code = [];
    _manualConfigFields.forEach(function(f) {
        var el = document.getElementById('mcf_' + f.key.replace(/[^a-zA-Z]/g, ''));
        if (el && el.value.trim()) code.push(el.value.trim());
    });
    var preview = document.getElementById('mcfPreviewCode');
    if (preview) preview.textContent = code.length > 0 ? code.join('-') : '(llena los campos)';
}

function saveManualConfig(editIdx) {
    var newConfig = {};
    var missing = [];

    _manualConfigFields.forEach(function(f) {
        var el = document.getElementById('mcf_' + f.key.replace(/[^a-zA-Z]/g, ''));
        var val = el ? el.value.trim() : '';
        if (!val) missing.push(f.label);
        newConfig[f.key] = val;
    });

    if (missing.length > 0) {
        showToast('Campos requeridos: ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? '...' : ''), 'error');
        return;
    }

    newConfig.codigo_config_text = _buildConfigCode(newConfig);
    newConfig._source = 'manual';

    // Check for conflicts
    var conflict = checkConfigConflicts(newConfig, editIdx);
    if (conflict === 'duplicate') {
        showToast('Ya existe esta configuración exacta en el catálogo', 'error');
        return;
    }

    if (conflict === 'similar') {
        showConfirm(
            'Existe una configuración similar (mismo Modelo + Año + Motor + Transmisión). ¿Desea continuar?',
            function() { _doSaveManualConfig(newConfig, editIdx); },
            { title: 'Configuración Similar', type: 'warning', confirmText: 'Guardar de todas formas' }
        );
        return;
    }

    _doSaveManualConfig(newConfig, editIdx);
}

function _doSaveManualConfig(newConfig, editIdx) {
    var manuals = getManualConfigs();
    if (editIdx >= 0 && editIdx < manuals.length) {
        manuals[editIdx] = newConfig;
    } else {
        manuals.push(newConfig);
    }
    _saveManualConfigs(manuals);

    // Rebuild allConfigurations
    _mergeManualConfigsIntoAll();

    // Close modal & refresh
    var overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();

    openConfigPanel();
    showToast('Configuración manual guardada (' + allConfigurations.length + ' total)', 'success');

    // Refresh cascade if visible
    var modelSelect = document.getElementById('cfg_model');
    if (modelSelect) {
        var uniqueModels = [].concat(Array.from(new Set(allConfigurations.map(function(c){return c.Modelo;}))).sort());
        modelSelect.innerHTML = '<option value="">Seleccionar...</option>';
        uniqueModels.forEach(function(m) { modelSelect.innerHTML += '<option value="'+m+'">'+m+'</option>'; });
    }
}

function checkConfigConflicts(newConfig, editIdx) {
    var manuals = getManualConfigs();
    // Check all configs (CSV + manual) for exact duplicates
    for (var i = 0; i < allConfigurations.length; i++) {
        var c = allConfigurations[i];
        // Skip the one being edited
        if (c._source === 'manual') {
            var manIdx = manuals.indexOf(c);
            if (manIdx === editIdx) continue;
        }
        var allMatch = true;
        _manualConfigFields.forEach(function(f) {
            if (c[f.key] !== newConfig[f.key]) allMatch = false;
        });
        if (allMatch) return 'duplicate';
    }

    // Check for similar (same Model + Year + Engine + Trans)
    var similarKeys = ['Modelo', 'MODEL YEAR (VIN)', 'ENGINE CAPACITY', 'TRANSMISSION'];
    for (var j = 0; j < allConfigurations.length; j++) {
        var c2 = allConfigurations[j];
        if (c2._source === 'manual') {
            var manIdx2 = manuals.indexOf(c2);
            if (manIdx2 === editIdx) continue;
        }
        var keyMatch = true;
        similarKeys.forEach(function(k) {
            if (c2[k] !== newConfig[k]) keyMatch = false;
        });
        if (keyMatch) {
            var allMatch2 = true;
            _manualConfigFields.forEach(function(f) {
                if (c2[f.key] !== newConfig[f.key]) allMatch2 = false;
            });
            if (!allMatch2) return 'similar';
        }
    }
    return null;
}

function _mergeManualConfigsIntoAll() {
    // Remove existing manual entries
    allConfigurations = allConfigurations.filter(function(c) { return c._source !== 'manual'; });
    // Add current manual configs
    var manuals = getManualConfigs();
    manuals.forEach(function(mc) {
        mc._source = 'manual';
        if (!mc.codigo_config_text) mc.codigo_config_text = _buildConfigCode(mc);
        allConfigurations.push(mc);
    });
}

function deleteManualConfig(idx) {
    showConfirm('¿Eliminar esta configuración manual?', function() {
        var manuals = getManualConfigs();
        manuals.splice(idx, 1);
        _saveManualConfigs(manuals);
        _mergeManualConfigsIntoAll();
        openConfigPanel();
        showToast('Configuración eliminada', 'success');
    }, { title: 'Eliminar Config', type: 'warning', confirmText: 'Eliminar' });
}

function renderManualConfigsList() {
    var container = document.getElementById('manualConfigsList');
    if (!container) return;
    var manuals = getManualConfigs();
    if (manuals.length === 0) {
        container.innerHTML = '';
        return;
    }

    var csvCount = allConfigurations.filter(function(c) { return c._source !== 'manual'; }).length;
    var html = '<div style="margin-top:10px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">' +
        '<div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:6px;">' +
        manuals.length + ' manual(es) + ' + csvCount + ' CSV = ' + allConfigurations.length + ' total</div>';

    manuals.forEach(function(mc, i) {
        var code = mc.codigo_config_text || _buildConfigCode(mc);
        html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #dbeafe;font-size:10px;">' +
            '<span style="flex:1;font-family:monospace;color:#1e40af;word-break:break-all;">' + code + '</span>' +
            '<button onclick="openManualConfigForm(' + i + ')" style="background:none;border:none;cursor:pointer;font-size:12px;" title="Editar">✏️</button>' +
            '<button onclick="deleteManualConfig(' + i + ')" style="background:none;border:none;cursor:pointer;font-size:12px;" title="Eliminar">🗑️</button>' +
            '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

// ── Modify parseCSV to include manual configs ──
var _origParseCSV = parseCSV;
parseCSV = function() {
    _origParseCSV();
    _mergeManualConfigsIntoAll();
};

// ── Modify openConfigPanel to show manual list ──
var _origOpenConfigPanel = openConfigPanel;
openConfigPanel = function() {
    _origOpenConfigPanel();
    renderManualConfigsList();
};

// ── Modify handleConfigCSVImport to check manual config conflicts ──
var _origHandleConfigCSVImport = handleConfigCSVImport;
handleConfigCSVImport = function(event) {
    var manuals = getManualConfigs();
    if (manuals.length === 0) {
        _origHandleConfigCSVImport(event);
        return;
    }
    // Store file for later processing
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var csvText = e.target.result;
        // Parse new CSV temporarily
        var lines = csvText.trim().split('\n');
        var headers = lines[0].split(',');
        var newConfigs = [];
        for (var i = 1; i < lines.length; i++) {
            var values = lines[i].split(',');
            var cfg = {};
            headers.forEach(function(h, idx) { cfg[h] = values[idx] || ''; });
            newConfigs.push(cfg);
        }

        // Check which manuals conflict with new CSV
        var dupes = 0, unique = 0;
        manuals.forEach(function(mc) {
            var isDupe = newConfigs.some(function(nc) {
                return _manualConfigFields.every(function(f) { return nc[f.key] === mc[f.key]; });
            });
            if (isDupe) dupes++; else unique++;
        });

        showConfirm(
            '<div style="text-align:left;">' +
            '<p>Nuevo CSV: <strong>' + newConfigs.length + '</strong> configs</p>' +
            '<p>Configs manuales: <strong>' + manuals.length + '</strong> (' + dupes + ' ya existen en CSV, ' + unique + ' únicas)</p>' +
            '<p style="margin-top:8px;font-size:12px;">¿Qué hacer con las configuraciones manuales?</p>' +
            '</div>',
            function() {
                // Keep unique manuals
                localStorage.setItem('kia_config_csv_raw', csvText);
                var kept = manuals.filter(function(mc) {
                    return !newConfigs.some(function(nc) {
                        return _manualConfigFields.every(function(f) { return nc[f.key] === mc[f.key]; });
                    });
                });
                _saveManualConfigs(kept);
                parseCSV();
                openConfigPanel();
                showToast('CSV importado. ' + kept.length + ' configs manuales únicas mantenidas.', 'success');
            },
            {
                title: 'Importar CSV — Configs Manuales',
                type: 'warning',
                confirmText: 'Mantener únicas (' + unique + ')',
                cancelText: 'Eliminar todas las manuales',
                onCancel: function() {
                    _saveManualConfigs([]);
                    localStorage.setItem('kia_config_csv_raw', csvText);
                    parseCSV();
                    openConfigPanel();
                    showToast('CSV importado. Configs manuales eliminadas.', 'success');
                }
            }
        );
    };
    reader.readAsText(file);
    event.target.value = '';
};

// Also update displayConfigResult to show manual badge
var _origDisplayConfigResult = displayConfigResult;
displayConfigResult = function(filtered) {
    _origDisplayConfigResult(filtered);
    if (filtered.length === 1 && filtered[0]._source === 'manual') {
        var resultDiv = document.getElementById('cfg_result');
        if (resultDiv) {
            var badge = '<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:4px;background:#dbeafe;color:#1d4ed8;font-size:9px;font-weight:700;">MANUAL</span>';
            resultDiv.querySelector('div') && (resultDiv.querySelector('strong').innerHTML += badge);
        }
    }
};


// ======================================================================
// [R2-M2] QUICK REVIEW PANEL
// ======================================================================

var _reviewSections = [
    { title: 'Recepción', fields: [
        {id:'precond_responsible',label:'Responsable'},
        {id:'precond_datetime',label:'Fecha Precond'},
        {id:'tire_pressure',label:'Presión llantas (psi)', warn:function(v){var n=parseFloat(v);return n>0&&(n<25||n>50);}},
        {id:'tire_pressure_in',label:'Presión entrada (psi)'},
        {id:'fuel_typein',label:'Combustible entrada'},
        {id:'fuel_levelin',label:'Nivel combustible entrada'},
        {id:'fuel_typepre',label:'Combustible precond'},
        {id:'fuel_levelpre',label:'Nivel litros precond'},
        {id:'tank_capacity',label:'Capacidad tanque (L)'},
        {id:'battery_soc',label:'SOC Batería (%)'}
    ]},
    { title: 'Preacondicionamiento', fields: [
        {id:'precond_cycle',label:'Ciclo'},
        {id:'soak_time',label:'Tiempo reposo (h)'},
        {id:'odo_pretest',label:'Odómetro pre-test (km)'},
        {id:'precond_ok',label:'Precond OK'},
        {id:'op_odo',label:'Odómetro (km)', warn:function(v){return v==='0'||v===0;}},
        {id:'dtc_pending_before',label:'DTC Pendientes'},
        {id:'dtc_confirmed_before',label:'DTC Confirmados'},
        {id:'dtc_permanent_before',label:'DTC Permanentes'}
    ]},
    { title: 'Verificación de Prueba', fields: [
        {id:'test_responsible',label:'Responsable prueba'},
        {id:'test_datetime',label:'Fecha prueba'},
        {id:'test_tunnel',label:'Túnel'},
        {id:'test_dyno_on',label:'Dinamómetro'},
        {id:'test_fan_mode',label:'Modo ventilador'},
        {id:'test_fan_speed',label:'Vel. ventilador'},
        {id:'test_chains',label:'Cadenas'},
        {id:'test_slings',label:'Eslingas'},
        {id:'test_hood',label:'Cofre'},
        {id:'test_rear_rollers',label:'Rodillos traseros'},
        {id:'test_screen',label:'Pantalla'},
        {id:'test_inertia_ok',label:'Inercia OK'}
    ]},
    { title: 'Coeficientes Dinamo', fields: [
        {id:'etw',label:'ETW'},
        {id:'tA',label:'Target A'}, {id:'dA',label:'Dyno A'},
        {id:'tB',label:'Target B'}, {id:'dB',label:'Dyno B'},
        {id:'tC',label:'Target C'}, {id:'dC',label:'Dyno C'}
    ]}
];

function openQuickReview() {
    var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle) { showToast('Selecciona un vehículo', 'warning'); return; }

    var total = 0, filled = 0, empty = 0, warnings = 0;
    var html = '<div style="max-height:60vh;overflow-y:auto;">';

    _reviewSections.forEach(function(sec) {
        var secHtml = '';
        sec.fields.forEach(function(f) {
            var el = document.getElementById(f.id);
            if (!el) return;
            total++;
            var val = el.value;
            var isEmpty = !val || val === '';
            var isWarn = !isEmpty && f.warn && f.warn(val);
            var icon, color;
            if (isEmpty) { icon = '❌'; color = '#fef2f2'; empty++; }
            else if (isWarn) { icon = '⚠️'; color = '#fffbeb'; warnings++; }
            else { icon = '✅'; color = 'transparent'; filled++; }

            var displayVal = isEmpty ? '<em style="color:#94a3b8;">vacío</em>' : (val.length > 25 ? val.substring(0,23)+'..' : val);

            secHtml += '<div class="qr-field" style="background:' + color + ';" onclick="quickReviewGoTo(\'' + f.id + '\')">' +
                '<span class="qr-icon">' + icon + '</span>' +
                '<span class="qr-label">' + f.label + '</span>' +
                '<span class="qr-val">' + displayVal + '</span></div>';
        });
        html += '<div class="qr-section"><div class="qr-section-title">' + sec.title + '</div>' + secHtml + '</div>';
    });

    html += '</div>';

    var pct = total > 0 ? Math.round((filled / total) * 100) : 0;
    var barColor = pct === 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';

    var header = '<div style="margin-bottom:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<span style="font-size:13px;font-weight:700;">' + filled + '/' + total + ' campos completados</span>' +
        '<span style="font-size:11px;color:#64748b;">' + empty + ' pendientes' + (warnings ? ' · ' + warnings + ' advertencias' : '') + '</span></div>' +
        '<div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px;transition:width 0.3s;"></div></div></div>';

    showModal(header + html, 'Quick Review — ' + (vehicle.vin || '').slice(-8));
}

function quickReviewGoTo(fieldId) {
    // Close the modal
    var modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();

    var el = document.getElementById(fieldId);
    if (!el) return;

    // Open the parent accordion
    var acc = el.closest('details.acc');
    if (acc && !acc.open) acc.open = true;

    // Scroll and focus
    setTimeout(function() {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.style.outline = '3px solid #3b82f6';
        el.style.outlineOffset = '2px';
        setTimeout(function() { el.style.outline = ''; el.style.outlineOffset = ''; }, 3000);
    }, 150);
}

// ======================================================================
// [R2-M6] COPY FROM LAST VEHICLE
// ======================================================================

var _copyableFields = [
    {id:'precond_responsible', label:'Responsable Precond'},
    {id:'tire_pressure', label:'Presión llantas'},
    {id:'fuel_typein', label:'Tipo combustible entrada'},
    {id:'fuel_typepre', label:'Tipo combustible precond'},
    {id:'precond_cycle', label:'Ciclo precond'},
    {id:'soak_time', label:'Tiempo reposo (h)'},
    {id:'tank_capacity', label:'Capacidad tanque'},
    {id:'test_tunnel', label:'Túnel'},
    {id:'test_dyno_on', label:'Dinamómetro'},
    {id:'test_fan_mode', label:'Modo ventilador'},
    {id:'test_fan_speed', label:'Vel. ventilador'},
    {id:'test_fan_flow', label:'Flujo ventilador'},
    {id:'test_chains', label:'Cadenas'},
    {id:'test_slings', label:'Eslingas'},
    {id:'test_hood', label:'Cofre'},
    {id:'test_rear_rollers', label:'Rodillos traseros'},
    {id:'test_screen', label:'Pantalla'},
    {id:'test_inertia_ok', label:'Inercia'},
    {id:'etw', label:'ETW'},
    {id:'tA', label:'Target A'},
    {id:'dA', label:'Dyno A'},
    {id:'tB', label:'Target B'},
    {id:'dB', label:'Dyno B'},
    {id:'tC', label:'Target C'},
    {id:'dC', label:'Dyno C'},
    {id:'test_responsible', label:'Responsable prueba'}
];

function copyFromLastVehicle() {
    var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle) { showToast('No hay vehículo seleccionado', 'error'); return; }

    // Find last archived vehicle with same configCode
    var candidates = db.vehicles.filter(function(v) {
        return v.id !== vehicle.id && v.configCode === vehicle.configCode &&
               (v.status === 'archived' || v.status === 'released' || v.status === 'ready-release') &&
               v.testData;
    }).sort(function(a, b) {
        return new Date(b.lastModified || b.registeredAt) - new Date(a.lastModified || a.registeredAt);
    });

    if (candidates.length === 0) {
        showToast('No hay vehículo anterior con config ' + (vehicle.configCode || '').substring(0, 30) + '...', 'warning');
        return;
    }

    var source = candidates[0];
    var td = source.testData || {};
    var p = td.preconditioning || {};
    var tv = td.testVerification || {};

    // Build values map from source
    var sourceValues = {
        'precond_responsible': p.responsible || '',
        'tire_pressure': p.tirePressurePsi || '',
        'fuel_typein': p.fuelTypeIn || '',
        'fuel_typepre': p.fuelTypePre || '',
        'precond_cycle': p.cycle || '',
        'soak_time': p.soakTimeH != null ? String(p.soakTimeH) : '',
        'tank_capacity': p.tankCapacityL || '',
        'test_tunnel': tv.tunnel || '',
        'test_dyno_on': tv.dyno || '',
        'test_fan_mode': tv.fanMode || '',
        'test_fan_speed': tv.fanSpeedKmh || '',
        'test_fan_flow': tv.fanFlowM3Min || '',
        'test_chains': tv.chains || '',
        'test_slings': tv.slings || '',
        'test_hood': tv.hood || '',
        'test_rear_rollers': tv.rearRollers || '',
        'test_screen': tv.screen || '',
        'test_inertia_ok': tv.inertiaOk || '',
        'test_responsible': td.testResponsible || '',
        'etw': td.etw || '', 'tA': td.targetA || '', 'dA': td.dynoA || '',
        'tB': td.targetB || '', 'dB': td.dynoB || '',
        'tC': td.targetC || '', 'dC': td.dynoC || ''
    };

    // Count non-empty fields to copy
    var fieldsToCopy = _copyableFields.filter(function(f) { return sourceValues[f.id]; });
    if (fieldsToCopy.length === 0) {
        showToast('El vehículo anterior no tiene datos para copiar', 'warning');
        return;
    }

    var sourceDate = new Date(source.lastModified || source.registeredAt).toLocaleDateString('es-MX');
    var vinShort = '...' + source.vin.slice(-6);

    showConfirm(
        '<div style="text-align:left;">' +
        '<p><strong>Copiar datos de VIN ' + vinShort + '</strong> (archivado ' + sourceDate + ')</p>' +
        '<p style="font-size:11px;color:#64748b;margin:8px 0 4px;">Campos a copiar (' + fieldsToCopy.length + '):</p>' +
        '<div style="font-size:11px;color:#475569;max-height:150px;overflow-y:auto;columns:2;column-gap:12px;">' +
        fieldsToCopy.map(function(f) { return '<div>• ' + f.label + '</div>'; }).join('') +
        '</div></div>',
        function() {
            // Apply values
            fieldsToCopy.forEach(function(f) {
                var el = document.getElementById(f.id);
                if (el) {
                    el.value = sourceValues[f.id];
                    // Visual feedback - pulsing blue border
                    el.style.outline = '2px dashed #3b82f6';
                    el.style.outlineOffset = '2px';
                    setTimeout(function() {
                        el.style.outline = '';
                        el.style.outlineOffset = '';
                    }, 4000);
                }
            });
            updateFanFieldsByMode();
            showToast(fieldsToCopy.length + ' campos copiados de VIN ' + vinShort, 'success');
        },
        { title: 'Copiar de Último Vehículo', type: 'info', confirmText: 'Copiar' }
    );
}

// ======================================================================
// [R2-M3] AUTO-SUGGEST INTELLIGENT DATES
// ======================================================================

function _nextBusinessDay(date) {
    var d = new Date(date);
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
}

function _toLocalDatetimeStr(d) {
    var yr = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var dy = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return yr + '-' + mo + '-' + dy + 'T' + hh + ':' + mm;
}

function _formatSuggestionLabel(d) {
    var days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    return days[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear() +
           ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function autoSuggestDates() {
    var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle) return;
    if (!isEmissionsPurpose(vehicle.purpose)) return;

    var regDt = vehicle.registeredAt ? new Date(vehicle.registeredAt) : null;
    var precondEl = document.getElementById('precond_datetime');
    var testEl = document.getElementById('test_datetime');
    var soakEl = document.getElementById('soak_time');
    if (!precondEl || !testEl) return;

    // Remove old suggestion hints
    document.querySelectorAll('.date-suggestion').forEach(function(el) { el.remove(); });

    // Suggest precond date if empty
    if (!precondEl.value && regDt) {
        var sugPrecond = _nextBusinessDay(regDt);
        _renderDateSuggestion(precondEl, sugPrecond, 'Sugerido: ' + _formatSuggestionLabel(sugPrecond) + ' (sig. día hábil)');
    }

    // Suggest test date if precond is set but test is empty
    if (precondEl.value && !testEl.value) {
        var precondDate = new Date(precondEl.value);
        var soakH = parseFloat(soakEl?.value) || 0;

        // Check if soak timer is active and use its end time
        var soakData = null;
        try { soakData = JSON.parse(localStorage.getItem('kia_soak_timer')); } catch(e) {}
        var sugTest;

        if (soakData && soakData.endTime) {
            sugTest = new Date(soakData.endTime);
            sugTest.setHours(sugTest.getHours() + 2); // 2h margin after soak
            _renderDateSuggestion(testEl, sugTest, 'Sugerido: ' + _formatSuggestionLabel(sugTest) + ' (soak + 2h margen)');
        } else if (soakH > 0) {
            sugTest = new Date(precondDate.getTime() + (soakH + 2) * 3600000);
            // Skip weekends
            while (sugTest.getDay() === 0 || sugTest.getDay() === 6) sugTest.setDate(sugTest.getDate() + 1);
            _renderDateSuggestion(testEl, sugTest, 'Sugerido: ' + _formatSuggestionLabel(sugTest) + ' (soak ' + soakH + 'h + 2h)');
        } else {
            // Default: precond + 26h (typical 24h soak + 2h margin)
            sugTest = new Date(precondDate.getTime() + 26 * 3600000);
            while (sugTest.getDay() === 0 || sugTest.getDay() === 6) sugTest.setDate(sugTest.getDate() + 1);
            _renderDateSuggestion(testEl, sugTest, 'Sugerido: ' + _formatSuggestionLabel(sugTest) + ' (24h soak + 2h)');
        }
    }
}

function _renderDateSuggestion(inputEl, suggestedDate, label) {
    var hint = document.createElement('div');
    hint.className = 'date-suggestion';
    hint.innerHTML = '<span style="flex:1;">' + label + '</span>' +
        '<button type="button" class="date-sug-apply" onclick="this.parentElement.previousElementSibling.value=\'' +
        _toLocalDatetimeStr(suggestedDate) + '\';this.parentElement.remove();autoSuggestDates();">Aplicar</button>';
    inputEl.parentElement.appendChild(hint);
}

// ======================================================================
// STALLED VEHICLE ALERTS
// ======================================================================
function checkStalledVehicles() {
    const now = Date.now();
    const STALL_HOURS = 48;
    const stalled = db.vehicles.filter(v => {
        if (v.status === 'archived') return false;
        const lastUp = v.lastModified || v.registeredAt;
        if (!lastUp) return false;
        return (now - new Date(lastUp).getTime()) / (1000*60*60) > STALL_HOURS;
    });
    const el = document.getElementById('stalledBanner');
    if (!el) return;
    if (stalled.length === 0) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = '<div style="padding:10px 14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;margin:0 14px 10px;">' +
        '<div style="font-size:12px;font-weight:700;color:#ef4444;margin-bottom:4px;">\u26A0\uFE0F ' + stalled.length + ' vehiculo(s) estancado(s) (>48h)</div>' +
        stalled.map(function(v) {
            var hrs = Math.round((now - new Date(v.lastModified||v.registeredAt).getTime()) / (1000*60*60));
            return '<div style="font-size:10px;color:#fca5a5;padding:2px 0;">\u2022 <strong>' + (v.vin||'?') + '</strong> \u2014 ' + v.status + ' \u2014 ' + hrs + 'h</div>';
        }).join('') +
    '</div>';
}

// ======================================================================
// PLAN HISTORY VIEWER
// ======================================================================

// ======================================================================
// SOAK TIMER — Countdown de preacondicionamiento con notificaciones
// ======================================================================

var _soakTimer = { interval: null, endTime: null, totalMs: 0, running: false, chimeInterval: null };
var _soakOrigTitle = document.title;

function soakUpdateTabTitle() {
    if (!_soakTimer.running) { document.title = _soakOrigTitle; soakUpdateBadge(false); return; }
    var remaining = _soakTimer.endTime - Date.now();
    if (remaining <= 0) { document.title = _soakOrigTitle; return; }
    var h = Math.floor(remaining / 3600000);
    var m = Math.floor((remaining % 3600000) / 60000);
    document.title = 'SOAK: ' + h + 'h ' + m + 'm — KIA EmLab';
    soakUpdateBadge(true, h + 'h ' + m + 'm');
}

function soakUpdateBadge(show, text) {
    var badge = document.getElementById('soak-floating-badge');
    if (!badge) return;
    if (show) {
        badge.style.display = 'flex';
        badge.querySelector('.soak-badge-text').textContent = text || '';
    } else {
        badge.style.display = 'none';
    }
}

function soakPlayChime() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880; osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
        // Second tone
        var osc2 = ctx.createOscillator();
        var gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.frequency.value = 1320; osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.3);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
        osc2.start(ctx.currentTime + 0.3); osc2.stop(ctx.currentTime + 1.1);
    } catch(e) {}
}

function soakTimerStart() {
    if (_soakTimer.running) return;

    // Request notification permission on first start
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    var hours = parseFloat(document.getElementById('soak_timer_hours').value) || 24;
    var now = Date.now();

    // If paused (endTime exists and is in the future), resume
    if (_soakTimer.endTime && _soakTimer.endTime > now) {
        // Resume from where we left off
    } else {
        // Fresh start
        _soakTimer.totalMs = hours * 3600 * 1000;
        _soakTimer.endTime = now + _soakTimer.totalMs;
    }

    _soakTimer.running = true;
    document.getElementById('soak_timer_btn_start').style.display = 'none';
    document.getElementById('soak_timer_btn_stop').style.display = '';

    // Save to localStorage so timer persists across page reloads
    localStorage.setItem('kia_soak_timer', JSON.stringify({
        endTime: _soakTimer.endTime,
        totalMs: _soakTimer.totalMs
    }));

    if (typeof fbPostSoakStarted === 'function') fbPostSoakStarted(typeof activeVehicleId !== 'undefined' ? activeVehicleId : '', hours);
    _soakTimer.interval = setInterval(soakTimerTick, 1000);
    soakTimerTick();
}

function soakTimerStop() {
    _soakTimer.running = false;
    if (_soakTimer.interval) { clearInterval(_soakTimer.interval); _soakTimer.interval = null; }
    if (_soakTimer.chimeInterval) { clearInterval(_soakTimer.chimeInterval); _soakTimer.chimeInterval = null; }
    document.getElementById('soak_timer_btn_start').style.display = '';
    document.getElementById('soak_timer_btn_stop').style.display = 'none';
    document.getElementById('soak_timer_status').textContent = 'Pausado';
    document.getElementById('soak_timer_status').style.color = '#f59e0b';
    document.title = _soakOrigTitle;
    soakUpdateBadge(false);
}

function soakTimerReset() {
    _soakTimer.running = false;
    if (_soakTimer.interval) { clearInterval(_soakTimer.interval); _soakTimer.interval = null; }
    if (_soakTimer.chimeInterval) { clearInterval(_soakTimer.chimeInterval); _soakTimer.chimeInterval = null; }
    _soakTimer.endTime = null;
    _soakTimer.totalMs = 0;
    localStorage.removeItem('kia_soak_timer');
    document.title = _soakOrigTitle;
    soakUpdateBadge(false);

    document.getElementById('soak_timer_display').textContent = '00:00:00';
    document.getElementById('soak_timer_display').style.color = '#64748b';
    document.getElementById('soak_timer_status').textContent = 'Sin iniciar';
    document.getElementById('soak_timer_status').style.color = '#64748b';
    document.getElementById('soak_timer_bar').style.width = '0%';
    document.getElementById('soak_timer_bar').style.background = '#10b981';
    document.getElementById('soak_timer_eta').textContent = '';
    document.getElementById('soak_timer_btn_start').style.display = '';
    document.getElementById('soak_timer_btn_stop').style.display = 'none';
}

function soakTimerTick() {
    var now = Date.now();
    var remaining = _soakTimer.endTime - now;

    if (remaining <= 0) {
        // Timer completed
        clearInterval(_soakTimer.interval);
        _soakTimer.interval = null;
        _soakTimer.running = false;
        localStorage.removeItem('kia_soak_timer');

        document.getElementById('soak_timer_display').textContent = '00:00:00';
        document.getElementById('soak_timer_display').style.color = '#10b981';
        document.getElementById('soak_timer_status').textContent = 'SOAK COMPLETADO - Listo para prueba';
        document.getElementById('soak_timer_status').style.color = '#10b981';
        document.getElementById('soak_timer_bar').style.width = '100%';
        document.getElementById('soak_timer_bar').style.background = '#10b981';
        document.getElementById('soak_timer_btn_start').style.display = '';
        document.getElementById('soak_timer_btn_stop').style.display = 'none';

        // Auto-fill soak time field
        var soakField = document.getElementById('soak_time');
        if (soakField) soakField.value = (_soakTimer.totalMs / 3600000).toFixed(1);

        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('KIA EmLab - Soak Completado', {
                body: 'El tiempo de reposo ha terminado. El vehiculo esta listo para prueba.',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✅</text></svg>'
            });
        }

        // Audio chime + vibration
        soakPlayChime();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        // Repeat chime every 30s for 5 minutes
        var chimeCount = 0;
        _soakTimer.chimeInterval = setInterval(function() {
            chimeCount++;
            soakPlayChime();
            if (navigator.vibrate) navigator.vibrate(200);
            if (chimeCount >= 10) { clearInterval(_soakTimer.chimeInterval); _soakTimer.chimeInterval = null; }
        }, 30000);

        // Restore tab title + update badge
        document.title = 'SOAK LISTO — KIA EmLab';
        soakUpdateBadge(true, 'LISTO');
        setTimeout(function(){ document.title = _soakOrigTitle; soakUpdateBadge(false); }, 300000);

        showToast('SOAK COMPLETADO - El vehiculo esta listo para prueba.', 'success');

        // [V7-D3] Show soak complete modal with action
        v7ShowSoakCompleteModal();
        return;
    }

    // Update display
    var h = Math.floor(remaining / 3600000);
    var m = Math.floor((remaining % 3600000) / 60000);
    var s = Math.floor((remaining % 60000) / 1000);
    var display = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');

    var pct = _soakTimer.totalMs > 0 ? ((1 - remaining / _soakTimer.totalMs) * 100) : 0;
    var isLow = remaining < 3600000; // less than 1 hour
    var barColor = isLow ? '#f59e0b' : '#3b82f6';
    var textColor = isLow ? '#f59e0b' : '#3b82f6';

    document.getElementById('soak_timer_display').textContent = display;
    document.getElementById('soak_timer_display').style.color = textColor;
    document.getElementById('soak_timer_status').textContent = 'En curso...';
    document.getElementById('soak_timer_status').style.color = textColor;
    document.getElementById('soak_timer_bar').style.width = pct.toFixed(1) + '%';
    document.getElementById('soak_timer_bar').style.background = barColor;

    var eta = new Date(_soakTimer.endTime);
    document.getElementById('soak_timer_eta').textContent = 'Listo a las ' + eta.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'}) + ' del ' + eta.toLocaleDateString('es-MX', {day:'numeric',month:'short'});

    // Update tab title + floating badge (every tick for responsiveness)
    if (s === 0) soakUpdateTabTitle(); // Once per minute at :00 seconds
    if (!window._soakBadgeInit) { soakUpdateTabTitle(); window._soakBadgeInit = true; }
}

function soakTimerRestore() {
    var saved = localStorage.getItem('kia_soak_timer');
    if (!saved) return;
    try {
        var data = JSON.parse(saved);
        if (data.endTime > Date.now()) {
            _soakTimer.endTime = data.endTime;
            _soakTimer.totalMs = data.totalMs;
            soakTimerStart();
        } else {
            // Timer already expired while page was closed
            localStorage.removeItem('kia_soak_timer');
            document.getElementById('soak_timer_display').textContent = '00:00:00';
            document.getElementById('soak_timer_display').style.color = '#10b981';
            document.getElementById('soak_timer_status').textContent = 'SOAK COMPLETADO (termino mientras la app estaba cerrada)';
            document.getElementById('soak_timer_status').style.color = '#10b981';
            document.getElementById('soak_timer_bar').style.width = '100%';
        }
    } catch(e) { localStorage.removeItem('kia_soak_timer'); }
}


// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [B1] KANBAN QUEUE — Visual vehicle pipeline                       ║
// ╚══════════════════════════════════════════════════════════════════════╝

var _kanbanFilters = { search: '', sort: 'newest', operator: '' };

function kanbanApplyFilters(vehicles) {
    var f = _kanbanFilters;
    var filtered = vehicles;
    // Search filter
    if (f.search) {
        var q = f.search.toLowerCase();
        filtered = filtered.filter(function(v) {
            var vin = (v.vin || '').toLowerCase();
            var modelo = ((v.config || {})['Modelo'] || '').toLowerCase();
            var purpose = (v.purpose || '').toLowerCase();
            var op = ((v.testData || {}).operator || '').toLowerCase();
            return vin.includes(q) || modelo.includes(q) || purpose.includes(q) || op.includes(q);
        });
    }
    // Operator filter
    if (f.operator) {
        filtered = filtered.filter(function(v) { return (v.testData || {}).operator === f.operator; });
    }
    // Sort
    filtered.sort(function(a, b) {
        var tsA = a.timeline && a.timeline.length > 0 ? new Date(a.timeline[a.timeline.length-1].timestamp).getTime() : 0;
        var tsB = b.timeline && b.timeline.length > 0 ? new Date(b.timeline[b.timeline.length-1].timestamp).getTime() : 0;
        if (f.sort === 'newest') return tsB - tsA;
        if (f.sort === 'oldest') return tsA - tsB;
        if (f.sort === 'model') return ((a.config||{})['Modelo']||'').localeCompare(((b.config||{})['Modelo']||''));
        if (f.sort === 'operator') return ((a.testData||{}).operator||'').localeCompare(((b.testData||{}).operator||''));
        return 0;
    });
    return filtered;
}

function renderKanban() {
    var el = document.getElementById('kanban-board');
    if (!el) return;

    var vehicles = db.vehicles || [];
    var columns = [
        { key: 'registered',    label: 'Registrado',       color: '#3b82f6', icon: '📝' },
        { key: 'in-progress',   label: 'En Progreso',      color: '#f59e0b', icon: '🔧' },
        { key: 'testing',       label: 'En Prueba',        color: '#8b5cf6', icon: '🧪' },
        { key: 'ready-release', label: 'Listo p/ Liberar', color: '#10b981', icon: '✅' }
    ];

    // Soak timer info
    var soakData = null;
    try {
        var raw = localStorage.getItem('kia_soak_timer');
        if (raw) soakData = JSON.parse(raw);
    } catch(e) {}

    // Collect unique operators for filter
    var allOps = {};
    vehicles.forEach(function(v) { var op = (v.testData || {}).operator; if (op) allOps[op] = true; });
    var opList = Object.keys(allOps).sort();

    var precondCount = vehicles.filter(function(v) { return v.status === 'registered' || v.status === 'in-progress'; }).length;
    var _kanbanCompact = getViewMode('kanban') === 'compact';
    var html = '<div style="display:flex;gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap;">';
    html += '<h3 style="margin:0;font-size:16px;">Cola de Vehiculos</h3>';
    var totalActive = vehicles.filter(function(v){ return v.status !== 'archived'; }).length;
    html += '<span style="font-size:11px;color:#64748b;">' + totalActive + ' activos</span>';
    html += '<span style="margin-left:auto;">' + renderViewModeToggle('kanban', true) + '</span>';
    if (precondCount > 0) {
        html += '<button onclick="renderPrecondBatchView()" style="background:#f59e0b;color:#000;border:none;padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">📋 Precond Lote (' + precondCount + ')</button>';
    }
    html += '</div>';

    // Search + Sort + Filter bar
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">';
    html += '<input type="text" placeholder="Buscar VIN, modelo, operador..." value="' + (_kanbanFilters.search || '') + '" oninput="_kanbanFilters.search=this.value;renderKanban();" style="flex:1;min-width:140px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;">';
    html += '<select onchange="_kanbanFilters.sort=this.value;renderKanban();" style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:10px;background:#fff;">';
    html += '<option value="newest"' + (_kanbanFilters.sort==='newest'?' selected':'') + '>Mas reciente</option>';
    html += '<option value="oldest"' + (_kanbanFilters.sort==='oldest'?' selected':'') + '>Mas antiguo</option>';
    html += '<option value="model"' + (_kanbanFilters.sort==='model'?' selected':'') + '>Modelo</option>';
    html += '<option value="operator"' + (_kanbanFilters.sort==='operator'?' selected':'') + '>Operador</option>';
    html += '</select>';
    if (opList.length > 0) {
        html += '<select onchange="_kanbanFilters.operator=this.value;renderKanban();" style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:10px;background:#fff;">';
        html += '<option value="">Todos ops</option>';
        opList.forEach(function(op) {
            html += '<option value="' + op + '"' + (_kanbanFilters.operator===op?' selected':'') + '>' + op + '</option>';
        });
        html += '</select>';
    }
    if (_kanbanFilters.search || _kanbanFilters.operator) {
        html += '<button onclick="_kanbanFilters.search=\'\';_kanbanFilters.operator=\'\';renderKanban();" style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;font-size:10px;cursor:pointer;">✕ Limpiar</button>';
    }
    html += '</div>';

    // Apply filters to all non-archived vehicles
    var filteredVehicles = kanbanApplyFilters(vehicles);

    html += '<div class="' + (_kanbanCompact ? 'list-compact' : '') + '" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;align-items:start;">';

    columns.forEach(function(col) {
        var colVehicles = filteredVehicles.filter(function(v) { return v.status === col.key; });

        html += '<div style="background:#f8fafc;border-radius:10px;padding:10px;border-top:3px solid ' + col.color + ';min-height:120px;">';
        // Header
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<span style="font-weight:700;font-size:12px;color:#0f172a;">' + col.icon + ' ' + col.label + '</span>';
        html += '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:' + col.color + '20;color:' + col.color + ';font-weight:700;">' + colVehicles.length + '</span>';
        html += '</div>';

        if (colVehicles.length === 0) {
            html += '<div style="text-align:center;padding:15px;color:#94a3b8;font-size:10px;">Sin vehiculos</div>';
        } else {
            colVehicles.forEach(function(v) {
                var td = v.testData || {};
                var timeSince = '';
                if (v.timeline && v.timeline.length > 0) {
                    var lastTs = v.timeline[v.timeline.length - 1].timestamp;
                    var hrs = Math.round((Date.now() - new Date(lastTs).getTime()) / (1000 * 60 * 60));
                    timeSince = hrs < 1 ? '<1h' : hrs < 24 ? hrs + 'h' : Math.floor(hrs / 24) + 'd';
                }

                var shortVin = escapeHtml((v.vin || '?').slice(-8));
                var fullVin = v.vin || '';
                var cfg = v.config || {};
                var modelo = escapeHtml(cfg['Modelo'] || '');
                var motor = escapeHtml(cfg['ENGINE CAPACITY'] || '');
                var regulacion = escapeHtml(cfg['EMISSION REGULATION'] || '');

                // Purpose color for left border
                var purposeBorder = '#e2e8f0';
                if (v.purpose) {
                    if (v.purpose.includes('COP') && v.purpose.includes('Emision')) purposeBorder = '#3b82f6';
                    else if (v.purpose.includes('COP') && v.purpose.includes('OBD')) purposeBorder = '#8b5cf6';
                    else if (v.purpose.includes('EO')) purposeBorder = '#f59e0b';
                    else if (v.purpose.includes('ND')) purposeBorder = '#10b981';
                    else if (v.purpose.includes('Correlacion') || v.purpose.includes('Investigacion')) purposeBorder = '#64748b';
                    else purposeBorder = '#0ea5e9';
                }

                html += '<div class="anim-card-hover" style="background:#fff;border-radius:8px;padding:8px 10px;margin-bottom:6px;border:1px solid #e2e8f0;border-left:4px solid ' + purposeBorder + ';box-shadow:0 1px 2px rgba(0,0,0,0.04);cursor:pointer;" onclick="kanbanGoVehicle(' + v.id + ',\'' + v.status + '\')">';
                // VIN + copy + time
                html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
                html += '<span style="display:flex;align-items:center;gap:4px;">';
                html += '<span style="font-family:monospace;font-size:11px;font-weight:700;color:#0f172a;">...' + shortVin + '</span>';
                html += '<button onclick="event.stopPropagation();copyToClipboard(\'' + fullVin.replace(/'/g,"\\'") + '\', this)" style="background:none;border:none;cursor:pointer;font-size:10px;padding:0 2px;" title="Copiar VIN">📋</button>';
                html += '</span>';
                if (timeSince) html += '<span style="font-size:9px;color:#94a3b8;" title="Tiempo en este estado">' + timeSince + '</span>';
                html += '</div>';
                // Config labels
                if (modelo) {
                    html += '<div style="font-size:10px;font-weight:600;color:#0f172a;margin-top:3px;">' + modelo + '</div>';
                }
                html += '<div class="compact-hide" style="display:flex;gap:4px;margin-top:2px;flex-wrap:wrap;">';
                if (motor) html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe;">' + motor + '</span>';
                if (regulacion) html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;">' + regulacion + '</span>';
                html += '</div>';
                // Purpose badge
                html += '<div class="compact-hide" style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">';
                if (v.purpose) {
                    var pColor = v.purpose.includes('COP') ? '#0ea5e9' : v.purpose.includes('EO') ? '#f97316' : '#8b5cf6';
                    html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + pColor + '15;color:' + pColor + ';border:1px solid ' + pColor + '30;">' + v.purpose + '</span>';
                }
                // Operator
                if (td.operator) {
                    html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#f1f5f9;color:#475569;">' + td.operator + '</span>';
                }
                html += '</div>';

                // Soak indicator if applicable
                if (col.key === 'in-progress' && soakData && soakData.endTime) {
                    var remaining = soakData.endTime - Date.now();
                    if (remaining > 0) {
                        var hrs = Math.floor(remaining / (1000 * 60 * 60));
                        var mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                        html += '<div class="compact-hide" style="margin-top:4px;font-size:9px;padding:2px 6px;border-radius:3px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;">Soak: ' + hrs + 'h ' + mins + 'm restantes</div>';
                    }
                }
                html += '</div>';
            });
        }
        html += '</div>';
    });

    html += '</div>';

    // Summary metrics below
    var archived = vehicles.filter(function(v){ return v.status === 'archived'; }).length;
    html += '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;">';
    html += '<div style="padding:8px 14px;border-radius:8px;background:#f1f5f9;font-size:11px;"><strong style="color:#0f172a;">' + archived + '</strong> <span style="color:#64748b;">archivados</span></div>';
    html += '<div style="padding:8px 14px;border-radius:8px;background:#f1f5f9;font-size:11px;"><strong style="color:#0f172a;">' + vehicles.length + '</strong> <span style="color:#64748b;">total historico</span></div>';
    html += '</div>';

    el.innerHTML = html;

    // [R5-M4] Stagger kanban cards
    if (typeof animateStaggerChildren === 'function') {
        el.querySelectorAll('[style*="min-width:160px"]').forEach(function(col) {
            animateStaggerChildren(col, '.anim-card-hover', 40);
        });
    }
}

// ======================================================================
// [M11b] CHECKLIST PREACONDICIONAMIENTO EN LOTE
// ======================================================================

function renderPrecondBatchView() {
    var el = document.getElementById('kanban-board');
    if (!el) return;

    var vehicles = (db.vehicles || []).filter(function(v) {
        return v.status === 'registered' || v.status === 'in-progress';
    });

    if (vehicles.length === 0) {
        showToast('No hay vehiculos en preacondicionamiento', 'info');
        return;
    }

    // Soak timer data
    var soakData = null;
    try { var raw = localStorage.getItem('kia_soak_timer'); if (raw) soakData = JSON.parse(raw); } catch(e) {}

    var html = '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">';
    html += '<button onclick="renderKanban()" style="background:#334155;color:#f8fafc;border:none;padding:6px 12px;border-radius:8px;font-size:11px;cursor:pointer;">← Kanban</button>';
    html += '<h3 style="margin:0;font-size:16px;">📋 Preacondicionamiento en Lote</h3>';
    html += '<span style="font-size:11px;color:#64748b;">' + vehicles.length + ' vehiculos</span>';
    html += '</div>';

    // Batch actions
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
    html += '<button onclick="batchScheduleTests()" style="background:#10b981;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">🗓 Programar Tests (seleccionados)</button>';
    html += '</div>';

    // Table header
    html += '<div style="overflow-x:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<thead><tr style="background:#f1f5f9;text-align:left;">';
    html += '<th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;width:30px;"><input type="checkbox" id="batch-select-all" onchange="batchToggleAll(this.checked)" style="accent-color:#f59e0b;"></th>';
    html += '<th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;">VIN</th>';
    html += '<th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;">Modelo</th>';
    html += '<th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;">Status</th>';
    html += '<th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;">Precond</th>';
    html += '<th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;">Soak</th>';
    html += '<th style="padding:8px 6px;border-bottom:2px solid #e2e8f0;">Acciones</th>';
    html += '</tr></thead><tbody>';

    vehicles.forEach(function(v) {
        var td = v.testData || {};
        var p = td.preconditioning || {};
        var isEm = typeof isEmissionsPurpose === 'function' ? isEmissionsPurpose(v.purpose) : true;

        // Precond completeness
        var precondFields = isEm ? [p.datetime, p.responsible, p.cycle, p.ok] : [td.simple?.operator, td.simple?.datetime];
        var filled = precondFields.filter(function(f) { return f && f !== ''; }).length;
        var total = precondFields.length;
        var precondPct = Math.round((filled / total) * 100);
        var precondOk = isEm ? (p.ok === 'Si') : (filled === total);

        // Soak status
        var soakStatus = '—';
        var soakColor = '#94a3b8';
        if (soakData && soakData.endTime) {
            var remaining = soakData.endTime - Date.now();
            if (remaining > 0) {
                var hrs = Math.floor(remaining / 3600000);
                var mins = Math.floor((remaining % 3600000) / 60000);
                soakStatus = hrs + 'h ' + mins + 'm';
                soakColor = '#f59e0b';
            } else {
                soakStatus = 'Listo';
                soakColor = '#10b981';
            }
        } else if (p.soakTimeH) {
            soakStatus = p.soakTimeH + 'h (manual)';
            soakColor = '#8b5cf6';
        }

        var model = '';
        if (v.config && v.config['Modelo']) model = v.config['Modelo'];
        else if (v.configCode) model = v.configCode.split(' ').slice(0, 2).join(' ');

        var statusLabel = CONFIG.statusLabels[v.status] || v.status;
        var statusColor = v.status === 'registered' ? '#3b82f6' : '#f59e0b';

        var barColor = precondPct === 100 ? '#10b981' : precondPct >= 50 ? '#f59e0b' : '#ef4444';

        html += '<tr style="border-bottom:1px solid #e2e8f0;" data-vid="' + v.id + '">';
        html += '<td style="padding:8px 6px;"><input type="checkbox" class="batch-check" value="' + v.id + '" style="accent-color:#f59e0b;"></td>';
        html += '<td style="padding:8px 6px;font-weight:600;font-family:monospace;font-size:10px;">' + (v.vin || '').slice(-6) + '</td>';
        html += '<td style="padding:8px 6px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (v.configCode || '') + '">' + model + '</td>';
        html += '<td style="padding:8px 6px;"><span style="font-size:9px;padding:2px 6px;border-radius:4px;background:' + statusColor + '15;color:' + statusColor + ';border:1px solid ' + statusColor + '30;">' + statusLabel + '</span></td>';
        html += '<td style="padding:8px 6px;">';
        html += '<div style="display:flex;align-items:center;gap:4px;">';
        html += '<div style="width:50px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;"><div style="width:' + precondPct + '%;height:100%;background:' + barColor + ';border-radius:3px;"></div></div>';
        html += '<span style="font-size:9px;color:' + barColor + ';">' + filled + '/' + total + '</span>';
        if (precondOk) html += ' <span style="font-size:9px;">✅</span>';
        html += '</div></td>';
        html += '<td style="padding:8px 6px;"><span style="font-size:10px;color:' + soakColor + ';">' + soakStatus + '</span></td>';
        html += '<td style="padding:8px 6px;">';
        if (precondOk) {
            html += '<button onclick="batchAdvanceToTesting(\'' + v.id + '\')" style="background:#10b981;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;" title="Avanzar a Testing">→ Testing</button>';
        } else {
            html += '<button onclick="kanbanGoVehicle(\'' + v.id + '\',\'' + v.status + '\')" style="background:#3b82f6;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:10px;cursor:pointer;" title="Editar vehiculo">Editar</button>';
        }
        html += '</td></tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;
}

function batchToggleAll(checked) {
    document.querySelectorAll('.batch-check').forEach(function(cb) { cb.checked = checked; });
}

function batchAdvanceToTesting(vehicleId) {
    var vehicle = db.vehicles.find(function(v) { return v.id == vehicleId; });
    if (!vehicle) return;

    vehicle.status = 'testing';
    vehicle.timeline = vehicle.timeline || [];
    vehicle.timeline.push({
        timestamp: new Date().toISOString(),
        user: vehicle.testData?.operator || vehicle.testData?.testResponsible || 'Sistema',
        action: 'Auto-avance lote a: En Prueba',
        data: { status: 'testing', batchAdvance: true }
    });

    // Auto-fill test datetime
    if (vehicle.testData && !vehicle.testData.testDatetime) {
        var tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2);
        vehicle.testData.testDatetime = tomorrow.toISOString().slice(0, 10) + 'T08:00';
    }

    saveDB();
    renderPrecondBatchView();
    showToast('VIN ...' + (vehicle.vin || '').slice(-6) + ' avanzado a Testing', 'success');
}

function batchScheduleTests() {
    var checked = document.querySelectorAll('.batch-check:checked');
    if (checked.length === 0) { showToast('Selecciona al menos un vehiculo', 'warning'); return; }

    var ids = [];
    checked.forEach(function(cb) { ids.push(cb.value); });

    // Schedule sequentially: 8:00, 10:00, 12:00, 14:00...
    var baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + 1);
    if (baseDate.getDay() === 0) baseDate.setDate(baseDate.getDate() + 1);
    if (baseDate.getDay() === 6) baseDate.setDate(baseDate.getDate() + 2);

    var advancedCount = 0;
    ids.forEach(function(id, idx) {
        var vehicle = db.vehicles.find(function(v) { return v.id == id; });
        if (!vehicle) return;

        var p = vehicle.testData?.preconditioning || {};
        var precondOk = p.ok === 'Si';
        if (!precondOk) return; // Only advance precond-complete vehicles

        var hour = 8 + (idx * 2); // 8, 10, 12, 14...
        var dateStr = baseDate.toISOString().slice(0, 10) + 'T' + String(hour).padStart(2, '0') + ':00';

        vehicle.status = 'testing';
        vehicle.testData = vehicle.testData || {};
        vehicle.testData.testDatetime = dateStr;
        vehicle.timeline = vehicle.timeline || [];
        vehicle.timeline.push({
            timestamp: new Date().toISOString(),
            user: 'Sistema',
            action: 'Programado en lote: Testing ' + dateStr,
            data: { status: 'testing', batchSchedule: true, scheduledTime: dateStr }
        });
        advancedCount++;
    });

    if (advancedCount > 0) {
        saveDB();
        renderPrecondBatchView();
        showToast(advancedCount + ' vehiculos programados para testing', 'success');
    } else {
        showToast('Ningun vehiculo seleccionado tiene precond completo', 'warning');
    }
}

function kanbanGoVehicle(vehicleId, status) {
    var v = db.vehicles.find(function(x) { return x.id == vehicleId; });
    if (!v) return;

    if (status === 'ready-release') {
        // Go to release tab
        document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
        document.querySelector('[data-tab="liberacion"]').classList.add('active');
        document.getElementById('panel-liberacion').classList.add('active');
        var sel = document.getElementById('releaseVehSelect');
        if (sel) { sel.value = vehicleId; sel.dispatchEvent(new Event('change')); }
    } else {
        // Go to operation tab
        document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
        document.querySelector('[data-tab="seguimiento"]').classList.add('active');
        document.getElementById('panel-seguimiento').classList.add('active');
        var sel = document.getElementById('activeVehSelect');
        if (sel) { sel.value = vehicleId; sel.dispatchEvent(new Event('change')); }
    }
}

// ══════════════════════════════════════════════════════════════════════
// [R5-M3] Smart Forms — Progressive Disclosure & Contextual Intelligence
// ══════════════════════════════════════════════════════════════════════

/**
 * Show/hide accordion sections based on current vehicle status.
 * Locked sections show a visual indicator of when they'll unlock.
 */
function smartFormApplyByStatus(status) {
    var sections = [
        { id: 'acc-recepcion', unlockAt: null },
        { id: 'acc-precond', unlockAt: 'in-progress' },
        { id: 'acc-dyno', unlockAt: 'in-progress' }
    ];
    var statusOrder = ['registered', 'in-progress', 'testing', 'ready-release'];
    var currentIdx = statusOrder.indexOf(status);

    sections.forEach(function(sec) {
        var el = document.getElementById(sec.id);
        if (!el) return;

        // Remove any previous lock state
        el.classList.remove('smart-locked');
        var oldHint = el.querySelector('.smart-lock-hint');
        if (oldHint) oldHint.remove();

        if (!sec.unlockAt) return;

        var unlockIdx = statusOrder.indexOf(sec.unlockAt);
        if (currentIdx >= unlockIdx) return; // unlocked — nothing to do

        // Lock this section
        el.classList.add('smart-locked');
        var hint = document.createElement('div');
        hint.className = 'smart-lock-hint';
        hint.innerHTML = '🔒 Se desbloquea en: ' + sec.unlockAt;
        el.appendChild(hint);
    });

    // test-verify-card visibility is managed by updateTestVerificationVisibility()
    updateTestVerificationVisibility();
}

/**
 * Update completion badges on accordion section headers.
 */
function smartFormUpdateBadges() {
    if (!_reviewSections) return;
    _reviewSections.forEach(function(sec) {
        var total = 0, filled = 0;
        sec.fields.forEach(function(f) {
            var el = document.getElementById(f.id);
            if (!el) return;
            total++;
            if (el.value && el.value !== '') filled++;
        });
        // Find the section's accordion summary
        var accIds = { 'Recepción': 'acc-recepcion', 'Preacondicionamiento': 'acc-precond', 'Dinamómetro': 'acc-dyno', 'Verificación': 'test-verify-card' };
        var accId = accIds[sec.title];
        if (!accId) return;
        var accEl = document.getElementById(accId);
        if (!accEl) return;
        var summary = accEl.querySelector('summary');
        if (!summary) return;

        var badge = summary.querySelector('.smart-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'smart-badge';
            summary.appendChild(badge);
        }

        badge.textContent = filled + '/' + total;
        badge.classList.toggle('smart-badge-complete', filled === total && total > 0);
        badge.classList.toggle('smart-badge-partial', filled > 0 && filled < total);
        badge.classList.toggle('smart-badge-empty', filled === 0);
    });
}

/**
 * Suggest smart defaults for common fields based on context.
 */
function smartFormSuggestDefaults(vehicle) {
    if (!vehicle) return;
    var isEm = isEmissionsPurpose(vehicle.purpose);
    if (!isEm) return;

    // Precond datetime quick buttons
    var precondEl = document.getElementById('precond_datetime');
    if (precondEl && !precondEl.value) {
        var container = precondEl.parentElement;
        if (container && !container.querySelector('.smart-quick-btns')) {
            var wrapper = document.createElement('div');
            wrapper.className = 'smart-quick-btns';

            var btnYesterday = document.createElement('button');
            btnYesterday.type = 'button';
            btnYesterday.className = 'smart-quick-btn';
            btnYesterday.textContent = 'Ayer 6AM';
            btnYesterday.onclick = function() {
                var d = new Date(); d.setDate(d.getDate() - 1); d.setHours(6, 0, 0, 0);
                precondEl.value = d.toISOString().slice(0, 16);
                markUnsaved();
                wrapper.remove();
            };

            var btnNow = document.createElement('button');
            btnNow.type = 'button';
            btnNow.className = 'smart-quick-btn';
            btnNow.textContent = 'Ahora';
            btnNow.onclick = function() {
                precondEl.value = new Date().toISOString().slice(0, 16);
                markUnsaved();
                wrapper.remove();
            };

            wrapper.appendChild(btnYesterday);
            wrapper.appendChild(btnNow);
            container.appendChild(wrapper);
        }
    }

    // Auto-fill from CSV_CONFIGURATIONS if unique values exist
    if (vehicle.config) {
        var etw = vehicle.config['ETW'] || vehicle.config['etw'];
        var tA = vehicle.config['Target A'] || vehicle.config['targetA'];
        var tB = vehicle.config['Target B'] || vehicle.config['targetB'];
        var tC = vehicle.config['Target C'] || vehicle.config['targetC'];
        var dynoFields = [
            { id: 'etw', val: etw },
            { id: 'tA', val: tA },
            { id: 'tB', val: tB },
            { id: 'tC', val: tC }
        ];
        dynoFields.forEach(function(df) {
            if (!df.val) return;
            var el = document.getElementById(df.id);
            if (el && !el.value) {
                el.value = df.val;
                el.style.color = '#94a3b8';
                el.title = 'Auto-llenado desde configuración';
                el.addEventListener('focus', function handler() {
                    el.style.color = '';
                    el.removeEventListener('focus', handler);
                }, { once: true });
            }
        });
    }

    // Pre-fill from last vehicle with same config (safe fields only)
    var candidates = db.vehicles.filter(function(v) {
        return v.id !== vehicle.id && v.configCode === vehicle.configCode &&
               (v.status === 'archived' || v.status === 'ready-release') && v.testData;
    }).sort(function(a, b) {
        return new Date(b.lastModified || b.registeredAt) - new Date(a.lastModified || a.registeredAt);
    });

    if (candidates.length > 0) {
        var source = candidates[0];
        var td = source.testData || {};
        var p = td.preconditioning || {};
        var tv = td.testVerification || {};

        // Safe fields that rarely change between same-config vehicles
        var safeFields = [
            { id: 'test_fan_mode', val: tv.fanMode },
            { id: 'test_chains', val: tv.chains },
            { id: 'test_slings', val: tv.slings },
            { id: 'test_hood', val: tv.hood },
            { id: 'test_rear_rollers', val: tv.rearRollers },
            { id: 'test_screen', val: tv.screen }
        ];

        var applied = 0;
        safeFields.forEach(function(sf) {
            if (!sf.val) return;
            var el = document.getElementById(sf.id);
            if (el && !el.value) {
                el.value = sf.val;
                applied++;
            }
        });

        if (applied > 0) {
            // Show inline banner instead of modal
            var opContent = document.getElementById('op-content');
            if (opContent && !opContent.querySelector('.smart-copy-banner')) {
                var banner = document.createElement('div');
                banner.className = 'smart-copy-banner';
                var shortVin = '...' + source.vin.slice(-6);
                banner.innerHTML = '<span>Se aplicaron ' + applied + ' campos del último ' +
                    escapeHtml(source.config && source.config.Modelo || 'vehículo') +
                    ' (VIN ' + shortVin + ')</span>' +
                    '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:14px;padding:0 4px;">✕</button>';
                opContent.insertBefore(banner, opContent.firstChild);
                setTimeout(function() { if (banner.parentNode) banner.remove(); }, 8000);
            }
        }
    }
}

// Hook into loadVehicle to apply smart form features
(function() {
    var _origLoadVehicle = typeof loadVehicle === 'function' ? loadVehicle : null;
    if (!_origLoadVehicle) return;
    loadVehicle = function() {
        _origLoadVehicle.apply(this, arguments);
        // Apply smart features after vehicle loads
        if (activeVehicleId) {
            var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
            if (vehicle) {
                var status = document.getElementById('op_status');
                if (status) smartFormApplyByStatus(status.value);
                smartFormSuggestDefaults(vehicle);
                smartFormUpdateBadges();
            }
        }
    };
})();

// Update badges when fields change
(function() {
    var container = document.getElementById('op-content');
    if (container) {
        container.addEventListener('input', debounce(smartFormUpdateBadges, 500));
        container.addEventListener('change', smartFormUpdateBadges);
    }
})();

// ══════════════════════════════════════════════════════════════════════
// [R5-M8] Templates — COP15 Operation Templates
// ══════════════════════════════════════════════════════════════════════

/** Collect current operation form data as a template-ready object. */
function cop15TemplateCollect() {
    var data = {};
    var fields = ['tire_pressure', 'fuel_typein', 'fuel_typepre', 'precond_cycle',
        'soak_time', 'tank_capacity', 'test_tunnel', 'test_dyno_on', 'test_fan_mode',
        'test_fan_speed', 'test_fan_flow', 'test_chains', 'test_slings', 'test_hood',
        'test_rear_rollers', 'test_screen', 'etw', 'tA', 'dA', 'tB', 'dB', 'tC', 'dC'];
    fields.forEach(function(fid) {
        var el = document.getElementById(fid);
        if (el && el.value) data[fid] = el.value;
    });
    return data;
}

/** Apply template data to the current operation form. */
function cop15TemplateApplyData(data) {
    if (!data) return;
    Object.keys(data).forEach(function(fid) {
        var el = document.getElementById(fid);
        if (el) {
            el.value = data[fid];
            el.style.outline = '2px dashed #8b5cf6';
            el.style.outlineOffset = '2px';
            setTimeout(function() { el.style.outline = ''; el.style.outlineOffset = ''; }, 3000);
        }
    });
    markUnsaved();
    showToast('Plantilla aplicada', 'success');
}

/** Save current operation as a named template. */
function cop15TemplateSave() {
    var data = cop15TemplateCollect();
    if (Object.keys(data).length < 3) {
        showToast('Muy pocos campos para guardar como plantilla', 'warning');
        return;
    }
    var vehicle = db.vehicles.find(function(v) { return v.id == activeVehicleId; });
    var defaultName = vehicle && vehicle.config ? (vehicle.config.Modelo || '') + ' ' + (vehicle.config['EMISSION REGULATION'] || '') : 'Plantilla';
    var name = prompt('Nombre de la plantilla:', defaultName.trim());
    if (!name) return;
    templateSave('cop15', name, data);
}

/** Show COP15 template manager. */
function cop15TemplateManager() {
    templateRenderManager('cop15', 'cop15TemplateApplyData');
}

// ======================================================================
// [TOOLTIPS] CASCADE FIELD HELP TOOLTIPS
// ======================================================================

/** Tooltip definitions: { domFieldId: { title, text } } */
var CASCADE_TOOLTIPS = {
    vehiclePurpose: {
        title: 'Prop\u00f3sito de la Prueba',
        text: 'Emisiones = protocolo completo COP15 con preacondicionamiento, dinam\u00f3metro y verificaci\u00f3n. Simple = registro operativo b\u00e1sico sin prueba de emisiones. Determina qu\u00e9 formularios se muestran.'
    },
    vin: {
        title: 'VIN (N\u00famero de Identificaci\u00f3n Vehicular)',
        text: '17 caracteres alfanum\u00e9ricos \u00fanicos. No se permiten las letras I, O ni Q porque se confunden con 1 y 0. Ejemplo: KNDJP3A59K7123456.'
    },
    fuel_levelin: {
        title: 'Nivel de Combustible (Recepci\u00f3n)',
        text: 'Nivel como fracci\u00f3n de la capacidad del tanque: 0 = vac\u00edo, 1/8, 1/4, 1/2, 3/4, 1 = lleno. Se mide visualmente al recibir el veh\u00edculo.'
    },
    fuel_levelpre: {
        title: 'Nivel de Combustible (Preacondicionamiento)',
        text: 'Nivel de combustible en LITROS (no fracci\u00f3n). Diferente a la medici\u00f3n de recepci\u00f3n que usa fracciones del tanque.'
    },
    fuel_typepre: {
        title: 'Tipo de Combustible de Prueba',
        text: 'El combustible debe coincidir con el est\u00e1ndar regulatorio del veh\u00edculo. Cada norma (Euro 6, CARB LEV III, EPA Tier) requiere una composici\u00f3n espec\u00edfica de combustible certificado.'
    },
    battery_soc: {
        title: 'SOC — Estado de Carga de Bater\u00eda',
        text: 'SOC = State of Charge. Porcentaje de carga de la bater\u00eda (0-100%). Aplica para veh\u00edculos h\u00edbridos y el\u00e9ctricos. Se mide con esc\u00e1ner OBD antes de la prueba.'
    },
    tire_pressure_in: {
        title: 'Presi\u00f3n de Llantas (PSI)',
        text: 'Presi\u00f3n en PSI (libras por pulgada cuadrada). Conversi\u00f3n: 1 bar \u2248 14.5 psi, 1 kPa \u2248 0.145 psi. Verificar contra la etiqueta del veh\u00edculo.'
    },
    precond_cycle: {
        title: 'Ciclo de Preacondicionamiento',
        text: 'WLTP = Procedimiento Armonizado Mundial para Veh\u00edculos Ligeros. FTP = Procedimiento Federal de Prueba (fases 1 y 2). NEDC = Nuevo Ciclo Europeo de Conducci\u00f3n. Cada uno define un patr\u00f3n de conducci\u00f3n espec\u00edfico.'
    },
    soak_time: {
        title: 'Tiempo de Reposo (Soak)',
        text: 'Tiempo que el veh\u00edculo permanece en reposo t\u00e9rmico en la c\u00e1mara climatizada antes de la prueba. M\u00ednimo 12 horas est\u00e1ndar.'
    },
    precond_ok: {
        title: 'Cumple Preacondicionamiento',
        text: 'Confirmar que el veh\u00edculo cumple TODOS los requisitos: temperatura estabilizada (20-30\u00b0C), tiempo de reposo completado, sin DTCs activos, nivel de combustible correcto.'
    },
    dtc_pending_before: {
        title: 'DTC Pendiente',
        text: 'DTC = C\u00f3digo de Falla Diagn\u00f3stica (Diagnostic Trouble Code). Pendiente = falla almacenada en la ECU del veh\u00edculo pero a\u00fan no confirmada. Se verifica con esc\u00e1ner OBD.'
    },
    dtc_confirmed_before: {
        title: 'DTC Confirmado',
        text: 'DTC Confirmado = falla que ha ocurrido m\u00faltiples veces y cumple los criterios para encender la luz MIL (Check Engine). El veh\u00edculo NO debe tener DTCs confirmados para iniciar prueba.'
    },
    dtc_permanent_before: {
        title: 'DTC Permanente',
        text: 'DTC Permanente = falla que persiste despu\u00e9s de 40+ ciclos de calentamiento sin poder borrarse. Si existe, el veh\u00edculo no es apto para prueba de emisiones.'
    },
    etw: {
        title: 'ETW — Peso Estimado de Prueba',
        text: 'ETW = Estimated Test Weight. Es la masa del veh\u00edculo que el dinam\u00f3metro usa para simular la inercia y resistencia al rodamiento durante la prueba de emisiones. Se obtiene de la hoja de datos del veh\u00edculo.'
    },
    tA: {
        title: 'Target A / Dyno Set A',
        text: 'Coeficientes de resistencia al avance del veh\u00edculo. Target = valores te\u00f3ricos calculados. Dyno Set = valores configurados en el dinam\u00f3metro. A = fuerza constante (N), B = resistencia proporcional a velocidad, C = resistencia aerodin\u00e1mica (proporcional a v\u00b2). Deben coincidir para una prueba v\u00e1lida.'
    },
    dA: {
        title: 'Target A / Dyno Set A',
        text: 'Coeficientes de resistencia al avance del veh\u00edculo. Target = valores te\u00f3ricos calculados. Dyno Set = valores configurados en el dinam\u00f3metro. A = fuerza constante (N), B = resistencia proporcional a velocidad, C = resistencia aerodin\u00e1mica (proporcional a v\u00b2). Deben coincidir para una prueba v\u00e1lida.'
    },
    tB: {
        title: 'Target B / Dyno Set B',
        text: 'Coeficiente B de resistencia al avance. Proporcional a la velocidad (N/(km/h)). Target = valor te\u00f3rico, Dyno Set = valor configurado en el dinam\u00f3metro.'
    },
    dB: {
        title: 'Target B / Dyno Set B',
        text: 'Coeficiente B de resistencia al avance. Proporcional a la velocidad (N/(km/h)). Target = valor te\u00f3rico, Dyno Set = valor configurado en el dinam\u00f3metro.'
    },
    tC: {
        title: 'Target C / Dyno Set C',
        text: 'Coeficiente C de resistencia aerodin\u00e1mica. Proporcional al cuadrado de la velocidad (N/(km/h)\u00b2). Target = valor te\u00f3rico, Dyno Set = valor configurado en el dinam\u00f3metro.'
    },
    dC: {
        title: 'Target C / Dyno Set C',
        text: 'Coeficiente C de resistencia aerodin\u00e1mica. Proporcional al cuadrado de la velocidad (N/(km/h)\u00b2). Target = valor te\u00f3rico, Dyno Set = valor configurado en el dinam\u00f3metro.'
    },
    test_tunnel: {
        title: 'T\u00fanel de Prueba',
        text: 'C\u00e1mara f\u00edsica de pruebas de emisiones. RMT1 y RMT2 son las dos bah\u00edas (t\u00faneles) de prueba disponibles en el laboratorio. Cada t\u00fanel tiene su propio dinam\u00f3metro y sistema de muestreo de gases.'
    },
    test_chains: {
        title: 'Cadenas de Amarre',
        text: 'Cadenas de sujeci\u00f3n (1 y 2) que amarran el veh\u00edculo a la plataforma del dinam\u00f3metro para evitar deslizamiento durante la prueba. Deben estar TENSADAS antes de iniciar.'
    },
    test_slings: {
        title: 'Eslingas de Sujeci\u00f3n',
        text: 'Eslingas (1 y 2): cintas de soporte que estabilizan el veh\u00edculo verticalmente sobre los rodillos del dinam\u00f3metro. Deben estar ASEGURADAS antes de la prueba.'
    },
    test_hood: {
        title: 'Cap\u00f3 del Veh\u00edculo',
        text: 'En M\u00e9xico es OBLIGATORIO mantener el cap\u00f3 abierto durante la prueba de emisiones para permitir ventilaci\u00f3n adecuada del motor.'
    },
    test_rear_rollers: {
        title: 'Rodillos Traseros',
        text: 'Rodillos traseros del dinam\u00f3metro que hacen contacto con las ruedas traseras del veh\u00edculo. Deben estar asegurados para evitar movimiento lateral.'
    },
    test_screen: {
        title: 'Pantalla Protectora',
        text: 'Pantalla/barrera de protecci\u00f3n que se coloca frente al veh\u00edculo durante la prueba en el dinam\u00f3metro. Debe estar asegurada por seguridad del personal.'
    },
    test_fan_speed: {
        title: 'Velocidad del Ventilador',
        text: 'Velocidad del ventilador de enfriamiento en km/h equivalentes (velocidad del aire). Se calcula autom\u00e1ticamente el flujo en m\u00b3/min.'
    },
    test_fan_flow: {
        title: 'Flujo del Ventilador',
        text: 'Flujo de aire del ventilador de enfriamiento en m\u00b3/min (metros c\u00fabicos por minuto). En M\u00e9xico el l\u00edmite m\u00e1ximo permitido es 150 m\u00b3/min.'
    },
    test_mex_waitcheck: {
        title: 'Verificaci\u00f3n FTP75-HWY (M\u00e9xico)',
        text: 'Verificaci\u00f3n espec\u00edfica para M\u00e9xico del ciclo combinado FTP75 (ciclo ciudad) + HWY (ciclo carretera). El ventilador debe estar APAGADO al inicio. Confirma cumplimiento regulatorio mexicano.'
    },
    test_inertia_ok: {
        title: 'Par\u00e1metros de Inercia',
        text: 'Confirmar que los par\u00e1metros de inercia (masa simulada) est\u00e1n correctamente configurados en el dinam\u00f3metro y coinciden con el peso objetivo (ETW) del veh\u00edculo.'
    },
    soak_timer_hours: {
        title: 'Duraci\u00f3n del Temporizador de Reposo',
        text: 'Tiempo de reposo t\u00e9rmico (soak). 12h = est\u00e1ndar m\u00ednimo, 16h = recomendado para climas fr\u00edos, 24-36h = pruebas especiales o normativas estrictas.'
    }
};

/** Inject ? help buttons next to labels of fields that have tooltips */
function cascadeInjectTooltips() {
    // Guard: CASCADE_TOOLTIPS may not be initialized yet during script load
    if (typeof CASCADE_TOOLTIPS === 'undefined' || !CASCADE_TOOLTIPS) return;

    // Remove existing tooltip buttons first
    document.querySelectorAll('.cascade-help-btn').forEach(function(btn) { btn.remove(); });

    Object.keys(CASCADE_TOOLTIPS).forEach(function(fieldId) {
        var field = document.getElementById(fieldId);
        if (!field) return;

        // Find the label: either a <label> pointing to this field, or the nearest preceding label
        var label = document.querySelector('label[for="' + fieldId + '"]');
        if (!label) {
            // Walk up to find form-group then find label inside
            var parent = field.closest('.form-group') || field.parentElement;
            if (parent) label = parent.querySelector('label');
        }
        if (!label) return;

        // Don't double-inject
        if (label.querySelector('.cascade-help-btn')) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cascade-help-btn';
        btn.textContent = '?';
        btn.setAttribute('aria-label', 'Ayuda: ' + CASCADE_TOOLTIPS[fieldId].title);
        btn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            cascadeShowTooltip(fieldId);
        };
        label.appendChild(btn);
    });
}

/** Show a tooltip popup for the given field */
function cascadeShowTooltip(fieldId) {
    var tip = CASCADE_TOOLTIPS[fieldId];
    if (!tip) return;

    // Remove existing
    cascadeCloseTooltip();

    // Overlay
    var overlay = document.createElement('div');
    overlay.className = 'cascade-tooltip-overlay';
    overlay.id = 'cascade-tooltip-overlay';
    overlay.onclick = cascadeCloseTooltip;

    // Popup
    var popup = document.createElement('div');
    popup.className = 'cascade-tooltip-popup';
    popup.id = 'cascade-tooltip-popup';
    popup.innerHTML =
        '<div class="cascade-tooltip-title">\u2753 ' + tip.title + '</div>' +
        '<div class="cascade-tooltip-text">' + tip.text + '</div>' +
        '<button class="cascade-tooltip-close" onclick="cascadeCloseTooltip()">Entendido</button>';

    document.body.appendChild(overlay);
    document.body.appendChild(popup);
}

/** Close the tooltip popup */
function cascadeCloseTooltip() {
    var overlay = document.getElementById('cascade-tooltip-overlay');
    var popup = document.getElementById('cascade-tooltip-popup');
    if (overlay) overlay.remove();
    if (popup) popup.remove();
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-D1] NEXT STEP ENGINE — Guided Workflow                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

function getNextStep(vehicle) {
    if (!vehicle || vehicle.status === 'archived') return null;
    var td = vehicle.testData || {};
    var p = td.preconditioning || {};
    var status = vehicle.status;

    // Check soak status
    var soakDone = false;
    try {
        var soakData = JSON.parse(localStorage.getItem('kia_soak_timer'));
        if (soakData && soakData.endTime && soakData.endTime <= Date.now()) soakDone = true;
        if (td.soakCompleted) soakDone = true;
    } catch(e) {}
    var soakStarted = false;
    try {
        var sd = JSON.parse(localStorage.getItem('kia_soak_timer'));
        if (sd && sd.endTime) soakStarted = true;
    } catch(e) {}

    var precondComplete = p.ok === 'Si' && p.datetime && p.responsible;
    var testStarted = td.testResponsible || td.testDatetime;
    var tv = td.testVerification || {};
    var testComplete = tv.tunnel && tv.dyno && tv.fanMode && td.testResponsible && td.testDatetime;

    if (status === 'registered') {
        return { action: 'Iniciar Precondicionamiento', goto: 'acc-precond', icon: '🔧' };
    }
    if (status === 'in-progress' && precondComplete && !soakStarted) {
        return { action: 'Iniciar Soak Timer', goto: 'soak-section', icon: '⏱️' };
    }
    if (status === 'in-progress' && precondComplete && soakStarted && !soakDone) {
        return { action: 'Soak en curso...', goto: 'soak-section', icon: '⏱️' };
    }
    if (status === 'in-progress' && soakDone && !testStarted) {
        return { action: 'Iniciar Prueba de Emisiones', goto: 'acc-dyno', icon: '🏭' };
    }
    if (status === 'testing' && !testComplete) {
        return { action: 'Completar Verificacion de Prueba', goto: 'acc-testverify', icon: '🏭' };
    }
    if (status === 'testing' && testComplete) {
        return { action: 'Verificar y Liberar', goto: 'release-tab', icon: '✅' };
    }
    if (status === 'ready-release') {
        return { action: 'Liberar Vehiculo', goto: 'release-action', icon: '🚗' };
    }
    return null;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-D3] SOAK COMPLETE MODAL                                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7ShowSoakCompleteModal() {
    var soakVin = '';
    try {
        var sd = JSON.parse(localStorage.getItem('kia_soak_timer'));
        if (sd && sd.vin) soakVin = sd.vin;
    } catch(e) {}
    if (!soakVin) {
        // Try to find from active vehicle
        if (activeVehicleId) {
            var v = (db.vehicles || []).find(function(vv) { return vv.id == activeVehicleId; });
            if (v) soakVin = v.vin ? '...' + v.vin.slice(-4) : '';
        }
    }

    var overlay = document.createElement('div');
    overlay.className = 'cascade-tooltip-overlay';
    overlay.id = 'v7-soak-modal-overlay';
    overlay.onclick = function() { v7CloseSoakModal(); };

    var modal = document.createElement('div');
    modal.className = 'v7-soak-modal';
    modal.id = 'v7-soak-modal';
    modal.innerHTML =
        '<div class="v7-soak-modal-icon">⏱️</div>' +
        '<div class="v7-soak-modal-title">Soak Completado!</div>' +
        '<div class="v7-soak-modal-text">VIN ' + soakVin + ' esta listo para prueba.</div>' +
        '<div class="v7-soak-modal-actions">' +
        '<button class="btn btn-primary" onclick="v7GoToTestForm()">Ir a Formulario de Prueba</button>' +
        '<button class="btn btn-ghost" onclick="v7CloseSoakModal()">Despues</button>' +
        '</div>';
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    setTimeout(function() { modal.classList.add('show'); }, 50);
}

function v7CloseSoakModal() {
    var overlay = document.getElementById('v7-soak-modal-overlay');
    var modal = document.getElementById('v7-soak-modal');
    if (modal) modal.classList.remove('show');
    setTimeout(function() {
        if (overlay) overlay.remove();
        if (modal) modal.remove();
    }, 300);
}

function v7GoToTestForm() {
    v7CloseSoakModal();
    if (activeVehicleId) {
        var acc = document.getElementById('acc-dyno');
        if (acc) {
            if (acc.tagName === 'DETAILS') acc.open = true;
            acc.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function() {
                var firstInput = acc.querySelector('input,select');
                if (firstInput) firstInput.focus();
            }, 400);
        }
    }
}

function v7CheckExpiredSoak() {
    try {
        var sd = JSON.parse(localStorage.getItem('kia_soak_timer'));
        if (sd && sd.endTime && sd.endTime <= Date.now() && !sd._v7notified) {
            sd._v7notified = true;
            localStorage.setItem('kia_soak_timer', JSON.stringify(sd));
            setTimeout(function() { v7ShowSoakCompleteModal(); }, 1000);
        }
    } catch(e) {}
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-D4] POST-RELEASE QUICK ACTIONS                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7ShowPostReleaseActions(vinShort) {
    var existing = document.getElementById('v7-post-release');
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.className = 'v7-post-release show';
    bar.id = 'v7-post-release';
    bar.innerHTML =
        '<div class="v7-post-release-text">✅ VIN ' + vinShort + ' liberado exitosamente.</div>' +
        '<div class="v7-post-release-actions">' +
        '<button class="btn btn-sm btn-primary" onclick="v7PostReleaseRegisterAnother()">Registrar Otro</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="switchPlatform(\'testplan\');v7ClosePostRelease();">Ver en Plan</button>' +
        '<button class="btn btn-sm btn-ghost" onclick="switchPlatform(\'today\');v7ClosePostRelease();">Ir a Dashboard</button>' +
        '</div>';
    document.body.appendChild(bar);
    setTimeout(function() { bar.classList.add('visible'); }, 50);
    // Auto dismiss after 15s
    setTimeout(function() { v7ClosePostRelease(); }, 15000);
}

function v7ClosePostRelease() {
    var el = document.getElementById('v7-post-release');
    if (el) { el.classList.remove('visible'); setTimeout(function() { el.remove(); }, 300); }
}

function v7PostReleaseRegisterAnother() {
    v7ClosePostRelease();
    var tabEl = document.querySelector('.tab[data-tab="alta"]');
    if (tabEl) tabEl.click();
    setTimeout(function() {
        var purposeEl = document.getElementById('vehiclePurpose');
        if (purposeEl) purposeEl.focus();
    }, 300);
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-C2] PER-FIELD AUTO-SAVE DRAFT                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7SaveDraft(vehicleId) {
    if (!vehicleId) return;
    var fields = {};
    var formFields = document.querySelectorAll('#op-content input, #op-content select, #op-content textarea');
    formFields.forEach(function(f) {
        if (f.id && f.value) fields[f.id] = f.value;
    });
    if (Object.keys(fields).length === 0) return;
    try {
        localStorage.setItem('kia_cop15_draft_' + vehicleId, JSON.stringify({ fields: fields, ts: Date.now() }));
    } catch(e) {}
}

function v7RestoreDraft(vehicleId) {
    if (!vehicleId) return;
    try {
        var raw = localStorage.getItem('kia_cop15_draft_' + vehicleId);
        if (!raw) return;
        var draft = JSON.parse(raw);
        if (!draft || !draft.fields) return;
        // Only restore if less than 24h old
        if (Date.now() - draft.ts > 86400000) {
            localStorage.removeItem('kia_cop15_draft_' + vehicleId);
            return;
        }
        var restored = 0;
        Object.keys(draft.fields).forEach(function(fid) {
            var el = document.getElementById(fid);
            if (el && !el.value && draft.fields[fid]) {
                el.value = draft.fields[fid];
                restored++;
            }
        });
        if (restored > 0) {
            var banner = document.createElement('div');
            banner.className = 'v7-draft-banner';
            banner.innerHTML = 'Se restauraron ' + restored + ' campos guardados ' +
                '<button class="btn btn-sm btn-ghost" onclick="v7DiscardDraft(' + vehicleId + ');this.parentElement.remove();">Descartar</button>';
            var opContent = document.getElementById('op-content');
            if (opContent) opContent.insertBefore(banner, opContent.firstChild);
            // Auto-dismiss after 8s
            setTimeout(function() { if (banner.parentNode) banner.remove(); }, 8000);
        }
    } catch(e) { console.warn('v7RestoreDraft error:', e); }
}

function v7DiscardDraft(vehicleId) {
    localStorage.removeItem('kia_cop15_draft_' + vehicleId);
    // Reload to clear restored fields
    if (typeof loadVehicle === 'function') loadVehicle();
}

// Hook: auto-save draft on focusout (piggyback on existing unsaved tracking)
(function() {
    document.addEventListener('focusout', function(e) {
        if (activeVehicleId && e.target.closest && e.target.closest('#op-content')) {
            v7SaveDraft(activeVehicleId);
        }
    }, true);
})();

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-E1] QUICK-PICK PURPOSE                                         ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7TrackPurposeUsage(purpose) {
    if (!purpose) return;
    try {
        var history = JSON.parse(localStorage.getItem('kia_purpose_history') || '[]');
        // Move to front
        history = history.filter(function(p) { return p !== purpose; });
        history.unshift(purpose);
        if (history.length > 5) history = history.slice(0, 5);
        localStorage.setItem('kia_purpose_history', JSON.stringify(history));
    } catch(e) {}
}

function v7RenderQuickPicks() {
    var container = document.getElementById('v7-quick-picks');
    if (!container) return;
    try {
        var history = JSON.parse(localStorage.getItem('kia_purpose_history') || '[]');
        if (history.length === 0) { container.style.display = 'none'; return; }
        container.style.display = 'flex';
        container.innerHTML = '';
        history.slice(0, 3).forEach(function(p) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'v7-quick-chip';
            chip.textContent = p;
            chip.onclick = function() {
                var sel = document.getElementById('vehiclePurpose');
                if (sel) {
                    sel.value = p;
                    sel.dispatchEvent(new Event('change'));
                }
            };
            container.appendChild(chip);
        });
    } catch(e) {}
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-E2] SMART CONFIG SUGGESTION + [V7-E3] FAVORITES                ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7TrackConfigUsage(configCode, config) {
    if (!configCode || configCode === 'MANUAL') return;
    try {
        var ranking = JSON.parse(localStorage.getItem('kia_config_ranking') || '{}');
        if (!ranking[configCode]) ranking[configCode] = { count: 0, config: config, label: configCode };
        ranking[configCode].count++;
        ranking[configCode].config = config;
        localStorage.setItem('kia_config_ranking', JSON.stringify(ranking));
    } catch(e) {}
}

function v7RenderSmartConfigs() {
    var container = document.getElementById('v7-smart-configs');
    if (!container) return;
    try {
        var ranking = JSON.parse(localStorage.getItem('kia_config_ranking') || '{}');
        var sorted = Object.keys(ranking).map(function(k) { return ranking[k]; })
            .sort(function(a, b) { return b.count - a.count; });
        if (sorted.length === 0) { container.style.display = 'none'; return; }
        container.style.display = 'block';
        var html = '<div class="v7-smart-configs-title">Configuraciones frecuentes:</div><div class="v7-smart-configs-list">';
        sorted.slice(0, 5).forEach(function(item) {
            var label = item.label;
            if (label.length > 35) label = label.substring(0, 35) + '...';
            html += '<button type="button" class="v7-config-chip" onclick="v7ApplySmartConfig(\'' + _escapeHtml(item.label) + '\')">' +
                label + ' <span class="v7-config-count">(' + item.count + ')</span></button>';
        });
        html += '</div>';
        container.innerHTML = html;
    } catch(e) {}
}

function _escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function v7ApplySmartConfig(configCode) {
    // Find matching configuration and auto-fill cascade
    var match = allConfigurations.find(function(c) { return c.codigo_config_text === configCode; });
    if (!match) { showToast('Configuracion no encontrada en catálogo', 'warning'); return; }
    // Reset and apply all filters
    currentFilters = {};
    Object.keys(fieldMapping).forEach(function(csvField) {
        if (match[csvField]) {
            currentFilters[csvField] = match[csvField];
            var sel = document.getElementById(fieldMapping[csvField]);
            if (sel) { sel.value = match[csvField]; sel.classList.add('selected'); }
        }
    });
    var filtered = allConfigurations.filter(function(c) {
        for (var f in currentFilters) { if (c[f] !== currentFilters[f]) return false; }
        return true;
    });
    updateSelectOptions(filtered);
    document.getElementById('configCount').textContent = filtered.length;
    displayConfigResult(filtered);
    showToast('Configuracion aplicada: ' + configCode, 'success');
}

function v7RenderFavorites() {
    var container = document.getElementById('v7-favorites');
    if (!container) return;
    try {
        var favs = JSON.parse(localStorage.getItem('kia_config_favorites') || '[]');
        var ranking = JSON.parse(localStorage.getItem('kia_config_ranking') || '{}');
        // Auto-detect favorites from ranking (top 3 with 3+ uses)
        if (favs.length === 0) {
            var sorted = Object.keys(ranking).map(function(k) { return ranking[k]; })
                .filter(function(item) { return item.count >= 3; })
                .sort(function(a, b) { return b.count - a.count; });
            favs = sorted.slice(0, 3).map(function(item) { return item.label; });
        }
        if (favs.length === 0) { container.style.display = 'none'; return; }
        container.style.display = 'block';
        var html = '<div class="v7-favorites-title">Favoritos</div><div class="v7-favorites-list">';
        favs.forEach(function(code) {
            var count = ranking[code] ? ranking[code].count : 0;
            var label = code.length > 40 ? code.substring(0, 40) + '...' : code;
            html += '<button type="button" class="v7-fav-chip" onclick="v7ApplySmartConfig(\'' + _escapeHtml(code) + '\')">' +
                '⭐ ' + label + (count ? ' (' + count + ' usos)' : '') + '</button>';
        });
        html += '</div>';
        container.innerHTML = html;
    } catch(e) {}
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-E4] VIN SMART INPUT                                            ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7CheckVinDuplicate(vin) {
    if (!vin || vin.length < 17) return;
    var hint = document.getElementById('v7-vin-hint');
    // Check active vehicles
    var active = (db.vehicles || []).find(function(v) { return v.vin === vin && v.status !== 'archived'; });
    if (active) {
        if (!hint) hint = _v7CreateVinHint();
        hint.innerHTML = '⚠️ VIN ya registrado <button class="btn btn-sm btn-ghost" onclick="v7GoToVehicle(' + active.id + ')">Ver vehiculo</button>';
        hint.className = 'v7-vin-hint warning';
        return;
    }
    // Check archived
    var archived = (db.vehicles || []).find(function(v) { return v.vin === vin && v.status === 'archived'; });
    if (archived) {
        if (!hint) hint = _v7CreateVinHint();
        hint.innerHTML = 'Re-test de VIN anterior? <button class="btn btn-sm btn-ghost" onclick="v7CopyArchivedConfig(\'' + vin + '\')">Copiar config</button>';
        hint.className = 'v7-vin-hint info';
        return;
    }
    if (hint) hint.style.display = 'none';
}

function _v7CreateVinHint() {
    var existing = document.getElementById('v7-vin-hint');
    if (existing) { existing.style.display = ''; return existing; }
    var hint = document.createElement('div');
    hint.id = 'v7-vin-hint';
    hint.className = 'v7-vin-hint';
    var vinInput = document.getElementById('vin');
    if (vinInput && vinInput.parentNode) vinInput.parentNode.appendChild(hint);
    return hint;
}

function v7CopyArchivedConfig(vin) {
    var archived = (db.vehicles || []).find(function(v) { return v.vin === vin && v.status === 'archived'; });
    if (!archived || !archived.configCode || archived.configCode === 'MANUAL') return;
    v7ApplySmartConfig(archived.configCode);
    showToast('Configuracion copiada del vehiculo anterior', 'success');
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-E5] BATCH RELEASE                                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7RenderBatchRelease() {
    var container = document.getElementById('v7-batch-release');
    if (!container) return;
    var ready = (db.vehicles || []).filter(function(v) { return v.status === 'ready-release'; });
    if (ready.length < 2) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    container.innerHTML = '<button class="btn btn-primary" onclick="v7BatchRelease()" style="width:100%;">' +
        'Liberar Todos los Listos (' + ready.length + ' vehiculos)</button>';
}

function v7BatchRelease() {
    var allReady = (db.vehicles || []).filter(function(v) { return v.status === 'ready-release'; });
    if (allReady.length === 0) { showToast('No hay vehiculos listos', 'info'); return; }

    // Filter out emissions vehicles missing scanned-report photo (mandatory)
    var ready = [];
    var blocked = [];
    allReady.forEach(function(v) {
        var needsPhoto = typeof isEmissionsPurpose === 'function' && isEmissionsPurpose(v.purpose);
        var hasPhoto = !!(v.testData && v.testData.scannedReportCaptured);
        if (needsPhoto && !hasPhoto) blocked.push(v);
        else ready.push(v);
    });

    if (blocked.length > 0) {
        var blockedVins = blocked.map(function(v){ return v.vin || ('ID ' + v.id); }).join(', ');
        showToast('Omitidos ' + blocked.length + ' vehiculo(s) sin foto de resultados: ' + blockedVins, 'warning');
    }

    if (ready.length === 0) { showToast('Ningun vehiculo cumple los requisitos para liberar', 'error'); return; }

    if (typeof undoPush === 'function') undoPush('cop15', 'Batch Release de ' + ready.length + ' vehiculos');

    var count = 0;
    var errors = 0;
    ready.forEach(function(vehicle) {
        try {
            vehicle.status = 'archived';
            vehicle.archivedAt = new Date().toISOString();
            vehicle.timeline.push({
                timestamp: new Date().toISOString(),
                user: 'Sistema',
                action: 'Vehiculo Liberado (Batch Release)',
                data: { status: 'archived' }
            });
            if (typeof exportSingleArchivedVehicle === 'function') exportSingleArchivedVehicle(vehicle.id);
            if (typeof tpAutoFeedFromRelease === 'function') tpAutoFeedFromRelease(vehicle);
            if (typeof invLogTestUsage === 'function') invLogTestUsage(vehicle);
            if (typeof tpAutoMarkWeeklyCompletion === 'function') tpAutoMarkWeeklyCompletion(vehicle.configCode);
            // Emit per-vehicle event so Power Automate webhook fires with each PDF + photo
            if (typeof emitEvent === 'function') emitEvent('vehicle:released', { vehicle: vehicle, isRetest: false, batch: true });
            count++;
        } catch(e) {
            errors++;
            console.error('Batch release error for VIN ' + vehicle.vin + ':', e);
        }
    });

    saveDB();
    refreshAllLists();
    updateProgressBar();

    showToast('Liberados ' + count + ' vehiculos' + (errors > 0 ? ' (' + errors + ' errores)' : ''), count > 0 ? 'success' : 'error');
    if (count > 0 && typeof animateConfetti === 'function') animateConfetti();
    v7RenderBatchRelease();
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7-E6] ONE-TAP PRECOND FIELDS                                     ║
// ╚══════════════════════════════════════════════════════════════════════╝

function v7RenderOneTapPrecond() {
    if (!activeVehicleId) return;
    var vehicle = (db.vehicles || []).find(function(v) { return v.id == activeVehicleId; });
    if (!vehicle || !vehicle.configCode) return;

    // Calculate most frequent values from archived vehicles with same configCode
    var archived = (db.vehicles || []).filter(function(v) {
        return v.status === 'archived' && v.configCode === vehicle.configCode && v.testData && v.testData.preconditioning;
    });
    if (archived.length < 2) return;

    var freqMap = {};
    var fieldsToCheck = ['tire_pressure_front', 'tire_pressure_rear', 'fuel_type', 'precond_cycle'];
    fieldsToCheck.forEach(function(fid) {
        freqMap[fid] = {};
        archived.forEach(function(v) {
            var val = v.testData.preconditioning[fid];
            if (val) {
                freqMap[fid][val] = (freqMap[fid][val] || 0) + 1;
            }
        });
    });

    fieldsToCheck.forEach(function(fid) {
        var el = document.getElementById(fid);
        if (!el || el.value) return; // Don't override existing values
        var freqs = freqMap[fid];
        var topVal = null;
        var topCount = 0;
        Object.keys(freqs).forEach(function(val) {
            if (freqs[val] > topCount) { topCount = freqs[val]; topVal = val; }
        });
        if (!topVal || topCount < 2) return;

        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'v7-onetap-chip';
        chip.textContent = topVal + ' ⭐';
        chip.onclick = function() {
            el.value = topVal;
            el.dispatchEvent(new Event('change'));
            chip.remove();
        };
        if (el.parentNode) el.parentNode.insertBefore(chip, el.nextSibling);
    });
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  [V7] INITIALIZATION HOOKS                                           ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Render V7 widgets when COP15 Alta tab loads
(function() {
    var origSwitch = window._switchToCop15Tab;
    // Hook into tab switches to render V7 widgets
    document.addEventListener('click', function(e) {
        var tab = e.target.closest('.tab[data-tab]');
        if (!tab) return;
        var tabName = tab.dataset.tab;
        setTimeout(function() {
            if (tabName === 'alta') {
                v7RenderQuickPicks();
                v7RenderSmartConfigs();
                v7RenderFavorites();
            }
            if (tabName === 'seguimiento') {
                v7RenderOneTapPrecond();
                if (typeof v7UpdateNextStepBanner === 'function') v7UpdateNextStepBanner();
            }
            if (tabName === 'liberacion') {
                v7RenderBatchRelease();
            }
        }, 100);
    });
})();
