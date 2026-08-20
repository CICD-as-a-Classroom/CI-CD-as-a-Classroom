import { Octokit } from 'octokit';
import JSZip from 'jszip';

import * as util from '@/js/util.js'
import siteConfig from '@/config/conf.yaml'

function resetProgress() {
    const redirectingContentContainer = document.getElementById('redirecting-content-container');
    const loadingContentContainer = document.getElementById('loading-content-container');
    const refreshAuthTokensContentContainer = document.getElementById('refresh-auth-tokens-content-container');
    const progressBar = document.getElementById('loading-progress-bar');
    const refreshAuthTokensStatusTextContainer = document.getElementById('loading-status-text-container');

    progressBar.querySelectorAll('.progress-chunk-visible').forEach((chunk) => {
        chunk.classList.remove('progress-chunk-visible');
    });

    refreshAuthTokensStatusTextContainer
        .querySelector('.status-text-visible')
        .classList
        .remove('status-text-visible');

    refreshAuthTokensStatusTextContainer
        .querySelector('.status-text')
        .classList
        .add('status-text-visible');

    redirectingContentContainer.style.display = 'none';
    loadingContentContainer.style.display = 'block';
    refreshAuthTokensContentContainer.style.display = 'none';
}

function stepProgress() {
    const progressBar = document.getElementById('loading-progress-bar');
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

function resetRefreshAuthTokensProgress() {
    const redirectingContentContainer = document.getElementById('redirecting-content-container');
    const loadingContentContainer = document.getElementById('loading-content-container');
    const refreshAuthTokensContentContainer = document.getElementById('refresh-auth-tokens-content-container');
    const progressBar = document.getElementById('refresh-auth-tokens-progress-bar');
    const refreshAuthTokensStatusTextContainer = document.getElementById('refresh-auth-tokens-status-text-container');

    progressBar.querySelectorAll('.progress-chunk-visible').forEach((chunk) => {
        chunk.classList.remove('progress-chunk-visible');
    });

    refreshAuthTokensStatusTextContainer
        .querySelector('.status-text-visible')
        .classList
        .remove('status-text-visible');

    refreshAuthTokensStatusTextContainer
        .querySelector('.status-text')
        .classList
        .add('status-text-visible');

    redirectingContentContainer.style.display = 'none';
    loadingContentContainer.style.display = 'none';
    refreshAuthTokensContentContainer.style.display = 'block';
}

function stepRefreshAuthTokensProgress() {
    const progressBar = document.getElementById('refresh-auth-tokens-progress-bar');
    const refreshAuthTokensStatusTextContainer = document.getElementById('refresh-auth-tokens-status-text-container');
    const visibleStatusText = refreshAuthTokensStatusTextContainer.querySelector('.status-text-visible');
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
    const refreshAuthTokensContentContainer = document.getElementById('refresh-auth-tokens-content-container');
    const errorContentContainer = document.getElementById('error-content-container');
    const errorStatusText = document.getElementById('error-status-text');
    
    errorStatusText.textContent = `Error: ${message}`;
    
    loadingContentContainer.style.display = 'none';
    refreshAuthTokensContentContainer.style.display = 'none';
    errorContentContainer.style.display = 'block';
}

function updateWorkflowStatus(statusUpdate) {
    if (statusUpdate.status == 'error') {
        showError(statusUpdate.message);
    } else {
        stepProgress()
    }
}

function updateRefreshAuthTokensWorkflowStatus(statusUpdate) {
    if (statusUpdate.status == 'error') {
        showError(statusUpdate.message);
    } else {
        stepRefreshAuthTokensProgress()
    }
}

async function refreshAuthTokens(organizationName, workflowDispatchAppInstallation, refreshToken) {
    resetRefreshAuthTokensProgress();
    
    const workflowInputs = {
        'userRefreshToken': refreshToken,
    }
    const zip = await util.dispatchWorkflowViaIssue(organizationName, workflowDispatchAppInstallation, 'refresh-auth-tokens', workflowInputs, updateRefreshAuthTokensWorkflowStatus, siteConfig.pollDelay);
    
    if (zip === null) {
        // Workflow failed. Error message should already be displayed via
        // statusUpdateCallback functional parameter
        return {
            accessToken: null,
            refreshToken: null,
            status: 'error'
        };
    }

    if (!Object.hasOwn(zip.files, 'result/status.json')) {
        showError("Artifact result archive missing status.json");
        return {
            accessToken: null,
            refreshToken: null,
            status: 'error'
        };
    }

    const statusJson = await zip.files['result/status.json'].async('string');
    const statusObj = JSON.parse(statusJson);
    if (statusObj.status != 'success') {
        return {
            accessToken: null,
            refreshToken: null,
            status: 'bad-auth'
        };
    }

    if (!Object.hasOwn(zip.files, 'result/data.json')) {
        showError("Artifact result archive missing data.json");
        return {
            accessToken: null,
            refreshToken: null,
            status: 'error'
        };
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

    return {
        accessToken: responseData.accessToken,
        refreshToken: responseData.refreshToken,
        status: 'success'
    };
}

async function authenticate() {
    const redirectingContentContainer = document.getElementById('redirecting-content-container');
    const loadingContentContainer = document.getElementById('loading-content-container');
    const refreshAuthTokensContentContainer = document.getElementById('refresh-auth-tokens-content-container');
    redirectingContentContainer.style.display = 'block';
    loadingContentContainer.style.display = 'none';
    refreshAuthTokensContentContainer.style.display = 'none';

    const authClientId = siteConfig.authClientId;

    const pkceCodeVerifier = util.generateSecureString(128);
    const pkceCodeChallenge =
        (await util.sha256(pkceCodeVerifier))
        .toBase64({ alphabet: 'base64url', omitPadding: true });
    
    util.setCookie('pkceCodeVerifier', pkceCodeVerifier, '/', 3600);

    const randomStateToken = util.generateSecureString(32);
    const state = {
        randomToken: randomStateToken,
        originatingUrl: window.location.href
    };
    const stateBase64url =
        new TextEncoder().encode(JSON.stringify(state))
        .toBase64({ alphabet: 'base64url', omitPadding: true });
    
    util.setCookie('stateBase64url', stateBase64url, '/', 3600);
    
    window.location.replace(`https://github.com/login/oauth/authorize?client_id=${authClientId}&state=${stateBase64url}&code_challenge=${pkceCodeChallenge}&code_challenge_method=S256`)
}

async function acceptAssignment(organizationName, workflowDispatchAppInstallation, accessToken, refreshToken, assignmentName, assignmentAcceptKey) {
    let failedAuth = 0;
    let succeeded = false;
    let zip;
    while (failedAuth < 2 && !succeeded) {
        resetProgress();
        let workflowInputs = {
            'userAccessToken': accessToken,
            'assignmentName': assignmentName
        }
        if (assignmentAcceptKey !== null) {
            workflowInputs['assignmentAcceptKey'] = assignmentAcceptKey;
        }
        const accessTokenOctokit = new Octokit({
            auth: accessToken
        });
        zip = await util.dispatchWorkflowViaIssue(organizationName, workflowDispatchAppInstallation, 'accept-assignment', workflowInputs, updateWorkflowStatus, siteConfig.pollDelay, accessTokenOctokit);

        if (zip === null) {
            // Workflow failed. Error message should already be displayed via
            // statusUpdateCallback functional parameter
            return {
                refreshedAccessToken: accessToken,
                refreshedRefreshToken: refreshToken,
                succeeded: false,
                zip: null
            };
        }

        if (!Object.hasOwn(zip.files, 'result/status.json')) {
            showError("Artifact result archive missing status.json");
            return {
                refreshedAccessToken: accessToken,
                refreshedRefreshToken: refreshToken,
                succeeded: false,
                zip: null
            };
        }

        const statusJson = await zip.files['result/status.json'].async('string');
        const statusObj = JSON.parse(statusJson);
        if (statusObj.status == 'unknown-assignment') {
            showError(`Assignment "${assignmentName}" not found.`);
            return {
                refreshedAccessToken: accessToken,
                refreshedRefreshToken: refreshToken,
                succeeded: false,
                zip: null
            };
        } else if (statusObj.status == 'invalid-key') {
            if (assignmentAcceptKey !== null) {
                showError(`Incorrect assignment accept key "${assignmentAcceptKey}".`);
            } else {
                showError('Missing assignment accept key.');
            }
            return {
                refreshedAccessToken: accessToken,
                refreshedRefreshToken: refreshToken,
                succeeded: false,
                zip: null
            };
        } else if (statusObj.status == 'bad-auth') {
            failedAuth++;
            if (failedAuth < 2) {
                const refreshResults = await refreshAuthTokens(organizationName, workflowDispatchAppInstallation, refreshToken);
                if (refreshResults.status == 'success') {
                    accessToken = refreshResults.accessToken;
                    refreshToken = refreshResults.refreshToken;
                } else if (refreshResults.status == 'bad-auth') {
                    // Refresh token is bad. Redirect to main auth flow page.
                    await authenticate();
                } else {
                    // Refresh failed for unexpected reason. Error message
                    // should already be displayed. Halt.
                    return {
                        refreshedAccessToken: accessToken,
                        refreshedRefreshToken: refreshToken,
                        succeeded: false,
                        zip: null
                    };
                }
            } else {
                showError(`Failed to authenticate user with GitHub`);
                return {
                    refreshedAccessToken: accessToken,
                    refreshedRefreshToken: refreshToken,
                    succeeded: false,
                    zip: null
                };
            }
        } else if (statusObj.status == 'duplicate-username') {
            showError(`Repository already exists but somehow belongs to a different student (perhaps you recently changed your username, or you modified the STUDENT_ID repository variable). Instructor intervention is required.`);
            return {
                refreshedAccessToken: accessToken,
                refreshedRefreshToken: refreshToken,
                succeeded: false,
                zip: null
            };
        } else if (statusObj.status != 'success') {
            showError(`Artifact result archive reported non-success status "${statusObj.status}"`);
            return {
                refreshedAccessToken: accessToken,
                refreshedRefreshToken: refreshToken,
                succeeded: false,
                zip: null
            };
        } else {
            succeeded = true;
        }
    }
    
    return {
        refreshedAccessToken: accessToken,
        refreshedRefreshToken: refreshToken,
        succeeded: succeeded,
        zip: zip
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const assignmentName = urlParams.get('assignment-name');
    const assignmentAcceptKey = urlParams.get('assignment-accept-key');

    const organizationName = siteConfig.backendRepoOwner;

    if (assignmentName == null || assignmentName == "") {
        showError("Missing assignment name in this page's URL");
        return;
    }
    
    let refreshToken = util.getCookie('refreshToken');
    let accessToken = util.getCookie('accessToken');

    if (accessToken === "") {
        accessToken = null;
    }
    if (refreshToken === "") {
        refreshToken = null;
    }

    const workflowDispatchAppInstallation = await util.getWorkflowDispatchAppInstallation();

    if (accessToken === null && refreshToken !== null) {
        // Use refresh token to request new access token.
        const refreshResults = await refreshAuthTokens(organizationName, workflowDispatchAppInstallation, refreshToken);
        if (refreshResults.status == 'success') {
            accessToken = refreshResults.accessToken;
            refreshToken = refreshResults.refreshToken;
        } else if (refreshResults.status == 'bad-auth') {
            // Refresh token is bad. Set both tokens to null so that user
            // is redirected to main auth flow.
            accessToken = null;
            refreshToken = null;
        } else {
            // Refresh failed for unexpected reason. Error message
            // should already be displayed. Halt.
            return;
        }
    }

    // Main auth flow if either token is null
    if (refreshToken === null || accessToken === null) {
        // Redirect browser to GitHub App login.
        await authenticate();
        return;
    }
    
    // Logged in. Show loading content
    
    const assignmentAcceptTitle = document.getElementById('assignment-accept-title');
    assignmentAcceptTitle.textContent = `Accepting assignment "${assignmentName}"`;
    
    // Dispatch backend workflow to accept assignment.
    const acceptResults = await acceptAssignment(
        organizationName,
        workflowDispatchAppInstallation,
        accessToken,
        refreshToken,
        assignmentName,
        assignmentAcceptKey
    );

    accessToken = acceptResults.refreshedAccessToken;
    refreshToken = acceptResults.refreshedRefreshToken;

    if (!acceptResults.succeeded) {
        return;
    }

    if (!Object.hasOwn(acceptResults.zip.files, 'result/data.json')) {
        showError("Artifact result archive missing data.json");
        return;
    }

    const responseDataJson = await acceptResults.zip.files['result/data.json'].async('string');
    const responseData = JSON.parse(responseDataJson);

    window.location.replace(responseData.repositoryURL);
});
