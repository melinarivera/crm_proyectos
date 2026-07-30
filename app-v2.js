// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyAoJpi_l4_9-z22wrTj1iqDXgvazfYGMKM",
  authDomain: "crm-melina.firebaseapp.com",
  projectId: "crm-melina",
  storageBucket: "crm-melina.firebasestorage.app",
  messagingSenderId: "1049895195489",
  appId: "1:1049895195489:web:2c946552da5f2389676b20",
  measurementId: "G-N7JEKPMQDV"
};

// Inicializar Firebase con captura de errores
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    console.log("Firebase inicializado correctamente");
} catch (e) {
    alert("Error al inicializar Firebase: " + e.message);
}

const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  console.warn('Persistencia offline:', err.code);
});

// ===== AUTH =====
const ALLOWED_EMAIL = 'melina.rivera@gmail.com';
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

function initAuth() {
  auth.onAuthStateChanged(user => {
    if (user) {
      if (user.email !== ALLOWED_EMAIL) {
        auth.signOut();
        showLoginError('Acceso denegado. Esta app es privada.');
        return;
      }
      document.getElementById('login-screen').style.display = 'none';
      subscribeToFirestore();
      initAlertSystem();
    } else {
      document.getElementById('login-screen').style.display = 'flex';
      lucide.createIcons();
    }
  });
}

function signInWithGoogle() {
  const btn = document.getElementById('btn-google-login');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.textContent = 'Conectando…';
  auth.signInWithPopup(googleProvider).catch(() => {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.innerHTML = originalHTML;
    showLoginError('No se pudo iniciar sesión. Intenta de nuevo.');
  });
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function signOutUser() {
  auth.signOut().then(() => window.location.reload());
}

// ===== STATE =====
let tasks = [];
let notas = [];
let leads = [];
let globalUrls = {};
let selectedPrio = 'urgente';
let selectedNotaPrio = 'medio';
let currentView = 'dashboard';

// ===== SISTEMA DE ALERTAS IN-APP (sin permisos, funciona en iOS/Mac) =====
let alertTickInterval = null;

function initAlertSystem() {
  updateAlertBadge();
  // Actualizar cada minuto
  if (alertTickInterval) clearInterval(alertTickInterval);
  alertTickInterval = setInterval(updateAlertBadge, 60000);
}

/** Clasifica las tareas con fecha+hora en: vencidas, hoy-próximas, futuras */
function classifyScheduledTasks() {
  const now = new Date();
  // Truncar a minutos para comparar
  const nowMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  const overdue  = []; // fecha+hora ya pasó
  const dueToday = []; // hoy, aún no ha llegado la hora
  const upcoming = []; // fechas futuras (próximos 3 días)

  tasks.forEach(task => {
    if (task.done) return;
    if (!task.date) return; // sin fecha no contamos

    const taskDateStr = task.date; // YYYY-MM-DD
    if (!taskDateStr) return;

    if (task.time) {
      // Tiene fecha y hora
      const [h, m] = task.time.split(':').map(Number);
      const [y, mo, d] = taskDateStr.split('-').map(Number);
      const taskDT = new Date(y, mo - 1, d, h, m);

      if (taskDT <= nowMin) {
        overdue.push(task);
      } else if (taskDateStr === todayStr) {
        dueToday.push(task);
      } else {
        // Solo próximos 3 días
        const diff = (taskDT - nowMin) / (1000 * 60 * 60 * 24);
        if (diff <= 3) upcoming.push(task);
      }
    } else {
      // Solo tiene fecha, sin hora
      const [y, mo, d] = taskDateStr.split('-').map(Number);
      const taskDay = new Date(y, mo - 1, d);
      const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = (taskDay - today) / (1000 * 60 * 60 * 24);

      if (diff < 0) overdue.push(task);
      else if (diff === 0) dueToday.push(task);
      else if (diff <= 3) upcoming.push(task);
    }
  });

  const sortByDateTime = (a, b) => {
    const getTime = (task) => {
      if (!task.date) return 0;
      const [y, mo, d] = task.date.split('-').map(Number);
      if (task.time) {
        const [h, m] = task.time.split(':').map(Number);
        return new Date(y, mo - 1, d, h, m).getTime();
      } else {
        return new Date(y, mo - 1, d, 23, 59, 59).getTime();
      }
    };
    return getTime(a) - getTime(b);
  };

  overdue.sort(sortByDateTime);
  dueToday.sort(sortByDateTime);
  upcoming.sort(sortByDateTime);

  return { overdue, dueToday, upcoming };
}

/** Actualiza el globito rojo sobre la campana */
function updateAlertBadge() {
  const { overdue, dueToday } = classifyScheduledTasks();
  const alertCount = overdue.length + dueToday.length;

  let badge = document.getElementById('notif-badge');
  const bell = document.getElementById('btn-notif');
  if (!bell) return;

  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'notif-badge';
    badge.className = 'notif-badge';
    bell.appendChild(badge);
  }

  if (alertCount > 0) {
    badge.textContent = alertCount > 99 ? '99+' : alertCount;
    badge.style.display = 'flex';
    // Rojo si hay vencidas, amarillo si solo hay de hoy
    badge.style.background = overdue.length > 0 ? '#ff4d6d' : '#ffd166';
    badge.style.color = overdue.length > 0 ? '#fff' : '#1a1a35';
    bell.title = overdue.length > 0
      ? `${overdue.length} tarea(s) VENCIDA(S) + ${dueToday.length} para hoy`
      : `${dueToday.length} tarea(s) programada(s) para hoy`;
  } else {
    badge.style.display = 'none';
    bell.title = 'Sin pendientes urgentes';
  }

  // Refrescar panel del dashboard si está visible
  if (currentView === 'dashboard') renderAlertsPanel();
}

/** Renderiza el panel de alertas en el dashboard */
function renderAlertsPanel() {
  const container = document.getElementById('alerts-panel');
  if (!container) return;

  const { overdue, dueToday, upcoming } = classifyScheduledTasks();

  if (overdue.length === 0 && dueToday.length === 0 && upcoming.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  const catLabels = { webdev: 'Dev', marketing: 'Marketing', pandin: 'Pandín', personal: 'Personal' };

  function formatDT(task) {
    const datePart = task.date ? task.date.split('-').reverse().join('/') : '';
    const timePart = task.time ? task.time.slice(0, 5) : '';
    return [datePart, timePart].filter(Boolean).join(' · ');
  }

  function buildAlertRow(task, type) {
    const icons = { overdue: '🔴', today: '🟡', upcoming: '🔵' };
    const icon = icons[type];
    const label = catLabels[task.cat] || task.cat;
    const dt = formatDT(task);
    return `
      <div class="alert-row alert-${type}" onclick="showView('${task.cat}')">
        <span class="alert-icon">${icon}</span>
        <div class="alert-info">
          <span class="alert-title">${task.title}</span>
          <span class="alert-meta">${label}${dt ? ' · ' + dt : ''}</span>
        </div>
        <span class="alert-arrow">›</span>
      </div>
    `;
  }

  let html = '<div class="alerts-header"><i data-lucide="bell-ring" style="width:15px;height:15px;"></i> Pendientes programados</div>';

  if (overdue.length > 0) {
    html += `<div class="alerts-group-label alerts-overdue-label">⚠️ Vencidos (${overdue.length})</div>`;
    overdue.forEach(t => html += buildAlertRow(t, 'overdue'));
  }
  if (dueToday.length > 0) {
    html += `<div class="alerts-group-label alerts-today-label">📅 Hoy (${dueToday.length})</div>`;
    dueToday.forEach(t => html += buildAlertRow(t, 'today'));
  }
  if (upcoming.length > 0) {
    html += `<div class="alerts-group-label alerts-upcoming-label">🔵 Próximos 3 días (${upcoming.length})</div>`;
    upcoming.forEach(t => html += buildAlertRow(t, 'upcoming'));
  }

  container.innerHTML = html;
  refreshIcons();
}

// Mantener el click en campana para mostrar el panel si están en otra vista
function onBellClick() {
  showView('dashboard');
  // Scroll suave al panel
  setTimeout(() => {
    const panel = document.getElementById('alerts-panel');
    if (panel && panel.innerHTML) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

// ===== INDICADOR DE SINCRONIZACIÓN =====
function showSyncIndicator(status, message = "") {
  let indicator = document.getElementById('sync-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'sync-indicator';
    indicator.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: var(--card-bg, #1a1a2e); border: 1px solid var(--border, #2a2a40);
      border-radius: 12px; padding: 8px 14px; font-size: 12px; font-weight: 500;
      display: flex; align-items: center; gap: 8px; z-index: 9999;
      transition: all 0.3s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      font-family: 'Inter', sans-serif;
    `;
    document.body.appendChild(indicator);
  }
  
  if (status === 'syncing') {
    indicator.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#f7c948;display:inline-block;animation:pulse 1s infinite;"></span><span style="color:#f7c948;">Sincronizando…</span>';
    indicator.style.opacity = '1';
  } else if (status === 'ok') {
    indicator.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#4fe99b;display:inline-block;"></span><span style="color:#4fe99b;">Sincronizado ✓</span>';
    indicator.style.opacity = '1';
    setTimeout(() => { indicator.style.opacity = '0'; }, 3000);
  } else if (status === 'error') {
    indicator.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#ff4d6d;display:inline-block;"></span><span style="color:#ff4d6d;">Error: ' + message + '</span>';
    indicator.style.opacity = '1';
    console.error("Firebase Sync Error:", message);
  }
}

// Animación pulse
if (!document.getElementById('pulse-style')) {
    const pulseStyle = document.createElement('style');
    pulseStyle.id = 'pulse-style';
    pulseStyle.textContent = `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`;
    document.head.appendChild(pulseStyle);
}

function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateDate();
  initAuth();
});

// Función para forzar recarga de la aplicación (limpia caché del navegador para la PWA)
function forceAppRefresh() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
      }
    }).then(() => {
      window.location.reload(true);
    });
  } else {
    window.location.reload(true);
  }
}

// ===== FIRESTORE SUBSCRIPTIONS =====
function subscribeToFirestore() {
  showSyncIndicator('syncing');
  
  // Tareas
  db.collection('tasks').orderBy('created', 'desc').onSnapshot(snapshot => {
    tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log("Tareas recibidas:", tasks.length);
    renderAll();
    if (currentView !== 'dashboard' && currentView !== 'notas') renderCategoryList(currentView);
    showSyncIndicator('ok');
    // Re-check del badge al recibir cambios de Firestore
    updateAlertBadge();
  }, err => {
    showSyncIndicator('error', err.message);
    if(err.code === 'permission-denied') {
        alert("¡Error! No tienes permisos en Firestore. Revisa las Reglas en Firebase Console.");
    }
  });

  // Notas
  db.collection('notas').orderBy('created', 'desc').onSnapshot(snap => {
    notas = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentView === 'notas') renderNotas();
  });

  db.collection('leads').orderBy('createdAt', 'desc').onSnapshot(snap => {
    leads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentView === 'leads') renderLeads();
    updateStats();
  });

  // Menú y Lista de Súper
  db.collection('menu').doc('grocery').onSnapshot(doc => {
    if (doc.exists) {
      groceryItems = doc.data().items || [];
      if (currentView === 'menu') renderGroceryList();
    }
  });

  // Enlaces de Excel y WhatsApp (Sincronización multidispositivo)
  db.collection('config').doc('urls').onSnapshot(doc => {
    if (doc.exists) {
      globalUrls = doc.data();
      if (globalUrls.marketingExcelUrl) localStorage.setItem('marketingExcelUrl', globalUrls.marketingExcelUrl);
      if (globalUrls.personalExcelUrl) localStorage.setItem('personalExcelUrl', globalUrls.personalExcelUrl);
    } else {
      // Migración desde localStorage
      const mExcel = localStorage.getItem('marketingExcelUrl');
      const pExcel = localStorage.getItem('personalExcelUrl');
      if (mExcel || pExcel) {
        const migratedUrls = {
           ...(mExcel && {marketingExcelUrl: mExcel}),
           ...(pExcel && {personalExcelUrl: pExcel})
        };
        db.collection('config').doc('urls').set(migratedUrls);
      }
    }
  });
}

function updateDate() {
  const el = document.getElementById('sidebar-date');
  if (el) {
    const now = new Date();
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    el.textContent = now.toLocaleDateString('es-ES', opts);
  }
}

// ===== VIEWS =====
function showView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  const targetView = document.getElementById('view-' + view);
  const targetNav = document.querySelector(`[data-view="${view}"]`);
  
  if (targetView) targetView.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    webdev:    'Web Dev',
    marketing: 'Marketing Digital',
    pandin:    'Pandín',
    personal:  'Vida Personal',
    notas:     'Notas Rápidas',
    leads:     'Leads',
    planner:   'Planner Semanal',
    menu:      'Menú Semanal'
  };
  document.getElementById('page-title').textContent = titles[view] || 'MeliOrganizer';

  if (view === 'dashboard') renderDashboard();
  else if (view === 'notas') renderNotas();
  else if (view === 'leads') renderLeads();
  else if (view === 'planner') loadPlannerData();
  else if (view === 'menu') {
    loadMenuData();
    renderGroceryList();
  }
  else renderCategoryList(view);
  refreshIcons();
}

function renderAll() {
  renderDashboard();
  updateStats();
  updateAlertBadge();
}

function updateStats() {
  const cats = ['webdev', 'marketing', 'pandin', 'personal'];
  cats.forEach(cat => {
    const count = tasks.filter(t => t.cat === cat && !t.done).length;
    const el = document.getElementById('stat-' + cat);
    if (el) el.textContent = count;
  });
}

function renderDashboard() {
  renderAlertsPanel();
  const prios = ['urgente', 'medio', 'bajo'];
  const ids   = ['dash-urgente', 'dash-medio', 'dash-bajo'];
  
  prios.forEach((prio, i) => {
    const container = document.getElementById(ids[i]);
    if (!container) return;
    
    // Filtrar y ordenar por fecha/hora (los que suceden primero arriba)
    const filtered = tasks.filter(t => t.prio === prio && !t.done);
    filtered.sort((a, b) => {
      const dateTimeA = (a.date || '9999-12-31') + (a.time || '23:59');
      const dateTimeB = (b.date || '9999-12-31') + (b.time || '23:59');
      return dateTimeA.localeCompare(dateTimeB);
    });

    container.innerHTML = '';
    if (filtered.length === 0) {
      container.innerHTML = '<p class="empty-state">Sin tareas aquí</p>';
    } else {
      filtered.forEach(t => container.appendChild(buildTaskCard(t)));
    }
  });
  updateStats();
  refreshIcons();
}

function renderCategoryList(cat) {
  const container = document.getElementById('list-' + cat);
  if (!container) return;
  
  // Filtrar y ordenar: pendientes primero, luego por fecha/hora
  const filtered = tasks.filter(t => t.cat === cat);
  filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const dateTimeA = (a.date || '9999-12-31') + (a.time || '23:59');
    const dateTimeB = (b.date || '9999-12-31') + (b.time || '23:59');
    return dateTimeA.localeCompare(dateTimeB);
  });

  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay tareas aún. ¡Añade una!</p>';
  } else {
    filtered.forEach(t => container.appendChild(buildTaskCard(t)));
  }
  refreshIcons();
}

function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card prio-${task.prio}${task.done ? ' done-card' : ''}`;
  card.id = 'task-' + task.id;

  // Navegar a la sección al hacer click (evitando botones)
  card.onclick = (e) => {
    if (e.target.closest('.task-btn')) return;
    showView(task.cat);
  };

  const tagLabels = {
    webdev:    'Dev',
    marketing: 'Marketing',
    pandin:    'Pandín',
    personal:  'Personal'
  };
  let dateStr = '';
  if (task.date) {
    const [y, m, d] = task.date.split('-');
    dateStr = `📅 ${d}/${m}/${y.slice(-2)}`;
  }
  const timeStr = task.time ? ` 🕒 <span style="font-size:1.15em;font-weight:800;">${task.time}</span>` : '';

  card.innerHTML = `
    <div class="task-top">
      <div style="display:flex;gap:8px;align-items:flex-start;flex:1;min-width:0;">
        <span class="sema-dot dot-${task.prio}" style="margin-top:5px;"></span>
        <div style="flex:1;min-width:0;">
          <div class="task-name${task.done ? ' done' : ''}">${task.title}</div>
        </div>
      </div>
    </div>
    ${task.desc ? `<div class="task-desc-text">${task.desc}</div>` : ''}
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; gap: 10px; flex-wrap: wrap;">
      <div class="task-meta" style="margin-top: 0;">
        <span class="task-tag tag-${task.cat}">${tagLabels[task.cat] || task.cat}</span>
        ${dateStr || timeStr ? `<span class="task-date">${dateStr}${timeStr}</span>` : ''}
      </div>
      <div class="task-actions">
        <button class="task-btn" onclick="toggleDone('${task.id}')" title="Completar">
          <i data-lucide="${task.done ? 'rotate-ccw' : 'check-circle-2'}" style="width:20px;height:20px;color:${task.done ? 'var(--text-sub)' : 'var(--verde)'}"></i>
        </button>
        <button class="task-btn" onclick="editTask('${task.id}')" title="Editar">
          <i data-lucide="edit-3" style="width:20px;height:20px;color:var(--accent);"></i>
        </button>
        <button class="task-btn" onclick="deleteTask('${task.id}')" title="Eliminar">
          <i data-lucide="trash-2" style="width:20px;height:20px;color:#ff4d6d99;"></i>
        </button>
      </div>
    </div>
  `;
  return card;
}

async function toggleDone(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    showSyncIndicator('syncing');
    await db.collection('tasks').doc(id).update({ done: !task.done });
  }
}

async function deleteTask(id) {
  if (confirm("¿Eliminar esta tarea?")) {
    showSyncIndicator('syncing');
    await db.collection('tasks').doc(id).delete();
  }
}

// MODAL
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('task-title').focus();
  refreshIcons();
}

function closeModalDirect() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('editing-task-id').value = '';
  document.getElementById('modal-title-text').textContent = 'Nueva Tarea';
  document.getElementById('task-title').value = '';
  document.getElementById('task-desc').value = '';
  document.getElementById('task-date').value = '';
  document.getElementById('task-time').value = '';
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById('editing-task-id').value = id;
  document.getElementById('modal-title-text').textContent = 'Editar Tarea';
  document.getElementById('task-title').value = task.title || '';
  document.getElementById('task-desc').value = task.desc || '';
  document.getElementById('task-cat').value = task.cat || 'webdev';
  document.getElementById('task-date').value = task.date || '';
  document.getElementById('task-time').value = task.time || '';
  selectPrio(task.prio || 'urgente');

  openModal();
}

function selectPrio(prio) {
  selectedPrio = prio;
  document.querySelectorAll('.sema-btn').forEach(b => b.classList.remove('active-sema'));
  document.querySelector(`[data-prio="${prio}"]`).classList.add('active-sema');
}

async function saveTask() {
  const titleEl = document.getElementById('task-title');
  const descEl = document.getElementById('task-desc');
  const catEl = document.getElementById('task-cat');
  const dateEl = document.getElementById('task-date');
  const timeEl = document.getElementById('task-time');
  const editingIdEl = document.getElementById('editing-task-id');

  const title = titleEl.value.trim();
  if (!title) return;

  const editingId = editingIdEl.value;

  const taskData = {
    title,
    desc:    descEl.value.trim(),
    cat:     catEl.value,
    date:    dateEl.value,
    time:    timeEl.value, // Capturamos la hora directamente del input
    prio:    selectedPrio,
    updated: new Date().toISOString()
  };

  console.log("Guardando tarea:", taskData); // Debug log

  showSyncIndicator('syncing');

  try {
    if (editingId) {
      await db.collection('tasks').doc(editingId).update(taskData);
    } else {
      taskData.done = false;
      taskData.created = new Date().toISOString();
      await db.collection('tasks').add(taskData);
    }
    closeModalDirect();
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

// NOTAS
function renderNotas() {
  const grid = document.getElementById('notas-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (notas.length === 0) {
    grid.innerHTML = '<p class="empty-state">No hay notas.</p>';
    return;
  }
  notas.forEach(n => {
    const card = document.createElement('div');
    const prioClass = n.prio ? `prio-${n.prio}` : 'prio-medio';
    card.className = `nota-card ${prioClass}`;
    
    // Formatear fecha
    let dateStr = '';
    if (n.created) {
      const d = new Date(n.created);
      dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    card.innerHTML = `
      <div class="nota-actions">
        <button class="nota-btn" onclick="editNota('${n.id}')" title="Editar"><i data-lucide="edit-3" style="width:13px;height:13px;"></i></button>
        <button class="nota-btn del" onclick="deleteNota('${n.id}')" title="Eliminar"><i data-lucide="x" style="width:13px;height:13px;"></i></button>
      </div>
      <div class="nota-text">${n.text}</div>
      <div class="nota-meta">
        <span class="sema-dot-sm dot-${n.prio || 'medio'}"></span>
        <span>${dateStr}</span>
      </div>
    `;
    grid.appendChild(card);
  });
  refreshIcons();
}

function selectNotaPrio(prio) {
  selectedNotaPrio = prio;
  document.querySelectorAll('[data-nota-prio]').forEach(b => b.classList.remove('active-sema'));
  document.querySelector(`[data-nota-prio="${prio}"]`).classList.add('active-sema');
}

async function addNota() {
  const input = document.getElementById('nota-input');
  const text = input.value.trim();
  if (!text) return;

  const editingId = document.getElementById('editing-nota-id').value;
  const notaData = {
    text,
    prio: selectedNotaPrio,
    updated: new Date().toISOString()
  };

  showSyncIndicator('syncing');

  try {
    if (editingId) {
      await db.collection('notas').doc(editingId).update(notaData);
    } else {
      notaData.created = new Date().toISOString();
      await db.collection('notas').add(notaData);
    }
    resetNotaForm();
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

function editNota(id) {
  const nota = notas.find(n => n.id === id);
  if (!nota) return;

  document.getElementById('editing-nota-id').value = id;
  document.getElementById('nota-input').value = nota.text;
  selectNotaPrio(nota.prio || 'medio');
  
  document.getElementById('btn-save-nota').innerHTML = '<i data-lucide="check" style="width:15px;height:15px;"></i> Actualizar Nota';
  document.getElementById('btn-cancel-nota').style.display = 'block';
  document.getElementById('nota-input').focus();
  refreshIcons();
}

function resetNotaForm() {
  document.getElementById('editing-nota-id').value = '';
  document.getElementById('nota-input').value = '';
  selectNotaPrio('medio');
  document.getElementById('btn-save-nota').innerHTML = '<i data-lucide="save" style="width:15px;height:15px;"></i> Guardar Nota';
  document.getElementById('btn-cancel-nota').style.display = 'none';
}

async function deleteNota(id) {
  if (confirm("¿Eliminar esta nota?")) {
    showSyncIndicator('syncing');
    await db.collection('notas').doc(id).delete();
  }
}

// LEADS
function renderLeads() {
  const container = document.getElementById('leads-container');
  if (!container) return;
  container.innerHTML = '';

  const filterStatus = document.getElementById('filter-lead-status').value;
  const filterInteres = document.getElementById('filter-lead-interes').value;
  const filterProd = document.getElementById('filter-lead-prod').value;

  const filtered = leads.filter(l => {
    if (filterStatus !== 'all' && l.estado !== filterStatus) return false;
    if (filterInteres !== 'all' && (l.interes || 'bajo') !== filterInteres) return false;
    if (filterProd !== 'all' && l.producto !== filterProd) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">No se encontraron leads con estos filtros.</p>';
    return;
  }

  filtered.forEach(l => {
    const card = document.createElement('div');
    const interes = l.interes || 'bajo';
    card.className = `lead-card interes-${interes}`;
    
    const date = l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '---';
    
    // Check if 3 days passed since last contact or creation
    const lastDate = l.updatedAt || l.createdAt;
    const daysSince = lastDate ? (new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24) : 0;
    const needsFollowUp = daysSince > 3 && l.estado !== 'validado';

    card.innerHTML = `
      <div class="lead-info">
        <div class="lead-name">${l.nombre || 'Sin nombre'}</div>
        <div class="lead-email">${l.email}</div>
      </div>
      
      <div class="lead-info-row">
        <span class="lead-badge status-${l.estado}">${l.estado.replace('_', ' ')}</span>
        <span class="interes-tag"><span class="sema-dot-sm dot-${interes === 'alto' ? 'urgente' : interes === 'medio' ? 'medio' : 'bajo'}"></span> Interés ${interes}</span>
      </div>

      <div style="font-size:12px; color:var(--text-sub);">
        <strong>Producto:</strong> ${l.producto} | <strong>Origen:</strong> ${l.origen}
      </div>

      ${needsFollowUp ? `<div class="follow-up-needed">⚠️ Seguimiento pendiente (+3 días)</div>` : ''}

      <div class="lead-footer">
        <span class="lead-date">Agregado: ${date}</span>
        <div class="lead-actions">
          <button class="task-btn" onclick="editLead('${l.id}')" title="Editar"><i data-lucide="edit-3" style="width:14px;height:14px;color:var(--accent);"></i></button>
          <button class="task-btn" onclick="deleteLead('${l.id}')" title="Eliminar"><i data-lucide="trash-2" style="width:14px;height:14px;color:var(--rojo);"></i></button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
  refreshIcons();
}

function calculateLeadScore(data) {
  if (data.formFilled && data.emailResponded) return 'alto';
  if (data.formFilled) return 'medio';
  return 'bajo';
}

async function saveLead() {
  const email = document.getElementById('lead-email').value.trim();
  if (!email) { alert("El email es obligatorio"); return; }

  const editingId = document.getElementById('editing-lead-id').value;
  const data = {
    nombre: document.getElementById('lead-nombre').value.trim(),
    email: email,
    producto: document.getElementById('lead-producto').value,
    origen: document.getElementById('lead-origen').value,
    estado: document.getElementById('lead-estado').value,
    formFilled: document.getElementById('check-form').checked,
    emailResponded: document.getElementById('check-email').checked,
    updatedAt: new Date().toISOString()
  };

  data.interes = calculateLeadScore(data);

  showSyncIndicator('syncing');

  try {
    if (editingId) {
      await db.collection('leads').doc(editingId).update(data);
    } else {
      data.createdAt = new Date().toISOString();
      await db.collection('leads').add(data);
      console.log("Notificación Admin: Nuevo Lead registrado - " + data.email);
    }
    closeLeadModal();
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

function openLeadModal() {
  document.getElementById('editing-lead-id').value = '';
  document.getElementById('lead-modal-title').innerText = 'Nuevo Lead';
  document.getElementById('lead-nombre').value = '';
  document.getElementById('lead-email').value = '';
  document.getElementById('lead-producto').value = 'etern-me';
  document.getElementById('lead-origen').value = 'directo';
  document.getElementById('lead-estado').value = 'nuevo';
  document.getElementById('check-form').checked = false;
  document.getElementById('check-email').checked = false;
  document.getElementById('modal-lead-overlay').classList.add('open');
}

function closeLeadModal() {
  document.getElementById('modal-lead-overlay').classList.remove('open');
}

function editLead(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;

  document.getElementById('editing-lead-id').value = id;
  document.getElementById('lead-modal-title').innerText = 'Editar Lead';
  document.getElementById('lead-nombre').value = lead.nombre || '';
  document.getElementById('lead-email').value = lead.email;
  document.getElementById('lead-producto').value = lead.producto;
  document.getElementById('lead-origen').value = lead.origen;
  document.getElementById('lead-estado').value = lead.estado;
  document.getElementById('check-form').checked = lead.formFilled || false;
  document.getElementById('check-email').checked = lead.emailResponded || false;
  
  document.getElementById('modal-lead-overlay').classList.add('open');
}

async function deleteLead(id) {
  if (confirm("¿Eliminar este lead?")) {
    showSyncIndicator('syncing');
    await db.collection('leads').doc(id).delete();
  }
}

// PLANNER SEMANAL DATA
function selectPlannerPrio(btn, prio) {
  const container = btn.closest('.planner-semaforo');
  if (!container) return;
  container.querySelectorAll('.sema-btn').forEach(b => b.classList.remove('active-sema'));
  btn.classList.add('active-sema');
  container.querySelector('.p-prio').value = prio;
}

async function savePlannerData() {
  showSyncIndicator('syncing');
  const plannerData = {};
  
  document.querySelectorAll('#view-planner .day-card').forEach(card => {
    const day = card.dataset.day;
    plannerData[day] = {
      date: card.querySelector('.p-date').value,
      prio: card.querySelector('.p-prio').value,
      notes: card.querySelector('.p-notes').value,
      files: card.querySelector('.p-files').value
    };
  });

  try {
    await db.collection('planner').doc('current_week').set({
      days: plannerData,
      updatedAt: new Date().toISOString()
    });
    showSyncIndicator('ok');
    alert("¡Planner guardado correctamente!");
  } catch (err) {
    showSyncIndicator('error', err.message);
    alert("Error al guardar: " + err.message);
  }
}

async function loadPlannerData() {
  showSyncIndicator('syncing');
  try {
    const doc = await db.collection('planner').doc('current_week').get();
    if (doc.exists) {
      const data = doc.data().days;
      for (const day in data) {
        const card = document.querySelector(`#view-planner .day-card[data-day="${day}"]`);
        if (card) {
          card.querySelector('.p-date').value = data[day].date || '';
          const prio = data[day].prio || 'medio';
          card.querySelector('.p-prio').value = prio;
          card.querySelectorAll('.sema-btn').forEach(b => b.classList.remove('active-sema'));
          const activeBtn = card.querySelector(`.sema-btn[onclick*="${prio}"]`);
          if(activeBtn) activeBtn.classList.add('active-sema');
          card.querySelector('.p-notes').value = data[day].notes || '';
          card.querySelector('.p-files').value = data[day].files || '';
        }
      }
    }
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

// MENU SEMANAL DATA
let isMenuLoaded = false;

async function saveMenuData(silent = false) {
  if (!isMenuLoaded) {
    console.warn("Intento de guardar menú antes de cargar.");
    return;
  }
  showSyncIndicator('syncing');
  const menuData = {};
  
  document.querySelectorAll('#view-menu .day-card').forEach(card => {
    const day = card.dataset.day;
    const checkbox = card.querySelector('.m-check');
    menuData[day] = {
      date: card.querySelector('.m-date').value,
      desayuno: card.querySelector('.m-desayuno').value,
      comida: card.querySelector('.m-comida').value,
      cena: card.querySelector('.m-cena').value,
      colacion: card.querySelector('.m-colacion').value,
      checked: checkbox ? checkbox.checked : false
    };
  });

  try {
    await db.collection('menu').doc('weekly').set({
      days: menuData,
      updatedAt: new Date().toISOString()
    });
    showSyncIndicator('ok');
    if (typeof silent !== 'boolean' || !silent) {
        alert("¡Menú guardado correctamente!");
    }
  } catch (err) {
    showSyncIndicator('error', err.message);
    if (typeof silent !== 'boolean' || !silent) {
        alert("Error al guardar: " + err.message);
    }
  }
}

async function loadMenuData() {
  showSyncIndicator('syncing');
  isMenuLoaded = false;
  try {
    const doc = await db.collection('menu').doc('weekly').get();
    if (doc.exists) {
      const data = doc.data().days;
      for (const day in data) {
        const card = document.querySelector(`#view-menu .day-card[data-day="${day}"]`);
        if (card) {
          card.querySelector('.m-date').value = data[day].date || '';
          card.querySelector('.m-desayuno').value = data[day].desayuno || '';
          card.querySelector('.m-comida').value = data[day].comida || '';
          card.querySelector('.m-cena').value = data[day].cena || '';
          card.querySelector('.m-colacion').value = data[day].colacion || '';
          const checkbox = card.querySelector('.m-check');
          if (checkbox) {
            checkbox.checked = data[day].checked || false;
            reorderMenuCard(card, checkbox.checked);
          }
        }
      }
    }
    isMenuLoaded = true;
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

async function toggleMenuDay(day) {
  if (!isMenuLoaded) return;
  const card = document.querySelector(`#view-menu .day-card[data-day="${day}"]`);
  if (!card) return;
  const checkbox = card.querySelector('.m-check');
  reorderMenuCard(card, checkbox.checked);
  await saveMenuData(true);
}

function reorderMenuCard(card, isChecked) {
  // Las tarjetas no marcadas tienen order = 0 (por defecto)
  // Las tarjetas marcadas tienen order = 1, para que se vayan al final.
  // También bajamos la opacidad para indicar que "ya pasó".
  if (isChecked) {
    card.style.order = '1';
    card.style.opacity = '0.6';
  } else {
    card.style.order = '0';
    card.style.opacity = '1';
  }
}

// GROCERY LIST LOGIC
let groceryItems = [];

function renderGroceryList() {
  const container = document.getElementById('grocery-list');
  if (!container) return;
  container.innerHTML = '';

  if (groceryItems.length === 0) {
    container.innerHTML = '<p class="empty-state">La lista está vacía.</p>';
    return;
  }

  groceryItems.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = `grocery-item ${item.checked ? 'checked' : ''}`;
    div.onclick = () => toggleGroceryItem(index);
    
    div.innerHTML = `
      <div class="grocery-check">
        ${item.checked ? '<i data-lucide="check" style="width:14px;height:14px;"></i>' : ''}
      </div>
      <span class="grocery-text">${item.text}</span>
      <button class="grocery-del" onclick="event.stopPropagation(); deleteGroceryItem(${index})">
        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
      </button>
    `;
    container.appendChild(div);
  });
  refreshIcons();
}

async function addGroceryItem() {
  const input = document.getElementById('grocery-input');
  const text = input.value.trim();
  if (!text) return;

  groceryItems.push({ text, checked: false });
  input.value = '';
  await syncGrocery();
  renderGroceryList();
}

async function toggleGroceryItem(index) {
  groceryItems[index].checked = !groceryItems[index].checked;
  await syncGrocery();
  renderGroceryList();
}

async function deleteGroceryItem(index) {
  groceryItems.splice(index, 1);
  await syncGrocery();
  renderGroceryList();
}

async function syncGrocery() {
  showSyncIndicator('syncing');
  try {
    await db.collection('menu').doc('grocery').set({
      items: groceryItems,
      updatedAt: new Date().toISOString()
    });
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

// ===== ENLACES EXTERNOS (EXCEL Y WHATSAPP) =====
async function saveUrlConfig(key, value) {
  globalUrls[key] = value;
  if (value) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
  showSyncIndicator('syncing');
  try {
    await db.collection('config').doc('urls').set(globalUrls, { merge: true });
    showSyncIndicator('ok');
  } catch (err) {
    console.error("Error guardando enlace:", err);
    showSyncIndicator('error', err.message);
  }
}

function openMarketingExcel() {
  const url = globalUrls.marketingExcelUrl || localStorage.getItem('marketingExcelUrl');
  if (url) {
    window.open(url, '_blank');
  } else {
    let newUrl = prompt("Por favor, pega aquí el enlace a tu Google Sheets o Excel Online:\n(Ej: https://docs.google.com/spreadsheets/...)");
    if (newUrl !== null && newUrl.trim() !== '') {
      newUrl = newUrl.trim();
      if (!newUrl.startsWith('http')) newUrl = 'https://' + newUrl;
      saveUrlConfig('marketingExcelUrl', newUrl);
      window.open(newUrl, '_blank');
    }
  }
}

function changeMarketingExcel() {
  const currentUrl = globalUrls.marketingExcelUrl || localStorage.getItem('marketingExcelUrl') || '';
  let newUrl = prompt("Actualiza el enlace a tu Google Sheets o Excel Online:", currentUrl);
  if (newUrl !== null) {
    newUrl = newUrl.trim();
    if (newUrl === '') {
      saveUrlConfig('marketingExcelUrl', '');
      alert("Enlace eliminado.");
    } else {
      if (!newUrl.startsWith('http')) newUrl = 'https://' + newUrl;
      saveUrlConfig('marketingExcelUrl', newUrl);
      alert("Enlace actualizado correctamente.");
    }
  }
}

function openPersonalExcel() {
  const url = globalUrls.personalExcelUrl || localStorage.getItem('personalExcelUrl');
  if (url) {
    window.open(url, '_blank');
  } else {
    let newUrl = prompt("Por favor, pega aquí el enlace a tu Google Sheets o Excel Online:\n(Ej: https://docs.google.com/spreadsheets/...)");
    if (newUrl !== null && newUrl.trim() !== '') {
      newUrl = newUrl.trim();
      if (!newUrl.startsWith('http')) newUrl = 'https://' + newUrl;
      saveUrlConfig('personalExcelUrl', newUrl);
      window.open(newUrl, '_blank');
    }
  }
}

function changePersonalExcel() {
  const currentUrl = globalUrls.personalExcelUrl || localStorage.getItem('personalExcelUrl') || '';
  let newUrl = prompt("Actualiza el enlace a tu Google Sheets o Excel Online:", currentUrl);
  if (newUrl !== null) {
    newUrl = newUrl.trim();
    if (newUrl === '') {
      saveUrlConfig('personalExcelUrl', '');
      alert("Enlace eliminado.");
    } else {
      if (!newUrl.startsWith('http')) newUrl = 'https://' + newUrl;
      saveUrlConfig('personalExcelUrl', newUrl);
      alert("Enlace actualizado correctamente.");
    }
  }
}

