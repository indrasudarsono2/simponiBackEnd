CREATE TABLE `UserLoginSecurity` (
    `userNik` VARCHAR(191) NOT NULL,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `firstFailedAt` DATETIME(3) NULL,
    `lastFailedAt` DATETIME(3) NULL,
    `lockedUntil` DATETIME(3) NULL,
    `lastSuccessfulLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`userNik`),
    INDEX `UserLoginSecurity_lockedUntil_idx` (`lockedUntil`),
    CONSTRAINT `UserLoginSecurity_userNik_fkey` FOREIGN KEY (`userNik`) REFERENCES `User` (`nik`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuthenticationAudit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userNik` VARCHAR(191) NULL,
    `eventType` VARCHAR(50) NOT NULL,
    `success` BOOLEAN NOT NULL,
    `reason` VARCHAR(100) NULL,
    `ipAddress` VARCHAR(100) NULL,
    `userAgent` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `AuthenticationAudit_userNik_createdAt_idx` (`userNik`, `createdAt`),
    INDEX `AuthenticationAudit_eventType_createdAt_idx` (`eventType`, `createdAt`),
    INDEX `AuthenticationAudit_createdAt_idx` (`createdAt`),
    CONSTRAINT `AuthenticationAudit_userNik_fkey` FOREIGN KEY (`userNik`) REFERENCES `User` (`nik`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
