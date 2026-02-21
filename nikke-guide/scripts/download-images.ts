import fs from 'fs';
import path from 'path';

const IMAGE_DIR = '/Users/namwook/Documents/namukeu/nikke-guide/public/images';

// 이미지 매핑 읽기
const imageMap = JSON.parse(
  fs.readFileSync('/Users/namwook/Documents/namukeu/nikke-guide/src/lib/character-images.json', 'utf-8')
);

// 디렉토리 생성
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

// 이미지 다운로드 함수
async function downloadImage(url: string, filename: string): Promise<void> {
  const filepath = path.join(IMAGE_DIR, filename);

  // 이미 존재하면 스킵
  if (fs.existsSync(filepath)) {
    console.log(`Skip: ${filename} (already exists)`);
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`Error: ${filename} - ${response.status}`);
      return;
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    console.log(`Downloaded: ${filename}`);
  } catch (error) {
    console.log(`Error: ${filename} - ${error}`);
  }
}

// 모든 이미지 다운로드
async function main() {
  let count = 0;
  for (const [name, url] of Object.entries(imageMap)) {
    // 파일명: 캐릭터 이름에서 특수문자 제거
    const filename = name.replace(/[^\w가-힣]/g, '_') + '.webp';

    // URL이 있으면 다운로드
    if (url && typeof url === 'string' && url.startsWith('http')) {
      await downloadImage(url, filename);
      count++;

      // rate limit 방지
      if (count % 10 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.log(`\nTotal downloaded: ${count}`);
}

main();
