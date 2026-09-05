# Final-score CWP snapshot deployment

This migration preserves the Sector/CWP authority and frequency configuration that applied when a final score was created. Later Sector/CWP reassignment therefore does not rewrite Checker History.

## Deploy

Run these commands from `server`:

```powershell
pnpm run generate
pnpm run migrate:deploy
pnpm run snapshot:cwp:preview
pnpm run snapshot:cwp:backfill
pnpm run snapshot:cwp:preview
```

The last preview should report `ready: 0`, no unresolved records, and all existing final scores as skipped.

## Safe data rollback

This removes only the generated snapshot data. It does not delete final scores, events, sectors, CWPs, or frequencies. Checker History will temporarily use its legacy live-configuration fallback.

```powershell
pnpm run snapshot:cwp:rollback-preview
pnpm run snapshot:cwp:rollback-data
```

Snapshot data can be reconstructed with `pnpm run snapshot:cwp:backfill` while the source history is still available.

## Full implementation rollback

Use this only while reverting the corresponding application code and Prisma schema in the same release:

1. Stop the backend so no examination can create a new snapshot during rollback.
2. Revert the snapshot reads/writes in `checkerHistoryController.js`, `examintaionController.js`, and the Checker History page.
3. Run `prisma/migrations/20260905090000_final_score_cwp_snapshot/rollback.sql` against the selected database. It drops only `FinalScoreCwpFrequency` and `FinalScoreCwp`.
4. Revert the two snapshot models and `FinalScore.cwpSnapshots` from `prisma/schema.prisma`, regenerate Prisma Client, and restart the backend.

Before a later redeployment of this same migration, reconcile the Prisma migration record with the actual database state. Do not run the schema rollback independently while snapshot-aware backend code is active.
