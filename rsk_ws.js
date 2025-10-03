// rsk_ws.js
// Will connect and capture the WS data for 10 seconds
// this was just for initial exploration

const WebSocket = require('ws');
const axiosBase = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const ORIGIN = 'https://stats.rootstock.io';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function primusCb() {
  return `${Date.now()}-0`;
}

async function getCookieHeader() {
  const jar = new CookieJar();
  const axios = wrapper(axiosBase.create({ jar, withCredentials: true, timeout: 15000 }));

  await axios.get(ORIGIN, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  try {
    await axios.get(`https://be.stats.rootstock.io/primus/?_primuscb=${primusCb()}`, {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Origin': ORIGIN,
        'Referer': ORIGIN + '/',
      },
      validateStatus: () => true,
    });
  } catch (_) { /* ignore */ }

  return jar.getCookieString('https://be.stats.rootstock.io/');
}

function connect(cookieHeader) {
  const wsUrl = `wss://be.stats.rootstock.io/primus/?_primuscb=${primusCb()}`;

  const ws = new WebSocket(wsUrl, {
    headers: {
      Origin: ORIGIN,
      'User-Agent': UA,
      Referer: ORIGIN + '/',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: cookieHeader || '',
    },
  });

  ws.on('open', () => {
    console.log('WS OPEN (capturing for 10 seconds)…');
    // stop after 10 seconds to avoid flooding logs
    setTimeout(() => {
      console.log('Stopping capture after 10s…');
      ws.close();
    }, 10*1000);
  });

  ws.on('message', (data) => {
    let msg = data.toString();

    if (msg.startsWith('primus::ping::')) {
      const ts = msg.split('::')[2];
      ws.send(`primus::pong::${ts}`);
      return;
    }

    if (
      msg.length > 1 &&
      ['2','3','4'].includes(msg[0]) &&
      ['{','['].includes(msg[1])
    ) {
      msg = msg.slice(1);
    }

    try {
      const obj = JSON.parse(msg);
      console.log('[JSON]', obj);
    } catch {
      console.log('[RAW]', msg);
    }
  });

  ws.on('error', (err) => console.error('WS ERROR', err));
  ws.on('close', (code, reason) => console.log('WS CLOSED', code, reason.toString()));
}

(async () => {
  try {
    const cookieHeader = await getCookieHeader();
    console.log('Cookie header:', cookieHeader || '(none)');
    connect(cookieHeader);
  } catch (e) {
    console.error('Bootstrap error:', e);
  }
})();
