CREATE TABLE `user_profiles` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`roll_number` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`semester` text DEFAULT '' NOT NULL,
	`skills` text DEFAULT '' NOT NULL,
	`linkedin` text DEFAULT '' NOT NULL,
	`github` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`dark_theme` integer DEFAULT 0 NOT NULL,
	`email_notifications` integer DEFAULT 1 NOT NULL,
	`push_notifications` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
