'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk'); // load SDK here so the profile gets set

const {log} = require('./helpers');

const lambda = new AWS.Lambda();
const sumEntries = [
	['processedEvents', 'Total events read'],
	['successfullyProcessedEvents', 'Total successfully processed events (restored or forwarded to dlq)'],
	['failedEvents', 'Total failed SQS receives']
];

class Master {
	constructor({functionName, region, sqsUrl, messagesPerSecond, terminationTimeInSec, dlqUrl, attributeTable, definitionTable, concurrency}) {
		this._functionName = functionName;
		this._region = region;
		this._sqsUrl = sqsUrl;
		this._messagesPerSecond = messagesPerSecond;
		this._terminationTimeInSec = terminationTimeInSec;
		this._dlqUrl = dlqUrl;
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
			console.log(JSON.stringify(payload, null, 4));
			console.log(JSON.stringify(data));
			throw new Error('Aborting due to Lambda error');
		}

		for (const [entry, ] of sumEntries) {
			this._sums.set(entry, this._sums.get(entry) + payload.body[entry]);
		}
		log(`invocation #${invocationNum} returned - processed events: ${payload.body.processedEvents}, restored events: ${payload.body.successfullyProcessedEvents}, SQS failures: ${payload.body.failedEvents}, time: ${executionTime.toFixed(2)} s, max memory: ${maxMemory} MB`);
		return payload.body.continuationToken;
	}

	_processEvent() {
		const recursePages = (continuationToken, invocationNum) => {
			log('starting invocation #' + invocationNum);
			const invokeRequest = lambda.invoke({
				FunctionName: this._functionName,
				Payload: JSON.stringify({
					// continuationToken,
					region: this._region,
					sqsUrl: this._sqsUrl,
					messagesPerSecond: this._messagesPerSecond,
					terminationTimeInSec: this._terminationTimeInSec,
					dlqUrl: this._dlqUrl,
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

		const workers = new Array(this._concurrency).fill('worker');
		let counter = 0;
		return Promise.map(workers, (worker) => {
			return this._processEvent(worker).then(() => {
				counter++;
				log(`done processing worker (${workers.length - counter} left)`, counter);
			});
		}, {concurrency: this._concurrency})
			.then(() => log('Restore master completed'));
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
