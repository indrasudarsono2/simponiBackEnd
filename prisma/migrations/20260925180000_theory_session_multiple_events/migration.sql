CREATE TABLE `TheorySessionEvent` (
  `sessionId` INTEGER NOT NULL,
  `eventId` INTEGER NOT NULL,
  INDEX `TheorySessionEvent_eventId_idx` (`eventId`),
  PRIMARY KEY (`sessionId`, `eventId`),
  CONSTRAINT `TheorySessionEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `TheorySession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `TheorySessionEvent_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO `TheorySessionEvent` (`sessionId`, `eventId`)
SELECT `id`, `eventId` FROM `TheorySession`;
