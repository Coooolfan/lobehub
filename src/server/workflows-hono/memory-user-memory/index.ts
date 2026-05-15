import { serve, serveMany } from '@upstash/workflow/hono';
import { Hono } from 'hono';

import { createWorkflowQstashClient } from '../qstashClient';
import { hourlyWorkflowHandler, hourlyWorkflowOptions } from './workflows/hourly';
import { personaUpdateHandler } from './workflows/personaUpdate';
import { processTopicWorkflow } from './workflows/processTopic';
import { processTopicsHandler } from './workflows/processTopics';
import { processUsersHandler } from './workflows/processUsers';
import { processUserTopicsHandler } from './workflows/processUserTopics';

const app = new Hono();

// NOTICE: `baseUrl` is required since @upstash/workflow v1.x — without it the SDK
// derives the next-step callback URL from `request.url`, which inside the container
// resolves to the bind address (0.0.0.0:PORT) and QStash refuses to publish there.
const baseUrl = process.env.APP_URL;

app.post(
  '/call-cron-hourly-analysis',
  serve(hourlyWorkflowHandler, {
    ...hourlyWorkflowOptions,
    baseUrl,
    qstashClient: createWorkflowQstashClient(),
  }),
);

app.post(
  '/pipelines/persona/update-writing',
  serve(personaUpdateHandler, { baseUrl, qstashClient: createWorkflowQstashClient() }),
);

app.post(
  '/pipelines/chat-topic/process-users',
  serve(processUsersHandler, { baseUrl, qstashClient: createWorkflowQstashClient() }),
);

app.post(
  '/pipelines/chat-topic/process-user-topics',
  serve(processUserTopicsHandler, { baseUrl, qstashClient: createWorkflowQstashClient() }),
);

app.post(
  '/pipelines/chat-topic/process-topics',
  serve(processTopicsHandler, { baseUrl, qstashClient: createWorkflowQstashClient() }),
);

// NOTICE: Must use serveMany here. The `context.invoke(processTopicWorkflow)` call in
// process-topics rewrites the URL last segment to the workflowId ("process-topic"). serveMany
// multiplexes by that final segment to dispatch to the right workflow.
app.post(
  '/pipelines/chat-topic/process-topic',
  serveMany(
    { 'process-topic': processTopicWorkflow },
    { baseUrl, qstashClient: createWorkflowQstashClient() },
  ),
);

export default app;
