# USER REQUIREMENT SPECIFICATION (URS)

## SIMPONI — Sistem Informasi Manajemen Operasi (Operational Management System)

**Document Version:** 1.0  
**Date:** 2026-07-03  
**Prepared from:** Source code analysis of `server` (backend) and `simponi` (frontend) repositories

---

## 1. INTRODUCTION

### 1.1 Purpose

This User Requirement Specification (URS) defines the functional and non-functional requirements for **SIMPONI**, a web-based operational management system designed to manage aviation/air-traffic operational units. The system supports user management, branch/unit management, competency examination, duty reporting, logbooks, briefings, medical checks, and operational monitoring across a hierarchical organizational structure.

### 1.2 Scope

SIMPONI covers:

- Multi-role user management across organizational hierarchies (General → Branch → Branch Unit → Sector).
- Examination and competency assessment (essay, multiple-choice, practical exam, performance check).
- Operational duty reporting with position logging and frequency status tracking.
- Ongoing-issue management with escalation workflows.
- Document management (licenses, logbooks, IELP, MEDEX, competence certificates).
- Briefing management.
- Medical check monitoring.
- CWP (Controller Working Position) management with frequencies and supervisors.
- Shift management.
- Dashboard and reporting.

### 1.3 Definitions and Acronyms

| Term              | Definition                                                  |
| ----------------- | ----------------------------------------------------------- |
| **SIMPONI**       | Sistem Informasi Manajemen Operasi — the application name   |
| **CWP**           | Controller Working Position — a workstation/role assignment |
| **IELP**          | Indonesian English Language Proficiency                     |
| **MEDEX**         | Medical Examination                                         |
| **LHD**           | Local Handling Document / Logbook report type               |
| **NOTAM**         | Notice to Airmen                                            |
| **NIK**           | Nomor Induk Karyawan — employee ID used as login            |
| **Supervisor**    | Operational supervisor assigned to a duty report            |
| **Checker**       | Examiner/evaluator who scores examinations                  |
| **Branch**        | Operational branch (e.g., a regional ATS unit)              |
| **Branch Unit**   | Sub-unit within a branch                                    |
| **Sector**        | Operational sector within a branch unit                     |
| **Duty Report**   | Report generated per supervisor per shift per date          |
| **Ongoing Issue** | An operational issue/event tracked with escalation          |
| **Escalation**    | Process of raising an issue to higher authority levels      |
| **JWT**           | JSON Web Token — used for authentication                    |
| **URS**           | User Requirement Specification                              |

---

## 2. OVERALL DESCRIPTION

### 2.1 System Context

SIMPONI is a full-stack web application:

- **Backend (`server`):** Node.js / Express.js REST API with Prisma ORM, JWT authentication, file uploads via Multer, PostgreSQL database.
- **Frontend (`simponi`):** Nuxt 3 / Vue 3 SPA with Nuxt UI component library, role-based sidebar navigation.
- **Database:** PostgreSQL managed via Prisma schema and migrations.

### 2.2 User Roles

The system supports multiple role tiers, each with different module access configured via `rolesManagement`:

| Role Tier             | Description                     | Key Modules                                                                                                               |
| --------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **General Admin**     | Top-level administrator         | User management, branch management, system settings, branch unit management                                               |
| **Branch Admin**      | Branch-level administrator      | Sector management, CWP management, escalation, event preparation, examination setup, verification                         |
| **Branch Unit Admin** | Branch-unit-level administrator | Rating checker admin, shift management, event preparation, question preparation, examination, scoring, data, verification |
| **Supervisor**        | Operational supervisor          | Dashboard supervisor, duty report, duty briefing, briefing                                                                |
| **Doctor**            | Medical examiner                | Dashboard doctor, monitor medical test                                                                                    |
| **Checker**           | Examination evaluator           | Score, score history, checker statistic, checker history                                                                  |
| **Regular User**      | General operational user        | Dashboard, document, medical test, logbook user, examination                                                              |

### 2.3 Organizational Hierarchy

```
Region
 └── Branch
      └── Branch Unit
           └── Sector
                └── CWP (Controller Working Position)
```

Users are assigned to one or more levels of this hierarchy. Professions are associated with branches via `ProfessionInBranch`.

---

## 3. FUNCTIONAL REQUIREMENTS

### 3.1 Authentication & Profile

| ID      | Requirement                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01 | The system shall provide a login endpoint (`POST /auth/login`) accepting **NIK** and **password**.                                       |
| AUTH-02 | The system shall validate credentials against the `User` table using bcrypt password comparison.                                         |
| AUTH-03 | The system shall issue a JWT token (3-hour expiry) containing user identity, roles, branch, branch unit, sector, and profession context. |
| AUTH-04 | All API endpoints (except login) shall require JWT authentication via `authenticateToken` middleware.                                    |
| AUTH-05 | The system shall provide a profile endpoint (`GET /profile`) returning the authenticated user's profile data.                            |
| AUTH-06 | The system shall allow profile editing (`PUT /profile/:id`).                                                                             |

### 3.2 Dashboard

| ID      | Requirement                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| DASH-01 | The system shall provide an operational dashboard (`GET /dashboardOperational`) showing operational metrics. |
| DASH-02 | The system shall provide a briefings dashboard (`GET /dashboardBriefings`).                                  |
| DASH-03 | The system shall provide a dashboard token endpoint (`POST /dashboardToken`).                                |
| DASH-04 | The system shall provide a supervisor dashboard view (frontend).                                             |
| DASH-05 | The system shall provide a doctor dashboard view (frontend).                                                 |

### 3.3 User Management

#### 3.3.1 General User Management

| ID      | Requirement                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------- |
| USER-01 | The system shall allow CRUD operations on general users (`/userGeneral`).                                 |
| USER-02 | The system shall allow viewing and updating user role assignments for general users (`/userRoleGeneral`). |
| USER-03 | The system shall support role-based menu access configuration (`/rolesManagement`).                       |
| USER-04 | The system shall allow assigning menus to roles (`PUT /rolesManagement/:roleId/menus`).                   |

#### 3.3.2 Branch User Management

| ID      | Requirement                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------- |
| USER-05 | The system shall allow CRUD operations on branch users (`/userBranch`).                         |
| USER-06 | The system shall allow assigning users to branches (`POST /userBranch`).                        |
| USER-07 | The system shall allow assigning branch units to branch users (`POST /userBranch/assign-unit`). |
| USER-08 | The system shall allow viewing/updating branch user roles (`/userRoleBranch`).                  |

#### 3.3.3 Branch Unit User Management

| ID      | Requirement                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------- |
| USER-09 | The system shall allow CRUD operations on branch unit users (`/userBranchUnit`).                     |
| USER-10 | The system shall allow assigning sectors to branch unit users (`POST /userBranchUnit/assignSector`). |
| USER-11 | The system shall allow viewing/updating branch unit user roles (`/userRoleBranchUnit`).              |

#### 3.3.4 Checker User Management

| ID      | Requirement                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------ |
| USER-12 | The system shall support a checker user management view (frontend) with user list and user role. |
| USER-13 | The system shall support checker rating assignment (`/checkerRating`).                           |

### 3.4 Branch & Organizational Management

#### 3.4.1 Region Management

| ID     | Requirement                                                     |
| ------ | --------------------------------------------------------------- |
| ORG-01 | The system shall allow CRUD operations on regions (`/regions`). |

#### 3.4.2 Branch Management

| ID     | Requirement                                                       |
| ------ | ----------------------------------------------------------------- |
| ORG-02 | The system shall allow CRUD operations on branches (`/branches`). |

#### 3.4.3 Branch Unit Management

| ID     | Requirement                                                                                  |
| ------ | -------------------------------------------------------------------------------------------- |
| ORG-03 | The system shall allow CRUD operations on branch units (`/branchUnits`).                     |
| ORG-04 | The system shall allow retrieving branch units filtered by branch (`/branchUnitsGetBranch`). |

#### 3.4.4 Sector Management

| ID     | Requirement                                                                                 |
| ------ | ------------------------------------------------------------------------------------------- |
| ORG-05 | The system shall allow CRUD operations on sectors (`/sectors`).                             |
| ORG-06 | The system shall allow retrieving sectors filtered by branch unit (`/sectorGetBranchUnit`). |

#### 3.4.5 Profession Management

| ID     | Requirement                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------- |
| ORG-07 | The system shall allow CRUD operations on professions (`/professions`).                              |
| ORG-08 | The system shall allow CRUD operations on profession-in-branch associations (`/professionInBranch`). |

### 3.5 Rating Management

| ID     | Requirement                                                                               |
| ------ | ----------------------------------------------------------------------------------------- |
| RAT-01 | The system shall allow CRUD operations on ratings (`/ratings`).                           |
| RAT-02 | The system shall allow CRUD operations on rating checker admins (`/ratingCheckerAdmins`). |
| RAT-03 | The system shall provide a rating summary view (`/ratingSummary`).                        |
| RAT-04 | The system shall support mandatory items (`/mandatoryItem`) for rating requirements.      |
| RAT-05 | The system shall support mandatory rating configuration (`/mandatoryRating`).             |

### 3.6 CWP (Controller Working Position) Management

| ID     | Requirement                                                                                |
| ------ | ------------------------------------------------------------------------------------------ |
| CWP-01 | The system shall allow CRUD operations on CWPs (`/cwps`).                                  |
| CWP-02 | The system shall allow retrieving ratings related to a CWP (`/cwps/ratings`).              |
| CWP-03 | The system shall allow managing CWP-Sector associations (`/cwpSectors`).                   |
| CWP-04 | The system shall allow managing CWP frequencies (`/cwpFrequencies`).                       |
| CWP-05 | The system shall allow CRUD operations on CWP supervisors (`/cwpSupervisors`).             |
| CWP-06 | CWP frequencies shall support primary/secondary designation and status frequency tracking. |

### 3.7 Shift Management

| ID       | Requirement                                                                |
| -------- | -------------------------------------------------------------------------- |
| SHIFT-01 | The system shall allow CRUD operations on shifts (`/shifts`).              |
| SHIFT-02 | Shifts shall support time ranges including overnight shifts (start > end). |
| SHIFT-03 | Shifts shall be associated with branch units.                              |
| SHIFT-04 | The system shall sort shift details by time, with overnight shifts first.  |

### 3.8 Escalation Management

| ID     | Requirement                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------- |
| ESC-01 | The system shall allow CRUD operations on escalation levels (`/escalationLevels`).                      |
| ESC-02 | The system shall allow managing escalation actors per level (`/escalationActors`).                      |
| ESC-03 | The system shall allow retrieving users eligible as escalation actors (`/escalationActors/users`).      |
| ESC-04 | The system shall support a background worker for escalation processing (`workers/escalationWorker.js`). |

### 3.9 Event Preparation & Examination

#### 3.9.1 Session Management

| ID     | Requirement                                                       |
| ------ | ----------------------------------------------------------------- |
| EVT-01 | The system shall allow CRUD operations on sessions (`/sessions`). |

#### 3.9.2 Event Management

| ID     | Requirement                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| EVT-02 | The system shall allow CRUD operations on events (`/events`) with file upload support.                                                         |
| EVT-03 | The system shall allow managing event-user assignments (`/eventsGetUser`, `/eventsGetEventUser`, `/eventsPostUser`, `/eventsDeleteEventUser`). |
| EVT-04 | The system shall allow CRUD operations on event questions (`/eventQuestions`).                                                                 |

#### 3.9.3 Group Management

| ID     | Requirement                                                   |
| ------ | ------------------------------------------------------------- |
| EVT-05 | The system shall allow CRUD operations on groups (`/groups`). |

#### 3.9.4 Token Management

| ID     | Requirement                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------- |
| EVT-06 | The system shall allow CRUD operations on tokens (`/token`) used for event/examination access. |

#### 3.9.5 Essay Question Preparation

| ID     | Requirement                                                                               |
| ------ | ----------------------------------------------------------------------------------------- |
| EXM-01 | The system shall allow CRUD operations on essay question groups (`/questionGroupsEssay`). |
| EXM-02 | The system shall allow CRUD operations on essays (`/essays`) with file upload support.    |
| EXM-03 | The system shall support CSV import for essays (`POST /essays/import-csv`).               |
| EXM-04 | The system shall allow managing essay groups (`/essayGroups`).                            |

#### 3.9.6 Multiple Choice Question Preparation

| ID     | Requirement                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| EXM-05 | The system shall allow CRUD operations on multiple-choice question groups (`/questionGroupsMultipleChoice`). |
| EXM-06 | The system shall allow CRUD operations on multiple-choice questions (`/multipleChoices`) with file upload.   |
| EXM-07 | The system shall support CSV import for multiple-choice questions (`POST /multipleChoices/import-csv`).      |
| EXM-08 | The system shall allow managing multiple-choice groups (`/multipleChoiceGroups`).                            |

#### 3.9.7 Examination Execution

| ID     | Requirement                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------- |
| EXM-09 | The system shall provide examination data (`GET /examination`).                                          |
| EXM-10 | The system shall serve essay questions during examination (`POST /examinationEssay`).                    |
| EXM-11 | The system shall accept essay answers (`POST /examinationAnswer`).                                       |
| EXM-12 | The system shall serve multiple-choice questions during examination (`POST /examinationMultipleChoice`). |
| EXM-13 | The system shall accept multiple-choice answers (`POST /examinationMultipleChoiceAnswer`).               |

#### 3.9.8 Performance Check

| ID     | Requirement                                                                         |
| ------ | ----------------------------------------------------------------------------------- |
| EXM-14 | The system shall provide performance check events (`GET /performanceCheck`).        |
| EXM-15 | The system shall accept performance check essay answers (`POST /performanceCheck`). |

#### 3.9.9 Practical Exam

| ID     | Requirement                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------- |
| EXM-16 | The system shall allow retrieving practical exam data (`GET /practicalExam`).                        |
| EXM-17 | The system shall allow updating practical exam records with file uploads (`PUT /practicalExam/:id`). |

#### 3.9.10 Preview

| ID     | Requirement                                                                         |
| ------ | ----------------------------------------------------------------------------------- |
| EXM-18 | The system shall allow submitting preview data with file uploads (`POST /preview`). |

### 3.10 Scoring & Checker

| ID     | Requirement                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| SCR-01 | The system shall provide user scores (`GET /scoreUser`).                                                    |
| SCR-02 | The system shall provide user practical exam scores (`GET /scoreUserPractical`).                            |
| SCR-03 | The system shall provide checker scores (`GET /scoreChecker`).                                              |
| SCR-04 | The system shall allow posting checker scores (`POST /scoreChecker`).                                       |
| SCR-05 | The system shall allow posting checker score evidence (`POST /scoreCheckerEvidance`).                       |
| SCR-06 | The system shall provide checker practical scores (`GET /scoreCheckerPractical`).                           |
| SCR-07 | The system shall allow posting checker practical scores (`POST /scoreCheckerPractical`).                    |
| SCR-08 | The system shall provide checker history (`GET /checkerHistory`).                                           |
| SCR-09 | The system shall allow posting checker history (`POST /checkerHistory`).                                    |
| SCR-10 | The system shall provide checker statistics by member (`GET /checkerStatistic`).                            |
| SCR-11 | The system shall allow posting checker statistics by member (`POST /checkerStatistic`).                     |
| SCR-12 | The system shall provide checker statistics by question (`GET /checkerStatisticQuestion`).                  |
| SCR-13 | The system shall allow viewing question detail in checker statistics (`PUT /checkerStatisticQuestion/:id`). |

### 3.11 Data Management (IELP, MEDEX, Competence)

| ID      | Requirement                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------- |
| DATA-01 | The system shall allow CRUD operations on IELP user records (`/ielpUser`) with file upload.             |
| DATA-02 | The system shall allow CRUD operations on MEDEX user records (`/medexUser`) with file upload.           |
| DATA-03 | The system shall allow CRUD operations on competence user records (`/competenceUser`) with file upload. |
| DATA-04 | The system shall provide checker data views for IELP (`GET /dataCheckerIelp`).                          |
| DATA-05 | The system shall provide checker data views for MEDEX (`GET /dataCheckerMedex`).                        |
| DATA-06 | The system shall provide checker data views for competence (`GET /dataCheckerCompetence`).              |

### 3.12 Document Management

| ID     | Requirement                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------- |
| DOC-01 | The system shall allow CRUD operations on license user documents (`/licenseUser`) with file upload. |
| DOC-02 | The system shall allow CRUD operations on logbook user documents (`/logbookUser`) with file upload. |
| DOC-03 | The system shall provide an e-logbook user view (`/eLogbookUser`).                                  |
| DOC-04 | The system shall allow CRUD operations on application documents (`/applicationDocument`).           |

### 3.13 Verification

| ID     | Requirement                                                                          |
| ------ | ------------------------------------------------------------------------------------ |
| VER-01 | The system shall provide verification initialization data (`GET /verificationInit`). |
| VER-02 | The system shall provide verification data (`POST /verification`).                   |
| VER-03 | The system shall provide verification item data (`POST /verificationItem`).          |
| VER-04 | The system shall allow posting verification results (`POST /verificationPost`).      |
| VER-05 | The system shall provide verification detail (`POST /getVerificationDetail`).        |

### 3.14 Room Management

| ID      | Requirement                                                                         |
| ------- | ----------------------------------------------------------------------------------- |
| ROOM-01 | The system shall allow CRUD operations on rooms (`/room`) with file upload support. |

### 3.15 Medical Check

| ID     | Requirement                                                                               |
| ------ | ----------------------------------------------------------------------------------------- |
| MED-01 | The system shall allow a user to view their own medical checks (`GET /medicalCheck/my`).  |
| MED-02 | The system shall allow a user to create a medical check (`POST /medicalCheck`).           |
| MED-03 | The system shall allow monitoring medical checks by branch (`GET /medicalCheck/monitor`). |
| MED-04 | The system shall allow verifying a medical check (`PUT /medicalCheck/:id/verify`).        |

### 3.16 Briefing Management

| ID     | Requirement                                                                             |
| ------ | --------------------------------------------------------------------------------------- |
| BRF-01 | The system shall allow retrieving briefings (`POST /briefings`).                        |
| BRF-02 | The system shall allow creating briefings with file uploads (`POST /briefings/create`). |
| BRF-03 | The system shall allow updating briefings with file uploads (`PUT /briefings/:id`).     |
| BRF-04 | The system shall allow deleting briefings (`DELETE /briefings/:id`).                    |

### 3.17 Duty Report Management

| ID      | Requirement                                                                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DUTY-01 | The system shall allow a supervisor to view their own duty reports for the current day (`GET /dutyReports/my`).                                                         |
| DUTY-02 | The system shall allow viewing all duty reports for a branch unit filtered by date (`GET /dutyReports`).                                                                |
| DUTY-03 | The system shall allow viewing a duty report recap with full related data including logbooks, status frequencies, and LHD reports (`GET /dutyReports/recap`).           |
| DUTY-04 | The system shall allow a supervisor to create a duty report by selecting a supervisor, shift name, and date (`POST /dutyReports/supervisor`).                           |
| DUTY-05 | The system shall prevent duplicate duty reports for the same supervisor, shift, and date.                                                                               |
| DUTY-06 | The system shall provide a deletion summary showing dependent records before deletion (`GET /dutyReports/:id/deletion-summary`).                                        |
| DUTY-07 | The system shall allow soft-deleting a duty report and cascading soft-delete to status frequencies, logbooks, LHD reports, and issue links (`DELETE /dutyReports/:id`). |
| DUTY-08 | The system shall provide status frequency options (`GET /statusFreqs`).                                                                                                 |
| DUTY-09 | The system shall allow viewing duty report frequencies (`GET /dutyReports/:dutyReportId/frequencies`).                                                                  |
| DUTY-10 | The system shall allow saving duty report frequency status (`PUT /dutyReports/:dutyReportId/frequencies/:cwpFrequencyId`).                                              |

### 3.18 Position Log

| ID     | Requirement                                                                           |
| ------ | ------------------------------------------------------------------------------------- |
| POS-01 | The system shall provide position log setup data (`GET /positionLogs/:dutyReportId`). |
| POS-02 | The system shall allow saving position logs (`POST /positionLogs/:dutyReportId`).     |

### 3.19 Ongoing Issue Management

| ID     | Requirement                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| ISS-01 | The system shall allow viewing ongoing issues (`GET /onGoingIssues`).                                                              |
| ISS-02 | The system shall allow creating an ongoing issue (`POST /onGoingIssues`).                                                          |
| ISS-03 | The system shall allow adding messages to an ongoing issue (`POST /onGoingIssues/:id/messages`).                                   |
| ISS-04 | The system shall allow closing an ongoing issue (`PATCH /onGoingIssues/:id/close`).                                                |
| ISS-05 | The system shall allow cancelling escalation of an ongoing issue (`PATCH /onGoingIssues/:id/escalation/cancel`).                   |
| ISS-06 | The system shall allow cancelling escalation at a specific level (`PATCH /onGoingIssues/:id/escalations/:levelId/cancel`).         |
| ISS-07 | The system shall allow attaching an ongoing issue to a duty report (`POST /dutyReports/:dutyReportId/issues`).                     |
| ISS-08 | The system shall allow detaching an ongoing issue from a duty report (`DELETE /dutyReports/:dutyReportId/issues/:onGoingIssueId`). |

### 3.20 LHD Report Management

| ID     | Requirement                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| LHD-01 | The system shall provide LHD books (`GET /lhdBooks`).                                                        |
| LHD-02 | The system shall allow viewing LHD reports for a duty report (`GET /dutyReports/:dutyReportId/lhdReports`).  |
| LHD-03 | The system shall allow creating an LHD report (`POST /dutyReports/:dutyReportId/lhdReports`).                |
| LHD-04 | The system shall allow updating an LHD report (`PUT /dutyReports/:dutyReportId/lhdReports/:lhdReportId`).    |
| LHD-05 | The system shall allow deleting an LHD report (`DELETE /dutyReports/:dutyReportId/lhdReports/:lhdReportId`). |

### 3.21 Logbook Management

#### 3.21.1 Daily Logbook

| ID     | Requirement                                                                               |
| ------ | ----------------------------------------------------------------------------------------- |
| LOG-01 | The system shall provide daily logbook data (`GET /dailyLogbook`).                        |
| LOG-02 | The system shall provide daily logbook data for GA/general admin (`GET /dailyLogbookGa`). |

#### 3.21.2 Personal Logbook

| ID     | Requirement                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| LOG-03 | The system shall allow viewing users by branch unit for personal logbook (`GET /personalLogbook/users`).                     |
| LOG-04 | The system shall provide personal logbook data (`GET /personalLogbook`).                                                     |
| LOG-05 | The system shall allow viewing users by branch for personal logbook GA (`GET /personalLogbookGa/users-by-branch/:branchId`). |
| LOG-06 | The system shall provide personal logbook GA data (`POST /personalLogbookGa`).                                               |

### 3.22 Monitor Time

| ID     | Requirement                                                          |
| ------ | -------------------------------------------------------------------- |
| MON-01 | The system shall allow posting monitor time data (`POST /postTime`). |

---

## 4. NON-FUNCTIONAL REQUIREMENTS

### 4.1 Security

| ID     | Requirement                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01 | The system shall use JWT-based authentication with a 3-hour token expiry.                                                         |
| SEC-02 | The system shall store passwords hashed using bcrypt.                                                                             |
| SEC-03 | All API endpoints (except login) shall require a valid JWT token.                                                                 |
| SEC-04 | The system shall use soft-delete (`deletedAt`) for data retention — records are not physically deleted.                           |
| SEC-05 | The system shall enforce branch-unit-level data isolation for duty reports (users can only access data within their branch unit). |
| SEC-06 | Role-based access control (RBAC) shall be enforced via `rolesManagement` with menu-level permissions.                             |

### 4.2 Performance

| ID      | Requirement                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------- |
| PERF-01 | The system shall use database-level filtering via Prisma to avoid loading unnecessary data.             |
| PERF-02 | The system shall use indexed queries for date-range and branch-unit filtering.                          |
| PERF-03 | The system shall use `Promise.all` for parallelizable database queries (e.g., deletion summary counts). |
| PERF-04 | The system shall use database transactions for cascading operations (e.g., duty report deletion).       |

### 4.3 Data Integrity

| ID      | Requirement                                                                       |
| ------- | --------------------------------------------------------------------------------- |
| DATA-01 | The system shall use Prisma ORM for type-safe database access.                    |
| DATA-02 | The system shall validate date inputs using `yyyy-mm-dd` format.                  |
| DATA-03 | The system shall validate positive integers for IDs.                              |
| DATA-04 | The system shall prevent duplicate duty reports (same supervisor + shift + date). |
| DATA-05 | The system shall handle timezone-consistent date comparisons using UTC.           |

### 4.4 File Handling

| ID      | Requirement                                                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FILE-01 | The system shall support multipart file uploads via Multer for: briefings, competence docs, CSV imports, essays, events, IELP docs, licenses, logbook docs, MEDEX docs, multiple-choice media, practical test files, preview files, and room images. |
| FILE-02 | Uploaded files shall be stored in organized subdirectories under `/uploads`.                                                                                                                                                                         |

### 4.5 Availability & Background Processing

| ID       | Requirement                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AVAIL-01 | The system shall support a background escalation worker (`workers/escalationWorker.js`) for processing issue escalations asynchronously. |

### 4.6 Usability

| ID    | Requirement                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| UI-01 | The frontend shall provide role-based sidebar navigation showing only modules accessible to the user's role. |
| UI-02 | The frontend shall use Nuxt UI components with Lucide icons for consistent visual language.                  |
| UI-03 | The frontend shall support hierarchical navigation (collapsible groups with child items).                    |

### 4.7 Technology Stack

| Component          | Technology                                         |
| ------------------ | -------------------------------------------------- |
| Backend framework  | Express.js (Node.js, ESM)                          |
| ORM                | Prisma                                             |
| Database           | PostgreSQL                                         |
| Authentication     | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`)          |
| File upload        | Multer                                             |
| Frontend framework | Nuxt 3 / Vue 3                                     |
| UI library         | Nuxt UI (Lucide icons)                             |
| Language           | JavaScript (backend), TypeScript (frontend config) |

---

## 5. MODULE ACCESS MATRIX

The following matrix maps role tiers to functional modules based on the frontend sidebar configuration:

| Module                        | General Admin | Branch Admin | Branch Unit Admin | Supervisor     | Doctor     | Checker | User            |
| ----------------------------- | ------------- | ------------ | ----------------- | -------------- | ---------- | ------- | --------------- |
| Dashboard                     | ✓             | ✓            | ✓                 | ✓ (Supervisor) | ✓ (Doctor) | —       | ✓ (Operational) |
| Branch Management             | ✓             | —            | —                 | —              | —          | —       | —               |
| Branch Unit Management        | ✓             | —            | —                 | —              | —          | —       | —               |
| User Management (General)     | ✓             | —            | —                 | —              | —          | —       | —               |
| User Management (Branch)      | —             | ✓            | —                 | —              | —          | —       | —               |
| User Management (Branch Unit) | —             | —            | ✓                 | —              | —          | —       | —               |
| User Management (Checker)     | —             | —            | ✓                 | —              | —          | —       | —               |
| Sector Management             | —             | ✓            | —                 | —              | —          | —       | —               |
| CWP Management                | —             | ✓            | —                 | —              | —          | —       | —               |
| Escalation                    | —             | ✓            | —                 | —              | —          | —       | —               |
| Roles Management              | ✓             | —            | —                 | —              | —          | —       | —               |
| Rating Management             | ✓             | —            | —                 | —              | —          | —       | —               |
| Profession Management         | ✓             | ✓            | —                 | —              | —          | —       | —               |
| Event Preparation             | —             | ✓            | ✓                 | —              | —          | —       | —               |
| Multiple Choice Preparation   | —             | —            | ✓                 | —              | —          | —       | —               |
| Essay Preparation             | —             | —            | ✓                 | —              | —          | —       | —               |
| Examination                   | —             | —            | ✓                 | —              | —          | —       | ✓               |
| Verification                  | —             | —            | ✓                 | —              | —          | —       | —               |
| Performance Check             | —             | —            | ✓                 | —              | —          | —       | —               |
| Practical Exam                | —             | —            | ✓                 | —              | —          | —       | —               |
| Room                          | —             | —            | ✓                 | —              | —          | —       | —               |
| Rating Checker Admin          | —             | —            | ✓                 | —              | —          | —       | —               |
| Shift Management              | —             | —            | ✓                 | —              | —          | —       | —               |
| Rating Summary                | —             | —            | ✓                 | —              | —          | —       | —               |
| Data (IELP/MEDEX/Competence)  | —             | —            | ✓                 | —              | —          | —       | —               |
| Checker Statistic             | —             | —            | ✓                 | —              | —          | —       | —               |
| Score                         | —             | —            | ✓                 | —              | —          | ✓       | —               |
| Score History                 | —             | —            | ✓                 | —              | —          | ✓       | ✓               |
| Checker History               | —             | —            | ✓                 | —              | —          | ✓       | —               |
| Document                      | —             | —            | —                 | —              | —          | —       | ✓               |
| Application Document          | —             | —            | —                 | —              | —          | —       | ✓               |
| Medical Test                  | —             | —            | —                 | —              | —          | —       | ✓               |
| Monitor Medical Test          | —             | —            | —                 | —              | ✓          | —       | —               |
| Logbook User                  | —             | —            | —                 | —              | —          | —       | ✓               |
| Logbook Branch Unit           | —             | —            | ✓                 | —              | —          | —       | —               |
| Logbook General Admin         | ✓             | —            | —                 | —              | —          | —       | —               |
| Duty Report                   | —             | —            | —                 | ✓              | —          | —       | —               |
| Briefing                      | —             | —            | —                 | ✓              | —          | —       | —               |
| Mandatory Question            | —             | —            | ✓                 | —              | —          | —       | —               |
| Branch Reports                | ✓             | —            | —                 | —              | —          | —       | —               |

---

## 6. DATA MODEL OVERVIEW

Based on the Prisma schema, the system's core data entities include:

### 6.1 Core Entities

| Entity                                                                  | Description                                                                      |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `User`                                                                  | System user with NIK, password, name, branch/unit/sector/profession associations |
| `Role`, `RolesMenu`, `Menu`                                             | Role-based access control structure                                              |
| `Region`, `Branch`, `BranchUnit`, `Sector`                              | Organizational hierarchy                                                         |
| `Profession`, `ProfessionInBranch`                                      | Profession definitions and branch associations                                   |
| `Rating`                                                                | Rating/qualification levels                                                      |
| `Cwp`                                                                   | Controller Working Position definitions                                          |
| `CwpFrequency`                                                          | Frequencies assigned to a CWP                                                    |
| `CwpSupervisor`                                                         | Supervisor assignments to CWPs                                                   |
| `CwpSector`                                                             | CWP-Sector associations                                                          |
| `ShiftName`, `Shift`                                                    | Shift definitions with time ranges                                               |
| `DutyReport`                                                            | Supervisor duty report per shift/date                                            |
| `StatusFrequency`, `StatusFreq`                                         | Frequency status tracking per duty report                                        |
| `PositionLog`                                                           | Position logging per duty report                                                 |
| `OnGoingIssue`                                                          | Operational issue tracking                                                       |
| `DutyReportOnGoingIssue`                                                | Link table between duty reports and ongoing issues                               |
| `OnGoingIssueMessage`                                                   | Messages on an ongoing issue                                                     |
| `EscalationLevel`, `EscalationActor`                                    | Escalation configuration                                                         |
| `LhdBook`, `LhdReport`                                                  | LHD report types and records                                                     |
| `LogBook`                                                               | Logbook entries linked to duty reports                                           |
| `Supervisor`                                                            | Supervisor records per branch unit                                               |
| `Event`, `Session`, `EventQuestion`, `Group`                            | Examination event setup                                                          |
| `Essay`, `QuestionGroupEssay`, `EssayGroup`                             | Essay question bank                                                              |
| `MultipleChoice`, `QuestionGroupMultipleChoice`, `MultipleChoiceGroup`  | Multiple-choice question bank                                                    |
| `Examination`                                                           | Examination execution records                                                    |
| `ScoreUser`, `ScoreChecker`                                             | Scoring records                                                                  |
| `LicenseUser`, `LogbookUser`, `IelpUser`, `MedexUser`, `CompetenceUser` | Document management entities                                                     |
| `ApplicationDocument`                                                   | Application document records                                                     |
| `MedicalCheck`                                                          | Medical check records                                                            |
| `Briefing`                                                              | Briefing records                                                                 |
| `Room`                                                                  | Room/examination venue records                                                   |
| `Token`                                                                 | Access tokens for events/examinations                                            |
| `MandatoryItem`, `MandatoryRating`                                      | Mandatory question configuration                                                 |

### 6.2 Key Relationships

- A `User` belongs to one `Branch`, one `BranchUnit`, one `Sector`, and one `ProfessionInBranch`.
- A `DutyReport` belongs to a `Supervisor`, `ShiftName`, and is scoped to a `BranchUnit` via the supervisor's CWP.
- A `DutyReport` has many `StatusFrequency`, `LogBook`, `LhdReport`, and `OnGoingIssue` (via link table).
- A `Cwp` has many `CwpFrequency` and `CwpSupervisor`, and is associated with `Sector`s via `CwpSector`.
- An `OnGoingIssue` has many `OnGoingIssueMessage` and can be linked to multiple `DutyReport`s.
- `EscalationLevel` has `EscalationActor`s (users who receive escalations at that level).
- Soft-delete is used universally via `deletedAt` field.

---

## 7. API ENDPOINT SUMMARY

The system exposes 130+ REST API endpoints organized by domain. All endpoints (except `/auth/login`) require JWT authentication.

### 7.1 Authentication

- `POST /auth/login`

### 7.2 Profile

- `GET /profile`, `PUT /profile/:id`

### 7.3 Dashboard

- `GET /dashboardOperational`, `GET /dashboardBriefings`, `POST /dashboardToken`

### 7.4 Organization

- Regions, Branches, Professions, Ratings, Branch Units, Sectors, Profession-in-Branch (full CRUD)

### 7.5 Users & Roles

- User General, User Role General, User Branch, User Role Branch, User Branch Unit, User Role Branch Unit, Roles Management, Checker Rating (full CRUD/assignments)

### 7.6 CWP

- CWPs, CWP Sectors, CWP Frequencies, CWP Supervisors (full CRUD)

### 7.7 Escalation

- Escalation Levels (CRUD), Escalation Actors (read/update)

### 7.8 Shifts

- Shifts (full CRUD)

### 7.9 Event Preparation

- Sessions, Events, Groups, Event Questions, Tokens (full CRUD with file uploads)

### 7.10 Examination Content

- Essay Groups, Essays (with CSV import), Multiple Choice Groups, Multiple Choices (with CSV import), Question Groups (full CRUD with file uploads)

### 7.11 Examination Execution

- Examination, Essay Questions/Answers, Multiple Choice Questions/Answers

### 7.12 Scoring

- Score User, Score Checker, Score Checker Evidence, Score Checker Practical (read/post)

### 7.13 Checker Data & Statistics

- Data Checker (IELP, MEDEX, Competence), Checker History, Checker Statistics (Member, Question)

### 7.14 Documents

- License User, Logbook User, E-Logbook User, IELP User, MEDEX User, Competence User, Application Document (full CRUD with file uploads)

### 7.15 Verification

- Verification Init, Verification, Verification Item, Verification Post, Verification Detail

### 7.16 Room

- Room (full CRUD with file uploads)

### 7.17 Medical Check

- My Medical Checks, Create Medical Check, Monitor Medical Checks, Verify Medical Check

### 7.18 Briefing

- Briefings (retrieve, create, update, delete with file uploads)

### 7.19 Duty Report

- My Duty Reports, Duty Reports (by date), Duty Report Recap, Create Supervisor Duty Report, Deletion Summary, Delete Duty Report, Status Frequency Options, Duty Report Frequencies, Save Frequency Status

### 7.20 Position Log

- Position Log Setup, Save Position Logs

### 7.21 Ongoing Issues

- Get Ongoing Issues, Create Ongoing Issue, Add Message, Close Issue, Cancel Escalation, Cancel Escalation Level, Attach/Detach to Duty Report

### 7.22 LHD Reports

- LHD Books, Duty Report LHD Reports (CRUD)

### 7.23 Logbooks

- Daily Logbook, Daily Logbook GA, Personal Logbook, Personal Logbook GA

### 7.24 Monitor Time

- Post Time

---

## 8. BUSINESS RULES

| ID    | Rule                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-01 | A duty report is unique per (supervisor, shift name, date). Creating a duplicate returns the existing report with `alreadyExists: true`.                    |
| BR-02 | Duty reports are scoped to the user's `branchUnitId` — users cannot access duty reports from other branch units.                                            |
| BR-03 | Duty report deletion cascades soft-delete to: status frequencies, logbooks, LHD reports, and ongoing-issue links, all within a single database transaction. |
| BR-04 | Shifts can be overnight (start time > end time). Overnight shifts are sorted first in display.                                                              |
| BR-05 | Ongoing issues can be escalated through multiple levels, and escalations can be cancelled at the issue level or per-level.                                  |
| BR-06 | Ongoing issues can be attached to multiple duty reports and detached individually.                                                                          |
| BR-07 | CWP frequencies can be primary or secondary, sorted by `isPrimary` descending then `frequency` ascending.                                                   |
| BR-08 | Status frequencies track the latest status per CWP frequency per duty report.                                                                               |
| BR-09 | File uploads are organized by domain subdirectory under `/uploads`.                                                                                         |
| BR-10 | All deletions are soft-deletes (`deletedAt` timestamp); queries filter by `deletedAt: null`.                                                                |
| BR-11 | Date inputs must be in `yyyy-mm-dd` format representing local time.                                                                                         |
| BR-12 | Role-based menu access is configurable via roles management — each role has associated menus that determine sidebar visibility.                             |

---

## 9. ASSUMPTIONS AND CONSTRAINTS

### 9.1 Assumptions

- The system is deployed in an aviation/air-traffic-services operational environment.
- Users have unique NIKs as employee identifiers.
- The organizational hierarchy (Region → Branch → Branch Unit → Sector) is predefined.
- Supervisors are pre-registered in the `Supervisor` table for each branch unit.

### 9.2 Constraints

- Password validation is currently commented out in the login controller (must be re-enabled for production).
- JWT secret is configurable via environment variable `JWT_SECRET`.
- File upload size limits are governed by Multer configuration.
- The system relies on PostgreSQL with Prisma migrations for schema management.
- The frontend uses Nuxt 3 SSR/SPA mode with Nuxt UI v3.

---

## 10. APPENDICES

### Appendix A: File Upload Categories

| Category        | Upload Middleware      | Destination Directory      |
| --------------- | ---------------------- | -------------------------- |
| Briefing        | `uploadBriefing`       | `/uploads/briefing/`       |
| Competence      | `uploadCompetence`     | `/uploads/competence/`     |
| CSV Import      | `uploadCsv`            | (temp)                     |
| Essay           | `uploadEssay`          | `/uploads/essay/`          |
| Event           | `uploadEvent`          | `/uploads/event/`          |
| IELP            | `uploadIelp`           | `/uploads/ielp/`           |
| License         | `uploadLicense`        | `/uploads/license/`        |
| Logbook User    | `uploadlogbookUser`    | `/uploads/logbookUser/`    |
| MEDEX           | `uploadMedex`          | `/uploads/medex/`          |
| Multiple Choice | `uploadMultipleChoice` | `/uploads/multipleChoice/` |
| Practical Test  | `uploadPracticalTest`  | `/uploads/practicalTest/`  |
| Preview         | `uploadPreview`        | `/uploads/preview/`        |
| Room            | `uploadRoom`           | `/uploads/room/`           |

### Appendix B: Background Workers

| Worker            | File                          | Purpose                                                                                            |
| ----------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Escalation Worker | `workers/escalationWorker.js` | Processes ongoing-issue escalations based on escalation level configuration and actor assignments. |

---

**END OF DOCUMENT**
