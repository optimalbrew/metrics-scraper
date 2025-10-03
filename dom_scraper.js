// dom_scraper.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://stats.rootstock.io/', { waitUntil: 'networkidle' });

  // --- Extract blocktime ---
  const blocktimeEl = page.locator('xpath=/html/body/div/div/div/div[1]/div/div[5]/div[1]/div[2]');
  await blocktimeEl.waitFor({ state: 'visible', timeout: 10000 });

  console.log("This uses xpaths, so can be inconsistent if card numbers shift.\nCheck the output. Or use bd-titles instead.\n")
  let blocktimeRaw = (await blocktimeEl.innerText()).trim();   // e.g. "25.07s"
  console.log("Raw blocktime:", blocktimeRaw);

  blocktimeRaw = blocktimeRaw.replace(/s$/i, '').trim(); // remove trailing "s"
  const blocktimeSeconds = parseFloat(blocktimeRaw);
  console.log("Blocktime (seconds):", blocktimeSeconds);

  // --- Extract wei and convert to gwei ---
  const weiEl = page.locator('xpath=/html/body/div/div/div/div[1]/div/div[10]/div[1]/div[2]');
  await weiEl.waitFor({ state: 'visible', timeout: 10000 });

  let weiRaw = (await weiEl.innerText()).trim();   // e.g. "26,065,600wei"
  console.log("Raw wei:", weiRaw);

  weiRaw = weiRaw.replace(/wei$/i, '').replace(/,/g, '').trim();
  const weiValue = BigInt(weiRaw);                  // safer with BigInt
  const gweiValue = Number(weiValue) / 1e9;

  console.log("Wei (numeric):", weiValue.toString());
  console.log("Gwei:", gweiValue);

  await browser.close();
})();
