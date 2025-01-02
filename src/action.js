import { link, readdir, readlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
export const ignoredPaths = [
    'node_modules',
    '.git',
];
export async function convertAllSymlinks(startDirPath) {
    const children = await readdir(startDirPath, { withFileTypes: true });
    await Promise.all(children.map(async (child) => {
        if (ignoredPaths.includes(child.name)) {
            return;
        }
        const childPath = join(startDirPath, child.name);
        if (child.isSymbolicLink()) {
            const targetPath = await readlink(childPath);
            await rm(childPath);
            await link(targetPath, childPath);
        }
        else if (child.isDirectory()) {
            await convertAllSymlinks(childPath);
        }
    }));
}
export const platformsWithoutSymlinkSupport = [
    'win32',
];
/* node:coverage ignore next 11: cannot test this because it depends on the current system platform */
export async function runAction(repoDir) {
    console.info(`Current platform: ${process.platform}`);
    if (platformsWithoutSymlinkSupport.includes(process.platform)) {
        console.info('Converting symlinks...');
        await convertAllSymlinks(repoDir);
        console.info('Symlink conversion successful.');
    }
    else {
        console.info(`Skipping symlink conversion because current platform is not Windows (and symlinks will work fine).`);
    }
}
