// core_csv_scraper.js - Scraper for CORE price and gas price data via CSV download
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Helper function to extract numeric value from price text
function extractPrice(text) {
  if (!text) return null;
  const match = text.match(/\$?([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

// Helper function to parse CSV data and get latest gas price
function parseCSVForLatestGasPrice(csvContent) {
  try {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return null;
    
    // Skip header line, get the last data line (most recent)
    const lastLine = lines[lines.length - 1];
    const columns = lastLine.split(',');
    
    console.log('CSV columns:', columns);
    
    // Try to find gas price column (usually the second column after date/time)
    for (let i = 1; i < columns.length; i++) {
      const value = parseFloat(columns[i]);
      if (!isNaN(value) && value > 0 && value < 1000) { // Reasonable gas price range
        return {
          gasPrice: value,
          rawLine: lastLine,
          date: columns[0] || 'Unknown'
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing CSV:', error.message);
    return null;
  }
}

// Helper function to detect if site is blocking automated access
async function detectBlocking(page, response) {
  const indicators = {
    blocked: false,
    reasons: []
  };
  
  try {
    // Check HTTP response status
    const statusCode = response.status();
    console.log(`📡 HTTP Status Code: ${statusCode}`);
    
    if (statusCode === 403) {
      indicators.blocked = true;
      indicators.reasons.push('HTTP 403 Forbidden - Access denied');
    } else if (statusCode === 429) {
      indicators.blocked = true;
      indicators.reasons.push('HTTP 429 Too Many Requests - Rate limited');
    } else if (statusCode >= 500) {
      indicators.reasons.push(`HTTP ${statusCode} - Server error (may not be blocking)`);
    }
    
    // Wait a bit for page to load
    await page.waitForTimeout(2000);
    
    // Check page title and content for blocking indicators
    const title = await page.title();
    console.log(`📄 Page Title: "${title}"`);
    
    const pageContent = await page.content();
    const bodyText = await page.locator('body').textContent().catch(() => '');
    
    // Common blocking indicators
    const blockingPatterns = [
      { pattern: /cloudflare/i, message: 'Cloudflare protection detected' },
      { pattern: /checking your browser/i, message: 'Browser verification challenge' },
      { pattern: /please wait/i, message: 'Waiting/verification page' },
      { pattern: /access denied/i, message: 'Access denied message' },
      { pattern: /blocked/i, message: 'Blocked message' },
      { pattern: /captcha/i, message: 'CAPTCHA challenge detected' },
      { pattern: /bot/i, message: 'Bot detection message' },
      { pattern: /verify you are human/i, message: 'Human verification required' },
      { pattern: /ddos protection/i, message: 'DDoS protection active' },
      { pattern: /security check/i, message: 'Security check in progress' }
    ];
    
    for (const { pattern, message } of blockingPatterns) {
      if (pattern.test(title) || pattern.test(bodyText) || pattern.test(pageContent)) {
        indicators.blocked = true;
        indicators.reasons.push(message);
      }
    }
    
    // Check for specific blocking elements
    const blockingSelectors = [
      '#cf-wrapper', // Cloudflare wrapper
      '.cf-browser-verification', // Cloudflare verification
      '[id*="challenge"]', // Challenge elements
      '[class*="challenge"]',
      '[id*="captcha"]',
      '[class*="captcha"]'
    ];
    
    for (const selector of blockingSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
          indicators.blocked = true;
          indicators.reasons.push(`Blocking element found: ${selector}`);
        }
      } catch (e) {
        // Element not found, continue
      }
    }
    
  } catch (error) {
    console.log(`⚠️ Error during blocking detection: ${error.message}`);
    // Timeout might indicate blocking or slow network
    if (error.message.includes('Timeout')) {
      indicators.reasons.push('Page load timeout (could indicate blocking or slow network)');
    }
  }
  
  return indicators;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log('🔍 Loading Core DAO gas price chart...');
    
    // Set up download handling
    const downloadPath = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath);
    }
    
    // Configure browser to handle downloads
    const context = page.context();
    await context.setDefaultTimeout(30000);
    
    // Set up listeners for console and network before navigation
    const consoleMessages = [];
    const networkErrors = [];
    
    page.on('console', msg => {
      const text = msg.text();
      consoleMessages.push({ type: msg.type(), text });
      if (msg.type() === 'error' && /blocked|forbidden|403|429/i.test(text)) {
        networkErrors.push(`Console error: ${text}`);
      }
    });
    
    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      if (status === 403 || status === 429) {
        networkErrors.push(`Blocked resource: ${url} (${status})`);
      }
    });
    
    // Navigate to page and detect blocking
    console.log('\n🔒 Navigating to page and checking for automated access blocking...');
    let response;
    try {
      response = await page.goto('https://scan.coredao.org/chart/gasprice', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
    } catch (error) {
      console.log(`❌ Navigation failed: ${error.message}`);
      if (error.message.includes('Timeout')) {
        console.log('⚠️ This could indicate blocking or a slow network connection');
      }
      throw error;
    }
    
    // Detect blocking after initial load
    const blockingInfo = await detectBlocking(page, response);
    
    // Add network errors to blocking reasons
    if (networkErrors.length > 0) {
      blockingInfo.blocked = true;
      blockingInfo.reasons.push(...networkErrors);
    }
    
    if (blockingInfo.blocked) {
      console.log('\n❌ BLOCKING DETECTED!');
      console.log('Reasons:');
      blockingInfo.reasons.forEach(reason => console.log(`  - ${reason}`));
      console.log('\n💡 Suggestions:');
      console.log('  - Try running with headless: false to see what\'s happening');
      console.log('  - Add delays between requests');
      console.log('  - Use a different user agent');
      console.log('  - Check if the site requires cookies/session');
      console.log('  - Consider using a proxy or different IP');
    } else if (blockingInfo.reasons.length > 0) {
      console.log('\n⚠️ Potential issues (not necessarily blocking):');
      blockingInfo.reasons.forEach(reason => console.log(`  - ${reason}`));
    } else {
      console.log('✅ No blocking detected');
    }
    
    // Try to wait for network idle if not blocked
    if (!blockingInfo.blocked) {
      console.log('\n🔄 Waiting for page to fully load...');
      try {
        // Wait a bit more for dynamic content
        await page.waitForTimeout(3000);
        // Try to reload with networkidle if needed
        await page.reload({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {
          console.log('⚠️ Network idle timeout, but page may still be usable');
        });
      } catch (e) {
        console.log(`⚠️ Network idle timeout: ${e.message}`);
      }
    }
    
    // Extract CORE price first
    console.log('💰 Extracting CORE price...');
    let corePrice = null;
    let corePriceRaw = null;
    
    try {
      const corePriceElement = await page.locator('text=CORE Price').first();
      if (await corePriceElement.isVisible()) {
        const parent = corePriceElement.locator('..');
        const parentText = await parent.textContent();
        const price = extractPrice(parentText);
        if (price && price > 0) {
          corePrice = price;
          corePriceRaw = `$${price}`;
        }
      }
    } catch (e) {
      console.log('CORE price extraction failed:', e.message);
    }
    
    // Now try to download CSV data
    console.log('📊 Looking for CSV download option...');
    let avgGasPrice = null;
    let avgGasPriceRaw = null;
    
    try {
      // Look for download button/link - try multiple approaches
      const downloadSelectors = [
        'text=CSV Data',
        'text=Download',
        'svg[class*="iconify"]', // The SVG icon you showed
        '[class*="download"]',
        'a[href*="csv"]',
        'button[class*="download"]'
      ];
      
      let downloadElement = null;
      
      // Method 1: Look for clickable elements containing CSV/Download
      for (const selector of downloadSelectors) {
        try {
          const elements = await page.locator(selector).all();
          for (const element of elements) {
            if (await element.isVisible()) {
              // Check if this element or its parent is clickable
              const isClickable = await element.evaluate(el => {
                return el.tagName === 'A' || el.tagName === 'BUTTON' || 
                       el.onclick !== null || el.style.cursor === 'pointer' ||
                       el.classList.contains('cursor-pointer');
              });
              
              if (isClickable) {
                downloadElement = element;
                const text = await element.textContent();
                console.log(`Found clickable download element: "${text}"`);
                break;
              }
              
              // Check parent element
              const parent = element.locator('..');
              const parentClickable = await parent.evaluate(el => {
                return el.tagName === 'A' || el.tagName === 'BUTTON' || 
                       el.onclick !== null || el.style.cursor === 'pointer' ||
                       el.classList.contains('cursor-pointer');
              });
              
              if (parentClickable) {
                downloadElement = parent;
                const parentText = await parent.textContent();
                console.log(`Found clickable parent download element: "${parentText}"`);
                break;
              }
            }
          }
          if (downloadElement) break;
        } catch (e) {
          continue;
        }
      }
      
      // Method 2: Look specifically for the cursor-pointer class mentioned in your HTML
      if (!downloadElement) {
        try {
          const cursorPointerElements = await page.locator('.cursor-pointer').all();
          for (const element of cursorPointerElements) {
            const text = await element.textContent();
            if (text && text.includes('CSV')) {
              downloadElement = element;
              console.log(`Found cursor-pointer CSV element: "${text}"`);
              break;
            }
          }
        } catch (e) {
          console.log('Cursor-pointer method failed:', e.message);
        }
      }
      
      if (downloadElement) {
        // Set up download promise before clicking
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
        
        console.log('🔽 Clicking download button...');
        await downloadElement.click();
        
        // Wait for download to complete
        const download = await downloadPromise;
        const downloadFileName = download.suggestedFilename();
        const downloadFilePath = path.join(downloadPath, downloadFileName);
        
        console.log(`📁 Saving download as: ${downloadFileName}`);
        await download.saveAs(downloadFilePath);
        
        // Read and parse the CSV file
        console.log('📖 Reading CSV data...');
        const csvContent = fs.readFileSync(downloadFilePath, 'utf8');
        console.log(`CSV file size: ${csvContent.length} characters`);
        
        // Parse CSV to get latest gas price
        const gasData = parseCSVForLatestGasPrice(csvContent);
        if (gasData) {
          avgGasPrice = gasData.gasPrice;
          avgGasPriceRaw = `${gasData.gasPrice} GWei (${gasData.date})`;
          console.log(`✅ Found latest gas price: ${avgGasPrice} GWei from ${gasData.date}`);
        }
        
        // Clean up downloaded file
        fs.unlinkSync(downloadFilePath);
        console.log('🗑️ Cleaned up downloaded file');
        
      } else {
        console.log('❌ Could not find CSV download button');
      }
      
    } catch (error) {
      console.error('CSV download failed:', error.message);
    }
    
    // Results
    const result = {
      timestamp: new Date().toISOString(),
      core_price: corePrice,
      core_price_raw: corePriceRaw,
      avg_gas_price_gwei: avgGasPrice,
      avg_gas_price_raw: avgGasPriceRaw
    };
    
    console.log('\n✅ RESULTS:');
    console.log(`CORE Price: ${corePriceRaw || 'Not found'}`);
    console.log(`Avg Gas Price: ${avgGasPrice ? `${avgGasPrice} GWei` : 'Not found'}`);
    
    console.log('\n📊 JSON Output:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  } finally {
    // Clean up downloads directory if it exists
    const downloadPath = path.join(__dirname, 'downloads');
    if (fs.existsSync(downloadPath)) {
      const files = fs.readdirSync(downloadPath);
      files.forEach(file => {
        fs.unlinkSync(path.join(downloadPath, file));
      });
      fs.rmdirSync(downloadPath);
    }
    
    await browser.close();
  }
})();
