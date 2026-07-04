/*
  Warnings:

  - You are about to alter the column `level` on the `escalationlevel` table. The data in that column could be lost. The data in that column will be cast from `VarChar(150)` to `Int`.

*/
-- AlterTable
ALTER TABLE `escalationlevel` MODIFY `level` INTEGER NULL;
