CREATE TABLE `ProposalLetter` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `applicationDocId` INTEGER NOT NULL,
  `appRatingId` INTEGER NOT NULL,
  `supervisorNik` VARCHAR(150) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `revision` INTEGER NOT NULL DEFAULT 1,
  `content` JSON NOT NULL,
  `validatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ProposalLetter_appRatingId_key` (`appRatingId`),
  INDEX `ProposalLetter_supervisorNik_status_createdAt_idx` (`supervisorNik`, `status`, `createdAt`),
  INDEX `ProposalLetter_applicationDocId_status_idx` (`applicationDocId`, `status`),
  CONSTRAINT `ProposalLetter_applicationDocId_fkey` FOREIGN KEY (`applicationDocId`) REFERENCES `ApplicationDoc`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ProposalLetter_appRatingId_fkey` FOREIGN KEY (`appRatingId`) REFERENCES `AppRating`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ProposalLetter_supervisorNik_fkey` FOREIGN KEY (`supervisorNik`) REFERENCES `User`(`nik`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProposalLetterAction` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `letterId` INTEGER NOT NULL,
  `actorNik` VARCHAR(150) NOT NULL,
  `action` VARCHAR(30) NOT NULL,
  `revision` INTEGER NOT NULL,
  `reason` TEXT NULL,
  `content` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ProposalLetterAction_letterId_createdAt_idx` (`letterId`, `createdAt`),
  CONSTRAINT `ProposalLetterAction_letterId_fkey` FOREIGN KEY (`letterId`) REFERENCES `ProposalLetter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Menu` (`menu`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT 'proposalLetters', NOW(3), NOW(3), NULL
WHERE NOT EXISTS (SELECT 1 FROM `Menu` WHERE `menu` = 'proposalLetters' AND `deletedAt` IS NULL);

INSERT INTO `RolesMenu` (`roleId`, `menuId`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT r.`id`, m.`id`, NOW(3), NOW(3), NULL
FROM `Roles` r JOIN `Menu` m ON m.`menu` = 'proposalLetters' AND m.`deletedAt` IS NULL
WHERE UPPER(TRIM(r.`role`)) = 'SUPERVISOR' AND r.`deletedAt` IS NULL
AND NOT EXISTS (SELECT 1 FROM `RolesMenu` x WHERE x.`roleId` = r.`id` AND x.`menuId` = m.`id` AND x.`deletedAt` IS NULL);
