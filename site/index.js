const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setCookie(name, value, path, maxAgeSeconds, sameSite, allowInsecure) {
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

function getCookie(name) {
    const parts = `; ${document.cookie}`.split(`; ${encodeURIComponent(name)}=`);
    if (parts.length === 2) {
        return decodeURIComponent(parts.pop().split(';').shift());
    }
    return null;
}

function deleteCookie(name, path, sameSite, allowInsecure) {
    setCookie(name, null, path, 0, sameSite, allowInsecure);
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
    const publicKeyBase64url =
        new Uint8Array(exportedPublic)
        .toBase64({ alphabet: 'base64url', omitPadding: true });
    
    // TODO delete mock data, uncomment real data
    
    if (!workflowInputs) {
        workflowInputs = {};
    }
    workflowInputs['resultEncryptionKey'] = publicKeyBase64url;
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
        console.log(response.status);
        const responseData = await response.json();
        console.log(responseData);
        return;
        // TODO implement
    }

    
    // Get run url for polling
    const responseData = await response.json();
    const runURL = responseData['run_url'];

    // Wait 0.5 seconds, then poll workflow run every two seconds until done.    
    await sleep(500);
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
    const assignmentName = urlParams.get('assignment-name');
    const assignmentAcceptKey = urlParams.get('assignment-accept-key');
    
    refreshToken = getCookie('refreshToken');
    accessToken = getCookie('accessToken');

    if (accessToken == "") {
        accessToken = null;
    }
    if (refreshToken == "") {
        refreshToken = null;
    }

    // TODO Check if access token is expired. If so, check if refresh
    // token is expired. If so, delete both auth token cookies and start auth
    // flow below. If refresh token is
    // still fresh, use it to generate new access token instead of rerunning
    // entire auth flow.

    // Auth flow
    if (refreshToken === null || accessToken === null) {
        // Not logged in. Redirect browser to GitHub App login.
        
        const authClientId = 'Iv23liDO5DpoJm3700YN'; // TODO inject at build time from repo var

        const pkceCodeVerifier = generateSecureString(128);
        const pkceCodeChallenge =
            (await sha256(pkceCodeVerifier))
            .toBase64({ alphabet: 'base64url', omitPadding: true });
        
        setCookie('pkceCodeVerifier', pkceCodeVerifier, '/', 3600);

        const randomStateToken = generateSecureString(32);
        const state = {
            randomToken: randomStateToken,
            originatingUrl: window.location.href
        };
        const stateBase64url =
            new TextEncoder().encode(JSON.stringify(state))
            .toBase64({ alphabet: 'base64url', omitPadding: true });
        
        setCookie('stateBase64url', stateBase64url, '/', 3600);
        
        window.location.replace(`https://github.com/login/oauth/authorize?client_id=${authClientId}&state=${stateBase64url}&code_challenge=${pkceCodeChallenge}&code_challenge_method=S256`)

        return;
    }
    
    // Logged in. Show accept-assignment-content

    const loadingContent = document.getElementById('loading-content');
    const acceptAssignmentContent = document.getElementById('accept-assignment-content');
    loadingContent.style.display = 'none';
    acceptAssignmentContent.style.display = 'block';

    // TODO Check to see if user's repository exists and user has write access.
    // Use GitHub rest API repository endpoint. If it exists and user has write
    // access, either redirect them to the repo page or present a link to the
    // repo page.

    // TODO Otherwise, dispatch backend workflow to accept assignment.

    let workflowInputs = {
        'userAccessToken': accessToken,
        'assignmentName': assignmentName
    }
    if (assignmentAcceptKey !== null) {
        workflowInputs['assignmentAcceptKey'] = assignmentAcceptKey;
    }
    const zip = await dispatchWorkflow('accept-assignment.yml', workflowInputs);

    if (!Object.hasOwn(zip.files, 'result/status.json')) {
        console.log("Error: Artifact result archive missing status.json");
        return;
        // TODO Implement
    }

    if (!Object.hasOwn(zip.files, 'result/data.json')) {
        console.log("Error: Artifact result archive missing data.json");
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

    const responseDataJson = await zip.files['result/data.json'].async('string');
    const responseData = JSON.parse(responseDataJson);

    // Perhaps we should present a link to the repo page and let the user
    // navigate to it themselves
    window.location.replace(responseData.repositoryURL);
});
