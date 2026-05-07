// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyB" + "MbkhfkkqDvYL6" + "tww5Uz_t8BliUYyrjEU",
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

// ===== STATE =====
let tasks = [];
let notas = [];
let selectedPrio = 'urgente';
let currentView = 'dashboard';

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
  subscribeToFirestore();
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=1.1').then(reg => {
        reg.update(); // Forzar actualización del SW
        console.log('SW registrado');
    });
  }
});

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
  }, err => {
    showSyncIndicator('error', err.message);
    if(err.code === 'permission-denied') {
        alert("¡Error! No tienes permisos en Firestore. Revisa las Reglas en Firebase Console.");
    }
  });

  // Notas
  db.collection('notas').orderBy('created', 'desc').onSnapshot(snapshot => {
    notas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentView === 'notas') renderNotas();
  }, err => {
    console.error("Error en notas:", err);
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
    webdev:    'Dev',
    marketing: 'Marketing Digital',
    master:    'Máster',
    pandin:    'Pandín',
    personal:  'Vida Personal',
    otra:      'Otra',
    notas:     'Notas Rápidas'
  };
  document.getElementById('page-title').textContent = titles[view] || 'MeliOrganizer';

  if (view === 'dashboard') renderDashboard();
  else if (view === 'notas') renderNotas();
  else renderCategoryList(view);
  refreshIcons();
}

function renderAll() {
  renderDashboard();
  updateStats();
}

function updateStats() {
  const cats = ['webdev', 'marketing', 'master', 'pandin', 'personal', 'otra'];
  cats.forEach(cat => {
    const count = tasks.filter(t => t.cat === cat && !t.done).length;
    const el = document.getElementById('stat-' + cat);
    if (el) el.textContent = count;
  });
}

function renderDashboard() {
  const prios = ['urgente', 'medio', 'bajo'];
  const ids   = ['dash-urgente', 'dash-medio', 'dash-bajo'];
  prios.forEach((prio, i) => {
    const container = document.getElementById(ids[i]);
    if (!container) return;
    const filtered = tasks.filter(t => t.prio === prio && !t.done);
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
  const filtered = tasks.filter(t => t.cat === cat);
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

  const tagLabels = {
    webdev:    'Dev',
    marketing: 'Marketing',
    master:    'Máster',
    pandin:    'Pandín',
    personal:  'Personal',
    otra:      'Otra'
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
  const title = document.getElementById('task-title').value.trim();
  if (!title) return;

  const editingId = document.getElementById('editing-task-id').value;

  const taskData = {
    title,
    desc:    document.getElementById('task-desc').value.trim(),
    cat:     document.getElementById('task-cat').value,
    date:    document.getElementById('task-date').value,
    time:    document.getElementById('task-time').value,
    prio:    selectedPrio,
    updated: new Date().toISOString()
  };

  showSyncIndicator('syncing');

  if (editingId) {
    await db.collection('tasks').doc(editingId).update(taskData);
  } else {
    taskData.done = false;
    taskData.created = new Date().toISOString();
    await db.collection('tasks').add(taskData);
  }
  
  closeModalDirect();
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
    card.className = 'nota-card';
    card.innerHTML = `
      <button class="nota-del" onclick="deleteNota('${n.id}')">✕</button>
      <div class="nota-text">${n.text}</div>
    `;
    grid.appendChild(card);
  });
}

async function addNota() {
  const input = document.getElementById('nota-input');
  const text = input.value.trim();
  if (!text) return;
  showSyncIndicator('syncing');
  await db.collection('notas').add({ text, created: new Date().toISOString() });
  input.value = '';
}

async function deleteNota(id) {
  showSyncIndicator('syncing');
  await db.collection('notas').doc(id).delete();
}

// ===== EXCEL & EXTERNAL LINKS =====
function openMarketingExcel() {
  const url = localStorage.getItem('marketingExcelUrl');
  if (url) {
    window.open(url, '_blank');
  } else {
    changeMarketingExcel();
  }
}

function changeMarketingExcel() {
  const currentUrl = localStorage.getItem('marketingExcelUrl') || '';
  const newUrl = prompt('Ingresa la URL de tu Excel de Marketing:', currentUrl);
  if (newUrl !== null) {
    if (newUrl.trim() === '') {
      localStorage.removeItem('marketingExcelUrl');
      alert('URL eliminada.');
    } else {
      localStorage.setItem('marketingExcelUrl', newUrl);
      alert('URL de Excel guardada.');
    }
  }
}

function openPersonalExcel() {
  const url = localStorage.getItem('personalExcelUrl');
  if (url) {
    window.open(url, '_blank');
  } else {
    changePersonalExcel();
  }
}

function changePersonalExcel() {
  const currentUrl = localStorage.getItem('personalExcelUrl') || '';
  const newUrl = prompt('Ingresa la URL de tu Excel Personal:', currentUrl);
  if (newUrl !== null) {
    if (newUrl.trim() === '') {
      localStorage.removeItem('personalExcelUrl');
      alert('URL eliminada.');
    } else {
      localStorage.setItem('personalExcelUrl', newUrl);
      alert('URL de Excel guardada.');
    }
  }
}

function openMasterWhatsapp() {
  const url = localStorage.getItem('masterWhatsappUrl');
  if (url) {
    window.open(url, '_blank');
  } else {
    changeMasterWhatsapp();
  }
}

function changeMasterWhatsapp() {
  const currentUrl = localStorage.getItem('masterWhatsappUrl') || '';
  const newUrl = prompt('Ingresa el enlace del Grupo de WhatsApp del Máster/TFM:', currentUrl);
  if (newUrl !== null) {
    if (newUrl.trim() === '') {
      localStorage.removeItem('masterWhatsappUrl');
      alert('Enlace eliminado.');
    } else {
      localStorage.setItem('masterWhatsappUrl', newUrl);
      alert('Enlace del grupo guardado.');
    }
  }
}
