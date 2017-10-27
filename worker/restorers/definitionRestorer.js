const BPromise = require('bluebird');

const DefinitionModel = require('../models/definitionModel');

// compare the _v instead of time?
function restoreCreatedEvent(context, definitionModel, eventDefinition, eventCreatedAt) {
    BPromise.resolve()
        .then(() => {
            return definitionModel.readOne(
                context,
                eventDefinition.id
            );
        })
        .then(definition => {
            if (definition && (new Date(eventCreatedAt)).getTime() < (new Date(definition.createdAt)).getTime()) {
                return;
            }

            const updates = {};
            updates.UpdateExpression = `SET #createdAt = :createdAt`;
            updates.ExpressionAttributeNames = {
                '#createdAt': 'createdAt'

            };
            updates.ExpressionAttributeValues = {
                ':createdAt': eventCreatedAt
            };

            if (definition) {
                 updates.ExpressionAttributeNames['#updatedAt'] = 'updatedAt';
                 updates.ExpressionAttributeValues[':updatedAt'] = definition.updatedAt;
                 updates.UpdateExpression = updates.UpdateExpression + ` DELETE #updatedAt :updatedAt`;
            }

            return definitionModel.update(
                context,
                eventDefinition,
                updates
            );
        })
		.catch(err => {
			context.log.error({ err, eventDefinition }, 'failed to restore Created Event');
			throw err;
		});
}

function restoreUpdatedEvent(context, definitionModel, eventDefinition, eventUpdatedAt, eventCreatedAt) {
    BPromise.resolve()
        .then(() => {
            return definitionModel.readOne(
                context,
                eventDefinition.id
            );
        })
        .then(definition => {
            if (definition && (new Date(eventUpdatedAt)).getTime() < (new Date(definition.updatedAt)).getTime()) {
                return;
            }

            const updates = {};
            updates.UpdateExpression = `SET #updatedAt = :updatedAt, #createdAt = :createdAt`;
            updates.ExpressionAttributeNames = {
                '#updatedAt': 'updatedAt',
                '#createdAt': 'createdAt'
            };
            updates.ExpressionAttributeValues = {
                ':updatedAt': eventUpdatedAt,
                ':createdAt': eventCreatedAt
            };

            return definitionModel.update(
                context,
                eventDefinition,
                updates
            );
        })
		.catch(err => {
			context.log.error({ err, eventDefinition }, 'failed to restore Updated Event');
			throw err;
		});
}

function restoreDeletedEvent(context, definitionModel, eventDefinition, eventUpdatedAt, eventCreatedAt) {
    BPromise.resolve()
        .then(() => {
            return definitionModel.readOne(
                context,
                eventDefinition.id
            );
        })
        .then(definition => {
            if (definition && definition.dateDeleted && (new Date(eventUpdatedAt)).getTime() < (new Date(value.dateDeleted)).getTime()) {
                return;
            }

            const updates = {};
            updates.UpdateExpression = `SET #updatedAt = :updatedAt, #createdAt = :createdAt`;
            updates.ExpressionAttributeNames = {
                '#updatedAt': 'updatedAt',
                '#createdAt': 'createdAt'
            };
            updates.ExpressionAttributeValues = {
                ':updatedAt': eventUpdatedAt,
                ':createdAt': eventCreatedAt
            };

            eventDefinition.dateDeleted = eventUpdatedAt;
            return definitionModel.delete(
                context,
                eventDefinition,
                updates
            );
        })
		.catch(err => {
			context.log.error({ err, eventDefinition }, 'failed to restore Deleted Event');
			throw err;
		});
}

function restoreEvent(context, event) {
    const definitionModel = new DefinitionModel(definitionTableName);

    const eventDefinition = {
        id: event.EventBody.Object.Id,
        tenantId: event.TenantId,
        name: event.EventBody.Object.name,
        value: event.EventBody.Object.value,
        applyTo: event.EventBody.Object.applyTo,
        required: event.EventBody.Object.required,
        _v: event.EventBody.Object.RevisionNumber,
    };

    switch (event.EventBody.Action) {
        case 'Created':
                return restoreCreatedEvent(context, definitionModel, eventDefinition, event.EventBody.Object.createdAt);
        case 'Updated':
                return restoreUpdatedEvent(context, definitionModel, eventDefinition, event.EventBody.Object.updatedAt, event.EventBody.Object.createdAt);
        case 'Deleted':
                return restoreDeletedEvent(context, definitionModel, eventDefinition, event.EventBody.Object.updatedAt, event.EventBody.Object.createdAt);
        default:
            throw new Error('Unknown event action: ' + event.EventBody.Action);
    }
}

module.exports = restoreEvent;
