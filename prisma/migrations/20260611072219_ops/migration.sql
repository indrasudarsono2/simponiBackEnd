-- CreateTable
CREATE TABLE `DutyReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sectorId` INTEGER NULL,
    `shiftId` INTEGER NULL,
    `onGoingIssueId` INTEGER NULL,
    `supervisor` VARCHAR(150) NULL,
    `others` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LhdReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dutyReportId` INTEGER NULL,
    `lhdId` INTEGER NULL,
    `message` TEXT NULL,
    `time` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LhdBook` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `lhd` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StatusFrequency` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dutyReportId` INTEGER NULL,
    `statusFreqId` INTEGER NULL,
    `cwpFrequencyId` INTEGER NULL,
    `remark` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StatusFreq` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CwpFrequency` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cwpId` INTEGER NULL,
    `frequency` VARCHAR(20) NULL,
    `isPrimary` BOOLEAN NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SectorCwp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cwpId` INTEGER NULL,
    `sectorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cwp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ratingId` INTEGER NULL,
    `cwp` VARCHAR(20) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shift` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchUnitId` INTEGER NULL,
    `shift` VARCHAR(150) NULL,
    `start` TIME NULL,
    `duration` FLOAT NULL,
    `end` TIME NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnGoingIssue` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipmentId` INTEGER NULL,
    `branchId` INTEGER NULL,
    `reporter` VARCHAR(150) NULL,
    `other` TEXT NULL,
    `start` DATETIME(3) NULL,
    `finish` DATETIME(3) NULL,
    `isClosed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Equipment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipment` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `onGoingIssueId` INTEGER NULL,
    `escalationId` INTEGER NULL,
    `message` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Escalation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userNik` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Briefing` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kindOfBriefingId` INTEGER NULL,
    `speaker` VARCHAR(150) NULL,
    `isAll` BOOLEAN NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BriefingRead` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `briefingId` INTEGER NULL,
    `reader` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KindOfBriefing` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentOfBriefing` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `briefingId` INTEGER NULL,
    `contentOfBriefing` TEXT NULL,
    `file` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BriefingDestination` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `professionInBranchId` INTEGER NULL,
    `briefingId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DutyReport` ADD CONSTRAINT `DutyReport_sectorId_fkey` FOREIGN KEY (`sectorId`) REFERENCES `Sector`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DutyReport` ADD CONSTRAINT `DutyReport_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DutyReport` ADD CONSTRAINT `DutyReport_onGoingIssueId_fkey` FOREIGN KEY (`onGoingIssueId`) REFERENCES `OnGoingIssue`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DutyReport` ADD CONSTRAINT `DutyReport_supervisor_fkey` FOREIGN KEY (`supervisor`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LhdReport` ADD CONSTRAINT `LhdReport_dutyReportId_fkey` FOREIGN KEY (`dutyReportId`) REFERENCES `DutyReport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LhdReport` ADD CONSTRAINT `LhdReport_lhdId_fkey` FOREIGN KEY (`lhdId`) REFERENCES `LhdBook`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StatusFrequency` ADD CONSTRAINT `StatusFrequency_dutyReportId_fkey` FOREIGN KEY (`dutyReportId`) REFERENCES `DutyReport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StatusFrequency` ADD CONSTRAINT `StatusFrequency_statusFreqId_fkey` FOREIGN KEY (`statusFreqId`) REFERENCES `StatusFreq`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StatusFrequency` ADD CONSTRAINT `StatusFrequency_cwpFrequencyId_fkey` FOREIGN KEY (`cwpFrequencyId`) REFERENCES `CwpFrequency`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CwpFrequency` ADD CONSTRAINT `CwpFrequency_cwpId_fkey` FOREIGN KEY (`cwpId`) REFERENCES `Cwp`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SectorCwp` ADD CONSTRAINT `SectorCwp_cwpId_fkey` FOREIGN KEY (`cwpId`) REFERENCES `Cwp`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SectorCwp` ADD CONSTRAINT `SectorCwp_sectorId_fkey` FOREIGN KEY (`sectorId`) REFERENCES `Sector`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cwp` ADD CONSTRAINT `Cwp_ratingId_fkey` FOREIGN KEY (`ratingId`) REFERENCES `Rating`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_branchUnitId_fkey` FOREIGN KEY (`branchUnitId`) REFERENCES `BranchUnit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnGoingIssue` ADD CONSTRAINT `OnGoingIssue_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnGoingIssue` ADD CONSTRAINT `OnGoingIssue_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnGoingIssue` ADD CONSTRAINT `OnGoingIssue_reporter_fkey` FOREIGN KEY (`reporter`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_onGoingIssueId_fkey` FOREIGN KEY (`onGoingIssueId`) REFERENCES `OnGoingIssue`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_escalationId_fkey` FOREIGN KEY (`escalationId`) REFERENCES `Escalation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Escalation` ADD CONSTRAINT `Escalation_userNik_fkey` FOREIGN KEY (`userNik`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Briefing` ADD CONSTRAINT `Briefing_kindOfBriefingId_fkey` FOREIGN KEY (`kindOfBriefingId`) REFERENCES `KindOfBriefing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Briefing` ADD CONSTRAINT `Briefing_speaker_fkey` FOREIGN KEY (`speaker`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BriefingRead` ADD CONSTRAINT `BriefingRead_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BriefingRead` ADD CONSTRAINT `BriefingRead_reader_fkey` FOREIGN KEY (`reader`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentOfBriefing` ADD CONSTRAINT `ContentOfBriefing_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BriefingDestination` ADD CONSTRAINT `BriefingDestination_professionInBranchId_fkey` FOREIGN KEY (`professionInBranchId`) REFERENCES `ProfessionInBranch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BriefingDestination` ADD CONSTRAINT `BriefingDestination_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `Briefing`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
