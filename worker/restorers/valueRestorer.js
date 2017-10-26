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

            return valueModel.update(
                context,
                eventValue,
                updates
            );
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
                ':updatedAt': eventUpdatedAt,
                ':createdAt': eventCreatedAt
            };

            return valueModel.update(
                context,
                eventValue,
                updates
            );
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
            return valueModel.delete(
                context,
                eventValue,
                updates
            );
        });
}

function restoreEvent(context, event, valueTableName) {
    const valueModel = new ValueModel(valueTableName);

    //skip schema validation, assume all sent events in BEF validated
    const eventValue = {
        valueKey: event.EventBody.object.Id,
        tenantId: event.TenantId,
        objectId: event.EventBody.object.objectId,
        objectType: event.EventBody.object.objectType,
        values: event.EventBody.object.values,
        lastUpdatedBy: event.EventBody.object.lastUpdatedBy,
        _v: event.EventBody.object.RevisionNumber,
    };

    context.log.info({ eventValue }, 'starting restoreEvent...');

    switch (event.EventBody.Action) {
        case 'Created':
                return true;
                // return restoreCreatedEvent(context, valueModel, eventValue, event.EventBody.object.createdAt);
        case 'Updated':
                return true;
                // return restoreUpdatedEvent(context, valueModel, eventValue, event.EventBody.object.updatedAt, event.EventBody.object.createdAt);
        case 'Deleted':
                return true;
                // return restoreDeletedEvent(context, valueModel, eventValue, event.EventBody.object.updatedAt, event.EventBody.object.createdAt);
        default:
            throw new Error('Unknown event action: ' + event.EventBody.Action);
    }
}

module.exports = restoreEvent;