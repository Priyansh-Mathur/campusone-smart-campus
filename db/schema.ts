import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  status: text("status").notNull().default("active"),
  meta: text("meta").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const activity = sqliteTable("activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  message: text("message").notNull(),
  actor: text("actor").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("Student"),
  verified: integer("verified").notNull().default(0),
  verificationCode: text("verification_code"),
  resetCode: text("reset_code"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bucket: text("bucket").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const userProfiles = sqliteTable("user_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  phone: text("phone").notNull().default(""),
  rollNumber: text("roll_number").notNull().default(""),
  department: text("department").notNull().default(""),
  semester: text("semester").notNull().default(""),
  skills: text("skills").notNull().default(""),
  linkedin: text("linkedin").notNull().default(""),
  github: text("github").notNull().default(""),
  bio: text("bio").notNull().default(""),
  darkTheme: integer("dark_theme").notNull().default(0),
  emailNotifications: integer("email_notifications").notNull().default(1),
  pushNotifications: integer("push_notifications").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});

export const userRecordStatuses = sqliteTable(
  "user_record_statuses",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recordId: integer("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.recordId] }),
    index("idx_user_record_statuses_record").on(table.recordId),
  ],
);
