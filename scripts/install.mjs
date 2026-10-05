import { platform } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The native addon is only needed on Windows, so the build normally runs only
// there. OS_SERVICE_FORCE_NATIVE_INSTALL forces it anywhere (manual rebuilds,
// CI verifying the build/exit-code path on a non-Windows runner).
if (platform() === 'win32' || process.env.OS_SERVICE_FORCE_NATIVE_INSTALL) {
  const npmProcess = spawn('npm', ['run', 'native_install'], {
    input: 'Windows detected. Installing native module.',
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
    env: process.env,
    windowsHide: true,
    shell: true
  });

  // Handle child process exit
  npmProcess.on('exit', (code, signal) => {
    if (code !== null) {
      console.log(`Child process exited with code ${code}`);
      // Propagate a failing build; a silent exit 0 ships a broken addon that
      // only fails later at require() time.
      process.exit(code);
    } else if (signal !== null) {
      console.log(`Child process was terminated by signal ${signal}`);
      process.exit(1);
    }
  });

  // Handle child process errors
  npmProcess.on('error', (error) => {
    console.error('Error occurred:', error);
    process.exit(1);
  });

  // Forward parent process signals to the child process
  function forwardSignal(signal) {
    if (npmProcess.pid) {
      npmProcess.kill(signal);
    }
  }

  process.on('SIGTERM', forwardSignal);
  process.on('SIGINT', forwardSignal);
}
