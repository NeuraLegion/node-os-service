import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const installScript = join(__dirname, '..', '..', 'scripts', 'install.mjs');

// Run install.mjs in an isolated project whose `native_install` exits with the
// given code, forcing the (normally Windows-only) build path via
// OS_SERVICE_FORCE_NATIVE_INSTALL so the exit-propagation is exercised on any OS.
function runInstall(nativeInstallExitCode) {
  return new Promise((resolvePromise, reject) => {
    (async () => {
      const dir = await mkdtemp(join(tmpdir(), 'os-service-install-'));
      try {
        await mkdir(join(dir, 'scripts'), { recursive: true });
        await copyFile(installScript, join(dir, 'scripts', 'install.mjs'));
        await writeFile(
          join(dir, 'package.json'),
          JSON.stringify({
            name: 'install-exit-code-fixture',
            scripts: { native_install: `node -e "process.exit(${nativeInstallExitCode})"` }
          })
        );
        const child = spawn(process.execPath, ['scripts/install.mjs'], {
          cwd: dir,
          env: { ...process.env, OS_SERVICE_FORCE_NATIVE_INSTALL: '1' },
          stdio: 'ignore'
        });
        child.on('error', reject);
        child.on('exit', (code) => { rm(dir, { recursive: true, force: true }).finally(() => resolvePromise(code)); });
      } catch (err) {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        reject(err);
      }
    })();
  });
}

describe('install.mjs native build exit code', () => {
  it('should exit non-zero when the native build fails', async () => {
    const code = await runInstall(1);
    strictEqual(code, 1);
  });

  it('should exit zero when the native build succeeds', async () => {
    const code = await runInstall(0);
    strictEqual(code, 0);
  });
});
