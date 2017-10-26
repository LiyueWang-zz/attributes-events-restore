'use strict';

const joi = require('joi');
const vogels = require('vogels-promisified');
const SCHEMA = require('@d2l/attributes-schemas').schemas.valueModel;

SCHEMA.valueKey = joi.string().min(1).max(128).uri({ scheme: 'd2l' })
	.regex( /^d2l:[\w-]+:(user|group)+:[\w-]+$/ ).required();
SCHEMA.dateDeleted = joi.date().allow(null);

module.exports = class ValueModel {
	constructor(tableName, region = 'us-east-1') {
		vogels.AWS.config.update({ region: region });

		this.value = vogels.define('Value', {
			hashKey: 'valueKey',
			timestamps: true,
			schema: SCHEMA,
			tableName: tableName
		});
	}

	readOne(context, valueKey) {
		context.log.info({ valueKey }, 'getting value');

		return this.value.getAsync(valueKey);
	}

	update(context, valueData, expectation = {}) {

		const data = Object.assign(
			{},
			valueData,
			{ dateDeleted: null
		});
		context.log.info({ data, expectation }, 'optimistically updating value');

		return this.value.updateAsync(data, expectation);
	}

	delete(context, valueData, expectation = {}) {
		context.log.info({ valueData, expectation }, 'deleting value');

		return this.value.updateAsync(valueData, expectation);
	}
};
