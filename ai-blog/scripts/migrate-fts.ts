/**
 * FTS5 마이그레이션 스크립트
 * 기존 published 글을 posts_fts 가상 테이블에 인덱싱
 *
 * 실행: bun run scripts/migrate-fts.ts
 */
import { Database } from "bun:sqlite";
import path from "path";

const dbPath = path.join(import.meta.dir, "..", "data", "blog.db");
const db = new Database(dbPath);

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

// FTS5 테이블 생성 (이미 있으면 무시)
db.run(`
  CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
    title,
    content,
    tags,
    content_rowid=id
  )
`);

// 기존 데이터 초기화
db.run("DELETE FROM posts_fts");

// published 글만 FTS에 삽입
const inserted = db.run(`
  INSERT INTO posts_fts(rowid, title, content, tags)
  SELECT
    p.id,
    p.title,
    REPLACE(REPLACE(REPLACE(p.content, '#', ''), '*', ''), '` + "`" + `', ''),
    COALESCE(
      (SELECT GROUP_CONCAT(t.name, ' ')
       FROM post_tags pt
       JOIN tags t ON pt.tag_id = t.id
       WHERE pt.post_id = p.id),
      ''
    )
  FROM posts p
  WHERE p.status = 'published'
`);

console.log(`FTS5 마이그레이션 완료: ${inserted.changes}개 글 인덱싱됨`);

// 트리거 생성
db.run(`
  CREATE TRIGGER IF NOT EXISTS posts_fts_insert AFTER INSERT ON posts
  WHEN NEW.status = 'published'
  BEGIN
    INSERT OR REPLACE INTO posts_fts(rowid, title, content, tags)
    VALUES (
      NEW.id,
      NEW.title,
      REPLACE(REPLACE(REPLACE(NEW.content, '#', ''), '*', ''), '` + "`" + `', ''),
      COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.post_id = NEW.id), '')
    );
  END
`);

db.run(`
  CREATE TRIGGER IF NOT EXISTS posts_fts_update AFTER UPDATE ON posts
  BEGIN
    DELETE FROM posts_fts WHERE rowid = OLD.id;
    INSERT INTO posts_fts(rowid, title, content, tags)
    SELECT
      NEW.id,
      NEW.title,
      REPLACE(REPLACE(REPLACE(NEW.content, '#', ''), '*', ''), '` + "`" + `', ''),
      COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.post_id = NEW.id), '')
    WHERE NEW.status = 'published';
  END
`);

db.run(`
  CREATE TRIGGER IF NOT EXISTS posts_fts_delete AFTER DELETE ON posts
  BEGIN
    DELETE FROM posts_fts WHERE rowid = OLD.id;
  END
`);

console.log("FTS5 트리거 생성 완료");
db.close();
