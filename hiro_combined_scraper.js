// hiro_combined_scraper.js - Simple scraper for STX price and latest sBTC transfer fee
// generated using cursor (auto agent)
//
// NOTE: This script uses web scraping. Alternative API endpoints discovered:
// - Contract info: https://api.hiro.so/extended/v1/contract/SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
// - Transactions: https://api.hiro.so/extended/v2/addresses/SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token/transactions?limit=30&offset=0
// - For a pure API approach, consider using these endpoints instead of scraping
//
const { chromium } = require('playwright');

// Helper function to extract numeric value from price text
function extractPrice(text) {
  if (!text) return null;
  const match = text.match(/\$?([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

// Helper function to extract STX fee amount and clean the text
function extractSTXFee(text) {
  if (!text) return null;
  
  // Look for patterns like "0.200000 STX" or "200,000 µSTX"
  const stxMatch = text.match(/([\d,]+\.?\d*)\s*STX/i);
  if (stxMatch) {
    return {
      fee: parseFloat(stxMatch[1].replace(/,/g, '')),
      cleanText: `${stxMatch[1]} STX`
    };
  }
  
  // Convert µSTX to STX (1 STX = 1,000,000 µSTX)
  const microStxMatch = text.match(/([\d,]+)\s*µSTX/i);
  if (microStxMatch) {
    const fee = parseFloat(microStxMatch[1].replace(/,/g, '')) / 1000000;
    return {
      fee: fee,
      cleanText: `${fee} STX`
    };
  }
  
  return null;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('🔍 Loading Hiro explorer...');
    
    // Navigate to sBTC token page
    await page.goto('https://explorer.hiro.so/token/SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token?chain=mainnet', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Extract STX price
    console.log('💰 Extracting STX price...');
    let stxPrice = null;
    let stxPriceRaw = null;
    
    const priceElements = await page.locator('text=/\\$[\\d.]+/').all();
    for (const element of priceElements) {
      const text = await element.textContent();
      const price = extractPrice(text);
      if (price && price > 0 && price < 10) { // STX price should be reasonable
        stxPrice = price;
        stxPriceRaw = text.trim();
        break;
      }
    }
    
    // Extract latest transfer fee
    console.log('🔄 Finding latest transfer transaction...');
    let transferFee = null;
    let transferFeeRaw = null;
    
    // Wait for transfers to load and find the first one
    await page.waitForSelector('text=transfer', { timeout: 10000 });
    const firstTransfer = await page.locator('text=transfer (sbtc-token)').first();
    
    // Find the transaction link in the same row
    const parentRow = firstTransfer.locator('..').locator('..');
    const txLink = await parentRow.locator('a[href*="0x"]').first();
    const href = await txLink.getAttribute('href');
    
    if (href) {
      console.log('📄 Getting transaction details...');
      const txUrl = `https://explorer.hiro.so${href}`;
      await page.goto(txUrl, { waitUntil: 'networkidle' });
      
      // Look for fee on transaction page - try multiple approaches
      
      // Method 1: Look for "Fee" label
      try {
        const feeLabel = await page.locator('text=Fee').first();
        if (await feeLabel.isVisible()) {
          const parent = feeLabel.locator('..');
          const parentText = await parent.textContent();
          const feeResult = extractSTXFee(parentText);
          if (feeResult && feeResult.fee > 0) {
            transferFee = feeResult.fee;
            transferFeeRaw = feeResult.cleanText;
          }
        }
      } catch (e) {}
      
      // Method 2: Scan all elements if Method 1 failed
      if (!transferFee) {
        const allElements = await page.locator('span, div, p').all();
        
        for (const element of allElements.slice(0, 150)) {
          try {
            const text = await element.textContent();
            if (text && (text.includes('STX') || text.includes('µSTX')) && text.length < 200) {
              const feeResult = extractSTXFee(text);
              if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) { // Reasonable fee range
                transferFee = feeResult.fee;
                transferFeeRaw = feeResult.cleanText;
                console.log(`Found fee: ${feeResult.fee} STX`);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
    }
    
    // Results
    const result = {
      timestamp: new Date().toISOString(),
      stx_price: stxPrice,
      stx_price_raw: stxPriceRaw,
      latest_transfer_fee_stx: transferFee,
      latest_transfer_fee_raw: transferFeeRaw
    };
    
    console.log('\n✅ RESULTS:');
    console.log(`STX Price: ${stxPriceRaw || 'Not found'}`);
    console.log(`Latest Transfer Fee: ${transferFee ? `${transferFee} STX` : 'Not found'}`);
    
    console.log('\n📊 JSON Output:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
