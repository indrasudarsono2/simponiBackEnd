# e-chain Common Integration Rules

This document defines shared rules for all SIMPONI integrations with e-chain.

## Direction

Unless stated otherwise in a specific ICD:

1. SIMPONI sends a request to e-chain.
2. e-chain returns data requested by SIMPONI.
3. SIMPONI reviews, validates, and stores the data in SIMPONI database.

## Base URL

The final base URL will be confirmed with the e-chain team.

```text
ECHAIN_BASE_URL=https://echain.example.com
```

## Authentication

Authentication method is still open and must be confirmed.

Recommended options:

| Option | Description |
| --- | --- |
| Bearer token | SIMPONI sends `Authorization: Bearer <token>`. |
| API key | SIMPONI sends a shared key in a header such as `X-API-Key`. |

## Required Headers

```http
Content-Type: application/json
Accept: application/json
```

Authentication headers will be added after the agreed method is confirmed.

## Standard Success Response

All e-chain APIs should return a consistent success envelope:

```json
{
  "success": true,
  "message": "Data found",
  "data": {}
}
```

## Standard Error Response

All e-chain APIs should return a consistent error envelope:

```json
{
  "success": false,
  "message": "Data not found",
  "error": {
    "code": "DATA_NOT_FOUND",
    "details": "No matching record found for the provided identity."
  }
}
```

## Date Format

Dates must use ISO date format without time:

```text
YYYY-MM-DD
```

Example:

```text
1992-11-04
```

## Null and Missing Field Behavior

If e-chain has no value for a requested field, e-chain should return the field with `null`.

Example:

```json
{
  "phoneNumber": null
}
```

If e-chain does not support a requested field, e-chain should return an error or include the unsupported field list, depending on the specific ICD.

## Timeout and Retry

Initial recommendation:

| Item | Value |
| --- | --- |
| Timeout | 10 seconds |
| Retry | No automatic retry for profile sync |

Retry rules may be different for future integrations.

## Versioning

Each ICD should include a version number.

Recommended format:

```text
v1.0-draft
```

## Development Mock Mode

During development, SIMPONI backend can return mock e-chain responses without calling the real e-chain API.

```env
ECHAIN_MOCK_MODE=true
```

Mock mode is intended for UI and workflow testing only. Production must use the real e-chain API.
