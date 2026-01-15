import { describe, it, after } from 'node:test';
import { ok, rejects } from 'node:assert';
import { platform } from 'node:os';

import {
  SERVICE_NAME,
  execAsync,
  waitForWindowsServiceState,
  runPeriodicLogger
} from './helpers.mjs';

async function cleanup() {
  try {
    await execAsync(`sc stop ${SERVICE_NAME}`);
    await runPeriodicLogger('--remove', SERVICE_NAME);
  } catch {
    // ignore errors
  }
}

describe('Windows: Service', { skip: platform() !== 'win32' }, () => {
  after(cleanup);

  it('should add and start a service', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    await runPeriodicLogger('--add', serviceName);
    const { stdout } = await execAsync(`sc query ${serviceName}`);

    ok(stdout.includes(serviceName));
    ok(stdout.includes('RUNNING'));
  });

  it('should stop the service', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    await execAsync(`sc stop ${serviceName}`);
    const stdout = await waitForWindowsServiceState(serviceName, 'STOPPED');

    // assert
    ok(stdout.includes('STOPPED'));
  });

  it('should start the service again', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    await execAsync(`sc start ${serviceName}`);
    const stdout = await waitForWindowsServiceState(serviceName, 'RUNNING');

    // assert
    ok(stdout.includes('RUNNING'));
  });

  it('should remove the service', async () => {
    // arrange
    const serviceName = SERVICE_NAME;

    // act
    await execAsync(`sc stop ${serviceName}`);
    await waitForWindowsServiceState(serviceName, 'STOPPED');
    await runPeriodicLogger('--remove', serviceName);

    // assert - sc query should fail when service doesn't exist
    await rejects(
      execAsync(`sc query ${serviceName}`)
    );
  });
});
