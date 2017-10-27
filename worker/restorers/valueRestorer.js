const BPromise = require('bluebird');

const ValueModel = require('../models/valueModel');

// compare the _v instead of time?
function restoreCreatedEvent(context, valueModel, eventValue, eventCreatedAt) {
    BPromise.resolve()
        .then(() => {
            return valueModel.readOne(
                context,
                eventValue.valueKey
            );
        })
        .then(value => {
            if (value && (new Date(eventCreatedAt)).getTime() < (new Date(value.createdAt)).getTime()) {
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

            if (value) {
                 updates.ExpressionAttributeNames['#updatedAt'] = 'updatedAt';
                 updates.ExpressionAttributeValues[':updatedAt'] = value.updatedAt;
                 updates.UpdateExpression = updates.UpdateExpression + ` DELETE #updatedAt :updatedAt`;
            }

			context.log.info({ eventValue }, 'restore Created Event');
            return valueModel.update(
                context,
                eventValue,
                updates
            );
        })
		.catch(err => {
			context.log.error({ err, eventValue }, 'failed to restore Created Event');
			throw err;
		});
}

function restoreUpdatedEvent(context, valueModel, eventValue, eventUpdatedAt, eventCreatedAt) {
    BPromise.resolve()
        .then(() => {
            return valueModel.readOne(
                context,
                eventValue.valueKey
            );
        })
        .then(value => {
            if (value && (new Date(eventUpdatedAt)).getTime() < (new Date(value.updatedAt)).getTime()) {
                return;
            }

            const updates = {};
            updates.UpdateExpression = `SET #updatedAt = :updatedAt, #createdAt = :createdAt`;
            updates.ExpressionAttributeNames = {
                '#updatedAt': 'updatedAt',
                '#createdAt': 'createdAt'
            };
            updates.ExpressionAttributeValues = {
                ':createdAt': eventCreatedAt,
				':updatedAt': eventUpdatedAt
            };

			context.log.info({ eventValue }, 'restore Updated Event');
            return valueModel.update(
                context,
                eventValue,
                updates
            );
        })
		.catch(err => {
			context.log.error({ err, eventValue }, 'failed to restore Updated Event');
			throw err;
		});
}

function restoreDeletedEvent(context, valueModel, eventValue, eventUpdatedAt, eventCreatedAt) {
    BPromise.resolve()
        .then(() => {
            return valueModel.readOne(
                context,
                eventValue.valueKey
            );
        })
        .then(value => {
            if (value && value.dateDeleted && (new Date(eventUpdatedAt)).getTime() < (new Date(value.dateDeleted)).getTime()) {
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

            eventValue.dateDeleted = eventUpdatedAt;
			context.log.info({ eventValue }, 'restore Deleted Event');
            return valueModel.delete(
                context,
                eventValue,
                updates
            );
        })
		.catch(err => {
			context.log.error({ err, eventValue }, 'failed to restore Deleted Event');
			throw err;
		});
}

function restoreEvent(context, event, valueTableName) {
    const valueModel = new ValueModel(valueTableName);

    //skip schema validation, assume all sent events in BEF validated
    const eventValue = {
        valueKey: event.EventBody.Object.Id,
        tenantId: event.TenantId,
        objectId: event.EventBody.Object.objectId,
        objectType: event.EventBody.Object.objectType,
        values: event.EventBody.Object.values,
        lastUpdatedBy: event.EventBody.Object.lastUpdatedBy,
        _v: event.EventBody.Object.RevisionNumber,
    };

    context.log.info({ eventValue }, 'starting restoreEvent...');

    switch (event.EventBody.Action) {
        case 'Created':
                return restoreCreatedEvent(context, valueModel, eventValue, event.EventBody.Object.createdAt);
        case 'Updated':
                return restoreUpdatedEvent(context, valueModel, eventValue, event.EventBody.Object.updatedAt, event.EventBody.Object.createdAt);
        case 'Deleted':
                return restoreDeletedEvent(context, valueModel, eventValue, event.EventBody.Object.updatedAt, event.EventBody.Object.createdAt);
        default:
            throw new Error('Unknown event action: ' + event.EventBody.Action);
    }
}

module.exports = restoreEvent;
