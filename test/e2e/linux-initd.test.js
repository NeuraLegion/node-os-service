import { describe, it, after } from 'node:test';
import { ok } from 'node:assert';
import { readFile, unlink } from 'node:fs/promises';
import { platform } from 'node:os';

import {
  SERVICE_NAME,
  sudoPrefix,
  execAsync,
  fileExists,
  isExecutable,
  hasSystemd,
  runPeriodicLogger
} from './helpers.js';

const initPath = `/etc/init.d/${SERVICE_NAME}`;

async function cleanup() {
  try {
    await execAsync(`${sudoPrefix}/etc/init.d/${SERVICE_NAME} stop`);
    await execAsync(`${sudoPrefix}update-rc.d ${SERVICE_NAME} remove`);
    await unlink(initPath);
  } catch {
    // ignore errors
  }
}

async function shouldSkip() {
  return platform() !== 'linux' || (await hasSystemd());
}

describe('Linux: Init.d', { skip: await shouldSkip() }, () => {
  after(cleanup);

  it('should add a service and create init script', async () => {
    // arrange
    const expectedPath = initPath;

    // act
    await runPeriodicLogger('--add', SERVICE_NAME);
    const exists = await fileExists(expectedPath);

    // assert
    ok(exists);
  });

  it('should create init script with executable permissions', async () => {
    // arrange
    const scriptPath = initPath;

    // act
    const executable = await isExecutable(scriptPath);

    // assert
    ok(executable);
  });

  it('should create valid init script content', async () => {
    // arrange
    const scriptPath = initPath;

    // act
    const content = await readFile(scriptPath, 'utf-8');

    // assert
    ok(content.includes('#!/bin/bash'));
    ok(content.includes('BEGIN INIT INFO'));
  });

  it('should start the service', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    await execAsync(`${sudoPrefix}/etc/init.d/${serviceName} start`);

    // assert
    ok(true);
  });

  it('should stop the service', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    await execAsync(`${sudoPrefix}/etc/init.d/${serviceName} stop`);

    // assert
    ok(true);
  });

  it('should remove the service and delete init script', async () => {
    // arrange
    const scriptPath = initPath;

    // act
    await execAsync(`${sudoPrefix}/etc/init.d/${SERVICE_NAME} stop`);
    await execAsync(`${sudoPrefix}update-rc.d ${SERVICE_NAME} remove`);
    await unlink(scriptPath);

    // assert
    const exists = await fileExists(scriptPath);
    ok(!exists);
  });
});
