INSERT INTO `Menu` (`menu`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT 'credentialVerification', NOW(3), NOW(3), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `Menu` WHERE `menu` = 'credentialVerification' AND `deletedAt` IS NULL
);

INSERT INTO `RolesMenu` (`roleId`, `menuId`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT roleRow.`id`, menuRow.`id`, NOW(3), NOW(3), NULL
FROM `Roles` roleRow
JOIN `Menu` menuRow ON menuRow.`menu` = 'credentialVerification' AND menuRow.`deletedAt` IS NULL
WHERE UPPER(TRIM(roleRow.`role`)) = 'CHECKER'
  AND roleRow.`deletedAt` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `RolesMenu` existing
    WHERE existing.`roleId` = roleRow.`id`
      AND existing.`menuId` = menuRow.`id`
      AND existing.`deletedAt` IS NULL
  );

UPDATE `RolesMenu` roleMenu
JOIN `Menu` menuRow ON menuRow.`id` = roleMenu.`menuId`
JOIN `Roles` roleRow ON roleRow.`id` = roleMenu.`roleId`
SET roleMenu.`deletedAt` = NOW(3), roleMenu.`updatedAt` = NOW(3)
WHERE menuRow.`menu` = 'credentialVerification'
  AND UPPER(TRIM(roleRow.`role`)) <> 'CHECKER'
  AND roleMenu.`deletedAt` IS NULL;
