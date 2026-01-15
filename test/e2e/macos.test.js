'use strict';

const { describe, it, after } = require('node:test');
const { ok } = require('node:assert');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { platform, homedir } = require('node:os');

const {
  SERVICE_NAME,
  execAsync,
  fileExists,
  runPeriodicLogger
} = require('./helpers');

const plistPath = join(homedir(), 'Library/LaunchAgents', `${SERVICE_NAME}.plist`);

async function cleanup() {
  try {
    await execAsync(`launchctl unload ${plistPath}`);
    await runPeriodicLogger('--remove', SERVICE_NAME);
  } catch {
    // ignore errors
  }
}

describe('macOS: LaunchAgent', { skip: platform() !== 'darwin' }, () => {
  after(cleanup);

  it('should add a service and create plist file', async () => {
    // arrange
    const expectedPath = plistPath;

    // act
    await runPeriodicLogger('--add', SERVICE_NAME);
    const exists = await fileExists(expectedPath);

    // assert
    ok(exists);
  });

  it('should create valid plist content', async () => {
    // arrange
    const expectedPath = plistPath;

    // act
    const content = await readFile(expectedPath, 'utf-8');

    // assert
    ok(content.includes('<plist'));
    ok(content.includes(SERVICE_NAME));
  });

  it('should load the service via launchctl', async () => {
    // arrange
    const plist = plistPath;

    // act
    await execAsync(`launchctl load ${plist}`);

    // assert
    ok(true);
  });

  it('should unload the service via launchctl', async () => {
    // arrange
    const plist = plistPath;

    // act
    await execAsync(`launchctl unload ${plist}`);

    // assert
    ok(true);
  });

  it('should remove the service and delete plist file', async () => {
    // arrange
    const expectedPath = plistPath;

    // act
    await runPeriodicLogger('--remove', SERVICE_NAME);
    const exists = await fileExists(expectedPath);

    // assert
    ok(!exists);
  });
});
