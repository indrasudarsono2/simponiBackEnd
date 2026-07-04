-- CreateTable
CREATE TABLE `logBook` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userNik` VARCHAR(150) NULL,
    `supervisor` VARCHAR(150) NULL,
    `cwpId` INTEGER NULL,
    `dutyReportId` INTEGER NULL,
    `timeIn` DATETIME(3) NULL,
    `timeOut` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `logBook` ADD CONSTRAINT `logBook_userNik_fkey` FOREIGN KEY (`userNik`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logBook` ADD CONSTRAINT `logBook_cwpId_fkey` FOREIGN KEY (`cwpId`) REFERENCES `Cwp`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logBook` ADD CONSTRAINT `logBook_dutyReportId_fkey` FOREIGN KEY (`dutyReportId`) REFERENCES `DutyReport`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logBook` ADD CONSTRAINT `logBook_supervisor_fkey` FOREIGN KEY (`supervisor`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;
