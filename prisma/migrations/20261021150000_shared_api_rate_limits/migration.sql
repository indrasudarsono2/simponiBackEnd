CREATE TABLE `ApiRateLimitBucket` (
  `id` VARCHAR(64) NOT NULL,
  `totalHits` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `resetAt` DATETIME(3) NOT NULL,
  INDEX `ApiRateLimitBucket_resetAt_idx` (`resetAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
