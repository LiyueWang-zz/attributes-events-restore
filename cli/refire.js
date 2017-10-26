

const {confirmStdin, exitError, getDeploymentInfo} = require('./helpers');

const {region, functionName, profile} = getDeploymentInfo();
process.env.AWS_PROFILE = profile;
const AWS = require('aws-sdk'); // load SDK here so the profile gets set
AWS.config.update({region});

const sqsClient = new AWS.SQS({ apiVersion: '2012-11-05' });

function sendMessage(queueUrl, message) {
    console.log(JSON.stringify(message.body));
    const params = {
        MessageBody: JSON.stringify(message.body),
        QueueUrl: queueUrl,
        MessageAttributes: message.attributes
    };

    console.log('forwarding message to Queue...');

    return sqsClient
        .sendMessage(params)
        .promise()
        .catch(sendErr => {
            console.log('failed to forward message to queue');
            console.log(JSON.stringify(sendErr, null, 4));
            throw sendErr;
        });
}

function generatedMessages(number) {
    const tenantId = "4321";
    const objectType = "user";
    let objectId, valueKey;
    
    let message;
    let msgs = [];
    for(var i=1; i<=number; i++){
        objectId = i.toString();
        valueKey = `test:4321:user:${objectId}`;
        message = {
            'body' : {
                'valueKey': valueKey,
                'tenantId': tenantId,
                'objectId': objectId,
                'objectType': objectType
            },
            'attributes' : {
                'valueKey': {
                    DataType: 'String',
                    StringValue: valueKey
                },
                'tenantId': {
                    DataType: 'String',
                    StringValue:tenantId
                },
                'objectId': {
                    DataType: 'String',
                    StringValue: objectId
                },
                'objectType': {
                    DataType: 'String',
                    StringValue: objectType
                }
            }
        };

        msgs.push(message);
    }

    return msgs;
}

function sendMessages(number) {
    const queueUrl = "	https://sqs.us-east-1.amazonaws.com/987436256322/attributes-events-restore-restore-EventsRestoreQueue";
    let msgs = generatedMessages(number);

    sendMessage(queueUrl, msgs[0]);
        // setTimeout(function () {
        //     console.log(j+": "+JSON.stringify(msgs[j], null,4));
        //     // sendMessage(queueUrl, msgs[j]);
        // }, 1*1000);
    
    
}


Promise.resolve()
	.then(() => sendMessages(1))
	.catch((err) => {
		console.log(err);
	});