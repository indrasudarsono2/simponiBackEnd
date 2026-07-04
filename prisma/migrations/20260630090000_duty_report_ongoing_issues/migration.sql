-- Preserve DutyReport.onGoingIssueId for backward compatibility while
-- enabling multiple ongoing issues to be carried across multiple reports.
CREATE TABLE `dutyreportongoingissue` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `dutyReportId` INTEGER NOT NULL,
  `onGoingIssueId` INTEGER NOT NULL,
  `attachedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `DutyReportOnGoingIssue_dutyReportId_onGoingIssueId_key`(`dutyReportId`, `onGoingIssueId`),
  INDEX `DutyReportOnGoingIssue_onGoingIssueId_idx`(`onGoingIssueId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dutyreportongoingissue`
  ADD CONSTRAINT `DutyReportOnGoingIssue_dutyReportId_fkey`
  FOREIGN KEY (`dutyReportId`) REFERENCES `dutyreport`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `dutyreportongoingissue`
  ADD CONSTRAINT `DutyReportOnGoingIssue_onGoingIssueId_fkey`
  FOREIGN KEY (`onGoingIssueId`) REFERENCES `ongoingissue`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry existing single-issue assignments into the new link table.
INSERT INTO `dutyreportongoingissue` (`dutyReportId`, `onGoingIssueId`, `attachedAt`)
SELECT `id`, `onGoingIssueId`, COALESCE(`createdAt`, CURRENT_TIMESTAMP(3))
FROM `dutyreport`
WHERE `onGoingIssueId` IS NOT NULL;
