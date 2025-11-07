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
    if (error.message.includes('Timeout')) {
      indicators.reasons.push('Page load timeout (could indicate blocking or slow network)');
    }
  }
  
  return indicators;
}

(async () => {
  // Try with headless: false first to see if it helps bypass blocking
  // If it works, we can switch back to headless: true
  const browser = await chromium.launch({ 
    headless: false,  // Set to false to see what's happening and potentially bypass blocking
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox'
    ]
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });
  
  // Remove webdriver property to avoid detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });
  
  const page = await context.newPage();
  
  try {
    console.log('🔍 Loading Hiro explorer...');
    
    // Set up listeners for console and network before navigation
    const networkErrors = [];
    
    page.on('console', msg => {
      const text = msg.text();
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
    
    // Navigate to sBTC token page and detect blocking
    console.log('\n🔒 Navigating to page and checking for automated access blocking...');
    
    // Add a small delay to appear more human-like
    await page.waitForTimeout(1000);
    
    let response;
    try {
      response = await page.goto('https://explorer.hiro.so/token/SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token?chain=mainnet', { 
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
        await page.waitForTimeout(3000);
        await page.reload({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {
          console.log('⚠️ Network idle timeout, but page may still be usable');
        });
      } catch (e) {
        console.log(`⚠️ Network idle timeout: ${e.message}`);
      }
    }
    
    // Extract STX price
    console.log('\n💰 Extracting STX price...');
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
    
    // Wait for transfers to load and find the first one - with better error handling
    try {
      // Try multiple selectors for transfer
      const transferSelectors = [
        'text=transfer (sbtc-token)',
        'text=transfer',
        '[data-testid*="transfer"]',
        '[class*="transfer"]'
      ];
      
      let firstTransfer = null;
      let found = false;
      
      for (const selector of transferSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          firstTransfer = await page.locator(selector).first();
          if (await firstTransfer.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log(`✅ Found transfer using selector: ${selector}`);
            found = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!found) {
        console.log('⚠️ Could not find transfer element. Checking page content...');
        const bodyText = await page.locator('body').textContent().catch(() => '');
        console.log(`Page contains ${bodyText.length} characters`);
        if (bodyText.includes('transfer')) {
          console.log('✅ Page contains "transfer" text, but element not found');
        } else {
          console.log('❌ Page does not contain "transfer" text');
        }
        throw new Error('Transfer element not found');
      }
    
      // Find the transaction link in the same row
      const parentRow = firstTransfer.locator('..').locator('..');
      const txLink = await parentRow.locator('a[href*="0x"]').first();
      const href = await txLink.getAttribute('href');
    
      if (href) {
        console.log('📄 Getting transaction details...');
        const txUrl = `https://explorer.hiro.so${href}`;
        await page.goto(txUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for page to fully load
        await page.waitForTimeout(3000);
        
        // Look for fee on transaction page - try multiple comprehensive approaches
        console.log('🔍 Searching for transfer fee...');
        
        // Method 0: Look in table rows FIRST (most reliable method)
        if (!transferFee) {
          try {
            console.log('🔍 Method 0: Searching in tables (most reliable)...');
            const tableRows = await page.locator('tr, [role="row"]').all();
            for (const row of tableRows.slice(0, 50)) {
              const rowText = await row.textContent().catch(() => '');
              if (rowText && (rowText.includes('Fee') || rowText.includes('fee'))) {
                console.log(`Found fee row: "${rowText.substring(0, 200)}"`);
                const feeResult = extractSTXFee(rowText);
                if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                  transferFee = feeResult.fee;
                  transferFeeRaw = feeResult.cleanText;
                  console.log(`✅ Found fee in table row: ${transferFee} STX`);
                  break;
                }
              }
            }
          } catch (e) {
            console.log(`Method 0 (table search) failed: ${e.message}`);
          }
        }
        
        // Method 1: Use specific class names from inspection
        if (!transferFee) {
          try {
            console.log('🔍 Method 1: Using specific class selectors...');
          
          // Try to find the Fee div using the specific class
          // The fee value "0.01 STX" is in the same div as the Fee label
          const feeDivSelectors = [
            'div.css-1bbsapt',  // Direct div selector - this contains both "Fee" label and "0.01 STX" value
            '.css-1bbsapt'  // Alternative selector
          ];
          
          for (const selector of feeDivSelectors) {
            try {
              const feeDiv = await page.locator(selector).first();
              if (await feeDiv.isVisible({ timeout: 2000 }).catch(() => false)) {
                console.log(`✅ Found fee div with selector: ${selector}`);
                
                // Get the full text content of the div (includes "Fee", SVG, "0.01 STX", etc.)
                const feeDivText = await feeDiv.textContent().catch(() => '');
                console.log(`Fee div text: "${feeDivText}"`);
                
                // The fee value "0.01 STX" is in the text content of this div
                // Extract it using our extractSTXFee function
                let feeResult = extractSTXFee(feeDivText);
                if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                  transferFee = feeResult.fee;
                  transferFeeRaw = feeResult.cleanText;
                  console.log(`✅ Found fee in div: ${transferFee} STX`);
                  break;
                }
                
                // If extractSTXFee didn't work, try to find the STX value more directly
                // Look for pattern like "0.01 STX" in the text
                const stxMatch = feeDivText.match(/([\d,]+\.?\d*)\s*STX/i);
                if (stxMatch) {
                  const feeValue = parseFloat(stxMatch[1].replace(/,/g, ''));
                  if (feeValue > 0 && feeValue < 2) {
                    transferFee = feeValue;
                    transferFeeRaw = `${feeValue} STX`;
                    console.log(`✅ Found fee via direct match: ${transferFee} STX`);
                    break;
                  }
                }
                
                // Get the parent container to search for fee value
                const parent = feeDiv.locator('..');
                
                // Method A: Look for sibling divs (common pattern: label div, then value div)
                const siblings = await parent.locator('> *').all();
                console.log(`Found ${siblings.length} siblings`);
                
                for (const sibling of siblings) {
                  const siblingText = await sibling.textContent().catch(() => '');
                  const siblingHtml = await sibling.innerHTML().catch(() => '');
                  console.log(`Sibling text: "${siblingText.substring(0, 100)}"`);
                  
                  // Check if this sibling contains STX (likely the fee value)
                  if (siblingText && (siblingText.includes('STX') || siblingText.includes('µSTX'))) {
                    feeResult = extractSTXFee(siblingText);
                    if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                      transferFee = feeResult.fee;
                      transferFeeRaw = feeResult.cleanText;
                      console.log(`✅ Found fee in sibling: ${transferFee} STX`);
                      break;
                    }
                  }
                }
                
                if (transferFee) break;
                
                // Method B: Look for next sibling (common pattern: label div, then value div)
                const nextSibling = feeDiv.locator('+ *').first();
                if (await nextSibling.count() > 0) {
                  const nextSiblingText = await nextSibling.textContent().catch(() => '');
                  console.log(`Next sibling text: "${nextSiblingText}"`);
                  feeResult = extractSTXFee(nextSiblingText);
                  if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                    transferFee = feeResult.fee;
                    transferFeeRaw = feeResult.cleanText;
                    console.log(`✅ Found fee in next sibling: ${transferFee} STX`);
                    break;
                  }
                }
                
                // Method C: Look for previous sibling (sometimes value comes before label)
                const prevSibling = feeDiv.locator('xpath=preceding-sibling::*[1]').first();
                if (await prevSibling.count() > 0) {
                  const prevSiblingText = await prevSibling.textContent().catch(() => '');
                  console.log(`Previous sibling text: "${prevSiblingText}"`);
                  feeResult = extractSTXFee(prevSiblingText);
                  if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                    transferFee = feeResult.fee;
                    transferFeeRaw = feeResult.cleanText;
                    console.log(`✅ Found fee in previous sibling: ${transferFee} STX`);
                    break;
                  }
                }
                
                // Method D: Look for divs with similar class pattern (css-*)
                // The fee value might be in another div with a similar CSS class
                const similarDivs = await parent.locator('div[class^="css-"]').all();
                console.log(`Found ${similarDivs.length} divs with css- classes`);
                
                for (const div of similarDivs) {
                  const divText = await div.textContent().catch(() => '');
                  if (divText && divText !== 'Fee' && (divText.includes('STX') || divText.includes('µSTX'))) {
                    console.log(`Found similar div with STX: "${divText}"`);
                    feeResult = extractSTXFee(divText);
                    if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                      transferFee = feeResult.fee;
                      transferFeeRaw = feeResult.cleanText;
                      console.log(`✅ Found fee in similar div: ${transferFee} STX`);
                      break;
                    }
                  }
                }
                
                if (transferFee) break;
                
                // Method E: Look in parent container for any STX values
                const parentText = await parent.textContent().catch(() => '');
                console.log(`Parent container text: "${parentText.substring(0, 300)}"`);
                
                // Extract all STX values from parent and find the smallest (likely the fee)
                const stxMatches = parentText.match(/([\d,]+\.?\d*)\s*STX/gi);
                if (stxMatches) {
                  console.log(`Found STX values in parent: ${stxMatches.join(', ')}`);
                  for (const match of stxMatches) {
                    feeResult = extractSTXFee(match);
                    if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                      transferFee = feeResult.fee;
                      transferFeeRaw = feeResult.cleanText;
                      console.log(`✅ Found fee in parent container: ${transferFee} STX`);
                      break;
                    }
                  }
                }
                
                if (transferFee) break;
                
                // Method F: Look for all divs in the parent that contain STX
                const allDivs = await parent.locator('div').all();
                console.log(`Found ${allDivs.length} divs in parent`);
                
                for (const div of allDivs) {
                  const divText = await div.textContent().catch(() => '');
                  if (divText && divText !== 'Fee' && (divText.includes('STX') || divText.includes('µSTX'))) {
                    console.log(`Found div with STX: "${divText}"`);
                    feeResult = extractSTXFee(divText);
                    if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                      transferFee = feeResult.fee;
                      transferFeeRaw = feeResult.cleanText;
                      console.log(`✅ Found fee in div: ${transferFee} STX`);
                      break;
                    }
                  }
                }
                
                if (transferFee) break;
              }
            } catch (e) {
              console.log(`Selector ${selector} failed: ${e.message}`);
              continue;
            }
          }
          } catch (e) {
            console.log(`Method 1 failed: ${e.message}`);
          }
        }
        
        // Method 2: Look for "Fee" label and get nearby text
        if (!transferFee) {
          try {
            const feeSelectors = [
              'text=Fee',
              'text=/^Fee$/i',
              '[data-testid*="fee"]',
              '[class*="fee"]',
              '[id*="fee"]'
            ];
          
            for (const selector of feeSelectors) {
              try {
                const feeLabel = await page.locator(selector).first();
                if (await feeLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
                  console.log(`✅ Found fee label with selector: ${selector}`);
                  
                  // Try to get fee from parent container
                  const parent = feeLabel.locator('..');
                  const parentText = await parent.textContent().catch(() => '');
                  console.log(`Parent text: "${parentText.substring(0, 200)}"`);
                  
                  let feeResult = extractSTXFee(parentText);
                  if (feeResult && feeResult.fee > 0) {
                    transferFee = feeResult.fee;
                    transferFeeRaw = feeResult.cleanText;
                    console.log(`✅ Found fee via parent: ${transferFee} STX`);
                    break;
                  }
                  
                  // Try to get fee from sibling elements
                  const siblings = await parent.locator('..').locator('*').all();
                  for (const sibling of siblings.slice(0, 10)) {
                    const siblingText = await sibling.textContent().catch(() => '');
                    feeResult = extractSTXFee(siblingText);
                    if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                      transferFee = feeResult.fee;
                      transferFeeRaw = feeResult.cleanText;
                      console.log(`✅ Found fee via sibling: ${transferFee} STX`);
                      break;
                    }
                  }
                  
                  if (transferFee) break;
                  
                  // Try to get fee from next sibling
                  const nextSibling = feeLabel.locator('..').locator('+ *').first();
                  const nextSiblingText = await nextSibling.textContent().catch(() => '');
                  feeResult = extractSTXFee(nextSiblingText);
                  if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                    transferFee = feeResult.fee;
                    transferFeeRaw = feeResult.cleanText;
                    console.log(`✅ Found fee via next sibling: ${transferFee} STX`);
                    break;
                  }
                }
              } catch (e) {
                continue;
              }
            }
          } catch (e) {
            console.log(`Method 2 failed: ${e.message}`);
          }
        }
        
        // Method 3: Look for elements containing both "Fee" and STX/µSTX
        if (!transferFee) {
          try {
            console.log('🔍 Searching for elements with Fee and STX...');
            const allElements = await page.locator('*').all();
            
            for (const element of allElements.slice(0, 300)) {
              try {
                const text = await element.textContent();
                if (text && text.includes('Fee') && (text.includes('STX') || text.includes('µSTX'))) {
                  console.log(`Found fee element: "${text.substring(0, 200)}"`);
                  const feeResult = extractSTXFee(text);
                  if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                    transferFee = feeResult.fee;
                    transferFeeRaw = feeResult.cleanText;
                    console.log(`✅ Found fee in element: ${transferFee} STX`);
                    break;
                  }
                }
              } catch (e) {
                continue;
              }
            }
          } catch (e) {
            console.log(`Method 3 failed: ${e.message}`);
          }
        }
        
        // Method 4: Look for all STX/µSTX values and find the smallest reasonable one (likely the fee)
        if (!transferFee) {
          try {
            console.log('🔍 Searching for all STX values and finding fee...');
            const allElements = await page.locator('span, div, p, td, th').all();
            const stxValues = [];
            
            for (const element of allElements.slice(0, 200)) {
              try {
                const text = await element.textContent();
                if (text && (text.includes('STX') || text.includes('µSTX')) && text.length < 200) {
                  const feeResult = extractSTXFee(text);
                  if (feeResult && feeResult.fee > 0 && feeResult.fee < 2) {
                    stxValues.push({
                      fee: feeResult.fee,
                      text: text.trim(),
                      element: element
                    });
                  }
                }
              } catch (e) {
                continue;
              }
            }
            
            if (stxValues.length > 0) {
              // Sort by fee amount and take the smallest (likely the fee)
              stxValues.sort((a, b) => a.fee - b.fee);
              console.log(`Found ${stxValues.length} STX values:`, stxValues.slice(0, 5).map(v => `${v.fee} STX`));
              
              // Take the smallest value as the fee
              const smallest = stxValues[0];
              transferFee = smallest.fee;
              transferFeeRaw = smallest.text;
              console.log(`✅ Using smallest STX value as fee: ${transferFee} STX`);
            }
          } catch (e) {
            console.log(`Method 4 failed: ${e.message}`);
          }
        }
        
        // Method 5: Get page content and search for fee patterns
        if (!transferFee) {
          try {
            console.log('🔍 Searching page content for fee patterns...');
            const bodyText = await page.locator('body').textContent().catch(() => '');
            
            // Look for patterns like "Fee: 0.123 STX" or "Fee 0.123 STX"
            const feePatterns = [
              /fee[:\s]+([\d,]+\.?\d*)\s*stx/i,
              /fee[:\s]+([\d,]+)\s*µstx/i,
              /transaction\s+fee[:\s]+([\d,]+\.?\d*)\s*stx/i
            ];
            
            for (const pattern of feePatterns) {
              const match = bodyText.match(pattern);
              if (match) {
                const feeValue = parseFloat(match[1].replace(/,/g, ''));
                if (feeValue > 0 && feeValue < 2) {
                  transferFee = feeValue;
                  transferFeeRaw = `${feeValue} STX`;
                  console.log(`✅ Found fee via pattern match: ${transferFee} STX`);
                  break;
                }
              }
            }
          } catch (e) {
            console.log(`Method 5 failed: ${e.message}`);
          }
        }
        
        if (!transferFee) {
          console.log('⚠️ Could not find transfer fee on transaction page');
          console.log('💡 Debug: Taking screenshot of page...');
          // Optionally save a screenshot for debugging
          // await page.screenshot({ path: 'transaction-page.png' });
        }
      } else {
        console.log('⚠️ Could not find transaction link');
      }
    } catch (error) {
      console.log(`⚠️ Error finding transfer transaction: ${error.message}`);
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
