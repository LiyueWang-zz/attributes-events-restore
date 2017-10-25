'use strict';

const joi = require('joi');

const vogels = require('../vogels-configured');

const SCHEMA = require('@d2l/attributes-schemas').schemas.valueModel;
SCHEMA.valueKey = joi.string().min(1).max(128).uri({ scheme: 'd2l' })
	.regex( /^d2l:[\w-]+:(user|group)+:[\w-]+$/ ).required();
SCHEMA.dateDeleted = joi.date().allow(null);

const valueTableName = "";
const Value = vogels.define('Value', {
	hashKey: 'valueKey',
	timestamps: true,
	schema: SCHEMA,
	tableName: valueTableName
});

module.exports = {
	SCHEMA,

	MODEL: Value,

	readOne: function(context, valueKey) {
		context.log.info({ valueKey }, 'getting value');

		return Value.getAsync(valueKey);
	},

	update: function(context, valueData, expectation = {}) {

		const data = Object.assign(
			{},
			valueData,
			{ dateDeleted: null
		});
		context.log.info({ data, expectation }, 'optimistically updating value');

		return Value.updateAsync(data, expectation);
	},

	delete: function(context, valueData, expectation = {}) {
		context.log.info({ valueData, expectation }, 'deleting value');

		return Value.updateAsync(valueData, expectation);
	},
};
