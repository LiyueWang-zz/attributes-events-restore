/* eslint no-process-exit: 0 */

'use strict';

/*
 * Print message and exit with error code 1
 */
function exitError(errorMessage) {
	console.log('ERROR:', errorMessage);
	process.exit(1);
}

/*
 * Prints a nicely formatted log line
 * @param line - The log string to be printed
 * @param worker - worker number or undefined if it's a general operation
 */
function log(line, worker) {
	if (process.env.DISABLE_MASTER_LOG !== 'true') {
		const workerLog = worker ? ('[worker ' + worker + ']') : '';
		console.log(`[${new Date().toISOString()}]${workerLog} ${line}`);
	}
}

/*
 * Read in Serverless deployment information from disk
 */
function getDeploymentInfo() {
	let region, functionName, profile;
	try {
		const workerServerlessState = require('../worker/.serverless/serverless-state.json');
		const provider = workerServerlessState.service.provider;
		region = provider.region;
		profile = provider.profile;
		functionName = provider.compiledCloudFormationTemplate.Resources.WorkerLambdaFunction.Properties.FunctionName;
	} catch (err) {
		exitError('Error loading deployment information. Please make sure your service is deployed with "npm run deploy".\n');
	}
	return {region, functionName, profile};
}

/*
 * Asks for confirmation to continue via stdin
 */
function confirmStdin() {
	process.stderr.write('Would you like to continue? (y/N) ');
	return new Promise((resolve) => {
		const stdin = process.openStdin();
		stdin.addListener('data', (data) => {
			console.log();
			const input = data.toString().trim().toLowerCase() || 'n';
			if (input === 'y') {
				stdin.pause();
				resolve();
			} else if (input === 'n') {
				console.log('Operation aborted by user');
				process.exit(0);
			} else {
				exitError('Invalid stdin response');
			}
		});
	});
}

module.exports = {
	log, getDeploymentInfo, confirmStdin, exitError
};
