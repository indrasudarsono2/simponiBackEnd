CREATE TABLE `PasswordResetToken` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userNik` VARCHAR(191) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `requestedIp` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
  INDEX `PasswordResetToken_userNik_expiresAt_idx`(`userNik`, `expiresAt`),
  INDEX `PasswordResetToken_expiresAt_usedAt_idx`(`expiresAt`, `usedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PasswordResetToken_userNik_fkey`
    FOREIGN KEY (`userNik`) REFERENCES `User`(`nik`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
