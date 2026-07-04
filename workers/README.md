# Escalation worker

Run `npm run worker:escalation` every 15 minutes. Example Linux cron entry:

```cron
*/15 * * * * cd /path/to/server && /usr/bin/npm run worker:escalation >> logs/escalation-worker.log 2>&1
```

`EscalationLevel.time` is a cumulative number of minutes from
`OnGoingIssue.start`. The worker is idempotent: one issue can create only one
escalation per level and one email per recipient.
