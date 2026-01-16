import { platform } from 'node:os';
import { resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (platform() === 'win32') {
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
    } else if (signal !== null) {
      console.log(`Child process was terminated by signal ${signal}`);
    }
  });

  // Handle child process errors
  npmProcess.on('error', (error) => {
    console.error('Error occurred:', error);
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
