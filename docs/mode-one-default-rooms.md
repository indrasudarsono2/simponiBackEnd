# Automatic Mode 1 rooms

Successful application verification assigns eligible participants to a default room unique to their event. Active manual assignments are never replaced. Mode 2 and completed theory results are excluded. Event start/finish dates define the default schedule; event edits synchronize it. Briefing, monitoring permission and examination deadlines still apply.

The Room page labels automatic rooms as event-managed. They cannot be edited or deleted directly. Creating a manual room can transfer eligible users from default rooms; removing users from manual rooms restores their automatic assignment when still eligible.

Checker Admin dashboard counts verified participants missing an assignment. Details load only when requested, at most 100 at a time. Recovery is role-protected and branch-unit-scoped. Invalid event dates must be corrected before recovery succeeds.

Deployment: generate Prisma client, apply migrations, restart backend, then run `node scripts/backfill-default-rooms.js` to preview and `node scripts/backfill-default-rooms.js --apply` to repair eligible historical assignments. Existing manual assignments and expired events are preserved.

Rollback: revert application changes while retaining the additive defaultEventId column and its assignments. Do not drop rooms or attendance records; review them before any later schema rollback. Older code may expose automatic rooms as manual, so restrict room mutations during rollback review.
