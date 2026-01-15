import { platform, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { exec as execCb } from 'node:child_process';
import { promisify, callbackify } from 'node:util';
import plist from 'plist';
import { stat, unlink, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const { build } = plist;

const exec = promisify(execCb);
const os = platform();
const rootdir = homedir();

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
		serviceWrap = require('node-gyp-build')(__dirname);
	}

	return serviceWrap;
}

async function addAsync(name, options = {}) {
	const command = options.command ?? process.execPath;
	const cwd = command ? dirname(command) : rootdir;
	const username = options.username ?? null;
	const password = options.password ?? null;

	const serviceArgs = [command];

	if (options.args) {
		serviceArgs.push(...options.args);
	}

	if (os !== 'darwin') {
		for (let i = 0; i < serviceArgs.length; i++) {
			serviceArgs[i] = `"${serviceArgs[i]}"`;
		}
	}

	const servicePath = serviceArgs.join(' ');
	const displayName = options.displayName ?? name;

	if (os === 'win32') {
		const deps = options.dependencies ? options.dependencies.join('\0') + '\0\0' : '';

		getServiceWrap().add(
			name,
			displayName,
			servicePath,
			username,
			password,
			deps
		);
	} else if (os === 'darwin') {
		const root = join(rootdir, '/Library/LaunchAgents');
		const plist = resolve(join(root, `${name}.plist`));

		const tpl = {
			Title: displayName,
			Label: name,
			ProgramArguments: serviceArgs,
			RunAtLoad: true,
			KeepAlive: true,
			WorkingDirectory: cwd
		};

		const data = build(tpl).toString();

		await mkdir(dirname(plist), {recursive: true});
		await writeFile(plist, data);
	} else {
		const runLevels = options.runLevels ?? [2, 3, 4, 5];
		const deps = options.dependencies ? options.dependencies.join(' ') : '';
		const initPath = join('/etc/init.d/', name);
		const systemPath = join('/usr/lib/systemd/system/', `${name}.service`);
		const ctlOptions = {mode: 493}; // rwxr-xr-x

		const systemdStats = await stat('/usr/lib/systemd/system', { throwIfNoEntry: false });
		const useSystemd = systemdStats !== undefined;

		if (useSystemd) {
			const systemdWantedBy = options.systemdWantedBy ?? 'multi-user.target';

			const systemUnit = linuxSystemUnit.map(line =>
				line
					.replace('##NAME##', name)
					.replace('##COMMAND##', servicePath)
					.replace('##SYSTEMD_WANTED_BY##', systemdWantedBy)
					.replace('##DEPENDENCIES##', deps)
					.replace('##CWD##', cwd)
			);

			await writeFile(systemPath, systemUnit.join('\n'), ctlOptions);

			try {
				await exec(`systemctl enable ${name}`);
			} catch (error) {
				throw new Error('systemctl failed', { cause: error });
			}
		} else {
			const startStopScript = linuxStartStopScript.map(line =>
				line
					.replace('##NAME##', name)
					.replace('##COMMAND##', servicePath)
					.replace('##RUN_LEVELS_ARR##', runLevels.join(' '))
					.replace('##RUN_LEVELS_STR##', runLevels.join(''))
					.replace('##DEPENDENCIES##', deps)
					.replace('##CWD##', cwd)
			);

			await writeFile(initPath, startStopScript.join('\n'), ctlOptions);

			try {
				await exec(`chkconfig --add ${name}`);
			} catch (error) {
				if (error.code === 'ENOENT') {
					try {
						await exec(`update-rc.d ${name} defaults`);
					} catch (updateError) {
						throw new Error('update-rc.d failed', { cause: updateError });
					}
				} else {
					throw new Error('chkconfig failed', { cause: error });
				}
			}
		}
	}
}

const addCb = callbackify(addAsync);

export function add(name, options, cb) {
	if (typeof options === 'function') {
		cb = options;
		options = {};
	}

	addCb(name, options, cb);

	return this;
}

function isStopRequested() {
	return getServiceWrap().isStopRequested();
}

async function removeAsync(name) {
	if (os === 'win32') {
		getServiceWrap().remove(name);
	} else if (os === 'darwin') {
		const root = join(rootdir, '/Library/LaunchAgents');
		const plist = resolve(join(root, `${name}.plist`));

		try {
			await unlink(plist);
		} catch (error) {
			throw new Error('launchd failed', { cause: error });
		}
	} else {
		const initPath = join('/etc/init.d/', name);
		const systemDir = '/usr/lib/systemd/system';
		const systemPath = join(systemDir, `${name}.service`);

		async function removeCtlPaths() {
			try {
				await unlink(initPath);
			} catch (error) {
				if (error.code === 'ENOENT') {
					try {
						await unlink(systemPath);
					} catch (unlinkError) {
						throw new Error(`unlink(${systemPath}) failed`, { cause: unlinkError });
					}
				} else {
					throw new Error(`unlink(${initPath}) failed`, { cause: error });
				}
			}
		}

		const systemdStats = await stat(systemDir, { throwIfNoEntry: false });
		const useSystemd = systemdStats !== undefined;

		if (useSystemd) {
			try {
				await exec(`systemctl disable ${name}`);
			} catch (error) {
				throw new Error('systemctl failed', { cause: error });
			}
			await removeCtlPaths();
		} else {
			try {
				await exec(`chkconfig --del ${name}`);
			} catch (error) {
				if (error.code === 'ENOENT') {
					try {
						await exec(`update-rc.d ${name} remove`);
					} catch (updateError) {
						throw new Error('update-rc.d failed', { cause: updateError });
					}
				} else {
					throw new Error('chkconfig failed', { cause: error });
				}
			}
			await removeCtlPaths();
		}
	}
}

export const remove = callbackify(removeAsync);

export function run(stopCallback) {
	if (!runInitialised) {
		if (os === 'win32') {
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

	if (os === 'win32') {
		getServiceWrap().run();
	}
}

export function stop(rcode) {
	if (os === 'win32') {
		getServiceWrap().stop(rcode);
	}

	process.exit(rcode || 0);
}

async function enableAsync(name) {
	if (os === 'win32') {
		clearInterval(interval);

		try {
			await exec(`net start ${name}`);
		} catch (error) {
			throw new Error('net start failed', { cause: error });
		}
	} else if (os === 'darwin') {
		const root = join(rootdir, '/Library/LaunchAgents');
		const plist = resolve(join(root, `${name}.plist`));

		await exec(`launchctl load ${plist}`);
	} else {
		const systemDir = '/usr/lib/systemd/system';

		const systemdStats = await stat(systemDir, { throwIfNoEntry: false });
		const useSystemd = systemdStats !== undefined;

		if (useSystemd) {
			try {
				await exec(`systemctl start ${name}`);
			} catch (error) {
				throw new Error('systemctl failed', { cause: error });
			}
		} else {
			try {
				await exec(`service ${name} start`);
			} catch (error) {
				throw new Error('service failed', { cause: error });
			}
		}
	}
}

export const enable = callbackify(enableAsync);

async function disableAsync(name) {
	if (os === 'win32') {
		clearInterval(interval);

		await exec(`net stop ${name}`);
	} else if (os === 'darwin') {
		const root = join(rootdir, '/Library/LaunchAgents');
		const plist = resolve(join(root, `${name}.plist`));

		await exec(`launchctl unload ${plist}`);
	} else {
		const systemDir = '/usr/lib/systemd/system';

		const systemdStats = await stat(systemDir, { throwIfNoEntry: false });
		const useSystemd = systemdStats !== undefined;

		if (useSystemd) {
			try {
				await exec(`systemctl stop ${name}`);
			} catch (error) {
				throw new Error('systemctl failed', { cause: error });
			}
		} else {
			try {
				await exec(`service ${name} stop`);
			} catch (error) {
				throw new Error('service failed', { cause: error });
			}
		}
	}
}

export const disable = callbackify(disableAsync);
