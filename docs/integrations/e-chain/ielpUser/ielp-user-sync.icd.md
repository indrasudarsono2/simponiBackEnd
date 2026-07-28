# IELP User Sync ICD

## Document Status

| Item | Value |
| --- | --- |
| Integration | SIMPONI IELP user document sync from e-chain |
| Version | v1.0-draft |
| Status | Draft |
| Created | 2026-07-10 |

## Purpose

This ICD defines the API contract for syncing user IELP data from e-chain into SIMPONI.

In SIMPONI, this integration supports two synchronization methods:

1. Manual pull sync from the `Sync from System` feature in the Add IELP modal on `/document/ielpUser`.
2. Automatic push sync when e-chain verifies a new IELP document and sends it to SIMPONI.

## Scope

This integration covers IELP metadata and, when available, the IELP document file.

Current SIMPONI IELP fields:

| SIMPONI field | Description |
| --- | --- |
| `institution` | IELP issuing institution. |
| `level` | IELP level. |
| `released` | IELP release date. |
| `expired` | IELP expiry date. |
| `rater` | Rater name entered/reviewed in SIMPONI. |
| `file` | Optional IELP document file stored by SIMPONI. |

## Proposed Endpoint

### Manual Pull Endpoint Provided By e-chain

Final endpoint path must be confirmed with the e-chain team.

```http
POST /api/integrations/simponi/ielp-user
```

Full URL example:

```text
{ECHAIN_BASE_URL}/api/integrations/simponi/ielp-user
```

### Automatic Push Webhook Provided By SIMPONI

When e-chain verifies an IELP document, e-chain should call SIMPONI:

```http
POST /api/integrations/e-chain/ielp-user/verified
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
    "level",
    "released",
    "expired",
    "rater",
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
| `nik` | string | Yes | SIMPONI user NIK used to find matching IELP data in e-chain. |
| `requestedFields` | string[] | Yes | List of IELP fields requested by SIMPONI. |

## Response From e-chain

e-chain should return the latest active IELP data for the requested user.

```json
{
  "success": true,
  "message": "IELP data found",
  "data": {
    "institution": "PPIC CURUG",
    "level": "5",
    "released": "2024-02-28",
    "expired": "2027-02-28",
    "rater": null,
    "fileName": "indra-ielp-2024.pdf",
    "fileUrl": "https://echain.example.com/files/ielp/indra-ielp-2024.pdf",
    "fileUrlExpiresAt": "2026-07-10T10:30:00Z",
    "fileMimeType": "application/pdf",
    "fileSizeBytes": 245000
  }
}
```

## Automatic Webhook Request From e-chain

e-chain should send this payload after an IELP document is verified.

```json
{
  "eventId": "echain-ielp-verified-2026-0001",
  "eventType": "IELP_VERIFIED",
  "occurredAt": "2026-07-12T09:30:00+07:00",
  "nik": "10011520",
  "echainDocumentId": "IELP-2026-0001",
  "data": {
    "institution": "PPIC CURUG",
    "level": "5",
    "released": "2024-02-28",
    "expired": "2027-02-28",
    "rater": null,
    "fileName": "indra-ielp-2024.pdf",
    "fileUrl": "https://echain.example.com/files/ielp/indra-ielp-2024.pdf",
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
  "message": "IELP webhook processed; SIMPONI record created.",
  "data": {
    "eventId": "echain-ielp-verified-2026-0001",
    "action": "created",
    "nik": "10011520",
    "ielpId": 123,
    "fileStored": true
  }
}
```

Updated response when SIMPONI finds an existing active IELP record with the same `nik`, `institution`, `level`, `released`, and `expired`:

```json
{
  "success": true,
  "message": "IELP webhook processed; existing SIMPONI record updated.",
  "data": {
    "eventId": "echain-ielp-verified-2026-0001",
    "action": "updated",
    "nik": "10011520",
    "ielpId": 123,
    "fileStored": true
  }
}
```

## Response Fields

| Field | Type | Required | Format | Description |
| --- | --- | --- | --- | --- |
| `institution` | string | Yes | - | IELP issuing institution. |
| `level` | string | Yes | - | IELP level. |
| `released` | string | Yes | `YYYY-MM-DD` | IELP release date. |
| `expired` | string | Yes | `YYYY-MM-DD` | IELP expiry date. |
| `rater` | string/null | No | - | Rater name. May be `null` if SIMPONI user must fill it manually. |
| `fileName` | string/null | No | - | Original IELP document file name. |
| `fileUrl` | string/null | No | HTTPS URL | Download URL for the IELP document file. This is backend-only and must not be displayed as a label in the UI. |
| `fileUrlExpiresAt` | string/null | No | ISO date-time | Expiration time for the temporary file URL. |
| `fileMimeType` | string/null | No | MIME type | MIME type of the IELP file. `application/pdf` is preferred. |
| `fileSizeBytes` | number/null | No | bytes | File size in bytes. |

## File Transfer Rule

Preferred v1 method:

1. e-chain returns `fileUrl`.
2. SIMPONI backend downloads the file from e-chain after user confirms by clicking `Create IELP`.
3. SIMPONI stores the file in SIMPONI upload storage.
4. SIMPONI stores the local file path in `Ielp.file`.

For automatic webhook sync, SIMPONI downloads the file immediately while processing the webhook and stores the local file path in `Ielp.file`.

UI display rule:

- The Add IELP modal should display only `fileName`.
- The Add IELP modal should not display `fileUrl`.
- `fileUrl` should be treated as technical data used by SIMPONI backend.

## SIMPONI Field Mapping

| e-chain field | SIMPONI form field | SIMPONI database field |
| --- | --- | --- |
| `institution` | `state.institution` | `Ielp.institution` |
| `level` | `state.level` | `Ielp.level` |
| `released` | `state.released` | `Ielp.released` |
| `expired` | `state.expired` | `Ielp.expired` |
| `rater` | `state.rater` | `Ielp.rater` |
| `fileUrl` | downloaded backend file | `Ielp.file` |
| `fileName` | display/download reference | stored file original name if supported |
| `fileMimeType` | download validation | not stored |
| `fileSizeBytes` | download validation | not stored |

## SIMPONI Behavior

### Manual Pull Behavior

1. User opens `/document/ielpUser`.
2. User clicks `Add IELP`.
3. User chooses `Sync from System`.
4. User clicks `Sync IELP Data`.
5. SIMPONI frontend calls SIMPONI backend endpoint `POST /api/ielpUser/sync-echain`.
6. SIMPONI backend sends `nik` and `requestedFields` to e-chain.
7. e-chain returns IELP metadata and optional file URL.
8. SIMPONI backend validates the response.
9. SIMPONI frontend fills the add IELP form with returned metadata.
10. SIMPONI frontend shows only `fileName` and keeps `fileUrl` hidden.
11. User reviews the data and fills missing manual fields such as `rater` if needed.
12. User clicks `Create IELP`.
13. SIMPONI backend downloads the IELP file from `fileUrl` if provided.
14. SIMPONI backend stores the downloaded file in SIMPONI upload storage.
15. SIMPONI saves the reviewed IELP data and local file path to SIMPONI database.

### Automatic Push Behavior

1. e-chain verifies an IELP document.
2. e-chain calls `POST /api/integrations/e-chain/ielp-user/verified`.
3. SIMPONI validates `X-ECHAIN-WEBHOOK-SECRET`.
4. SIMPONI validates `eventId`, `eventType`, `occurredAt`, `nik`, and `data`.
5. SIMPONI finds the target user by `User.nik`.
6. SIMPONI downloads `data.fileUrl` when provided.
7. SIMPONI creates an IELP record, or updates an existing active record with the same `nik`, `institution`, `level`, `released`, and `expired`.
8. SIMPONI returns the processed action: `created` or `updated`.

## SIMPONI Backend Endpoint

```http
POST /api/ielpUser/sync-echain
```

SIMPONI backend uses the authenticated user's `req.user.nik` as the request identity. The frontend does not need to send `nik` in the request body.

Automatic webhook endpoint:

```http
POST /api/integrations/e-chain/ielp-user/verified
```

The automatic webhook endpoint does not use SIMPONI user login. It is protected by `X-ECHAIN-WEBHOOK-SECRET`.

## Development Mock Mode

During development, SIMPONI backend can return mock IELP data when:

```env
ECHAIN_MOCK_MODE=true
```

Mock mode does not download a file from e-chain because `fileUrl` is `null`. This mode is intended for UI and workflow testing before the real e-chain API is available.

## Validation Rules

| Rule | Description |
| --- | --- |
| `institution` | Required, minimum 2 characters. |
| `level` | Required. |
| `released` | Required, must be valid date in `YYYY-MM-DD` format. |
| `expired` | Required, must be valid date in `YYYY-MM-DD` format. |
| `rater` | Optional from e-chain, but SIMPONI form may require user input before save. |
| `fileUrl` | Optional, but if provided should use HTTPS. |
| Supported file types | PDF is preferred. DOC, DOCX, JPG, JPEG, and PNG may be accepted if agreed. |
| Unknown fields | SIMPONI will ignore fields that are not defined in this ICD. |

## Automatic Webhook Validation Rules

| Rule | Description |
| --- | --- |
| `X-ECHAIN-WEBHOOK-SECRET` | Required and must match SIMPONI `ECHAIN_WEBHOOK_SECRET`. |
| `eventId` | Required. Used for traceability. |
| `eventType` | Required and must be `IELP_VERIFIED`. |
| `occurredAt` | Required ISO date-time string. |
| `nik` | Required. Must match an existing `User.nik` in SIMPONI. |
| `data` | Required. Must follow the same IELP field validation rules as manual sync. |

## Idempotency Rule

In v1, SIMPONI prevents duplicate automatic IELP records by updating an existing active record with the same `nik`, `institution`, `level`, `released`, and `expired`.

For a stronger future version, SIMPONI can add database fields for `eventId` or `echainDocumentId` and use those values as the primary idempotency key.

## Error Response Example

```json
{
  "success": false,
  "message": "IELP data not found",
  "error": {
    "code": "IELP_NOT_FOUND",
    "details": "No e-chain IELP data found for nik 10011520."
  }
}
```

## Open Questions

| Question | Owner | Status |
| --- | --- | --- |
| Should e-chain return only the latest active IELP or a list of IELP records? | SIMPONI + e-chain | Open |
| Can e-chain provide a secure downloadable `fileUrl`? | e-chain | Open |
| Is `rater` available in e-chain, or should SIMPONI always require manual input? | e-chain | Open |
| How long should the `fileUrl` remain valid? | e-chain | Open |
| What authentication method will protect file download URLs? | SIMPONI + e-chain | Open |
| Should SIMPONI add database fields for `eventId` or `echainDocumentId` to improve idempotency? | SIMPONI | Open |
