CREATE TABLE `oauth_handoffs` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`app_challenge` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_handoffs_expires` ON `oauth_handoffs` (`expires_at`);--> statement-breakpoint
CREATE TABLE `oauth_identities` (
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`user_id` integer NOT NULL,
	`provider_email` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `provider_subject`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_identities_user` ON `oauth_identities` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `credential_kind` text DEFAULT 'password' NOT NULL;