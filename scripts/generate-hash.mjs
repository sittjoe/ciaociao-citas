/**
 * Genera un hash bcrypt para el password de administrador.
 *
 * Uso: node scripts/generate-hash.mjs "tu-nuevo-password"
 *
 * Luego configura el hash en Firebase Secret Manager:
 *   firebase functions:secrets:set ADMIN_PASSWORD_HASH
 *   (pega el hash cuando lo pida)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Uso: node scripts/generate-hash.mjs "tu-password"');
  process.exit(1);
}
if (password.length < 12) {
  console.error('El password debe tener al menos 12 caracteres.');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\n✅ Hash generado (copia todo el string):\n');
console.log(hash);
console.log('\nPasos siguientes:');
console.log('  1. firebase functions:secrets:set ADMIN_PASSWORD_HASH');
console.log('  2. Pega el hash cuando lo pida');
console.log('  3. firebase deploy --only functions');
console.log('  4. Prueba el login con tu nuevo password\n');
