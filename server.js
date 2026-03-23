const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
app.use(cors());
app.use(express.json());

const JSONBIN_KEY = '$2a$10$PaM27r3QWoOQOdmZLDgl..pAgmHOkTpqHu8zwFozZHld5TQi..wfC';
const JSONBIN_BIN = '69c10e97c3097a1dd54f3efb';
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN}`;

// ── JSONBIN LOGGING ──
async function readLogs() {
  try {
    const res = await axios.get(JSONBIN_URL + '/latest', {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    });
    return res.data.record.logs || [];
  } catch (e) {
    console.error('JSONbin read error:', e.message);
    return [];
  }
}

async function writeLog(entry) {
  try {
    const logs = await readLogs();
    logs.push(entry);
    // Keep last 500 entries
    const trimmed = logs.slice(-500);
    await axios.put(JSONBIN_URL, { logs: trimmed }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_KEY
      }
    });
    console.log('[USAGE logged]', entry.firstWords);
  } catch (e) {
    console.error('JSONbin write error:', e.message);
  }
}

function buildEntry(req) {
  const messages = req.body.messages || [];
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  const firstWords = lastUserMsg
    ? (typeof lastUserMsg.content === 'string'
        ? lastUserMsg.content.slice(0, 80)
        : '[multipart]')
    : '[unknown]';
  return {
    timestamp: new Date().toISOString(),
    firstWords,
    messageCount: messages.length,
    model: req.body.model || 'unknown',
    ip: (req.headers['x-forwarded-for'] || req.ip || '').slice(0, 8) + '***'
  };
}

// ── STATS ENDPOINT ──
app.get('/stats', async (req, res) => {
  const logs = await readLogs();
  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter(e => e.timestamp.startsWith(today));
  const avg = logs.length
    ? Math.round(logs.reduce((s, e) => s + (e.messageCount || 1), 0) / logs.length)
    : 0;
  res.json({
    total_requests: logs.length,
    today: todayLogs.length,
    avg_messages_per_session: avg,
    last_10: logs.slice(-10)
  });
});

app.post('/chat', async (req, res) => {
  // Log async — don't wait so it doesn't slow down the response
  writeLog(buildEntry(req)).catch(() => {});

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', req.body, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ForeYou Proxy läuft auf Port ${PORT}`));
