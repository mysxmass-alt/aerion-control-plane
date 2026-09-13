CREATE TABLE `magic_link_tokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(320) NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `magic_link_tokens_id` PRIMARY KEY(`id`),
  CONSTRAINT `magic_link_tokens_tokenHash_unique` UNIQUE(`tokenHash`)
);
