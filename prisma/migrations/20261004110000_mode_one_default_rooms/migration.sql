ALTER TABLE `Room` ADD COLUMN `defaultEventId` INTEGER NULL,
  MODIFY COLUMN `file` TEXT NULL;
CREATE UNIQUE INDEX `Room_defaultEventId_key` ON `Room` (`defaultEventId`);
ALTER TABLE `Room` ADD CONSTRAINT `Room_defaultEventId_fkey`
  FOREIGN KEY (`defaultEventId`) REFERENCES `Event` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
