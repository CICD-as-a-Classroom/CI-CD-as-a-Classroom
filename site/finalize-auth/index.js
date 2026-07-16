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

    // Quick test to try to finalize auth. TODO remove, this should all be done
    // in CI-CD workflow / pipeline
    const url = 'https://github.com/login/oauth/access_token';
    const queryParams = {
        'client_id': 'Iv23liDO5DpoJm3700YN',
        'client_secret': '9a45677f6b40697254ed7c015df73ca5da8ba16e',
        'code': authCode,
        'code_verifier': pkceCodeVerifier
    };
    url.search = new URLSearchParams(queryParams).toString();
    const response = await fetch(
        url,
        {
            method: 'POST',
        }
    );
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
        return;
        // TODO implement
    }

    const data = await response.json();

    console.log(data); // TODO remove
});
