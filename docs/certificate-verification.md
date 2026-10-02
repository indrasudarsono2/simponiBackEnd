# Certificate issuance and QR verification

Each successful rating with completed required Live and/or Simulator practical tests receives one `Certificate` record. The record stores an immutable JSON snapshot of the participant, rating, event, theory final score, and practical scores. The QR code contains only a URL with a random UUID; no scores or personal data are encoded in the QR itself.

The unauthenticated `GET /api/certificates/verify/:publicId` endpoint returns a limited, read-only result for a valid certificate. Unknown IDs return 404. Revoked certificates show only their number and revoked status. Never add questions, answer keys, supporting documents, NIK, or file URLs to this public response.

Issuance happens in the same database transaction that marks a practical result successful. Changing a practical score, invalidating an examination, or granting a practical recheck revokes the existing certificate. After a successful correction/recheck, a new version is issued; the old snapshot and URL remain in the audit trail as revoked. Older successful ratings can be issued with `npm run certificate:backfill:preview` and then `npm run certificate:backfill` after reviewing the candidates.

Deployment order:

1. Back up the database and deploy the additive Prisma migration.
2. Generate the Prisma client and deploy/restart the backend.
3. Build/deploy the frontend. Set `NUXT_PUBLIC_SITE_URL` to the externally reachable HTTPS frontend origin in production; printed QR codes use this origin.
4. Run the backfill preview and apply it once. The script skips ratings without sufficient practical evidence.
5. Verify one owner-only certificate page and scan its QR from another device. Check that unknown IDs are 404 and revoked IDs do not expose scores.

In development, the QR uses the browser's current origin. A certificate printed from `localhost` cannot be scanned on another device; open it through a reachable LAN address first. For production, do not print certificates until the public HTTPS origin is configured and reachable.

The migration only adds the `Certificate` table. A rollback to application code that does not use it is possible without deleting issued records. Do not drop the table as part of an emergency rollback: that would destroy the verification audit trail.
