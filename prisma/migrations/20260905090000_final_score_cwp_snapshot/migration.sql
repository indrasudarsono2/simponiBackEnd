CREATE TABLE `FinalScoreCwp` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `finalScoreId` INTEGER NOT NULL,
    `cwpId` INTEGER NOT NULL,
    `cwpName` VARCHAR(100) NOT NULL,
    `sectorId` INTEGER NOT NULL,
    `sectorName` VARCHAR(150) NOT NULL,
    `snapshotSource` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `FinalScoreCwp_finalScoreId_cwpId_key`(`finalScoreId`, `cwpId`),
    INDEX `FinalScoreCwp_finalScoreId_idx`(`finalScoreId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `FinalScoreCwp_finalScoreId_fkey`
      FOREIGN KEY (`finalScoreId`) REFERENCES `FinalScore`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FinalScoreCwpFrequency` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `finalScoreCwpId` INTEGER NOT NULL,
    `frequency` VARCHAR(20) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `FinalScoreCwpFrequency_finalScoreCwpId_idx`(`finalScoreCwpId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `FinalScoreCwpFrequency_finalScoreCwpId_fkey`
      FOREIGN KEY (`finalScoreCwpId`) REFERENCES `FinalScoreCwp`(`id`)
      ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
