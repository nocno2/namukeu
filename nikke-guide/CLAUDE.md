# NIKKE 가이드

## 명령어

```bash
# 개발
bun run dev

# 프로덕션 빌드
bun run build

# 프로덕션 실행
bun run start

# PM2로 실행
pm2 start ecosystem.config.js
pm2 logs nikke-guide
pm2 restart nikke-guide
```

## 데이터

- 데이터 소스: 구글시트
- 시트 ID: `1IvaV9_REBew6dSri571JopqcBbJ5QL2tToWglHhIMH4`
- gid: `2810458`
- 이미지: NIKKE Fandom Wiki에서 자동取得

## 배포

1. `bun run build` — 빌드
2. `pm2 start ecosystem.config.js` — PM2로 실행
3. Cloudflare DNS에 `nikke.namukeu.com` A 레코드 추가 (서버 IP)
4. Reverse proxy 설정 (nginx 또는 Caddy)

## 자동 업데이트

시트 데이터가 변경되면:
1. 웹훅으로 빌드 트리거
2. 또는 `pm2 restart nikke-guide` (캐시된 데이터 재요청)
