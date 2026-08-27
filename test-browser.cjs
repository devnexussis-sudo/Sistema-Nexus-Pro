const puppeteer = require('puppeteer');
const express = require('express');
const path = require('path');

const app = express();
// Serve the built files from dist
app.use(express.static(path.join(__dirname, 'dist')));

const PORT = 8080;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Capture and print console messages
    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.toString()}`));
    
    console.log('Navigating to app...');
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0', timeout: 30000 });
    
    console.log('Page loaded. Checking for # symbol in URL...');
    console.log(`Current URL: ${page.url()}`);
    
    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error('Puppeteer test failed:', error);
    process.exit(1);
  }
});
