'use strict';

const assert = require('assert');
const BPromise = require('bluebird');
const AWS = require('aws-sdk');

const valueRestorer = require('./restorers/valueRestorer');
const definitionRestorer = require('./restorers/definitionRestorer');

const sqsClient = new AWS.SQS({ apiVersion: '2012-11-05' });

const MAX_ATTRIBUTES_COUNT = 10;

function forwardToDLQ(context, dlqUrl, message, err) {
    let attributes = _.defaults({
        'err.message': {
            DataType: 'String',
            StringValue: err.message
        },
        'err.stack': {
            DataType: 'String',
            StringValue: err.stack
        },
        'context.awsRequestId': {
            DataType: 'String',
            StringValue: context.awsRequestId
        }
    }, message.MessageAttributes);

    if (_.keys(attributes).length > MAX_ATTRIBUTES_COUNT) {
        context.log.warn({ attributes }, 'too many message attributes');
        attributes = message.MessageAttributes;
    }

    const params = {
        MessageBody: message.Body,
        QueueUrl: dlqUrl,
        MessageAttributes: attributes
    };

    context.log.debug({ params }, 'forwarding message to DLQ');

    return sqsClient
        .sendMessage(params)
        .promise()
        .catch(sendErr => {
            context.log.error({ err: sendErr, params }, 'failed to forward message to DLQ');
            err._logged = true; // eslint-disable-line no-param-reassign
            throw sendErr;
        });
}

module.exports = function handleMessage(options = {}) {
    assert(options.message, 'options.message is missing');
    assert(options.attributeTable, 'options.attributeTable is missing');
    assert(options.definitionTable, 'options.definitionTable is missing');
    assert(options.dlqUrl, 'options.dlqUrl is missing');

    const context = option.context;
    return BPromise.try(() => {
        const event = JSON.parse(message.Body); //Note: assume the message body is the event

        context.log.debug({ event }, 'processing event');
        if (event.EventType === 'AttributeEvent') {
            return valueRestorer(context, event);
        } else if (event.EventType === 'AttributeDefinitionEvent') {
            return definitionRestorer(context, event);
        } else {
            const err = new Error('unkown event type');
            err._logged = true;
            context.log.error({err, event}, 'unkown event type');
            throw err;
        }
    })
    .then(result => result.success)
    .catch(err => {
        if (!err._logged) {
            context.log.error({ err, message }, 'failed to process message');
        }

        return forwardToDLQ(context, options.dlqUrl, message, err)
            .then(() => true) // task is not retryable and placed to DLQ, thus should be removed from the main queue
            .catch(dlqErr => {
                if (!dlqErr._logged) {
                    context.log.error({ err: dlqErr }, 'failed to publish message to DLQ');
                }
                return false;
            });
    });
};
