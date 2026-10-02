INSERT INTO `Menu` (`menu`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT 'ojtiRequests', NOW(3), NOW(3), NULL
WHERE NOT EXISTS (SELECT 1 FROM `Menu` WHERE `menu` = 'ojtiRequests' AND `deletedAt` IS NULL);

INSERT INTO `RolesMenu` (`roleId`, `menuId`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT r.`id`, m.`id`, NOW(3), NOW(3), NULL
FROM `Roles` r JOIN `Menu` m ON m.`menu` = 'ojtiRequests' AND m.`deletedAt` IS NULL
WHERE UPPER(TRIM(r.`role`)) = 'OPERATIONAL' AND r.`deletedAt` IS NULL
AND NOT EXISTS (SELECT 1 FROM `RolesMenu` x WHERE x.`roleId` = r.`id` AND x.`menuId` = m.`id` AND x.`deletedAt` IS NULL);
