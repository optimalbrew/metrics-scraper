# Blockchain Metrics Scraper

A collection of web scrapers to extract key metrics from multiple blockchain explorers and networks.

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm

### Installation

Dependencies
- **Playwright** - Web scraping and browser automation
- Other dependencies (axios, ws, tough-cookie) are used by legacy scripts used for initial eploration.


```bash
npm install
```

### Usage

**Run all scrapers at once (recommended):**
```bash
node master_scraper.js
```

This will collect data from all supported networks in parallel and provide a combined JSON output.

Sample output
```bash
💰 KEY METRICS:
Rootstock Block Time: 24.03s
Rootstock Avg Gas Price: 0.0260656 GWei
STX Price: $0.61
Latest sBTC Transfer Fee: 0.2 STX
CORE Price: $0.4
Core DAO Avg Gas Price: 51.04 GWei
BOB Avg Gas Price: 0.000359391639534421 GWei
```

## Supported Networks

| Network | Data Collected | Source |
|---------|---------------|---------|
| **Rootstock** | Block time, Average gas price | stats.rootstock.io |
| **Stacks (STX)** | STX price, sBTC transfer fees | explorer.hiro.so |
| **Core DAO** | CORE price, Average gas price | scan.coredao.org |
| **BOB** | Average gas price | explorer.gobob.xyz |

## Individual Scrapers

You can also run individual scrapers:

```bash
# Rootstock metrics
node scrape_stats.js

# STX price and sBTC transfer fees  
node hiro_combined_scraper.js

# CORE price and gas price (downloads CSV)
node core_csv_scraper.js

# BOB average gas price
node bob_scraper.js
```

## Sample Output

```json
{
  "timestamp": "2025-10-03T08:06:18.438Z",
  "summary": {
    "total_scrapers": 4,
    "successful": 4,
    "failed": 0
  },
  "data": {
    "rootstock": {
      "blocktime_seconds": 23.99,
      "avg_gas_price_gwei": 0.0260656
    },
    "hiro_stx": {
      "stx_price": 0.62,
      "latest_transfer_fee_stx": 0.2
    },
    "core_dao": {
      "core_price": 0.4,
      "avg_gas_price_gwei": 51.04
    },
    "bob": {
      "avg_gas_price_gwei": 0.000359391639534421
    }
  }
}
```

## Notes

- All scrapers use headless browser automation for reliable data extraction
- The Core DAO scraper downloads CSV data temporarily for accurate gas price information
- Scrapers include fallback methods for robust data extraction
- All temporary files are automatically cleaned up after execution