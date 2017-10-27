
const Promise = require('bluebird');

const {confirmStdin, exitError, getDeploymentInfo} = require('./helpers');

const {region, functionName, profile} = getDeploymentInfo();
process.env.AWS_PROFILE = profile;
const AWS = require('aws-sdk'); // load SDK here so the profile gets set
AWS.config.update({region});

const sqsClient = new AWS.SQS({ apiVersion: '2012-11-05' });

const queueUrl = "https://sqs.us-east-1.amazonaws.com/987436256322/attributes-events-restore-restore-EventsRestoreQueue";

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

function generateMessages(id, eventType, action = 'Updated') {
    const messageBody = {
		'EventType': eventType,
		'EventBody': {
			'Action': action,
			'Object': {
				'Id': id
			}
		}
	};

    return messageBody;
}

function refireEvents({numMsgs, eventType, action}) {
	return Promise.map(Array.from(Array(numMsgs)).keys(), i => {
		return sendMessage(queueUrl, generateMessages(i, eventType, action));
	}, {concurrency: 50});
}


Promise.resolve()
	.then(() => refireEvents({numMsgs: 100, eventType: "AttributeEvent", action: "Updated"}))
	.catch((err) => {
		console.log(err);
	});
