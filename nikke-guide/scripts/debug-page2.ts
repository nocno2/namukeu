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
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // canvas 요소 확인
    const canvasData = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      return Array.from(canvases).slice(0, 5).map(c => ({
        width: c.width,
        height: c.height,
        id: c.id,
        class: c.getAttribute('class')
      }));
    });
    console.log('Canvas elements:', JSON.stringify(canvasData, null, 2));

    // canvas의 data 속성 확인
    const canvasWithData = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas[data-]');
      return Array.from(canvases).slice(0, 5).map(c => {
        const data: Record<string, string> = {};
        Array.from(c.attributes).forEach(attr => {
          if (attr.name.startsWith('data-')) {
            data[attr.name] = attr.value;
          }
        });
        return data;
      });
    });
    console.log('Canvas data attributes:', JSON.stringify(canvasWithData, null, 2));

    // script 태그에서 데이터 찾기
    const scriptData = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      const results: string[] = [];
      scripts.forEach(script => {
        const content = script.textContent || '';
        if (content.includes('nikke') && content.includes('live2d')) {
          results.push(content.slice(0, 500));
        }
      });
      return results;
    });
    console.log('Script data:', scriptData.slice(0, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

scrapeCharacterCodes();
