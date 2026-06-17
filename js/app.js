// ============================================================
//  DEFAULTS — valores iniciales para usuarios nuevos
//  (Los datos existentes de cada usuario se cargan de localStorage + Firestore)
// ============================================================
const DEFAULT_INGRESOS_GRUPOS = [];
const DEFAULT_GASTOS_GRUPOS = [];
const DEFAULT_DEUDAS = [];
const DEFAULT_PRESTAMOS = [];

// ============================================================
//  CATEGORÍAS INDEPENDIENTES (con colores y límites)
// ============================================================
const DEFAULT_CATEGORIAS = [
  { id: 'c1', name: 'Comida',     color: '#6c63ff', limit: 0 },
  { id: 'c2', name: 'Ocio',       color: '#e74c3c', limit: 0 },
  { id: 'c3', name: 'Deudas',     color: '#f39c12', limit: 0 },
  { id: 'c4', name: 'Transporte', color: '#2ecc71', limit: 0 },
  { id: 'c5', name: 'Servicios',  color: '#9b59b6', limit: 0 },
  { id: 'c6', name: 'Salud',      color: '#1abc9c', limit: 0 },
  { id: 'c7', name: 'Otros',      color: '#95a5a6', limit: 0 },
];

// ============================================================
//  FIREBASE
// ============================================================
let db;
try {
  firebase.initializeApp({
    apiKey: "AIzaSyBdtX-lToNn5Pi-ielqJH9Tc1aZ2yuinH4",
    authDomain: "mis-finanzas-a35e3.firebaseapp.com",
    projectId: "mis-finanzas-a35e3",
    storageBucket: "mis-finanzas-a35e3.firebasestorage.app",
    messagingSenderId: "320795705031",
    appId: "1:320795705031:web:1729ca638d1e94ee8908e2"
  });
  db  = firebase.firestore();
} catch(e) {
  console.warn('Firebase no disponible — modo solo local:', e);
}

// ============================================================
//  AUTH — Firebase Authentication
// ============================================================
let currentUser = null;
let _authResolve = null;
const authReady = new Promise(res => { _authResolve = res; });

function uid() { return currentUser ? currentUser.uid : '__anon__'; }

function userDocRef() {
  if (!currentUser || !db) return null;
  return db.collection('users').doc(currentUser.uid).collection('data').doc('main');
}

// storageKey: prefija con uid para aislar datos por usuario en localStorage
function storageKey(base) {
  const u = currentUser ? currentUser.uid : '__anon__';
  return `mf_${u}_${base}`;
}

// Auth UI
function toggleAuthMode() {
  const btn = document.getElementById('auth-submit-btn');
  const subtitle = document.getElementById('auth-subtitle');
  const toggleText = document.getElementById('auth-toggle-text');
  const err = document.getElementById('auth-error');
  err.style.display = 'none';
  if (btn.textContent === 'Iniciar sesión') {
    btn.textContent = 'Crear cuenta';
    subtitle.textContent = 'Creá tu cuenta para empezar';
    toggleText.innerHTML = '¿Ya tenés cuenta? <a href="#" onclick="toggleAuthMode()">Iniciá sesión</a>';
  } else {
    btn.textContent = 'Iniciar sesión';
    subtitle.textContent = 'Inicia sesión para continuar';
    toggleText.innerHTML = '¿No tenés cuenta? <a href="#" onclick="toggleAuthMode()">Registrate</a>';
  }
}

function authShowError(msg) {
  const err = document.getElementById('auth-error');
  err.textContent = msg;
  err.style.display = 'block';
}

function authSubmit() {
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-password').value.trim();
  if (!email || !pass) { authShowError('Completá email y contraseña'); return; }
  if (pass.length < 6) { authShowError('La contraseña debe tener al menos 6 caracteres'); return; }

  const btn = document.getElementById('auth-submit-btn');
  const isLogin = btn.textContent === 'Iniciar sesión';
  btn.disabled = true;
  btn.textContent = '...';

  const promise = isLogin
    ? firebase.auth().signInWithEmailAndPassword(email, pass)
    : firebase.auth().createUserWithEmailAndPassword(email, pass);

  promise
    .then(result => {
      if (!isLogin) {
        // Registro exitoso — migrar datos anónimos si existen
        migrateAnonymousData(result.user);
      }
    })
    .catch(err => {
      const msgs = {
        'auth/user-not-found': 'No hay cuenta con ese email',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/invalid-credential': 'Email o contraseña incorrectos',
        'auth/email-already-in-use': 'Ya existe una cuenta con ese email',
        'auth/weak-password': 'La contraseña es muy débil (mín 6 caracteres)',
        'auth/invalid-email': 'El email no es válido',
        'auth/too-many-requests': 'Demasiados intentos. Esperá un rato y volvé a intentar',
      };
      authShowError(msgs[err.code] || err.message || 'Error al autenticar');
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
    });
}

function authLogout() {
  firebase.auth().signOut().catch(e => console.warn('Error al cerrar sesión:', e));
}

// Migrar datos anónimos al nuevo usuario
function migrateAnonymousData(user) {
  const anonKeys = ['categorias', 'ingresos_grupos', 'gastos', 'log', 'ing_log', 'deudas', 'prestamos'];
  const hasAnonData = anonKeys.some(k => localStorage.getItem(`mf_${k}`) !== null);

  if (!hasAnonData) return;

  // Mostrar modal de migración
  const overlay = document.createElement('div');
  overlay.id = 'mf-migrate-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '999999',
    background: 'rgba(0,0,0,.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)'
  });
  const box = document.createElement('div');
  Object.assign(box.style, {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: '14px', padding: '28px 32px', maxWidth: '380px',
    textAlign: 'center', boxShadow: '0 16px 48px rgba(0,0,0,.5)'
  });
  box.innerHTML = `
    <p style="margin-bottom:8px;font-size:1.2rem;">📦</p>
    <p style="margin-bottom:16px;font-size:.95rem;color:var(--text);line-height:1.5;">
      Tenés datos guardados localmente.<br><strong>¿Querés migrarlos a tu cuenta?</strong>
    </p>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button id="mf-migrate-yes" class="btn">Sí, migrar</button>
      <button id="mf-migrate-no" class="btn btn-outline">No, empezar de cero</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('mf-migrate-yes').onclick = () => {
    overlay.remove();
    anonKeys.forEach(k => {
      const anonVal = localStorage.getItem(`mf_${k}`);
      if (anonVal !== null) {
        localStorage.setItem(`mf_${user.uid}_${k}`, anonVal);
        localStorage.removeItem(`mf_${k}`);
      }
    });
    showToast('✅ Datos migrados correctamente', 'green');
    // Recargar datos con el nuevo uid
    loadAllData(user);
  };
  document.getElementById('mf-migrate-no').onclick = () => {
    overlay.remove();
    // Limpiar datos anónimos
    anonKeys.forEach(k => localStorage.removeItem(`mf_${k}`));
    loadAllData(user);
  };
}

// ============================================================
//  SAVE — localStorage + Firestore
// ============================================================
let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const doc = userDocRef();
    if (doc) {
      doc.set({ categorias, ingresosGrupos, gastosGrupos, gastosLog, ingresosLog, deudas, prestamos })
         .catch(e => console.warn('Error al guardar en la nube:', e));
    }
  }, 800);
}

// ============================================================
//  STATE — localStorage (caché) + Firestore (nube)
// ============================================================
function load(key, def) {
  const k = storageKey(key);
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : JSON.parse(JSON.stringify(def)); }
  catch { return JSON.parse(JSON.stringify(def)); }
}
function save(key, val) {
  localStorage.setItem(storageKey(key), JSON.stringify(val)); // caché local
  scheduleSave();                                              // sync a la nube
  showSavedIndicator();
}

// Indicador "✓ Guardado" que aparece brevemente
let _savedTimer = null;
function showSavedIndicator() {
  clearTimeout(_savedTimer);
  let el = document.getElementById('mf-saved');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mf-saved';
    el.textContent = '✓ Guardado';
    Object.assign(el.style, {
      position: 'fixed', top: '14px', right: '16px', zIndex: '99998',
      background: 'rgba(46,204,113,.15)', color: 'var(--green)',
      border: '1px solid rgba(46,204,113,.3)',
      padding: '6px 14px', borderRadius: '8px', fontSize: '.8rem', fontWeight: '600',
      opacity: '0', transform: 'translateY(-8px)',
      transition: 'opacity .2s, transform .2s', pointerEvents: 'none'
    });
    document.body.appendChild(el);
  }
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  _savedTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
  }, 1400);
}

let categorias = load('categorias', DEFAULT_CATEGORIAS);
let ingresosGrupos = load('ingresos_grupos', DEFAULT_INGRESOS_GRUPOS);
let ingresosLog = load('ing_log', []);
let gastosGrupos = load('gastos', DEFAULT_GASTOS_GRUPOS);
let gastosLog = load('log', []);
let deudas = load('deudas', DEFAULT_DEUDAS);
let prestamos = load('prestamos', DEFAULT_PRESTAMOS);

// ============================================================
//  HELPERS
// ============================================================
const fmt = n => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const today = () => new Date().toISOString().split('T')[0];
const monthLabel = d => { const [y, m] = d.split('-'); const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']; return names[parseInt(m)-1] + ' ' + y; };

// Genera N colores visualmente distintos usando HSL + ángulo áureo
function generateColors(n) {
  const goldenAngle = 137.508;
  const saturation = 65, lightness = 60;
  return Array.from({ length: n }, (_, i) =>
    `hsl(${(i * goldenAngle) % 360}, ${saturation}%, ${lightness}%)`
  );
}

// Toast notifications
function showToast(msg, type) {
  const existing = document.getElementById('mf-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'mf-toast';
  const bgColors = { green: 'var(--green)', red: 'var(--red)', yellow: 'var(--yellow)', accent: 'var(--accent)' };
  const bg = bgColors[type] || bgColors.accent;
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '80px', right: '16px', zIndex: '99999',
    background: bg, color: '#fff', padding: '10px 20px', borderRadius: '10px',
    fontSize: '.88rem', fontWeight: '600', opacity: '0', transform: 'translateY(12px)',
    transition: 'opacity .25s, transform .25s', boxShadow: '0 8px 24px rgba(0,0,0,.4)',
    maxWidth: '320px', pointerEvents: 'none'
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Confirm dialog modal (no bloqueante)
function confirmCustom(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    const box = document.createElement('div');
    overlay.id = 'mf-confirm-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '999999',
      background: 'rgba(0,0,0,.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(4px)'
    });
    Object.assign(box.style, {
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '28px 32px', maxWidth: '380px',
      textAlign: 'center', boxShadow: '0 16px 48px rgba(0,0,0,.5)'
    });
    box.innerHTML = `
      <p style="margin-bottom:20px;font-size:.95rem;color:var(--text);line-height:1.5;">${msg}</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button id="mf-confirm-yes" class="btn">Sí, restaurar</button>
        <button id="mf-confirm-no" class="btn btn-outline">Cancelar</button>
      </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById('mf-confirm-yes').onclick = () => { overlay.remove(); resolve(true); };
    document.getElementById('mf-confirm-no').onclick = () => { overlay.remove(); resolve(false); };
  });
}

function totalIngresos() { return ingresosGrupos.reduce((s, g) => s + g.items.reduce((ss, i) => ss + (i.amount || 0), 0), 0); }
function totalGastosFijos() { return gastosGrupos.reduce((s, g) => s + g.items.reduce((ss, it) => ss + (it.amount || 0), 0), 0); }
function totalGastosLog(filterMonth) {
  let items = gastosLog;
  if (filterMonth && filterMonth !== 'all') items = items.filter(g => g.date && g.date.startsWith(filterMonth));
  return items.reduce((s, g) => s + (g.amount || 0), 0);
}
function balance() { return totalIngresos() - totalGastosFijos(); }

// ============================================================
//  NAVIGATION
// ============================================================
function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#bottom-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const pageLabel = { dashboard:'dashboard', presupuesto:'presupuesto', gastos:'gastos', 'ingresos-log':'ingresos', deudas:'deudas' };
  document.querySelectorAll('nav button').forEach(b => { if (b.textContent.toLowerCase().trim() === (pageLabel[page]||page)) b.classList.add('active'); });
  document.querySelectorAll('#bottom-nav button').forEach(b => { if (b.dataset.page === page) b.classList.add('active'); });
  if (page === 'dashboard') renderDashboard();
  if (page === 'presupuesto') renderPresupuesto();
  if (page === '_gastos_skip') renderGastos(); // handled above
  if (page === 'gastos') { renderGastosFijos(); renderGastos(); populateCatSelect('g-cat', categorias); }
  if (page === 'ingresos-log') { renderIngresosFijos(); renderIngresosLog(); populateCatSelect('il-cat', ingresosGrupos); }
  if (page === 'deudas') { renderDeudas(); renderPrestamos(); }
}

// ============================================================
//  DASHBOARD
// ============================================================
let chartGastos, chartBalance;

function renderDashboard() {
  const ing = totalIngresos();
  const gas = totalGastosFijos();
  const bal = ing - gas;
  const pct = Math.round((gas / ing) * 100);

  // alert
  const alertEl = document.getElementById('alert-balance');
  if (bal < 0) {
    alertEl.innerHTML = `<div class="alert alert-red">⚠️ <strong>Déficit mensual de ${fmt(Math.abs(bal))}</strong> — tus gastos fijos superan tus ingresos. Revisa la sección Presupuesto para identificar qué podrías reducir.</div>`;
  } else if (bal < 200) {
    alertEl.innerHTML = `<div class="alert alert-yellow">⚡ Tu saldo disponible es ajustado (${fmt(bal)}). Intenta reducir algún gasto variable.</div>`;
  } else {
    alertEl.innerHTML = `<div class="alert alert-green">✅ Tienes un margen positivo de ${fmt(bal)} este mes.</div>`;
  }

  // cards
  document.getElementById('dash-cards').innerHTML = `
    <div class="card">
      <div class="label">Ingresos totales</div>
      <div class="value green">${fmt(ing)}</div>
      <div class="sub">${ingresosGrupos.flatMap(g=>g.items).filter(i=>i.amount>0).length} fuentes de ingreso</div>
    </div>
    <div class="card">
      <div class="label">Gastos fijos</div>
      <div class="value red">${fmt(gas)}</div>
      <div class="sub">${pct}% de tus ingresos</div>
    </div>
    <div class="card">
      <div class="label">Saldo disponible</div>
      <div class="value ${bal >= 0 ? 'green' : 'red'}">${fmt(bal)}</div>
      <div class="sub">Después de todos los fijos</div>
    </div>
    <div class="card">
      <div class="label">Total deudas</div>
      <div class="value yellow">${fmt(deudas.reduce((s,d)=>s+(d.total-d.paid),0))}</div>
      <div class="sub">${deudas.length} deudas activas</div>
    </div>
  `;

  // progress bars
  const groups = gastosGrupos.map(g => ({
    name: g.name,
    total: g.items.reduce((s, it) => s + (it.amount||0), 0)
  }));
  let progressHTML = '';
  groups.forEach(g => {
    const pctG = Math.min(100, Math.round((g.total / ing) * 100));
    const color = pctG > 60 ? 'var(--red)' : pctG > 35 ? 'var(--yellow)' : 'var(--green)';
    progressHTML += `
      <div class="progress-label"><span>${g.name}</span><span>${fmt(g.total)} (${pctG}%)</span></div>
      <div class="progress-wrap"><div class="progress-fill" style="width:${pctG}%;background:${color}"></div></div>
    `;
  });
  document.getElementById('dash-progress').innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h3 style="margin-bottom:14px;">Peso de cada categoría sobre ingresos</h3>
      ${progressHTML}
    </div>
  `;

  // --- Límites por categoría (gastos variables) ---
  const fechaActual = today();
  const mesActual = fechaActual.slice(0, 7);
  const gastosDelMes = gastosLog.filter(g => g.date && g.date.startsWith(mesActual));
  const gastosPorCat = {};
  gastosDelMes.forEach(g => { gastosPorCat[g.cat] = (gastosPorCat[g.cat] || 0) + (g.amount || 0); });

  let limitesHTML = '';
  let limitesCount = 0;
  categorias.forEach(c => {
    if (c.limit > 0) {
      limitesCount++;
      const gastado = gastosPorCat[c.name] || 0;
      const pctL = Math.min(100, Math.round((gastado / c.limit) * 100));
      const colorL = pctL >= 100 ? 'var(--red)' : pctL > 75 ? 'var(--yellow)' : 'var(--green)';
      limitesHTML += `
        <div class="progress-label"><span>${c.name}</span><span>${fmt(gastado)} / ${fmt(c.limit)} (${pctL}%)</span></div>
        <div class="progress-wrap"><div class="progress-fill" style="width:${pctL}%;background:${colorL}"></div></div>`;
    }
  });

  if (limitesCount > 0) {
    document.getElementById('dash-limits').style.display = '';
    document.getElementById('dash-limits-content').innerHTML = limitesHTML;
  } else {
    document.getElementById('dash-limits').style.display = 'none';
  }

  // charts
  const labels = groups.map(g => g.name.replace(/^[^\s]+ /, ''));
  const data = groups.map(g => g.total);
  const colors = groups.map(g => {
    const c = categorias.find(cat => g.name.toLowerCase().includes(cat.name.toLowerCase()) || cat.name.toLowerCase().includes(g.name.toLowerCase().replace(/^[^\s]+\s/, '')));
    return c ? c.color : generateColors(1)[0];
  });

  if (chartGastos) chartGastos.destroy();
  chartGastos = new Chart(document.getElementById('chartGastos'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#1a1d27' }] },
    options: { plugins: { legend: { labels: { color: '#8892b0', font: { size: 11 } } } }, cutout: '65%' }
  });

  if (chartBalance) chartBalance.destroy();
  chartBalance = new Chart(document.getElementById('chartBalance'), {
    type: 'bar',
    data: {
      labels: ['Ingresos', 'Gastos fijos', 'Disponible'],
      datasets: [{
        data: [ing, gas, Math.max(0, bal)],
        backgroundColor: ['rgba(46,204,113,.7)', 'rgba(231,76,60,.7)', 'rgba(108,99,255,.7)'],
        borderRadius: 6
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8892b0' }, grid: { color: '#2e3350' } },
        y: { ticks: { color: '#8892b0', callback: v => v + '€' }, grid: { color: '#2e3350' } }
      }
    }
  });
}

// ============================================================
//  PRESUPUESTO
// ============================================================
function renderPresupuesto() {
  // Ingresos agrupados
  let html = '';
  ingresosGrupos.forEach(g => {
    const gTotal = g.items.reduce((s, i) => s + (i.amount || 0), 0);
    html += `<div class="section" style="margin-bottom:12px;">
      <div class="section-header" onclick="toggleSection('pres-ing-${g.id}')">
        <span>${g.name}</span><span class="toggle green">${fmt(gTotal)}</span>
      </div>
      <div class="section-body" id="pres-ing-${g.id}">`;
    g.items.forEach(item => {
      html += `<div class="row-item">
        <span class="name">${item.name}</span>
        <div style="display:flex;align-items:center;">
          <input type="number" value="${item.amount}" step="0.01" min="0" onchange="updateIngreso('${g.id}','${item.id}',this.value)" />
          <button class="del-row" onclick="deleteIngreso('${g.id}','${item.id}')" title="Eliminar">✕</button>
        </div>
      </div>`;
    });
    html += `<div class="inline-add">
        <input type="text" id="pres-new-ing-name-${g.id}" placeholder="Nuevo ingreso..." />
        <input type="number" id="pres-new-ing-amt-${g.id}" placeholder="Importe €" min="0" step="0.01" />
        <button class="btn-add" onclick="addIngreso('${g.id}','pres')">+ Añadir</button>
      </div></div>
      <div class="total-row"><span>Subtotal</span><span class="green">${fmt(gTotal)}</span></div>
    </div>`;
  });
  html += `<div class="total-row" style="font-weight:600;"><span>Total ingresos</span><span class="green">${fmt(totalIngresos())}</span></div>`;
  document.getElementById('presupuesto-ingresos').innerHTML = html;

  // Gastos fijos
  let ghtml = '';
  gastosGrupos.forEach(g => {
    const gTotal = g.items.reduce((s, it) => s + (it.amount||0), 0);
    ghtml += `<div class="section" style="margin-bottom:12px;">
      <div class="section-header" onclick="toggleSection('body-${g.id}')">
        <span>${g.name}</span>
        <span class="toggle red">${fmt(gTotal)}</span>
      </div>
      <div class="section-body" id="body-${g.id}">`;
    g.items.forEach(item => {
      ghtml += `<div class="row-item">
        <span class="name">${item.name}</span>
        <div style="display:flex;align-items:center;">
          <input type="number" value="${item.amount}" step="0.01" min="0" onchange="updateGasto('${g.id}','${item.id}', this.value)" />
          <button class="del-row" onclick="deleteGastoItem('${g.id}','${item.id}')" title="Eliminar">✕</button>
        </div>
      </div>`;
    });
    ghtml += `<div class="inline-add">
        <input type="text" id="new-g-name-${g.id}" placeholder="Nuevo gasto..." />
        <input type="number" id="new-g-amt-${g.id}" placeholder="Importe €" min="0" step="0.01" />
        <button class="btn-add" onclick="addGastoItem('${g.id}')">+ Añadir</button>
      </div>
      </div>
      <div class="total-row"><span>Subtotal</span><span class="red">${fmt(gTotal)}</span></div>
    </div>`;
  });

  const bal = balance();
  ghtml += `<div class="card" style="margin-top:16px;border-color:${bal>=0?'var(--green)':'var(--red)'}">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:1rem;font-weight:600;">BALANCE MENSUAL</span>
      <span style="font-size:1.5rem;font-weight:700;" class="${bal>=0?'green':'red'}">${fmt(bal)}</span>
    </div>
    <div style="font-size:.8rem;color:var(--muted);margin-top:6px;">${fmt(totalIngresos())} ingresos − ${fmt(totalGastosFijos())} gastos fijos</div>
  </div>`;
  document.getElementById('presupuesto-gastos').innerHTML = ghtml;
}

function renderGastosFijos() {
  const el = document.getElementById('gastos-fijos-section');
  if (!el) return;
  let html = `<h3 style="margin-bottom:12px;">📌 Gastos fijos del presupuesto</h3>`;

  // Gestión de categorías (grupos)
  html += `<div class="section" style="margin-bottom:16px;">
    <div class="section-header" onclick="toggleSection('gf-cat-manager')">
      <span>⚙️ Editar los grupos del presupuesto</span>
      <span class="toggle">abrir</span>
    </div>
    <div id="gf-cat-manager" style="display:none;padding:12px 16px;">`;
  gastosGrupos.forEach(g => {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <input type="text" value="${g.name}" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-size:.85rem;"
        onchange="renameGastoGrupo('${g.id}',this.value)" />
      <button class="btn-sm btn-outline" style="color:var(--red);border-color:var(--red);" onclick="deleteGastoGrupo('${g.id}')">Eliminar</button>
    </div>`;
  });
  html += `<div style="display:flex;gap:8px;margin-top:10px;">
      <input type="text" id="gf-new-cat-name" placeholder="Nuevo grupo..." style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-size:.85rem;" />
      <button class="btn btn-sm" onclick="addGastoGrupo()">+ Añadir</button>
    </div>
    </div>
  </div>`;

  // Grupos con sus items
  gastosGrupos.forEach(g => {
    const gTotal = g.items.reduce((s, it) => s + (it.amount||0), 0);
    html += `<div class="section" style="margin-bottom:12px;">
      <div class="section-header" onclick="toggleSection('gf-body-${g.id}')">
        <span>${g.name}</span><span class="toggle red">${fmt(gTotal)}</span>
      </div>
      <div class="section-body" id="gf-body-${g.id}">`;
    g.items.forEach(item => {
      const moveOpts = gastosGrupos.filter(x => x.id !== g.id).map(x => `<option value="${x.id}">${x.name}</option>`).join('');
      html += `<div class="row-item">
        <span class="name">${item.name}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" value="${item.amount}" step="0.01" min="0" onchange="updateGasto('${g.id}','${item.id}',this.value)" />
          ${moveOpts ? `<select onchange="moveGastoItem('${g.id}','${item.id}',this.value)" title="Mover a categoría"
            style="background:var(--card2);border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:3px 6px;font-size:.72rem;cursor:pointer;">
            <option value="">↔ Mover</option>${moveOpts}</select>` : ''}
          <button class="del-row" onclick="deleteGastoItem('${g.id}','${item.id}')" title="Eliminar">✕</button>
        </div>
      </div>`;
    });
    html += `<div class="inline-add">
        <input type="text" id="gf-new-name-${g.id}" placeholder="Nuevo gasto fijo..." />
        <input type="number" id="gf-new-amt-${g.id}" placeholder="Importe €" min="0" step="0.01" />
        <button class="btn-add" onclick="addGastoItemFrom('${g.id}','gf')">+ Añadir</button>
      </div></div>
      <div class="total-row"><span>Subtotal</span><span class="red">${fmt(gTotal)}</span></div>
    </div>`;
  });

  html += `<div class="total-row" style="font-weight:700;border-top:2px solid var(--border);padding-top:10px;margin-bottom:24px;">
    <span>Total gastos fijos</span><span class="red">${fmt(totalGastosFijos())}</span>
  </div><hr style="border:none;border-top:1px solid var(--border);margin-bottom:20px;">`;
  el.innerHTML = html;
}

function moveGastoItem(fromGid, itemId, toGid) {
  if (!toGid) return;
  const fromG = gastosGrupos.find(g => g.id === fromGid);
  const toG   = gastosGrupos.find(g => g.id === toGid);
  if (!fromG || !toG) return;
  const idx = fromG.items.findIndex(i => i.id === itemId);
  if (idx === -1) return;
  toG.items.push(fromG.items.splice(idx, 1)[0]);
  save('gastos', gastosGrupos);
  syncAll();
}

function addGastoGrupo() {
  const name = document.getElementById('gf-new-cat-name').value.trim();
  if (!name) return;
  gastosGrupos.push({ id: 'g_' + Date.now(), name, items: [] });
  save('gastos', gastosGrupos);
  populateCatSelect('g-cat', categorias);
  syncAll();
}

function renameGastoGrupo(id, name) {
  const g = gastosGrupos.find(g => g.id === id);
  if (g) g.name = name;
  save('gastos', gastosGrupos);
  populateCatSelect('g-cat', categorias);
  syncAll();
}

function deleteGastoGrupo(id) {
  const g = gastosGrupos.find(g => g.id === id);
  if (!g) return;
  if (g.items.length > 0) {
    const badge = document.getElementById('gastos-total-badge');
    if (badge) { const o = badge.textContent; badge.textContent = '⚠️ Vacía la categoría primero'; setTimeout(() => badge.textContent = o, 2500); }
    return;
  }
  gastosGrupos = gastosGrupos.filter(g => g.id !== id);
  save('gastos', gastosGrupos);
  syncAll();
}

function renderIngresosFijos() {
  const el = document.getElementById('ingresos-fijos-section');
  if (!el) return;
  let html = `<h3 style="margin-bottom:12px;">📌 Ingresos fijos del presupuesto</h3>`;

  // Gestión de categorías (grupos)
  html += `<div class="section" style="margin-bottom:16px;">
    <div class="section-header" onclick="toggleSection('if-cat-manager')">
      <span>⚙️ Gestionar categorías de ingresos fijos</span>
      <span class="toggle">abrir</span>
    </div>
    <div id="if-cat-manager" style="display:none;padding:12px 16px;">`;
  ingresosGrupos.forEach(g => {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <input type="text" value="${g.name}" style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-size:.85rem;"
        onchange="renameIngresosGrupo('${g.id}',this.value)" />
      <button class="btn-sm btn-outline" style="color:var(--red);border-color:var(--red);" onclick="deleteIngresosGrupo('${g.id}')">Eliminar</button>
    </div>`;
  });
  html += `<div style="display:flex;gap:8px;margin-top:10px;">
      <input type="text" id="if-new-cat-name" placeholder="Nueva categoría..." style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-size:.85rem;" />
      <button class="btn btn-sm" onclick="addIngresosGrupo()">+ Añadir</button>
    </div>
    </div>
  </div>`;

  // Grupos con sus items
  const grupoOpts = ingresosGrupos.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  ingresosGrupos.forEach(g => {
    const gTotal = g.items.reduce((s, i) => s + (i.amount || 0), 0);
    html += `<div class="section" style="margin-bottom:12px;">
      <div class="section-header" onclick="toggleSection('if-body-${g.id}')">
        <span>${g.name}</span><span class="toggle green">${fmt(gTotal)}</span>
      </div>
      <div class="section-body" id="if-body-${g.id}">`;
    g.items.forEach(item => {
      const moveOpts = ingresosGrupos.filter(x => x.id !== g.id).map(x => `<option value="${x.id}">${x.name}</option>`).join('');
      html += `<div class="row-item">
        <span class="name">${item.name}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" value="${item.amount}" step="0.01" min="0" onchange="updateIngreso('${g.id}','${item.id}',this.value)" />
          ${moveOpts ? `<select onchange="moveIngresoItem('${g.id}','${item.id}',this.value)" title="Mover a categoría"
            style="background:var(--card2);border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:3px 6px;font-size:.72rem;cursor:pointer;">
            <option value="">↔ Mover</option>${moveOpts}</select>` : ''}
          <button class="del-row" onclick="deleteIngreso('${g.id}','${item.id}')" title="Eliminar">✕</button>
        </div>
      </div>`;
    });
    html += `<div class="inline-add">
        <input type="text" id="if-new-name-${g.id}" placeholder="Nuevo ingreso fijo..." />
        <input type="number" id="if-new-amt-${g.id}" placeholder="Importe €" min="0" step="0.01" />
        <button class="btn-add" onclick="addIngreso('${g.id}','if')">+ Añadir</button>
      </div></div>
      <div class="total-row"><span>Subtotal</span><span class="green">${fmt(gTotal)}</span></div>
    </div>`;
  });

  html += `<div class="total-row" style="font-weight:700;border-top:2px solid var(--border);padding-top:10px;margin-bottom:24px;">
    <span>Total ingresos fijos</span><span class="green">${fmt(totalIngresos())}</span>
  </div><hr style="border:none;border-top:1px solid var(--border);margin-bottom:20px;">`;
  el.innerHTML = html;
}

function syncAll() {
  renderPresupuesto();
  renderGastosFijos();
  renderIngresosFijos();
}

// ── Ingresos fijos (agrupados) ──
function addIngreso(gid, prefix) {
  const nameEl = document.getElementById(prefix === 'pres' ? `pres-new-ing-name-${gid}` : `if-new-name-${gid}`);
  const amtEl  = document.getElementById(prefix === 'pres' ? `pres-new-ing-amt-${gid}`  : `if-new-amt-${gid}`);
  if (!nameEl) return;
  const name = nameEl.value.trim();
  const amount = parseFloat(amtEl.value) || 0;
  if (!name) return;
  const g = ingresosGrupos.find(g => g.id === gid);
  if (g) g.items.push({ id: 'i' + Date.now(), name, amount });
  save('ingresos_grupos', ingresosGrupos);
  syncAll();
}

function deleteIngreso(gid, id) {
  const g = ingresosGrupos.find(g => g.id === gid);
  if (g) g.items = g.items.filter(i => i.id !== id);
  save('ingresos_grupos', ingresosGrupos);
  syncAll();
}

function moveIngresoItem(fromGid, itemId, toGid) {
  if (!toGid) return;
  const fromG = ingresosGrupos.find(g => g.id === fromGid);
  const toG   = ingresosGrupos.find(g => g.id === toGid);
  if (!fromG || !toG) return;
  const idx = fromG.items.findIndex(i => i.id === itemId);
  if (idx === -1) return;
  toG.items.push(fromG.items.splice(idx, 1)[0]);
  save('ingresos_grupos', ingresosGrupos);
  syncAll();
}

function addIngresosGrupo() {
  const name = document.getElementById('if-new-cat-name').value.trim();
  if (!name) return;
  ingresosGrupos.push({ id: 'ig_' + Date.now(), name, items: [] });
  save('ingresos_grupos', ingresosGrupos);
  populateCatSelect('il-cat', ingresosGrupos);
  syncAll();
}

function renameIngresosGrupo(id, name) {
  const g = ingresosGrupos.find(g => g.id === id);
  if (g) g.name = name;
  save('ingresos_grupos', ingresosGrupos);
  populateCatSelect('il-cat', ingresosGrupos);
  syncAll();
}

function deleteIngresosGrupo(id) {
  const g = ingresosGrupos.find(g => g.id === id);
  if (!g) return;
  if (g.items.length > 0) {
    const badge = document.getElementById('il-total-badge');
    if (badge) { const o = badge.textContent; badge.textContent = '⚠️ Vacía la categoría primero'; setTimeout(() => badge.textContent = o, 2500); }
    return;
  }
  ingresosGrupos = ingresosGrupos.filter(g => g.id !== id);
  save('ingresos_grupos', ingresosGrupos);
  syncAll();
}

function addGastoItem(gid) { addGastoItemFrom(gid, 'pres'); }
function addGastoItemFrom(gid, prefix) {
  const nameEl = document.getElementById(prefix === 'pres' ? `new-g-name-${gid}` : `gf-new-name-${gid}`);
  const amtEl  = document.getElementById(prefix === 'pres' ? `new-g-amt-${gid}`  : `gf-new-amt-${gid}`);
  const name = nameEl.value.trim();
  const amount = parseFloat(amtEl.value) || 0;
  if (!name) return;
  const g = gastosGrupos.find(g => g.id === gid);
  if (g) g.items.push({ id: 'g' + Date.now(), name, amount });
  save('gastos', gastosGrupos);
  syncAll();
}

function deleteGastoItem(gid, id) {
  const g = gastosGrupos.find(g => g.id === gid);
  if (g) g.items = g.items.filter(i => i.id !== id);
  save('gastos', gastosGrupos);
  syncAll();
}

function toggleSection(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

function updateIngreso(gid, id, val) {
  const g = ingresosGrupos.find(g => g.id === gid);
  if (g) { const item = g.items.find(i => i.id === id); if (item) item.amount = parseFloat(val) || 0; }
  save('ingresos_grupos', ingresosGrupos);
  syncAll();
}

function updateGasto(gid, id, val) {
  const g = gastosGrupos.find(g => g.id === gid);
  if (g) { const item = g.items.find(i => i.id === id); if (item) item.amount = parseFloat(val) || 0; }
  save('gastos', gastosGrupos);
  syncAll();
}

async function resetPresupuesto() {
  const ok = await confirmCustom('¿Restaurar todos los valores al original del archivo?');
  if (!ok) return;
  ingresosGrupos = JSON.parse(JSON.stringify(DEFAULT_INGRESOS_GRUPOS));
  gastosGrupos   = JSON.parse(JSON.stringify(DEFAULT_GASTOS_GRUPOS));
  save('ingresos_grupos', ingresosGrupos);
  save('gastos', gastosGrupos);
  syncAll();
}

// ============================================================
//  GASTOS DIARIOS
// ============================================================
// ============================================================
//  LOAD — carga datos para el usuario autenticado
// ============================================================
function loadAllData(user) {
  currentUser = user;

  // Recargar desde localStorage (ahora con el uid correcto)
  categorias    = load('categorias', DEFAULT_CATEGORIAS);
  ingresosGrupos = load('ingresos_grupos', DEFAULT_INGRESOS_GRUPOS);
  ingresosLog   = load('ing_log', []);
  gastosGrupos  = load('gastos', DEFAULT_GASTOS_GRUPOS);
  gastosLog     = load('log', []);
  deudas        = load('deudas', DEFAULT_DEUDAS);
  prestamos     = load('prestamos', DEFAULT_PRESTAMOS);

  // Sincronizar desde Firestore (nube) con timeout de 5s
  const docRef = userDocRef();
  if (docRef) {
    (async () => {
      try {
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000));
        const doc = await Promise.race([docRef.get(), timeout]);
        if (doc.exists) {
          const d = doc.data();
          if (d.categorias)    categorias    = d.categorias;
          if (d.ingresosGrupos) ingresosGrupos = d.ingresosGrupos;
          else if (d.ingresos) ingresosGrupos = [{ id: 'ig1', name: '💚 Ingresos', items: d.ingresos }];
          if (d.gastosGrupos) gastosGrupos = d.gastosGrupos;
          if (d.gastosLog)    gastosLog    = d.gastosLog;
          if (d.ingresosLog)  ingresosLog  = d.ingresosLog;
          if (d.deudas)       deudas       = d.deudas;
          if (d.prestamos)    prestamos    = d.prestamos;

          // Persistir datos de la nube a localStorage
          save('categorias', categorias);
          save('ingresos_grupos', ingresosGrupos);
          save('gastos', gastosGrupos);
          save('log', gastosLog);
          save('ing_log', ingresosLog);
          save('deudas', deudas);
          save('prestamos', prestamos);
        }
      } catch(e) {
        console.warn('Sin conexión, usando datos locales:', e);
      }
    })();
  }

  // Mostrar app, ocultar loading y auth
  showApp(user);
}

function showApp(user) {
  document.getElementById('app-loading').style.display = 'none';
  document.getElementById('page-auth').classList.remove('active');
  document.getElementById('app-content').style.display = '';
  document.getElementById('nav-user-email').textContent = user.email;

  // Inicializar UI
  document.getElementById('g-date').value  = today();
  document.getElementById('il-date').value = today();
  populateCatSelect('g-cat',  categorias);
  populateCatSelect('il-cat', ingresosGrupos);

  // Migrar gastosLog a categorías existentes
  const validCatNames = new Set(categorias.map(c => c.name));
  gastosLog.forEach(g => { if (!validCatNames.has(g.cat)) g.cat = categorias[0]?.name || 'Otros'; });
  const validICats = new Set(ingresosGrupos.map(g => g.name));
  ingresosLog.forEach(g => { if (!validICats.has(g.cat)) g.cat = ingresosGrupos[0]?.name || ''; });

  populateMonths();
  populateMonthsIngresos();
  renderDashboard();
}

function showAuth() {
  document.getElementById('app-loading').style.display = 'none';
  document.getElementById('page-auth').classList.add('active');
  document.getElementById('app-content').style.display = 'none';
  currentUser = null;
  // Si hay datos anónimos viejos, avisar
  const hasAnon = ['categorias','ingresos_grupos','gastos','log','ing_log','deudas','prestamos']
    .some(k => localStorage.getItem(`mf_${k}`) !== null);
  if (hasAnon) {
    document.getElementById('auth-subtitle').textContent =
      '📦 Detectamos datos guardados. Iniciá sesión o registrate para migrarlos.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Escuchar cambios de auth
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      loadAllData(user);
    } else {
      showAuth();
    }
    _authResolve(user);
  });
});

function populateMonths() {
  const months = [...new Set(gastosLog.map(g => g.date ? g.date.slice(0,7) : ''))].filter(Boolean).sort().reverse();
  const sel = document.getElementById('filter-month');
  sel.innerHTML = '<option value="all">Todos los meses</option>';
  months.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = monthLabel(m + '-01'); sel.appendChild(o); });
}

function registrarGastosMes() {
  const mesActual = today().slice(0, 7);
  const fechaHoy = today();

  const yaRegistrado = gastosLog.some(g => g.date && g.date.startsWith(mesActual) && g.desdePres);
  if (yaRegistrado) {
    const badge = document.getElementById('gastos-total-badge');
    const orig = badge.textContent;
    badge.textContent = '⚠️ Ya registrado este mes';
    badge.style.background = 'rgba(243,156,18,.2)';
    badge.style.color = 'var(--yellow)';
    setTimeout(() => { badge.textContent = orig; badge.style.background = ''; badge.style.color = ''; }, 2500);
    return;
  }

  // Función helper: mapea nombre de grupo a categoría existente lo mejor posible
  const grupoACategoria = (gName) => {
    const limpio = gName.replace(/^[^\s]+\s/, '').toLowerCase();
    const match = categorias.find(c => limpio.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(limpio));
    return match ? match.name : categorias[0]?.name || 'Otros';
  };

  gastosGrupos.forEach(grupo => {
    grupo.items.forEach(item => {
      if (item.amount > 0) {
        gastosLog.unshift({
          id: 'gl' + Date.now() + Math.random(),
          desc: item.name,
          amount: item.amount,
          cat: grupoACategoria(grupo.name),
          date: fechaHoy,
          desdePres: true
        });
      }
    });
  });

  save('log', gastosLog);
  populateMonths();

  const sel = document.getElementById('filter-month');
  if (sel) sel.value = mesActual;
  renderGastos();
}

function addGasto() {
  const desc = document.getElementById('g-desc').value.trim();
  const amount = parseFloat(document.getElementById('g-amount').value);
  const cat = document.getElementById('g-cat').value;
  const date = document.getElementById('g-date').value;
  if (!desc || !amount || amount <= 0) { showToast('Rellena la descripción y el importe.', 'yellow'); return; }
  gastosLog.unshift({ id: 'gl' + Date.now(), desc, amount, cat, date: date || today() });
  save('log', gastosLog);
  document.getElementById('g-desc').value = '';
  document.getElementById('g-amount').value = '';
  populateMonths();
  renderGastos();
}

function changeGastoCat(id, newCat) {
  const g = gastosLog.find(g => g.id === id);
  if (g) { g.cat = newCat; save('log', gastosLog); renderGastos(); }
}

function deleteGasto(id) {
  gastosLog = gastosLog.filter(g => g.id !== id);
  save('log', gastosLog);
  populateMonths();
  renderGastos();
}

function populateCatSelect(selId, grupos) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = grupos.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
  if (cur && grupos.find(g => g.name === cur)) sel.value = cur;
}

function renderGastos() {
  const filter = document.getElementById('filter-month').value;
  let items = gastosLog;
  if (filter && filter !== 'all') items = items.filter(g => g.date && g.date.startsWith(filter));
  items = [...items].sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const total = items.reduce((s,g) => s+(g.amount||0), 0);
  document.getElementById('gastos-total-badge').textContent = fmt(total) + ' gastado';

  if (!items.length) {
    document.getElementById('gastos-list').innerHTML = '<div class="expense-list"><div class="empty-state">No hay gastos registrados aún.<br>Añade el primero arriba 👆</div></div>';
    return;
  }

  // Agrupar por categoría independiente
  const catOrder = categorias.map(c => c.name);
  const grupos = {};
  catOrder.forEach(c => grupos[c] = []);
  items.forEach(g => { const c = grupos[g.cat] !== undefined ? g.cat : catOrder[0]; grupos[c] = grupos[c] || []; grupos[c].push(g); });

  let html = '';
  catOrder.forEach(cat => {
    const lista = grupos[cat];
    if (!lista.length) return;
    const catTotal = lista.reduce((s,g) => s+(g.amount||0), 0);
    const catColor = (categorias.find(c => c.name === cat) || {}).color || 'var(--accent)';
    const secId = 'gcat-' + cat.replace(/\W/g,'');
    html += `<div class="section" style="margin-bottom:10px;">
      <div class="section-header" onclick="toggleSection('${secId}')">
        <span style="display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${catColor};"></span>${cat}</span>
        <span class="toggle red">${fmt(catTotal)}</span>
      </div>
      <div id="${secId}">`;
    lista.forEach(g => {
      const catOpts = categorias
        .map(c => `<option value="${c.name}" ${c.name===g.cat?'selected':''}>${c.name}</option>`).join('');
      html += `<div class="expense-item">
        <div class="ei-left">
          <span class="ei-desc">${g.desc}</span>
          <span class="ei-meta">${g.date ? g.date.split('-').reverse().join('/') : ''}</span>
        </div>
        <div class="ei-right" style="gap:8px;">
          <select onchange="changeGastoCat('${g.id}',this.value)"
            style="background:var(--card2);border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:3px 6px;font-size:.75rem;cursor:pointer;">
            ${catOpts}
          </select>
          <span class="ei-amount red">-${fmt(g.amount)}</span>
          <button class="del-btn" onclick="deleteGasto('${g.id}')" title="Eliminar">✕</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  document.getElementById('gastos-list').innerHTML = html;
  renderCategoriasManager();
}

// ============================================================
//  CATEGORÍAS (independientes)
// ============================================================
function renderCategoriasManager() {
  const el = document.getElementById('categorias-manager');
  if (!el) return;
  let html = '';
  categorias.forEach(c => {
    html += `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <input type="color" value="${c.color}"
          style="width:36px;height:36px;border:none;border-radius:6px;cursor:pointer;background:none;padding:0;"
          onchange="updateCategoriaColor('${c.id}',this.value)" title="Color de la categoría" />
        <input type="text" value="${c.name}"
          style="flex:1;min-width:100px;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-size:.85rem;"
          onchange="updateCategoriaName('${c.id}',this.value)" />
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:.78rem;color:var(--muted);">Límite:</span>
          <input type="number" value="${c.limit}" min="0" step="1"
            style="width:80px;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 8px;font-size:.85rem;"
            onchange="updateCategoriaLimit('${c.id}',this.value)" />
          <span style="font-size:.78rem;color:var(--muted);">€</span>
        </div>
        <button class="del-row" onclick="deleteCategoria('${c.id}')" title="Eliminar categoría">✕</button>
      </div>`;
  });
  html += `
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center;">
      <input type="color" id="new-cat-color" value="#6c63ff"
        style="width:36px;height:36px;border:none;border-radius:6px;cursor:pointer;background:none;padding:0;" />
      <input type="text" id="new-cat-name" placeholder="Nueva categoría..."
        style="flex:1;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-size:.85rem;" />
      <input type="number" id="new-cat-limit" placeholder="Límite €" min="0" step="1" value="0"
        style="width:100px;background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:6px 10px;font-size:.85rem;" />
      <button class="btn btn-sm" onclick="addCategoria()">+ Añadir</button>
    </div>`;
  el.innerHTML = html;
}

function addCategoria() {
  const name = document.getElementById('new-cat-name').value.trim();
  if (!name) { showToast('Escribe un nombre para la categoría', 'yellow'); return; }
  const color = document.getElementById('new-cat-color').value;
  const limit = parseFloat(document.getElementById('new-cat-limit').value) || 0;
  categorias.push({ id: 'c' + Date.now(), name, color, limit });
  saveCategorias();
  document.getElementById('new-cat-name').value = '';
  document.getElementById('new-cat-limit').value = '0';
  populateCatSelect('g-cat', categorias);
  renderGastos();
  showToast('Categoría creada', 'green');
}

function deleteCategoria(id) {
  const c = categorias.find(c => c.id === id);
  if (!c) return;
  // Reasignar gastos de esta categoría a la primera disponible
  const firstCat = categorias.find(x => x.id !== id);
  gastosLog.forEach(g => { if (g.cat === c.name && firstCat) g.cat = firstCat.name; });
  categorias = categorias.filter(x => x.id !== id);
  saveCategorias();
  save('log', gastosLog);
  populateCatSelect('g-cat', categorias);
  renderGastos();
  showToast('Categoría eliminada', 'green');
}

function updateCategoriaName(id, name) {
  const c = categorias.find(x => x.id === id);
  if (!c || !name.trim()) return;
  const oldName = c.name;
  c.name = name.trim();
  // Actualizar gastos existentes con el nuevo nombre
  gastosLog.forEach(g => { if (g.cat === oldName) g.cat = c.name; });
  saveCategorias();
  save('log', gastosLog);
  populateCatSelect('g-cat', categorias);
  renderGastos();
}

function updateCategoriaColor(id, color) {
  const c = categorias.find(x => x.id === id);
  if (!c) return;
  c.color = color;
  saveCategorias();
  renderGastos();
}

function updateCategoriaLimit(id, limit) {
  const c = categorias.find(x => x.id === id);
  if (!c) return;
  c.limit = parseFloat(limit) || 0;
  saveCategorias();
}

function saveCategorias() {
  save('categorias', categorias);
}

// ============================================================
//  INGRESOS LOG
// ============================================================

function populateMonthsIngresos() {
  const months = [...new Set(ingresosLog.map(g => g.date ? g.date.slice(0,7) : ''))].filter(Boolean).sort().reverse();
  const sel = document.getElementById('il-filter-month');
  if (!sel) return;
  sel.innerHTML = '<option value="all">Todos los meses</option>';
  months.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = monthLabel(m + '-01'); sel.appendChild(o); });
}

function registrarIngresosMes() {
  const mesActual = today().slice(0, 7); // "2026-06"
  const fechaHoy = today();

  // Ver si ya hay entradas de presupuesto para este mes (evitar duplicados)
  const yaRegistrado = ingresosLog.some(i => i.date && i.date.startsWith(mesActual) && i.desdePres);
  if (yaRegistrado) {
    // Mostrar aviso inline en lugar de alert
    const badge = document.getElementById('il-total-badge');
    const orig = badge.textContent;
    badge.textContent = '⚠️ Ya registrado este mes';
    badge.style.background = 'rgba(243,156,18,.2)';
    badge.style.color = 'var(--yellow)';
    setTimeout(() => { badge.textContent = orig; badge.style.background = ''; badge.style.color = ''; }, 2500);
    return;
  }

  ingresosGrupos.forEach(grupo => {
    grupo.items.forEach(item => {
      if (item.amount > 0) {
        ingresosLog.unshift({
          id: 'il' + Date.now() + Math.random(),
          desc: item.name,
          amount: item.amount,
          cat: grupo.name,
          date: fechaHoy,
          desdePres: true
        });
      }
    });
  });

  save('ing_log', ingresosLog);
  populateMonthsIngresos();

  // Seleccionar el mes actual en el filtro
  const sel = document.getElementById('il-filter-month');
  if (sel) sel.value = mesActual;
  renderIngresosLog();
}

function addIngresoLog() {
  const desc   = document.getElementById('il-desc').value.trim();
  const amount = parseFloat(document.getElementById('il-amount').value);
  const cat    = document.getElementById('il-cat').value;
  const date   = document.getElementById('il-date').value;
  if (!desc || !amount || amount <= 0) { document.getElementById('il-desc').style.borderColor='var(--red)'; return; }
  document.getElementById('il-desc').style.borderColor = '';
  ingresosLog.unshift({ id: 'il' + Date.now(), desc, amount, cat, date: date || today() });
  save('ing_log', ingresosLog);
  document.getElementById('il-desc').value = '';
  document.getElementById('il-amount').value = '';
  populateMonthsIngresos();
  renderIngresosLog();
}

function changeIngresoCat(id, newCat) {
  const g = ingresosLog.find(g => g.id === id);
  if (g) { g.cat = newCat; save('ing_log', ingresosLog); renderIngresosLog(); }
}

function deleteIngresoLog(id) {
  ingresosLog = ingresosLog.filter(g => g.id !== id);
  save('ing_log', ingresosLog);
  populateMonthsIngresos();
  renderIngresosLog();
}

function renderIngresosLog() {
  const filter = document.getElementById('il-filter-month').value;
  let items = ingresosLog;
  if (filter && filter !== 'all') items = items.filter(g => g.date && g.date.startsWith(filter));
  items = [...items].sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const total = items.reduce((s,g) => s+(g.amount||0), 0);
  document.getElementById('il-total-badge').textContent = fmt(total) + ' ingresado';

  if (!items.length) {
    document.getElementById('ingresos-log-list').innerHTML = '<div class="expense-list"><div class="empty-state">No hay ingresos registrados aún.<br>Añade el primero arriba 👆</div></div>';
    return;
  }

  // Agrupar por categoría — mismo sistema que ingresos fijos
  const catOrder = ingresosGrupos.map(g => g.name);
  const grupos = {};
  catOrder.forEach(c => grupos[c] = []);
  items.forEach(g => { const c = grupos[g.cat] !== undefined ? g.cat : catOrder[0]; grupos[c] = grupos[c] || []; grupos[c].push(g); });

  let html = '';
  catOrder.forEach(cat => {
    const lista = grupos[cat];
    if (!lista.length) return;
    const catTotal = lista.reduce((s,g) => s+(g.amount||0), 0);
    const secId = 'icat-' + cat.replace(/\W/g,'');
    html += `<div class="section" style="margin-bottom:10px;">
      <div class="section-header" onclick="toggleSection('${secId}')">
        <span>${cat}</span>
        <span class="toggle green">${fmt(catTotal)}</span>
      </div>
      <div id="${secId}">`;
    lista.forEach(g => {
      const catOpts = ingresosGrupos
        .map(gr => `<option value="${gr.name}" ${gr.name===g.cat?'selected':''}>${gr.name}</option>`).join('');
      html += `<div class="expense-item">
        <div class="ei-left">
          <span class="ei-desc">${g.desc}</span>
          <span class="ei-meta">${g.date ? g.date.split('-').reverse().join('/') : ''}</span>
        </div>
        <div class="ei-right" style="gap:8px;">
          <select onchange="changeIngresoCat('${g.id}',this.value)"
            style="background:var(--card2);border:1px solid var(--border);color:var(--muted);border-radius:6px;padding:3px 6px;font-size:.75rem;cursor:pointer;">
            ${catOpts}
          </select>
          <span class="ei-amount green">+${fmt(g.amount)}</span>
          <button class="del-btn" onclick="deleteIngresoLog('${g.id}')" title="Eliminar">✕</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  document.getElementById('ingresos-log-list').innerHTML = html;
}

// ============================================================
//  PRÉSTAMOS
// ============================================================
function addPrestamo() {
  const name = document.getElementById('p-name').value.trim();
  const total = parseFloat(document.getElementById('p-total').value) || 0;
  const paid  = parseFloat(document.getElementById('p-paid').value)  || 0;
  const cuota = parseFloat(document.getElementById('p-cuota').value) || 0;
  if (!name) { showToast('Escribe el nombre del préstamo.', 'yellow'); return; }
  const newP = { id: 'p' + Date.now(), name, total, paid, cuota, gastoId: null };
  prestamos.push(newP);
  // Crear automáticamente en Gastos personales fijos
  if (cuota > 0) syncCuotaToGastos(newP);
  save('prestamos', prestamos);
  document.getElementById('p-name').value = '';
  document.getElementById('p-total').value = '';
  document.getElementById('p-paid').value = '0';
  document.getElementById('p-cuota').value = '';
  renderPrestamos();
}

function syncCuotaToGastos(p) {
  // Busca el item vinculado en gastos y actualiza el importe
  for (const g of gastosGrupos) {
    const item = g.items.find(i => i.id === p.gastoId);
    if (item) { item.amount = p.cuota; save('gastos', gastosGrupos); return; }
  }
  // Si no existe, lo crea en Gastos personales fijos
  const personal = gastosGrupos.find(g => g.id === 'g_personales');
  if (personal) {
    const newId = 'g_p_' + p.id;
    p.gastoId = newId;
    personal.items.push({ id: newId, name: 'Cuota ' + p.name, amount: p.cuota });
    save('gastos', gastosGrupos);
  }
}

function savePrestamoField(id, field, val) {
  const p = prestamos.find(p => p.id === id);
  if (!p) return;
  p[field] = parseFloat(val) || 0;
  if (field === 'paid' && p.total > 0) p.paid = Math.min(p.total, Math.max(0, p.paid));
  if (field === 'cuota') syncCuotaToGastos(p);
  save('prestamos', prestamos);
  renderPrestamos();
}

function deletePrestamo(id) {
  const p = prestamos.find(p => p.id === id);
  if (p && p.gastoId) {
    // Eliminar también el gasto vinculado
    for (const g of gastosGrupos) {
      g.items = g.items.filter(i => i.id !== p.gastoId);
    }
    save('gastos', gastosGrupos);
  }
  prestamos = prestamos.filter(p => p.id !== id);
  save('prestamos', prestamos);
  renderPrestamos();
}

function renderPrestamos() {
  let html = '';
  const totalCuotas = prestamos.reduce((s, p) => s + (p.cuota || 0), 0);
  const totalPendiente = prestamos.reduce((s, p) => p.total > 0 ? s + Math.max(0, p.total - p.paid) : s, 0);

  prestamos.forEach(p => {
    const remaining = p.total > 0 ? Math.max(0, p.total - p.paid) : null;
    const pct = p.total > 0 ? Math.min(100, Math.round((p.paid / p.total) * 100)) : 0;
    const mesesRestantes = (remaining !== null && p.cuota > 0) ? Math.ceil(remaining / p.cuota) : null;
    const done = remaining !== null && remaining <= 0;

    html += `<div class="deuda-card" style="${done?'opacity:.7':''}">
      <div class="deuda-top">
        <div style="flex:1">
          <div class="deuda-name" style="margin-bottom:10px;">${done ? '✅ ' : '🏦 '}${p.name}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <label style="font-size:.78rem;color:var(--muted);display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;">
              Total préstamo (€)
              <input type="number" value="${p.total||''}" placeholder="0.00" min="0" step="0.01"
                style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 9px;width:100%;font-size:.88rem;"
                onchange="savePrestamoField('${p.id}','total',this.value)" />
            </label>
            <label style="font-size:.78rem;color:var(--muted);display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;">
              Ya pagado (€)
              <input type="number" value="${p.paid||0}" min="0" step="0.01"
                style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 9px;width:100%;font-size:.88rem;"
                onchange="savePrestamoField('${p.id}','paid',this.value)" />
            </label>
            <label style="font-size:.78rem;color:var(--muted);display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;">
              Cuota mensual (€)
              <input type="number" value="${p.cuota||0}" min="0" step="0.01"
                style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 9px;width:100%;font-size:.88rem;"
                onchange="savePrestamoField('${p.id}','cuota',this.value)" />
            </label>
          </div>
        </div>
        <div style="text-align:right;margin-left:12px;min-width:80px;">
          <div class="deuda-amount">${remaining !== null ? fmt(remaining) : '—'}</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:3px;">pendiente</div>
          ${mesesRestantes !== null && !done ? `<div style="font-size:.72rem;color:var(--accent);margin-top:4px;">~${mesesRestantes} meses</div>` : ''}
          ${done ? `<div style="font-size:.72rem;color:var(--green);margin-top:4px;">✅ Liquidado</div>` : ''}
        </div>
      </div>
      ${p.total > 0 ? `
      <div style="margin-top:12px;">
        <div class="deuda-bar-wrap"><div class="deuda-bar" style="width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--green))"></div></div>
        <div class="deuda-footer"><span>${pct}% pagado</span><span>${fmt(p.paid)} / ${fmt(p.total)}</span></div>
      </div>` : `<div style="margin-top:8px;font-size:.78rem;color:var(--yellow);">⚠️ Introduce el total del préstamo para ver el progreso</div>`}
      <div style="margin-top:12px;display:flex;justify-content:flex-end;">
        <button class="btn btn-sm btn-outline btn-danger" onclick="deletePrestamo('${p.id}')">🗑 Eliminar</button>
      </div>
    </div>`;
  });

  if (!html) html = '<div class="card"><div class="empty-state" style="padding:24px;">No tienes préstamos registrados.</div></div>';

  document.getElementById('prestamos-list').innerHTML = html;
  document.getElementById('prestamos-total').innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
      <div class="card" style="flex:1;min-width:160px;padding:14px 18px;">
        <div class="label">Cuotas mensuales</div>
        <div class="value red" style="font-size:1.4rem;">${fmt(totalCuotas)}</div>
      </div>
      ${totalPendiente > 0 ? `<div class="card" style="flex:1;min-width:160px;padding:14px 18px;">
        <div class="label">Total pendiente</div>
        <div class="value yellow" style="font-size:1.4rem;">${fmt(totalPendiente)}</div>
      </div>` : ''}
    </div>`;
}

// ============================================================
//  DEUDAS
// ============================================================
function addDeuda() {
  const name = document.getElementById('d-name').value.trim();
  const total = parseFloat(document.getElementById('d-total').value);
  const paid = parseFloat(document.getElementById('d-paid').value) || 0;
  if (!name || !total || total <= 0) { showToast('Rellena nombre e importe total.', 'yellow'); return; }
  deudas.push({ id: 'd' + Date.now(), name, total, paid });
  save('deudas', deudas);
  document.getElementById('d-name').value = '';
  document.getElementById('d-total').value = '';
  document.getElementById('d-paid').value = '0';
  renderDeudas();
}

function saveDeudaField(id, field, val) {
  const d = deudas.find(d => d.id === id);
  if (!d) return;
  d[field] = Math.max(0, parseFloat(val) || 0);
  if (field === 'paid') d.paid = Math.min(d.total, d.paid);
  save('deudas', deudas);
  renderDeudas();
}

function deleteDeuda(id) {
  deudas = deudas.filter(d => d.id !== id);
  save('deudas', deudas);
  renderDeudas();
}

function renderDeudas() {
  let html = '';
  deudas.forEach(d => {
    const remaining = Math.max(0, d.total - d.paid);
    const pct = d.total > 0 ? Math.min(100, Math.round((d.paid / d.total) * 100)) : 0;
    const done = remaining <= 0 && d.total > 0;
    html += `<div class="deuda-card" style="${done?'opacity:.7':''}">
      <div class="deuda-top">
        <div style="flex:1">
          <div class="deuda-name" style="margin-bottom:10px;">${done ? '✅ ' : '💳 '}${d.name}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <label style="font-size:.78rem;color:var(--muted);display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;">
              Total deuda (€)
              <input type="number" value="${d.total}" min="0" step="0.01"
                style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 9px;width:100%;font-size:.88rem;"
                onchange="saveDeudaField('${d.id}','total',this.value)" />
            </label>
            <label style="font-size:.78rem;color:var(--muted);display:flex;flex-direction:column;gap:3px;flex:1;min-width:100px;">
              Ya pagado (€)
              <input type="number" value="${d.paid}" min="0" step="0.01"
                style="background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:5px 9px;width:100%;font-size:.88rem;"
                onchange="saveDeudaField('${d.id}','paid',this.value)" />
            </label>
          </div>
        </div>
        <div style="text-align:right;margin-left:12px;min-width:80px;">
          <div class="deuda-amount">${fmt(remaining)}</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:3px;">${done ? '✅ Pagada' : 'pendiente'}</div>
        </div>
      </div>
      <div style="margin-top:12px;">
        <div class="deuda-bar-wrap"><div class="deuda-bar" style="width:${pct}%"></div></div>
        <div class="deuda-footer"><span>${pct}% pagado</span><span>${done ? '¡Pagada!' : 'Pendiente: ' + fmt(remaining)}</span></div>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end;">
        <button class="btn btn-sm btn-outline btn-danger" onclick="deleteDeuda('${d.id}')">🗑 Eliminar</button>
      </div>
    </div>`;
  });

  if (!html) html = '<div class="card"><div class="empty-state" style="padding:30px;">No tienes deudas registradas 🎉</div></div>';

  const totalDeuda = deudas.reduce((s,d) => s + Math.max(0, d.total - d.paid), 0);
  document.getElementById('deudas-list').innerHTML = html;
  document.getElementById('deudas-total').innerHTML = totalDeuda > 0
    ? `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:600;">Total deuda pendiente</span><span class="red" style="font-size:1.3rem;font-weight:700;">${fmt(totalDeuda)}</span></div></div>`
    : `<div class="alert alert-green">🎉 ¡Sin deudas pendientes!</div>`;
}

// ============================================================
//  EXPORT / IMPORT
// ============================================================
function exportarDatos() {
  const data = {
    fecha: new Date().toISOString(),
    categorias, ingresosGrupos, gastosGrupos, gastosLog, ingresosLog, deudas, prestamos
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MisFinanzas-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Backup descargado', 'green');
}

function importarDatos(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.ingresosGrupos || !data.gastosGrupos) {
        showToast('El archivo no tiene el formato correcto', 'red');
        return;
      }
      const ok = await confirmCustom('¿Sobrescribir todos los datos actuales con el backup? Esta acción no se puede deshacer.');
      if (!ok) return;
      categorias     = data.categorias || DEFAULT_CATEGORIAS;
      ingresosGrupos = data.ingresosGrupos;
      gastosGrupos   = data.gastosGrupos;
      gastosLog      = data.gastosLog || [];
      ingresosLog    = data.ingresosLog || [];
      deudas         = data.deudas || [];
      prestamos      = data.prestamos || [];
save('categorias', categorias);
      save('ingresos_grupos', ingresosGrupos);
      save('gastos', gastosGrupos);
      save('log', gastosLog);
      save('ing_log', ingresosLog);
      save('deudas', deudas);
      save('prestamos', prestamos);
      goTo('dashboard');
      showToast('✅ Datos restaurados correctamente', 'green');
    } catch(err) {
      showToast('Error al leer el archivo: ' + err.message, 'red');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
