INSERT INTO `Roles` (`role`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT 'CHECKER EXAMINATION', NOW(3), NOW(3), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `Roles`
  WHERE UPPER(TRIM(`role`)) = 'CHECKER EXAMINATION' AND `deletedAt` IS NULL
);

INSERT INTO `Menu` (`menu`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT 'questionReview', NOW(3), NOW(3), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `Menu`
  WHERE `menu` = 'questionReview' AND `deletedAt` IS NULL
);

INSERT INTO `RolesMenu` (`roleId`, `menuId`, `createdAt`, `updatedAt`, `deletedAt`)
SELECT roleRow.`id`, menuRow.`id`, NOW(3), NOW(3), NULL
FROM `Roles` roleRow
JOIN `Menu` menuRow ON menuRow.`menu` = 'questionReview' AND menuRow.`deletedAt` IS NULL
WHERE UPPER(TRIM(roleRow.`role`)) = 'CHECKER EXAMINATION'
  AND roleRow.`deletedAt` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `RolesMenu` existing
    WHERE existing.`roleId` = roleRow.`id`
      AND existing.`menuId` = menuRow.`id`
      AND existing.`deletedAt` IS NULL
  );
