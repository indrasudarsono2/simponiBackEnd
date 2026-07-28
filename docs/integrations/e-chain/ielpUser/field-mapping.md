# IELP User Sync Field Mapping

This file records the agreed field mapping between e-chain response data and SIMPONI IELP user fields.

## Included Fields

| e-chain field | SIMPONI field | Type | Notes |
| --- | --- | --- | --- |
| `institution` | `institution` | string | Required by SIMPONI add IELP form. |
| `level` | `level` | string | Required by SIMPONI add IELP form. |
| `released` | `released` | string | Must use `YYYY-MM-DD`. |
| `expired` | `expired` | string | Must use `YYYY-MM-DD`. |
| `rater` | `rater` | string/null | Optional from e-chain. SIMPONI user may fill manually. |
| `fileName` | file display/reference | string/null | Optional original file name from e-chain. |
| `fileUrl` | `file` | string/null | Optional URL used by SIMPONI backend to download the document. |
| `fileUrlExpiresAt` | download metadata | string/null | Optional expiration time for the temporary file URL. |
| `fileMimeType` | download validation | string/null | Optional MIME type. `application/pdf` is preferred. |
| `fileSizeBytes` | download validation | number/null | Optional file size in bytes. |

## Automatic Webhook Fields

| e-chain field | SIMPONI usage | Type | Notes |
| --- | --- | --- | --- |
| `eventId` | webhook traceability | string | Required. Not stored in the current IELP table. |
| `eventType` | webhook routing/validation | string | Required value: `IELP_VERIFIED`. |
| `occurredAt` | webhook traceability | string | Required ISO date-time. |
| `nik` | user matching | string | Required. Must match `User.nik`. |
| `echainDocumentId` | future idempotency key | string/null | Optional in backend v1, recommended for future database-level idempotency. |
| `data` | IELP payload | object | Contains the included fields above. |

## Notes

SIMPONI currently stores IELP files as local upload paths in `Ielp.file`. If e-chain sends `fileUrl`, SIMPONI backend should download the file and store it in SIMPONI upload storage before saving the IELP record.

The UI should show only `fileName`. The UI should not show `fileUrl`.

For automatic webhook sync, SIMPONI finds the user by `nik`, then creates or updates the active IELP record using `nik`, `institution`, `level`, `released`, and `expired` as the v1 duplicate-prevention key.
