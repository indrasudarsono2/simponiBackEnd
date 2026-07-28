-- AlterTable
ALTER TABLE `examinationinvalidation` MODIFY `previousScore` FLOAT NULL;

-- AlterTable
ALTER TABLE `practicalrecheckattempt` MODIFY `score` FLOAT NULL;

-- AlterTable
ALTER TABLE `practicalrecheckauthorization` MODIFY `passingGrade` FLOAT NOT NULL;

-- CreateTable
CREATE TABLE `OtherReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dutyReportId` INTEGER NULL,
    `report` TEXT NULL,
    `time` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OtherReport` ADD CONSTRAINT `OtherReport_dutyReportId_fkey` FOREIGN KEY (`dutyReportId`) REFERENCES `DutyReport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
