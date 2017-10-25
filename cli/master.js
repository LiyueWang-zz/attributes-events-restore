'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk'); // load SDK here so the profile gets set

const lambda = new AWS.Lambda();
const sumEntries = [
	['processedBatches', 'Total S3 objects read'],
	['processedEvents', 'Total events read'],
	['successfullySentEvents', 'Total successfully re-played events'],
	['failedEvents', 'Total failed (and retried) SQS sends']
];

class Master {
	constructor({functionName, region, sqsUrl, attributeTable, definitionTable, concurrency}) {
		this._functionName = functionName;
		this._region = region;
		this._sqsUrl = sqsUrl;
		this._attributeTable = attributeTable;
		this._definitionTable = definitionTable;
		this._concurrency = concurrency;

		this._sums = new Map(sumEntries.map(([entry]) => [entry, 0]));
		this._totalBilledLambdaTime = 0;
	}

	_processLambdaResult(data, invocationNum, requestId) {
		const logTail = Buffer.from(data.LogResult, 'base64').toString();
		const reportRegex = /REPORT RequestId: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+Duration: ([0-9.]+) ms\s+Billed Duration: ([0-9]+) ms\s+Memory Size: (\d+) MB\s+Max Memory Used: (\d+) MB\s+$/;
		const parsedLog = reportRegex.exec(logTail);
		const executionTime = parsedLog[2] / 1000;
		this._totalBilledLambdaTime += parsedLog[3] / 1000;
		const maxMemory = parsedLog[5];

		const payload = JSON.parse(data.Payload);

		if (data.FunctionError) {
			log(`invocation #${invocationNum} returned with error - request ID: ${requestId}, time: ${executionTime.toFixed(2)} s, max memory: ${maxMemory} MB`);
			// print the error and data for more context:
			console.log(JSON.stringify(payload, null, 4));
			console.log(JSON.stringify(data));
			throw new Error('Aborting due to Lambda error');
		}

		log(`invocation #${invocationNum} returned - S3 objects: ${payload.processedBatches}, processed events: ${payload.processedEvents}, sent events: ${payload.successfullySentEvents}, SQS failures: ${payload.failedEvents}, time: ${executionTime.toFixed(2)} s, max memory: ${maxMemory} MB`);
		return payload.continuationToken;
	}

	_processPrefix(prefix) {
		const recursePages = (continuationToken, invocationNum) => {
			log('starting invocation #' + invocationNum);
			const invokeRequest = lambda.invoke({
				FunctionName: this._functionName,
				Payload: JSON.stringify({
					continuationToken,
					region: this._region,
					sqsUrl: this._sqsUrl,
					attributeTable: this._attributeTable,
					definitionTable: this._definitionTable
				}),
				LogType: 'Tail',
			});
			return invokeRequest.promise().then((data) => {
				const nextContinuationToken = this._processLambdaResult(data, invocationNum, invokeRequest.response.requestId);
				if (nextContinuationToken) {
					return recursePages(nextContinuationToken, invocationNum + 1);
				}
				return Promise.resolve();
			});
		};
		return recursePages(undefined, 1);
	}

	run() {
		log('Restore master started');
		this._executionStartTime = new Date();

		let counter = 0;
		return Promise.map(prefixes, (prefix) => {
			return this._processMessage(prefix).then(() => {
				counter++;
				log(`done processing prefix (${prefixes.length - counter} left)`, prefix);
			});
		}, {concurrency: this._concurrency})
			.then(() => log('Refire master completed'));
	}

	getStats() {
		const stats = [];
		for (const [entry, title] of sumEntries) {
			stats.push([title, this._sums.get(entry)]);
		}
		stats.push(['Total billed Lambda time', `${(this._totalBilledLambdaTime / 60).toFixed(2)} minutes`]);
		const wallClockMinutes = (new Date() - this._executionStartTime) / 1000 / 60;
		stats.push(['Wall-clock time', `${wallClockMinutes.toFixed(2)} minutes`]);

		return stats;
	}
}

module.exports = Master;
