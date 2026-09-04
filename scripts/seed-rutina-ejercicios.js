/**
 * Carga el catálogo de ejercicios de "Planner Personal Agosto 2026" (rutina de
 * tren inferior, tren superior y core) en la sección Ejercicio > Mi rutina.
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
 * Series/reps corresponden a la Semana 1 (línea base): 2 vueltas · 12 reps
 * para los circuitos de tren inferior/superior, y las reps propias de cada
 * ejercicio de core. Esto sube con las semanas según la tabla de progresión
 * (ver el desplegable "Ver progresión semana a semana" en la app) — hay que
 * ajustar "sets"/"reps" a mano con el lápiz a medida que se avanza de bloque.
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

const RUTINA_SEED_EJERCICIOS = [
  // Tren inferior (lunes y viernes) — 2 vueltas · 12 reps · 90 seg
  { name: 'Sentadilla con mancuernas',           group: 'Tren inferior', sets: '2 vueltas', reps: '12' },
  { name: 'Sentadilla sumo',                     group: 'Tren inferior', sets: '2 vueltas', reps: '12' },
  { name: 'Puentes acostada',                    group: 'Tren inferior', sets: '2 vueltas', reps: '12' },
  { name: 'Patada de glúteo en banco',           group: 'Tren inferior', sets: '2 vueltas', reps: '12' },
  { name: 'Desplantes caminando con mancuernas', group: 'Tren inferior', sets: '2 vueltas', reps: '12' },
  { name: 'Abductores acostada',                 group: 'Tren inferior', sets: '2 vueltas', reps: '12' },
  { name: 'Pantorrilla en escalón',               group: 'Tren inferior', sets: '2 vueltas', reps: '12' },

  // Tren superior (miércoles) — 2 vueltas · 12 reps · 90 seg
  { name: 'Press de hombro con mancuernas',      group: 'Tren superior', sets: '2 vueltas', reps: '12' },
  { name: 'Curl con mancuernas',                 group: 'Tren superior', sets: '2 vueltas', reps: '12' },
  { name: 'Copa con mancuerna',                  group: 'Tren superior', sets: '2 vueltas', reps: '12' },
  { name: 'Remo simultáneo con mancuernas',      group: 'Tren superior', sets: '2 vueltas', reps: '12' },
  { name: 'Lagartijas con rodillas en el piso',  group: 'Tren superior', sets: '2 vueltas', reps: '12' },
  { name: 'Press francés con mancuernas',        group: 'Tren superior', sets: '2 vueltas', reps: '12' },

  // Core (martes y jueves) — 2 vueltas
  { name: 'Crunch acostada',                     group: 'Core', sets: '2 vueltas', reps: '15' },
  { name: 'Bicicletas acostada',                 group: 'Core', sets: '2 vueltas', reps: '20' },
  { name: 'Elevación con piernas flexionadas',   group: 'Core', sets: '2 vueltas', reps: '12' },
  { name: 'Plancha',                             group: 'Core', sets: '2 vueltas', reps: '20 seg' }
];

async function previewSeedRutinaEjercicios() {
  const doc = await db.collection('config').doc('rutina').get();
  const existing = doc.exists ? (doc.data().exercises || []) : [];
  const existingNames = new Set(existing.map(e => e.name));

  const toAdd = RUTINA_SEED_EJERCICIOS.filter(e => !existingNames.has(e.name));
  const skipped = RUTINA_SEED_EJERCICIOS.filter(e => existingNames.has(e.name));

  console.log(`Ejercicios ya en "Mi rutina": ${existing.length}`);
  console.log(`\nSe van a AGREGAR (${toAdd.length}):`);
  toAdd.forEach(e => console.log(`- [${e.group}] ${e.name} — ${e.sets} · ${e.reps}`));
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
    sets: e.sets,
    reps: e.reps,
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
  console.log('Recargá la sección Ejercicio en la app para verlos, y agregá los enlaces de YouTube con el lápiz de cada uno.');
}
