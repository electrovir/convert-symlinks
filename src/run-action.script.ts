import {runAction} from './action.js';

const repoDir = process.env.GITHUB_WORKSPACE;

if (!repoDir) {
    throw new Error('Failed to find repo dir for converting symlinks.');
}

await runAction(repoDir);
