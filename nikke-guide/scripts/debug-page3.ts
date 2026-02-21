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
    await page.goto('https://dotgg.gg/nikke/live2d', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 추가 대기
    await new Promise(r => setTimeout(r, 3000));

    // canvas가 로드된 후 데이터 확인
    const characterData = await page.evaluate(() => {
      const results: { name: string; code: string }[] = [];

      // canvas 요소 찾기
      const canvas = document.querySelector('canvas#canvas');
      if (canvas) {
        console.log('Canvas found, checking parent elements...');
        const parent = canvas.parentElement;
        console.log('Parent class:', parent?.getAttribute('class'));
        console.log('Parent HTML:', parent?.innerHTML?.slice(0, 500));
      }

      // 모든 img src에서 dotgg 캐릭터 이미지 찾기
      const images = document.querySelectorAll('img[src*="dotgg.gg"]');
      images.forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (src.includes('nikke')) {
          console.log('Nikke img found:', src.slice(0, 100));
        }
      });

      // data 코드 찾기
      const dataElements = document.querySelectorAll('[data-code], [data-id], [data-character]');
      dataElements.forEach((el) => {
        console.log('Data element:', {
          code: el.getAttribute('data-code'),
          id: el.getAttribute('data-id'),
          character: el.getAttribute('data-character'),
          class: el.getAttribute('class')
        });
      });

      return results;
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

scrapeCharacterCodes();
