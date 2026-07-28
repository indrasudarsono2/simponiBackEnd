# MEDEX User Sync Field Mapping

This file records the agreed field mapping between e-chain response data and SIMPONI MEDEX user fields.

## Included Fields

| e-chain field | SIMPONI field | Type | Notes |
| --- | --- | --- | --- |
| `institution` | `institution` | string | Required by SIMPONI add Medex form. |
| `released` | `released` | string | Must use `YYYY-MM-DD`. |
| `expired` | `expired` | string | Must use `YYYY-MM-DD`. |
| `examiner` | `examiner` | string/null | Optional from e-chain. SIMPONI user may fill manually. |
| `fileName` | file display/reference | string/null | Optional original file name from e-chain. |
| `fileUrl` | `file` | string/null | Optional URL used by SIMPONI backend to download the document. |
| `fileUrlExpiresAt` | download metadata | string/null | Optional expiration time for the temporary file URL. |
| `fileMimeType` | download validation | string/null | Optional MIME type. `application/pdf` is preferred. |
| `fileSizeBytes` | download validation | number/null | Optional file size in bytes. |

## Automatic Webhook Fields

| e-chain field | SIMPONI usage | Type | Notes |
| --- | --- | --- | --- |
| `eventId` | webhook traceability | string | Required. Not stored in the current MEDEX table. |
| `eventType` | webhook routing/validation | string | Required value: `MEDEX_VERIFIED`. |
| `occurredAt` | webhook traceability | string | Required ISO date-time. |
| `nik` | user matching | string | Required. Must match `User.nik`. |
| `echainDocumentId` | future idempotency key | string/null | Optional in backend v1, recommended for future database-level idempotency. |
| `data` | MEDEX payload | object | Contains the included fields above. |

## Notes

SIMPONI currently stores MEDEX files as local upload paths in `Medex.file`. If e-chain sends `fileUrl`, SIMPONI backend should download the file and store it in SIMPONI upload storage before saving the MEDEX record.

The UI should show only `fileName`. The UI should not show `fileUrl`.

For automatic webhook sync, SIMPONI finds the user by `nik`, then creates or updates the active MEDEX record using `nik`, `institution`, `released`, and `expired` as the v1 duplicate-prevention key.
