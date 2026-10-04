# Event examination configuration audit

EventConfigurationVersion stores immutable JSON configuration versions (counts, weights, durations, per-rating group names/IDs/quantities, MATS mode, category allocations and eligible mandatory item IDs). The event overview displays the latest saved version, with history and a current-settings preview before locking.

Finalize Configuration requires an authorized administration role and event tenant scope. Before first examination access, a new version can be finalized with a reason. Finalization validates shared weights, counts and group quantities for every sector rating. MATS separate-pool questions are additional to the configured branch question count.

First examination access locks the saved configuration. Mode 1 draft creation and Mode 2 question selection use that version; MATS uses its saved allocation. Drafts and newly generated final scores reference the configuration version. Actual delivered questions remain in the per-attempt question snapshots and corrections. The composition snapshot does not contain answer keys or duplicate the question bank.

If manual finalization was forgotten, first examination access validates and captures an AUTO_FINALIZED version inside the same event-row transaction used to lock it. Unlocked backfill baselines and changed event settings are automatically recaptured with the same validation. History records the participant who triggered capture, their name, UTC timestamp, trigger and reason. Simultaneous participants reuse the same locked version. Invalid settings block examination with an explanation for the Checker Admin. Locked snapshots and legacy attempts are never silently recaptured.

Question-setting edits are rejected once an examination has started or a saved configuration is locked. Group-bank changes do not change saved event composition. Changes to event sector, mode or difficulty require a new finalization before exam access.

## Development rollout

1. Apply `prisma migrate deploy` and generate the Prisma client.
2. Preview `node scripts/backfill-event-configurations.js`.
3. Apply `node scripts/backfill-event-configurations.js --apply`.
4. Restart the backend if it has cached the previous generated client.

Backfill is idempotent, creates only missing baselines, marks them BACKFILL_CURRENT and preserves validation warnings. It captures current settings, not historical truth. Prior attempts are deliberately not attributed to that baseline. In-progress legacy drafts retain their actual delivered questions and unknown version reference. Existing incomplete configurations retain legacy behavior; future finalized configurations must pass validation.

## Rollback

Deploy the previous application code if required. Leave the additive table and nullable reference columns in place; old code ignores them and audit data remains recoverable. Do not drop configuration versions that have been referenced by examinations. No existing event, question, score or answer is deleted by this migration or backfill.
