const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--disable-gpu', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const html = 'file://' + path.resolve('/Users/vatai/worker-cabinet/Инструкция_Отпуска.html');
  await page.goto(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.pdf({
    path: '/Users/vatai/worker-cabinet/Инструкция_Отпуска.pdf',
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
  });
  console.log('✅ PDF: ' + Math.round(fs.statSync('/Users/vatai/worker-cabinet/Инструкция_Отпуска.pdf').size / 1024 / 1024) + 'MB');
  await browser.close();
})();
