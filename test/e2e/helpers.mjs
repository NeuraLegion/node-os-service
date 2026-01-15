import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { stat, access, constants } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { join } from 'node:path';
import { platform } from 'node:os';

const execAsync = promisify(exec);

export const SERVICE_NAME = 'test-os-service';
export const currentPlatform = platform();
export const isRoot = process.getuid && process.getuid() === 0;
export const sudoPrefix = currentPlatform === 'linux' && !isRoot ? 'sudo ' : '';

export async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutable(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function hasSystemd() {
  try {
    await stat('/usr/lib/systemd/system');
    return true;
  } catch {
    return false;
  }
}

export async function waitForWindowsServiceState(serviceName, expectedState, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const { stdout } = await execAsync(`sc query ${serviceName}`);
    if (stdout.includes(expectedState)) {
      return stdout;
    }
    await setTimeout(500);
  }
  const { stdout } = await execAsync(`sc query ${serviceName}`);
  return stdout;
}

export async function runPeriodicLogger(...args) {
  const scriptPath = join(import.meta.dirname, '../../example/periodic-logger.mjs');
  const { stdout, stderr } = await execAsync(`${sudoPrefix}node ${scriptPath} ${args.join(' ')}`);
  return { stdout, stderr };
}

export { execAsync };
