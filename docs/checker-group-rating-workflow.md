# Checker group rating workflow — development release 2026-10-12

## Group configuration

Add/Edit Group: Event → Group name → Ratings → PIC → Rating checker assignments → Members.
PIC may be a TWR, APP/APS, ACP/ACS, or another eligible CHECKER in the same branch unit.
Ratings come from the selected event sector's active SubBranchUnitRating records.
Checker eligibility comes from active CHECKER-role CheckerRating records, not merely operational UserRating.

| Remark | Coverage and scoring |
| --- | --- |
| PERPANJANGAN | Multiple ratings allowed; exactly one responsible checker per rating. PIC is included in the assigned team and can cover their qualified ratings. Additional checkers fill uncovered ratings. |
| PENERBITAN | One group/application rating. PIC and at least one distinct additional checker must both qualify for it. Any one assigned checker can complete the essay. Every assigned checker must submit each required practical type's score and their own evaluation sheet. |

The server validates same branch unit, rating authority, distinct assignments, selected event membership, no self-examination, and no duplicate active group membership in an event.
Checker membership can be reused across groups; participant membership cannot.

## Runtime permissions

* Only assigned PIC verifies group members' application documents, regardless of the PIC's scoring ratings.
* Essay and practical access follows explicit rating assignments and current CHECKER authority. The first completed essay scoring is claimed transactionally; another checker cannot overwrite it.
* Each checker scores/uploads only their own PracticalTest or PracticalRecheckAttempt for an assigned rating and Live/Simulator type.
* PIC may inspect the group's practical records but cannot score another checker's row.
* Only PIC uploads the examinee's rating license, and only PIC sends the license to e-chain. Evaluation sheets never enter the e-chain payload.
* `PUT /api/practicalExam/{practicalTestId}/license` uploads one `licenseFile` PDF without changing an assessment score. The record belongs to the examinee; its note/expiration come from the related event.
* Practical scoring does not require a license in policy-1 groups. A license and SUCCESS are required before e-chain submission.

Application and practical records are created in one transaction from server-resolved group assignments; client-provided checker IDs are not trusted.
All required scores AND sheets must be present for SUCCESS. Any below-grade practical assessment makes FAILED, including when other assessments are pending. No averaging determines pass/fail. Every required Live/Simulator assessment must pass.
Certificates are issued only after SUCCESS; failure or score changes revoke invalid certificates and rating results.
Recheck remains subject to existing Checker Admin authorization, retaining the per-checker assessment rows.

## Compatibility and audit

Migration `20261012100000_group_rating_assignments` is additive: Group.assignmentPolicy/ratingIds, CheckerGroupRating, and GroupAssignmentAudit.
Existing groups remain policy 0 (legacy PIC practical workflow); no assignments/scores are guessed or backfilled.
New groups and reviewed unused groups use policy 1. Groups with submitted application documents cannot be edited/deleted here, preserving assignment history. Existing active groups require a separately reviewed transition, not a silent migration.
Audits record creation, before/after edits, deletion, practical scores/evidence replacements, recheck scores, license uploads, actor and UTC creation timestamp.
Replaced evaluation sheets are retained for audit/rollback; storage retention can be handled separately.

## Verification

* `node test/groupRatingPolicy.test.js`
* `node test/eventAuthorization.test.js`
* `node test/checkerExamReset.test.js`
* `node test/practicalLicense.test.js`
* `node test/groupRatingReadOnly.js` — local database, read-only controller checks.
* `node test/groupRatingIntegration.js` — local database only, fixture transaction always rolled back; no uploads, emails or e-chain calls.
* Frontend: `vue-tsc --noEmit -p .nuxt/tsconfig.json`.

## Rollback

See `../../rollback/checker-group-20261012/README.md` from the workspace root (or the absolute path linked in the delivery).
Rollback preserves the additive migration, tables, audit records and all uploaded files; it does not DROP tables or delete results.
