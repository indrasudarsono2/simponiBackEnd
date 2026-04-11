/*
  Warnings:

  - You are about to alter the column `token` on the `token` table. The data in that column could be lost. The data in that column will be cast from `TinyInt` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE `token` MODIFY `token` VARCHAR(255) NULL;
