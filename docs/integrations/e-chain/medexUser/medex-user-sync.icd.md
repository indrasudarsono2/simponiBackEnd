# MEDEX User Sync ICD

## Document Status

| Item | Value |
| --- | --- |
| Integration | SIMPONI MEDEX user document sync from e-chain |
| Version | v1.0-draft |
| Status | Draft |
| Created | 2026-07-10 |

## Purpose

This ICD defines the API contract for syncing user MEDEX data from e-chain into SIMPONI.

In SIMPONI, this integration supports two synchronization methods:

1. Manual pull sync from the `Sync from System` feature in the Add Medex modal on `/document/medexUser`.
2. Automatic push sync when e-chain verifies a new MEDEX document and sends it to SIMPONI.

## Scope

This integration covers MEDEX metadata and, when available, the MEDEX document file.

Current SIMPONI MEDEX fields:

| SIMPONI field | Description |
| --- | --- |
| `institution` | Medical examination institution. |
| `released` | MEDEX release date. |
| `expired` | MEDEX expiry date. |
| `examiner` | Examiner name entered/reviewed in SIMPONI. |
| `file` | Optional MEDEX document file stored by SIMPONI. |

## Proposed Endpoint

### Manual Pull Endpoint Provided By e-chain

Final endpoint path must be confirmed with the e-chain team.

```http
POST /api/integrations/simponi/medex-user
```

Full URL example:

```text
{ECHAIN_BASE_URL}/api/integrations/simponi/medex-user
```

### Automatic Push Webhook Provided By SIMPONI

When e-chain verifies a MEDEX document, e-chain should call SIMPONI:

```http
POST /api/integrations/e-chain/medex-user/verified
```

Required header:

```http
X-ECHAIN-WEBHOOK-SECRET: {ECHAIN_WEBHOOK_SECRET}
```

## Request From SIMPONI

```json
{
  "nik": "10011520",
  "requestedFields": [
    "institution",
    "released",
    "expired",
    "examiner",
    "fileName",
    "fileUrl",
    "fileUrlExpiresAt",
    "fileMimeType",
    "fileSizeBytes"
  ]
}
```

## Request Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `nik` | string | Yes | SIMPONI user NIK used to find matching MEDEX data in e-chain. |
| `requestedFields` | string[] | Yes | List of MEDEX fields requested by SIMPONI. |

## Response From e-chain

e-chain should return the latest active MEDEX data for the requested user.

```json
{
  "success": true,
  "message": "MEDEX data found",
  "data": {
    "institution": "RS Aviation",
    "released": "2024-02-28",
    "expired": "2026-02-28",
    "examiner": null,
    "fileName": "indra-medex-2024.pdf",
    "fileUrl": "https://echain.example.com/files/medex/indra-medex-2024.pdf",
    "fileUrlExpiresAt": "2026-07-10T10:30:00Z",
    "fileMimeType": "application/pdf",
    "fileSizeBytes": 245000
  }
}
```

## Automatic Webhook Request From e-chain

e-chain should send this payload after a MEDEX document is verified.

```json
{
  "eventId": "echain-medex-verified-2026-0001",
  "eventType": "MEDEX_VERIFIED",
  "occurredAt": "2026-07-12T09:30:00+07:00",
  "nik": "10011520",
  "echainDocumentId": "MEDEX-2026-0001",
  "data": {
    "institution": "RS Aviation",
    "released": "2024-02-28",
    "expired": "2026-02-28",
    "examiner": null,
    "fileName": "indra-medex-2024.pdf",
    "fileUrl": "https://echain.example.com/files/medex/indra-medex-2024.pdf",
    "fileUrlExpiresAt": "2026-07-12T10:30:00+07:00",
    "fileMimeType": "application/pdf",
    "fileSizeBytes": 245000
  }
}
```

## Automatic Webhook Response From SIMPONI

Created response:

```json
{
  "success": true,
  "message": "MEDEX webhook processed; SIMPONI record created.",
  "data": {
    "eventId": "echain-medex-verified-2026-0001",
    "action": "created",
    "nik": "10011520",
    "medexId": 123,
    "fileStored": true
  }
}
```

Updated response when SIMPONI finds an existing active MEDEX record with the same `nik`, `institution`, `released`, and `expired`:

```json
{
  "success": true,
  "message": "MEDEX webhook processed; existing SIMPONI record updated.",
  "data": {
    "eventId": "echain-medex-verified-2026-0001",
    "action": "updated",
    "nik": "10011520",
    "medexId": 123,
    "fileStored": true
  }
}
```

## Response Fields

| Field | Type | Required | Format | Description |
| --- | --- | --- | --- | --- |
| `institution` | string | Yes | - | Medical examination institution. |
| `released` | string | Yes | `YYYY-MM-DD` | MEDEX release date. |
| `expired` | string | Yes | `YYYY-MM-DD` | MEDEX expiry date. |
| `examiner` | string/null | No | - | Examiner name. May be `null` if SIMPONI user must fill it manually. |
| `fileName` | string/null | No | - | Original MEDEX document file name. |
| `fileUrl` | string/null | No | HTTPS URL | Download URL for the MEDEX document file. This is backend-only and must not be displayed as a label in the UI. |
| `fileUrlExpiresAt` | string/null | No | ISO date-time | Expiration time for the temporary file URL. |
| `fileMimeType` | string/null | No | MIME type | MIME type of the MEDEX file. `application/pdf` is preferred. |
| `fileSizeBytes` | number/null | No | bytes | File size in bytes. |

## File Transfer Rule

Preferred v1 method:

1. e-chain returns `fileUrl`.
2. SIMPONI backend downloads the file from e-chain after user confirms by clicking `Create Medex`.
3. SIMPONI stores the file in SIMPONI upload storage.
4. SIMPONI stores the local file path in `Medex.file`.

For automatic webhook sync, SIMPONI downloads the file immediately while processing the webhook and stores the local file path in `Medex.file`.

UI display rule:

- The Add Medex modal should display only `fileName`.
- The Add Medex modal should not display `fileUrl`.
- `fileUrl` should be treated as technical data used by SIMPONI backend.

## SIMPONI Field Mapping

| e-chain field | SIMPONI form field | SIMPONI database field |
| --- | --- | --- |
| `institution` | `state.institution` | `Medex.institution` |
| `released` | `state.released` | `Medex.released` |
| `expired` | `state.expired` | `Medex.expired` |
| `examiner` | `state.examiner` | `Medex.examiner` |
| `fileUrl` | downloaded backend file | `Medex.file` |
| `fileName` | display/download reference | stored file original name if supported |
| `fileMimeType` | download validation | not stored |
| `fileSizeBytes` | download validation | not stored |

## SIMPONI Behavior

### Manual Pull Behavior

1. User opens `/document/medexUser`.
2. User clicks `Add Medex`.
3. User chooses `Sync from System`.
4. User clicks `Sync Medex Data`.
5. SIMPONI frontend calls SIMPONI backend endpoint `POST /api/medexUser/sync-echain`.
6. SIMPONI backend sends `nik` and `requestedFields` to e-chain.
7. e-chain returns MEDEX metadata and optional file URL.
8. SIMPONI backend validates the response.
9. SIMPONI frontend fills the add Medex form with returned metadata.
10. SIMPONI frontend shows only `fileName` and keeps `fileUrl` hidden.
11. User reviews the data and fills missing manual fields such as `examiner` if needed.
12. User clicks `Create Medex`.
13. SIMPONI backend downloads the MEDEX file from `fileUrl` if provided.
14. SIMPONI backend stores the downloaded file in SIMPONI upload storage.
15. SIMPONI saves the reviewed MEDEX data and local file path to SIMPONI database.

### Automatic Push Behavior

1. e-chain verifies a MEDEX document.
2. e-chain calls `POST /api/integrations/e-chain/medex-user/verified`.
3. SIMPONI validates `X-ECHAIN-WEBHOOK-SECRET`.
4. SIMPONI validates `eventId`, `eventType`, `occurredAt`, `nik`, and `data`.
5. SIMPONI finds the target user by `User.nik`.
6. SIMPONI downloads `data.fileUrl` when provided.
7. SIMPONI creates a MEDEX record, or updates an existing active record with the same `nik`, `institution`, `released`, and `expired`.
8. SIMPONI returns the processed action: `created` or `updated`.

## SIMPONI Backend Endpoint

```http
POST /api/medexUser/sync-echain
```

SIMPONI backend uses the authenticated user's `req.user.nik` as the request identity. The frontend does not need to send `nik` in the request body.

Automatic webhook endpoint:

```http
POST /api/integrations/e-chain/medex-user/verified
```

The automatic webhook endpoint does not use SIMPONI user login. It is protected by `X-ECHAIN-WEBHOOK-SECRET`.

## Development Mock Mode

During development, SIMPONI backend can return mock MEDEX data when:

```env
ECHAIN_MOCK_MODE=true
```

Mock mode does not download a file from e-chain because `fileUrl` is `null`. This mode is intended for UI and workflow testing before the real e-chain API is available.

## Validation Rules

| Rule | Description |
| --- | --- |
| `institution` | Required, minimum 2 characters. |
| `released` | Required, must be valid date in `YYYY-MM-DD` format. |
| `expired` | Required, must be valid date in `YYYY-MM-DD` format. |
| `examiner` | Optional from e-chain, but SIMPONI form may require user input before save. |
| `fileUrl` | Optional, but if provided should use HTTPS. |
| Supported file types | PDF is preferred. DOC, DOCX, JPG, JPEG, and PNG may be accepted if agreed. |
| Unknown fields | SIMPONI will ignore fields that are not defined in this ICD. |

## Automatic Webhook Validation Rules

| Rule | Description |
| --- | --- |
| `X-ECHAIN-WEBHOOK-SECRET` | Required and must match SIMPONI `ECHAIN_WEBHOOK_SECRET`. |
| `eventId` | Required. Used for traceability. |
| `eventType` | Required and must be `MEDEX_VERIFIED`. |
| `occurredAt` | Required ISO date-time string. |
| `nik` | Required. Must match an existing `User.nik` in SIMPONI. |
| `data` | Required. Must follow the same MEDEX field validation rules as manual sync. |

## Idempotency Rule

In v1, SIMPONI prevents duplicate automatic MEDEX records by updating an existing active record with the same `nik`, `institution`, `released`, and `expired`.

For a stronger future version, SIMPONI can add database fields for `eventId` or `echainDocumentId` and use those values as the primary idempotency key.

## Error Response Example

```json
{
  "success": false,
  "message": "MEDEX data not found",
  "error": {
    "code": "MEDEX_NOT_FOUND",
    "details": "No e-chain MEDEX data found for nik 10011520."
  }
}
```

## Open Questions

| Question | Owner | Status |
| --- | --- | --- |
| Should e-chain return only the latest active MEDEX or a list of MEDEX records? | SIMPONI + e-chain | Open |
| Can e-chain provide a secure downloadable `fileUrl`? | e-chain | Open |
| Is `examiner` available in e-chain, or should SIMPONI always require manual input? | e-chain | Open |
| How long should the `fileUrl` remain valid? | e-chain | Open |
| What authentication method will protect file download URLs? | SIMPONI + e-chain | Open |
| Should SIMPONI add database fields for `eventId` or `echainDocumentId` to improve idempotency? | SIMPONI | Open |
