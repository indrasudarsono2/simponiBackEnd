# Application Corrections

Development-only implementation. No production data changes are required to build it.

## Enable

Back up the target database, apply pending migrations with the normal deployment preflight, and regenerate Prisma (`npm run generate`). Migration `20261015160000_application_corrections` creates the audit table and grants the new `applicationCorrections` menu only to active CHECKER ADMIN roles. Sign out and back in to refresh menu claims.

Pages: `/applicationCorrections/ratings` and `/applicationCorrections/documents`.

## Rules

Own branch-unit PERPANJANGAN applications only; both applicant and event must match. Self-correction and OJTI initial issuance are excluded. Corrections stop on saved exam drafts, theory participation with a prepared question set, answers, scores, monitoring records, or practical evidence. Every write checks the application version inside a transaction and records the actual actor and before/after values. No endpoint validates a proposal.

Rating additions preserve existing ratings and hours. New hours are null; the applicant must fill them. Active sector/group coverage and checker qualification must agree. Normal practical/simulator assignments and pending proposals are created. The existing eligible Supervisor is retained. Application verification is reopened.

Document correction selects only an active own file; IELP/MEDEX must be approved and valid. Shared document changes return every active rating proposal and clear verification. Resubmission is a separate action: all returned active proposals become pending with a fresh snapshot, incremented revision, and ADMIN_RESUBMITTED history. Validated proposals are not resubmitted.

## Rollback

The UI can roll back the latest correction only if its recorded after-state still matches and there is no examination activity. Added ratings/practicals are soft-deleted, never purged; proposal and correction audits remain. Previous attachment selections and approval states are restored together, not onto changed files. Changed records require manual review; no forced rollback is offered.

For release rollback, return to the prior application release and disable the new menu grant. Retain the additive audit table and its records; do not drop it or restore a whole database over subsequent user changes.

## Acceptance checks before production

On a disposable database clone: exercise a Bara-like missing-rating addition, qualified-checker failure, Guntur/Heidi-like attachment replacement, missing/foreign-file rejection, resubmission, same-branch validation through the existing workflow, rollback before activity, rollback refusal after change, and concurrent examination-start/correction requests. Inspect audit history and confirm existing APS data is unchanged. Never run clone tests against the live database.
