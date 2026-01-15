'use strict';

const { describe, it, after } = require('node:test');
const { ok } = require('node:assert');
const { readFile, unlink } = require('node:fs/promises');
const { platform } = require('node:os');

const {
  SERVICE_NAME,
  sudoPrefix,
  execAsync,
  fileExists,
  hasSystemd,
  runPeriodicLogger
} = require('./helpers');

const systemdPath = `/usr/lib/systemd/system/${SERVICE_NAME}.service`;

async function cleanup() {
  try {
    await execAsync(`${sudoPrefix}systemctl stop ${SERVICE_NAME}`);
    await runPeriodicLogger('--remove', SERVICE_NAME);
  } catch {
    // ignore errors
  }
}

async function shouldSkip() {
  return platform() !== 'linux' || !(await hasSystemd());
}

describe('Linux: Systemd', { skip: await shouldSkip() }, () => {
  after(cleanup);

  it('should add a service and create unit file', async () => {
    // arrange
    const expectedPath = systemdPath;

    // act
    await runPeriodicLogger('--add', SERVICE_NAME);
    const exists = await fileExists(expectedPath);

    // assert
    ok(exists);
  });

  it('should create unit file with correct content', async () => {
    // arrange
    const unitPath = systemdPath;

    // act
    const content = await readFile(unitPath, 'utf-8');

    // assert
    ok(content.includes('[Unit]'));
    ok(content.includes('[Service]'));
    ok(content.includes('[Install]'));
  });

  it('should enable the service', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    const { stdout } = await execAsync(`systemctl is-enabled ${serviceName}`).catch(e => ({
      stdout: e.stdout || ''
    }));

    // assert
    ok(stdout.includes('enabled') || stdout.includes('static'));
  });

  it('should start the service', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    await execAsync(`${sudoPrefix}systemctl daemon-reload`);
    await execAsync(`${sudoPrefix}systemctl start ${serviceName}`);

    // assert
    ok(true);
  });

  it('should stop the service', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    await execAsync(`${sudoPrefix}systemctl stop ${serviceName}`);

    // assert
    ok(true);
  });

  it('should remove the service and delete unit file', async () => {
    // arrange
    const unitPath = systemdPath;

    // act
    await execAsync(`${sudoPrefix}systemctl stop ${SERVICE_NAME}`);
    await runPeriodicLogger('--remove', SERVICE_NAME);

    // assert
    const exists = await fileExists(unitPath);
    ok(!exists);
  });
});
