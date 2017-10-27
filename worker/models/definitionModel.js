'use strict';

const joi = require('joi');
const vogels = require('vogels-promisified');

module.exports = class DefinitionModel {
	constructor(tableName, region = 'us-east-1') {
		vogels.AWS.config.update({ region: region });

		this.definition = vogels.define('Definition', {
			hashKey: 'tenantId',
			rangeKey: 'id',
			timestamps: false,
			tableName: tableName,
			indexes: [
				{
					hashKey: 'tenantId',
					rangeKey: 'name',
					name: 'LocalNameIndex',
					type: 'local'
				}
			]
		});
	}

	readOne(context, tenantId, defId) {
		context.log.info({ tenantId, defId }, 'getting definition');

		return this.definition.getAsync(tenantId, defId);
	}

	update(context, definitionData, expectation = {}) {
		const data = Object.assign(
			{},
			definitionData,
			{ dateDeleted: null
		});

		context.log.info({ data, expectation }, 'updating definition optimistically');
		return this.definition.updateAsync(data, expectation);
	}

	delete(context, definitionData, expectation = {}) {
		context.log.info({ definitionData, expectation }, 'deleting definition');
		return this.definition.updateAsync(definitionData, expectation);
	}

};
