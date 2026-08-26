/**
 * Migración de categorías: 'webdev' y 'marketing' -> 'trabajo'.
 *
 * Estas dos categorías se eliminaron del CRM (sustituidas por 'trabajo',
 * y complementadas por las nuevas 'casa' y 'familia'). Este script mueve
 * las tareas existentes que quedaron con cat 'webdev' o 'marketing' hacia
 * cat 'trabajo', para que no queden huérfanas.
 *
 * NO usa firebase-admin: el proyecto no tiene credenciales de service
 * account, y la auth de la app es Google Sign-In restringido a un solo
 * email (ALLOWED_EMAIL en app-v2.js). Por eso este script se pega en la
 * consola del navegador, reutilizando la sesión ya autenticada (mismo
 * enfoque que scripts/audit-orphan-tasks.js).
 *
 * Cómo correrlo:
 * 1. Abrí el CRM en el navegador, logueate normalmente.
 * 2. Abrí DevTools > Console (la app deja `db` inicializado como global).
 * 3. Pegá TODO este archivo y presioná Enter (esto solo define funciones,
 *    no ejecuta nada todavía).
 * 4. Paso A — auditoría (solo lectura):
 *      await auditWebdevMarketing()
 *    Revisá la lista impresa (id + title) y el conteo total.
 * 5. Paso B — migración (solo tras revisar el paso A):
 *      await migrateWebdevMarketingToTrabajo()
 *    Este paso vuelve a contar los documentos, aborta si el número no
 *    coincide con lo que vio auditWebdevMarketing(), aplica los cambios,
 *    y luego relee cada documento modificado para confirmar cat === 'trabajo'.
 */

let __migrationAuditCount = null;
let __migrationAuditIds = null;

async function auditWebdevMarketing() {
  const cats = ['webdev', 'marketing'];
  let total = 0;
  const ids = [];

  for (const cat of cats) {
    const snapshot = await db.collection('tasks').where('cat', '==', cat).get();
    console.log(`\n=== cat: '${cat}' — ${snapshot.size} tarea(s) ===`);
    total += snapshot.size;

    snapshot.forEach(doc => {
      const t = doc.data();
      ids.push(doc.id);
      console.log(`- id: ${doc.id} | title: "${t.title ?? '(sin título)'}"`);
    });
  }

  console.log(`\nTOTAL a migrar (webdev + marketing): ${total}`);
  __migrationAuditCount = total;
  __migrationAuditIds = ids;
  return { total, ids };
}

async function migrateWebdevMarketingToTrabajo() {
  if (__migrationAuditCount === null) {
    console.error('Corré primero: await auditWebdevMarketing()');
    return;
  }

  const cats = ['webdev', 'marketing'];
  const docsToMigrate = [];
  for (const cat of cats) {
    const snapshot = await db.collection('tasks').where('cat', '==', cat).get();
    snapshot.forEach(doc => docsToMigrate.push(doc));
  }

  if (docsToMigrate.length !== __migrationAuditCount) {
    console.error(
      `ABORTADO: la auditoría previa vio ${__migrationAuditCount} documento(s), ` +
      `pero ahora hay ${docsToMigrate.length}. Algo cambió entre medio ` +
      `(otra migración corrió, o se crearon/borraron tareas). Volvé a correr ` +
      `auditWebdevMarketing() y revisá antes de reintentar.`
    );
    return;
  }

  const currentIds = docsToMigrate.map(d => d.id).sort();
  const expectedIds = [...__migrationAuditIds].sort();
  const sameIds = currentIds.length === expectedIds.length &&
    currentIds.every((id, i) => id === expectedIds[i]);

  if (!sameIds) {
    console.error(
      'ABORTADO: el conteo coincide pero los IDs de los documentos difieren ' +
      'respecto a la auditoría previa. Volvé a correr auditWebdevMarketing() ' +
      'antes de reintentar.'
    );
    return;
  }

  if (docsToMigrate.length === 0) {
    console.log('No hay documentos que migrar. Nada que hacer.');
    return;
  }

  console.log(`Migrando ${docsToMigrate.length} documento(s) a cat: 'trabajo'...`);

  const migrated = [];
  const failed = [];

  for (const doc of docsToMigrate) {
    try {
      await doc.ref.update({ cat: 'trabajo' });
      migrated.push(doc.id);
    } catch (err) {
      console.error(`Error migrando ${doc.id}:`, err);
      failed.push({ id: doc.id, error: err.message });
    }
  }

  console.log('\nReleyendo documentos migrados para confirmar...');
  const confirmed = [];
  const notConfirmed = [];

  for (const id of migrated) {
    const freshDoc = await db.collection('tasks').doc(id).get();
    const data = freshDoc.data();
    if (data && data.cat === 'trabajo') {
      confirmed.push(id);
    } else {
      notConfirmed.push(id);
    }
  }

  console.log('\n===== RESUMEN MIGRACIÓN =====');
  console.log(`Documentos detectados en auditoría: ${__migrationAuditCount}`);
  console.log(`Migrados con éxito (write ok): ${migrated.length}`);
  console.log(`Confirmados tras releer (cat === 'trabajo'): ${confirmed.length}`);
  if (failed.length) {
    console.log(`Fallaron al escribir (${failed.length}):`, failed);
  }
  if (notConfirmed.length) {
    console.log(`Escribieron pero NO confirmaron al releer (${notConfirmed.length}):`, notConfirmed);
  }
  if (!failed.length && !notConfirmed.length) {
    console.log('Todo OK: todos los documentos fueron migrados y confirmados.');
  }
}
