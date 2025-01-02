import { assert } from '@augment-vir/assert';
import { RuntimeEnv } from '@augment-vir/common';
import { createSymlink, replaceWithWindowsPathIfNeeded } from '@augment-vir/node';
import { assertTestContext, describe, it } from '@augment-vir/test';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { convertAllSymlinks, ignoredPaths } from './action.js';
const repoDirPath = dirname(import.meta.dirname);
const notCommittedDirPath = join(repoDirPath, '.not-committed');
async function countAllSymlinks(dirPath) {
    const children = await readdir(dirPath, { withFileTypes: true });
    let symlinkCount = 0;
    await Promise.all(children.map(async (child) => {
        const childPath = join(dirPath, child.name);
        if (child.isSymbolicLink()) {
            symlinkCount++;
        }
        else if (child.isDirectory()) {
            const subCount = await countAllSymlinks(childPath);
            symlinkCount += subCount;
        }
    }));
    return symlinkCount;
}
async function assertLinkEquality(testDirPath, filesToGenerate) {
    await Promise.all(Object.entries(filesToGenerate).map(async ([filePath, options,]) => {
        const pathParts = filePath.split(sep);
        if (pathParts.some((pathPart) => ignoredPaths.includes(pathPart))) {
            /** Don't test ignored paths. */
            return;
        }
        const fullPath = join(testDirPath, replaceWithWindowsPathIfNeeded(filePath));
        if (options.contents) {
            /** Nothing to test. */
            return;
        }
        else if (options.symlink) {
            const linkToPath = join(testDirPath, options.symlink);
            const originalContents = String(await readFile(linkToPath));
            const replacedLinkContents = String(await readFile(fullPath));
            assert.isFalse((await stat(fullPath)).isSymbolicLink());
            assert.strictEquals(originalContents, replacedLinkContents);
        }
        else {
            throw new Error('Unexpected test options.');
        }
    }));
}
async function populateTestFiles(testDirPath, filesToGenerate) {
    const symlinkEntries = {};
    await Promise.all(Object.entries(filesToGenerate).map(async ([filePath, options,]) => {
        const fullPath = join(testDirPath, replaceWithWindowsPathIfNeeded(filePath));
        await mkdir(dirname(fullPath), { recursive: true });
        if (options.contents) {
            await writeFile(fullPath, options.contents);
        }
        else if (options.symlink) {
            const linkToPath = join(testDirPath, options.symlink);
            symlinkEntries[fullPath] = linkToPath;
        }
        else {
            throw new Error('Unexpected test options.');
        }
    }));
    /**
     * Symlinks must be created after all files are created so that the files the symlinks link to
     * exist already.
     */
    await Promise.all(Object.entries(symlinkEntries).map(async ([symlinkPath, targetPath,]) => {
        await mkdir(dirname(symlinkPath), { recursive: true });
        await createSymlink({ linkTo: targetPath, symlinkPath });
    }));
}
async function testConvertAllSymlinks(context, filesToGenerate) {
    assertTestContext(context, RuntimeEnv.Node);
    const testDirPath = join(notCommittedDirPath, context.name);
    await rm(testDirPath, { recursive: true, force: true });
    await populateTestFiles(testDirPath, filesToGenerate);
    const symlinkCountBefore = await countAllSymlinks(testDirPath);
    await convertAllSymlinks(testDirPath);
    await assertLinkEquality(testDirPath, filesToGenerate);
    return {
        before: symlinkCountBefore,
        after: await countAllSymlinks(testDirPath),
    };
}
describe(convertAllSymlinks.name, () => {
    it('handles having no symlinks', async (context) => {
        assert.deepEquals(await testConvertAllSymlinks(context, {
            'not-link.txt': {
                contents: 'magical stuff',
            },
            'nested/not-link-2.txt': {
                contents: 'magical stuff 2',
            },
        }), {
            before: 0,
            after: 0,
        });
    });
    it('converts top-level symlinks', async (context) => {
        assert.deepEquals(await testConvertAllSymlinks(context, {
            'not-link.txt': {
                contents: 'magical stuff',
            },
            'not-link-2.txt': {
                contents: 'magical stuff 2',
            },
            'link.txt': {
                symlink: 'not-link.txt',
            },
            'link2.txt': {
                symlink: 'not-link.txt',
            },
            'link-2.txt': {
                symlink: 'not-link-2.txt',
            },
            'link-2-2.txt': {
                symlink: 'not-link-2.txt',
            },
        }), {
            before: 4,
            after: 0,
        });
    });
    it('converts nested symlinks', async (context) => {
        assert.deepEquals(await testConvertAllSymlinks(context, {
            'not-link.txt': {
                contents: 'magical stuff',
            },
            'nested/not-link.txt': {
                contents: 'magical stuff nested',
            },
            'link.txt': {
                symlink: 'not-link.txt',
            },
            'nested-link-at-top.txt': {
                symlink: 'nested/not-link.txt',
            },
            'nested/link-in-nesting.txt': {
                symlink: 'nested/not-link.txt',
            },
        }), {
            before: 3,
            after: 0,
        });
    });
    it('ignores some paths', async (context) => {
        assert.deepEquals(await testConvertAllSymlinks(context, {
            'not-link.txt': {
                contents: 'magical stuff',
            },
            'link.txt': {
                symlink: 'not-link.txt',
            },
            'node_modules/nested-not-link.txt': {
                contents: 'magical stuff node_modules',
            },
            'node_modules/nested-link.txt': {
                symlink: 'node_modules/nested-not-link.txt',
            },
        }), {
            before: 2,
            after: 1,
        });
    });
});
