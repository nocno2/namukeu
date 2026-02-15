import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug").unique().notNull(),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  categoryId: integer("category_id").references(() => categories.id),
  status: text("status", { enum: ["draft", "published"] })
    .default("draft")
    .notNull(),
  featuredImage: text("featured_image"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  publishedAt: text("published_at"),
  createdAt: text("created_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text("updated_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").unique().notNull(),
  slug: text("slug").unique().notNull(),
});

export const postTags = sqliteTable("post_tags", {
  postId: integer("post_id")
    .references(() => posts.id, { onDelete: "cascade" })
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id, { onDelete: "cascade" })
    .notNull(),
});

export const drafts = sqliteTable("drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keyword: text("keyword").notNull(),
  topic: text("topic").notNull(),
  outline: text("outline"),
  source: text("source").default("trends").notNull(),
  title: text("title"),
  slug: text("slug"),
  content: text("content"),
  excerpt: text("excerpt"),
  categoryId: integer("category_id"),
  tags: text("tags"),
  reviewFeedback: text("review_feedback"),
  reviewScore: integer("review_score"),
  revisedContent: text("revised_content"),
  rejectReason: text("reject_reason"),
  pipelineId: text("pipeline_id"),
  notifiedAt: text("notified_at"),
  status: text("status", {
    enum: ["researched", "written", "reviewed", "approved", "published", "rejected"],
  })
    .default("researched")
    .notNull(),
  createdAt: text("created_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text("updated_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
});

export const pageViews = sqliteTable("page_views", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  createdAt: text("created_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
});
