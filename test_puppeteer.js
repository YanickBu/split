const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  // We'll serve the directory using a simple http server
  await page.goto('http://localhost:8080/split_v3/index.html');
  
  // Wait for the app to initialize
  await new Promise(r => setTimeout(r, 1000));
  
  // Create a new group
  await page.evaluate(() => {
    document.getElementById("groupName").value = "Test Group";
    document.getElementById("creatorName").value = "Alice";
    document.getElementById("newGroupForm").dispatchEvent(new Event("submit"));
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Check what the UI says
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("Browser 1 UI after create:", bodyText.includes("Connecting...") ? "Connecting..." : "Dashboard loaded");
  console.log("Browser 1 URL:", await page.url());
  
  const hash = await page.evaluate(() => window.location.hash);
  
  // Open Browser 2
  const page2 = await browser.newPage();
  await page2.goto('http://localhost:8080/split_v3/index.html' + hash);
  
  await new Promise(r => setTimeout(r, 3000));
  
  const bodyText2 = await page2.evaluate(() => document.body.innerText);
  console.log("Browser 2 UI after 3s:", bodyText2.includes("Connecting...") ? "Connecting..." : "Dashboard loaded");
  
  await browser.close();
  process.exit(0);
})();
