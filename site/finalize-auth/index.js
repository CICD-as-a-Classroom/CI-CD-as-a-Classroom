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

    // Generate RSA key pair for securing workflow dispatch results (so that
    // only this browser session can view the produced user oauth access token)
    const keyPair = await generateRSAKeys();

    // Export public key to SPKI format, then convert to Base64
    const exportedPublic = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyBase64 =
        new Uint8Array(exportedPublic)
        .toBase64({ alphabet: 'base64url', omitPadding: true });
    // const pemPublic = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;

    // TODO dispatch CI/CD workflow to finalize auth flow and generate
    // encrypted access token
    const data = {
        'ref': 'main',
        'inputs': {
            'authCode': authCode,
            'pkceCodeVerifier': pkceCodeVerifier,
            'authTokenRSAEncryptionKey': publicKeyBase64
        }
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
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/gen-user-auth-token-github.yml/dispatches`,
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
    const responseData = response.json();
    console.log(responseData);
    const runURL = responseData['run_url'];

    // Wait three seconds, then poll workflow run every two seconds until done.    
    await sleep(3000);
    let runStatus = null;
    let runConclusion = null;
    do {
        const pollResponse = await fetch(
            runURL,
            {
                method: 'GET',
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
        
        const pollResponseData = pollResponse.json();
        
        runStatus = pollResponseData['status'];
        runConclusion = pollResponseData['conclusion'];

        if (runConclusion !== null) {
            break;
        }

        await sleep(2000);
    } while (runConclusion === null);

    console.log(`Final run status: ${runStatus}`);
    console.log(`Final run conclusion: ${runConclusion}`);

    // Decrypt access token
    const accessTokenBytes = window.crypto.subtle.decrypt(
        {name: 'RSA-OAEP'},
        keyPair.privateKey,
        encryptedAccessToken
    );
    const accessToken = new TextDecoder().decode(accessTokenBytes);
    
});
