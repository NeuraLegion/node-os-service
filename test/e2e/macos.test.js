import { describe, it, after } from 'node:test';
import { ok } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform, homedir } from 'node:os';

import {
  SERVICE_NAME,
  execAsync,
  fileExists,
  runPeriodicLogger
} from './helpers.js';

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
