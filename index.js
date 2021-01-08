'use strict';

const child_process = require('child_process');
const fs = require('fs');
const os = require('os');

let serviceWrap;
let runInitialised = false;

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
	'Type=simple',
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

function runProcess(path, args, cb) {
	const child = child_process.spawn(path, args);

	child.on('exit', (code) => {
		if (code != 0) {
			const error = new Error(path + ' failed: ' + code);
			error.code = code;
			cb(error);
		} else {
			cb();
		}
	});

	child.on('error', (error) => {
		if (error) {
			cb(error);
		} else {
			cb();
		}
	});
}

function add(name, options, cb) {
	if (!cb) {
		cb = arguments[1];
		options = {};
	}

	const command =
		options && options.command ? options.command : process.execPath;

	const username = options ? options.username || null : null;
	const password = options ? options.password || null : null;

	const serviceArgs = [];

	serviceArgs.push(command);

	if (options && options.args) {
		for (let i = 0; i < options.args.length; i++) {
			serviceArgs.push(options.args[i]);
		}
	}

	for (let i = 0; i < serviceArgs.length; i++) {
		serviceArgs[i] = '"' + serviceArgs[i] + '"';
	}

	const servicePath = serviceArgs.join(' ');

	if (os.platform() == 'win32') {
		const displayName =
			options && options.displayName ? options.displayName : name;

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
	} else {
		let runLevels = [2, 3, 4, 5];
		if (options && options.runLevels) {
			runLevels = options.runLevels;
		}

		const deps =
			options && options.dependencies ? options.dependencies.join(' ') : '';

		const initPath = '/etc/init.d/' + name;
		const systemPath = '/usr/lib/systemd/system/' + name + '.service';
		const ctlOptions = {
			mode: 493 // rwxr-xr-x
		};

		fs.stat('/usr/lib/systemd/system', (error) => {
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

						startStopScript.push(line);
					}

					const startStopScriptStr = startStopScript.join('\n');

					fs.writeFile(initPath, startStopScriptStr, ctlOptions, (error) => {
						if (error) {
							cb(
								new Error(
									'writeFile(' + initPath + ') failed: ' + error.message
								)
							);
						} else {
							runProcess('chkconfig', ['--add', name], (error) => {
								if (error) {
									if (error.code == 'ENOENT') {
										runProcess('update-rc.d', [name, 'defaults'], (error) => {
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

				for (var i = 0; i < linuxSystemUnit.length; i++) {
					var line = linuxSystemUnit[i];

					line = line.replace('##NAME##', name);
					line = line.replace('##COMMAND##', servicePath);
					line = line.replace('##SYSTEMD_WANTED_BY##', systemdWantedBy);
					line = line.replace('##DEPENDENCIES##', deps);

					systemUnit.push(line);
				}

				const systemUnitStr = systemUnit.join('\n');

				fs.writeFile(systemPath, systemUnitStr, ctlOptions, (error) => {
					if (error) {
						cb(
							new Error(
								'writeFile(' + systemPath + ') failed: ' + error.message
							)
						);
					} else {
						runProcess('systemctl', ['enable', name], (error) => {
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
	if (os.platform() == 'win32') {
		try {
			getServiceWrap().remove(name);
			cb();
		} catch (error) {
			cb(error);
		}
	} else {
		const initPath = '/etc/init.d/' + name;
		const systemDir = '/usr/lib/systemd/system';
		const systemPath = systemDir + '/' + name + '.service';

		function removeCtlPaths() {
			fs.unlink(initPath, (error) => {
				if (error) {
					if (error.code == 'ENOENT') {
						fs.unlink(systemPath, (error) => {
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

		fs.stat(systemDir, (error) => {
			if (error) {
				if (error.code == 'ENOENT') {
					runProcess('chkconfig', ['--del', name], (error) => {
						if (error) {
							if (error.code == 'ENOENT') {
								runProcess('update-rc.d', [name, 'remove'], (error) => {
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
				runProcess('systemctl', ['disable', name], (error) => {
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
		if (os.platform() == 'win32') {
			setInterval(() => {
				if (isStopRequested()) {
					stopCallback();
				}
			}, 2000);
		} else {
			process.on('SIGINT', () => {
				stopCallback();
			});

			process.on('SIGTERM', () => {
				stopCallback();
			});
		}

		runInitialised = true;
	}

	if (os.platform() == 'win32') {
		getServiceWrap().run();
	}
}

function stop(rcode) {
	if (os.platform() == 'win32') {
		getServiceWrap().stop(rcode);
	}
	process.exit(rcode || 0);
}

exports.add = add;
exports.remove = remove;
exports.run = run;
exports.stop = stop;
