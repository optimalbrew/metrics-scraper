// master_scraper.js - Combined scraper for all blockchain metrics
const { spawn } = require('child_process');
const path = require('path');

// Helper function to run a scraper and parse its JSON output
function runScraper(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    const child = spawn('node', [scriptPath], { 
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname 
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        try {
          // Extract JSON from the output (look for the last JSON block)
          const lines = stdout.split('\n');
          let jsonStart = -1;
          
          // Find the start of JSON output
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim() === '{') {
              jsonStart = i;
              break;
            }
          }
          
          if (jsonStart !== -1) {
            const jsonLines = lines.slice(jsonStart);
            const jsonStr = jsonLines.join('\n');
            const result = JSON.parse(jsonStr);
            resolve({ success: true, data: result, logs: stdout });
          } else {
            resolve({ success: false, error: 'No JSON output found', logs: stdout });
          }
        } catch (error) {
          resolve({ success: false, error: `JSON parse error: ${error.message}`, logs: stdout });
        }
      } else {
        resolve({ success: false, error: `Script exited with code ${code}`, logs: stdout, stderr });
      }
    });
    
    child.on('error', (error) => {
      reject({ success: false, error: `Failed to start script: ${error.message}` });
    });
  });
}

(async () => {
  console.log('🚀 Starting Master Blockchain Metrics Scraper...\n');
  
  const scrapers = [
    { name: 'Rootstock', script: 'scrape_stats.js', description: 'Block time & gas price' },
    { name: 'Hiro/STX', script: 'hiro_combined_scraper.js', description: 'STX price & sBTC transfer fees' },
    { name: 'Core DAO', script: 'core_csv_scraper.js', description: 'CORE price & average gas price' },
    { name: 'BOB', script: 'bob_scraper.js', description: 'Average gas price' }
  ];
  
  const results = {};
  const logs = {};
  const errors = {};
  
  // Run all scrapers in parallel
  console.log('📊 Running all scrapers in parallel...\n');
  
  const promises = scrapers.map(async (scraper) => {
    console.log(`🔄 Starting ${scraper.name} scraper (${scraper.description})...`);
    
    try {
      const result = await runScraper(scraper.script);
      
      if (result.success) {
        results[scraper.name.toLowerCase().replace(/[^a-z0-9]/g, '_')] = result.data;
        console.log(`✅ ${scraper.name} scraper completed successfully`);
      } else {
        errors[scraper.name.toLowerCase().replace(/[^a-z0-9]/g, '_')] = result.error;
        console.log(`❌ ${scraper.name} scraper failed: ${result.error}`);
      }
      
      // Store logs for debugging if needed
      logs[scraper.name.toLowerCase().replace(/[^a-z0-9]/g, '_')] = result.logs;
      
    } catch (error) {
      errors[scraper.name.toLowerCase().replace(/[^a-z0-9]/g, '_')] = error.error || error.message;
      console.log(`❌ ${scraper.name} scraper failed: ${error.error || error.message}`);
    }
  });
  
  // Wait for all scrapers to complete
  await Promise.all(promises);
  
  console.log('\n🎯 All scrapers completed!\n');
  
  // Compile final results
  const masterResult = {
    timestamp: new Date().toISOString(),
    summary: {
      total_scrapers: scrapers.length,
      successful: Object.keys(results).length,
      failed: Object.keys(errors).length
    },
    data: results,
    errors: Object.keys(errors).length > 0 ? errors : undefined
  };
  
  // Display summary
  console.log('📋 SUMMARY:');
  console.log(`✅ Successful: ${masterResult.summary.successful}/${masterResult.summary.total_scrapers}`);
  if (masterResult.summary.failed > 0) {
    console.log(`❌ Failed: ${masterResult.summary.failed}/${masterResult.summary.total_scrapers}`);
  }
  
  // Display key metrics
  console.log('\n💰 KEY METRICS:');
  
  if (results.rootstock) {
    console.log(`Rootstock Block Time: ${results.rootstock.blocktime_seconds}s`);
    console.log(`Rootstock Avg Gas Price: ${results.rootstock.avg_gas_price_gwei} GWei`);
  }
  
  if (results.hiro_stx) {
    console.log(`STX Price: ${results.hiro_stx.stx_price_raw}`);
    console.log(`Latest sBTC Transfer Fee: ${results.hiro_stx.latest_transfer_fee_stx} STX`);
  }
  
  if (results.core_dao) {
    console.log(`CORE Price: ${results.core_dao.core_price_raw}`);
    console.log(`Core DAO Avg Gas Price: ${results.core_dao.avg_gas_price_gwei} GWei`);
  }
  
  if (results.bob) {
    console.log(`BOB Avg Gas Price: ${results.bob.avg_gas_price_gwei} GWei`);
  }
  
  console.log('\n📊 COMPLETE JSON OUTPUT:');
  console.log(JSON.stringify(masterResult, null, 2));
  
})().catch((error) => {
  console.error('❌ Master scraper failed:', error);
  process.exit(1);
});
