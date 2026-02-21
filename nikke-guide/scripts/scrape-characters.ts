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

    // 캐릭터 목록이 로드될 때까지 대기
    await page.waitForSelector('[class*="character"]', { timeout: 10000 }).catch(() => {});

    // 페이지 스크롤하여 모든 캐릭터 로드
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(r => setTimeout(r, 2000));

    // 이미지 태그에서 캐릭터 코드 추출
    const characterData = await page.evaluate(() => {
      const results: { name: string; code: string }[] = [];
      const images = document.querySelectorAll('img[src*="static.dotgg.gg/nikke/characters/"]');

      images.forEach((img) => {
        const src = img.getAttribute('src') || '';
        const match = src.match(/characters\/(si_[^.]+)/);
        if (match) {
          const code = match[1];
          // alt 텍스트 또는附近的 텍스트에서 이름 찾기
          const alt = img.getAttribute('alt') || '';
          // 부모 또는 형제 요소에서 이름 찾기
          let name = alt;
          if (!name || name.includes('.')) {
            const parent = img.closest('div') || img.parentElement;
            const text = parent?.textContent?.trim() || '';
            name = text.split('\n')[0].trim();
          }
          if (name && !name.includes('.') && name.length > 1) {
            results.push({ name, code });
          }
        }
      });

      return results;
    });

    console.log(`Found ${characterData.length} characters`);

    // 중복 제거
    const unique = characterData.filter((v, i, a) => a.findIndex(t => t.code === v.code) === i);
    console.log('Unique characters:', unique.length);

    unique.forEach(c => {
      console.log(`${c.name}: ${c.code}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

scrapeCharacterCodes();
