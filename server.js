const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// ── USAGE LOG (in memory, resets on restart) ──
const usageLog = [];

function logUsage(req) {
  try {
    const messages = req.body.messages || [];
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    const firstWords = lastUserMsg
      ? (typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content.slice(0, 60)
          : '[multipart]')
      : '[unknown]';

    const entry = {
      timestamp: new Date().toISOString(),
      firstWords,
      messageCount: messages.length,
      model: req.body.model || 'unknown',
      ip: (req.headers['x-forwarded-for'] || req.ip || '').slice(0, 8) + '***'
    };
    usageLog.push(entry);
    console.log('[USAGE]', JSON.stringify(entry));
  } catch (e) {
    console.error('Log error:', e.message);
  }
}

// ── STATS ENDPOINT ──
app.get('/stats', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = usageLog.filter(e => e.timestamp.startsWith(today)).length;
  const avgMessages = usageLog.length
    ? Math.round(usageLog.reduce((sum, e) => sum + e.messageCount, 0) / usageLog.length)
    : 0;

  res.json({
    total_requests: usageLog.length,
    today: todayCount,
    avg_messages_per_session: avgMessages,
    last_10: usageLog.slice(-10)
  });
});

app.post('/chat', async (req, res) => {
  // ── LOG THIS REQUEST ──
  logUsage(req);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ForeYou Proxy läuft auf Port ${PORT}`));
