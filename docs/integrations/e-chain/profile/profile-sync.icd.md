# Profile Sync ICD

## Document Status

| Item | Value |
| --- | --- |
| Integration | SIMPONI profile sync from e-chain |
| Version | v1.0-draft |
| Status | Draft |
| Created | 2026-07-10 |

## Purpose

This ICD defines the API contract for syncing user profile biodata and contact data from e-chain into SIMPONI.

In SIMPONI, this integration supports the `Sync from External` feature in the profile update modal.

## Scope

This integration only covers profile biodata and contact fields.

The following fields are intentionally excluded:

| Field | Reason |
| --- | --- |
| `genderId` | e-chain may use a different gender state or code mapping. |
| `licenseUserId` | e-chain may use a different license/user identifier state. |

SIMPONI will keep existing values for excluded fields.

## Proposed Endpoint

Final endpoint path must be confirmed with the e-chain team.

```http
POST /api/integrations/simponi/profile
```

Full URL example:

```text
{ECHAIN_BASE_URL}/api/integrations/simponi/profile
```

## Request From SIMPONI

SIMPONI sends the user identity and the exact fields it wants to receive.

```json
{
  "nik": "10011520",
  "requestedFields": [
    "name",
    "dateOfBirth",
    "placeOfBirth",
    "personalAddress",
    "nationality",
    "phoneNumber",
    "email"
  ]
}
```

## Request Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `nik` | string | Yes | SIMPONI user NIK used to find matching data in e-chain. |
| `requestedFields` | string[] | Yes | List of profile fields requested by SIMPONI. |

## Response From e-chain

e-chain should return only supported profile fields requested by SIMPONI.

```json
{
  "success": true,
  "message": "Profile data found",
  "data": {
    "name": "INDRA SUDARSONO",
    "dateOfBirth": "1992-11-04",
    "placeOfBirth": "JAKARTA",
    "personalAddress": "Jl. Sudirman No. 123, Jakarta",
    "nationality": "INDONESIA",
    "phoneNumber": "081234567890",
    "email": "indra@example.com"
  }
}
```

## Response Fields

| Field | Type | Required | Format | Description |
| --- | --- | --- | --- | --- |
| `name` | string | Yes | - | Full user name. |
| `dateOfBirth` | string | Yes | `YYYY-MM-DD` | User date of birth. |
| `placeOfBirth` | string | Yes | - | User place of birth. |
| `personalAddress` | string | Yes | - | User personal address. |
| `nationality` | string | Yes | - | User nationality. |
| `phoneNumber` | string/null | Yes | - | User phone number. Return `null` if not available. |
| `email` | string/null | No | valid email | User email address. Return `null` if not available. |

## SIMPONI Field Mapping

| e-chain field | SIMPONI form field | SIMPONI database field |
| --- | --- | --- |
| `name` | `formState.name` | `user.name` |
| `dateOfBirth` | `formState.dateOfBirth` | `user.dateOfBirth` |
| `placeOfBirth` | `formState.placeOfBirth` | `user.placeOfBirth` |
| `personalAddress` | `formState.personalAddress` | `user.personalAddress` |
| `nationality` | `formState.nationality` | `user.nationality` |
| `phoneNumber` | `formState.phoneNumber` | `user.phoneNumber` |
| `email` | `formState.email` | `user.email` |

## SIMPONI Behavior

1. User opens profile page.
2. User clicks `Update Profile`.
3. User chooses `Sync from External`.
4. SIMPONI frontend calls SIMPONI backend endpoint `POST /api/profile/sync-echain`.
5. SIMPONI backend sends `nik` and `requestedFields` to e-chain.
6. e-chain returns profile data.
7. SIMPONI backend validates and filters the returned fields.
8. SIMPONI frontend fills the update form with returned data.
9. User reviews the data.
10. User clicks `Save Changes`.
11. SIMPONI saves the reviewed data to SIMPONI database.

## SIMPONI Backend Endpoint

The frontend should not call e-chain directly. The frontend should call SIMPONI backend, then SIMPONI backend calls e-chain using this ICD.

```http
POST /api/profile/sync-echain
```

SIMPONI backend uses the authenticated user's `req.user.nik` as the request identity. The frontend does not need to send `nik` in the request body.

## Validation Rules

| Rule | Description |
| --- | --- |
| `dateOfBirth` | Must be valid date in `YYYY-MM-DD` format. |
| `email` | Must be valid email if provided. May be `null`. |
| Strings | Should not include leading or trailing spaces. |
| Unknown fields | SIMPONI will ignore fields that are not defined in this ICD. |

## Error Response Example

```json
{
  "success": false,
  "message": "Profile data not found",
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "details": "No e-chain profile data found for nik 10011520."
  }
}
```

## Open Questions

| Question | Owner | Status |
| --- | --- | --- |
| What is the final e-chain base URL for development, staging, and production? | e-chain | Open |
| What authentication method will be used? | SIMPONI + e-chain | Open |
| Is `nik` enough to find a profile in e-chain, or does e-chain need another identity key? | e-chain | Open |
| Should unsupported requested fields be ignored or returned as an error? | SIMPONI + e-chain | Open |
