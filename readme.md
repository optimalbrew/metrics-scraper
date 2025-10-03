# node rsk stats

Grab some stats from rsk.stats.io. Initial code from chat gpt 5 using info from browser network WS request response header 

```bash
npm init -y

npm install ws axios tough-cookie axios-cookiejar-support #some of these are to send proper header info to avoid 403 error
```

Initially we started with just `ws`, but that lead to a 403 error. 
>403 on the WS handshake usually means the server wants extra headers and/or cookies that your bare ws client didn’t send. With Primus behind a CDN/WAF, you typically need:
>* a valid Origin (https://stats.rootstock.io)
>* a realistic User-Agent
>* any cookies the backend/CDN issued to your browser/session
>
> Here’s a minimal Node setup that:
>* warms up a cookie jar by hitting the site first,
>* reuses those cookies in the WebSocket handshake,
>* handles Primus ping/pong and prints messages.


Run the script and send output to a log file

```
node rsk_ws.js > output.log 2>&1
```

The data we're looking for `avgblocktime` appears here

``` bash
[JSON] {
  action: 'charts',
  data: {
    height: [
      8059638, 8059639, 8059640, 8059641,
      8059642, 8059643, 8059644, 8059645,
      8059646, 8059647, 8059648, 8059649,
      8059650, 8059651, 8059652, 8059653,
      8059654, 8059655, 8059656, 8059657,
      8059658, 8059659, 8059660, 8059661,
      8059662, 8059663, 8059664, 8059665,
      8059666, 8059667, 8059668, 8059669,
      8059670, 8059671, 8059672, 8059673,
      8059674, 8059675, 8059676, 8059677
    ],
    blocktime: [
      21.821, 21.486,  17.74,  7.329, 23.709,
      27.024, 12.318, 11.384,  14.01, 52.333,
       43.93, 10.915, 40.736, 37.387,  6.676,
      21.799, 35.906, 65.368, 26.934, 25.598,
       7.051, 16.144, 35.325,  12.41, 15.202,
      53.045,  3.432,  7.928, 35.863,  9.735,
      31.456, 25.111, 44.312, 27.831, 22.528,
      26.381, 23.859, 37.015, 27.147, 29.025
    ],
    avgBlocktime: 25.219623500000036,
    ...
```

Also `hashrateComparedToBtcNetwork`, but this is an approximation, and can overstate the true hashrate.
Mining reports have more precise information.


Did not see average gas price in the output file. So maybe we should grab it using the DOM. From inspector, the
data for average gasprice shows up with this xpath

"/html/body/div/div/div/div[1]/div/div[10]/div[1]/div[2]"


But this can be inconsistent if card numbers shift. Use bd-tiltes instead.


```bash
npm install playwright
npx playwright install
```


```bash
node scrape_stats.js

# sample output
{
  "blocktime_raw": "24.87s",
  "blocktime_seconds": 24.87,
  "avg_gas_price_raw": "26,065,600wei",
  "avg_gas_price_wei": "26065600",
  "avg_gas_price_gwei": 0.0260656
}
```


This uses xpath, which can be inconsisten. For example, instead of block time it may report the value for something else
The scrape_stats scipt uses bd-titles instead.

```bash
node dom_scraper.js
```

Same output

```bash
Raw blocktime: 24.87s
Blocktime (seconds): 24.87
Raw wei: 26,065,600wei
Wei (numeric): 26065600
Gwei: 0.0260656
````