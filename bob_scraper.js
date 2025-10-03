// bob_scraper.js - Scraper for BOB (Build on Bitcoin) average gas price
const { chromium } = require('playwright');

// Helper function to extract gas price from text
function extractGasPrice(text) {
  if (!text) return null;
  
  // Look for patterns like "1.5 Gwei", "1.5 gwei", "1.5 GWei"
  const gweiMatch = text.match(/([\d.]+)\s*g?wei/i);
  if (gweiMatch) {
    return parseFloat(gweiMatch[1]);
  }
  
  // Look for just numbers that might be gas prices
  const numberMatch = text.match(/([\d.]+)/);
  if (numberMatch) {
    const num = parseFloat(numberMatch[1]);
    // Reasonable gas price range for BOB
    if (num > 0 && num < 100) {
      return num;
    }
  }
  
  return null;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('🔍 Loading BOB explorer average gas price page...');
    
    // Navigate to BOB average gas price page
    await page.goto('https://explorer.gobob.xyz/stats/averageGasPrice', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log('⛽ Extracting average gas price...');
    let avgGasPrice = null;
    let avgGasPriceRaw = null;
    
    // Method 1: Look for current/latest gas price display
    try {
      const currentPriceSelectors = [
        '[data-testid*="gas"]',
        '[class*="gas"]',
        '[class*="price"]',
        '[class*="current"]',
        '[class*="latest"]',
        'h1', 'h2', 'h3',
        '.stat-value',
        '.metric-value'
      ];
      
      for (const selector of currentPriceSelectors) {
        try {
          const elements = await page.locator(selector).all();
          for (const element of elements) {
            if (await element.isVisible()) {
              const text = await element.textContent();
              if (text && (text.toLowerCase().includes('gwei') || /^\d+\.?\d*$/.test(text.trim()))) {
                const gasPrice = extractGasPrice(text);
                if (gasPrice && gasPrice > 0) {
                  avgGasPrice = gasPrice;
                  avgGasPriceRaw = text.trim();
                  console.log(`Found gas price in ${selector}: ${gasPrice} Gwei from "${text}"`);
                  break;
                }
              }
            }
          }
          if (avgGasPrice) break;
        } catch (e) {
          continue;
        }
      }
    } catch (e) {
      console.log('Current price method failed:', e.message);
    }
    
    // Method 2: Chart hover approach (similar to what we tried with Core DAO)
    if (!avgGasPrice) {
      console.log('Trying chart hover method...');
      try {
        // Wait for chart to load
        await page.waitForSelector('canvas, svg, .chart', { timeout: 10000 });
        
        const chartSelectors = ['canvas', 'svg', '.chart', '[class*="chart"]'];
        
        for (const selector of chartSelectors) {
          try {
            const chartElements = await page.locator(selector).all();
            
            for (const chartElement of chartElements) {
              if (await chartElement.isVisible()) {
                const box = await chartElement.boundingBox();
                if (box && box.width > 200 && box.height > 100) {
                  console.log(`Found chart: ${selector} (${box.width}x${box.height})`);
                  
                  // Try hovering on the rightmost part of the chart
                  const hoverPoints = [
                    { x: box.x + box.width * 0.95, y: box.y + box.height * 0.5 },
                    { x: box.x + box.width * 0.90, y: box.y + box.height * 0.5 },
                    { x: box.x + box.width * 0.85, y: box.y + box.height * 0.5 },
                  ];
                  
                  for (const point of hoverPoints) {
                    console.log(`Hovering at: ${point.x}, ${point.y}`);
                    await page.mouse.move(point.x, point.y);
                    await page.waitForTimeout(2000);
                    
                    // Check for tooltip content
                    const pageContent = await page.content();
                    if (pageContent.includes('gwei') || pageContent.includes('Gwei')) {
                      console.log('Found Gwei content after hover');
                      
                      // Look for tooltip elements
                      const allVisible = await page.locator('*:visible').all();
                      for (const element of allVisible.slice(-30)) {
                        try {
                          const text = await element.textContent();
                          if (text && text.toLowerCase().includes('gwei')) {
                            const gasPrice = extractGasPrice(text);
                            if (gasPrice && gasPrice > 0) {
                              avgGasPrice = gasPrice;
                              avgGasPriceRaw = text.trim();
                              console.log(`Found gas price from tooltip: ${gasPrice} Gwei`);
                              break;
                            }
                          }
                        } catch (e) {
                          continue;
                        }
                      }
                      
                      if (avgGasPrice) break;
                    }
                  }
                  
                  if (avgGasPrice) break;
                }
              }
            }
            
            if (avgGasPrice) break;
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        console.log('Chart hover method failed:', e.message);
      }
    }
    
    // Method 3: Scan all page content for gas price
    if (!avgGasPrice) {
      console.log('Scanning all page content for gas price...');
      
      const pageText = await page.textContent('body');
      console.log('Page contains "gwei":', pageText.toLowerCase().includes('gwei'));
      
      // Look for specific pattern: "Value[number] Gwei"
      const valueGweiMatch = pageText.match(/Value([\d.]+)\s*Gwei/i);
      if (valueGweiMatch) {
        const gasPrice = parseFloat(valueGweiMatch[1]);
        if (gasPrice && gasPrice > 0) {
          avgGasPrice = gasPrice;
          avgGasPriceRaw = `${gasPrice} Gwei`;
          console.log(`Found gas price from Value pattern: ${gasPrice} Gwei`);
        }
      }
      
      // Fallback: Look for any Gwei mentions
      if (!avgGasPrice) {
        const gweiMatches = pageText.match(/[^\n]*gwei[^\n]*/gi);
        if (gweiMatches) {
          console.log('Gwei mentions found:', gweiMatches.slice(0, 3));
          
          for (const match of gweiMatches) {
            const gasPrice = extractGasPrice(match);
            if (gasPrice && gasPrice > 0) {
              avgGasPrice = gasPrice;
              avgGasPriceRaw = `${gasPrice} Gwei`;
              console.log(`Found gas price from page scan: ${gasPrice} Gwei`);
              break;
            }
          }
        }
      }
      
      // If still not found, look for standalone numbers that might be gas prices
      if (!avgGasPrice) {
        const allElements = await page.locator('span, div, p, h1, h2, h3').all();
        
        for (const element of allElements.slice(0, 200)) {
          try {
            const text = await element.textContent();
            if (text && text.trim().length > 0 && text.trim().length < 20) {
              const gasPrice = extractGasPrice(text);
              if (gasPrice && gasPrice > 0 && gasPrice < 50) { // Reasonable range for BOB
                // Check if this looks like a gas price (not a date, block number, etc.)
                const trimmedText = text.trim();
                if (/^\d+\.?\d*$/.test(trimmedText) || trimmedText.toLowerCase().includes('gwei')) {
                  avgGasPrice = gasPrice;
                  avgGasPriceRaw = `${gasPrice} Gwei`;
                  console.log(`Found potential gas price: ${gasPrice} Gwei from "${text}"`);
                  break;
                }
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
      avg_gas_price_gwei: avgGasPrice,
      avg_gas_price_raw: avgGasPriceRaw,
      source: 'BOB Explorer'
    };
    
    console.log('\n✅ RESULTS:');
    console.log(`BOB Average Gas Price: ${avgGasPrice ? `${avgGasPrice} Gwei` : 'Not found'}`);
    
    console.log('\n📊 JSON Output:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
