# attributes-events-restore

Tool [event-flow-refire](https://github.com/Brightspace/event-flow-refire) is used to refire archived BEF events from S3 to a destination *sqs queue*. For attributes service, this tool can restore events from the *sqs queue* to dynamodb tables.

## Quick introduction

Restore has two parts: the master CLI process that runs on your machine, and worker that run on Lambda and restore data around. The worker will receive events from SQS and restore thems to the dynamodb tables.

## How to run

1. Install Serverless and dependencies: `npm install`.
1. Deploy the worker: `serverless deploy --stage stage --region us-east-1 --profile default`. See `worker/serverless.yml` for more details.
1. To get help on command line arguments: `npm run restore -- -h`
1. Run the tool. Example:

    ```npm run restore -- -s sqs-url -l dlq-url -a valuesTable -d definitionTable -n totalEventsToProcess ```

    Rstore will automatically get your deployment information from the Serverles output on disk (stage, region, profile).

1. Un-deploy your stack: `npm run remove -- --stage=<stage-name>`.

## Integration test

1. `npm run deploy -- --stage=<stage-name> --test true`
1. `npm run integration-test`
1. `npm run remove`

