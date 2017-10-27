/* eslint no-process-exit: 0 */

'use strict';

const yargs = require('yargs');
const {confirmStdin, exitError, getDeploymentInfo} = require('./helpers');
const pkg = require('../package.json');

let argv = yargs
	.option('sqs', {alias: 's', describe: 'SQS queue URL'})
	.option('messagesPerSecond', {alias: 'm', default: 100, describe: 'SQS queue messagesPerSecond'})
	.option('terminationTimeInSec', {alias: 't', default: 240, describe: 'SQS queue terminationTimeInSec'})
	.option('dlq', {alias: 'l', describe: 'SQS dead letter queue URL'})
	.option('dynamodb-attribute', {alias: 'a', describe: 'Destination dynamodb attribute value table name'})
	.option('dynamodb-definition', {alias: 'd', describe: 'Destination dynamodb attribute definition table name'})
	.option('totalEventsToProcess', {alias: 'n', default: 100, describe: 'Total number of events to process'})
	.option('plan', {alias: 'p', describe: 'Collect and print a summary and then exit', type: 'boolean'})
	.option('yes', {alias: 'y', describe: 'Ignore confirmation prompt', type: 'boolean'})
	.help().alias('h', 'help')
	.version().alias('v', 'version')
	.usage('Usage:\n  $0 -s https://sqs... -l https://sqs... -a Values -d Definitions')
	.demandOption(['sqs', 'dlq', 'dynamodb-attribute', 'dynamodb-definition'])
	.argv;

console.log(`Attriutes Events Restore tool v${pkg.version}`);
console.log('===========================================');

const {region, functionName, profile} = getDeploymentInfo();
process.env.AWS_PROFILE = profile;
const AWS = require('aws-sdk'); // load SDK here so the profile gets set
AWS.config.update({region});
const Master = require('./master');

function checkSqsPermissions() {
	return new AWS.SQS().getQueueAttributes({QueueUrl: argv.sqs}).promise().catch((err) => {
		exitError(`Could not access SQS queue "${argv.sqs}". Please check that the queue exists and that you have permission to access it.\n${err}`);
	});
}

function checkDynamodbAttributePermissions() {
	return new AWS.DynamoDB().describeTable({TableName: argv['dynamodb-attribute']}).promise().catch((err) => {
		exitError(`Could not access Dynamodb table "${argv['dynamodb-attribute']}". Please check that the table exists and that you have permission to access it.\n${err}`);
	});
}

function checkDynamodbDefinitionPermissions() {
	return new AWS.DynamoDB().describeTable({TableName: argv['dynamodb-definition']}).promise().catch((err) => {
		exitError(`Could not access Dynamodb table "${argv['dynamodb-definition']}". Please check that the table exists and that you have permission to access it.\n${err}`);
	});
}

function summary() {
	console.log('\nPlan summary');
	console.log('------------');
	console.log(`Sqs:                            ${argv.sqs}`);
	console.log(`messagesPerSecond:              ${argv.messagesPerSecond}`);
	console.log(`terminationTimeInSec:           ${argv.terminationTimeInSec}`);
	console.log(`dlq:                            ${argv.dlq}`);
	console.log(`dynamodb-attribute:             ${argv['dynamodb-attribute']}`);
	console.log(`dynamodb-definition:            ${argv['dynamodb-definition']}`);
	console.log(`Total events to process:        ${argv.totalEventsToProcess}`);
	console.log(`AWS profile:                    ${profile}`);
	console.log(`Region:                         ${region}`);
	console.log(`Worker function name:           ${functionName}`);
	console.log('');

	if (argv.plan) {
		process.exit(0);
	}

	if (argv.yes) {
		return Promise.resolve();
	}
	return confirmStdin();
}

const master = new Master({
	functionName,
	region: region,
	sqsUrl: argv.sqs,
	messagesPerSecond: argv.messagesPerSecond,
	terminationTimeInSec: argv.terminationTimeInSec,
	dlqUrl: argv.dlq,
	attributeTable: argv['dynamodb-attribute'],
	definitionTable: argv['dynamodb-definition'],
	totalEventsToProcess: argv.totalEventsToProcess,
});

function printStats() {
	for (const [name, value] of master.getStats()) {
		console.log(`${name}: ${value}`);
	}
}

// When the user presses Ctrl-C
process.on('SIGINT', function() {
	console.log('\n--- SIGINT: caught interrupt signal (Lambdas might still be running) ---');
	printStats();
	exitError('Aborted by signal.');
});

Promise.resolve()
	.then(() => checkSqsPermissions())
	.then(() => checkDynamodbAttributePermissions())
	.then(() => checkDynamodbDefinitionPermissions())
	.then(() => summary())
	.then(() => master.run())
	.then(() => printStats())
	.catch((err) => {
		exitError(err);
	});
