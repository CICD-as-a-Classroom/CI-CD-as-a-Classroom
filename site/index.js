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
    refreshToken = getCookie("refreshToken");
    accessToken = getCookie("accessToken");

    if (refreshToken === null || accessToken === null) {
        // Not logged in. Redirect browser to GitHub App login.
        
        const authClientId = "Iv23liDO5DpoJm3700YN"; // TODO inject at build time from repo var

        const pkceCodeVerifier = generateSecureString(128);
        const pkceCodeChallenge =
            (await sha256(pkceCodeVerifier))
            .toBase64({ alphabet: "base64url", omitPadding: true });
        
        setCookie("pkceCodeVerifier", pkceCodeVerifier, "/", 3600);

        const randomStateToken = generateSecureString(32);
        const state = {
            randomToken: randomStateToken,
            originatingUrl: window.location.href
        };
        const stateBase64 =
            new TextEncoder.encode(JSON.stringify(state))
            .toBase64({ alphabet: "base64url", omitPadding: true });
        
        setCookie("stateBase64", stateBase64, "/", 3600);
        
        window.location.replace(`https://github.com/login/oauth/authorize?client_id=${authClientId}&state=${stateBase64}&code_challenge=${pkceCodeChallenge}&code_challenge_method=S256`)

        return;
    }
    
    // Logged in. Show accept-assignment-content

    const loadingContent = document.getElementById("loading-content");
    const acceptAssignmentContent = document.getElementById("accept-assignment-content");
    loadingContent.style.display = "none";
    acceptAssignmentContent.style.display = "block";
});
