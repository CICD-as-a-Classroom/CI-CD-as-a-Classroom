import { execFile } from 'node:child_process';

import { getStudentAssignmentWritingAppInstallationAccessToken as getInstallationAccessToken } from './util.js'

async function main() {
    const installationAccessToken = await getInstallationAccessToken();
    console.log(installationAccessToken);
}

await main();
