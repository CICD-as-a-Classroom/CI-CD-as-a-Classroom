import { webcrypto } from 'crypto';
import { readFile } from 'node:fs/promises';

async function generateKey() {
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

// Generate AES key
const aesKey = await generateKey();

// Load file to encrypt
const filePath = 'test.txt';
const fileBuffer = await readFile(filePath);

// Encrypt file data
const { ciphertext, iv } = await encryptAES(fileBuffer, aesKey);

// Encrypt AES key and iv with specified RSA public key
const rsaPublicKeyBase64 = 'fdsafdsa';
const rsaPublicKeyBuffer = Uint8Array.fromBase64(rsaPublicKeyBase64);
const rsaPublicKey = await window.crypto.subtle.importKey(
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

const encryptedAESKey = encryptRSA(aesKeyBuffer, rsaPublicKey);
const encryptedIV = encryptRSA(iv, rsaPublicKey);

// Test decrypt
async function decryptAES(ciphertext, key, iv) {
  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    ciphertext
  );

  return new Uint8Array(plaintextBuffer);
}

const decryptedData = await decryptAES(ciphertext, aesKey, iv);
console.log(new TextDecoder('utf-8').decode(decryptedData));
