-- AlterTable
ALTER TABLE `essaycorrection` ADD COLUMN `answer` TEXT NULL,
    ADD COLUMN `checker` VARCHAR(150) NULL;

-- AddForeignKey
ALTER TABLE `EssayCorrection` ADD CONSTRAINT `EssayCorrection_checker_fkey` FOREIGN KEY (`checker`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;
