import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "blog.db");
const sqlite = new Database(dbPath, { create: true });

sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA foreign_keys = ON");

// FTS5 가상 테이블 (검색용)
sqlite.run(`
  CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
    title,
    content,
    tags,
    content_rowid=id
  )
`);

// 마크다운 기호 제거 SQL 조각 (백틱은 CHAR(96)으로 치환)
const stripMd = "REPLACE(REPLACE(REPLACE(NEW.content, '#', ''), '*', ''), CHAR(96), '')";

// FTS 동기화 트리거: INSERT
sqlite.run(
  "CREATE TRIGGER IF NOT EXISTS posts_fts_insert AFTER INSERT ON posts " +
  "WHEN NEW.status = 'published' " +
  "BEGIN " +
  "  INSERT OR REPLACE INTO posts_fts(rowid, title, content, tags) " +
  "  VALUES ( " +
  "    NEW.id, " +
  "    NEW.title, " +
  "    " + stripMd + ", " +
  "    COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.post_id = NEW.id), '') " +
  "  ); " +
  "END"
);

// FTS 동기화 트리거: UPDATE
sqlite.run(
  "CREATE TRIGGER IF NOT EXISTS posts_fts_update AFTER UPDATE ON posts " +
  "BEGIN " +
  "  DELETE FROM posts_fts WHERE rowid = OLD.id; " +
  "  INSERT INTO posts_fts(rowid, title, content, tags) " +
  "  SELECT " +
  "    NEW.id, " +
  "    NEW.title, " +
  "    " + stripMd + ", " +
  "    COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.post_id = NEW.id), '') " +
  "  WHERE NEW.status = 'published'; " +
  "END"
);

// FTS 동기화 트리거: DELETE
sqlite.run(
  "CREATE TRIGGER IF NOT EXISTS posts_fts_delete AFTER DELETE ON posts " +
  "BEGIN " +
  "  DELETE FROM posts_fts WHERE rowid = OLD.id; " +
  "END"
);

export const db = drizzle(sqlite, { schema });
export const rawDb = sqlite;
export { schema };
