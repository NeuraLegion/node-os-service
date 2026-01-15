'use strict';

const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const { stat, access, constants } = require('node:fs/promises');
const { setTimeout } = require('node:timers/promises');
const { join } = require('node:path');
const { platform } = require('node:os');

const execAsync = promisify(exec);

const SERVICE_NAME = 'test-os-service';
const currentPlatform = platform();
const isRoot = process.getuid && process.getuid() === 0;
const sudoPrefix = currentPlatform === 'linux' && !isRoot ? 'sudo ' : '';

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasSystemd() {
  try {
    await stat('/usr/lib/systemd/system');
    return true;
  } catch {
    return false;
  }
}

async function waitForWindowsServiceState(serviceName, expectedState, maxAttempts = 10) {
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

async function runPeriodicLogger(...args) {
  const scriptPath = join(__dirname, '../../example/periodic-logger.js');
  const { stdout, stderr } = await execAsync(`${sudoPrefix}node ${scriptPath} ${args.join(' ')}`);
  return { stdout, stderr };
}

module.exports = {
  SERVICE_NAME,
  currentPlatform,
  isRoot,
  sudoPrefix,
  execAsync,
  fileExists,
  isExecutable,
  hasSystemd,
  waitForWindowsServiceState,
  runPeriodicLogger
};
