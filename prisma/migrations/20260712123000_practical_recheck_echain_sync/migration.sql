ALTER TABLE `PracticalExamEchainSync`
    ADD COLUMN `practicalRecheckAttemptId` INTEGER NULL;

CREATE INDEX `PracticalExamEchainSync_practicalRecheckAttemptId_idx`
    ON `PracticalExamEchainSync`(`practicalRecheckAttemptId`);

ALTER TABLE `PracticalExamEchainSync`
    ADD CONSTRAINT `PracticalExamEchainSync_practicalRecheckAttemptId_fkey`
    FOREIGN KEY (`practicalRecheckAttemptId`) REFERENCES `PracticalRecheckAttempt`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
