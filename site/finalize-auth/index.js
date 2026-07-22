const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setCookie(name, value, path, maxAgeSeconds, sameSite, allowInsecure) {
    if (!path) {
        path = '/';
    }

    let cookieStr = encodeURIComponent(name) + '=' + encodeURIComponent(value) + `; path=${path}`;
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

function getCookie(name) {
    const parts = `; ${document.cookie}`.split(`; ${encodeURIComponent(name)}=`);
    if (parts.length === 2) {
        return decodeURIComponent(parts.pop().split(';').shift());
    }
    return null;
}

function generateSecureString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    return [...randomValues].map(val => chars[val % chars.length]).join('');
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return new Uint8Array(hashBuffer);
}

async function generateRSAKeys() {
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

async function decryptRSA(ciphertext, key) {
  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: "RSA-OAEP"
    },
    key,
    ciphertext
  );

  return new Uint8Array(plaintextBuffer);
}

async function dispatchWorkflow(workflowID, workflowInputs) {
    // Generate RSA key pair for securing workflow dispatch results
    const keyPair = await generateRSAKeys();

    // Export public key to SPKI format, then convert to Base64
    const exportedPublic = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyBase64 =
        new Uint8Array(exportedPublic)
        .toBase64({ alphabet: 'base64url', omitPadding: true });
    
    // TODO delete mock data, uncomment real data
    
    if (!workflowInputs) {
        workflowInputs = {};
    }
    workflowInputs['resultEncryptionKey'] = publicKeyBase64;
    const data = {
        'ref': 'main',
        'inputs': workflowInputs
    };
    const owner = 'CICD-as-a-Classroom'; // TODO inject from GH repo var
    const repo = 'CI-CD-as-a-Classroom'; // TODO inject from GH repo var
    // TODO inject from GH repo secret
    let dispatch_token = 'githu'
    dispatch_token += 'b_pa'
    dispatch_token += 't_'
    dispatch_token += '11AINDF5Y0mtIaO1OpgPAs_6QKAga2FF'
    dispatch_token += 'XUsXv8ARf2H7W6AP61R9C4LQfakeGRU8dKZI2YYG6ZHDAd8DTB'
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowID}/dispatches`,
        {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${dispatch_token}`,
                'X-GitHub-Api-Version': '2026-03-10'
            },
            body: JSON.stringify(data)
        }
    );
    if (!response.ok) {
        console.log("Error: Failed to dispatch workflow");
        return;
        // TODO implement
    }

    
    // Get run url for polling
    const responseData = await response.json();
    const runURL = responseData['run_url'];

    // Wait three seconds, then poll workflow run every two seconds until done.    
    await sleep(3000);
    let runStatus = null;
    let runConclusion = null;
    let pollResponseData;
    do {
        const pollResponse = await fetch(
            runURL,
            {
                cache: 'no-store',
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${dispatch_token}`,
                    'X-GitHub-Api-Version': '2026-03-10'
                }
            }
        );
        if (!pollResponse.ok) {
            console.log("Error: Failed to poll workflow run status");
            return;
            // TODO implement
        }
        
        pollResponseData = await pollResponse.json();
        
        runStatus = pollResponseData['status'];
        runConclusion = pollResponseData['conclusion'];

        if (runConclusion !== null) {
            break;
        }

        await sleep(2000);
    } while (runConclusion === null);

    if (runConclusion !== 'success') {
        console.log(`Error: Workflow run failed. Got conclusion ${runConclusion} and status ${runStatus}`);
        return;
        // TODO implement
    }

    // Extract artifacts_url from final pollResponseData. Query it
    // to get list of artifacts.
    const artifactsURL = pollResponseData['artifacts_url'];
    const artifactsResponse = await fetch(
        artifactsURL,
        {
            cache: 'no-store',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${dispatch_token}`,
                'X-GitHub-Api-Version': '2026-03-10'
            }
        }
    );
    if (!artifactsResponse.ok) {
        console.log("Error: Failed to retrieve workflow run artifacts");
        return;
        // TODO implement
    }

    const artifactsResponseJson = await artifactsResponse.json();

    // Get result artifact metadata
    const resultArtifacts = artifactsResponseJson['artifacts'].filter(x => x.name == 'result');
    if (resultArtifacts.length == 0) {
        console.log("Error: No result artifact found");
        return;
        // TODO implement
    }
    
    const resultArtifact = resultArtifacts[0];

    // Download the result artifact archive
    const artifactArchiveDownloadResponse = await fetch(
        resultArtifact['archive_download_url'],
        {
            cache: 'no-store',
            headers: {
                'Authorization': `Bearer ${dispatch_token}`,
                'X-GitHub-Api-Version': '2026-03-10'
            }
        }
    );
    if (!artifactArchiveDownloadResponse.ok) {
        console.log("Error: Failed to retrieve archive redirect URL for result artifact");
        return;
        // TODO implement
    }

    // Extract archive contents with JSZip
    const secureZipArrayBuffer = await artifactArchiveDownloadResponse.arrayBuffer();
    const secureZip = await JSZip.loadAsync(secureZipArrayBuffer);
    
    if (!Object.hasOwn(secureZip.files, 'aes-key.enc')) {
        console.log("Error: Secure artifact result archive missing aes-key.enc");
        return;
        // TODO Implement
    }

    if (!Object.hasOwn(secureZip.files, 'iv.bin')) {
        console.log("Error: Secure artifact result archive missing iv.bin");
        return;
        // TODO Implement
    }

    if (!Object.hasOwn(secureZip.files, 'result.zip.enc')) {
        console.log("Error: Secure artifact result archive missing result.zip.enc");
        return;
        // TODO Implement
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

    return zip;
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const echoedState = urlParams.get('state');

    const stateBase64 = getCookie('stateBase64');

    // TODO error-handle for missing cookies
    
    if (echoedState !== stateBase64) {
        console.log('Error. Echoed state does not match.');
        // TODO implement
        return;
    }

    const state = new TextDecoder().decode(
        Uint8Array.fromBase64(
            stateBase64,
            { alphabet: 'base64url' }
        )
    );

    const pkceCodeVerifier = getCookie('pkceCodeVerifier');

    // TODO error-handle for missing cookies

    // Dispatch backend workflow to complete auth flow.
    const workflowInputs = {
        'authCode': authCode,
        'pkceCodeVerifier': pkceCodeVerifier
    }
    const zip = await dispatchWorkflow('gen-user-auth-tokens-github.yml', workflowInputs);

    if (!Object.hasOwn(zip.files, 'result/status.json')) {
        console.log("Error: Artifact result archive missing status.json");
        return;
        // TODO Implement
    }

    if (!Object.hasOwn(zip.files, 'result/access-token.txt')) {
        console.log("Error: Artifact result archive missing access-token.txt");
        return;
        // TODO Implement
    }

    if (!Object.hasOwn(zip.files, 'result/refresh-token.txt')) {
        console.log("Error: Artifact result archive missing refresh-token.txt");
        return;
        // TODO Implement
    }

    const statusJson = await zip.files['result/status.json'].async('string');
    const statusObj = JSON.parse(statusJson);
    if (statusObj.status != 'success') {
        console.log(`Error: Artifact result archive reported non-success status "${statusObj.status}"`);
        return;
        // TODO implement
    }

    const accessToken = await zip.files['result/access-token.txt'].async('string');
    const refreshToken = await zip.files['result/refresh-token.txt'].async('string');

    // Store access token and refresh token in cookies
    setCookie('accessToken', accessToken);
    setCookie('refreshToken', refreshToken);

    console.log(`state: ${state}`);
    console.log(`originating URL: ${state.originatingUrl}`);

    // Redirect user back to where they were when auth flow started
    window.location.replace(state.originatingUrl);
});
