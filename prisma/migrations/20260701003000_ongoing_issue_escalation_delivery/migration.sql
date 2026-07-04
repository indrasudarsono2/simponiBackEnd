-- Link escalation events directly to ongoing issues and record their timing.
ALTER TABLE `escalation`
  ADD COLUMN `onGoingIssueId` INTEGER NULL,
  ADD COLUMN `dueAt` DATETIME(3) NULL,
  ADD COLUMN `triggeredAt` DATETIME(3) NULL,
  ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'QUEUED';

-- Preserve compatibility with any historical message-linked escalations.
UPDATE `escalation` AS `e`
INNER JOIN `message` AS `m` ON `m`.`id` = `e`.`messageId`
SET `e`.`onGoingIssueId` = `m`.`onGoingIssueId`
WHERE `e`.`onGoingIssueId` IS NULL;

CREATE UNIQUE INDEX `Escalation_onGoingIssueId_escalationLevelId_key`
  ON `escalation`(`onGoingIssueId`, `escalationLevelId`);
CREATE INDEX `Escalation_status_triggeredAt_idx`
  ON `escalation`(`status`, `triggeredAt`);
CREATE INDEX `OnGoingIssue_isClosed_deletedAt_start_idx`
  ON `ongoingissue`(`isClosed`, `deletedAt`, `start`);

ALTER TABLE `escalation`
  ADD CONSTRAINT `Escalation_onGoingIssueId_fkey`
  FOREIGN KEY (`onGoingIssueId`) REFERENCES `ongoingissue`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `escalationemail` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `escalationId` INTEGER NOT NULL,
  `recipientNik` VARCHAR(150) NULL,
  `recipientEmail` VARCHAR(200) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `body` TEXT NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sentAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `EscalationEmail_escalationId_recipientEmail_key`(`escalationId`, `recipientEmail`),
  INDEX `EscalationEmail_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `escalationemail`
  ADD CONSTRAINT `EscalationEmail_escalationId_fkey`
  FOREIGN KEY (`escalationId`) REFERENCES `escalation`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
