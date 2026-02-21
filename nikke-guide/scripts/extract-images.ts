import fs from 'fs';
import path from 'path';

const HTML_FILE = '/Users/namwook/Downloads/니케 육성 가이드 - Google Drive_files/sheet.html';
const IMAGE_DIR = '/Users/namwook/Documents/namukeu/nikke-guide/public/images';

// HTML 파일 읽기
const html = fs.readFileSync(HTML_FILE, 'utf-8');

// 이미지 URL 추출 (상대 경로 → 절대 경로)
const imgPattern = /src="(\.\/AHOq[^"]+)"/g;
const images: { name: string; url: string }[] = [];
let match;

// 행 단위로 분할하여 캐릭터 이름 추출
const rows = html.split('<tr ');

let currentName = '';
for (const row of rows) {
  // td에서 텍스트 찾기
  const tdMatches = row.match(/<td[^>]*>([^<]*)</g);
  if (tdMatches && tdMatches.length > 0) {
    const text = tdMatches[0].replace(/<[^>]+>/g, '').trim();
    // 한국어 이름 패턴
    if (text.length >= 2 && text.length <= 15 && /[가-힣]/.test(text)) {
      // 스킬, 장비 등의 텍스트 제외
      if (!text.includes('스킬') && !text.includes('오버로드') && !text.includes('큐브') && !text.includes('장비')) {
        currentName = text;
      }
    }
  }

  // 이미지 찾기
  const imgMatch = row.match(/src="(\.\/AHOq[^"]+)"/);
  if (imgMatch && currentName) {
    const relativePath = imgMatch[1];
    const url = `https://lh7-rt.googleusercontent.com/sheetsz/${relativePath.slice(2)}`;
    images.push({ name: currentName, url });
    currentName = '';
  }
}

console.log(`총 이미지 수: ${images.length}`);

// 중복 제거 (이름 기준)
const uniqueImages = images.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
console.log(`고유 이미지 수: ${uniqueImages.length}`);

// 처음 5개 출력
console.log('\n첫 5개:');
uniqueImages.slice(0, 5).forEach((img, i) => {
  console.log(`${img.name}: ${img.url.slice(0, 60)}...`);
});

// 이미지 다운로드
async function downloadImage(url: string, filename: string): Promise<void> {
  const filepath = path.join(IMAGE_DIR, filename);

  // 이미 존재하면 스킵
  if (fs.existsSync(filepath)) {
    console.log(`Skip: ${filename} (exists)`);
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

// 모두 다운로드
async function main() {
  // 디렉토리 생성
  if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR, { recursive: true });
  }

  let count = 0;
  for (const img of uniqueImages) {
    const filename = img.name.replace(/[^\w가-힣]/g, '_') + '.webp';
    await downloadImage(img.url, filename);
    count++;

    // rate limit 방지
    if (count % 10 === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n총 다운로드: ${count}`);
}

main();
