/**
 * Borrado de datos del módulo "Menú Semanal" (eliminado del CRM).
 *
 * El módulo de Menú Semanal (planner de comidas + lista de supermercado)
 * fue eliminado de index.html y app-v2.js: se gestionará desde Drive en
 * su lugar. Este script borra los documentos que le quedaron en Firestore:
 * menu/weekly (planner de comidas) y menu/grocery (lista de supermercado).
 *
 * NO usa firebase-admin: el proyecto no tiene credenciales de service
 * account, y la auth de la app es Google Sign-In restringido a un solo
 * email (ALLOWED_EMAIL en app-v2.js). Por eso este script se pega en la
 * consola del navegador, reutilizando la sesión ya autenticada (mismo
 * enfoque que scripts/migrate-webdev-marketing-to-trabajo.js).
 *
 * Cómo correrlo:
 * 1. Abrí el CRM en el navegador, logueate normalmente.
 * 2. Abrí DevTools > Console (la app deja `db` inicializado como global).
 * 3. Pegá TODO este archivo y presioná Enter (esto solo define funciones,
 *    no ejecuta nada todavía).
 * 4. Paso A — vista previa (solo lectura, no borra nada):
 *      await previewMenuDataToDelete()
 *    Imprime el contenido completo de menu/weekly y menu/grocery si existen.
 * 5. Paso B — borrado (solo tras revisar el paso A):
 *      await deleteMenuData()
 *    Borra ambos documentos y confirma por consola qué se borró.
 */

/** Solo lectura: muestra qué se va a borrar sin borrar nada. */
async function previewMenuDataToDelete() {
  const [weeklyDoc, groceryDoc] = await Promise.all([
    db.collection('menu').doc('weekly').get(),
    db.collection('menu').doc('grocery').get()
  ]);

  console.log('\n=== Vista previa: menu/weekly ===');
  if (weeklyDoc.exists) {
    console.log(JSON.stringify(weeklyDoc.data(), null, 2));
  } else {
    console.log('(no existe)');
  }

  console.log('\n=== Vista previa: menu/grocery ===');
  if (groceryDoc.exists) {
    console.log(JSON.stringify(groceryDoc.data(), null, 2));
  } else {
    console.log('(no existe)');
  }

  console.log('\nNada fue borrado. Para borrar, corré: await deleteMenuData()');
}

/** Borra menu/weekly y menu/grocery de Firestore. */
async function deleteMenuData() {
  const [weeklyDoc, groceryDoc] = await Promise.all([
    db.collection('menu').doc('weekly').get(),
    db.collection('menu').doc('grocery').get()
  ]);

  if (weeklyDoc.exists) {
    await db.collection('menu').doc('weekly').delete();
    console.log('✔ Borrado: menu/weekly');
  } else {
    console.log('- menu/weekly no existía, nada que borrar.');
  }

  if (groceryDoc.exists) {
    await db.collection('menu').doc('grocery').delete();
    console.log('✔ Borrado: menu/grocery');
  } else {
    console.log('- menu/grocery no existía, nada que borrar.');
  }

  console.log('\nBorrado completo.');
}
