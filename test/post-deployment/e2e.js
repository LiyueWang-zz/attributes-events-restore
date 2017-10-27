'use strict';

const Promise = require('bluebird'),
	shjs = require('shelljs'),
	exec = shjs.exec,
	// _ = require('lodash'),
	expect = require('chai').expect,
	nodeTestingHelpers = require('@d2l/node-testing-helpers'),
	serverlessOutput = require('../../worker/serverless-info.json'),
	ValueModel = require('../../worker/models/valueModel'),
	sqsHelper = new nodeTestingHelpers.aws.SqsHelper(serverlessOutput.info.region, serverlessOutput.outputs.EventsRestoreQueueUrl);

const {confirmStdin, exitError, getDeploymentInfo} = require('../../cli/helpers');
const {region, functionName, profile} = getDeploymentInfo();
process.env.AWS_PROFILE = profile;
const AWS = require('aws-sdk'); // load SDK here so the profile gets set
AWS.config.update({region});

const sqsClient = new AWS.SQS({ apiVersion: '2012-11-05' });
const config = serverlessOutput.outputs;
const valueModel = new ValueModel(config.TestValuesTableName);

function sendMessage(queueUrl, message) {
    const params = {
        MessageBody: JSON.stringify(message),
        QueueUrl: queueUrl
    };

    console.log('forwarding message to Queue...: ' + JSON.stringify(message));

    return sqsClient
        .sendMessage(params)
        .promise()
        .catch(sendErr => {
            console.log('failed to forward message to queue');
            console.log(JSON.stringify(sendErr, null, 4));
            throw sendErr;
        });
}

function generateMessage(id, action, eventType = "AttributeEvent") {
	const messageBody = {
		TenantId: "test1234-0000-0000-0000-692b5c72c419",
		EventType: eventType,
		EventBody: {
			Action: action,
			Object: {
				Type: "AttributeValue",
				Id: `d2l:test1234-0000-0000-0000-692b5c72c419:user:${id}`,
				IsDeleted: false,
				createdAt: "2017-10-01T17:39:14.082Z",
				values: {},
				objectId: id,
				objectType: "user",
				lastUpdatedBy: "System",
				RevisionNumber: 1
			}
		}
	};

	switch (action) {
		case "Created":
			messageBody.EventBody.Object.values.test = "created value";
			break;
        case 'Updated':
			messageBody.EventBody.Object.values.test = "updated value";
			messageBody.EventBody.Object.updateAt = "2017-10-02T17:39:14.082Z";
			break;
        case 'Deleted':
			messageBody.EventBody.Object.IsDeleted = true;
			messageBody.EventBody.Object.updateAt = "2017-10-03T17:39:14.082Z";
			break;
        default:
            throw new Error('Unknown event action: ' + action);
	}

    return messageBody;
}

function refireEvents({numMsgs, eventType, action}) {
	return Promise.map(Array.from(Array(numMsgs)).keys(), i => {
		return sendMessage(config.EventsRestoreQueueUrl, generateMessage(i, action, eventType));
	}, {concurrency: 50});
}

function runRestore({totalEventsToProcess, messagesPerSecond, terminationTimeInSec}) {
	return Promise.try(() => {
		let cmd = `npm run restore -- -s ${config.EventsRestoreQueueUrl} -l ${config.EventsRestoreDLQUrl} -a ${config.TestValuesTableName} -d ${config.TestValuesTableName} -y`;
		if (totalEventsToProcess) {
			cmd += ` -n ${totalEventsToProcess}`;
		}
		if (messagesPerSecond) {
			cmd += ` -m ${messagesPerSecond}`;
		}
		if (terminationTimeInSec) {
			cmd += ` -t ${terminationTimeInSec}`;
		}

		exec(cmd);
		return cmd;
	});
}

function verifyTableRecord(id) {
	return Promise.resolve()
        .then(() => {
            return valueModel.readOne(
                context,
                `d2l:test1234-0000-0000-0000-692b5c72c419:user:${id}`
            );
        })
		.then((data) => {
			expect(data.dateDeleted).to.be.equal("2017-10-03T17:39:14.082Z");
			expect(data.updateAt).to.be.equal("2017-10-03T17:39:14.082Z");
			expect(data.createdAt).to.be.equal("2017-10-01T17:39:14.082Z");
			expect(data.values.test).to.be.equal("updated value");
			return true;
		})
		.catch((err) => {
			throw Error('Error: Wrong message format? Parsing error', err);
		});
}

function purgeQueue() {
	return sqsHelper.getAllMessages({VisibilityTimeout: 20})
		.then((msgArray) => {
			return Promise.map(msgArray, (msg) => {
				let message;
				try {
					message = msg.Messages[0];
				} catch (err) {
					console.error('WARN: not valid message', err);
					return false;
				}
				if (message) {
					return sqsHelper.deleteMessage(message);
				}
				return true;
			});
		});
}

describe('Restore', () => {

	before(() => {
		// check sqs queue exists
	});

	it('Restore all events from sqs to dynamodb tables', function() {
		this.timeout(120000);
		const numTypeMsgs = 2;
		const refireCreatedParams = {numMsgs: numTypeMsgs, eventType: "AttributeEvent", action: "Created"};
		const refireUpdatedParams = {numMsgs: numTypeMsgs, eventType: "AttributeEvent", action: "Updated"};
		const refireDeletedParams = {numMsgs: numTypeMsgs, eventType: "AttributeEvent", action: "Deleted"};
		const restoreParams = {totalEventsToProcess: 3*numTypeMsgs, messagesPerSecond: 3*numTypeMsgs, terminationTimeInSec: 240};
		return refireEvents(refireCreatedParams)
			.then(() => refireEvents(refireUpdatedParams))
			.then(() => refireEvents(refireDeletedParams))
			.then(() => runRestore(restoreParams))
			.then(() => verifyTableRecord(0))
			.then(() => verifyTableRecord(1))
			.finally(() => {
				return purgeQueue();
			});
	});
});
