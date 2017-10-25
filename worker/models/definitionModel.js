'use strict';

const joi = require('joi');
const vogels = require('../vogels-configured');

const SCHEMA = require('@d2l/attributes-schemas').schemas.definitionModel;
SCHEMA.dateDeleted = joi.date().allow(null);

const definitionTableName = "";
const Definition = vogels.define('Definition', {
	hashKey: 'tenantId',
	rangeKey: 'id',
	timestamps: true,
	schema: SCHEMA,
	tableName: definitionTableName,
	indexes: [
		{
			hashKey: 'tenantId',
			rangeKey: 'name',
			name: 'LocalNameIndex',
			type: 'local'
		}
	]
});

module.exports = {
	SCHEMA,

	MODEL: Definition,

	readOne: function(context, tenantId, defId) {
		context.log.info({ tenantId, defId }, 'getting definition');

		return Definition.getAsync(tenantId, defId);
	},

	update: function(context, definitionData, expectation = {}) {
		const data = Object.assign(
			{},
			definitionData,
			{ dateDeleted: null
		});

		context.log.info({ data, expectation }, 'updating definition optimistically');
		return Definition.updateAsync(data, expectation);
	},


	delete: function(context, definitionData, expectation = {}) {
		context.log.info({ definitionData, expectation }, 'deleting definition');
		return Definition.updateAsync(definitionData, expectation);
	},

};
