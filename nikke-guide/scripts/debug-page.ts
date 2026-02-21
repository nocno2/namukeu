import puppeteer from 'puppeteer';

async function scrapeCharacterCodes() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    console.log('Loading dotgg.gg/live2d...');
    await page.goto('https://dotgg.gg/nikke/live2d', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 페이지 HTML 확인
    const html = await page.content();
    console.log('HTML length:', html.length);

    // 모든 img 태그 찾기
    const allImages = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      return Array.from(images).slice(0, 20).map(img => ({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        class: img.getAttribute('class')
      }));
    });

    console.log('All images:', JSON.stringify(allImages, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

scrapeCharacterCodes();
