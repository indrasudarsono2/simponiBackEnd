ALTER TABLE `AuthenticationAudit`
    ADD COLUMN `performedByNik` VARCHAR(191) NULL;

CREATE INDEX `AuthenticationAudit_performedByNik_createdAt_idx`
    ON `AuthenticationAudit`(`performedByNik`, `createdAt`);
