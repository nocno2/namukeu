import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const IMAGE_DIR = '/Users/namwook/Documents/namukeu/nikke-guide/public/images';

// 디렉토리 생성
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

async function scrapeImages() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('Loading dotgg.gg/nikke/live2d...');
    await page.goto('https://dotgg.gg/nikke/live2d', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // 페이지 로드 대기
    await new Promise(r => setTimeout(r, 3000));

    // 캐릭터 리스트 찾기
    const characters = await page.evaluate(() => {
      // 캐릭터 클릭 가능한 요소 찾기
      const items = document.querySelectorAll('[class*="character"], [class*="item"], [class*="list"]');
      const results: { name: string; selector: string }[] = [];

      items.forEach((item, index) => {
        const text = item.textContent?.trim() || '';
        if (text.length > 0 && text.length < 20) {
          results.push({ name: text, selector: `div:nth-child(${index + 1})` });
        }
      });

      return results.slice(0, 50); // 처음 50개만
    });

    console.log(`Found ${characters.length} characters`);

    // 각 캐릭터 클릭해서 이미지 저장
    for (const char of characters.slice(0, 20)) { // 처음 20개만 테스트
      console.log(`Processing: ${char.name}`);

      try {
        // 캐릭터 클릭
        await page.click(`div[class*="character"]:first-child`);
        await new Promise(r => setTimeout(r, 1000));

        // canvascreenshot
        const canvas = await page.$('canvas');
        if (canvas) {
          const screenshot = await canvas.screenshot({ encoding: 'binary' });
          const filename = char.name.replace(/[^\w가-힣]/g, '_') + '.png';
          fs.writeFileSync(path.join(IMAGE_DIR, filename), screenshot);
          console.log(`Saved: ${filename}`);
        }

        // 뒤로 가기
        await page.goBack();
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.log(`Error: ${char.name} - ${e}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

scrapeImages();
