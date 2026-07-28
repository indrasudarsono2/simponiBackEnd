# Profile Sync Field Mapping

This file records the agreed field mapping between e-chain response data and SIMPONI profile update fields.

## Included Fields

| e-chain field | SIMPONI field | Type | Notes |
| --- | --- | --- | --- |
| `name` | `name` | string | Required by SIMPONI profile update form. |
| `dateOfBirth` | `dateOfBirth` | string | Must use `YYYY-MM-DD`. |
| `placeOfBirth` | `placeOfBirth` | string | Required by SIMPONI profile update form. |
| `personalAddress` | `personalAddress` | string | Required by SIMPONI profile update form. |
| `nationality` | `nationality` | string | Required by SIMPONI profile update form. |
| `phoneNumber` | `phoneNumber` | string/null | Required by SIMPONI profile update form. |
| `email` | `email` | string/null | Optional, but must be valid email if provided. |

## Excluded Fields

| SIMPONI field | Reason |
| --- | --- |
| `genderId` | Excluded because e-chain may use a different gender state or code. |
| `licenseUserId` | Excluded because e-chain may use a different license/user identifier state. |

## Notes

SIMPONI will preserve the existing `genderId` and `licenseUserId` values during profile sync.

