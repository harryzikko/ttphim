'use strict';
const crypto = require('crypto');

function generateKeys() {
  return {
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex')
  };
}

if (require.main === module) {
  const keys = generateKeys();
  console.log('# Generated Cryptographically Secure Production Keys:');
  console.log(`JWT_SECRET=${keys.JWT_SECRET}`);
  console.log(`MFA_ENCRYPTION_KEY=${keys.MFA_ENCRYPTION_KEY}`);
  console.log(`BACKUP_ENCRYPTION_KEY=${keys.BACKUP_ENCRYPTION_KEY}`);
}

module.exports = { generateKeys };
