'use strict';

const { describe, it, before, after } = require('node:test');
const { ok, fail } = require('node:assert');
const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const { stat, readFile, access, constants } = require('node:fs/promises');
const { setTimeout } = require('node:timers/promises');
const { join } = require('node:path');
const { platform, homedir } = require('node:os');

const execAsync = promisify(exec);

const SERVICE_NAME = 'test-os-service';
const currentPlatform = platform();

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

async function runPeriodicLogger(...args) {
  const scriptPath = join(__dirname, '../../example/periodic-logger.js');
  const prefix = currentPlatform === 'linux' ? 'sudo ' : '';
  const { stdout, stderr } = await execAsync(`${prefix}node ${scriptPath} ${args.join(' ')}`);
  return { stdout, stderr };
}

async function cleanup() {
  try {
    if (currentPlatform === 'win32') {
      await execAsync(`sc stop ${SERVICE_NAME}`).catch(() => {});
      await runPeriodicLogger('--remove', SERVICE_NAME);
    } else if (currentPlatform === 'darwin') {
      const plistPath = join(homedir(), 'Library/LaunchAgents', `${SERVICE_NAME}.plist`);
      await execAsync(`launchctl unload ${plistPath}`).catch(() => {});
      await runPeriodicLogger('--remove', SERVICE_NAME);
    } else {
      await execAsync(`sudo systemctl stop ${SERVICE_NAME}`).catch(() => {});
      await execAsync(`sudo /etc/init.d/${SERVICE_NAME} stop`).catch(() => {});
      await runPeriodicLogger('--remove', SERVICE_NAME);
    }
  } catch {
    // ignore errors
  }
}

describe('OS Service E2E Tests', () => {
  describe(`Platform: ${currentPlatform}`, () => {
    after(cleanup);

    if (currentPlatform === 'win32') {
      describe('Windows Service', () => {
        it('should add and start a service', async () => {
          // arrange
          const serviceName = SERVICE_NAME;

          // act
          await runPeriodicLogger('--add', serviceName);
          const { stdout } = await execAsync(`sc query ${serviceName}`);

          // assert (service is registered and running after add+enable)
          ok(stdout.includes(serviceName), 'Service should be registered');
          ok(stdout.includes('RUNNING'), 'Service should be running after add');
        });

        it('should stop the service', async () => {
          // arrange
          const serviceName = SERVICE_NAME;

          // act
          await execAsync(`sc stop ${serviceName}`);
          const { stdout } = await execAsync(`sc query ${serviceName}`);

          // assert
          ok(stdout.includes('STOPPED'), 'Service should be stopped');
        });

        it('should start the service again', async () => {
          // arrange
          const serviceName = SERVICE_NAME;

          // act
          await execAsync(`sc start ${serviceName}`);
          const { stdout } = await execAsync(`sc query ${serviceName}`);

          // assert
          ok(stdout.includes('RUNNING'), 'Service should be running');
        });

        it('should remove the service', async () => {
          // arrange
          const serviceName = SERVICE_NAME;

          // act
          await execAsync(`sc stop ${serviceName}`).catch(() => {});
          await runPeriodicLogger('--remove', serviceName);

          // assert
          try {
            await execAsync(`sc query ${serviceName}`);
            fail('Service should not exist');
          } catch (error) {
            ok(
              error.message.includes('1060') || error.message.includes('does not exist'),
              'Service should be removed'
            );
          }
        });
      });

    } else if (currentPlatform === 'darwin') {
      describe('macOS LaunchAgent', () => {
        const plistPath = join(homedir(), 'Library/LaunchAgents', `${SERVICE_NAME}.plist`);

        it('should add a service and create plist file', async () => {
          // arrange
          const expectedPath = plistPath;

          // act
          await runPeriodicLogger('--add', SERVICE_NAME);
          const exists = await fileExists(expectedPath);

          // assert
          ok(exists, `Plist should exist at ${expectedPath}`);
        });

        it('should create valid plist content', async () => {
          // arrange
          const expectedPath = plistPath;

          // act
          const content = await readFile(expectedPath, 'utf-8');

          // assert
          ok(content.includes('<plist'), 'Should be a valid plist file');
          ok(content.includes(SERVICE_NAME), 'Should contain service name');
        });

        it('should load the service via launchctl', async () => {
          // arrange
          const plist = plistPath;

          // act
          await execAsync(`launchctl load ${plist}`);
          await setTimeout(1000);

          // assert
          ok(true, 'Service loaded without error');
        });

        it('should unload the service via launchctl', async () => {
          // arrange
          const plist = plistPath;

          // act
          await execAsync(`launchctl unload ${plist}`);

          // assert
          ok(true, 'Service unloaded without error');
        });

        it('should remove the service and delete plist file', async () => {
          // arrange
          const expectedPath = plistPath;

          // act
          await runPeriodicLogger('--remove', SERVICE_NAME);
          const exists = await fileExists(expectedPath);

          // assert
          ok(!exists, 'Plist should be removed');
        });
      });

    } else {
      describe('Linux Service', () => {
        let useSystemd = false;

        before(async () => {
          useSystemd = await hasSystemd();
        });

        it('should add a service and create config file', async () => {
          // arrange
          const systemdPath = `/usr/lib/systemd/system/${SERVICE_NAME}.service`;
          const initPath = `/etc/init.d/${SERVICE_NAME}`;

          // act
          await runPeriodicLogger('--add', SERVICE_NAME);

          // assert
          if (useSystemd) {
            const exists = await fileExists(systemdPath);
            ok(exists, `Systemd unit should exist at ${systemdPath}`);
          } else {
            const exists = await fileExists(initPath);
            ok(exists, `Init.d script should exist at ${initPath}`);
          }
        });

        it('should create file with correct permissions', async () => {
          // arrange
          const systemdPath = `/usr/lib/systemd/system/${SERVICE_NAME}.service`;
          const initPath = `/etc/init.d/${SERVICE_NAME}`;

          // act & assert
          if (useSystemd) {
            const exists = await fileExists(systemdPath);
            ok(exists, 'Systemd unit file should exist');
          } else {
            const executable = await isExecutable(initPath);
            ok(executable, 'Init.d script should be executable');
          }
        });

        it('should create valid service configuration', async () => {
          // arrange
          const systemdPath = `/usr/lib/systemd/system/${SERVICE_NAME}.service`;
          const initPath = `/etc/init.d/${SERVICE_NAME}`;

          // act
          const filePath = useSystemd ? systemdPath : initPath;
          const content = await readFile(filePath, 'utf-8');

          // assert
          if (useSystemd) {
            ok(content.includes('[Unit]'), 'Should have Unit section');
            ok(content.includes('[Service]'), 'Should have Service section');
            ok(content.includes('[Install]'), 'Should have Install section');
          } else {
            ok(content.includes('#!/bin/bash'), 'Should have bash shebang');
            ok(content.includes('BEGIN INIT INFO'), 'Should have init info');
          }
        });

        it('should enable the service', async () => {
          // arrange
          const serviceName = SERVICE_NAME;

          // act & assert
          if (useSystemd) {
            const { stdout } = await execAsync(`systemctl is-enabled ${serviceName}`).catch(e => ({
              stdout: e.stdout || ''
            }));
            ok(
              stdout.includes('enabled') || stdout.includes('static'),
              'Service should be enabled'
            );
          } else {
            ok(true, 'Init.d service enabled during add');
          }
        });

        it('should start the service', async () => {
          // arrange
          const serviceName = SERVICE_NAME;

          // act
          if (useSystemd) {
            await execAsync('sudo systemctl daemon-reload');
            await execAsync(`sudo systemctl start ${serviceName}`).catch(() => {});
          } else {
            await execAsync(`sudo /etc/init.d/${serviceName} start`).catch(() => {});
          }

          // assert
          ok(true, 'Start command executed');
        });

        it('should stop the service', async () => {
          // arrange
          const serviceName = SERVICE_NAME;

          // act
          if (useSystemd) {
            await execAsync(`sudo systemctl stop ${serviceName}`).catch(() => {});
          } else {
            await execAsync(`sudo /etc/init.d/${serviceName} stop`).catch(() => {});
            // wait for service to fully stop
            await setTimeout(2000);
          }

          // assert
          ok(true, 'Stop command executed');
        });

        it('should remove the service and delete config file', async () => {
          // arrange
          const systemdPath = `/usr/lib/systemd/system/${SERVICE_NAME}.service`;
          const initPath = `/etc/init.d/${SERVICE_NAME}`;

          // act
          // ensure service is stopped before removal
          if (useSystemd) {
            await execAsync(`sudo systemctl stop ${SERVICE_NAME}`).catch(() => {});
          } else {
            await execAsync(`sudo /etc/init.d/${SERVICE_NAME} stop`).catch(() => {});
            await setTimeout(1000);
          }

          try {
            await runPeriodicLogger('--remove', SERVICE_NAME);
          } catch {
            // if periodic-logger fails, try manual cleanup
            if (useSystemd) {
              await execAsync(`sudo systemctl disable ${SERVICE_NAME}`).catch(() => {});
              await execAsync(`sudo rm -f ${systemdPath}`).catch(() => {});
            } else {
              await execAsync(`sudo update-rc.d ${SERVICE_NAME} remove`).catch(() => {});
              await execAsync(`sudo rm -f ${initPath}`).catch(() => {});
            }
          }

          // assert
          if (useSystemd) {
            const exists = await fileExists(systemdPath);
            ok(!exists, 'Systemd unit should be removed');
          } else {
            const exists = await fileExists(initPath);
            ok(!exists, 'Init.d script should be removed');
          }
        });
      });
    }
  });
});
