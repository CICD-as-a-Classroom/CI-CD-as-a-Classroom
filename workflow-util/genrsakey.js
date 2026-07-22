import { webcrypto } from 'crypto';

const keyPair = await webcrypto.subtle.generateKey(
    {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // Equivalent to 65537
        hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
);

const exportedPublic = await webcrypto.subtle.exportKey("spki", keyPair.publicKey);
const publicKeyBase64 =
    new Uint8Array(exportedPublic)
    .toBase64({ alphabet: 'base64', omitPadding: true });

console.log(publicKeyBase64);
