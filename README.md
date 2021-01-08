# os-service

This module implements the ability to run a [Node.js][nodejs] based JavaScript
program as a native Windows or Linux service.

This module is installed using [node package manager (npm)][npm]:

```bash
# This module contains C++ source code which will be compiled
# during installation on Windows platforms using node-gyp.  A
# suitable build chain must be configured on Windows platforms
# before installation.

npm i @neuralegion/os-service
```

It is loaded using the `require()` function:

```js
const service = require('@neuralegion/os-service');
```

A program can then be added, removed and run as a service:

```js
service.add('my-service');

service.remove('my-service');

service.run(() => {
  // Stop request received (i.e. a kill signal on Linux or from the
  // Service Control Manager on Windows), so let's stop!
  service.stop();
});
```

[nodejs]: http://nodejs.org 'Node.js'
[npm]: https://npmjs.org/ 'npm'

# Batch Service Creation

Two approaches can be taken when adding and removing services.

In the first approach a program can be responsible for adding, removing and
starting itself as a service. This is typically achieved by supporting
program arguments such as `--add`, `--remove`, and `--run`, and executing the
appropriate action.

The following example adds the calling program as a service when called
with a `--add` parameter, and removes the created service when called with a
`--remove` parameter:

```js
if (process.argv[2] == '--add') {
  service.add('my-service', { args: [process.argv[1], '--run'] }, (error) => {
    if (error) {
      console.trace(error);
    }
  });
} else if (process.argv[2] == '--remove') {
  service.remove('my-service', (error) => {
    if (error) {
      console.trace(error);
    }
  });
} else if (process.argv[2] == '--run') {
  service.run(() => service.stop(0));

  // Run service program code...
} else {
  // Show usage...
}
```

Note the `--run` argument passed in the `options` parameter to the
`service.add()` function. When the service is started using the Windows
Service Control Manager, or the Linux service management facilities, the first
argument to the program will be `--run`. The above program checks for this and
if specified runs as a service using the `service.run()` function.

Also note that neither the node binary or the programs fully qualified path
are specified. These parameters are automatically calculated it not
specified. Refer to the `service.add()` function description for details
about how this works.

In the second approach a dedicated service management program can be
responsible for adding and removing many services in batch. The program
adding and removing services is not a service itself, and would never call
the `service.run()` function.

The following example adds or removes number of services:

```js
if (program.argv[2] == '--add') {
  service.add('service1', { args: ['c:examplesvc1.js'] }, (error) => {
    if (error) {
      console.trace(error);
    } else {
      service.add('service2', { args: 'c:examplesvc2.js' }, (error) => {
        if (error) {
          console.trace(error);
        }
      });
    }
  });
} else {
  service.remove('service2', (error) => {
    if (error) {
      console.trace(error);
    } else {
      service.remove('service1', (error) => {
        if (error) {
          console.trace(error);
        }
      });
    }
  });
}
```

Note that unlike the previous example the `--run` argument is not passed in
the `options` parameter to the `service.add()` function. Since each service
program does not add or remove itself as a service it only needs to run, and
as such does not need to be told to so.

Also note that the `programPath` argument is passed in the options parameter
to the `service.add()` function, to specify the fully qualified path to each
service program - which would otherwise default to the service management
program adding the services.

Each of the service programs can simply start themselves as services using the
following code:

```js
service.run(() => service.stop(0));

// Run service program code...
```

# Running Service Programs

When a service program starts it can always call the `service.run()` function
regardless of whether it is started at the console, by the Windows Service
Control Manager, or the Linux service management facilities.

On Windows, when the `service.run()` function is called this module will
attempt to connect to the Windows Service Control Manager so that control
requests can be received - so that the service can be stopped. When starting a
program at the console an attempt to connect to the Windows Service Control
Manager will fail. In this case the `service.run()` function will assume the
program is running at the console and silently ignore this error.

On Linux, services started at the console will run in the foreground, this
allows command sequences such as `CTRL+C` to be used, e.g. during development.
When Linux services are started using the Linux service management facilities,
i.e. `service my-service start`, they can be stopped using the signals `SIGINT`
and `SIGTERM`, or again using the Linux service management facilities, i.e.
`service my-service stop`.

This behaviour results in a program which can be run either at the console, the
Windows Service Control Manager, or the Linux service management facilities
with no change.

# Current Working Directory

Upon starting the current working directory of a service program will be
platform specific, e.g. the `"%windir%\system32"` directory on Windows.
Service programs need to consider this when working with relative directory and
file paths.

This path will most likely be different when running the same program at the
console, so a service program may wish to change the current working
directory to a more suitable location using the `process.chdir()` function to
avoid different behaviour between the two methods of starting a program.

# Using This Module

This module attempts to behave in exactly the same way on Windows and Linux
platforms - at least the API is exactly the same for both platforms both from
a service management and service running perspective.

On Windows platforms the Windows Service Control Manager WIN32 API is used to
manage services. On Linux platforms a `systemd` unit is created if it is
available, otherwise the `chkconfig` command is used. If `chkconfig` is not
available the `update-rc.d` command is tried instead.

## service.add (name, [options], cb)

The `add()` function adds a service.

The `name` parameter specifies the name of the created service. The optional
`options` parameter is an object, and can contain the following items:

- `displayName` - The services display name, defaults to the `name` parameter
   - this parameter will be used on Windows platforms only
- `command` - The command used to run the service (i.e. `c:\Program Files\nodejs\node.exe`,
  defaults to the value of `process.execPath`
- `args` - An array of strings specifying parameters, defaults to `[]`
- `runLevels` - An array of numbers specifying Linux run-levels at which
  the service should be started for Linux platforms, defaults to
  `[2, 3, 4, 5]`, this is only used when `chkconfig` or `update-rc.d` is used
  to install a service
- `username` - For Windows platforms a username and password can be specified,
  the service will be run using these credentials when started, see the
  `CreateService()` functions [win32 API documentation][createservice] for
  details on the format of the username, on all other platforms this parameter
  is ignored
- `password` - See the `username` parameter
- `systemdWantedBy` - For when systemd will be used a target can be specified
  for the `WantedBy` attribute under the `[Install]` section in the generated
  systemd unit file, defaults to `multi-user.target`
- `dependencies` - An array of strings specifying other services this service
  depends on, this is optional

[createservice]: https://msdn.microsoft.com/en-us/library/windows/desktop/ms682450(v=vs.85).aspx 'CreateService()'

The service will be set to automatically start at boot time, but not started.
The service can be started using the `net start "my-service"` command on
Windows and `service my-service start` on Linux.

The `cb` callback function is called once the service has been added. The
following arguments will be passed to the callback function:

- `error` - Instance of the `Error` class, or `null` if no error occurred

The following example installs a service named `my-service`, it explicitly
specifies the services display name, and specifies a number of parameters to
the program:

```js
const options = {
  displayName: 'MyService',
  args: [process.argv[1], '--server-port', 8888],
  username: '.Stephen Vickers',
  password: 'MyPassword :)'
};

service.add('my-service', options, (error) => {
  if (error) {
    console.trace(error);
  }
});
```

## service.remove (name, cb)

The `remove()` function removes a service.

The `name` parameter specifies the name of the service to remove. This will
be the same `name` parameter specified when adding the service.

The service must be in a stopped state for it to be removed. The
`net stop "my-service"` command can be used to stop the service on Windows and
the `service my-service stop` on Linux before it is to be removed.

The `cb` callback function is called once the service has been removed. The
following arguments will be passed to the callback function:

- `error` - Instance of the `Error` class, or `null` if no error occurred

The following example removes the service named `my-service`:

```js
service.remove('my-service', (error) => {
  if (error) {
    console.trace(error);
  }
});
```

## service.run (callback)

The `run()` function will attempt to run the program as a service.

**NOTE** When run the service will NOT make any changes to the `process.stdout`
and `process.stderr` streams. Users are required to utilise whatever logging
modules they require to managing process logging and its destination. Older
versions of this module (versions before 2.0.0) would support re-directing
these streams to a specific writeable stream, support for that was removed in
version 2.0.0.

The `callback` function will be called when the service receives a stop request,
e.g. because the Windows Service Controller was used to send a stop request to
the service, or a `SIGTERM` signal was received.

The program should perform cleanup tasks and then call the `service.stop()`
function.

The following example starts a program as a service:

```js
service.run(() => service.stop(0));
```

## service.stop ([rcode])

The `stop()` function will cause the service to stop, and the calling program
to exit.

Once the service has been stopped this function will terminate the program by
calling the `process.exit()` function, passing to it the `rcode` parameter
which defaults to `0`. Before calling this function ensure the program has
finished performing cleanup tasks.

**BE AWARE, THIS FUNCTION WILL NOT RETURN.**

The following example stops the calling program specifying a return code of
`0`, the function will not return:

```js
service.run(() => service.stop(0));
```

# Example Programs

Example programs are included under the modules `example` directory.

# License

Copyright (c) 2021 NeuraLegion <artem.derevnjuk@neuralegion.com>

Copyright (c) 2018 NoSpaceships Ltd <hello@nospaceships.com>

Copyright (c) 2014 Stephen Vickers <stephen.vickers.sv@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
