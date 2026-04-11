/*
  Warnings:

  - A unique constraint covering the columns `[groupMemberId]` on the table `Verification` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Verification_groupMemberId_key` ON `Verification`(`groupMemberId`);

-- AddForeignKey
ALTER TABLE `Verification` ADD CONSTRAINT `Verification_groupMemberId_fkey` FOREIGN KEY (`groupMemberId`) REFERENCES `GroupMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
