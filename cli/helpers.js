/* eslint no-process-exit: 0 */

'use strict';

const _ = require('lodash');

/*
 * Print message and exit with error code 1
 */
function exitError(errorMessage) {
	console.log('ERROR:', errorMessage);
	process.exit(1);
}

/*
 * Returns all S3 key prefixes in a reasonably alphabetically spread way
 * @param prefixSize - size of the hex prefix
 * @param concurrency - number of readers
 */
function getPrefixes(prefixSize, concurrency) {
	const numPrefixes = 1 << (prefixSize * 4);  // we assume hex prefixes
	const prefixes = _.map(_.range(numPrefixes), (x) => ('0'.repeat(prefixSize - 1) + x.toString(16)).substr(-prefixSize));

	const reorderedPrefixes = [];
	const chunkSize = Math.ceil(numPrefixes / concurrency);
	let start = 0;
	let i = start;
	while (reorderedPrefixes.length < numPrefixes) {
		reorderedPrefixes.push(prefixes[i]);
		i += chunkSize;
		if (i >= numPrefixes) {
			i = ++start;
		}
	}
	return reorderedPrefixes;
}

/*
 * Prints a nicely formatted log line
 * @param line - The log string to be printed
 * @param prefix - Prefix name or undefined if it's a general operation
 */
function log(line, prefix) {
	if (process.env.DISABLE_MASTER_LOG !== 'true') {
		const prefixLog = prefix ? ('[prefix ' + prefix + ']') : '';
		console.log(`[${new Date().toISOString()}]${prefixLog} ${line}`);
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
	getPrefixes, log, getDeploymentInfo, confirmStdin, exitError
};
