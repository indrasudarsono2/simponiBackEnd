CREATE TABLE `EssayScoringAudit` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `finalScoreId` INTEGER NOT NULL,
  `actorNik` VARCHAR(150) NOT NULL,
  `branchUnitId` INTEGER NOT NULL,
  `reason` TEXT NOT NULL,
  `scores` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EssayScoringAudit_finalScoreId_key` (`finalScoreId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `RolesMenu` (`roleId`,`menuId`,`createdAt`,`updatedAt`,`deletedAt`)
SELECT r.id,m.id,NOW(3),NOW(3),NULL FROM `Roles` r JOIN `Menu` m ON m.menu='performanceCheck' AND m.deletedAt IS NULL
WHERE UPPER(TRIM(r.role))='CHECKER ADMIN' AND r.deletedAt IS NULL
AND NOT EXISTS (SELECT 1 FROM `RolesMenu` rm WHERE rm.roleId=r.id AND rm.menuId=m.id AND rm.deletedAt IS NULL);
