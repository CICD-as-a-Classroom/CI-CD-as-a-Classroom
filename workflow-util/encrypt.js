import { webcrypto } from 'crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

async function generateAESKey() {
  const key = await webcrypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );

  return key;
}

async function encryptAES(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    plaintext
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv: iv
  };
}

async function encryptRSA(plaintext, key) {
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "RSA-OAEP"
    },
    key,
    plaintext
  );

  return new Uint8Array(ciphertext);
}

const config = {
  options: {
    file: { type: 'string', short: 'f' },
    key: { type: 'string', short: 'k' }
  },
  strict: true
};


const { values, _ } = parseArgs(config);

if (!values.file ) {
  console.log('Missing file argument. Specify with -f <file>');
  process.exit(1);
}

if (!values.key ) {
  console.log('Missing key argument. Specify with -k <key>');
  process.exit(1);
}

// Generate AES key
const aesKey = await generateAESKey();

// Load file to encrypt
const fileBuffer = await readFile(values.file);

// Encrypt file data
const { ciphertext, iv } = await encryptAES(fileBuffer, aesKey);

// Encrypt AES key with specified RSA public key
const rsaPublicKeyBuffer = Buffer.from(values.key, 'base64');
const rsaPublicKey = await webcrypto.subtle.importKey(
  'spki',
  rsaPublicKeyBuffer,
  {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), // Equivalent to 65537
    hash: "SHA-256",
  },
  true,
  ['encrypt']
);
const aesKeyBuffer = new Uint8Array(await webcrypto.subtle.exportKey('raw', aesKey));
const encryptedAESKey = await encryptRSA(aesKeyBuffer, rsaPublicKey);

// Output encrypted key, iv, and encrypted file data to files
await writeFile('aes-key.enc', encryptedAESKey);
await writeFile('iv.bin', iv);
await writeFile(`${values.file}.enc`, ciphertext);
