'use strict';

const os = require('os');
const {join, resolve, dirname} = require('path')
const {exec} = require('child_process')
const {build} = require('plist')
const {stat, unlink, exists, mkdir, writeFile} = require('fs')

const platform = os.platform();
const homedir = os.homedir();

let serviceWrap;
let runInitialised = false;
let interval;

const linuxStartStopScript = [
	'#!/bin/bash',
	'',
	'### BEGIN INIT INFO',
	'# Provides:          ##NAME##',
	'# Required-Start:    ##DEPENDENCIES##',
	'# Required-Stop:     ',
	'# Default-Start:     ##RUN_LEVELS_ARR##',
	'# Default-Stop:      0 1 6',
	'# Short-Description: Start ##NAME## at boot time',
	'# Description:       Enable ##NAME## service.',
	'### END INIT INFO',
	'',
	'# chkconfig:   ##RUN_LEVELS_STR## 99 1',
	'# description: ##NAME##',
	'',
	'umask 0007',
	'pidfile="/var/run/##NAME##.pid"',
	'',
	'set_pid () {',
	'	unset PID',
	'	_PID=`head -1 $pidfile 2>/dev/null`',
	'	if [ $_PID ]; then',
	'		kill -0 $_PID 2>/dev/null && PID=$_PID',
	'	fi',
	'}',
	'',
	'force_reload () {',
	'	stop',
	'	start',
	'}',
	'',
	'restart () {',
	'	stop',
	'	start',
	'}',
	'',
	'start () {',
	'	CNT=5',
	'',
	'	set_pid',
	'',
	'	if [ -z "$PID" ]; then',
	'		echo starting ##NAME##',
	'',
	'		##COMMAND## >/dev/null 2>&1 &',
	'',
	'		echo $! > $pidfile',
	'',
	'		while [ : ]; do',
	'			set_pid',
	'',
	'			if [ -n "$PID" ]; then',
	'				echo started ##NAME##',
	'				break',
	'			else',
	'				if [ $CNT -gt 0 ]; then',
	'					sleep 1',
	'					CNT=`expr $CNT - 1`',
	'				else',
	'					echo ERROR - failed to start ##NAME##',
	'					break',
	'				fi',
	'			fi',
	'		done',
	'	else',
	'		echo ##NAME## is already started',
	'	fi',
	'}',
	'',
	'status () {',
	'	set_pid',
	'',
	'	if [ -z "$PID" ]; then',
	'		exit 1',
	'	else',
	'		exit 0',
	'	fi',
	'}',
	'',
	'stop () {',
	'	CNT=5',
	'',
	'	set_pid',
	'',
	'	if [ -n "$PID" ]; then',
	'		echo stopping ##NAME##',
	'',
	'		kill $PID',
	'',
	'		while [ : ]; do',
	'			set_pid',
	'',
	'			if [ -z "$PID" ]; then',
	'				rm $pidfile',
	'				echo stopped ##NAME##',
	'				break',
	'			else',
	'				if [ $CNT -gt 0 ]; then',
	'					sleep 1',
	'					CNT=`expr $CNT - 1`',
	'				else',
	'					echo ERROR - failed to stop ##NAME##',
	'					break',
	'				fi',
	'			fi',
	'		done',
	'	else',
	'		echo ##NAME## is already stopped',
	'	fi',
	'}',
	'',
	'case $1 in',
	'	force-reload)',
	'		force_reload',
	'		;;',
	'	restart)',
	'		restart',
	'		;;',
	'	start)',
	'		start',
	'		;;',
	'	status)',
	'		status',
	'		;;',
	'	stop)',
	'		stop',
	'		;;',
	'	*)',
	'		echo "usage: $0 <force-reload|restart|start|status|stop>"',
	'		exit 1',
	'		;;',
	'esac'
];

const linuxSystemUnit = [
	'[Unit]',
	'Description=##NAME##',
	'After=network.target',
	'Requires=##DEPENDENCIES##',
	'',
	'[Service]',
	'WorkingDirectory=##CWD##',
	'Restart=always',
	'StandardOutput=null',
	'StandardError=null',
	'UMask=0007',
	'ExecStart=##COMMAND##',
	'',
	'[Install]',
	'WantedBy=##SYSTEMD_WANTED_BY##'
];

function getServiceWrap() {
	if (!serviceWrap) {
		serviceWrap = require('./build/Release/service');
	}

	return serviceWrap;
}

function add(name, options, cb) {
	if (!cb) {
		cb = arguments[1];
		options = {};
	}

	const command =
		options && options.command ? options.command : process.execPath;

	const cwd = command ? dirname(command) : homedir

	const username = options ? options.username || null : null;
	const password = options ? options.password || null : null;

	const serviceArgs = [];

	serviceArgs.push(command);

	if (options && options.args) {
		for (let i = 0; i < options.args.length; i++) {
			serviceArgs.push(options.args[i]);
		}
	}

	if (platform !== 'darwin') {
		for (let i = 0; i < serviceArgs.length; i++) {
			serviceArgs[i] = '"' + serviceArgs[i] + '"';
		}
	}

	const servicePath = serviceArgs.join(' ');
	const displayName =
		options && options.displayName ? options.displayName : name;

	if (platform == 'win32') {
		const deps = options.dependencies ? options.dependencies.join('\0') + '\0\0' : '';

		try {
			getServiceWrap().add(
				name,
				displayName,
				servicePath,
				username,
				password,
				deps
			);
			cb();
		} catch (error) {
			cb(error);
		}
	} else if (platform == 'darwin') {
		const root = join(homedir, '/Library/LaunchAgents')
		const plist = resolve(join(root, name + '.plist'))

		const tpl = {
			Title: displayName,
			Label: name,
			ProgramArguments: serviceArgs,
			RunAtLoad: true,
			KeepAlive: true,
			WorkingDirectory: cwd
		}

		const data = build(tpl).toString();

		const createPlist = function (path, data, cb) {
			writeFile(path, data, function (err) {
				if (err) {
					return cb(err);
				}

				cb();
			});
		}

		exists(dirname(plist), function (exists) {
			if (!exists) {
				mkdir(dirname(plist), {recursive: true}, function (err) {
					if (err) {
						return cb(err);
					}

					createPlist(plist, data, cb);
				})
			} else {
				createPlist(plist, data, cb);
			}
		});
	} else {
		let runLevels = [2, 3, 4, 5];
		if (options && options.runLevels) {
			runLevels = options.runLevels;
		}

		const deps =
			options && options.dependencies ? options.dependencies.join(' ') : '';

		const initPath = join('/etc/init.d/', name);
		const systemPath = join('/usr/lib/systemd/system/', + name + '.service');
		const ctlOptions = {
			mode: 493 // rwxr-xr-x
		};

		stat('/usr/lib/systemd/system', function (error) {
			if (error) {
				if (error.code == 'ENOENT') {
					const startStopScript = [];

					for (let i = 0; i < linuxStartStopScript.length; i++) {
						let line = linuxStartStopScript[i];

						line = line.replace('##NAME##', name);
						line = line.replace('##COMMAND##', servicePath);
						line = line.replace('##RUN_LEVELS_ARR##', runLevels.join(' '));
						line = line.replace('##RUN_LEVELS_STR##', runLevels.join(''));
						line = line.replace('##DEPENDENCIES##', deps);
						line = line.replace('##CWD##', cwd);

						startStopScript.push(line);
					}

					const startStopScriptStr = startStopScript.join('\n');

					writeFile(initPath, startStopScriptStr, ctlOptions, function (error) {
						if (error) {
							cb(
								new Error(
									'writeFile(' + initPath + ') failed: ' + error.message
								)
							);
						} else {
							exec('chkconfig --add ' + name, function (error) {
								if (error) {
									if (error.code == 'ENOENT') {
										exec('update-rc.d ' + name + ' defaults', function (error) {
											if (error) {
												cb(new Error('update-rd.d failed: ' + error.message));
											} else {
												cb();
											}
										});
									} else {
										cb(new Error('chkconfig failed: ' + error.message));
									}
								} else {
									cb();
								}
							});
						}
					});
				} else {
					cb(
						new Error('stat(/usr/lib/systemd/system) failed: ' + error.message)
					);
				}
			} else {
				const systemUnit = [];

				let systemdWantedBy = 'multi-user.target';
				if (options && options.systemdWantedBy) {
					systemdWantedBy = options.systemdWantedBy;
				}

				for (let i = 0; i < linuxSystemUnit.length; i++) {
					let line = linuxSystemUnit[i]

					line = line.replace('##NAME##', name);
					line = line.replace('##COMMAND##', servicePath);
					line = line.replace('##SYSTEMD_WANTED_BY##', systemdWantedBy);
					line = line.replace('##DEPENDENCIES##', deps);
					line = line.replace('##CWD##', cwd);

					systemUnit.push(line);
				}

				const systemUnitStr = systemUnit.join('\n');

				writeFile(systemPath, systemUnitStr, ctlOptions, function (error) {
					if (error) {
						cb(
							new Error(
								'writeFile(' + systemPath + ') failed: ' + error.message
							)
						);
					} else {
						exec('systemctl enable ' + name, function (error) {
							if (error) {
								cb(new Error('systemctl failed: ' + error.message));
							} else {
								cb();
							}
						});
					}
				});
			}
		});
	}

	return this;
}

function isStopRequested() {
	return getServiceWrap().isStopRequested();
}

function remove(name, cb) {
	if (platform == 'win32') {
		try {
			getServiceWrap().remove(name);
			cb();
		} catch (error) {
			cb(error);
		}
	} else if (platform == 'darwin') {
		const root = join(homedir, '/Library/LaunchAgents')
		const plist = resolve(join(root, name + '.plist'))

		unlink(plist, function (error) {
			if (error) {
				cb(new Error('launchd failed: ' + error.message));
			}

			cb();
		});
	} else {
		const initPath = join('/etc/init.d/', name);
		const systemDir = '/usr/lib/systemd/system';
		const systemPath = join(systemDir, name + '.service');

		function removeCtlPaths() {
			unlink(initPath, function (error) {
				if (error) {
					if (error.code == 'ENOENT') {
						unlink(systemPath, function (error) {
							if (error) {
								cb(
									new Error(
										'unlink(' + systemPath + ') failed: ' + error.message
									)
								);
							} else {
								cb();
							}
						});
					} else {
						cb(new Error('unlink(' + initPath + ') failed: ' + error.message));
					}
				} else {
					cb();
				}
			});
		}

		stat(systemDir, function (error) {
			if (error) {
				if (error.code == 'ENOENT') {
					exec('chkconfig --del ' + name, function (error) {
						if (error) {
							if (error.code == 'ENOENT') {
								exec('update-rc.d ' + name + ' remove', function (error) {
									if (error) {
										cb(new Error('update-rc.d failed: ' + error.message));
									} else {
										removeCtlPaths();
									}
								});
							} else {
								cb(new Error('chkconfig failed: ' + error.message));
							}
						} else {
							removeCtlPaths();
						}
					});
				} else {
					cb(new Error('stat(' + systemDir + ') failed: ' + error.message));
				}
			} else {
				exec('systemctl disable ' + name, function (error) {
					if (error) {
						cb(new Error('systemctl failed: ' + error.message));
					} else {
						removeCtlPaths();
					}
				});
			}
		});
	}
}

function run(stopCallback) {
	if (!runInitialised) {
		if (platform == 'win32') {
			interval = setInterval(function () {
				if (isStopRequested()) {
					stopCallback();
				}
			}, 2000);
		} else {
			process.once('SIGINT', function () {
				stopCallback();
			});

			process.once('SIGTERM', function () {
				stopCallback();
			});
		}

		runInitialised = true;
	}

	if (platform == 'win32') {
		getServiceWrap().run();
	}
}

function stop(rcode) {
	if (platform == 'win32') {
		getServiceWrap().stop(rcode);
	}

	process.exit(rcode || 0);
}

function enable(name, cb) {
	if (platform == 'win32') {
		clearInterval(interval);

		exec('net start ' + name, {}, function (err) {
			if (err) {
				return cb(new Error('net start failed: ' + err.message))
			}

			cb();
		});
	} else if (platform == 'darwin') {
		const root = join(homedir, '/Library/LaunchAgents')
		const plist = resolve(join(root, name + '.plist'))

		exec('launchctl load ' + plist, {}, function (err) {
			if (err) {
				return cb(err)
			}

			cb();
		});
	} else {
		const systemDir = '/usr/lib/systemd/system';

		stat(systemDir, function (error) {
			if (error) {
				if (error.code == 'ENOENT') {
					exec('service ' + name + ' start', function (error) {
						if (error) {
							cb(new Error('service failed: ' + error.message));
						}

						cb();
					});
				} else {
					cb(new Error('stat(' + systemDir + ') failed: ' + error.message));
				}
			} else {
				exec('systemctl start ' + name, function (error) {
					if (error) {
						cb(new Error('systemctl failed: ' + error.message));
					}

					cb();
				});
			}
		});
	}
}

function disable(name, cb) {
	if (platform == 'win32') {
		clearInterval(interval);

		exec('net stop ' + name, {}, function (err) {
			if (err) {
				return cb(err)
			}

			cb();
		});
	} else if (platform == 'darwin') {
		const root = join(homedir, '/Library/LaunchAgents')
		const plist = resolve(join(root, name + '.plist'))

		exec('launchctl unload ' + plist, {}, function (err) {
			if (err) {
				return cb(err)
			}

			cb();
		});
	} else {
		const systemDir = '/usr/lib/systemd/system';

		stat(systemDir, function (error) {
			if (error) {
				if (error.code == 'ENOENT') {
					exec('service ' + name + ' stop', function (error) {
						if (error) {
							cb(new Error('service failed: ' + error.message));
						}

						cb();
					});
				} else {
					cb(new Error('stat(' + systemDir + ') failed: ' + error.message));
				}
			} else {
				exec('systemctl disable ' + name, function (error) {
					if (error) {
						cb(new Error('systemctl failed: ' + error.message));
					}

					cb();
				});
			}
		});
	}
}

exports.add = add;
exports.remove = remove;
exports.run = run;
exports.stop = stop;
exports.enable = enable;
exports.disable = disable;
