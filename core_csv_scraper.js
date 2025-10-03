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
    
    // Navigate to Core DAO gas price page
    await page.goto('https://scan.coredao.org/chart/gasprice', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
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
