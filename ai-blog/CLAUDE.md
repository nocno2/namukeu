# AI Blog

수익형 기술 블로그 - AI/Next Gen 주제

## Tech Stack
- Next.js 15 (App Router) + Bun
- SQLite (bun:sqlite) + Drizzle ORM
- Tailwind CSS v4
- JWT auth (jose)
- PM2 + Cloudflare Tunnel

## Commands
- `bun run dev` — 개발 서버
- `bun run build && bun run start` — 프로덕션
- `bun run scripts/migrate.ts` — DB 마이그레이션
- `bun run scripts/seed.ts` — 시드 데이터

## Project Structure
- `src/app/` — Pages & API routes
- `src/lib/db/` — Drizzle schema & DB connection
- `src/lib/auth.ts` — JWT auth
- `src/components/` — React components
- `data/blog.db` — SQLite database
- `public/uploads/` — Uploaded images

## Admin
- `/admin/login` — 로그인
- `/admin` — 대시보드
- `/admin/posts` — 글 관리
- `/admin/posts/new` — 새 글 작성

## Notes
- DB uses bun:sqlite (NOT better-sqlite3)
- Port 3100 in production (PM2)
