function setCookie(name, value, path, maxAgeSeconds, sameSite, allowInsecure) {
    if (!path) {
        path = "/";
    }

    let cookieStr = encodeURIComponent(name) + "=" + encodeURIComponent(value) + `; path=${path}`;
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
    const authCode = urlParams.get("code");
    const echoedState = urlParams.get("state");

    const stateBase64 = getCookie("stateBase64");
    
    if (echoedState !== stateBase64) {
        console.log("Error. Echoed state does not match.");
        // TODO implement
        return;
    }

    const state = new TextDecoder().decode(
        Uint8Array.fromBase64(
            stateBase64,
            { alphabet: "base64url" }
        )
    );

    const pkceCodeVerifier = getCookie("pkceCodeVerifier");

    console.log("Here"); // TODO remove

    // Test to try to finalize auth. TODO remove
});
