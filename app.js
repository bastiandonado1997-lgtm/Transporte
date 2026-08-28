// ==================== Supabase setup ====================
const SUPABASE_URL = 'https://ktqzifbflzwidwcjcovb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0cXppZmJmbHp3aWR3Y2pjb3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MzYzNzcsImV4cCI6MjEwMzUxMjM3N30.Oby4FRpNTg65dTiGL1WkzPhESVBX58X-H-ljDREgJBE';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function setConn(state, label) {
  const dot = document.getElementById('connDot');
  const lab = document.getElementById('connLabel');
  dot.className = 'conn-dot' + (state ? ' ' + state : '');
  lab.textContent = label;
}
function setRowStatus(elId, msg, kind) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = kind === 'err' ? 'var(--critical)' : (kind === 'ok' ? 'var(--good)' : 'var(--text-muted)');
  if (msg && kind !== 'err') setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2500);
}

// key maps: JS uses UPPERCASE keys internally (same shape as the original static dashboard); DB columns are lowercase snake_case.
const VEHICULO_MAP = {
  ESTADO:'estado', PLACA:'placa', MARCA:'marca', LINEA:'linea', MODELO:'modelo', TIPO:'tipo',
  RESPONSABLE:'responsable', UBICACION:'ubicacion', PROPIETARIO:'propietario', NIT:'nit',
  ASEG_FULL:'aseg_full', VENC_FULL:'venc_full', PRIMA_FULL:'prima_full',
  ASEG_SOAT:'aseg_soat', VENC_SOAT:'venc_soat', PRIMA_SOAT:'prima_soat',
  VALOR:'valor', VALOR_ANTERIOR:'valor_anterior', METODO_AVALUO:'metodo_avaluo',
  FECHA_MATRICULA:'fecha_matricula', TECNOMECANICA:'tecnomecanica', OBSERVACIONES:'observaciones', NOTA:'nota',
};
const MULTA_MAP = {
  NO_COMPARENDO:'no_comparendo', FECHA:'fecha', HORA:'hora', PLACA:'placa', MARCA:'marca', LINEA:'linea',
  TIPO_INFRACCION:'tipo_infraccion', DONDE_FUE:'donde_fue', ORGANISMO:'organismo',
  FECHA_NOTIFICACION:'fecha_notificacion', RESPONSABLE:'responsable', ESTADO:'estado', NOTA:'nota',
};
const MOV_MAP = {
  SEDE:'sede', PLACA_SALIENTE:'placa_saliente', DESC_SALIENTE:'desc_saliente', MODELO_SALIENTE:'modelo_saliente',
  PLACA_ENTRANTE:'placa_entrante', DESC_ENTRANTE:'desc_entrante', MODELO_ENTRANTE:'modelo_entrante',
  QUE_PASO:'que_paso', ESTADO:'estado', RESPONSABLE:'responsable', FECHA:'fecha', NOTA:'nota',
};

function fromDb(map, row) {
  const out = { _id: row.id };
  for (const k in map) out[k] = row[map[k]];
  return out;
}
function toDb(map, obj) {
  const out = {};
  for (const k in map) if (k in obj) out[map[k]] = obj[k];
  return out;
}
async function fetchTable(table, map) {
  const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(r => fromDb(map, r));
}
async function insertRow(table, map, jsObj) {
  const { data, error } = await sb.from(table).insert(toDb(map, jsObj)).select().single();
  if (error) throw error;
  return fromDb(map, data);
}
async function updateField(table, id, dbKey, value) {
  const { error } = await sb.from(table).update({ [dbKey]: value }).eq('id', id);
  if (error) throw error;
}
async function deleteRow(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error;
}

let DATA = [], DATA_MULTAS = [], DATA_V = [];

function parseEditValue(type, text) {
  const t = (text || '').trim();
  if (t === '' || t === '—') return null;
  if (type === 'money' || type === 'num') {
    const cleaned = t.replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? undefined : n;
  }
  if (type === 'year') {
    const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? undefined : n;
  }
  if (type === 'date') {
    const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return undefined;
    return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return t;
}
function fmtCOPRaw(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  return Number(n).toLocaleString('es-CO');
}
function fmtCOP(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const millones = n / 1e6;
  return "$" + millones.toLocaleString('es-CO', {maximumFractionDigits: 1}) + " M";
}
function fmtInt(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString('es-CO');
}
function fmtDate(s) {
  if (!s) return "—";
  const [y,m,d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function editDisplayValue(row, col) {
  const v = row[col.key];
  if (col.type === 'money' || col.type === 'num') return v === null || v === undefined ? '' : fmtCOPRaw(v);
  if (col.type === 'date') return v ? fmtDate(v) : '';
  if (col.type === 'year') return v === null || v === undefined ? '' : String(v);
  return v === null || v === undefined ? '' : String(v);
}

// ==================== VEHICULOS MODULE ====================
const CATS = ["Flota Principal", "Renting", "Remolques y Camabajas", "Maquinas y Montacargas", "Vehiculos Personales (Socios)", "Siniestrados", "Vendidos / De Baja"];
const COLOR_VAR = {
  "Flota Principal": "--series-1", "Renting": "--series-2", "Remolques y Camabajas": "--series-3",
  "Maquinas y Montacargas": "--series-4", "Vehiculos Personales (Socios)": "--series-5",
  "Siniestrados": "--series-6", "Vendidos / De Baja": "--series-7",
};
const ALERT_LABEL = { VENCIDO: "Vencido", POR_VENCER: "Por vencer (60 dias)", VIGENTE: "Vigente", SIN_DATO: "Sin dato" };
const ALERT_COLOR_VAR = { VENCIDO: "--critical", POR_VENCER: "--warn", VIGENTE: "--good", SIN_DATO: "--text-muted" };
const PROP_GROUPS = ["Partequipos Maquinaria S.A.S.", "Partequipos S.A.S.", "Leasing / Bancos", "Socios y terceros", "Sin dato"];
const PROP_GROUP_COLOR_VAR = {
  "Partequipos Maquinaria S.A.S.": "--series-1", "Partequipos S.A.S.": "--series-2",
  "Leasing / Bancos": "--series-4", "Socios y terceros": "--series-5", "Sin dato": "--text-muted",
};
function computePropGroup(d) {
  const raw = (d.PROPIETARIO || '').toUpperCase();
  if (!raw.trim()) return "Sin dato";
  if (raw.includes('PARTEQUIPOS MAQUINARIA') || raw.includes('CONALQUIP')) return "Partequipos Maquinaria S.A.S.";
  if (raw.includes('PARTEQUIPOS')) return "Partequipos S.A.S.";
  if (raw.includes('BANCO') || raw.includes('BANCOLOMBIA') || raw.includes('RENTING') || raw.includes('LEASING') || raw.includes('DAVIVIENDA')) return "Leasing / Bancos";
  return "Socios y terceros";
}
function propGroupColor(key) {
  return getComputedStyle(document.querySelector('.viz-root')).getPropertyValue(PROP_GROUP_COLOR_VAR[key]).trim();
}
function computeAlerta(d) {
  const dates = [d.VENC_FULL, d.VENC_SOAT].filter(Boolean).map(s => new Date(s + "T00:00:00"));
  if (dates.length === 0) return "SIN_DATO";
  const now = new Date(); now.setHours(0,0,0,0);
  const in60 = new Date(now); in60.setDate(in60.getDate() + 60);
  if (dates.some(dt => dt < now)) return "VENCIDO";
  if (dates.some(dt => dt <= in60)) return "POR_VENCER";
  return "VIGENTE";
}
function colorOf(cat) {
  return getComputedStyle(document.querySelector('.viz-root')).getPropertyValue(COLOR_VAR[cat]).trim();
}
function alertColor(key) {
  return getComputedStyle(document.querySelector('.viz-root')).getPropertyValue(ALERT_COLOR_VAR[key]).trim();
}

function blankVehicle(estado) {
  return {
    ESTADO: estado, PLACA: '', MARCA: '', LINEA: '', MODELO: null, TIPO: '',
    RESPONSABLE: '', UBICACION: '', PROPIETARIO: '', NIT: '', ASEG_FULL: '', VENC_FULL: null,
    PRIMA_FULL: null, ASEG_SOAT: '', VENC_SOAT: null, PRIMA_SOAT: null, VALOR: null,
    VALOR_ANTERIOR: null, METODO_AVALUO: 'Agregado manualmente desde el dashboard',
    FECHA_MATRICULA: null, TECNOMECANICA: null, OBSERVACIONES: '', NOTA: '',
  };
}

async function addVehicle() {
  const btn = document.getElementById('addBtn'); btn.disabled = true;
  try {
    const estado = (state.cats.size === 1) ? [...state.cats][0] : 'Flota Principal';
    const blank = blankVehicle(estado);
    setRowStatus('statusFlota', 'Creando…');
    const row = await insertRow('vehiculos', VEHICULO_MAP, blank);
    row.ALERTA = computeAlerta(row); row.PROP_GROUP = computePropGroup(row);
    DATA.unshift(row);
    state.cats.add(estado);
    state.search = '';
    const si = document.getElementById('searchInput'); if (si) si.value = '';
    setRowStatus('statusFlota', 'Vehiculo creado', 'ok');
    buildKPIs(); renderCharts(); buildTabs(); renderTable();
    requestAnimationFrame(() => {
      const firstCell = document.querySelector(`#tableBody td.editable-td[data-id="${row._id}"]`);
      if (firstCell) firstCell.focus();
    });
  } catch (e) {
    setRowStatus('statusFlota', 'Error: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

async function deleteVehicle(id) {
  const idx = DATA.findIndex(d => d._id === id);
  if (idx < 0) return;
  const row = DATA[idx];
  if (!confirm(`¿Eliminar el vehiculo ${row.PLACA || '(sin placa)'}? Esta accion es permanente en la base de datos.`)) return;
  try {
    setRowStatus('statusFlota', 'Eliminando…');
    await deleteRow('vehiculos', id);
    DATA.splice(idx, 1);
    setRowStatus('statusFlota', 'Eliminado', 'ok');
    buildKPIs(); renderCharts(); buildTabs(); renderTable();
  } catch (e) {
    setRowStatus('statusFlota', 'Error al eliminar: ' + e.message, 'err');
  }
}

async function commitEdit(id, key, type, rawText) {
  const row = DATA.find(d => d._id === id);
  if (!row) return false;
  const parsed = parseEditValue(type, rawText);
  if (parsed === undefined) return false;
  if (parsed === row[key]) return true;
  const prev = row[key];
  row[key] = parsed;
  if (key === 'VENC_FULL' || key === 'VENC_SOAT') row.ALERTA = computeAlerta(row);
  if (key === 'PROPIETARIO') row.PROP_GROUP = computePropGroup(row);
  buildKPIs(); renderCharts(); buildTabs(); buildPropTabs();
  try {
    setRowStatus('statusFlota', 'Guardando…');
    await updateField('vehiculos', id, VEHICULO_MAP[key], parsed);
    setRowStatus('statusFlota', 'Guardado', 'ok');
    return true;
  } catch (e) {
    row[key] = prev;
    if (key === 'VENC_FULL' || key === 'VENC_SOAT') row.ALERTA = computeAlerta(row);
    if (key === 'PROPIETARIO') row.PROP_GROUP = computePropGroup(row);
    setRowStatus('statusFlota', 'Error al guardar: ' + e.message, 'err');
    buildKPIs(); renderCharts(); buildTabs(); buildPropTabs(); renderTable();
    return false;
  }
}

function wireEditableCells() {
  document.querySelectorAll('#tableBody td.editable-td').forEach(td => {
    td.addEventListener('focus', () => {
      const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
      const row = DATA.find(d => d._id === id);
      td.textContent = editDisplayValue(row, {key, type});
      window.getSelection().selectAllChildren(td);
    });
    td.addEventListener('blur', async () => {
      const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
      const row = DATA.find(d => d._id === id);
      const ok = await commitEdit(id, key, type, td.textContent);
      if (!ok) td.textContent = editDisplayValue(row, {key, type});
      else td.textContent = editDisplayValue(row, {key, type});
    });
    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
      if (e.key === 'Escape') {
        const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
        const row = DATA.find(d => d._id === id);
        td.textContent = editDisplayValue(row, {key, type});
        td.blur();
      }
    });
  });
  document.querySelectorAll('#tableBody select.cat-edit').forEach(sel => {
    sel.addEventListener('change', () => {
      commitEdit(sel.dataset.id, sel.dataset.key, 'text', sel.value).then(() => renderTable());
    });
  });
}

function buildKPIs() {
  const totalAll = DATA.length;
  const totalSel = DATA.filter(d => state.kpiCats.has(d.ESTADO)).length;
  const activos = DATA.filter(d => d.ESTADO === "Flota Principal").length;
  const totalValue = DATA.filter(d => state.kpiCats.has(d.ESTADO)).reduce((s,d) => s + (typeof d.VALOR === 'number' ? d.VALOR : 0), 0);
  const alertas = DATA.filter(d => state.kpiCats.has(d.ESTADO) && (d.ALERTA === 'VENCIDO' || d.ALERTA === 'POR_VENCER')).length;
  const totalNote = state.kpiCats.size === CATS.length
    ? `En las ${CATS.length} categorias`
    : (state.kpiCats.size === 0 ? "Ninguna categoria seleccionada" : `Solo: ${Array.from(state.kpiCats).join(', ')}`);
  const tiles = [
    { label: "Total vehiculos", value: fmtInt(totalSel), note: totalNote, totalTile: true },
    { label: "Flota principal", value: fmtInt(activos), note: (totalAll ? Math.round(activos/totalAll*100) : 0) + "% del total" },
    { label: "Valor comercial (seleccion)", value: fmtCOP(totalValue), note: "Suma de avaluo comercial 2025-2026" },
    { label: "Polizas vencidas / por vencer", value: fmtInt(alertas), note: "SOAT o todo riesgo, en la seleccion actual" },
  ];
  const row = document.getElementById('kpiRow');
  row.innerHTML = tiles.map(t => `
    <div class="kpi-tile${t.totalTile ? ' kpi-toggle-wrap' : ''}">
      ${t.totalTile ? `<button class="kpi-toggle-btn" id="kpiToggleBtn" title="Elegir que categorias contar">⚙︎</button>
      <div class="col-menu" id="kpiCatMenu"></div>` : ''}
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value">${t.value}</div>
      <div class="kpi-note">${t.note}</div>
    </div>`).join('');
  const menu = document.getElementById('kpiCatMenu');
  menu.innerHTML = CATS.map(c => `<label><input type="checkbox" data-kpicat="${c}" ${state.kpiCats.has(c)?'checked':''}> ${c}</label>`).join('');
  menu.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.checked) state.kpiCats.add(inp.dataset.kpicat); else state.kpiCats.delete(inp.dataset.kpicat);
      buildKPIs();
      document.getElementById('kpiCatMenu').classList.add('open');
    });
  });
  document.getElementById('kpiToggleBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('kpiCatMenu').classList.toggle('open');
  });
}

function buildBarChart(containerId, entries, valueFn, formatFn) {
  const el = document.getElementById(containerId);
  const vals = entries.map(valueFn);
  const max = Math.max(...vals, 1);
  el.innerHTML = entries.map(e => {
    const v = valueFn(e);
    const pct = Math.max((v / max) * 100, v > 0 ? 2 : 0);
    return `
      <div class="bar-row">
        <div class="bar-label" title="${e.label}">${e.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${e.color};"></div></div>
        <div class="bar-value">${formatFn(v)}</div>
      </div>`;
  }).join('');
}

function renderCharts() {
  const activeCats = CATS.filter(c => state.cats.has(c));
  const activePropGroups = PROP_GROUPS.filter(g => state.propGroups.has(g));
  const filtered = DATA.filter(d => state.cats.has(d.ESTADO) && state.propGroups.has(d.PROP_GROUP));
  const showMsg = (msg) => {
    const html = `<div style="padding:24px 4px; text-align:center; color:var(--text-muted); font-size:12.5px;">${msg}</div>`;
    document.getElementById('chartCount').innerHTML = html;
    document.getElementById('chartValue').innerHTML = html;
  };
  if (activeCats.length === 0) {
    showMsg('No hay categorias seleccionadas en Detalle de flota');
  } else if (activePropGroups.length === 0) {
    showMsg('No hay empresas seleccionadas en Detalle de flota');
  } else {
    const entries = activeCats.map(cat => {
      const rows = filtered.filter(d => d.ESTADO === cat);
      return { key: cat, label: cat, color: colorOf(cat), count: rows.length,
        value: rows.reduce((s, d) => s + (typeof d.VALOR === 'number' ? d.VALOR : 0), 0) };
    }).filter(e => e.count > 0);
    if (entries.length === 0) {
      showMsg('No hay vehiculos que coincidan con tu seleccion');
    } else {
      buildBarChart('chartCount', entries, e => e.count, fmtInt);
      buildBarChart('chartValue', entries, e => e.value, fmtCOP);
    }
  }
  const filtering = state.cats.size < CATS.length || activePropGroups.length < PROP_GROUPS.length;
  const note = filtering ? ' · segun tu seleccion en Detalle de flota' : '';
  document.getElementById('chartCountSub').textContent = 'Cantidad de unidades en cada categoria' + note;
  document.getElementById('chartValueSub').textContent = 'Avaluo comercial (vr. ccial 2025-2026), en pesos COP' + note;
}

const COLUMNS = [
  { key: 'ESTADO', label: 'Categoria', default: false, type: 'badge' },
  { key: 'PLACA', label: 'Placa', default: true, type: 'model' },
  { key: 'MARCA', label: 'Marca', default: true, type: 'text' },
  { key: 'LINEA', label: 'Linea', default: true, type: 'text' },
  { key: 'MODELO', label: 'Modelo', default: true, type: 'year' },
  { key: 'TIPO', label: 'Tipo', default: true, type: 'text' },
  { key: 'UBICACION', label: 'Ubicacion', default: true, type: 'text' },
  { key: 'VALOR', label: 'Valor Comercial', default: false, type: 'money' },
  { key: 'ALERTA', label: 'Estado Poliza', default: false, type: 'alerta' },
  { key: 'RESPONSABLE', label: 'Responsable', default: false, type: 'text' },
  { key: 'PROPIETARIO', label: 'Propietario', default: true, type: 'text' },
  { key: 'NIT', label: 'CC / NIT', default: false, type: 'text' },
  { key: 'ASEG_FULL', label: 'Aseguradora Todo Riesgo', default: false, type: 'text' },
  { key: 'VENC_FULL', label: 'Vcto. Todo Riesgo', default: false, type: 'date' },
  { key: 'PRIMA_FULL', label: 'Prima Todo Riesgo', default: false, type: 'money' },
  { key: 'ASEG_SOAT', label: 'Aseguradora SOAT', default: false, type: 'text' },
  { key: 'VENC_SOAT', label: 'Vcto. SOAT', default: false, type: 'date' },
  { key: 'PRIMA_SOAT', label: 'Prima SOAT', default: false, type: 'money' },
  { key: 'FECHA_MATRICULA', label: 'Fecha Matricula', default: false, type: 'date' },
  { key: 'TECNOMECANICA', label: 'Tecnomecanica', default: false, type: 'date' },
  { key: 'OBSERVACIONES', label: 'Observaciones', default: false, type: 'nota' },
  { key: 'NOTA', label: 'Nota de Consolidacion', default: false, type: 'nota' },
  { key: 'VALOR_ANTERIOR', label: 'Valor Comercial (antes del reavaluo)', default: false, type: 'money' },
  { key: 'METODO_AVALUO', label: 'Metodo de Reavaluo', default: false, type: 'nota' },
];

let state = {
  cats: new Set(), propGroups: new Set(), search: '', sortKey: null, sortDir: 1,
  visibleCols: new Set(COLUMNS.filter(c => c.default).map(c => c.key)),
  kpiCats: new Set(["Flota Principal", "Renting", "Remolques y Camabajas"]),
};

function buildTabs() {
  const counts = {}; CATS.forEach(c => counts[c] = DATA.filter(d => d.ESTADO === c).length);
  const allSelected = state.cats.size === CATS.length;
  const noneSelected = state.cats.size === 0;
  const tabsEl = document.getElementById('tabs');
  const todasBtn = `<button class="tab ${allSelected?'active':''}" data-cat="TODAS">Todas <span style="opacity:.6">(${DATA.length})</span></button>`;
  const clearBtn = `<button class="tab-clear" data-cat="CLEAR" ${noneSelected?'disabled':''} title="Quitar todas las selecciones de categoria">✕ Limpiar</button>`;
  const catBtns = CATS.map(c => `
    <button class="tab ${state.cats.has(c)?'active':''}" data-cat="${c}">
      <span class="dot" style="background:${colorOf(c)}"></span>
      ${c} <span style="opacity:.6">(${counts[c]})</span>
    </button>`).join('');
  tabsEl.innerHTML = todasBtn + catBtns + clearBtn;
  tabsEl.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.cat;
      if (key === 'TODAS') { state.cats = new Set(CATS); }
      else if (state.cats.has(key)) { state.cats.delete(key); }
      else { state.cats.add(key); }
      buildTabs(); renderTable(); renderCharts();
    });
  });
  const clearEl = tabsEl.querySelector('.tab-clear');
  if (clearEl) clearEl.addEventListener('click', () => { state.cats = new Set(); buildTabs(); renderTable(); renderCharts(); });
}

function buildPropTabs() {
  const counts = {}; PROP_GROUPS.forEach(g => counts[g] = DATA.filter(d => d.PROP_GROUP === g).length);
  const allSelected = state.propGroups.size === PROP_GROUPS.length;
  const noneSelected = state.propGroups.size === 0;
  const tabsEl = document.getElementById('propTabs');
  const todasBtn = `<button class="tab ${allSelected?'active':''}" data-prop="TODAS">Todas <span style="opacity:.6">(${DATA.length})</span></button>`;
  const clearBtn = `<button class="tab-clear" data-prop="CLEAR" ${noneSelected?'disabled':''} title="Quitar todas las selecciones de empresa">✕ Limpiar</button>`;
  const btns = PROP_GROUPS.map(g => `
    <button class="tab ${state.propGroups.has(g)?'active':''}" data-prop="${g}">
      <span class="dot" style="background:${propGroupColor(g)}"></span>
      ${g} <span style="opacity:.6">(${counts[g]})</span>
    </button>`).join('');
  tabsEl.innerHTML = todasBtn + btns + clearBtn;
  tabsEl.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.prop;
      if (key === 'TODAS') { state.propGroups = new Set(PROP_GROUPS); }
      else if (state.propGroups.has(key)) { state.propGroups.delete(key); }
      else { state.propGroups.add(key); }
      buildPropTabs(); renderTable(); renderCharts();
    });
  });
  const clearEl = tabsEl.querySelector('.tab-clear');
  if (clearEl) clearEl.addEventListener('click', () => { state.propGroups = new Set(); buildPropTabs(); renderTable(); renderCharts(); });
}

function buildColMenu() {
  const menu = document.getElementById('colMenu');
  menu.innerHTML = COLUMNS.map(c => `<label><input type="checkbox" data-col="${c.key}" ${state.visibleCols.has(c.key)?'checked':''}> ${c.label}</label>`).join('');
  menu.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.checked) state.visibleCols.add(inp.dataset.col); else state.visibleCols.delete(inp.dataset.col);
      renderTable();
    });
  });
}

function estadoBadge(v) {
  return `<span class="badge" style="background:color-mix(in srgb, ${colorOf(v)} 16%, transparent); color:${colorOf(v)}"><span class="dot" style="background:${colorOf(v)}"></span>${v}</span>`;
}
function alertaBadge(v) {
  return `<span class="badge" style="background:color-mix(in srgb, ${alertColor(v)} 16%, transparent); color:${alertColor(v)}"><span class="dot" style="background:${alertColor(v)}"></span>${ALERT_LABEL[v]}</span>`;
}
function cellValue(row, col) {
  const v = row[col.key];
  switch(col.type) {
    case 'badge': return estadoBadge(v);
    case 'alerta': return alertaBadge(v);
    case 'money': return typeof v === 'number' ? fmtCOP(v) : '—';
    case 'num': return (v===null||v===undefined||v==='') ? '—' : fmtInt(v);
    case 'year': return (v===null||v===undefined||v==='') ? '—' : String(v);
    case 'date': return fmtDate(v);
    case 'model': return v || '—';
    case 'nota': return v || '<span style="color:var(--text-muted)">—</span>';
    default: return (v===null||v===undefined||v==='') ? '—' : v;
  }
}

function filteredSortedRows() {
  let rows = DATA.filter(d => state.cats.has(d.ESTADO) && state.propGroups.has(d.PROP_GROUP));
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter(d =>
      (d.PLACA||'').toLowerCase().includes(q) || (d.MARCA||'').toLowerCase().includes(q) ||
      (d.LINEA||'').toLowerCase().includes(q) || (d.RESPONSABLE||'').toLowerCase().includes(q) ||
      (d.PROPIETARIO||'').toLowerCase().includes(q));
  }
  if (state.sortKey) {
    rows = rows.slice().sort((a,b) => {
      let av = a[state.sortKey], bv = b[state.sortKey];
      if (av === null || av === undefined) av = '';
      if (bv === null || bv === undefined) bv = '';
      if (typeof av === 'number' && typeof bv === 'number') return (av-bv) * state.sortDir;
      return String(av).localeCompare(String(bv)) * state.sortDir;
    });
  }
  return rows;
}

function renderTableHead() {
  const cols = COLUMNS.filter(c => state.visibleCols.has(c.key));
  const head = document.getElementById('tableHead');
  head.innerHTML = '<th class="actions-col"></th>' + cols.map(c => {
    const arrow = state.sortKey === c.key ? (state.sortDir===1?'▲':'▼') : '';
    const numClass = (c.type==='money'||c.type==='num'||c.type==='year') ? 'num' : '';
    return `<th class="${numClass}" data-key="${c.key}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('');
  head.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (state.sortKey === key) state.sortDir *= -1; else { state.sortKey = key; state.sortDir = 1; }
      renderTable();
    });
  });
}

function renderTable() {
  renderTableHead();
  const cols = COLUMNS.filter(c => state.visibleCols.has(c.key));
  const rows = filteredSortedRows();
  const body = document.getElementById('tableBody');
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="${cols.length+1}"><div class="empty-state">No hay vehiculos que coincidan con el filtro.</div></td></tr>`;
  } else {
    body.innerHTML = rows.map(r => {
      const delCell = `<td class="actions-col"><button class="del-btn" data-id="${r._id}" title="Eliminar vehiculo" type="button">🗑</button></td>`;
      return `<tr>` + delCell + cols.map(c => {
        const cls = (c.type==='money'||c.type==='num'||c.type==='year') ? 'num' : (c.type==='model'?'model':(c.type==='nota'?'nota':''));
        if (c.type === 'alerta') return `<td class="${cls}">${cellValue(r, c)}</td>`;
        if (c.type === 'badge') {
          const opts = CATS.map(cat => `<option value="${cat}" ${cat===r[c.key]?'selected':''}>${cat}</option>`).join('');
          return `<td class="${cls}"><select class="cat-edit" data-id="${r._id}" data-key="${c.key}">${opts}</select></td>`;
        }
        return `<td class="${cls} editable-td" data-id="${r._id}" data-key="${c.key}" data-type="${c.type}" contenteditable="true" spellcheck="false">${cellValue(r, c)}</td>`;
      }).join('') + '</tr>';
    }).join('');
  }
  document.getElementById('rowCount').textContent = rows.length.toLocaleString('es-CO') + ' de ' + DATA.length.toLocaleString('es-CO') + ' vehiculos';
  document.getElementById('flotaSub').textContent = DATA.length + ' vehiculos — combina categorias, filtra por estado de poliza, busca y muestra/oculta columnas';
  wireEditableCells();
  document.querySelectorAll('#tableBody .del-btn').forEach(btn => btn.addEventListener('click', () => deleteVehicle(btn.dataset.id)));
}

// ==================== MULTAS MODULE ====================
function blankMulta() {
  return { PLACA: '', MARCA: '', LINEA: '', NO_COMPARENDO: '', FECHA: null, HORA: '',
    TIPO_INFRACCION: '', DONDE_FUE: '', ORGANISMO: '', FECHA_NOTIFICACION: null,
    RESPONSABLE: '', ESTADO: 'PENDIENTE', NOTA: '' };
}
function estadoMultaColorVar(v) {
  const s = (v || '').toUpperCase();
  if (s.includes('PAGAD')) return '--good';
  if (s.includes('ANULAD') || s.includes('CANCELAD')) return '--text-muted';
  return '--warn';
}
function estadoMultaColor(v) {
  return getComputedStyle(document.querySelector('.viz-root')).getPropertyValue(estadoMultaColorVar(v)).trim();
}
function multaBadge(v) {
  const c = estadoMultaColor(v); const label = v || 'Sin estado';
  return `<span class="badge" style="background:color-mix(in srgb, ${c} 16%, transparent); color:${c}"><span class="dot" style="background:${c}"></span>${label}</span>`;
}

async function addMulta() {
  const btn = document.getElementById('addBtnM'); btn.disabled = true;
  try {
    setRowStatus('statusMultas', 'Creando…');
    const row = await insertRow('multas', MULTA_MAP, blankMulta());
    DATA_MULTAS.unshift(row);
    stateM.search = '';
    const si = document.getElementById('searchInputM'); if (si) si.value = '';
    setRowStatus('statusMultas', 'Multa creada', 'ok');
    buildMultasKPIs(); buildMultasEstadoTabs(); renderMultasTable();
    requestAnimationFrame(() => {
      const firstCell = document.querySelector(`#tableBodyM td.editable-td[data-id="${row._id}"]`);
      if (firstCell) firstCell.focus();
    });
  } catch (e) {
    setRowStatus('statusMultas', 'Error: ' + e.message, 'err');
  } finally { btn.disabled = false; }
}

async function deleteMulta(id) {
  const idx = DATA_MULTAS.findIndex(d => d._id === id);
  if (idx < 0) return;
  const row = DATA_MULTAS[idx];
  if (!confirm(`¿Eliminar la multa ${row.NO_COMPARENDO || '(sin numero)'} de la placa ${row.PLACA || '?'}? Esta accion es permanente.`)) return;
  try {
    setRowStatus('statusMultas', 'Eliminando…');
    await deleteRow('multas', id);
    DATA_MULTAS.splice(idx, 1);
    setRowStatus('statusMultas', 'Eliminada', 'ok');
    buildMultasKPIs(); buildMultasEstadoTabs(); renderMultasTable();
  } catch (e) {
    setRowStatus('statusMultas', 'Error al eliminar: ' + e.message, 'err');
  }
}

async function commitEditM(id, key, type, rawText) {
  const row = DATA_MULTAS.find(d => d._id === id);
  if (!row) return false;
  const parsed = parseEditValue(type, rawText);
  if (parsed === undefined) return false;
  if (parsed === row[key]) return true;
  const prev = row[key];
  row[key] = parsed;
  buildMultasKPIs(); buildMultasEstadoTabs();
  try {
    setRowStatus('statusMultas', 'Guardando…');
    await updateField('multas', id, MULTA_MAP[key], parsed);
    setRowStatus('statusMultas', 'Guardado', 'ok');
    return true;
  } catch (e) {
    row[key] = prev;
    setRowStatus('statusMultas', 'Error al guardar: ' + e.message, 'err');
    buildMultasKPIs(); buildMultasEstadoTabs(); renderMultasTable();
    return false;
  }
}

function wireEditableCellsM() {
  document.querySelectorAll('#tableBodyM td.editable-td').forEach(td => {
    td.addEventListener('focus', () => {
      const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
      const row = DATA_MULTAS.find(d => d._id === id);
      td.textContent = editDisplayValue(row, {key, type});
      window.getSelection().selectAllChildren(td);
    });
    td.addEventListener('blur', async () => {
      const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
      const row = DATA_MULTAS.find(d => d._id === id);
      const ok = await commitEditM(id, key, type, td.textContent);
      td.textContent = editDisplayValue(row, {key, type});
    });
    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
      if (e.key === 'Escape') {
        const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
        const row = DATA_MULTAS.find(d => d._id === id);
        td.textContent = editDisplayValue(row, {key, type});
        td.blur();
      }
    });
  });
}

const MULTAS_COLUMNS = [
  { key: 'PLACA', label: 'Placa', default: true, type: 'model' },
  { key: 'MARCA', label: 'Marca', default: true, type: 'text' },
  { key: 'LINEA', label: 'Linea', default: false, type: 'text' },
  { key: 'FECHA', label: 'Fecha', default: true, type: 'date' },
  { key: 'HORA', label: 'Hora', default: false, type: 'text' },
  { key: 'NO_COMPARENDO', label: 'No. Comparendo', default: true, type: 'text' },
  { key: 'TIPO_INFRACCION', label: 'Tipo de Infraccion', default: true, type: 'nota' },
  { key: 'DONDE_FUE', label: 'Donde fue', default: false, type: 'nota' },
  { key: 'ORGANISMO', label: 'Secretaria / Organismo', default: true, type: 'text' },
  { key: 'FECHA_NOTIFICACION', label: 'Fecha Notificacion', default: false, type: 'date' },
  { key: 'RESPONSABLE', label: 'Responsable', default: true, type: 'text' },
  { key: 'ESTADO', label: 'Estado', default: true, type: 'badge_multa' },
  { key: 'NOTA', label: 'Nota', default: false, type: 'nota' },
];
let stateM = { estados: null, search: '', sortKey: null, sortDir: 1, visibleCols: new Set(MULTAS_COLUMNS.filter(c => c.default).map(c => c.key)) };

function multasEstadoList() { return [...new Set(DATA_MULTAS.map(d => d.ESTADO || 'Sin estado'))]; }

function buildMultasEstadoTabs() {
  const estados = multasEstadoList();
  if (!stateM.estados) stateM.estados = new Set(estados);
  estados.forEach(e => { if (!stateM.estados.has(e) && !stateM._touched) stateM.estados.add(e); });
  const counts = {}; estados.forEach(e => counts[e] = DATA_MULTAS.filter(d => (d.ESTADO || 'Sin estado') === e).length);
  const activeEstados = estados.filter(e => stateM.estados.has(e));
  const allSelected = activeEstados.length === estados.length;
  const noneSelected = activeEstados.length === 0;
  const tabsEl = document.getElementById('multasEstadoTabs');
  const todasBtn = `<button class="tab ${allSelected?'active':''}" data-estado="TODAS">Todas <span style="opacity:.6">(${DATA_MULTAS.length})</span></button>`;
  const clearBtn = `<button class="tab-clear" data-estado="CLEAR" ${noneSelected?'disabled':''} title="Quitar todas las selecciones de estado">✕ Limpiar</button>`;
  const btns = estados.map(e => `
    <button class="tab ${stateM.estados.has(e)?'active':''}" data-estado="${e}">
      <span class="dot" style="background:${estadoMultaColor(e)}"></span>
      ${e} <span style="opacity:.6">(${counts[e]})</span>
    </button>`).join('');
  tabsEl.innerHTML = todasBtn + btns + clearBtn;
  tabsEl.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      stateM._touched = true;
      const key = btn.dataset.estado;
      if (key === 'TODAS') { stateM.estados = new Set(estados); }
      else if (stateM.estados.has(key)) { stateM.estados.delete(key); }
      else { stateM.estados.add(key); }
      buildMultasEstadoTabs(); renderMultasTable();
    });
  });
  const clearEl = tabsEl.querySelector('.tab-clear');
  if (clearEl) clearEl.addEventListener('click', () => { stateM._touched = true; stateM.estados = new Set(); buildMultasEstadoTabs(); renderMultasTable(); });
  const cnt = document.getElementById('multasTabCount'); if (cnt) cnt.textContent = '(' + DATA_MULTAS.length + ')';
}

function buildMultasColMenu() {
  const menu = document.getElementById('colMenuM');
  menu.innerHTML = MULTAS_COLUMNS.map(c => `<label><input type="checkbox" data-col="${c.key}" ${stateM.visibleCols.has(c.key)?'checked':''}> ${c.label}</label>`).join('');
  menu.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.checked) stateM.visibleCols.add(inp.dataset.col); else stateM.visibleCols.delete(inp.dataset.col);
      renderMultasTable();
    });
  });
}

function buildMultasKPIs() {
  const total = DATA_MULTAS.length;
  const pagadas = DATA_MULTAS.filter(d => (d.ESTADO||'').toUpperCase().includes('PAGAD')).length;
  const pendientes = total - pagadas;
  const placas = new Set(DATA_MULTAS.map(d => (d.PLACA||'').trim().toUpperCase()).filter(Boolean)).size;
  const tiles = [
    { label: 'Total multas', value: fmtInt(total), note: 'Comparendos registrados' },
    { label: 'Pagadas', value: fmtInt(pagadas), note: total ? Math.round(pagadas/total*100) + '% del total' : '—' },
    { label: 'Pendientes / en tramite', value: fmtInt(pendientes), note: 'No marcadas como pagadas' },
    { label: 'Placas con multas', value: fmtInt(placas), note: 'Vehiculos distintos involucrados' },
  ];
  document.getElementById('kpiRowMultas').innerHTML = tiles.map(t => `
    <div class="kpi-tile"><div class="kpi-label">${t.label}</div><div class="kpi-value">${t.value}</div><div class="kpi-note">${t.note}</div></div>`).join('');
}

function cellValueM(row, col) {
  const v = row[col.key];
  switch(col.type) {
    case 'badge_multa': return multaBadge(v);
    case 'date': return fmtDate(v);
    case 'model': return v || '—';
    case 'nota': return v || '<span style="color:var(--text-muted)">—</span>';
    default: return (v===null||v===undefined||v==='') ? '—' : v;
  }
}

function filteredSortedRowsM() {
  let rows = DATA_MULTAS.filter(d => stateM.estados.has(d.ESTADO || 'Sin estado'));
  if (stateM.search) {
    const q = stateM.search.toLowerCase();
    rows = rows.filter(d =>
      (d.PLACA||'').toLowerCase().includes(q) || (d.NO_COMPARENDO||'').toLowerCase().includes(q) ||
      (d.ORGANISMO||'').toLowerCase().includes(q) || (d.RESPONSABLE||'').toLowerCase().includes(q) ||
      (d.TIPO_INFRACCION||'').toLowerCase().includes(q));
  }
  if (stateM.sortKey) {
    rows = rows.slice().sort((a,b) => {
      let av = a[stateM.sortKey], bv = b[stateM.sortKey];
      if (av === null || av === undefined) av = ''; if (bv === null || bv === undefined) bv = '';
      if (typeof av === 'number' && typeof bv === 'number') return (av-bv) * stateM.sortDir;
      return String(av).localeCompare(String(bv)) * stateM.sortDir;
    });
  }
  return rows;
}

function renderMultasTableHead() {
  const cols = MULTAS_COLUMNS.filter(c => stateM.visibleCols.has(c.key));
  const head = document.getElementById('tableHeadM');
  head.innerHTML = '<th class="actions-col"></th>' + cols.map(c => {
    const arrow = stateM.sortKey === c.key ? (stateM.sortDir===1?'▲':'▼') : '';
    return `<th data-key="${c.key}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('');
  head.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (stateM.sortKey === key) stateM.sortDir *= -1; else { stateM.sortKey = key; stateM.sortDir = 1; }
      renderMultasTable();
    });
  });
}

function renderMultasTable() {
  renderMultasTableHead();
  const cols = MULTAS_COLUMNS.filter(c => stateM.visibleCols.has(c.key));
  const rows = filteredSortedRowsM();
  const body = document.getElementById('tableBodyM');
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="${cols.length+1}"><div class="empty-state">No hay multas que coincidan con el filtro.</div></td></tr>`;
  } else {
    body.innerHTML = rows.map(r => {
      const delCell = `<td class="actions-col"><button class="del-btn" data-id="${r._id}" title="Eliminar multa" type="button">🗑</button></td>`;
      return `<tr>` + delCell + cols.map(c => {
        const cls = (c.type==='model'?'model':(c.type==='nota'?'nota':''));
        const dtype = c.type === 'badge_multa' ? 'text' : c.type;
        return `<td class="${cls} editable-td" data-id="${r._id}" data-key="${c.key}" data-type="${dtype}" contenteditable="true" spellcheck="false">${cellValueM(r, c)}</td>`;
      }).join('') + '</tr>';
    }).join('');
  }
  document.getElementById('rowCountM').textContent = rows.length.toLocaleString('es-CO') + ' de ' + DATA_MULTAS.length.toLocaleString('es-CO') + ' multas';
  wireEditableCellsM();
  document.querySelectorAll('#tableBodyM .del-btn').forEach(btn => btn.addEventListener('click', () => deleteMulta(btn.dataset.id)));
}

// ==================== MOVIMIENTOS MODULE ====================
function blankMov() {
  return { SEDE: '', PLACA_SALIENTE: '', DESC_SALIENTE: '', MODELO_SALIENTE: null,
    PLACA_ENTRANTE: '', DESC_ENTRANTE: '', MODELO_ENTRANTE: null, QUE_PASO: '', ESTADO: 'Pendiente',
    RESPONSABLE: '', FECHA: null, NOTA: '' };
}
function estadoMovColorVar(v) {
  const s = (v || '').toUpperCase();
  if (s.includes('REALIZADO') || s.includes('COMPLETADO')) return '--good';
  if (s.includes('CANCELAD')) return '--text-muted';
  if (s.includes('PROCESO')) return '--series-1';
  return '--warn';
}
function estadoMovColor(v) {
  return getComputedStyle(document.querySelector('.viz-root')).getPropertyValue(estadoMovColorVar(v)).trim();
}
function movBadge(v) {
  const c = estadoMovColor(v); const label = v || 'Sin estado';
  return `<span class="badge" style="background:color-mix(in srgb, ${c} 16%, transparent); color:${c}"><span class="dot" style="background:${c}"></span>${label}</span>`;
}
const MOV_STAGES = [
  { key: 'Pendiente', label: 'Pendiente', colorVar: '--warn' },
  { key: 'En proceso', label: 'En proceso', colorVar: '--series-1' },
  { key: 'Realizado', label: 'Realizado', colorVar: '--good' },
];
function movStageOf(d) {
  const s = (d.ESTADO || '').toUpperCase();
  if (s.includes('REALIZADO') || s.includes('COMPLETADO')) return 'Realizado';
  if (s.includes('PROCESO')) return 'En proceso';
  return 'Pendiente';
}

async function addMov() {
  const btn = document.getElementById('addBtnV'); btn.disabled = true;
  try {
    setRowStatus('statusMovs', 'Creando…');
    const row = await insertRow('movimientos', MOV_MAP, blankMov());
    DATA_V.unshift(row);
    stateV.search = '';
    const si = document.getElementById('searchInputV'); if (si) si.value = '';
    setRowStatus('statusMovs', 'Movimiento creado', 'ok');
    refreshMovsViews();
    switchMovsView('tabla', row._id);
  } catch (e) {
    setRowStatus('statusMovs', 'Error: ' + e.message, 'err');
  } finally { btn.disabled = false; }
}

async function deleteMov(id) {
  const idx = DATA_V.findIndex(d => d._id === id);
  if (idx < 0) return;
  const row = DATA_V[idx];
  if (!confirm(`¿Eliminar el movimiento ${row.PLACA_SALIENTE || '?'} → ${row.PLACA_ENTRANTE || '?'}? Esta accion es permanente.`)) return;
  try {
    setRowStatus('statusMovs', 'Eliminando…');
    await deleteRow('movimientos', id);
    DATA_V.splice(idx, 1);
    setRowStatus('statusMovs', 'Eliminado', 'ok');
    refreshMovsViews();
  } catch (e) {
    setRowStatus('statusMovs', 'Error al eliminar: ' + e.message, 'err');
  }
}

async function commitEditV(id, key, type, rawText) {
  const row = DATA_V.find(d => d._id === id);
  if (!row) return false;
  const parsed = parseEditValue(type, rawText);
  if (parsed === undefined) return false;
  if (parsed === row[key]) return true;
  const prev = row[key];
  row[key] = parsed;
  try {
    setRowStatus('statusMovs', 'Guardando…');
    await updateField('movimientos', id, MOV_MAP[key], parsed);
    setRowStatus('statusMovs', 'Guardado', 'ok');
    buildMovsKPIs(); renderKanban();
    return true;
  } catch (e) {
    row[key] = prev;
    setRowStatus('statusMovs', 'Error al guardar: ' + e.message, 'err');
    buildMovsKPIs(); renderKanban(); renderMovsTable();
    return false;
  }
}

function wireEditableCellsV() {
  document.querySelectorAll('#tableBodyV td.editable-td').forEach(td => {
    td.addEventListener('focus', () => {
      const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
      const row = DATA_V.find(d => d._id === id);
      if (!row) return;
      td.textContent = editDisplayValue(row, {key, type});
      window.getSelection().selectAllChildren(td);
    });
    td.addEventListener('blur', async () => {
      const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
      const row = DATA_V.find(d => d._id === id);
      if (!row) return;
      await commitEditV(id, key, type, td.textContent);
      td.textContent = editDisplayValue(row, {key, type});
    });
    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
      if (e.key === 'Escape') {
        const id = td.dataset.id, key = td.dataset.key, type = td.dataset.type;
        const row = DATA_V.find(d => d._id === id);
        if (!row) return;
        td.textContent = editDisplayValue(row, {key, type});
        td.blur();
      }
    });
  });
}

const MOV_COLUMNS = [
  { key: 'SEDE', label: 'Sede', default: true, type: 'text' },
  { key: 'PLACA_SALIENTE', label: 'Sale (placa)', default: true, type: 'model' },
  { key: 'DESC_SALIENTE', label: 'Sale (marca/linea)', default: true, type: 'text' },
  { key: 'MODELO_SALIENTE', label: 'Sale (modelo)', default: false, type: 'year' },
  { key: 'PLACA_ENTRANTE', label: 'Entra (placa)', default: true, type: 'model' },
  { key: 'DESC_ENTRANTE', label: 'Entra (marca/linea)', default: true, type: 'text' },
  { key: 'MODELO_ENTRANTE', label: 'Entra (modelo)', default: false, type: 'year' },
  { key: 'QUE_PASO', label: 'Que paso con el saliente', default: true, type: 'nota' },
  { key: 'ESTADO', label: 'Estado', default: true, type: 'badge_mov' },
  { key: 'RESPONSABLE', label: 'Responsable', default: true, type: 'text' },
  { key: 'FECHA', label: 'Fecha', default: false, type: 'date' },
  { key: 'NOTA', label: 'Nota', default: false, type: 'nota' },
];
let stateV = { search: '', sortKey: null, sortDir: 1, visibleCols: new Set(MOV_COLUMNS.filter(c => c.default).map(c => c.key)), view: 'kanban' };

function buildMovsColMenu() {
  const menu = document.getElementById('colMenuV');
  menu.innerHTML = MOV_COLUMNS.map(c => `<label><input type="checkbox" data-col="${c.key}" ${stateV.visibleCols.has(c.key)?'checked':''}> ${c.label}</label>`).join('');
  menu.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.checked) stateV.visibleCols.add(inp.dataset.col); else stateV.visibleCols.delete(inp.dataset.col);
      renderMovsTable();
    });
  });
}

function buildMovsKPIs() {
  const total = DATA_V.length;
  const pendientes = DATA_V.filter(d => movStageOf(d) === 'Pendiente').length;
  const enProceso = DATA_V.filter(d => movStageOf(d) === 'En proceso').length;
  const realizados = DATA_V.filter(d => movStageOf(d) === 'Realizado').length;
  const tiles = [
    { label: 'Total movimientos', value: fmtInt(total), note: 'Cambios de vehiculo registrados' },
    { label: 'Pendientes', value: fmtInt(pendientes), note: 'Aun no iniciados' },
    { label: 'En proceso', value: fmtInt(enProceso), note: 'En ejecucion' },
    { label: 'Realizados', value: fmtInt(realizados), note: total ? Math.round(realizados/total*100) + '% del total' : '—' },
  ];
  document.getElementById('kpiRowMovs').innerHTML = tiles.map(t => `
    <div class="kpi-tile"><div class="kpi-label">${t.label}</div><div class="kpi-value">${t.value}</div><div class="kpi-note">${t.note}</div></div>`).join('');
  const cnt = document.getElementById('movsTabCount'); if (cnt) cnt.textContent = '(' + total + ')';
}

function cellValueV(row, col) {
  const v = row[col.key];
  switch(col.type) {
    case 'badge_mov': return movBadge(v);
    case 'date': return fmtDate(v);
    case 'year': return (v===null||v===undefined||v==='') ? '—' : String(v);
    case 'model': return v || '—';
    case 'nota': return v || '<span style="color:var(--text-muted)">—</span>';
    default: return (v===null||v===undefined||v==='') ? '—' : v;
  }
}

function filteredSortedRowsV() {
  let rows = DATA_V.slice();
  if (stateV.search) {
    const q = stateV.search.toLowerCase();
    rows = rows.filter(d =>
      (d.PLACA_SALIENTE||'').toLowerCase().includes(q) || (d.PLACA_ENTRANTE||'').toLowerCase().includes(q) ||
      (d.SEDE||'').toLowerCase().includes(q) || (d.RESPONSABLE||'').toLowerCase().includes(q) ||
      (d.QUE_PASO||'').toLowerCase().includes(q));
  }
  if (stateV.sortKey) {
    rows = rows.slice().sort((a,b) => {
      let av = a[stateV.sortKey], bv = b[stateV.sortKey];
      if (av === null || av === undefined) av = ''; if (bv === null || bv === undefined) bv = '';
      if (typeof av === 'number' && typeof bv === 'number') return (av-bv) * stateV.sortDir;
      return String(av).localeCompare(String(bv)) * stateV.sortDir;
    });
  }
  return rows;
}

function renderMovsTableHead() {
  const cols = MOV_COLUMNS.filter(c => stateV.visibleCols.has(c.key));
  const head = document.getElementById('tableHeadV');
  head.innerHTML = '<th class="actions-col"></th>' + cols.map(c => {
    const arrow = stateV.sortKey === c.key ? (stateV.sortDir===1?'▲':'▼') : '';
    const numClass = c.type === 'year' ? 'num' : '';
    return `<th class="${numClass}" data-key="${c.key}">${c.label}<span class="sort-arrow">${arrow}</span></th>`;
  }).join('');
  head.querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (stateV.sortKey === key) stateV.sortDir *= -1; else { stateV.sortKey = key; stateV.sortDir = 1; }
      renderMovsTable();
    });
  });
}

function renderMovsTable() {
  renderMovsTableHead();
  const cols = MOV_COLUMNS.filter(c => stateV.visibleCols.has(c.key));
  const rows = filteredSortedRowsV();
  const body = document.getElementById('tableBodyV');
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="${cols.length+1}"><div class="empty-state">No hay movimientos que coincidan con el filtro.</div></td></tr>`;
  } else {
    body.innerHTML = rows.map(r => {
      const delCell = `<td class="actions-col"><button class="del-btn" data-id="${r._id}" title="Eliminar movimiento" type="button">🗑</button></td>`;
      return `<tr>` + delCell + cols.map(c => {
        const cls = (c.type==='year' ? 'num' : (c.type==='model'?'model':(c.type==='nota'?'nota':'')));
        const dtype = c.type === 'badge_mov' ? 'text' : c.type;
        return `<td class="${cls} editable-td" data-id="${r._id}" data-key="${c.key}" data-type="${dtype}" contenteditable="true" spellcheck="false">${cellValueV(r, c)}</td>`;
      }).join('') + '</tr>';
    }).join('');
  }
  document.getElementById('rowCountV').textContent = rows.length.toLocaleString('es-CO') + ' de ' + DATA_V.length.toLocaleString('es-CO') + ' movimientos';
  wireEditableCellsV();
  document.querySelectorAll('#tableBodyV .del-btn').forEach(btn => btn.addEventListener('click', () => deleteMov(btn.dataset.id)));
}

function kanbanCardHtml(r) {
  const fecha = r.FECHA ? fmtDate(r.FECHA) : '';
  const sale = [r.PLACA_SALIENTE, r.DESC_SALIENTE].filter(Boolean).join(' — ') || 'Sin placa';
  const entra = [r.PLACA_ENTRANTE, r.DESC_ENTRANTE].filter(Boolean).join(' — ') || 'Sin placa';
  return `
    <div class="kanban-card" draggable="true" data-id="${r._id}">
      <div class="kanban-card-top"><span>${r.SEDE || 'Sin sede'}</span><span>${fecha}</span></div>
      <div class="kanban-card-title">${r.PLACA_SALIENTE || '?'} → ${r.PLACA_ENTRANTE || '?'}</div>
      <div class="kanban-card-line"><strong>Sale:</strong> ${sale}</div>
      <div class="kanban-card-line"><strong>Entra:</strong> ${entra}</div>
      ${r.RESPONSABLE ? `<div class="kanban-card-line"><strong>Responsable:</strong> ${r.RESPONSABLE}</div>` : ''}
      ${r.QUE_PASO ? `<div class="kanban-card-line"><strong>Que paso:</strong> ${r.QUE_PASO}</div>` : ''}
      <div class="kanban-card-actions">
        <button class="kanban-card-btn" data-action="edit" data-id="${r._id}" type="button">✏️ Ver / Editar</button>
        <button class="kanban-card-btn" data-action="delete" data-id="${r._id}" type="button">🗑 Eliminar</button>
      </div>
    </div>`;
}

function renderKanban() {
  const board = document.getElementById('movsKanbanView');
  if (!board) return;
  board.innerHTML = MOV_STAGES.map(stage => {
    const cards = DATA_V.filter(d => movStageOf(d) === stage.key);
    const color = getComputedStyle(document.querySelector('.viz-root')).getPropertyValue(stage.colorVar).trim();
    const body = cards.length ? cards.map(kanbanCardHtml).join('') : `<div class="kanban-empty">Sin movimientos</div>`;
    return `
      <div class="kanban-col" data-stage="${stage.key}">
        <div class="kanban-col-head"><span class="kanban-col-title" style="color:${color}">${stage.label}</span><span class="kanban-count">${cards.length}</span></div>
        <div class="kanban-col-body" data-stage="${stage.key}">${body}</div>
      </div>`;
  }).join('');
  wireKanban();
}

function wireKanban() {
  const board = document.getElementById('movsKanbanView');
  if (!board) return;
  board.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    const editBtn = card.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.addEventListener('click', () => switchMovsView('tabla', editBtn.dataset.id));
    const delBtn = card.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener('click', () => deleteMov(delBtn.dataset.id));
  });
  board.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const row = DATA_V.find(d => d._id === id);
      const newStage = col.dataset.stage;
      if (!row || movStageOf(row) === newStage) return;
      await commitEditV(id, 'ESTADO', 'text', newStage);
      refreshMovsViews();
    });
  });
}

function switchMovsView(view, focusId) {
  stateV.view = view;
  document.querySelectorAll('#movsViewTabs .tab').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.getElementById('movsKanbanView').style.display = view === 'kanban' ? 'flex' : 'none';
  document.getElementById('movsTablaView').style.display = view === 'tabla' ? 'block' : 'none';
  document.getElementById('movsColToggleWrap').style.display = view === 'tabla' ? '' : 'none';
  document.getElementById('movsSearchWrap').style.display = view === 'tabla' ? '' : 'none';
  document.getElementById('movsEditHint').textContent = view === 'kanban'
    ? '🖱️ Arrastra una tarjeta a otra columna para cambiar su estado.'
    : '✏️ Haz clic en una celda para editarla.';
  if (view === 'tabla' && focusId !== undefined) {
    requestAnimationFrame(() => {
      const firstCell = document.querySelector(`#tableBodyV td.editable-td[data-id="${focusId}"]`);
      if (firstCell) firstCell.focus();
    });
  }
}
function refreshMovsViews() { buildMovsKPIs(); renderMovsTable(); renderKanban(); }

document.querySelectorAll('#movsViewTabs .tab').forEach(btn => btn.addEventListener('click', () => switchMovsView(btn.dataset.view)));
document.getElementById('searchInputV').addEventListener('input', (e) => { stateV.search = e.target.value; renderMovsTable(); });
document.getElementById('colToggleBtnV').addEventListener('click', () => document.getElementById('colMenuV').classList.toggle('open'));
document.getElementById('addBtnV').addEventListener('click', addMov);
document.addEventListener('click', (e) => {
  const wrapV = document.querySelector('#sectionMovs .col-toggle-wrap');
  if (wrapV && !wrapV.contains(e.target)) document.getElementById('colMenuV').classList.remove('open');
});

// ==================== Wire up: vehiculos + multas controls ====================
document.getElementById('searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
document.getElementById('colToggleBtn').addEventListener('click', () => document.getElementById('colMenu').classList.toggle('open'));
document.getElementById('addBtn').addEventListener('click', addVehicle);
document.getElementById('searchInputM').addEventListener('input', (e) => { stateM.search = e.target.value; renderMultasTable(); });
document.getElementById('colToggleBtnM').addEventListener('click', () => document.getElementById('colMenuM').classList.toggle('open'));
document.getElementById('addBtnM').addEventListener('click', addMulta);
document.addEventListener('click', (e) => {
  const wrap = document.querySelector('.col-toggle-wrap');
  if (wrap && !wrap.contains(e.target)) document.getElementById('colMenu').classList.remove('open');
  const wrapM = document.querySelector('#sectionMultas .col-toggle-wrap');
  if (wrapM && !wrapM.contains(e.target)) document.getElementById('colMenuM').classList.remove('open');
  const kpiWrap = document.querySelector('.kpi-toggle-wrap');
  if (kpiWrap) { const m = document.getElementById('kpiCatMenu'); if (m && !kpiWrap.contains(e.target)) m.classList.remove('open'); }
});

// ==================== Theme toggle ====================
const root = document.documentElement;
const themeBtn = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeLabel = document.getElementById('themeLabel');
function applyTheme(mode) {
  if (mode === 'dark') { root.setAttribute('data-theme','dark'); themeIcon.textContent='☀️'; themeLabel.textContent='Claro'; }
  else { root.setAttribute('data-theme','light'); themeIcon.textContent='🌙'; themeLabel.textContent='Oscuro'; }
  renderCharts(); buildTabs(); buildPropTabs(); renderTable(); renderKanban();
}
let currentTheme = 'light';
themeBtn.addEventListener('click', () => { currentTheme = currentTheme === 'light' ? 'dark' : 'light'; applyTheme(currentTheme); });

// ==================== Page tab switcher ====================
const PAGE_TABS = [
  { btn: 'pageTabFlota', section: 'sectionFlota' },
  { btn: 'pageTabMultas', section: 'sectionMultas' },
  { btn: 'pageTabMovs', section: 'sectionMovs' },
];
PAGE_TABS.forEach(t => {
  document.getElementById(t.btn).addEventListener('click', () => {
    PAGE_TABS.forEach(o => {
      document.getElementById(o.btn).classList.toggle('active', o.btn === t.btn);
      document.getElementById(o.section).classList.toggle('active', o.section === t.section);
    });
  });
});

// ==================== Init: load everything from Supabase ====================
async function init() {
  setConn('busy', 'Conectando a Supabase…');
  try {
    const [vehiculos, multas, movs] = await Promise.all([
      fetchTable('vehiculos', VEHICULO_MAP),
      fetchTable('multas', MULTA_MAP),
      fetchTable('movimientos', MOV_MAP),
    ]);
    DATA = vehiculos; DATA.forEach(d => { d.ALERTA = computeAlerta(d); d.PROP_GROUP = computePropGroup(d); });
    DATA_MULTAS = multas;
    DATA_V = movs;
    state.cats = new Set(CATS);
    state.propGroups = new Set(PROP_GROUPS);
    setConn('ok', 'Conectado');
    buildKPIs(); renderCharts(); buildTabs(); buildPropTabs(); buildColMenu(); renderTable();
    buildMultasKPIs(); buildMultasEstadoTabs(); buildMultasColMenu(); renderMultasTable();
    buildMovsColMenu(); refreshMovsViews(); switchMovsView('kanban');
  } catch (e) {
    setConn('err', 'Error de conexion: ' + e.message);
    console.error(e);
  }
}
init();
