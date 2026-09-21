UPDATE `RolesMenu` roleMenu
JOIN `Menu` menuRow ON menuRow.`id` = roleMenu.`menuId`
JOIN `Roles` roleRow ON roleRow.`id` = roleMenu.`roleId`
SET roleMenu.`deletedAt` = NOW(3), roleMenu.`updatedAt` = NOW(3)
WHERE menuRow.`menu` = 'credentialVerification'
  AND UPPER(TRIM(roleRow.`role`)) = 'CHECKER'
  AND roleMenu.`deletedAt` IS NULL;

UPDATE `Menu`
SET `deletedAt` = NOW(3), `updatedAt` = NOW(3)
WHERE `menu` = 'credentialVerification' AND `deletedAt` IS NULL;
