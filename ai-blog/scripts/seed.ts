import { Database } from "bun:sqlite";
import path from "path";

const dbPath = path.join(import.meta.dir, "..", "data", "blog.db");
const db = new Database(dbPath);

// Seed categories
db.run(`INSERT OR IGNORE INTO categories (name, slug, description) VALUES
  ('AI', 'ai', 'AI와 머신러닝 관련 최신 기술 트렌드와 활용법'),
  ('Next Gen', 'next-gen', '차세대 기술과 혁신적인 디지털 트렌드')
`);

console.log("✅ Seed data inserted!");
db.close();
