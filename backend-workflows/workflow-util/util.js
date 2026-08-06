import { webcrypto } from 'crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { App } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';

export async function getStudentAssignmentWritingAppInstallation() {
    const studentAssignmentWritingApp = new App({
        appId: process.env.STUDENT_ASSIGNMENT_WRITING_APP_ID,
        privateKey: process.env.STUDENT_ASSIGNMENT_WRITING_APP_PRIVATE_KEY,
    });

    return await studentAssignmentWritingApp.getInstallationOctokit(Number(process.env.STUDENT_ASSIGNMENT_WRITING_APP_INSTALLATION_ID));
}

export async function getStudentAssignmentWritingAppInstallationAccessToken() {
    const auth = createAppAuth({
      appId: process.env.STUDENT_ASSIGNMENT_WRITING_APP_ID,
      privateKey: process.env.STUDENT_ASSIGNMENT_WRITING_APP_PRIVATE_KEY,
    });

    // Retrieve the raw installation access token
    const installationAuth = await auth({
      type: "installation",
      installationId: Number(process.env.STUDENT_ASSIGNMENT_WRITING_APP_INSTALLATION_ID),
    });

    return installationAuth.token;
}

export async function getAssignmentTemplateReadingAppInstallationAccessToken() {
    const auth = createAppAuth({
      appId: process.env.ASSIGNMENT_TEMPLATE_READING_APP_ID,
      privateKey: process.env.ASSIGNMENT_TEMPLATE_READING_APP_PRIVATE_KEY,
    });

    // Retrieve the raw installation access token
    const installationAuth = await auth({
      type: "installation",
      installationId: Number(process.env.ASSIGNMENT_TEMPLATE_READING_APP_INSTALLATION_ID),
    });

    return installationAuth.token;
}

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

export async function secureResults(contentDir, contents, contentsBaseFilename, rsaPublicKeyBase64) {
    // Generate AES key
    const aesKey = await generateAESKey();

    // Encrypt contents with AES key
    const { ciphertext, iv } = await encryptAES(contents, aesKey);

    // Encrypt AES key with specified RSA public key
    const rsaPublicKeyBuffer = Buffer.from(rsaPublicKeyBase64, 'base64');
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

    // Write aes key, iv, and ciphertext to files
    mkdir(contentDir, { recursive: true });
    await writeFile(join(contentDir, 'aes-key.enc'), encryptedAESKey);
    await writeFile(join(contentDir, 'iv.bin'), iv);
    await writeFile(join(contentDir, `${contentsBaseFilename}.enc`), ciphertext);
}
