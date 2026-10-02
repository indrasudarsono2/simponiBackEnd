# Practical Exam Send Field Mapping

This file records the agreed field mapping between SIMPONI practical exam data and the e-chain practical exam send payload.

## Included Fields

| SIMPONI source | e-chain field | Type | Notes |
| --- | --- | --- | --- |
| `User.professionInBranch.profession.profession` | `profession` | string/null | Examinee profession. |
| `PracticalTest.updatedAt` or `PracticalRecheckAttempt.updatedAt` | `practicalCheckedAt` | string/null | Practical check datetime. Event start date is fallback. |
| `Rating.rating` | `rating` | string/null | Rating label, for example `TWR`. |
| `AppRating.practicalLicense.expiredDate` | `validUntil` | string/null | Rating license expiry, populated from `Event.forExpiredDate`. |
| `AppRating.practicalLicense.file` | `file.fileName` | string | Rating license PDF filename. |
| signed rating license URL | `file.fileUrl` | string | Signed SIMPONI URL for e-chain to download the license. |
| PDF validation | `file.fileMimeType` | string | Always `application/pdf`. |

## Notes

The PIC uploads one license per rating, stored in `/uploads/license` and linked to the examinee's `License` record. Live and Simulator each have their own evaluation sheet under practical evidence; evaluation sheets are never sent to e-chain. Send history remains in `PracticalExamEchainSync`.

SIMPONI rejects e-chain send when the rating license is missing or is not a `.pdf` file. The same license file cannot be sent twice successfully for the same rating.
