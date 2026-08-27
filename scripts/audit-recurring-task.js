/**
 * Auditoría de solo lectura: busca en Firestore las tareas cuyo título contenga
 * un texto dado (por defecto "orden del dia") para diagnosticar por qué una serie
 * repetitiva (recurringGroupId) no aparece como se esperaba.
 *
 * NO borra ni modifica nada. Solo lee y muestra los datos crudos de cada documento.
 *
 * Cómo correrlo:
 * 1. Abrí el CRM en el navegador y logueate normalmente (Google Sign-In).
 * 2. Abrí DevTools > Console (la app deja `db` inicializado como global).
 * 3. Pegá TODO este archivo y presioná Enter (define la función, no ejecuta nada).
 * 4. Corré:
 *      await auditRecurringTask('orden del dia')
 *    (o pasale otro texto para buscar otro título)
 *
 * Por qué así y no un script Node standalone: el proyecto no tiene credenciales
 * de firebase-admin y la auth es Google Sign-In restringido a un solo email
 * (ALLOWED_EMAIL en app-v2.js). Correr esto en la consola reutiliza la sesión
 * ya autenticada.
 */
async function auditRecurringTask(titleSubstring = 'orden del dia') {
  const needle = titleSubstring.toLowerCase();
  const snapshot = await db.collection('tasks').get();
  const matches = [];

  snapshot.forEach(doc => {
    const t = doc.data();
    if ((t.title || '').toLowerCase().includes(needle)) {
      matches.push({ id: doc.id, ...t });
    }
  });

  console.log(`\n=== ${matches.length} tarea(s) con título que incluye "${titleSubstring}" ===`);
  matches
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach(t => {
      console.log(
        `- id: ${t.id} | date: ${t.date ?? '(sin fecha)'} | time: ${t.time || '(sin hora)'} | cat: ${t.cat ?? '(sin cat)'} | ` +
        `done: ${!!t.done} | recurringGroupId: ${t.recurringGroupId ?? '(ninguno)'} | recurringType: ${t.recurringType ?? '(ninguno)'} | ` +
        `created: ${t.created ?? '(SIN CAMPO created — no aparecería en la app, ver nota abajo)'}`
      );
    });

  const groupIds = [...new Set(matches.map(t => t.recurringGroupId).filter(Boolean))];
  if (groupIds.length > 1) {
    console.log(`\n⚠️ Hay ${groupIds.length} recurringGroupId distintos — parecen series separadas, no una sola.`);
  } else if (groupIds.length === 1) {
    console.log(`\nTodas pertenecen a la misma serie (recurringGroupId: ${groupIds[0]}).`);
  } else if (matches.length > 0) {
    console.log(`\n⚠️ Ninguna tiene recurringGroupId — no se guardaron como serie repetitiva.`);
  }

  const missingCreated = matches.filter(t => !t.created);
  if (missingCreated.length > 0) {
    console.log(
      `\n⚠️ ${missingCreated.length} documento(s) sin campo "created": la app carga las tareas con ` +
      `orderBy('created', 'desc'), y Firestore excluye de ese orderBy los documentos que no tienen ` +
      `ese campo — por eso no aparecerían en la app aunque existan en la base.`
    );
  }

  if (matches.length === 0) {
    console.log('No se encontró ningún documento con ese título. Probá con otro texto, ej: await auditRecurringTask("pandin")');
  }

  return matches;
}
