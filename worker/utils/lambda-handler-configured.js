'use strict';

const errio = require('errio');
const errors = require('@d2l/node-lambda-errors');
const lambdaHandler = require('lambda-handler-as-promised');
const Response = require('lambda-envelope').Response;

module.exports = function(handler) {
	return lambdaHandler(handler, {
		onBefore: (event, context) => {
			context.log.info({ event, context }, 'processing request');
		},
		onAfter: (result = {}, event, context) => {
			context.log.trace({ result }, 'request result');
			context.log.info('request successfully processed');

			return new Response({
				statusCode: result.statusCode || 200,
				body: result
			});
		},
		onError: (err, event, context) => {
			if (err instanceof errors.ClientError) {
				return errio.toObject(err, {
					stack: false,
					exclude: ['jse_cause', '_logged']
				});
			}

			if (!err._logged) {
				context.log.error({ event, err }, 'request resulted in error');
			}

			if (!(err instanceof errors.LambdaError) && !(err.statusCode < 500)) {
				err = new errors.ServerError({
					cause: err instanceof Error
						? err
						: new Error(err)
				});
			}

			throw new Response({
				statusCode: err.statusCode,
				body: errio.toObject(err, {
					stack: true,
					exclude: true ? ['_logged'] : ['jse_cause', '_logged']
				})
			});
		},
		errorStack: true
	});
};
