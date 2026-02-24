const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('response', response => {
        if (response.status() >= 400) {
            console.log(`[HTTP ${response.status()}] ${response.url()}`);
        }
    });

    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
            console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
        }
    });

    page.on('pageerror', error => {
        console.log(`[PAGE ERROR] ${error.message}`);
    });

    try {
        await page.goto('http://127.0.0.1:8000', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        console.log(`[NAVIGATION ERROR] ${e.message}`);
    }

    await browser.close();
})();
