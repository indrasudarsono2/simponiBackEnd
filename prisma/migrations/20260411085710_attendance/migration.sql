-- DropForeignKey
ALTER TABLE `attendance` DROP FOREIGN KEY `Attendance_roomId_fkey`;

-- DropIndex
DROP INDEX `Attendance_roomId_fkey` ON `attendance`;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
