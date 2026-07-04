ALTER TABLE `ongoingissue`
  ADD COLUMN `escalationEnabled` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `escalationCancelledAt` DATETIME(3) NULL;
