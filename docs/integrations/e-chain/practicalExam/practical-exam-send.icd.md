# Practical Exam Send ICD

## Document Status

| Item | Value |
| --- | --- |
| Integration | SIMPONI practical exam result send to e-chain |
| Version | v1.1-draft |
| Status | Draft |
| Created | 2026-07-12 |
| Updated | 2026-07-12 |

## Purpose

This ICD defines the API contract for sending checked SIMPONI practical examination data to e-chain from `/practicalExam/practical`.

The e-chain v1 interface only requires:

1. `profession`
2. `practicalCheckedAt`
3. `rating`
4. `validUntil`
5. `file`

## Proposed Endpoint Provided By e-chain

Final endpoint path must be confirmed with the e-chain team.

```http
POST /api/integrations/simponi/practical-exam
```

Full URL example:

```text
{ECHAIN_BASE_URL}/api/integrations/simponi/practical-exam
```

## SIMPONI Backend Endpoints

Review endpoint used before sending:

```http
GET /api/practicalExam/{practicalTestId}/echain-payload
```

Send endpoint:

```http
POST /api/practicalExam/{practicalTestId}/send-echain
```

One-time practical recheck review endpoint:

```http
GET /api/practicalExam/recheck/{recheckAttemptId}/echain-payload
```

One-time practical recheck send endpoint:

```http
POST /api/practicalExam/recheck/{recheckAttemptId}/send-echain
```

## Request From SIMPONI

```json
{
  "profession": "Air Traffic Controller",
  "practicalCheckedAt": "2026-07-12T02:30:00.000Z",
  "rating": "TWR",
  "validUntil": "2027-07-12T16:59:59.000Z",
  "file": {
    "fileName": "twr-steve-practical.pdf",
    "fileUrl": "https://simponi.example.com/files/1752322200/signed-token/practicalTest/twr-steve-practical.pdf",
    "fileMimeType": "application/pdf"
  },
  "requestedFields": [
    "profession",
    "practicalCheckedAt",
    "rating",
    "validUntil",
    "file"
  ]
}
```

## Request Fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `profession` | string/null | Yes | Examinee profession from SIMPONI `User.professionInBranch.profession.profession`. |
| `practicalCheckedAt` | string/null | Yes | Practical check datetime. SIMPONI uses `PracticalTest.updatedAt` after score input, falling back to event start date. |
| `rating` | string/null | Yes | Rating name, for example `TWR`. |
| `validUntil` | string/null | Yes | Rating validity datetime. SIMPONI uses active `userRating.expireddate`, falling back to `Event.forExpiredDate`. |
| `file.fileName` | string | Yes | PDF file name. |
| `file.fileUrl` | string | Yes | Signed SIMPONI file URL for e-chain to download. |
| `file.fileMimeType` | string | Yes | Must be `application/pdf`. |

## Response From e-chain

```json
{
  "success": true,
  "message": "Practical exam data received",
  "data": {
    "echainRequestId": "ECHAIN-PRACTICAL-2026-0001",
    "status": "RECEIVED"
  }
}
```

## SIMPONI Behavior

1. Checker opens `/practicalExam/practical`.
2. Checker inputs or updates a practical exam score and uploads a PDF evidence file.
3. SIMPONI shows the row-level e-chain button after the `File` column.
4. SIMPONI may show `SUCCESS` and `FAILED` practical/recheck records for review/history.
5. Only `SUCCESS` practical or practical recheck data can be sent to e-chain.
6. Checker clicks `Send`.
7. SIMPONI calls `GET /api/practicalExam/{practicalTestId}/echain-payload`.
8. SIMPONI validates that the practical status is `SUCCESS` and the evidence file is PDF.
9. SIMPONI shows a confirmation modal with the exact five fields that will be sent.
10. Checker confirms `Send to e-chain`.
11. SIMPONI calls e-chain using `POST {ECHAIN_BASE_URL}{ECHAIN_PRACTICAL_EXAM_SEND_PATH}`.
12. SIMPONI stores the request, response, status, and error message in `PracticalExamEchainSync`.
13. Frontend refreshes the table and shows `Sent` or `Retry`.

## PDF File Rule

The practical evidence file must be PDF before SIMPONI sends data to e-chain.

If the stored practical evidence file is missing or not `.pdf`, SIMPONI returns an error and does not open the confirmation modal.

FAILED practical/recheck data is visible in SIMPONI for review, but SIMPONI does not send FAILED practical/recheck data to e-chain.

## Public File URL Rule

SIMPONI sends a signed file URL in `file.fileUrl`.

For production, set:

```env
SIMPONI_PUBLIC_BASE_URL=https://your-simponi-domain.example
```

If `SIMPONI_PUBLIC_BASE_URL` is empty, SIMPONI builds the URL from the current request host.

## Sync Tracking

SIMPONI stores each send attempt in `PracticalExamEchainSync`.

| Field | Purpose |
| --- | --- |
| `practicalTestId` | Related `PracticalTest.id`. |
| `practicalRecheckAttemptId` | Related `PracticalRecheckAttempt.id` when the send source is a one-time recheck attempt. |
| `echainRequestId` | e-chain response reference when available. |
| `status` | `SUCCESS`, `FAILED`, or `PENDING`. |
| `requestPayload` | Exact JSON sent to e-chain. |
| `responsePayload` | Exact JSON returned by e-chain. |
| `errorMessage` | Failure reason when send fails. |
| `sentAt` | Datetime when e-chain accepted the payload. |

## Development Mock Mode

During development, SIMPONI backend can return mock send success when:

```env
ECHAIN_MOCK_MODE=true
```

Mock mode still creates a `PracticalExamEchainSync` record so the UI can show `Sent`.

## Error Response Example

```json
{
  "success": false,
  "message": "Failed to receive practical exam data",
  "error": {
    "code": "PRACTICAL_EXAM_REJECTED",
    "details": "Practical exam result already exists in e-chain."
  }
}
```
