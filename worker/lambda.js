'use strict';

const assert = require('assert');
const BPromise = require('bluebird');
const SQSProcessor = require('@d2l/node-sqs-processor');

const lambdaHandler = require('./utils/lambda-handler-configured');
const messageHandler = require('./messageHandler');

module.exports.handler = lambdaHandler((event, context) => {
	assert(event.region, 'missing event.region');
	assert(event.sqsUrl, 'missing event.sqsUrl');
	assert(event.attributeTable, 'missing event.attributeTable');
	assert(event.definitionTable, 'missing event.definitionTable');
	assert(event.ratePerSecond, 'missing event.ratePerSecond');
	assert(event.terminationTimeInSec, 'missing event.terminationTimeInSec');

	context.log.info({ queue: event.sqsUrl, attributeTable: event.attributeTable, definitionTable: event.definitionTable }, 'starting restore message from queue to dynamodb tables.');

	const startedWorkerTasks = [];
	let totalMessagesProcessed = 0;
	let totalMessagesSucceeded = 0;
	let totalMessagesFailed = 0;
	let processor;
	const terminationTime = event.terminationTimeInSec * 1000;

	const cleanup = function() {
		context.log.debug('waiting for all the tasks to be finished');
		return BPromise
			.all(startedWorkerTasks)
			.then(() => processor._deleteMessages());
	};

	return new BPromise((resolve, reject) => {
		processor = new SQSProcessor({
			queueUrl: event.sqsUrl,
			region: event.region,
			messagesPerSecond: event.ratePerSecond
		}).on('error', err => {
			// TODO: Right now that's the only way to identify this error
			if (err.message === 'Failed to receive messages') {
				context.metricCollector.addCountMetric('sqsProcessorReceiveFailure', 1);
			} else {
				context.log.error({ err }, 'failed to process messages');
				err._logged = true; // eslint-disable-line no-param-reassign

				processor.stop();
				reject(err);
			}
		}).on('stopped', () => {
			context.log.info({ url: event.sqsUrl }, 'Stopped processing queue');
			resolve();
		}).on('empty', () => {
			context.log.info({ url: event.sqsUrl }, 'Queue is empty');
		}).on('data', message => {
			const workerTaskP = messageHandler(context, message)
				.then(result => {
					if (result) {
						message.delete();
						totalMessagesSucceeded++;
					} else {
						totalMessagesFailed++;
					}
					totalMessagesProcessed++;
				});

			startedWorkerTasks.push(workerTaskP);
		}).on('stats', stats => {
			context.log.info({ url: event.sqsUrl, stats }, 'SQS Processor stats');
			if (context.getRemainingTimeInMillis() < terminationTime) {
				processor.stop();
			}
		});

		processor.start();
	})
	.finally(() => cleanup())
	.then(() => {
		context.log.info({
				totalMessagesProcessed,
				totalMessagesSucceeded,
				totalMessagesFailed
			}, 'Succesfully processed messages on the queue');
		return {
			processedMessages: totalMessagesProcessed,
			successfullyRestoredMessages: totalMessagesSucceeded,
			failedMessages: totalMessagesFailed,
			continuationToken: nextContinuationToken
		};
	});

});
