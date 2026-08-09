import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
