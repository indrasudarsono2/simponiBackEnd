# e-chain Integration Documents

This folder contains Interface Control Documents (ICD) for integrations between SIMPONI and the e-chain application.

Each integration area has its own folder so the contract, examples, mapping notes, and open questions can be managed together.

## Folder Structure

```text
e-chain/
  README.md
  common.md
  changelog.md
  profile/
    profile-sync.icd.md
    field-mapping.md
    sample-request.json
    sample-response-success.json
    sample-response-error.json
  license/
    license-sync.icd.md
    field-mapping.md
    sample-request.json
    sample-response-success.json
    sample-response-error.json
  ielpUser/
    ielp-user-sync.icd.md
    field-mapping.md
    sample-request.json
    sample-response-success.json
    sample-response-error.json
    sample-webhook-request.json
    sample-webhook-response-success.json
  medexUser/
    medex-user-sync.icd.md
    field-mapping.md
    sample-request.json
    sample-response-success.json
    sample-response-error.json
    sample-webhook-request.json
    sample-webhook-response-success.json
  practicalExam/
    practical-exam-send.icd.md
    field-mapping.md
    sample-request.json
    sample-response-success.json
    sample-response-error.json
```

## Current Integration Areas

| Area | Description | Status |
| --- | --- | --- |
| `profile` | Sync user biodata and contact data from e-chain to SIMPONI profile update form. | Draft |
| `license` | Sync user license metadata and document file reference from e-chain to SIMPONI license document form. | Draft |
| `ielpUser` | Sync user IELP metadata and document file reference from e-chain to SIMPONI by manual pull and automatic verified webhook. | Draft |
| `medexUser` | Sync user MEDEX metadata and document file reference from e-chain to SIMPONI by manual pull and automatic verified webhook. | Draft |
| `practicalExam` | Send checked practical exam result data from SIMPONI to e-chain from the practical exam table. | Draft |

## Shared Rules

Shared API rules, response envelope, authentication assumptions, and format standards are defined in [common.md](./common.md).
