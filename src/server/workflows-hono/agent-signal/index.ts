import { serve } from '@upstash/workflow/hono';
import { Hono } from 'hono';

import { runAgentSignalWorkflow } from '@/server/workflows/agentSignal/run';
import type { AgentSignalWorkflowRunPayload } from '@/server/workflows/agentSignal/types';

import { qstashAuth } from '../middlewares/qstashAuth';
import { createWorkflowQstashClient } from '../qstashClient';
import { scheduleNightlyReview } from './handlers/scheduleNightlyReview';

const app = new Hono();

app.post('/cron-hourly-nightly-self-review', qstashAuth(), scheduleNightlyReview);

app.post(
  '/run',
  serve<AgentSignalWorkflowRunPayload>((context) => runAgentSignalWorkflow(context), {
    // NOTICE: see memory-user-memory/index.ts for why `baseUrl` is required since v1.x.
    baseUrl: process.env.APP_URL,
    qstashClient: createWorkflowQstashClient(),
  }),
);

export default app;
