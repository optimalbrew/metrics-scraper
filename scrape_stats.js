// scrape_stats.js
const { chromium } = require('playwright');

async function valueByExactTitle(page, exactTitle) {
  const card = page
    .locator('.big-data')
    .filter({
      has: page.locator('.bd-title', {
        hasText: new RegExp(`^\\s*${exactTitle}\\s*$`, 'i'),
      }),
    })
    .first();

  const valueNode = card.locator('.bd-data').first();
  await valueNode.waitFor({ state: 'visible', timeout: 15000 });
  return (await valueNode.innerText()).trim();
}

function parseBlockTimeSeconds(raw) {
  const cleaned = raw.trim().toLowerCase().replace(/seconds?$/,'s').replace(/\s+/g,'');
  const m = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  if (!m) throw new Error(`Unexpected block time format: ${raw}`);
  return parseFloat(m[1]);
}

function parseWeiToGwei(raw) {
  const cleaned = raw.replace(/wei$/i, '').replace(/,/g, '').trim();
  if (!/^\d+$/.test(cleaned)) throw new Error(`Unexpected wei format: ${raw}`);
  const wei = BigInt(cleaned);
  const gwei = Number(wei) / 1e9;
  return { wei: wei.toString(), gwei };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://stats.rootstock.io/', { waitUntil: 'networkidle' });

  const btRaw = await valueByExactTitle(page, 'avg block time');
  const gpRaw = await valueByExactTitle(page, 'avg gas price');

  const blocktime_seconds = parseBlockTimeSeconds(btRaw);
  const { wei: avg_gas_price_wei, gwei: avg_gas_price_gwei } = parseWeiToGwei(gpRaw);

  const result = {
    blocktime_raw: btRaw,
    blocktime_seconds,
    avg_gas_price_raw: gpRaw,
    avg_gas_price_wei,
    avg_gas_price_gwei,
  };

  console.log(JSON.stringify(result, null, 2)); // pretty-print
  await browser.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
