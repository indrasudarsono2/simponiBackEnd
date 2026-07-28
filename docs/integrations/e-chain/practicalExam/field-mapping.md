# Practical Exam Send Field Mapping

This file records the agreed field mapping between SIMPONI practical exam data and the e-chain practical exam send payload.

## Included Fields

| SIMPONI source | e-chain field | Type | Notes |
| --- | --- | --- | --- |
| `User.professionInBranch.profession.profession` | `profession` | string/null | Examinee profession. |
| `PracticalTest.updatedAt` or `PracticalRecheckAttempt.updatedAt` | `practicalCheckedAt` | string/null | Practical check datetime. Event start date is fallback. |
| `Rating.rating` | `rating` | string/null | Rating label, for example `TWR`. |
| `userRating.expireddate` | `validUntil` | string/null | Active rating expiry. `Event.forExpiredDate` is fallback. |
| `PracticalTest.file` or `PracticalRecheckAttempt.file` | `file.fileName` | string | Original stored PDF filename. |
| signed practical/recheck file URL | `file.fileUrl` | string | Signed SIMPONI URL for e-chain to download. |
| PDF validation | `file.fileMimeType` | string | Always `application/pdf`. |

## Notes

SIMPONI sends one practical or practical recheck row per request. Send history is stored in `PracticalExamEchainSync`, not in the main `PracticalTest` or `PracticalRecheckAttempt` table.

SIMPONI rejects e-chain send when the practical evidence file is missing or is not a `.pdf` file.
