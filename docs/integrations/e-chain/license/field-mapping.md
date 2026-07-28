# License Sync Field Mapping

This file records the agreed field mapping between e-chain response data and SIMPONI license document fields.

## Included Fields

| e-chain field | SIMPONI field | Type | Notes |
| --- | --- | --- | --- |
| `note` | `note` | string | Required by SIMPONI add license form. |
| `licenseExpiredDate` | `licenseExpiredDate` | string | Must use `YYYY-MM-DD`. |
| `fileName` | file display/reference | string/null | Optional original file name from e-chain. |
| `fileUrl` | `file` | string/null | Optional URL used by SIMPONI backend to download the document. |
| `fileUrlExpiresAt` | download metadata | string/null | Optional expiration time for the temporary file URL. |
| `fileMimeType` | download validation | string/null | Optional MIME type. `application/pdf` is preferred. |
| `fileSizeBytes` | download validation | number/null | Optional file size in bytes. |

## Excluded Fields

| Field | Reason |
| --- | --- |
| `licenseUserId` | Excluded because it belongs to user identity/profile and may have different state in e-chain. |
| `genderId` | Not relevant to license document sync. |

## Notes

SIMPONI currently stores license files as local upload paths in `License.file`. If e-chain sends `fileUrl`, SIMPONI backend should download the file and store it in SIMPONI upload storage before saving the license record.

The UI should show only `fileName` in the License File segment. The UI should not show `fileUrl`.
