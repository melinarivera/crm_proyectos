/**
 * Carga el catálogo de ejercicios de "Planner Personal Agosto 2026" (rutina de
 * tren inferior, tren superior y core) en la sección Ejercicio > Mi rutina,
 * ya agrupados por día y en el orden en que se realizan (A, B, C... de cada
 * circuito), tal como quedó organizada la sección en la app.
 *
 * NO usa firebase-admin: el proyecto no tiene credenciales de service
 * account, y la auth de la app es Google Sign-In restringido a un solo
 * email (ALLOWED_EMAIL en app-v2.js). Por eso este script se pega en la
 * consola del navegador, reutilizando la sesión ya autenticada (mismo
 * enfoque que scripts/migrate-webdev-marketing-to-trabajo.js).
 *
 * Los enlaces de YouTube quedan vacíos a propósito — se agregan después
 * desde la app (lápiz de "Editar" en cada ejercicio), no acá.
 *
 * Series/reps/descanso corresponden a la Semana 1 (línea base): 2 vueltas ·
 * 12 reps · 90 seg de descanso para los circuitos de tren inferior/superior,
 * y las reps propias de cada ejercicio de core (la plancha es por tiempo, no
 * reps, así que queda en modo "personalizado"). Esto sube con las semanas
 * según la tabla de progresión (desplegable "Ver progresión semana a semana"
 * en la app) — hay que ajustar series/reps/descanso a mano con el lápiz a
 * medida que se avanza de bloque.
 *
 * Días: Lunes/Viernes = tren inferior, Miércoles = tren superior,
 * Martes/Jueves = core (mismo calendario semanal de la tabla "Estructura de
 * la semana" del PDF).
 *
 * Cómo correrlo:
 * 1. Abrí el CRM en el navegador, logueate normalmente.
 * 2. Abrí DevTools > Console (la app deja `db` inicializado como global).
 * 3. Pegá TODO este archivo y presioná Enter (esto solo define funciones,
 *    no ejecuta nada todavía).
 * 4. Paso A — vista previa (solo lectura, no escribe nada):
 *      await previewSeedRutinaEjercicios()
 *    Revisá qué ejercicios ya existen (se van a saltear) y cuáles se van
 *    a agregar.
 * 5. Paso B — carga (solo tras revisar el paso A):
 *      await seedRutinaEjercicios()
 *    Es seguro correrlo más de una vez: salta cualquier ejercicio cuyo
 *    nombre ya esté en la lista, así no duplica nada.
 */

const RUTINA_DIA_LUN = 1, RUTINA_DIA_MAR = 2, RUTINA_DIA_MIE = 3, RUTINA_DIA_JUE = 4, RUTINA_DIA_VIE = 5;

const RUTINA_SEED_EJERCICIOS = [
  // Tren inferior (lunes y viernes) — 2 vueltas · 12 reps · 90 seg
  { name: 'Sentadilla con mancuernas',           group: 'Tren inferior', days: [RUTINA_DIA_LUN, RUTINA_DIA_VIE], order: 1, sets: '2', reps: '12', descanso: '90' },
  { name: 'Sentadilla sumo',                     group: 'Tren inferior', days: [RUTINA_DIA_LUN, RUTINA_DIA_VIE], order: 2, sets: '2', reps: '12', descanso: '90' },
  { name: 'Puentes acostada',                    group: 'Tren inferior', days: [RUTINA_DIA_LUN, RUTINA_DIA_VIE], order: 3, sets: '2', reps: '12', descanso: '90' },
  { name: 'Patada de glúteo en banco',           group: 'Tren inferior', days: [RUTINA_DIA_LUN, RUTINA_DIA_VIE], order: 4, sets: '2', reps: '12', descanso: '90' },
  { name: 'Desplantes caminando con mancuernas', group: 'Tren inferior', days: [RUTINA_DIA_LUN, RUTINA_DIA_VIE], order: 5, sets: '2', reps: '12', descanso: '90' },
  { name: 'Abductores acostada',                 group: 'Tren inferior', days: [RUTINA_DIA_LUN, RUTINA_DIA_VIE], order: 6, sets: '2', reps: '12', descanso: '90' },
  { name: 'Pantorrilla en escalón',               group: 'Tren inferior', days: [RUTINA_DIA_LUN, RUTINA_DIA_VIE], order: 7, sets: '2', reps: '12', descanso: '90' },

  // Tren superior (miércoles) — 2 vueltas · 12 reps · 90 seg
  { name: 'Press de hombro con mancuernas',      group: 'Tren superior', days: [RUTINA_DIA_MIE], order: 1, sets: '2', reps: '12', descanso: '90' },
  { name: 'Curl con mancuernas',                 group: 'Tren superior', days: [RUTINA_DIA_MIE], order: 2, sets: '2', reps: '12', descanso: '90' },
  { name: 'Copa con mancuerna',                  group: 'Tren superior', days: [RUTINA_DIA_MIE], order: 3, sets: '2', reps: '12', descanso: '90' },
  { name: 'Remo simultáneo con mancuernas',      group: 'Tren superior', days: [RUTINA_DIA_MIE], order: 4, sets: '2', reps: '12', descanso: '90' },
  { name: 'Lagartijas con rodillas en el piso',  group: 'Tren superior', days: [RUTINA_DIA_MIE], order: 5, sets: '2', reps: '12', descanso: '90' },
  { name: 'Press francés con mancuernas',        group: 'Tren superior', days: [RUTINA_DIA_MIE], order: 6, sets: '2', reps: '12', descanso: '90' },

  // Core (martes y jueves) — 2 vueltas
  { name: 'Crunch acostada',                     group: 'Core', days: [RUTINA_DIA_MAR, RUTINA_DIA_JUE], order: 1, sets: '2', reps: '15',     descanso: '90' },
  { name: 'Bicicletas acostada',                 group: 'Core', days: [RUTINA_DIA_MAR, RUTINA_DIA_JUE], order: 2, sets: '2', reps: '20',     descanso: '90' },
  { name: 'Elevación con piernas flexionadas',   group: 'Core', days: [RUTINA_DIA_MAR, RUTINA_DIA_JUE], order: 3, sets: '2', reps: '12',     descanso: '90' },
  { name: 'Plancha',                             group: 'Core', days: [RUTINA_DIA_MAR, RUTINA_DIA_JUE], order: 4, sets: '2', reps: '20 seg', descanso: '90' }
];

async function previewSeedRutinaEjercicios() {
  const doc = await db.collection('config').doc('rutina').get();
  const existing = doc.exists ? (doc.data().exercises || []) : [];
  const existingNames = new Set(existing.map(e => e.name));

  const toAdd = RUTINA_SEED_EJERCICIOS.filter(e => !existingNames.has(e.name));
  const skipped = RUTINA_SEED_EJERCICIOS.filter(e => existingNames.has(e.name));

  console.log(`Ejercicios ya en "Mi rutina": ${existing.length}`);
  console.log(`\nSe van a AGREGAR (${toAdd.length}):`);
  toAdd.forEach(e => console.log(`- [${e.group}] ${e.name} — orden ${e.order} · ${e.sets} series · ${e.reps} reps · ${e.descanso}s descanso`));
  if (skipped.length) {
    console.log(`\nYa existen, se van a SALTEAR (${skipped.length}):`);
    skipped.forEach(e => console.log(`- ${e.name}`));
  }
  return { toAdd, skipped, existingCount: existing.length };
}

async function seedRutinaEjercicios() {
  const doc = await db.collection('config').doc('rutina').get();
  const current = doc.exists ? doc.data() : { exercises: [] };
  const existing = current.exercises || [];
  const existingNames = new Set(existing.map(e => e.name));

  const toAdd = RUTINA_SEED_EJERCICIOS.filter(e => !existingNames.has(e.name)).map(e => ({
    id: 'ex-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    name: e.name,
    group: e.group,
    days: e.days,
    order: e.order,
    sets: e.sets,
    reps: e.reps,
    descanso: e.descanso,
    youtube: '',
    completedDates: []
  }));

  if (toAdd.length === 0) {
    console.log('Nada que agregar: todos los ejercicios ya están cargados.');
    return;
  }

  const next = { ...current, exercises: [...existing, ...toAdd] };
  await db.collection('config').doc('rutina').set(next);

  console.log(`Agregados ${toAdd.length} ejercicio(s). Total ahora: ${next.exercises.length}.`);
  console.log('Recargá la sección Ejercicio en la app para verlos, agrupados por día. Agregá los enlaces de YouTube con el lápiz de cada uno.');
}
