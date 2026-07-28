# Escalation worker

The API server starts an in-process `node-cron` scheduler from
`workers/escalationScheduler.js`. While `app.js` is running, the scheduler
executes `runEscalationWorker()` every 15 minutes.

You can still run the worker manually once:

```bash
npm run worker:escalation
```

`EscalationLevel.time` is a cumulative number of minutes from
`OnGoingIssue.start`. The worker is idempotent: one issue can create only one
escalation per level and one email per recipient.

When a supervisor creates a new `OnGoingIssue`, the API also triggers an
immediate scoped escalation check for that issue. This makes levels with
`EscalationLevel.time = 0` queue and send as soon as possible after creation,
without waiting for the next 15-minute scheduler tick. Later levels are still
handled by the scheduler.
