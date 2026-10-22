CREATE TABLE `ApplicationCorrectionAudit` (
 `id` INTEGER NOT NULL AUTO_INCREMENT,
 `applicationDocId` INTEGER NOT NULL,
 `actorNik` VARCHAR(150) NOT NULL,
 `branchUnitId` INTEGER NOT NULL,
 `kind` VARCHAR(30) NOT NULL,
 `reason` TEXT NOT NULL,
 `before` JSON NOT NULL,
 `after` JSON NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 INDEX `ApplicationCorrectionAudit_applicationDocId_createdAt_idx` (`applicationDocId`,`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Menu` (`menu`,`createdAt`,`updatedAt`)
SELECT 'applicationCorrections',NOW(3),NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `Menu` WHERE `menu`='applicationCorrections' AND `deletedAt` IS NULL);
INSERT INTO `RolesMenu` (`roleId`,`menuId`,`createdAt`,`updatedAt`)
SELECT r.id,m.id,NOW(3),NOW(3) FROM `Roles` r JOIN `Menu` m ON m.menu='applicationCorrections' AND m.deletedAt IS NULL
WHERE r.role='CHECKER ADMIN' AND r.deletedAt IS NULL
AND NOT EXISTS (SELECT 1 FROM `RolesMenu` rm WHERE rm.roleId=r.id AND rm.menuId=m.id AND rm.deletedAt IS NULL);
