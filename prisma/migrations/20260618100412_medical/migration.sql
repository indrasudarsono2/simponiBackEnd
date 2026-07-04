-- CreateTable
CREATE TABLE `MedicalCheck` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `doctor` VARCHAR(150) NULL,
    `employee` VARCHAR(150) NULL,
    `bloodPressure` VARCHAR(50) NULL,
    `unNormalCondition` TEXT NULL,
    `isFit` BOOLEAN NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MedicalCheck` ADD CONSTRAINT `MedicalCheck_doctor_fkey` FOREIGN KEY (`doctor`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MedicalCheck` ADD CONSTRAINT `MedicalCheck_employee_fkey` FOREIGN KEY (`employee`) REFERENCES `User`(`nik`) ON DELETE SET NULL ON UPDATE CASCADE;
