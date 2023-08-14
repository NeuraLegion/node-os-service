'use strict';

/**
 ** Change to the examples directory so this program can run as a service.
 **/
process.chdir(__dirname);

const service = require('../');
const fs = require('fs');

function usage() {
  console.log(
    'usage: node periodic-logger --add <name> [username] [password] [dep dep ...]'
  );
  console.log('       node periodic-logger --remove <name>');
  console.log('       node periodic-logger --run');
  process.exit(-1);
}

process.title = process.argv[3];

if (process.argv[2] == '--add' && process.argv.length >= 4) {
  const options = {
    args: [process.argv[1], '--run', 'me']
  };

  if (process.argv.length > 4) {
    options.username = process.argv[4];
  }

  if (process.argv.length > 5) {
    options.password = process.argv[5];
  }

  if (process.argv.length > 6) {
    options.dependencies = process.argv.splice(6);
  }

  service.add(process.argv[3], options, (error) => {
    if (error) {
      return console.error(error);
    }

    service.enable(process.argv[3], (error) => {
      if (error) {
        console.error(error);
      }
    })
  });
} else if (process.argv[2] == '--remove' && process.argv.length >= 4) {
  service.disable(process.argv[3], (error) => {
    if (error) {
      return console.error(error);
    }

    service.remove(process.argv[3], (error) => {
      if (error) {
        console.error(error);
      }
    });
  })
} else if (process.argv[2] == '--run') {
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
