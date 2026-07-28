CREATE TABLE `PracticalExamEchainSync` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `practicalTestId` INTEGER NOT NULL,
    `echainRequestId` VARCHAR(150) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    `requestPayload` JSON NULL,
    `responsePayload` JSON NULL,
    `errorMessage` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PracticalExamEchainSync_practicalTestId_idx`(`practicalTestId`),
    INDEX `PracticalExamEchainSync_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PracticalExamEchainSync`
    ADD CONSTRAINT `PracticalExamEchainSync_practicalTestId_fkey`
    FOREIGN KEY (`practicalTestId`) REFERENCES `PracticalTest`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
