/**
 * Auditoría de solo lectura: tareas "huérfanas" en Firestore con
 * cat === 'master' o cat === 'otra' (categorías eliminadas del CRM).
 *
 * NO borra ni modifica nada. Solo lee y cuenta.
 *
 * Cómo correrlo:
 * 1. Abrí el CRM en el navegador y logueate normalmente (Google Sign-In).
 * 2. Abrí DevTools > Console (la app ya deja `db` inicializado como global).
 * 3. Pegá TODO este archivo en la consola y presioná Enter.
 *
 * Por qué así y no un script Node standalone:
 * El proyecto no tiene credenciales de firebase-admin (service account) y
 * la autenticación de la app es exclusivamente Google Sign-In con popup
 * restringido a un solo email (ALLOWED_EMAIL en app-v2.js). Sin esas
 * credenciales, un script Node no puede pasar las reglas de seguridad de
 * Firestore. Correrlo en la consola del navegador reutiliza la sesión ya
 * autenticada, sin tocar configuración ni crear credenciales nuevas.
 */
(async function auditOrphanTasks() {
  const cats = ['master', 'otra'];
  let totalOrphans = 0;

  for (const cat of cats) {
    const snapshot = await db.collection('tasks').where('cat', '==', cat).get();
    console.log(`\n=== cat: '${cat}' — ${snapshot.size} tarea(s) ===`);
    totalOrphans += snapshot.size;

    snapshot.forEach(doc => {
      const t = doc.data();
      console.log(
        `- title: "${t.title ?? '(sin título)'}" | date: ${t.date ?? '(sin fecha)'} | prio: ${t.prio ?? '(sin prio)'} | done: ${!!t.done}`
      );
    });
  }

  console.log(`\nTOTAL huérfanas (master + otra): ${totalOrphans}`);
})();
