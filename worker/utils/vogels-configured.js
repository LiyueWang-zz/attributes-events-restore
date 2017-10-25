'use strict';

const vogels = require('vogels-promisified');

const conf = require('../conf');

vogels.AWS.config.update({ region: conf.AWS_REGION });

/* istanbul ignore else */
if (conf.DYNAMODB_ENDPOINT) {
	const dynamoDb = new vogels.AWS.DynamoDB({
		endpoint: conf.DYNAMODB_ENDPOINT
	});
	vogels.dynamoDriver(dynamoDb);
}

module.exports = vogels;
