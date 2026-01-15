'use strict';

/**
 ** Change to the examples directory so this program can run as a service.
 **/
process.chdir(__dirname);

const service = require('../');
const fs = require('node:fs');

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
    args: [process.argv[1], '--run', 'me']
  };

  const [username, password, ...dependencies] = rest;

  if (username) options.username = username;
  if (password) options.password = password;
  if (dependencies.length) options.dependencies = dependencies;

  service.add(name, options, (error) => {
    if (error) {
      return console.error(error);
    }

    service.enable(name, (error) => {
      if (error) {
        console.error(error);
      }
    });
  });
} else if (command === '--remove' && name) {
  service.disable(name, (error) => {
    if (error) {
      return console.error(error);
    }

    service.remove(name, (error) => {
      if (error) {
        console.error(error);
      }
    });
  });
} else if (command === '--run') {
  service.run(() => {
    service.stop(0);
  });

  const logStream = fs.createWriteStream(process.argv[1] + '.log');

  // Here is our long running code, simply print a date/time string to
  // our log file
  setInterval(() => {
    logStream.write(new Date().toString() + '\n');
  }, 1000);
} else {
  usage();
}
