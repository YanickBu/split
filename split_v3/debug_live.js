const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log("Launching puppeteer...");
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
    page.on('requestfailed', request => console.error('REQUEST FAILED:', request.url(), request.failure().errorText));

    console.log("Navigating to https://yanickbu.github.io/split/split_v3/index.html ...");
    await page.goto('https://yanickbu.github.io/split/split_v3/index.html', { waitUntil: 'networkidle0' });
    
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    console.log("Body HTML length:", bodyHTML.length);
    
    await browser.close();
  } catch(e) {
    console.error("Puppeteer crashed:", e);
  }
})();
