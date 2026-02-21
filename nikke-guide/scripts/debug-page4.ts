import puppeteer from 'puppeteer';

async function scrapeCharacterCodes() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('Loading dotgg.gg/nikke/live2d...');

    const response = await page.goto('https://dotgg.gg/nikke/live2d', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Response status:', response?.status());

    // 추가 대기
    await new Promise(r => setTimeout(r, 5000));

    // 페이지 제목 확인
    const title = await page.title();
    console.log('Page title:', title);

    // canvas 요소 확인
    const canvasExists = await page.$('canvas');
    console.log('Canvas exists:', !!canvasExists);

    // 모든 img 찾기
    const imgCount = await page.evaluate(() => {
      return document.querySelectorAll('img').length;
    });
    console.log('Total images:', imgCount);

    // nikke 관련 img 찾기
    const nikkeImages = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const results: string[] = [];
      images.forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (src.toLowerCase().includes('nikke') || src.includes('live2d')) {
          results.push(src.slice(0, 150));
        }
      });
      return results;
    });
    console.log('Nikke images:', nikkeImages);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

scrapeCharacterCodes();
