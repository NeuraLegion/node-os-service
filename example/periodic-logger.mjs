import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { promisify } from 'node:util';
import { add as addCb, disable as disableCb, remove as removeCb, stop, run, enable as enableCb } from '../index.mjs';

const add = promisify(addCb);
const enable = promisify(enableCb);
const disable = promisify(disableCb);
const remove = promisify(removeCb);

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 ** Change to the examples directory so this program can run as a service.
 **/
process.chdir(__dirname);

function usage() {
  console.log(
    'usage: node periodic-logger --add <name> [username] [password] [dep dep ...]'
  );
  console.log('       node periodic-logger --remove <name>');
  console.log('       node periodic-logger --run');
  process.exit(-1);
}

const [,, command, name, ...rest] = process.argv;

process.title = name;

if (command === '--add' && name) {
  const options = {
    args: [process.argv[1], '--run', 'me'],
  };

  const [username, password, ...dependencies] = rest;

  if (username) options.username = username;
  if (password) options.password = password;
  if (dependencies.length) options.dependencies = dependencies;

  try {
    await add(name, options);
    await enable(name);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
} else if (command === '--remove' && name) {
  try {
    await disable(name);
    await remove(name);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
} else if (command === '--run') {
  run(() => {
    stop(0);
  });

  const logStream = createWriteStream(process.argv[1] + '.log');

  // Here is our long running code, simply print a date/time string to
  // our log file
  setInterval(() => {
    logStream.write(new Date().toString() + '\n');
  }, 1000);
} else {
  usage();
}
