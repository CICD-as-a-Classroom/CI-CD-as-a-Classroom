import JSZip from 'jszip';

import * as util from '@/js/util.js'
import siteConfig from '@/config/conf.yaml'

function stepProgress() {
    const progressBar = document.getElementById('progress-bar');
    const loadingStatusTextContainer = document.getElementById('loading-status-text-container');
    const visibleStatusText = loadingStatusTextContainer.querySelector('.status-text-visible');
    const nextStatusText = visibleStatusText.nextElementSibling;
    const nextProgressChunk = progressBar.querySelector(':not(.progress-chunk-visible)');

    if (nextStatusText !== null) {
        visibleStatusText.classList.remove('status-text-visible');
        nextStatusText.classList.add('status-text-visible');
    }
    if (nextProgressChunk !== null) {
        nextProgressChunk.classList.add('progress-chunk-visible');
    }
}

function showError(message) {
    const loadingContentContainer = document.getElementById('loading-content-container');
    const errorContentContainer = document.getElementById('error-content-container');
    const errorStatusText = document.getElementById('error-status-text');
    
    errorStatusText.textContent = `Error: ${message}`;
    
    loadingContentContainer.style.display = 'none';
    errorContentContainer.style.display = 'block';
}

function updateWorkflowStatus(statusUpdate) {
    if (statusUpdate.status == 'error') {
        showError(statusUpdate.message);
    } else {
        stepProgress()
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const echoedState = urlParams.get('state');
    const pkceCodeVerifier = util.getCookie('pkceCodeVerifier');
    const stateBase64url = util.getCookie('stateBase64url');

    if (authCode === null) {
        showError('Missing authentication code URL parameter. Authentication failed. Please try again.');
        return;
    }

    if (echoedState === null) {
        showError('Missing state URL parameter. Authentication failed. Please try again.');
        return;
    }

    if (pkceCodeVerifier === null) {
        showError('Missing PKCE code verifier cookie. Authentication failed. Please try again.');
        return;
    }

    if (stateBase64url === null) {
        showError('Missing state cookie. Authentication failed. Please try again.');
        return;
    }
    
    if (echoedState !== stateBase64url) {
        showError('State echoed from auth platform does not match state cookie. Please try again.');
        return;
    }

    // Dispatch backend workflow to complete auth flow.
    const workflowDispatchAppInstallation = await util.getWorkflowDispatchAppInstallation();

    const workflowInputs = {
        'authCode': authCode,
        'pkceCodeVerifier': pkceCodeVerifier
    }
    const zip = await util.dispatchWorkflow(workflowDispatchAppInstallation, 'gen-user-auth-tokens-github.yml', workflowInputs, updateWorkflowStatus, siteConfig.pollDelay);

    if (zip === null) {
        // Workflow failed. Error message should already be displayed via
        // dispatchWorkflow's statusUpdateCallback functional parameter
        return;
    }

    if (!Object.hasOwn(zip.files, 'result/status.json')) {
        showError("Artifact result archive missing status.json.");
        return;
    }

    const statusJson = await zip.files['result/status.json'].async('string');
    const statusObj = JSON.parse(statusJson);
    if (statusObj.status != 'success') {
        showError(`Artifact result archive reported non-success status "${statusObj.status}"`);
        return;
    }

    if (!Object.hasOwn(zip.files, 'result/data.json')) {
        showError('Artifact result archive missing data.json');
        return;
    }

    const responseDataJson = await zip.files['result/data.json'].async('string');
    const responseData = JSON.parse(responseDataJson);
    
    // Store access token and refresh token in cookies. Subtract 20 seconds
    // from expiration times so that they'll expire slightly early, alerting the
    // browser to refresh the access token or restart the auth flow
    // BEFORE dispatching a backend workflow.
    let accessTokenMaxAge = null;
    if (responseData.accessTokenExpiresInSeconds !== null) {
        accessTokenMaxAge = responseData.accessTokenExpiresInSeconds - 20;
    }
    
    let refreshTokenMaxAge = null;
    if (responseData.refreshTokenExpiresInSeconds !== null) {
        refreshTokenMaxAge = responseData.refreshTokenExpiresInSeconds - 20;
    }

    util.setCookie('accessToken', responseData.accessToken, '/', accessTokenMaxAge);
    util.setCookie('refreshToken', responseData.refreshToken, '/', refreshTokenMaxAge);

    // Redirect user back to where they were when auth flow started
    const state = JSON.parse(
        new TextDecoder().decode(
            Uint8Array.fromBase64(
                stateBase64url,
                { alphabet: 'base64url' }
            )
        )
    )
    window.location.replace(state.originatingUrl);
});
