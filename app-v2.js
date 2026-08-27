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
const storage = firebase.storage();

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
      initTimelineTicker();
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
let drives = [];
let leads = [];
let icalEvents = [];
let accounts = [];
let transactions = [];
let recurringTransactions = [];
let budgets = [];
let globalUrls = {};
let selectedPrio = 'urgente';
let selectedNotaPrio = 'medio';
let selectedDrivePrio = 'medio';
let currentView = 'timeline';

// ===== SISTEMA DE ALERTAS IN-APP (sin permisos, funciona en iOS/Mac) =====
let alertTickInterval = null;

function initAlertSystem() {
  updateAlertBadge();
  updateNotifButtonState();
  // Actualizar cada minuto
  if (alertTickInterval) clearInterval(alertTickInterval);
  alertTickInterval = setInterval(updateAlertBadge, 60000);
}

// ===== TIMELINE (VISTA POR HORAS, DÍA CALENDARIO 00:00-23:59) =====
let timelineDate = new Date();
let timelineFilterCat = 'all';
let timelineViewMode = 'timeline';
let timelineTickInterval = null;

// Intervalo de snapping (min) compartido por el arrastre de bloques y el click-para-crear;
// el usuario elige 15 o 30 desde el toggle del header y se recuerda entre sesiones.
let timelineSnapMinutes = [15, 30].includes(parseInt(localStorage.getItem('timelineSnapMinutes'), 10))
  ? parseInt(localStorage.getItem('timelineSnapMinutes'), 10)
  : 15;

const TIMELINE_HOUR_HEIGHT = 60; // px por hora
const TIMELINE_EVENT_MINUTES = 30; // duración fija asumida por tarea
const TIMELINE_KNOWN_CATS = ['personal', 'sara', 'casa', 'familia', 'pandin', 'trabajo'];
const TIMELINE_MORNING_HOUR = 6; // hora a la que se hace scroll automático al entrar/cambiar de día

function initTimelineTicker() {
  if (timelineTickInterval) clearInterval(timelineTickInterval);
  timelineTickInterval = setInterval(() => {
    if (currentView === 'timeline' && timelineViewMode === 'timeline') updateTimelineNowLine();
  }, 60000);
  document.querySelectorAll('.timeline-snap-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.snap) === timelineSnapMinutes));
}

function setTimelineSnapMinutes(minutes) {
  timelineSnapMinutes = minutes;
  localStorage.setItem('timelineSnapMinutes', String(minutes));
  document.querySelectorAll('.timeline-snap-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.snap) === minutes));
}

function shiftTimelineDay(delta) {
  timelineDate.setDate(timelineDate.getDate() + delta);
  renderTimeline();
  scrollTimelineToRelevantHour();
}

function getCurrentTimelineDate() {
  return new Date();
}

function goToTimelineToday() {
  timelineDate = getCurrentTimelineDate();
  renderTimeline();
  scrollTimelineToRelevantHour();
}

/** Al entrar a la vista o cambiar de día: si el día mostrado es HOY, hace scroll a la hora
 *  actual (la línea roja de "ahora"); para cualquier otro día, a las 06:00 como antes. No se
 *  llama en cada re-render (para no interrumpir el scroll manual ante updates de Firestore). */
function scrollTimelineToRelevantHour() {
  setTimeout(() => {
    if (timelineViewMode !== 'timeline') return;
    const isToday = toLocalDateStr(timelineDate) === toLocalDateStr(new Date());
    if (isToday) {
      const nowLine = document.querySelector('.timeline-now-line');
      if (nowLine) { nowLine.scrollIntoView({ block: 'center' }); return; }
    }
    const row = document.querySelector(`.timeline-hour-row[data-hour="${TIMELINE_MORNING_HOUR}"]`);
    if (row) row.scrollIntoView({ block: 'start' });
  }, 50);
}

function setTimelineFilterCat(cat) {
  timelineFilterCat = cat;
  document.querySelectorAll('.timeline-cat-pill').forEach(p => p.classList.toggle('active', p.dataset.cat === cat));
  renderTimeline();
}

function toggleTimelineViewMode() {
  timelineViewMode = timelineViewMode === 'timeline' ? 'list' : 'timeline';
  const btnTimeline = document.getElementById('timeline-mode-btn-timeline');
  const btnList = document.getElementById('timeline-mode-btn-list');
  if (btnTimeline) btnTimeline.classList.toggle('active', timelineViewMode === 'timeline');
  if (btnList) btnList.classList.toggle('active', timelineViewMode === 'list');
  renderTimeline();
}

/** Tareas de la fecha D (día calendario normal 00:00-23:59), ya ordenadas por hora. */
function getTimelineDayTasks(dateD) {
  const dateStr = toLocalDateStr(dateD);
  return tasks.filter(t => t.date === dateStr).sort(sortByTime);
}

/** Clase CSS de color por categoría. Cualquier valor de categoría que no sea uno de los 6
 *  conocidos (legacy, mal escrito, con espacios/mayúsculas distintas, etc.) cae en el estilo
 *  neutro "otra" en vez de quedar sin color — así ningún bloque se ve invisible. */
function timelineCatClass(cat) {
  const normalized = (cat || '').toString().trim().toLowerCase();
  return TIMELINE_KNOWN_CATS.includes(normalized) ? `timeline-event-${normalized}` : 'timeline-event-otra';
}

/** Insignia de prioridad urgente: posicionada en la esquina del bloque del timeline,
 *  o inline junto al título en la franja "todo el día". */
function timelineUrgentBadge(inline) {
  if (inline) {
    return '<i data-lucide="alert-triangle" class="timeline-urgent-icon-inline" style="width:13px;height:13px;" title="Prioridad urgente"></i>';
  }
  return '<span class="timeline-urgent-badge" title="Prioridad urgente"><i data-lucide="alert-triangle" style="width:14px;height:14px;"></i></span>';
}

/** Pequeño ícono que indica que la tarea tiene notas (campo `desc` no vacío). */
function timelineNoteIcon(task) {
  if (!task.desc || !task.desc.trim()) return '';
  return '<i data-lucide="sticky-note" class="timeline-note-icon" style="width:12px;height:12px;" title="Tiene notas"></i>';
}

/** Distribuye tareas que se solapan en el tiempo en columnas lado a lado (como un
 *  calendario), para que dos tareas a la misma hora se vean ambas en vez de superpuestas.
 *  Devuelve los items con { task, startMin, endMin, col, totalCols }. */
function layoutTimelineEvents(timedTasks) {
  const items = timedTasks.map(t => {
    const [hh, mm] = t.time.split(':').map(Number);
    const startMin = hh * 60 + mm;
    const durationMin = t.duration || TIMELINE_EVENT_MINUTES;
    return { task: t, startMin, endMin: startMin + durationMin };
  }).sort((a, b) => a.startMin - b.startMin);

  // Agrupa en clusters de tareas que se solapan transitivamente entre sí.
  const clusters = [];
  let current = [];
  let currentEnd = -Infinity;
  items.forEach(item => {
    if (current.length === 0 || item.startMin < currentEnd) {
      current.push(item);
      currentEnd = Math.max(currentEnd, item.endMin);
    } else {
      clusters.push(current);
      current = [item];
      currentEnd = item.endMin;
    }
  });
  if (current.length) clusters.push(current);

  const positioned = [];
  clusters.forEach(cluster => {
    const columnEnds = []; // fin de la última tarea asignada a cada columna
    cluster.forEach(item => {
      let col = columnEnds.findIndex(endMin => item.startMin >= endMin);
      if (col === -1) { col = columnEnds.length; columnEnds.push(item.endMin); }
      else columnEnds[col] = item.endMin;
      item.col = col;
    });
    const totalCols = columnEnds.length;
    cluster.forEach(item => positioned.push({ ...item, totalCols }));
  });

  return positioned;
}

function renderTimeline() {
  const dateLabelEl = document.getElementById('timeline-date-label');
  if (dateLabelEl) {
    let label = timelineDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    label = label.charAt(0).toUpperCase() + label.slice(1);
    dateLabelEl.textContent = label;
  }

  let filtered = getTimelineDayTasks(timelineDate);
  if (timelineFilterCat !== 'all') filtered = filtered.filter(t => t.cat === timelineFilterCat);

  const allDayTasks = filtered.filter(t => !t.time);
  const timedTasks = filtered.filter(t => t.time);

  // Franja "Todo el día"
  const alldaySection = document.getElementById('timeline-allday-section');
  const alldayList = document.getElementById('timeline-allday-list');
  if (alldaySection && alldayList) {
    if (allDayTasks.length === 0) {
      alldaySection.style.display = 'none';
      alldayList.innerHTML = '';
    } else {
      alldaySection.style.display = 'block';
      alldayList.innerHTML = '';
      allDayTasks.forEach(t => {
        const chip = document.createElement('div');
        chip.className = `timeline-allday-chip ${timelineCatClass(t.cat)}`;
        chip.innerHTML = `${t.prio === 'urgente' ? timelineUrgentBadge(true) : ''}${timelineNoteIcon(t)}<span>${t.title}</span>`;
        chip.onclick = () => editTask(t.id);
        alldayList.appendChild(chip);
      });
    }
  }

  const gridWrap = document.getElementById('timeline-grid-wrap');
  const listContainer = document.getElementById('timeline-list-container');

  if (timelineViewMode === 'list') {
    if (gridWrap) gridWrap.style.display = 'none';
    if (listContainer) {
      listContainer.style.display = 'block';
      listContainer.innerHTML = '';
      if (filtered.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">No hay tareas para este día.</p>';
      } else {
        filtered.forEach(t => listContainer.appendChild(buildTaskCard(t)));
      }
    }
    refreshIcons();
    return;
  }

  if (gridWrap) gridWrap.style.display = '';
  if (listContainer) listContainer.style.display = 'none';

  renderTimelineGrid(timedTasks);
  refreshIcons();
}

function renderTimelineGrid(timedTasks) {
  const grid = document.getElementById('timeline-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const hoursCol = document.createElement('div');
  hoursCol.className = 'timeline-hours-col';
  for (let h = 0; h < 24; h++) {
    const row = document.createElement('div');
    row.className = 'timeline-hour-row';
    row.dataset.hour = h;
    row.style.height = TIMELINE_HOUR_HEIGHT + 'px';
    const label = document.createElement('span');
    label.className = 'timeline-hour-label';
    label.textContent = `${String(h).padStart(2, '0')}:00`;
    row.appendChild(label);
    hoursCol.appendChild(row);
  }

  const eventsCol = document.createElement('div');
  eventsCol.className = 'timeline-events-col';
  eventsCol.style.height = `${24 * TIMELINE_HOUR_HEIGHT}px`;

  const positionedEvents = layoutTimelineEvents(timedTasks);

  positionedEvents.forEach(({ task: t, startMin, endMin, col, totalCols }) => {
    const hourOffset = startMin / 60;
    if (hourOffset < 0 || hourOffset > 24) return;

    // Cuando hay solapamiento, las tareas se reparten en columnas lado a lado; si no, ocupan
    // todo el ancho como antes (col=0, totalCols=1 reproduce el layout original exacto).
    const GAP_PCT = totalCols > 1 ? 1.2 : 0;
    const widthPct = (100 - GAP_PCT * (totalCols - 1)) / totalCols;
    const leftPct = col * (widthPct + GAP_PCT);

    const block = document.createElement('div');
    block.className = `timeline-event-block ${timelineCatClass(t.cat)}`;
    block.style.top = `${hourOffset * TIMELINE_HOUR_HEIGHT}px`;
    block.style.height = `${((endMin - startMin) / 60) * TIMELINE_HOUR_HEIGHT}px`;
    block.style.left = `calc(${leftPct}% + 6px)`;
    block.style.width = `calc(${widthPct}% - 12px)`;
    block.style.right = 'auto';
    block.innerHTML = `<span class="timeline-event-time">${t.time}</span> ${timelineNoteIcon(t)}${t.title}${t.prio === 'urgente' ? timelineUrgentBadge(false) : ''}`;
    attachTimelineBlockDrag(block, t, eventsCol);
    eventsCol.appendChild(block);
  });

  attachTimelineEmptySpaceCreate(eventsCol);

  grid.appendChild(hoursCol);
  grid.appendChild(eventsCol);

  updateTimelineNowLine();
}

/** Click/tap en el espacio vacío del grid (no sobre un bloque existente) abre el modal de
 *  Nueva Tarea con la fecha del día visto y la hora calculada según la posición Y, snapeada
 *  al mismo intervalo que el arrastre (timelineSnapMinutes). Usa el mismo criterio de umbral
 *  que el drag para no confundir un arrastre con un click. */
function attachTimelineEmptySpaceCreate(eventsCol) {
  const CLICK_MOVE_THRESHOLD_PX = 4;
  let downX = 0, downY = 0, downTarget = null;

  eventsCol.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
    downTarget = e.target;
  });

  eventsCol.addEventListener('pointerup', (e) => {
    if (timelineViewMode !== 'timeline') return;
    if (e.target.closest('.timeline-event-block')) return; // el bloque maneja su propio click/drag
    if (downTarget && downTarget.closest && downTarget.closest('.timeline-event-block')) return;

    const deltaX = e.clientX - downX;
    const deltaY = e.clientY - downY;
    if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > CLICK_MOVE_THRESHOLD_PX) return; // fue un arrastre

    const rect = eventsCol.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const snapPx = (timelineSnapMinutes / 60) * TIMELINE_HOUR_HEIGHT;
    const maxTop = 24 * TIMELINE_HOUR_HEIGHT - snapPx;
    const snappedTop = Math.max(0, Math.min(Math.round(offsetY / snapPx) * snapPx, maxTop));
    const totalMinutes = Math.round((snappedTop / TIMELINE_HOUR_HEIGHT) * 60);
    const timeStr = `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;

    closeModalDirect();
    document.getElementById('task-date').value = toLocalDateStr(timelineDate);
    document.getElementById('task-time').value = timeStr;
    openModal();
  });
}

/** Arrastre vertical de un bloque del timeline para cambiar su hora (dentro del mismo día).
 *  Sistema independiente del drag-and-drop de las listas de categoría (makeListDraggable,
 *  que reordena por `order`): este usa Pointer Events sobre .timeline-event-block y solo
 *  toca `task.time`, sin superponerse con aquel (elementos y contenedores distintos). */
function attachTimelineBlockDrag(block, task, eventsCol) {
  const DRAG_THRESHOLD_PX = 4; // distancia mínima para distinguir un arrastre de un click

  let dragging = false;
  let moved = false;
  let startClientY = 0;
  let startTop = 0;
  let finalTop = 0;
  let guideLine = null;

  function topToTimeStr(top) {
    const totalMinutes = Math.round((top / TIMELINE_HOUR_HEIGHT) * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  block.addEventListener('pointerdown', (e) => {
    if (timelineViewMode !== 'timeline') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    moved = false;
    startClientY = e.clientY;
    startTop = parseFloat(block.style.top) || 0;
    finalTop = startTop;
    block.setPointerCapture(e.pointerId);
  });

  block.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const deltaY = e.clientY - startClientY;
    if (!moved && Math.abs(deltaY) < DRAG_THRESHOLD_PX) return;
    moved = true;
    block.classList.add('timeline-dragging');

    const blockHeight = parseFloat(block.style.height) || 0;
    const maxTop = 24 * TIMELINE_HOUR_HEIGHT - blockHeight;
    const snapPx = (timelineSnapMinutes / 60) * TIMELINE_HOUR_HEIGHT;
    let newTop = startTop + deltaY;
    newTop = Math.max(0, Math.min(newTop, maxTop));
    finalTop = Math.round(newTop / snapPx) * snapPx;
    block.style.top = `${finalTop}px`;

    if (!guideLine) {
      guideLine = document.createElement('div');
      guideLine.className = 'timeline-drag-guide';
      eventsCol.appendChild(guideLine);
    }
    guideLine.style.top = `${finalTop}px`;
    guideLine.innerHTML = `<span>${topToTimeStr(finalTop)}</span>`;
  });

  async function endDrag() {
    if (!dragging) return;
    dragging = false;
    block.classList.remove('timeline-dragging');
    if (guideLine) { guideLine.remove(); guideLine = null; }

    if (!moved) {
      editTask(task.id);
      return;
    }

    const newTime = topToTimeStr(finalTop);
    if (newTime === task.time) return;

    let scope = 'only';
    if (task.recurringGroupId) {
      scope = await askRecurringScope();
      if (!scope) {
        block.style.top = `${startTop}px`; // cancelado: revertir la posición visual
        return;
      }
    }

    showSyncIndicator('syncing');
    try {
      if (scope === 'future' && task.recurringGroupId) {
        const toUpdate = tasks.filter(t => t.recurringGroupId === task.recurringGroupId && t.date >= task.date);
        const batch = db.batch();
        toUpdate.forEach(t => batch.update(db.collection('tasks').doc(t.id), { time: newTime }));
        await batch.commit();
      } else {
        await db.collection('tasks').doc(task.id).update({ time: newTime });
      }
      showSyncIndicator('ok');
    } catch (err) {
      showSyncIndicator('error', err.message);
    }
  }

  block.addEventListener('pointerup', endDrag);
  block.addEventListener('pointercancel', endDrag);
}

/** Recalcula (o quita) la línea roja de "ahora"; se muestra siempre que la fecha del
 *  timeline mostrada sea la fecha real de hoy (comparación simple de fecha). */
function updateTimelineNowLine() {
  const eventsCol = document.querySelector('#timeline-grid .timeline-events-col');
  if (!eventsCol) return;

  let line = eventsCol.querySelector('.timeline-now-line');
  const isToday = toLocalDateStr(timelineDate) === toLocalDateStr(getCurrentTimelineDate());

  if (!isToday) {
    if (line) line.remove();
    return;
  }

  const now = new Date();
  const hourOffset = now.getHours() + now.getMinutes() / 60;

  if (!line) {
    line = document.createElement('div');
    line.className = 'timeline-now-line';
    eventsCol.appendChild(line);
  }
  line.style.top = `${hourOffset * TIMELINE_HOUR_HEIGHT}px`;
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

// ===== NOTIFICACIONES DEL NAVEGADOR =====
let notifiedTaskIds = new Set(JSON.parse(localStorage.getItem('notifiedTaskIds') || '[]'));

function persistNotifiedIds() {
  localStorage.setItem('notifiedTaskIds', JSON.stringify([...notifiedTaskIds]));
}

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Tu navegador no soporta notificaciones.');
    return;
  }
  Notification.requestPermission().then(perm => {
    updateNotifButtonState();
    if (perm === 'granted') {
      new Notification('CRMeli', { body: 'Notificaciones activadas. Te avisaré de tareas vencidas o de hoy.' });
    } else if (perm === 'denied') {
      alert('Bloqueaste las notificaciones. Actívalas desde los ajustes del navegador si cambias de idea.');
    }
  });
}

function updateNotifButtonState() {
  const btn = document.getElementById('btn-enable-notifs');
  if (!btn) return;
  const label = btn.querySelector('span');
  if (!('Notification' in window)) {
    btn.style.display = 'none';
    return;
  }
  label.textContent = Notification.permission === 'granted' ? 'Notificaciones activas' : 'Activar notificaciones';
}

/** Dispara notificaciones del navegador para tareas vencidas o de hoy, una vez por tarea */
function checkBrowserNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const { overdue, dueToday } = classifyScheduledTasks();
  let changed = false;
  [...overdue, ...dueToday].forEach(task => {
    if (!notifiedTaskIds.has(task.id)) {
      notifiedTaskIds.add(task.id);
      changed = true;
      const parts = [];
      if (task.date) parts.push(task.date.split('-').reverse().join('/'));
      if (task.time) parts.push(task.time);
      new Notification('⏰ ' + task.title, { body: parts.join(' · '), tag: task.id });
    }
  });
  if (changed) persistNotifiedIds();
}

// --- Avisos de presupuesto y de movimientos recurrentes (Dinero) ---
let notifiedBudgetKeys = new Set(JSON.parse(localStorage.getItem('notifiedBudgetKeys') || '[]'));
let notifiedRecurringKeys = new Set(JSON.parse(localStorage.getItem('notifiedRecurringKeys') || '[]'));

function persistNotifiedBudgetKeys() {
  localStorage.setItem('notifiedBudgetKeys', JSON.stringify([...notifiedBudgetKeys]));
}

function persistNotifiedRecurringKeys() {
  localStorage.setItem('notifiedRecurringKeys', JSON.stringify([...notifiedRecurringKeys]));
}

/** Avisa cuando un presupuesto llega al 90% o se pasa del límite (una vez por mes por presupuesto) */
function checkBudgetAlerts() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let changed = false;

  budgets.forEach(b => {
    const spent = transactions
      .filter(t => t.type === 'gasto' && t.category === b.category && (t.currency || 'EUR') === b.currency && t.date && t.date.slice(0, 7) === month)
      .reduce((s, t) => s + t.amount, 0);
    if (spent <= 0 || !b.limit) return;
    const pct = spent / b.limit;
    if (pct < 0.9) return;

    const key = `${b.category}-${b.currency}-${month}`;
    if (notifiedBudgetKeys.has(key)) return;
    notifiedBudgetKeys.add(key);
    changed = true;

    const title = pct >= 1 ? `⚠️ Presupuesto de ${b.category} superado` : `💸 Presupuesto de ${b.category} casi al límite`;
    new Notification(title, {
      body: `Llevas ${formatMoney(spent, b.currency)} de ${formatMoney(b.limit, b.currency)} este mes.`,
      tag: key
    });
  });

  if (changed) persistNotifiedBudgetKeys();
}

/** Avisa 2 días antes de que se genere un movimiento recurrente */
function checkRecurringReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = now.getDate();
  let changed = false;

  recurringTransactions.forEach(r => {
    if (r.active === false) return;
    const targetDay = Math.min(r.dayOfMonth, daysInMonth(now));
    if (targetDay - today !== 2) return;

    const key = `${r.id}-${currentMonth}`;
    if (notifiedRecurringKeys.has(key)) return;
    notifiedRecurringKeys.add(key);
    changed = true;

    new Notification('🔁 Próximo movimiento recurrente', {
      body: `${r.note || r.category} se registrará en 2 días · ${formatMoney(r.amount, r.currency || 'EUR')}`,
      tag: key
    });
  });

  if (changed) persistNotifiedRecurringKeys();
}

/** Actualiza el globito rojo sobre la campana */
function updateAlertBadge() {
  const { overdue, dueToday } = classifyScheduledTasks();
  const alertCount = overdue.length + dueToday.length;
  checkBrowserNotifications();
  checkBudgetAlerts();
  checkRecurringReminders();

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

  const catLabels = { trabajo: 'Trabajo', casa: 'Casa', familia: 'Familia', pandin: 'Pandín', sara: 'Sara', personal: 'Personal' };

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

// ===== DESHACER AL ELIMINAR =====
let undoToastTimer = null;

function showUndoToast(message, undoFn) {
  let toast = document.getElementById('undo-toast');
  if (toast) toast.remove();
  clearTimeout(undoToastTimer);

  toast = document.createElement('div');
  toast.id = 'undo-toast';
  toast.className = 'undo-toast';
  toast.innerHTML = `<span>${message}</span><button class="undo-btn">Deshacer</button>`;
  document.body.appendChild(toast);

  const remove = () => { if (toast) { toast.remove(); toast = null; } };
  undoToastTimer = setTimeout(remove, 6000);
  toast.querySelector('.undo-btn').onclick = async () => {
    clearTimeout(undoToastTimer);
    remove();
    await undoFn();
  };
}

// ===== BUSCADOR GLOBAL =====
const searchCatLabels = { trabajo: 'Trabajo', casa: 'Casa', familia: 'Familia', pandin: 'Pandín', sara: 'Sara', personal: 'Personal' };

function onGlobalSearch(query) {
  const box = document.getElementById('search-results');
  if (!box) return;
  const q = query.trim().toLowerCase();

  if (!q) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }

  const results = [];

  tasks.forEach(t => {
    const tagsMatch = (t.tags || []).some(tg => tg.toLowerCase().includes(q));
    if ((t.title && t.title.toLowerCase().includes(q)) || (t.desc && t.desc.toLowerCase().includes(q)) || tagsMatch) {
      results.push({ icon: 'check-circle-2', label: t.title, meta: searchCatLabels[t.cat] || t.cat, action: () => showView(t.cat) });
    }
  });

  notas.forEach(n => {
    if (n.text && n.text.toLowerCase().includes(q)) {
      results.push({ icon: 'sticky-note', label: n.text.slice(0, 60), meta: 'Nota', action: () => showView('notas') });
    }
  });

  drives.forEach(d => {
    if (d.name && d.name.toLowerCase().includes(q)) {
      results.push({ icon: 'hard-drive', label: d.name, meta: 'Drive', action: () => showView('drive') });
    }
  });

  // Los movimientos de Dinero no se indexan en el buscador si la sección está protegida con PIN
  if (!dineroPinHash || isDineroUnlocked()) {
    transactions.forEach(t => {
      const noteMatch = t.note && t.note.toLowerCase().includes(q);
      const catMatch = t.category && t.category.toLowerCase().includes(q);
      if (noteMatch || catMatch) {
        const dateStr = t.date ? t.date.split('-').reverse().join('/') : '';
        results.push({
          icon: t.type === 'ingreso' ? 'arrow-up-circle' : 'arrow-down-circle',
          label: `${t.category}${t.note ? ' · ' + t.note : ''}`,
          meta: `${formatMoney(t.amount, t.currency || 'EUR')} · ${dateStr}`,
          action: () => showView('dinero')
        });
      }
    });
  }

  icalEvents.forEach(e => {
    if (e.title && e.title.toLowerCase().includes(q)) {
      results.push({
        icon: 'calendar-clock',
        label: e.title,
        meta: e.date ? e.date.split('-').reverse().join('/') : 'iCal',
        action: () => { showView('calendario'); if (e.date) selectCalendarDay(e.date); }
      });
    }
  });

  if (results.length === 0) {
    box.innerHTML = '<div class="search-empty">Sin resultados para "' + query.trim() + '"</div>';
  } else {
    box.innerHTML = results.slice(0, 30).map((r, i) => `
      <div class="search-result-row" data-search-idx="${i}">
        <i data-lucide="${r.icon}" style="width:14px;height:14px;flex-shrink:0;"></i>
        <span class="search-result-label">${r.label}</span>
        <span class="search-result-meta">${r.meta}</span>
      </div>
    `).join('');
    box.querySelectorAll('[data-search-idx]').forEach(row => {
      const idx = Number(row.dataset.searchIdx);
      row.onclick = () => {
        results[idx].action();
        box.classList.remove('open');
        document.getElementById('global-search').value = '';
      };
    });
  }

  box.classList.add('open');
  refreshIcons();
}

function toggleMobileSearch() {
  const wrapper = document.querySelector('.topbar-search');
  if (!wrapper) return;
  wrapper.classList.toggle('mobile-open');
  if (wrapper.classList.contains('mobile-open')) {
    const input = document.getElementById('global-search');
    if (input) input.focus();
  }
}

document.addEventListener('click', (e) => {
  const wrapper = document.querySelector('.topbar-search');
  const mobileBtn = document.getElementById('btn-mobile-search');
  if (wrapper && !wrapper.contains(e.target) && !(mobileBtn && mobileBtn.contains(e.target))) {
    const box = document.getElementById('search-results');
    if (box) box.classList.remove('open');
    wrapper.classList.remove('mobile-open');
  }
});

// ===== TEMA CLARO / OSCURO =====
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
  updateMoneyNavIcon();
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) {
    // Regeneramos el <i> siempre: Lucide reemplaza el <i> original por un <svg>,
    // así que reusar el nodo existente deja de funcionar después del primer cambio.
    btn.innerHTML = `<i data-lucide="${theme === 'light' ? 'sun' : 'moon'}" style="width:16px;height:16px;"></i>`;
    refreshIcons();
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme(next);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateDate();
  initTheme();
  initAuth();
  updateOnlineStatus();
});

// ===== INDICADOR DE SIN CONEXIÓN =====
function updateOnlineStatus() {
  let banner = document.getElementById('offline-banner');
  if (!navigator.onLine) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      banner.innerHTML = '<i data-lucide="wifi-off" style="width:14px;height:14px;"></i> Sin conexión — tus cambios se guardan y se sincronizan cuando vuelvas a tener internet.';
      document.body.appendChild(banner);
      refreshIcons();
    }
  } else if (banner) {
    banner.remove();
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

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
    if (currentView === 'calendario') renderCalendar();
    else if (currentView === 'timeline') renderTimeline();
    else if (!['dashboard', 'notas', 'drive', 'dinero'].includes(currentView)) renderCategoryList(currentView);
    showSyncIndicator('ok');
    // Re-check del badge al recibir cambios de Firestore
    updateAlertBadge();
    scheduleICSSync();
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

  // Drive
  db.collection('drives').orderBy('created', 'desc').onSnapshot(snap => {
    drives = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentView === 'drive') renderDrives();
  });

  db.collection('leads').orderBy('createdAt', 'desc').onSnapshot(snap => {
    leads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentView === 'leads') renderLeads();
    updateStats();
  });

  // Eventos importados desde iCal externo
  db.collection('config').doc('icalEvents').onSnapshot(doc => {
    icalEvents = doc.exists ? (doc.data().events || []) : [];
    if (currentView === 'calendario') renderCalendar();
  });

  db.collection('config').doc('security').onSnapshot(doc => {
    dineroPinHash = doc.exists ? (doc.data().dineroPinHash || null) : null;
    updateDineroPinButtonLabel();
    if (currentView === 'dinero') checkDineroLock();
  });

  // Dinero: cuentas y movimientos
  db.collection('accounts').orderBy('created', 'asc').onSnapshot(snap => {
    accounts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentView === 'dinero') renderMoney();
  });

  db.collection('transactions').orderBy('date', 'desc').onSnapshot(snap => {
    transactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    checkBudgetAlerts();
    if (currentView === 'dinero') renderMoney();
  });

  db.collection('recurringTransactions').orderBy('created', 'asc').onSnapshot(snap => {
    recurringTransactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    checkRecurringTransactions();
    checkRecurringReminders();
    if (currentView === 'dinero') renderMoney();
  });

  db.collection('config').doc('budgets').onSnapshot(doc => {
    budgets = doc.exists ? (doc.data().items || []) : [];
    checkBudgetAlerts();
    if (currentView === 'dinero') renderMoney();
  });

  // Enlaces de Excel y WhatsApp (Sincronización multidispositivo)
  const excelCategories = ['trabajo', 'casa', 'familia', 'pandin', 'sara', 'personal', 'dinero'];
  const urlKeys = [...excelCategories.map(c => c + 'ExcelUrl'), 'whatsappUrl'];
  db.collection('config').doc('urls').onSnapshot(doc => {
    if (doc.exists) {
      globalUrls = doc.data();
      urlKeys.forEach(key => {
        if (globalUrls[key]) localStorage.setItem(key, globalUrls[key]);
      });
      if (globalUrls.moneyCurrency && globalUrls.moneyCurrency !== defaultMoneyCurrency) {
        defaultMoneyCurrency = globalUrls.moneyCurrency;
        localStorage.setItem('moneyCurrency', defaultMoneyCurrency);
        updateMoneyNavIcon();
      }
    } else {
      // Migración desde localStorage
      const migratedUrls = {};
      urlKeys.forEach(key => {
        const val = localStorage.getItem(key);
        if (val) migratedUrls[key] = val;
      });
      if (Object.keys(migratedUrls).length) {
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
    timeline:  'Timeline',
    dashboard: 'Dashboard',
    trabajo:   'Trabajo',
    casa:      'Casa',
    familia:   'Familia',
    pandin:    'Pandín',
    sara:      'Sara',
    personal:  'Vida Personal',
    notas:     'Notas Rápidas',
    drive:     'Drive',
    leads:     'Leads',
    planner:   'Planner Semanal',
    calendario:'Calendario',
    dinero:    'Dinero'
  };
  document.getElementById('page-title').textContent = titles[view] || 'MeliOrganizer';

  if (view === 'timeline') { renderTimeline(); scrollTimelineToRelevantHour(); }
  else if (view === 'dashboard') renderDashboard();
  else if (view === 'notas') renderNotas();
  else if (view === 'drive') renderDrives();
  else if (view === 'leads') renderLeads();
  else if (view === 'planner') loadPlannerData();
  else if (view === 'calendario') {
    renderCalendar();
    updateICalFeedUI();
    maybeAutoSyncICal();
  }
  else if (view === 'dinero') renderMoney();
  else renderCategoryList(view);
  refreshIcons();
}

function renderAll() {
  renderDashboard();
  updateStats();
  updateAlertBadge();
}

function updateStats() {
  const cats = ['trabajo', 'casa', 'familia', 'pandin', 'sara', 'personal'];
  cats.forEach(cat => {
    const count = tasks.filter(t => t.cat === cat && !t.done).length;
    const el = document.getElementById('stat-' + cat);
    if (el) el.textContent = count;
  });
}

function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Ordena por horario: las tareas sin hora (todo el día) van primero */
function sortByTime(a, b) {
  if (!a.time && !b.time) return 0;
  if (!a.time) return -1;
  if (!b.time) return 1;
  return a.time.localeCompare(b.time);
}

/** Racha de días consecutivos con al menos una tarea completada */
function computeStreak() {
  const completedDates = new Set();
  tasks.forEach(t => {
    if (t.completedAt) completedDates.add(t.completedAt.slice(0, 10));
  });

  let cursor = new Date();
  if (!completedDates.has(toLocalDateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (completedDates.has(toLocalDateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderStreak() {
  const el = document.getElementById('streak-badge');
  if (!el) return;
  const streak = computeStreak();
  if (streak > 0) {
    el.style.display = 'flex';
    el.querySelector('.streak-count').textContent = streak;
  } else {
    el.style.display = 'none';
  }
}

function renderDashboard() {
  renderAlertsPanel();
  renderStreak();
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

  // Filtrar y ordenar: pendientes primero, respetando el orden manual (drag & drop), luego por fecha/hora
  const filtered = tasks.filter(t => t.cat === cat);
  filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const orderA = typeof a.order === 'number' ? a.order : Infinity;
    const orderB = typeof b.order === 'number' ? b.order : Infinity;
    if (orderA !== orderB) return orderA - orderB;
    const dateTimeA = (a.date || '9999-12-31') + (a.time || '23:59');
    const dateTimeB = (b.date || '9999-12-31') + (b.time || '23:59');
    return dateTimeA.localeCompare(dateTimeB);
  });

  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay tareas aún. ¡Añade una!</p>';
  } else {
    filtered.forEach(t => container.appendChild(buildTaskCard(t)));
    makeListDraggable(container, cat);
  }
  refreshIcons();
}

// ===== DRAG & DROP PARA REORDENAR TAREAS PENDIENTES =====
function makeListDraggable(container, cat) {
  let dragEl = null;

  container.querySelectorAll('.task-card:not(.done-card)').forEach(card => {
    card.draggable = true;
    card.classList.add('draggable-card');

    card.addEventListener('dragstart', () => {
      dragEl = card;
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragEl = null;
      persistCategoryOrder(container, cat);
    });
  });

  container.ondragover = (e) => {
    if (!dragEl) return;
    e.preventDefault();
    const after = getDragAfterElement(container, e.clientY);
    if (after == null) container.appendChild(dragEl);
    else container.insertBefore(dragEl, after);
  };
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.task-card:not(.dragging):not(.done-card)')];
  return els.reduce((closest, el) => {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: el };
    return closest;
  }, { offset: -Infinity }).element;
}

async function persistCategoryOrder(container, cat) {
  const ids = [...container.querySelectorAll('.task-card:not(.done-card)')].map(c => c.id.replace('task-', ''));
  showSyncIndicator('syncing');
  const batch = db.batch();
  ids.forEach((id, idx) => batch.update(db.collection('tasks').doc(id), { order: idx }));
  try {
    await batch.commit();
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
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
    trabajo:   'Trabajo',
    casa:      'Casa',
    familia:   'Familia',
    pandin:    'Pandín',
    sara:      'Sara',
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
    ${task.tags && task.tags.length ? `<div class="task-tags-row">${task.tags.map(tg => `<span class="task-tag-chip">#${tg}</span>`).join('')}</div>` : ''}
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


// ===== CALENDARIO MENSUAL =====
let calendarDate = new Date();
let calendarSelectedDay = null;

function calendarShiftMonth(delta) {
  calendarDate.setDate(1);
  calendarDate.setMonth(calendarDate.getMonth() + delta);
  calendarSelectedDay = null;
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('calendar-month-label');
  if (!grid || !label) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  label.textContent = calendarDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1);
  // Lunes = 0 ... Domingo = 6
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toLocalDateStr(new Date());

  grid.innerHTML = '';

  for (let i = 0; i < leadingBlanks; i++) {
    grid.appendChild(document.createElement('div')).className = 'calendar-cell empty';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTasks = tasks.filter(t => t.date === dateStr).sort(sortByTime);
    const dayIcalEvents = icalEvents.filter(e => e.date === dateStr);

    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    if (dateStr === todayStr) cell.classList.add('is-today');
    if (dateStr === calendarSelectedDay) cell.classList.add('is-selected');

    const taskDots = dayTasks.slice(0, 3).map(t => `<span class="calendar-dot dot-${t.prio}"></span>`).join('');
    const icalDot = dayIcalEvents.length ? '<span class="calendar-dot calendar-dot-ical"></span>' : '';
    cell.innerHTML = `<span class="calendar-day-num">${day}</span><div class="calendar-dots">${taskDots}${icalDot}</div>`;
    cell.onclick = () => selectCalendarDay(dateStr);
    grid.appendChild(cell);
  }

  if (calendarSelectedDay) {
    renderCalendarDayTasks(calendarSelectedDay);
  }
  refreshIcons();
}

function selectCalendarDay(dateStr) {
  calendarSelectedDay = dateStr;
  renderCalendar();
  const panel = document.getElementById('calendar-day-panel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderCalendarDayTasks(dateStr) {
  const title = document.getElementById('calendar-day-title');
  const list = document.getElementById('calendar-day-tasks');
  const icalList = document.getElementById('calendar-day-ical');
  if (!title || !list) return;

  const [y, m, d] = dateStr.split('-');
  title.textContent = `Tareas del ${d}/${m}/${y}`;

  const dayTasks = tasks.filter(t => t.date === dateStr).sort(sortByTime);
  list.innerHTML = '';
  if (dayTasks.length === 0) {
    list.innerHTML = '<p class="empty-state">No hay tareas programadas este día.</p>';
  } else {
    dayTasks.forEach(t => list.appendChild(buildTaskCard(t)));
  }

  if (icalList) {
    const dayIcalEvents = icalEvents.filter(e => e.date === dateStr).sort(sortByTime);
    if (dayIcalEvents.length === 0) {
      icalList.innerHTML = '';
    } else {
      icalList.innerHTML = '<h4 class="ical-events-title"><i data-lucide="calendar-clock" style="width:13px;height:13px;"></i> Eventos de tu iCal</h4>' +
        dayIcalEvents.map(e => `
          <div class="ical-event-row">
            <span class="ical-event-title">${e.title}</span>
            ${e.time ? `<span class="ical-event-time">${e.time}</span>` : ''}
          </div>
        `).join('');
    }
  }
  refreshIcons();
}

async function toggleDone(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    showSyncIndicator('syncing');
    const done = !task.done;
    const update = { done };
    if (done) {
      update.completedAt = new Date().toISOString();
      if (notifiedTaskIds.delete(id)) persistNotifiedIds();
    }
    await db.collection('tasks').doc(id).update(update);
  }
}

/** Muestra el pequeño modal de alcance para tareas repetitivas y resuelve con
 *  'only' | 'future' | null (null = el usuario canceló, no hacer nada). */
function askRecurringScope() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-recurring-scope-overlay');
    const btnOnly = document.getElementById('btn-recurring-scope-only');
    const btnFuture = document.getElementById('btn-recurring-scope-future');
    const btnCancel = document.getElementById('btn-recurring-scope-cancel');

    const cleanup = (result) => {
      overlay.classList.remove('open');
      btnOnly.onclick = null;
      btnFuture.onclick = null;
      btnCancel.onclick = null;
      resolve(result);
    };

    btnOnly.onclick = () => cleanup('only');
    btnFuture.onclick = () => cleanup('future');
    btnCancel.onclick = () => cleanup(null);
    overlay.classList.add('open');
  });
}

async function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  let scope = 'only';
  if (task.recurringGroupId) {
    scope = await askRecurringScope();
    if (!scope) return; // cancelado
  }

  if (scope === 'future') {
    const toDelete = tasks.filter(t => t.recurringGroupId === task.recurringGroupId && t.date >= task.date);
    showSyncIndicator('syncing');
    try {
      const batch = db.batch();
      toDelete.forEach(t => batch.delete(db.collection('tasks').doc(t.id)));
      await batch.commit();
      showSyncIndicator('ok');
      showUndoToast(`${toDelete.length} tareas eliminadas`, async () => {
        showSyncIndicator('syncing');
        const undoBatch = db.batch();
        toDelete.forEach(t => {
          const { id: _drop, ...data } = t;
          undoBatch.set(db.collection('tasks').doc(t.id), data);
        });
        await undoBatch.commit();
        showSyncIndicator('ok');
      });
    } catch (err) {
      showSyncIndicator('error', err.message);
    }
    return;
  }

  // 'only' (tarea suelta, o "solo esta tarea" de una serie): comportamiento original
  showSyncIndicator('syncing');
  await db.collection('tasks').doc(id).delete();
  showSyncIndicator('ok');
  showUndoToast('Tarea eliminada', async () => {
    showSyncIndicator('syncing');
    const { id: _drop, ...data } = task;
    await db.collection('tasks').doc(id).set(data);
    showSyncIndicator('ok');
  });
}

// MODAL
function openModal() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('task-title').focus();
  const isEditing = !!document.getElementById('editing-task-id').value;
  const btnDelete = document.getElementById('btn-delete-task');
  if (btnDelete) btnDelete.style.display = isEditing ? 'inline-block' : 'none';
  refreshIcons();
}

/** Elimina la tarea que se está editando en el modal, reutilizando deleteTask() existente. */
function deleteTaskFromModal() {
  const id = document.getElementById('editing-task-id').value;
  if (!id) return;
  deleteTask(id);
  closeModalDirect();
}

function closeModalDirect() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('editing-task-id').value = '';
  document.getElementById('modal-title-text').textContent = 'Nueva Tarea';
  document.getElementById('task-title').value = '';
  document.getElementById('task-desc').value = '';
  document.getElementById('task-date').value = '';
  document.getElementById('task-time').value = '';
  document.getElementById('task-tags').value = '';
  document.getElementById('task-duration').value = '30';
  document.getElementById('task-duration-custom').value = '';
  document.getElementById('task-duration-custom').style.display = 'none';
  resetRepeatFields();
}

/** Limpia el selector de "Repetir" y sus controles asociados (días de la semana, fecha límite). */
function resetRepeatFields() {
  document.getElementById('task-repeat').value = '';
  document.getElementById('task-repeat-until').value = '';
  document.getElementById('task-repeat-days').value = '';
  document.querySelectorAll('.repeat-day-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('repeat-days-picker').style.display = 'none';
  document.getElementById('repeat-until-group').style.display = 'none';
}

/** Muestra/oculta el picker de días y el campo de fecha límite según el tipo de repetición elegido. */
function onTaskRepeatChange() {
  const val = document.getElementById('task-repeat').value;
  document.getElementById('repeat-days-picker').style.display = val === 'customdays' ? 'flex' : 'none';
  document.getElementById('repeat-until-group').style.display = val ? 'block' : 'none';
}

function toggleRepeatDay(day, btn) {
  btn.classList.toggle('active');
  const hidden = document.getElementById('task-repeat-days');
  const days = new Set(hidden.value ? hidden.value.split(',').map(Number) : []);
  if (days.has(day)) days.delete(day); else days.add(day);
  hidden.value = [...days].join(',');
}

/** Presets de duración que ofrece el select; cualquier otro valor cae en "Personalizada…". */
const TIMELINE_DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180, 240];

function onTaskDurationChange() {
  const sel = document.getElementById('task-duration');
  const custom = document.getElementById('task-duration-custom');
  custom.style.display = sel.value === 'custom' ? 'inline-block' : 'none';
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  document.getElementById('editing-task-id').value = id;
  document.getElementById('modal-title-text').textContent = 'Editar Tarea';
  document.getElementById('task-title').value = task.title || '';
  document.getElementById('task-desc').value = task.desc || '';
  document.getElementById('task-cat').value = task.cat || 'personal';
  document.getElementById('task-date').value = task.date || '';
  document.getElementById('task-time').value = task.time || '';
  document.getElementById('task-tags').value = (task.tags || []).join(', ');
  // La recurrencia no se edita todavía desde aquí (solo se crea al hacer una tarea nueva),
  // así que el select siempre arranca en "No se repite" al editar, sin importar la serie.
  resetRepeatFields();

  const dur = task.duration || TIMELINE_EVENT_MINUTES;
  const durationSel = document.getElementById('task-duration');
  const durationCustom = document.getElementById('task-duration-custom');
  if (TIMELINE_DURATION_PRESETS.includes(dur)) {
    durationSel.value = String(dur);
    durationCustom.style.display = 'none';
    durationCustom.value = '';
  } else {
    durationSel.value = 'custom';
    durationCustom.value = dur;
    durationCustom.style.display = 'inline-block';
  }

  selectPrio(task.prio || 'urgente');

  openModal();
}

function selectPrio(prio) {
  selectedPrio = prio;
  document.querySelectorAll('.sema-btn').forEach(b => b.classList.remove('active-sema'));
  document.querySelector(`[data-prio="${prio}"]`).classList.add('active-sema');
}

function generateRecurringGroupId() {
  return `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Crea las ocurrencias de una serie repetitiva en un solo batch de Firestore.
 *  daily/weekly/monthly/customdays generan ocurrencias hasta `options.until` (si se indica) o,
 *  si no hay fecha límite, hasta un horizonte por defecto (90 días, 182 días, 12 meses, 90 días
 *  respectivamente). `options.days` (0=domingo..6=sábado) es obligatorio para 'customdays'.
 *  La fecha elegida en el modal cuenta como la primera ocurrencia. */
async function createRecurringTaskSeries(baseData, repeatType, options = {}) {
  const VALID_TYPES = ['daily', 'weekly', 'monthly', 'customdays'];
  const { until = null, days = null } = options;

  if (!VALID_TYPES.includes(repeatType) || (repeatType === 'customdays' && (!days || days.length === 0))) {
    await db.collection('tasks').add(baseData);
    return;
  }

  const [y, mo, d] = baseData.date.split('-').map(Number);
  const baseDateObj = new Date(y, mo - 1, d);

  let untilObj;
  if (until) {
    const [uy, umo, ud] = until.split('-').map(Number);
    untilObj = new Date(uy, umo - 1, ud);
  } else {
    untilObj = new Date(baseDateObj);
    const DEFAULT_SPAN_DAYS = { daily: 90, weekly: 182, customdays: 90 };
    if (repeatType === 'monthly') untilObj.setMonth(untilObj.getMonth() + 12);
    else untilObj.setDate(untilObj.getDate() + DEFAULT_SPAN_DAYS[repeatType]);
  }

  const MAX_OCCURRENCES = 366;
  const groupId = generateRecurringGroupId();
  const daySet = repeatType === 'customdays' ? new Set(days) : null;
  const batch = db.batch();
  let count = 0;
  const cursor = new Date(baseDateObj);

  while (cursor <= untilObj && count < MAX_OCCURRENCES) {
    const include = repeatType === 'customdays' ? daySet.has(cursor.getDay()) : true;
    if (include) {
      const docRef = db.collection('tasks').doc();
      batch.set(docRef, {
        ...baseData,
        date: toLocalDateStr(cursor),
        recurringGroupId: groupId,
        recurringType: repeatType
      });
      count++;
    }

    if (repeatType === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
    else if (repeatType === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else cursor.setDate(cursor.getDate() + 1); // daily y customdays avanzan día a día
  }

  if (count === 0) {
    await db.collection('tasks').add(baseData);
    return;
  }
  await batch.commit();
}

async function saveTask() {
  const titleEl = document.getElementById('task-title');
  const descEl = document.getElementById('task-desc');
  const catEl = document.getElementById('task-cat');
  const dateEl = document.getElementById('task-date');
  const timeEl = document.getElementById('task-time');
  const tagsEl = document.getElementById('task-tags');
  const repeatEl = document.getElementById('task-repeat');
  const durationEl = document.getElementById('task-duration');
  const durationCustomEl = document.getElementById('task-duration-custom');
  const editingIdEl = document.getElementById('editing-task-id');

  const title = titleEl.value.trim();
  if (!title) return;

  const editingId = editingIdEl.value;

  const repeatType = repeatEl.value;
  const repeatUntil = document.getElementById('task-repeat-until').value || null;
  let repeatDays = null;
  if (repeatType === 'customdays') {
    const daysVal = document.getElementById('task-repeat-days').value;
    repeatDays = daysVal ? daysVal.split(',').map(Number) : [];
    if (repeatDays.length === 0) {
      alert('Selecciona al menos un día de la semana para repetir.');
      return;
    }
  }

  const tags = tagsEl.value.split(',').map(t => t.trim()).filter(Boolean);

  let duration = durationEl.value === 'custom'
    ? parseInt(durationCustomEl.value, 10)
    : parseInt(durationEl.value, 10);
  if (!duration || duration < 5) duration = TIMELINE_EVENT_MINUTES;

  const taskData = {
    title,
    desc:    descEl.value.trim(),
    cat:     catEl.value,
    date:    dateEl.value,
    time:    timeEl.value, // Capturamos la hora directamente del input
    tags,
    prio:    selectedPrio,
    duration,
    updated: new Date().toISOString()
  };

  console.log("Guardando tarea:", taskData); // Debug log

  try {
    if (editingId) {
      const originalTask = tasks.find(t => t.id === editingId);
      const groupId = originalTask && originalTask.recurringGroupId;

      if (groupId) {
        const scope = await askRecurringScope();
        if (!scope) return; // cancelado: se deja el modal abierto, sin tocar nada

        showSyncIndicator('syncing');
        if (scope === 'future') {
          // Al aplicar a "esta y todas las futuras" no propagamos la fecha editada —
          // cada ocurrencia conserva su propio día, solo cambian título/hora/cat/etc.
          const { date: _ignoredDate, ...fieldsWithoutDate } = taskData;
          const toUpdate = tasks.filter(t => t.recurringGroupId === groupId && t.date >= originalTask.date);
          const batch = db.batch();
          toUpdate.forEach(t => batch.update(db.collection('tasks').doc(t.id), fieldsWithoutDate));
          await batch.commit();
        } else {
          await db.collection('tasks').doc(editingId).update(taskData);
        }
      } else {
        showSyncIndicator('syncing');
        await db.collection('tasks').doc(editingId).update(taskData);
      }
    } else {
      taskData.done = false;
      taskData.created = new Date().toISOString();
      showSyncIndicator('syncing');
      if (repeatType) {
        await createRecurringTaskSeries(taskData, repeatType, { until: repeatUntil, days: repeatDays });
      } else {
        await db.collection('tasks').add(taskData);
      }
    }
    showSyncIndicator('ok');
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
  const nota = notas.find(n => n.id === id);
  if (!nota) return;
  showSyncIndicator('syncing');
  await db.collection('notas').doc(id).delete();
  showSyncIndicator('ok');
  showUndoToast('Nota eliminada', async () => {
    showSyncIndicator('syncing');
    const { id: _drop, ...data } = nota;
    await db.collection('notas').doc(id).set(data);
    showSyncIndicator('ok');
  });
}

// ===== DRIVE =====
function renderDrives() {
  const grid = document.getElementById('drive-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (drives.length === 0) {
    grid.innerHTML = '<p class="empty-state">No hay drives guardados.</p>';
    return;
  }

  const sorted = [...drives].sort((a, b) => {
    const dateA = a.date || '9999-12-31';
    const dateB = b.date || '9999-12-31';
    return dateA.localeCompare(dateB);
  });

  sorted.forEach(d => {
    const card = document.createElement('div');
    const prioClass = d.prio ? `prio-${d.prio}` : 'prio-medio';
    card.className = `nota-card drive-card ${prioClass}`;

    let dateStr = 'Sin fecha';
    if (d.date) {
      const [y, m, day] = d.date.split('-');
      dateStr = `${day}/${m}/${y}`;
    }

    card.innerHTML = `
      <div class="nota-actions">
        <button class="nota-btn" onclick="editDrive('${d.id}')" title="Editar"><i data-lucide="edit-3" style="width:13px;height:13px;"></i></button>
        <button class="nota-btn del" onclick="deleteDrive('${d.id}')" title="Eliminar"><i data-lucide="x" style="width:13px;height:13px;"></i></button>
      </div>
      <div class="nota-text drive-name" onclick="openDrive('${d.id}')" title="Abrir enlace">
        <i data-lucide="hard-drive" style="width:14px;height:14px;vertical-align:middle;margin-right:6px;"></i>${d.name || '(sin nombre)'}
      </div>
      <div class="nota-meta">
        <span class="sema-dot-sm dot-${d.prio || 'medio'}"></span>
        <span>${dateStr}</span>
      </div>
    `;
    grid.appendChild(card);
  });
  refreshIcons();
}

function openDrive(id) {
  const d = drives.find(x => x.id === id);
  if (d && d.url) window.open(d.url, '_blank');
}

function selectDrivePrio(prio) {
  selectedDrivePrio = prio;
  document.querySelectorAll('[data-drive-prio]').forEach(b => b.classList.remove('active-sema'));
  document.querySelector(`[data-drive-prio="${prio}"]`).classList.add('active-sema');
}

async function addDrive() {
  const name = document.getElementById('drive-name').value.trim();
  let url = document.getElementById('drive-url').value.trim();
  const date = document.getElementById('drive-date').value;

  if (!name || !url) {
    alert("Completa el nombre y el enlace del Drive.");
    return;
  }
  if (!url.startsWith('http')) url = 'https://' + url;

  const editingId = document.getElementById('editing-drive-id').value;
  const driveData = {
    name,
    url,
    date,
    prio: selectedDrivePrio,
    updated: new Date().toISOString()
  };

  showSyncIndicator('syncing');

  try {
    if (editingId) {
      await db.collection('drives').doc(editingId).update(driveData);
    } else {
      driveData.created = new Date().toISOString();
      await db.collection('drives').add(driveData);
    }
    resetDriveForm();
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

function editDrive(id) {
  const d = drives.find(x => x.id === id);
  if (!d) return;

  document.getElementById('editing-drive-id').value = id;
  document.getElementById('drive-name').value = d.name || '';
  document.getElementById('drive-url').value = d.url || '';
  document.getElementById('drive-date').value = d.date || '';
  selectDrivePrio(d.prio || 'medio');

  document.getElementById('btn-save-drive').innerHTML = '<i data-lucide="check" style="width:15px;height:15px;"></i> Actualizar Drive';
  document.getElementById('btn-cancel-drive').style.display = 'block';
  document.getElementById('drive-name').focus();
  refreshIcons();
}

function resetDriveForm() {
  document.getElementById('editing-drive-id').value = '';
  document.getElementById('drive-name').value = '';
  document.getElementById('drive-url').value = '';
  document.getElementById('drive-date').value = '';
  selectDrivePrio('medio');
  document.getElementById('btn-save-drive').innerHTML = '<i data-lucide="save" style="width:15px;height:15px;"></i> Guardar Drive';
  document.getElementById('btn-cancel-drive').style.display = 'none';
  refreshIcons();
}

async function deleteDrive(id) {
  const drive = drives.find(d => d.id === id);
  if (!drive) return;
  showSyncIndicator('syncing');
  await db.collection('drives').doc(id).delete();
  showSyncIndicator('ok');
  showUndoToast('Drive eliminado', async () => {
    showSyncIndicator('syncing');
    const { id: _drop, ...data } = drive;
    await db.collection('drives').doc(id).set(data);
    showSyncIndicator('ok');
  });
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

// ===== EXPORTACIÓN A EXCEL (.xlsx) =====
function downloadXLS(filename, rows, sheetName) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Hoja1');
  XLSX.writeFile(wb, filename);
}

/** Descarga un respaldo completo de todos tus datos (tareas, dinero, notas, etc.) en un solo JSON */
async function exportFullBackup() {
  showSyncIndicator('syncing');
  try {
    const plannerDoc = await db.collection('planner').doc('current_week').get();

    const backup = {
      exportedAt: new Date().toISOString(),
      tasks,
      notas,
      drives,
      leads,
      accounts,
      transactions,
      recurringTransactions,
      budgets,
      icalEvents,
      planner: plannerDoc.exists ? plannerDoc.data() : null
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crmeli-respaldo-${toLocalDateStr(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

function exportCategoryXLS(cat) {
  const catLabels = { trabajo: 'Trabajo', casa: 'Casa', familia: 'Familia', pandin: 'Pandín', sara: 'Sara', personal: 'Personal' };
  const rows = [['Título', 'Descripción', 'Fecha', 'Hora', 'Prioridad', 'Etiquetas', 'Completada']];
  tasks.filter(t => t.cat === cat).forEach(t => {
    rows.push([t.title, t.desc || '', t.date || '', t.time || '', t.prio, (t.tags || []).join('; '), t.done ? 'Sí' : 'No']);
  });
  downloadXLS(`tareas-${catLabels[cat] || cat}.xlsx`, rows, 'Tareas');
}

// ===== SINCRONIZACIÓN CON ICAL =====
// Proxy CORS público gratuito: necesario porque los feeds de Apple/Google Calendar
// no permiten lectura directa desde el navegador (sin backend propio).
const ICS_CORS_PROXY = 'https://api.allorigins.win/raw?url=';

let icalFeedUrl = localStorage.getItem('icalFeedUrl') || '';
let icsUploadTimer = null;

// --- EXPORTAR: tareas de CRMeli -> feed .ics público en Firebase Storage ---
function escapeICSText(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatICSDate(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  if (timeStr) {
    const [h, mi] = timeStr.split(':');
    return `${y}${m}${d}T${h}${mi}00`;
  }
  return `${y}${m}${d}`;
}

function buildICSFromTasks() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CRMeli//Tareas//ES',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:CRMeli - Tareas'
  ];

  tasks.filter(t => t.date).forEach(t => {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + t.id + '@crmeli');
    lines.push('DTSTAMP:' + stamp);
    lines.push(t.time ? 'DTSTART:' + formatICSDate(t.date, t.time) : 'DTSTART;VALUE=DATE:' + formatICSDate(t.date));
    lines.push('SUMMARY:' + escapeICSText(t.title));
    if (t.desc) lines.push('DESCRIPTION:' + escapeICSText(t.desc));
    lines.push('STATUS:' + (t.done ? 'COMPLETED' : 'CONFIRMED'));
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

async function syncICSFeedToStorage() {
  try {
    const icsContent = buildICSFromTasks();
    const ref = storage.ref('public/tasks.ics');
    await ref.put(new Blob([icsContent], { type: 'text/calendar' }));
    icalFeedUrl = await ref.getDownloadURL();
    localStorage.setItem('icalFeedUrl', icalFeedUrl);
    updateICalFeedUI();
  } catch (err) {
    // No interrumpe la app: si Storage aún no tiene las reglas configuradas, solo se registra.
    console.warn('No se pudo actualizar el feed iCal (revisa las reglas de Storage):', err.message);
  }
}

function scheduleICSSync() {
  clearTimeout(icsUploadTimer);
  icsUploadTimer = setTimeout(syncICSFeedToStorage, 4000);
}

function updateICalFeedUI() {
  const el = document.getElementById('ical-feed-link');
  if (!el) return;
  el.style.display = (icalFeedUrl || localStorage.getItem('icalFeedUrl')) ? 'inline-flex' : 'none';
}

function copyICalFeedLink() {
  const url = icalFeedUrl || localStorage.getItem('icalFeedUrl');
  if (!url) {
    alert('Todavía no se generó tu enlace iCal. Espera unos segundos (o guarda una tarea) y vuelve a intentar.');
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      alert('Enlace copiado. Pégalo en Apple/Google Calendar como "calendario suscrito por URL".');
    }).catch(() => prompt('Copia este enlace y pégalo en tu app de calendario:', url));
  } else {
    prompt('Copia este enlace y pégalo en tu app de calendario:', url);
  }
}

// --- IMPORTAR: tu iCal externo -> eventos visibles en el Calendario ---
function configureICalSource() {
  const current = globalUrls.icalSourceUrl || localStorage.getItem('icalSourceUrl') || '';
  let newUrl = prompt('Pega tu URL secreta de iCal (en Google/Apple Calendar: Configuración > Compartir calendario > Dirección secreta en formato iCal):', current);
  if (newUrl === null) return;
  newUrl = newUrl.trim().replace(/^webcal:\/\//, 'https://');
  if (newUrl === '') {
    saveUrlConfig('icalSourceUrl', '');
    alert('Enlace de iCal eliminado.');
    return;
  }
  saveUrlConfig('icalSourceUrl', newUrl);
  syncICalNow();
}

function parseICSDateValue(value, isDateOnly) {
  const digits = value.replace('Z', '');
  const y = digits.slice(0, 4), mo = digits.slice(4, 6), d = digits.slice(6, 8);
  const date = `${y}-${mo}-${d}`;
  if (isDateOnly || digits.length <= 8) return { date, time: null };
  const h = digits.slice(9, 11), mi = digits.slice(11, 13);
  return { date, time: `${h}:${mi}` };
}

function parseICS(icsText) {
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r\n|\n/);
  const events = [];
  let current = null;

  lines.forEach(line => {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT') {
      if (current && current.date) events.push(current);
      current = null;
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const rawKey = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const key = rawKey.split(';')[0].toUpperCase();

      if (key === 'UID') {
        current.uid = value;
      } else if (key === 'SUMMARY') {
        current.title = value.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ').replace(/\\\\/g, '\\');
      } else if (key === 'DTSTART') {
        const isDateOnly = rawKey.toUpperCase().includes('VALUE=DATE') && !rawKey.toUpperCase().includes('VALUE=DATE-TIME');
        const parsed = parseICSDateValue(value, isDateOnly);
        current.date = parsed.date;
        current.time = parsed.time;
      }
    }
  });

  return events;
}

async function syncICalNow() {
  const url = globalUrls.icalSourceUrl || localStorage.getItem('icalSourceUrl');
  if (!url) {
    configureICalSource();
    return;
  }

  showSyncIndicator('syncing');
  try {
    const res = await fetch(ICS_CORS_PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error('No se pudo descargar tu calendario (código ' + res.status + ')');
    const text = await res.text();

    const parsedEvents = parseICS(text).map((e, i) => ({
      uid: e.uid || (e.date + '-' + i),
      title: e.title || '(Sin título)',
      date: e.date,
      time: e.time || null
    }));

    await db.collection('config').doc('icalEvents').set({
      events: parsedEvents,
      lastSynced: new Date().toISOString()
    });
    showSyncIndicator('ok');
  } catch (err) {
    console.error('Error al sincronizar iCal:', err);
    showSyncIndicator('error', 'iCal: ' + err.message + ' (el proxy gratuito puede fallar a veces, reintenta luego)');
  }
}

/** Sincroniza solo si nunca se hizo o si pasó más de 1 hora, para no saturar el proxy gratuito */
function maybeAutoSyncICal() {
  const url = globalUrls.icalSourceUrl || localStorage.getItem('icalSourceUrl');
  if (!url) return;
  const lastSynced = window.__icalLastSynced || 0;
  if (Date.now() - lastSynced < 60 * 60 * 1000) return;
  window.__icalLastSynced = Date.now();
  syncICalNow();
}

// ===== DINERO: CUENTAS, GASTOS E INGRESOS =====
const EXPENSE_CATEGORIES = ['Comida', 'Transporte', 'Vivienda', 'Salud', 'Ocio', 'Educación', 'Ropa', 'Otros'];
const INCOME_CATEGORIES = ['Sueldo', 'Freelance', 'Regalo', 'Reembolso', 'Otros'];
let selectedTxType = 'gasto';
let moneyFormInitialized = false;

const MONEY_CURRENCIES = {
  EUR: { locale: 'es-ES', label: '€ Euro' },
  USD: { locale: 'en-US', label: '$ Dólar estadounidense' },
  MXN: { locale: 'es-MX', label: '$ Peso mexicano' }
};

// Moneda "por defecto": solo precarga el selector de cada movimiento nuevo,
// cada transacción y cada cuenta guarda su propia moneda de forma independiente.
let defaultMoneyCurrency = globalUrls.moneyCurrency || localStorage.getItem('moneyCurrency') || 'EUR';

function formatMoney(amount, currency) {
  const cur = currency || 'EUR';
  const conf = MONEY_CURRENCIES[cur] || MONEY_CURRENCIES.EUR;
  return new Intl.NumberFormat(conf.locale, { style: 'currency', currency: cur }).format(amount || 0);
}

/** Ícono del menú lateral: € para Euro, $ para Dólar/Peso mexicano (según tu última moneda usada) */
function updateMoneyNavIcon() {
  const navBtn = document.querySelector('.nav-item[data-view="dinero"]');
  if (!navBtn) return;
  const iconName = defaultMoneyCurrency === 'EUR' ? 'euro' : 'dollar-sign';
  // Regeneramos el contenido: Lucide reemplaza el <i> original por un <svg>,
  // así que reusar el nodo existente deja de funcionar después del primer cambio.
  navBtn.innerHTML = `<i data-lucide="${iconName}" class="nav-icon"></i><span>Dinero</span>`;
  refreshIcons();
}

// --- Bloqueo con PIN para Dinero ---
let dineroPinHash = null;

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isDineroUnlocked() {
  return sessionStorage.getItem('dineroUnlocked') === '1';
}

function updateDineroPinButtonLabel() {
  const label = document.getElementById('dinero-pin-btn-label');
  if (label) label.textContent = dineroPinHash ? 'Cambiar/Quitar PIN' : 'Configurar PIN';
}

/** Muestra el overlay de bloqueo si hay PIN configurado y no se ha desbloqueado esta sesión. Devuelve true si está desbloqueado. */
function checkDineroLock() {
  const overlay = document.getElementById('dinero-lock-overlay');
  const wrap = document.getElementById('dinero-content-wrap');
  if (!overlay || !wrap) return true;

  if (!dineroPinHash || isDineroUnlocked()) {
    overlay.style.display = 'none';
    wrap.style.display = '';
    return true;
  }

  overlay.style.display = 'flex';
  wrap.style.display = 'none';
  const input = document.getElementById('dinero-pin-input');
  if (input) { input.value = ''; input.focus(); }
  return false;
}

async function submitDineroPIN() {
  const input = document.getElementById('dinero-pin-input');
  const errorEl = document.getElementById('dinero-pin-error');
  const entered = input.value.trim();
  if (!entered) return;

  const hash = await sha256Hex(entered);
  if (hash === dineroPinHash) {
    sessionStorage.setItem('dineroUnlocked', '1');
    errorEl.style.display = 'none';
    renderMoney();
  } else {
    errorEl.style.display = 'block';
    input.value = '';
    input.focus();
  }
}

async function configureDineroPIN() {
  const hasPin = !!dineroPinHash;
  const msg = hasPin
    ? 'Ya tienes un PIN configurado.\nEscribe uno nuevo para cambiarlo, o escribe "quitar" para eliminarlo:'
    : 'Crea un PIN numérico para proteger la sección Dinero (déjalo vacío para cancelar):';
  const entered = prompt(msg);
  if (entered === null || entered.trim() === '') return;

  if (hasPin && entered.trim().toLowerCase() === 'quitar') {
    showSyncIndicator('syncing');
    await db.collection('config').doc('security').set({ dineroPinHash: null }, { merge: true });
    sessionStorage.removeItem('dineroUnlocked');
    showSyncIndicator('ok');
    alert('PIN eliminado. Dinero ya no está protegido.');
    return;
  }

  const confirmEntered = prompt('Confirma tu PIN:');
  if (confirmEntered !== entered) {
    alert('Los PIN no coinciden. Inténtalo de nuevo.');
    return;
  }

  const hash = await sha256Hex(entered.trim());
  showSyncIndicator('syncing');
  await db.collection('config').doc('security').set({ dineroPinHash: hash }, { merge: true });
  sessionStorage.setItem('dineroUnlocked', '1');
  showSyncIndicator('ok');
  alert('PIN configurado correctamente.');
}

/** Balance de una cuenta desglosado por moneda: { EUR: 120.5, USD: 30 } */
function computeAccountBalancesByCurrency(accountId) {
  const balances = {};
  const account = accounts.find(a => a.id === accountId);
  if (account && account.initialBalance) {
    const cur = account.initialBalanceCurrency || 'EUR';
    balances[cur] = (balances[cur] || 0) + account.initialBalance;
  }
  transactions.forEach(t => {
    const cur = t.currency || 'EUR';
    if (t.type === 'transferencia') {
      if (t.fromAccountId === accountId) balances[cur] = (balances[cur] || 0) - t.amount;
      if (t.toAccountId === accountId) balances[cur] = (balances[cur] || 0) + t.amount;
    } else if (t.accountId === accountId) {
      const delta = t.type === 'ingreso' ? t.amount : -t.amount;
      balances[cur] = (balances[cur] || 0) + delta;
    }
  });
  return balances;
}

/** Suma de todas las cuentas, desglosada por moneda */
function computeTotalBalancesByCurrency() {
  const totals = {};
  accounts.forEach(a => {
    Object.entries(computeAccountBalancesByCurrency(a.id)).forEach(([cur, amt]) => {
      totals[cur] = (totals[cur] || 0) + amt;
    });
  });
  return totals;
}

function renderBalanceValues(balancesByCurrency, fallbackCurrency) {
  const entries = Object.entries(balancesByCurrency);
  if (entries.length === 0) {
    return `<span class="account-card-value">${formatMoney(0, fallbackCurrency)}</span>`;
  }
  return entries
    .map(([cur, amt]) => `<span class="account-card-value ${amt < 0 ? 'negative' : ''}">${formatMoney(amt, cur)}</span>`)
    .join('');
}

function renderMoney() {
  if (!document.getElementById('money-accounts-row')) return;
  if (!checkDineroLock()) return;
  const dateEl = document.getElementById('tx-date');
  if (dateEl && !dateEl.value) dateEl.value = toLocalDateStr(new Date());
  if (!moneyFormInitialized) {
    const currencyEl = document.getElementById('tx-currency');
    if (currencyEl) currencyEl.value = defaultMoneyCurrency;
    moneyFormInitialized = true;
  }
  renderAccountCards();
  populateAccountSelects();
  populateCategorySelect(selectedTxType);
  populateBudgetCategorySelect();
  if (!document.getElementById('rec-category').value) selectRecurringType(selectedRecType);
  renderMoneySummary();
  renderTransactionList();
  renderAccountManageList();
  renderBudgetList();
  renderRecurringList();
  refreshIcons();
}

function renderAccountCards() {
  const row = document.getElementById('money-accounts-row');
  if (!row) return;

  let html = `
    <div class="account-card account-card-total">
      <span class="account-card-label">Balance total</span>
      <div class="account-card-values">${renderBalanceValues(computeTotalBalancesByCurrency(), defaultMoneyCurrency)}</div>
    </div>
  `;

  accounts.forEach(a => {
    html += `
      <div class="account-card">
        <span class="account-card-label">${a.name}</span>
        <div class="account-card-values">${renderBalanceValues(computeAccountBalancesByCurrency(a.id), a.initialBalanceCurrency || 'EUR')}</div>
      </div>
    `;
  });

  if (accounts.length === 0) {
    html += '<p class="empty-state">Crea tu primera cuenta abajo para empezar a registrar movimientos.</p>';
  }

  row.innerHTML = html;
}

function getFilterMonth() {
  const input = document.getElementById('filter-tx-month');
  if (!input) return null;
  if (!input.value) {
    const now = new Date();
    input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return input.value;
}

/** Un grupo Ingresos/Gastos/Neto por cada moneda con movimientos ese mes */
function renderMoneySummary() {
  const row = document.getElementById('money-summary-row');
  if (!row) return;

  const month = getFilterMonth();
  const monthTx = transactions.filter(t => t.date && t.date.slice(0, 7) === month);

  const byCurrency = {};
  monthTx.forEach(t => {
    if (t.type === 'transferencia') return; // no es ingreso ni gasto real
    const cur = t.currency || 'EUR';
    if (!byCurrency[cur]) byCurrency[cur] = { ingresos: 0, gastos: 0 };
    if (t.type === 'ingreso') byCurrency[cur].ingresos += t.amount;
    else byCurrency[cur].gastos += t.amount;
  });

  const currencies = Object.keys(byCurrency);
  if (currencies.length === 0) {
    row.innerHTML = '<p class="empty-state">Sin movimientos este mes.</p>';
    return;
  }

  row.innerHTML = currencies.map(cur => {
    const { ingresos, gastos } = byCurrency[cur];
    const neto = ingresos - gastos;
    return `
      <div class="money-summary-group">
        <span class="money-summary-currency-label">${cur}</span>
        <div class="money-summary-cards">
          <div class="money-summary-card ingreso">
            <span class="money-summary-label">Ingresos del mes</span>
            <span class="money-summary-value">${formatMoney(ingresos, cur)}</span>
          </div>
          <div class="money-summary-card gasto">
            <span class="money-summary-label">Gastos del mes</span>
            <span class="money-summary-value">${formatMoney(gastos, cur)}</span>
          </div>
          <div class="money-summary-card ${neto >= 0 ? 'ingreso' : 'gasto'}">
            <span class="money-summary-label">Resultado neto</span>
            <span class="money-summary-value">${formatMoney(neto, cur)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function populateAccountSelects() {
  const options = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

  const txSel = document.getElementById('tx-account');
  if (txSel) {
    const prev = txSel.value;
    txSel.innerHTML = options || '<option value="">Crea una cuenta primero</option>';
    if (prev && accounts.some(a => a.id === prev)) txSel.value = prev;
  }

  const txToSel = document.getElementById('tx-account-to');
  if (txToSel) {
    const prev = txToSel.value;
    txToSel.innerHTML = options || '<option value="">Crea una cuenta primero</option>';
    if (prev && accounts.some(a => a.id === prev)) txToSel.value = prev;
  }

  const filterSel = document.getElementById('filter-tx-account');
  if (filterSel) {
    const prev = filterSel.value;
    filterSel.innerHTML = '<option value="all">Todas las cuentas</option>' + options;
    filterSel.value = prev || 'all';
  }

  const recSel = document.getElementById('rec-account');
  if (recSel) {
    const prev = recSel.value;
    recSel.innerHTML = options || '<option value="">Crea una cuenta primero</option>';
    if (prev && accounts.some(a => a.id === prev)) recSel.value = prev;
  }
}

function populateCategorySelect(type) {
  const sel = document.getElementById('tx-category');
  if (!sel) return;
  const prev = sel.value;
  const cats = type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  if (cats.includes(prev)) sel.value = prev;
}

function selectTransactionType(type) {
  selectedTxType = type;
  document.querySelectorAll('.money-type-btn[data-tx-type]').forEach(b => b.classList.remove('active-money-type'));
  const btn = document.querySelector(`.money-type-btn[data-tx-type="${type}"]`);
  if (btn) btn.classList.add('active-money-type');

  const catGroup = document.getElementById('tx-category-group');
  const toGroup = document.getElementById('tx-account-to-group');
  const accountLabel = document.getElementById('tx-account-label');
  if (type === 'transferencia') {
    catGroup.style.display = 'none';
    toGroup.style.display = '';
    accountLabel.textContent = 'Cuenta origen';
  } else {
    catGroup.style.display = '';
    toGroup.style.display = 'none';
    accountLabel.textContent = 'Cuenta';
    populateCategorySelect(type);
  }
}

function getAccountName(accountId) {
  const account = accounts.find(a => a.id === accountId);
  return account ? account.name : '(cuenta eliminada)';
}

async function saveTransaction() {
  const amountEl = document.getElementById('tx-amount');
  const currencyEl = document.getElementById('tx-currency');
  const categoryEl = document.getElementById('tx-category');
  const accountEl = document.getElementById('tx-account');
  const accountToEl = document.getElementById('tx-account-to');
  const dateEl = document.getElementById('tx-date');
  const noteEl = document.getElementById('tx-note');
  const editingId = document.getElementById('editing-transaction-id').value;

  const amount = parseFloat(amountEl.value);
  if (!amount || amount <= 0) { alert('Ingresa un monto válido.'); return; }
  if (!accountEl.value) { alert('Crea o selecciona una cuenta primero.'); return; }
  if (!dateEl.value) { alert('Selecciona una fecha.'); return; }

  let txData;
  if (selectedTxType === 'transferencia') {
    if (!accountToEl.value) { alert('Selecciona la cuenta destino.'); return; }
    if (accountToEl.value === accountEl.value) { alert('La cuenta de origen y destino no pueden ser la misma.'); return; }
    txData = {
      type: 'transferencia',
      amount,
      currency: currencyEl.value,
      category: 'Transferencia',
      fromAccountId: accountEl.value,
      toAccountId: accountToEl.value,
      date: dateEl.value,
      note: noteEl.value.trim(),
      updated: new Date().toISOString()
    };
  } else {
    txData = {
      type: selectedTxType,
      amount,
      currency: currencyEl.value,
      category: categoryEl.value,
      accountId: accountEl.value,
      date: dateEl.value,
      note: noteEl.value.trim(),
      updated: new Date().toISOString()
    };
  }

  showSyncIndicator('syncing');
  try {
    let txId = editingId;
    if (editingId) {
      await db.collection('transactions').doc(editingId).update(txData);
    } else {
      txData.created = new Date().toISOString();
      const ref = await db.collection('transactions').add(txData);
      txId = ref.id;
    }

    const receiptFile = document.getElementById('tx-receipt').files[0];
    if (receiptFile) {
      const storageRef = storage.ref(`receipts/${txId}_${Date.now()}`);
      await storageRef.put(receiptFile);
      const receiptUrl = await storageRef.getDownloadURL();
      await db.collection('transactions').doc(txId).update({ receiptUrl });
    }

    // Recordamos la última moneda usada para precargarla en el próximo movimiento
    defaultMoneyCurrency = txData.currency;
    localStorage.setItem('moneyCurrency', defaultMoneyCurrency);
    saveUrlConfig('moneyCurrency', defaultMoneyCurrency);
    updateMoneyNavIcon();
    resetTransactionForm();
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

function editTransaction(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  document.getElementById('editing-transaction-id').value = id;
  selectTransactionType(tx.type);
  document.getElementById('tx-amount').value = tx.amount;
  document.getElementById('tx-currency').value = tx.currency || 'EUR';
  if (tx.type === 'transferencia') {
    document.getElementById('tx-account').value = tx.fromAccountId;
    document.getElementById('tx-account-to').value = tx.toAccountId;
  } else {
    document.getElementById('tx-category').value = tx.category;
    document.getElementById('tx-account').value = tx.accountId;
  }
  document.getElementById('tx-date').value = tx.date;
  document.getElementById('tx-note').value = tx.note || '';
  document.getElementById('tx-receipt').value = '';

  const preview = document.getElementById('tx-receipt-preview');
  if (tx.receiptUrl) {
    preview.innerHTML = `<a href="${tx.receiptUrl}" target="_blank" rel="noopener"><img src="${tx.receiptUrl}" alt="Recibo"> Ver recibo actual</a>`;
    preview.style.display = 'flex';
  } else {
    preview.innerHTML = '';
    preview.style.display = 'none';
  }

  document.getElementById('btn-save-tx').innerHTML = '<i data-lucide="check" style="width:15px;height:15px;"></i> Actualizar movimiento';
  document.getElementById('btn-cancel-tx').style.display = 'block';
  refreshIcons();
  document.getElementById('tx-amount').focus();
}

function resetTransactionForm() {
  document.getElementById('editing-transaction-id').value = '';
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-currency').value = defaultMoneyCurrency;
  document.getElementById('tx-note').value = '';
  document.getElementById('tx-receipt').value = '';
  document.getElementById('tx-receipt-preview').style.display = 'none';
  document.getElementById('tx-receipt-preview').innerHTML = '';
  const now = new Date();
  document.getElementById('tx-date').value = toLocalDateStr(now);
  selectTransactionType('gasto');
  document.getElementById('btn-save-tx').innerHTML = '<i data-lucide="save" style="width:15px;height:15px;"></i> Guardar movimiento';
  document.getElementById('btn-cancel-tx').style.display = 'none';
  refreshIcons();
}

async function deleteTransaction(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  showSyncIndicator('syncing');
  await db.collection('transactions').doc(id).delete();
  showSyncIndicator('ok');
  showUndoToast('Movimiento eliminado', async () => {
    showSyncIndicator('syncing');
    const { id: _drop, ...data } = tx;
    await db.collection('transactions').doc(id).set(data);
    showSyncIndicator('ok');
  });
}

function renderTransactionList() {
  const list = document.getElementById('transaction-list');
  if (!list) return;

  const filterAccount = document.getElementById('filter-tx-account').value;
  const filterType = document.getElementById('filter-tx-type').value;
  const month = getFilterMonth();

  const filtered = transactions.filter(t => {
    if (filterAccount !== 'all') {
      const matchesAccount = t.type === 'transferencia'
        ? (t.fromAccountId === filterAccount || t.toAccountId === filterAccount)
        : t.accountId === filterAccount;
      if (!matchesAccount) return false;
    }
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (month && t.date && t.date.slice(0, 7) !== month) return false;
    return true;
  });

  renderMoneySummary();

  list.innerHTML = '';
  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty-state">No hay movimientos con estos filtros.</p>';
    return;
  }

  filtered.forEach(t => {
    const row = document.createElement('div');
    row.className = 'transaction-row';
    const dateStr = t.date ? t.date.split('-').reverse().join('/') : '';
    const isTransfer = t.type === 'transferencia';
    const sign = t.type === 'ingreso' ? '+' : t.type === 'gasto' ? '−' : '';
    const icon = isTransfer ? 'arrow-right-left' : (t.type === 'ingreso' ? 'arrow-up-circle' : 'arrow-down-circle');
    const categoryLabel = isTransfer ? 'Transferencia' : t.category;
    const metaLabel = isTransfer
      ? `${getAccountName(t.fromAccountId)} → ${getAccountName(t.toAccountId)} · ${dateStr}${t.note ? ' · ' + t.note : ''}`
      : `${getAccountName(t.accountId)} · ${dateStr}${t.note ? ' · ' + t.note : ''}`;

    row.innerHTML = `
      <div class="transaction-icon ${t.type}">
        <i data-lucide="${icon}" style="width:18px;height:18px;"></i>
      </div>
      <div class="transaction-info">
        <span class="transaction-category">${categoryLabel}</span>
        <span class="transaction-meta">${metaLabel}</span>
      </div>
      <span class="transaction-amount ${t.type}">${sign} ${formatMoney(t.amount, t.currency || 'EUR')}</span>
      <div class="task-actions">
        ${t.receiptUrl ? `<a class="task-btn" href="${t.receiptUrl}" target="_blank" rel="noopener" title="Ver recibo"><i data-lucide="image" style="width:16px;height:16px;color:var(--accent2);"></i></a>` : ''}
        <button class="task-btn" onclick="editTransaction('${t.id}')" title="Editar"><i data-lucide="edit-3" style="width:16px;height:16px;color:var(--accent);"></i></button>
        <button class="task-btn" onclick="deleteTransaction('${t.id}')" title="Eliminar"><i data-lucide="trash-2" style="width:16px;height:16px;color:#ff4d6d99;"></i></button>
      </div>
    `;
    list.appendChild(row);
  });
  refreshIcons();
}

function exportTransactionsXLS() {
  const filterAccount = document.getElementById('filter-tx-account').value;
  const filterType = document.getElementById('filter-tx-type').value;
  const month = getFilterMonth();

  const filtered = transactions.filter(t => {
    if (filterAccount !== 'all') {
      const matchesAccount = t.type === 'transferencia'
        ? (t.fromAccountId === filterAccount || t.toAccountId === filterAccount)
        : t.accountId === filterAccount;
      if (!matchesAccount) return false;
    }
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (month && t.date && t.date.slice(0, 7) !== month) return false;
    return true;
  });

  const typeLabels = { ingreso: 'Ingreso', gasto: 'Gasto', transferencia: 'Transferencia' };
  const rows = [['Fecha', 'Tipo', 'Categoría', 'Cuenta', 'Moneda', 'Monto', 'Nota']];
  filtered.forEach(t => {
    const cuenta = t.type === 'transferencia' ? `${getAccountName(t.fromAccountId)} → ${getAccountName(t.toAccountId)}` : getAccountName(t.accountId);
    rows.push([t.date, typeLabels[t.type] || t.type, t.category, cuenta, t.currency || 'EUR', t.amount.toFixed(2), t.note || '']);
  });
  downloadXLS(`movimientos-${month || 'todos'}.xlsx`, rows, 'Movimientos');
}

// --- Gestión de cuentas ---
async function addAccount() {
  const nameEl = document.getElementById('account-name');
  const balanceEl = document.getElementById('account-initial-balance');
  const currencyEl = document.getElementById('account-initial-currency');
  const name = nameEl.value.trim();
  if (!name) { alert('Ponle un nombre a la cuenta.'); return; }

  showSyncIndicator('syncing');
  try {
    await db.collection('accounts').add({
      name,
      initialBalance: parseFloat(balanceEl.value) || 0,
      initialBalanceCurrency: currencyEl.value,
      created: new Date().toISOString()
    });
    nameEl.value = '';
    balanceEl.value = '';
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

async function deleteAccount(id) {
  const account = accounts.find(a => a.id === id);
  if (!account) return;
  const relatedTx = transactions.filter(t => t.accountId === id);

  showSyncIndicator('syncing');
  const batch = db.batch();
  batch.delete(db.collection('accounts').doc(id));
  relatedTx.forEach(t => batch.delete(db.collection('transactions').doc(t.id)));
  try {
    await batch.commit();
    showSyncIndicator('ok');
    const msg = relatedTx.length > 0
      ? `Cuenta y ${relatedTx.length} movimiento(s) eliminados`
      : 'Cuenta eliminada';
    showUndoToast(msg, async () => {
      showSyncIndicator('syncing');
      const restoreBatch = db.batch();
      const { id: _drop, ...accData } = account;
      restoreBatch.set(db.collection('accounts').doc(id), accData);
      relatedTx.forEach(t => {
        const { id: txId, ...txData } = t;
        restoreBatch.set(db.collection('transactions').doc(txId), txData);
      });
      await restoreBatch.commit();
      showSyncIndicator('ok');
    });
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

function renderAccountManageList() {
  const list = document.getElementById('money-account-manage-list');
  if (!list) return;

  if (accounts.length === 0) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = accounts.map(a => `
    <div class="money-account-manage-row">
      <span>${a.name}</span>
      <span class="text-sub">Saldo inicial: ${formatMoney(a.initialBalance || 0, a.initialBalanceCurrency || 'EUR')}</span>
      <button class="task-btn" onclick="deleteAccount('${a.id}')" title="Eliminar cuenta"><i data-lucide="trash-2" style="width:15px;height:15px;color:#ff4d6d99;"></i></button>
    </div>
  `).join('');
  refreshIcons();
}

// --- Presupuestos por categoría ---
function populateBudgetCategorySelect() {
  const sel = document.getElementById('budget-category');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  if (EXPENSE_CATEGORIES.includes(prev)) sel.value = prev;
}

async function saveBudget() {
  const category = document.getElementById('budget-category').value;
  const limit = parseFloat(document.getElementById('budget-limit').value);
  const currency = document.getElementById('budget-currency').value;
  if (!limit || limit <= 0) { alert('Ingresa un límite válido.'); return; }

  const next = budgets.filter(b => b.category !== category);
  next.push({ category, limit, currency });

  showSyncIndicator('syncing');
  try {
    await db.collection('config').doc('budgets').set({ items: next });
    document.getElementById('budget-limit').value = '';
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

async function deleteBudget(category) {
  const next = budgets.filter(b => b.category !== category);
  showSyncIndicator('syncing');
  try {
    await db.collection('config').doc('budgets').set({ items: next });
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

function renderBudgetList() {
  const list = document.getElementById('budget-list');
  if (!list) return;

  if (budgets.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin presupuestos configurados.</p>';
    return;
  }

  const month = getFilterMonth();
  list.innerHTML = budgets.map(b => {
    const spent = transactions
      .filter(t => t.type === 'gasto' && t.category === b.category && (t.currency || 'EUR') === b.currency && t.date && t.date.slice(0, 7) === month)
      .reduce((s, t) => s + t.amount, 0);
    const pct = Math.min(100, (spent / b.limit) * 100);
    const over = spent > b.limit;
    return `
      <div class="meter-row budget-row">
        <span class="meter-label">${b.category}</span>
        <div class="meter-track"><div class="meter-fill ${over ? 'over' : pct >= 70 ? 'warn' : ''}" style="width:${pct}%;"></div></div>
        <span class="meter-value">${formatMoney(spent, b.currency)} / ${formatMoney(b.limit, b.currency)}</span>
        <button class="task-btn" onclick="deleteBudget('${b.category}')" title="Eliminar presupuesto"><i data-lucide="trash-2" style="width:14px;height:14px;color:#ff4d6d99;"></i></button>
      </div>
    `;
  }).join('');
  refreshIcons();
}

// --- Movimientos recurrentes ---
let selectedRecType = 'gasto';

function selectRecurringType(type) {
  selectedRecType = type;
  document.querySelectorAll('.money-type-btn[data-rec-type]').forEach(b => b.classList.remove('active-money-type'));
  const btn = document.querySelector(`.money-type-btn[data-rec-type="${type}"]`);
  if (btn) btn.classList.add('active-money-type');
  const sel = document.getElementById('rec-category');
  if (!sel) return;
  const prev = sel.value;
  const cats = type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  if (cats.includes(prev)) sel.value = prev;
}

async function saveRecurring() {
  const amount = parseFloat(document.getElementById('rec-amount').value);
  const currency = document.getElementById('rec-currency').value;
  const category = document.getElementById('rec-category').value;
  const accountId = document.getElementById('rec-account').value;
  const day = parseInt(document.getElementById('rec-day').value, 10);
  const note = document.getElementById('rec-note').value.trim();
  const editingId = document.getElementById('editing-recurring-id').value;

  if (!amount || amount <= 0) { alert('Ingresa un monto válido.'); return; }
  if (!accountId) { alert('Crea o selecciona una cuenta primero.'); return; }
  if (!day || day < 1 || day > 31) { alert('Ingresa un día del mes válido (1-31).'); return; }

  const data = { type: selectedRecType, amount, currency, category, accountId, dayOfMonth: day, note, active: true };

  showSyncIndicator('syncing');
  try {
    if (editingId) {
      await db.collection('recurringTransactions').doc(editingId).update(data);
    } else {
      data.created = new Date().toISOString();
      data.lastGeneratedMonth = null;
      await db.collection('recurringTransactions').add(data);
    }
    resetRecurringForm();
    showSyncIndicator('ok');
  } catch (err) {
    showSyncIndicator('error', err.message);
  }
}

function editRecurring(id) {
  const r = recurringTransactions.find(x => x.id === id);
  if (!r) return;
  document.getElementById('editing-recurring-id').value = id;
  selectRecurringType(r.type);
  document.getElementById('rec-amount').value = r.amount;
  document.getElementById('rec-currency').value = r.currency || 'EUR';
  document.getElementById('rec-category').value = r.category;
  document.getElementById('rec-account').value = r.accountId;
  document.getElementById('rec-day').value = r.dayOfMonth;
  document.getElementById('rec-note').value = r.note || '';
  document.getElementById('btn-save-rec').innerHTML = '<i data-lucide="check" style="width:15px;height:15px;"></i> Actualizar recurrente';
  document.getElementById('btn-cancel-rec').style.display = 'block';
  refreshIcons();
}

function resetRecurringForm() {
  document.getElementById('editing-recurring-id').value = '';
  document.getElementById('rec-amount').value = '';
  document.getElementById('rec-day').value = '';
  document.getElementById('rec-note').value = '';
  selectRecurringType('gasto');
  document.getElementById('btn-save-rec').innerHTML = '<i data-lucide="save" style="width:15px;height:15px;"></i> Guardar recurrente';
  document.getElementById('btn-cancel-rec').style.display = 'none';
  refreshIcons();
}

async function toggleRecurringActive(id, active) {
  showSyncIndicator('syncing');
  await db.collection('recurringTransactions').doc(id).update({ active });
  showSyncIndicator('ok');
}

async function deleteRecurring(id) {
  const r = recurringTransactions.find(x => x.id === id);
  if (!r) return;
  showSyncIndicator('syncing');
  await db.collection('recurringTransactions').doc(id).delete();
  showSyncIndicator('ok');
  showUndoToast('Recurrente eliminado', async () => {
    showSyncIndicator('syncing');
    const { id: _drop, ...data } = r;
    await db.collection('recurringTransactions').doc(id).set(data);
    showSyncIndicator('ok');
  });
}

function renderRecurringList() {
  const list = document.getElementById('recurring-list');
  if (!list) return;

  if (recurringTransactions.length === 0) {
    list.innerHTML = '<p class="empty-state">Sin movimientos recurrentes.</p>';
    return;
  }

  list.innerHTML = recurringTransactions.map(r => `
    <div class="transaction-row">
      <div class="transaction-icon ${r.type}">
        <i data-lucide="repeat" style="width:18px;height:18px;"></i>
      </div>
      <div class="transaction-info">
        <span class="transaction-category">${r.category}${r.note ? ' · ' + r.note : ''}</span>
        <span class="transaction-meta">${getAccountName(r.accountId)} · día ${r.dayOfMonth} de cada mes${r.active === false ? ' · pausado' : ''}</span>
      </div>
      <span class="transaction-amount ${r.type}">${formatMoney(r.amount, r.currency || 'EUR')}</span>
      <div class="task-actions">
        <button class="task-btn" onclick="toggleRecurringActive('${r.id}', ${r.active === false})" title="${r.active === false ? 'Reanudar' : 'Pausar'}">
          <i data-lucide="${r.active === false ? 'play' : 'pause'}" style="width:16px;height:16px;color:var(--accent);"></i>
        </button>
        <button class="task-btn" onclick="editRecurring('${r.id}')" title="Editar"><i data-lucide="edit-3" style="width:16px;height:16px;color:var(--accent);"></i></button>
        <button class="task-btn" onclick="deleteRecurring('${r.id}')" title="Eliminar"><i data-lucide="trash-2" style="width:16px;height:16px;color:#ff4d6d99;"></i></button>
      </div>
    </div>
  `).join('');
  refreshIcons();
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Genera automáticamente la transacción del mes para cada recurrente activo cuyo día ya llegó */
async function checkRecurringTransactions() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = now.getDate();

  for (const r of recurringTransactions) {
    if (r.active === false) continue;
    if (r.lastGeneratedMonth === currentMonth) continue;
    const targetDay = Math.min(r.dayOfMonth, daysInMonth(now));
    if (today < targetDay) continue;

    const dateStr = `${currentMonth}-${String(targetDay).padStart(2, '0')}`;
    try {
      await db.collection('transactions').add({
        type: r.type,
        amount: r.amount,
        currency: r.currency || 'EUR',
        category: r.category,
        accountId: r.accountId,
        date: dateStr,
        note: r.note ? `${r.note} (recurrente)` : '(recurrente)',
        recurringId: r.id,
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      });
      await db.collection('recurringTransactions').doc(r.id).update({ lastGeneratedMonth: currentMonth });
    } catch (err) {
      console.error('Error generando movimiento recurrente:', err);
    }
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

function openExcel(category) {
  const key = category + 'ExcelUrl';
  const url = globalUrls[key] || localStorage.getItem(key);
  if (url) {
    window.open(url, '_blank');
  } else {
    let newUrl = prompt("Por favor, pega aquí el enlace a tu Google Sheets o Excel Online:\n(Ej: https://docs.google.com/spreadsheets/...)");
    if (newUrl !== null && newUrl.trim() !== '') {
      newUrl = newUrl.trim();
      if (!newUrl.startsWith('http')) newUrl = 'https://' + newUrl;
      saveUrlConfig(key, newUrl);
      window.open(newUrl, '_blank');
    }
  }
}

function changeExcel(category) {
  const key = category + 'ExcelUrl';
  const currentUrl = globalUrls[key] || localStorage.getItem(key) || '';
  let newUrl = prompt("Actualiza el enlace a tu Google Sheets o Excel Online:", currentUrl);
  if (newUrl !== null) {
    newUrl = newUrl.trim();
    if (newUrl === '') {
      saveUrlConfig(key, '');
      alert("Enlace eliminado.");
    } else {
      if (!newUrl.startsWith('http')) newUrl = 'https://' + newUrl;
      saveUrlConfig(key, newUrl);
      alert("Enlace actualizado correctamente.");
    }
  }
}

function openWhatsApp() {
  const url = globalUrls.whatsappUrl || localStorage.getItem('whatsappUrl');
  if (url) {
    window.open(url, '_blank');
  } else {
    changeWhatsApp();
  }
}

function changeWhatsApp() {
  const currentUrl = globalUrls.whatsappUrl || localStorage.getItem('whatsappUrl') || '';
  let newUrl = prompt("Pega tu enlace de WhatsApp (Ej: https://wa.me/34600000000):", currentUrl);
  if (newUrl !== null) {
    newUrl = newUrl.trim();
    if (newUrl === '') {
      saveUrlConfig('whatsappUrl', '');
      alert("Enlace eliminado.");
    } else {
      if (!newUrl.startsWith('http')) newUrl = 'https://' + newUrl;
      saveUrlConfig('whatsappUrl', newUrl);
      alert("Enlace de WhatsApp actualizado.");
      window.open(newUrl, '_blank');
    }
  }
}

