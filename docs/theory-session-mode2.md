# Mode 2 shared theory sessions

Mode 1 is unchanged: its existing Room and Attendance workflow and separate Essay/Multiple Choice time limits still apply. New events default to Mode 1 and Hard. Mode 2 uses `TheorySession`, `TheorySessionParticipant`, and `TheorySessionAction`; it does not reuse `Room`.

## Set up

1. Apply migrations with `npx prisma migrate deploy`, then regenerate the Prisma client and restart the backend. Rebuild/restart the frontend.
2. Assign `CHECKER EXAMINATION LEAD` at the relevant branch unit. This role has the `theorySession` menu. The lead cannot grade Essay through this role.
3. Create an event with Mode 2 and Easy or Hard. Add its Essay/Multiple Choice question configuration. Their per-part minutes are unused in Mode 2.
4. Ensure participants have verified application documents, assigned ratings, and checker group membership for their events. The lead can select multiple currently active Mode 2 events in the same branch unit, then select eligible participants from those events for one session and shared duration. A person enrolled in more than one selected event may occupy only one event enrollment in that session.
5. Keep `RUN_THEORY_SESSION_SCHEDULER=true` on one backend process. It finalizes expired sessions and sends result emails after Essay grading. Configure `MAIL_HOST` and `MAIL_FROM` to enable email.

## During the examination

- Participants can select one eligible rating for each session. A second rating requires a separate session; a late entrant gets only the current shared remainder.
- Each participant's event determines their questions, difficulty, passing grade, final score, and result email. The session only shares the lead-controlled clock. Every selected event must still be active when the session starts.
- The server owns the timer. Participant and lead screens poll every three seconds; the expiry worker checks every five seconds. A pause locks answer changes. Extra time requires a reason and is audited.
- Participants may switch parts, save drafts, and submit either part early. Submitted questions are hidden until the whole session ends. Unsubmitted drafts are finalized automatically at expiry; unanswered questions receive no score.
- Multiple Choice score and wrong-question markers appear only after the session ends. Correct answer keys are never returned. An assigned checker grades Essay afterward; the result email is queued after that grading.
- Hard retains one re-check opportunity; Easy leaves unsuccessful ratings eligible for further sessions.

## Recovery

- If the backend restarts, the database retains the last resume timestamp and remainder. The first worker pass recalculates from server time and finalizes expired sessions. A browser refresh never resets the clock.
- Participant and lead clock reads have a separate authenticated per-user rate limit. The lead page polls a lightweight clock batch every 3 seconds and refreshes event/session lists every 30 seconds; these clock reads do not consume the general API or login allowances.
- If finalization fails, the session remains `ENDING` and the worker retries. Inspect backend logs before changing rows manually.
- The migration is additive and leaves Mode 1 data intact. Do not roll back the migration after Mode 2 sessions have been created without first exporting those new tables; dropping them would remove exam answers and the audit trail.
- The multi-event migration adds `TheorySessionEvent` and backfills existing single-event sessions. The original `eventId` is retained for compatibility, but participant scoring uses each participant's enrolled event.
