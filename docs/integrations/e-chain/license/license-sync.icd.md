# License Sync ICD

## Document Status

| Item | Value |
| --- | --- |
| Integration | SIMPONI license document sync from e-chain |
| Version | v1.0-draft |
| Status | Draft |
| Created | 2026-07-10 |

## Purpose

This ICD defines the API contract for syncing user license document data from e-chain into SIMPONI.

In SIMPONI, this integration supports the `Sync from External System` feature in the add license modal on `/document/license`.

## Scope

This integration covers license metadata and, when available, the license document file.

Current SIMPONI license fields:

| SIMPONI field | Description |
| --- | --- |
| `note` | License description shown in the license table. |
| `licenseExpiredDate` | License expiration date selected in the add/update form. |
| `file` | Optional license document file uploaded to SIMPONI. |

## Proposed Endpoint

Final endpoint path must be confirmed with the e-chain team.

```http
POST /api/integrations/simponi/license
```

Full URL example:

```text
{ECHAIN_BASE_URL}/api/integrations/simponi/license
```

## Request From SIMPONI

SIMPONI sends the user identity and the exact fields it wants to receive.

```json
{
  "nik": "10011520",
  "requestedFields": [
    "note",
    "licenseExpiredDate",
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
| `nik` | string | Yes | SIMPONI user NIK used to find matching license data in e-chain. |
| `requestedFields` | string[] | Yes | List of license fields requested by SIMPONI. |

## Response From e-chain

e-chain should return the latest active license data for the requested user.

```json
{
  "success": true,
  "message": "License data found",
  "data": {
    "note": "License 2025 SMT 1",
    "licenseExpiredDate": "2025-12-31",
    "fileName": "indra-license-2025-smt-1.pdf",
    "fileUrl": "https://echain.example.com/files/licenses/indra-license-2025-smt-1.pdf",
    "fileUrlExpiresAt": "2026-07-10T10:30:00Z",
    "fileMimeType": "application/pdf",
    "fileSizeBytes": 245000
  }
}
```

## Response Fields

| Field | Type | Required | Format | Description |
| --- | --- | --- | --- | --- |
| `note` | string | Yes | - | License description to store in SIMPONI. |
| `licenseExpiredDate` | string | Yes | `YYYY-MM-DD` | License expiration date. |
| `fileName` | string/null | No | - | Original license document file name. |
| `fileUrl` | string/null | No | HTTPS URL | Download URL for the license document file. This is backend-only and must not be displayed as a label in the UI. |
| `fileUrlExpiresAt` | string/null | No | ISO date-time | Expiration time for the temporary file URL. |
| `fileMimeType` | string/null | No | MIME type | MIME type of the license file. `application/pdf` is preferred. |
| `fileSizeBytes` | number/null | No | bytes | File size in bytes. |

## File Transfer Rule

Preferred v1 method:

1. e-chain returns `fileUrl`.
2. SIMPONI backend downloads the file from e-chain.
3. SIMPONI stores the file in SIMPONI upload storage.
4. SIMPONI stores the local file path in `License.file`.

UI display rule:

- The license modal should display only `fileName` in the License File segment.
- The license modal should not display `fileUrl`.
- `fileUrl` should be treated as technical data used by SIMPONI backend to download the file after user confirms by clicking `Create License`.

If e-chain cannot provide a downloadable URL, an alternative `fileBase64` method can be discussed in a later ICD version.

## SIMPONI Field Mapping

| e-chain field | SIMPONI form field | SIMPONI database field |
| --- | --- | --- |
| `note` | `state.note` | `License.note` |
| `licenseExpiredDate` | `state.licenseExpiredDate` | `License.expiredDate` |
| `fileUrl` | downloaded backend file | `License.file` |
| `fileName` | display/download reference | stored file original name if supported |
| `fileMimeType` | download validation | not stored |
| `fileSizeBytes` | download validation | not stored |

## SIMPONI Behavior

1. User opens `/document/license`.
2. User clicks `Add License`.
3. User clicks `Sync`.
4. SIMPONI frontend calls SIMPONI backend endpoint `POST /api/licenseUser/sync-echain`.
5. SIMPONI backend sends `nik` and `requestedFields` to e-chain.
6. e-chain returns license metadata and optional file URL.
7. SIMPONI backend validates the response.
8. SIMPONI frontend fills the add license form with returned metadata.
9. SIMPONI frontend shows only `fileName` in the License File segment and keeps `fileUrl` hidden.
10. User reviews the data.
11. User clicks `Create License`.
12. SIMPONI backend downloads the license file from `fileUrl`.
13. SIMPONI backend stores the downloaded file in SIMPONI upload storage.
14. SIMPONI saves the reviewed license data and local file path to SIMPONI database.

## SIMPONI Backend Endpoint

The frontend should not call e-chain directly. The frontend should call SIMPONI backend, then SIMPONI backend calls e-chain using this ICD.

```http
POST /api/licenseUser/sync-echain
```

SIMPONI backend uses the authenticated user's `req.user.nik` as the request identity. The frontend does not need to send `nik` in the request body.

## Development Mock Mode

During development, SIMPONI backend can return mock license data when:

```env
ECHAIN_MOCK_MODE=true
```

In mock mode, `POST /api/licenseUser/sync-echain` returns mock metadata so the Add License modal can fill:

| Modal field | Mock value |
| --- | --- |
| Note | `License 2025 SMT 1` |
| License Expiration Date | `2025-12-31` |
| License File label | `indra-license-2025-smt-1.pdf` |

Mock mode does not download a file from e-chain because `fileUrl` is `null`. This mode is intended for UI and workflow testing before the real e-chain API is available.

## Validation Rules

| Rule | Description |
| --- | --- |
| `note` | Required, minimum 2 characters. |
| `licenseExpiredDate` | Required, must be valid date in `YYYY-MM-DD` format. |
| `fileUrl` | Optional, but if provided should use HTTPS. |
| Supported file types | PDF is preferred. DOC and DOCX may be accepted if agreed. |
| Unknown fields | SIMPONI will ignore fields that are not defined in this ICD. |

## Error Response Example

```json
{
  "success": false,
  "message": "License data not found",
  "error": {
    "code": "LICENSE_NOT_FOUND",
    "details": "No e-chain license data found for nik 10011520."
  }
}
```

## Open Questions

| Question | Owner | Status |
| --- | --- | --- |
| Should e-chain return only the latest active license or a list of license documents? | SIMPONI + e-chain | Open |
| Can e-chain provide a secure downloadable `fileUrl`? | e-chain | Open |
| How long should the `fileUrl` remain valid? | e-chain | Open |
| Should SIMPONI store the e-chain file directly, or only store metadata and link back to e-chain? | SIMPONI + e-chain | Open |
| What authentication method will protect file download URLs? | SIMPONI + e-chain | Open |
