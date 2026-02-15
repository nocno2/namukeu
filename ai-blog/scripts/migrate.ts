import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const dbPath = path.join(import.meta.dir, "..", "data", "blog.db");
const migrationsDir = path.join(
  import.meta.dir,
  "..",
  "src",
  "lib",
  "db",
  "migrations"
);

const db = new Database(dbPath, { create: true });
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

// Create migrations tracking table
db.run(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
  )
`);

const applied = new Set(
  db
    .query("SELECT name FROM _migrations")
    .all()
    .map((r: { name: string }) => r.name)
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`⏭️  Already applied: ${file}`);
    continue;
  }

  const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
  console.log(`🔄 Applying: ${file}`);

  db.run("BEGIN");
  try {
    // Split by statement breakpoints (drizzle-kit format)
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      db.run(stmt);
    }

    db.run("INSERT INTO _migrations (name) VALUES (?)", [file]);
    db.run("COMMIT");
    console.log(`✅ Applied: ${file}`);
  } catch (err) {
    db.run("ROLLBACK");
    console.error(`❌ Failed: ${file}`, err);
    process.exit(1);
  }
}

console.log("🎉 All migrations applied!");
db.close();
