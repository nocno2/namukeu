import fs from 'fs';

// Google Sheets HTML 가져오기
const url = 'https://docs.google.com/spreadsheets/u/0/d/1IvaV9_REBew6dSri571JopqcBbJ5QL2tToWglHhIMH4/htmlview#gid=2810458';

const response = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

const html = await response.text();

// 이미지 URL 추출
const imgPattern = /<img src="(https:\/\/lh7-rt\.googleusercontent\.com\/sheetsz\/[^"]+)"/g;
const images: string[] = [];
let match;

while ((match = imgPattern.exec(html)) !== null) {
  images.push(match[1]);
}

console.log(`총 이미지 수: ${images.length}`);

// 중복 제거
const uniqueImages = [...new Set(images)];
console.log(`고유 이미지 수: ${uniqueImages.length}`);

// 처음 5개 출력
console.log('\n첫 5개 이미지:');
uniqueImages.slice(0, 5).forEach((img, i) => {
  console.log(`${i + 1}. ${img.slice(0, 80)}...`);
});
