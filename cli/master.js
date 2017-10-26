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

const MAX_INVOCATION_NUM = 50; // set the max invocation number to invoke lambda for one cli command

class Master {
	constructor({functionName, region, sqsUrl, messagesPerSecond, terminationTimeInSec, dlqUrl, attributeTable, definitionTable, totalEventsToProcess}) {
		this._functionName = functionName;
		this._region = region;
		this._sqsUrl = sqsUrl;
		this._messagesPerSecond = messagesPerSecond;
		this._terminationTimeInSec = terminationTimeInSec;
		this._dlqUrl = dlqUrl;
		this._attributeTable = attributeTable;
		this._definitionTable = definitionTable;
		this._totalEventsToProcess = totalEventsToProcess;

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
		return payload.body.processedEvents;
	}

	_processEvent(eventsToProcess) {
		const recursePages = (invocationNum) => {
			log('starting invocation #' + invocationNum);
			const invokeRequest = lambda.invoke({
				FunctionName: this._functionName,
				Payload: JSON.stringify({
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
				const processedEvents = this._processLambdaResult(data, invocationNum, invokeRequest.response.requestId);
				eventsToProcess = eventsToProcess - processedEvents;
				log(`invocation #${invocationNum} - ${eventsToProcess} events left)`);

				if (eventsToProcess > 0 && invocationNum <= MAX_INVOCATION_NUM) {
					return recursePages(invocationNum + 1);
				}
				return Promise.resolve();
			});
		};
		return recursePages(1);
	}

	run() {
		log('Restore events started');
		this._executionStartTime = new Date();

		return this._processEvent(this._totalEventsToProcess)
			.then(() => log('Restore events completed'));
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
