/*
  Warnings:

  - You are about to alter the column `licenseUserId` on the `user` table. The data in that column could be lost. The data in that column will be cast from `VarChar(150)` to `VarChar(20)`.
  - A unique constraint covering the columns `[licenseUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `applicationdoc` DROP FOREIGN KEY `ApplicationDoc_ojtNik_fkey`;

-- DropIndex
DROP INDEX `ApplicationDoc_ojtNik_fkey` ON `applicationdoc`;

-- AlterTable
ALTER TABLE `user` MODIFY `licenseUserId` VARCHAR(20) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_licenseUserId_key` ON `User`(`licenseUserId`);

-- AddForeignKey
ALTER TABLE `ApplicationDoc` ADD CONSTRAINT `ApplicationDoc_ojtNik_fkey` FOREIGN KEY (`ojtNik`) REFERENCES `User`(`licenseUserId`) ON DELETE SET NULL ON UPDATE CASCADE;
