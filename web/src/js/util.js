import { App } from 'octokit';
import JSZip from 'jszip';

import siteConfig from '@/config/conf.yaml'
import workflowDispatchAppPrivateKey from '@/config/secret-workflow-dispatch-app-private-key.pem'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function setCookie(name, value, path, maxAgeSeconds, sameSite, allowInsecure) {
    if (!path) {
        path = '/';
    }

    let cookieStr = encodeURIComponent(name) + '=';
    if (value !== null) {
        cookieStr += encodeURIComponent(value);
    }
    cookieStr += `; path=${path}`;
    if (maxAgeSeconds) {
        cookieStr += `; max-age=${maxAgeSeconds}`;
    }
    if (sameSite) {
        cookieStr += `; SameSite=${sameSite}`;
    }
    if (!allowInsecure) {
        cookieStr += `; Secure`;
    }
    document.cookie = cookieStr;
}

export function getCookie(name) {
    const parts = `; ${document.cookie}`.split(`; ${encodeURIComponent(name)}=`);
    if (parts.length === 2) {
        return decodeURIComponent(parts.pop().split(';').shift());
    }
    return null;
}

export function generateSecureString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    return [...randomValues].map(val => chars[val % chars.length]).join('');
}

export async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return new Uint8Array(hashBuffer);
}

export async function generateRSAKeys() {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]), // Equivalent to 65537
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );

    return keyPair
}

export async function decryptAES(ciphertext, key, iv) {
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

export async function decryptRSA(ciphertext, key) {
  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP"
    },
    key,
    ciphertext
  );

  return new Uint8Array(plaintextBuffer);
}

export async function getWorkflowDispatchAppInstallation() {
    const workflowDispatchApp = new App({
        appId: siteConfig.workflowDispatchAppId,
        privateKey: workflowDispatchAppPrivateKey,
    });

    return await workflowDispatchApp.getInstallationOctokit(siteConfig.workflowDispatchAppInstallationId);
}

export async function dispatchWorkflow(workflowDispatchAppInstallation, workflowID, workflowInputs, statusUpdateCallback, pollDelay) {
    if (!pollDelay) {
        pollDelay = 2000;
    }

    // Generate RSA key pair for securing workflow dispatch results
    const keyPair = await generateRSAKeys();

    // Export public key to SPKI format, then convert to Base64
    const exportedPublic = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyBase64url =
        new Uint8Array(exportedPublic)
        .toBase64({ alphabet: 'base64url', omitPadding: true });
    
    if (!workflowInputs) {
        workflowInputs = {};
    }
    workflowInputs['resultEncryptionKey'] = publicKeyBase64url;
    
    let response;
    try {
        response = await workflowDispatchAppInstallation.request(`POST /repos/${siteConfig.backendRepoOwner}/${siteConfig.backendRepo}/actions/workflows/${workflowID}/dispatches`, {
            ref: siteConfig.dispatchRef,
            inputs: workflowInputs,
            headers: {
                'X-GitHub-Api-Version': '2026-03-10'
            }
        });
    } catch (error) {
        console.log(error);
        if (statusUpdateCallback) {
            statusUpdateCallback({
                status: 'error',
                message: 'Failed to dispatch workflow'
            });
        }
        return;
    }

    if (statusUpdateCallback) {
        statusUpdateCallback({
            status: 'polling'
        });
    }
    
    // Get run url for polling
    const runId = response.data['workflow_run_id'];

    // Poll workflow run with delay between iterations until done.    
    let runStatus = null;
    let runConclusion = null;
    let pollResponse;
    do {
        await sleep(pollDelay);
        
        try {
            pollResponse = await workflowDispatchAppInstallation.request(`GET /repos/${siteConfig.backendRepoOwner}/${siteConfig.backendRepo}/actions/runs/${runId}`, {
                owner: siteConfig.backendRepoOwner,
                repo: siteConfig.backendRepo,
                run_id: runId,
                headers: {
                    'X-GitHub-Api-Version': '2026-03-10',
                    'If-None-Match': ''
                }
            })
        } catch (error) {
            if (statusUpdateCallback) {
                statusUpdateCallback({
                    status: 'error',
                    message: 'Failed to poll workflow run status'
                });
            }
            return;
        }
        
        runStatus = pollResponse.data['status'];
        runConclusion = pollResponse.data['conclusion'];
    } while (runConclusion === null);

    if (runConclusion !== 'success') {
        if (statusUpdateCallback) {
            statusUpdateCallback({
                status: 'error',
                message: `Workflow run failed. Got conclusion "${runConclusion}" and status "${runStatus}"`
            });
        }
        return;
    }
    
    if (statusUpdateCallback) {
        statusUpdateCallback({
            status: 'retrieving-results'
        });
    }

    // Retrieve metadata of all workflow run artifacts
    let artifactMetadataResponse;
    try {
        artifactMetadataResponse = await workflowDispatchAppInstallation.request(`GET /repos/${siteConfig.backendRepoOwner}/${siteConfig.backendRepo}/actions/runs/${runId}/artifacts`, {
            owner: siteConfig.backendRepoOwner,
            repo: siteConfig.backendRepo,
            run_id: runId,
            headers: {
                'X-GitHub-Api-Version': '2026-03-10',
                'If-None-Match': ''
            }
        });
    } catch (error) {
        if (statusUpdateCallback) {
            statusUpdateCallback({
                status: 'error',
                message: 'Failed to retrieve workflow run artifacts'
            });
        }
        return;
    }

    // Extract result artifact metadata
    const resultArtifactsMetadata = artifactMetadataResponse.data['artifacts'].filter(x => x.name == 'result');
    if (resultArtifactsMetadata.length == 0) {
        if (statusUpdateCallback) {
            statusUpdateCallback({
                status: 'error',
                message: 'No result artifact found'
            });
        }
        return;
    }
    
    // Download the result artifact archive
    let resultArtifactResponse;
    try {
        resultArtifactResponse = await workflowDispatchAppInstallation.rest.actions.downloadArtifact({
            owner: siteConfig.backendRepoOwner,
            repo: siteConfig.backendRepo,
            artifact_id: resultArtifactsMetadata[0].id,
            archive_format: 'zip',
        });
    } catch (error) {
        if (statusUpdateCallback) {
            statusUpdateCallback({
                status: 'error',
                message: 'Failed to retrieve archive for result artifact'
            });
        }
        return;
    }

    // Extract archive contents with JSZip
    const secureZip = await JSZip.loadAsync(resultArtifactResponse.data);
    
    if (!Object.hasOwn(secureZip.files, 'aes-key.enc')) {
        if (statusUpdateCallback) {
            statusUpdateCallback({
                status: 'error',
                message: 'Secure artifact result archive missing aes-key.enc'
            });
        }
        return;
    }

    if (!Object.hasOwn(secureZip.files, 'iv.bin')) {
        if (statusUpdateCallback) {
            statusUpdateCallback({
                status: 'error',
                message: 'Secure artifact result archive missing iv.bin'
            });
        }
        return;
    }

    if (!Object.hasOwn(secureZip.files, 'result.zip.enc')) {
        if (statusUpdateCallback) {
            statusUpdateCallback({
                status: 'error',
                message: 'Secure artifact result archive missing result.zip.enc'
            });
        }
        return;
    }

    // Decrypt contained AES key using RSA private key
    const encryptedAESKey = await secureZip.files['aes-key.enc'].async('uint8array');
    const aesKeyBuffer = await decryptRSA(encryptedAESKey, keyPair.privateKey);
    const aesKey = await window.crypto.subtle.importKey(
        'raw',
        aesKeyBuffer,
        {
            name: 'AES-GCM',
            length: 256,
        },
        true,
        ['encrypt', 'decrypt']
    );
    
    // Use AES key and iv to decrypt result zip
    const iv = await secureZip.files['iv.bin'].async('uint8array');

    const resultCiphertext = await secureZip.files['result.zip.enc'].async('uint8array');
    const resultPlaintext = await decryptAES(resultCiphertext, aesKey, iv);

    // Extract contents of result.zip using JSZip and return it
    const zip = await JSZip.loadAsync(resultPlaintext);

    if (statusUpdateCallback) {
        statusUpdateCallback({
            status: 'done'
        });
    }

    return zip;
}
