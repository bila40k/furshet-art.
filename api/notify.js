// Vercel Serverless Function: надсилає майстру повідомлення в Telegram про нове замовлення.
// Потрібні змінні середовища у Vercel (Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN — токен бота від @BotFather
//   TELEGRAM_CHAT_ID   — ID чату, куди слати (можна кілька через кому)

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = String(process.env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!token || chatIds.length === 0) {
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const name = clean(body.name, 100);
  const phone = clean(body.phone, 20);
  const items = clean(body.items, 1500);
  const total = Number(body.total);

  if (!name || !phone || !/^[+\d\s()\-]{5,20}$/.test(phone) || !items || !Number.isFinite(total) || total < 0) {
    return res.status(400).json({ ok: false, error: 'bad_request' });
  }

  const text = [
    '🍉 Нове замовлення з сайту Furshet Carving',
    '',
    `👤 ${name}`,
    `📞 ${phone}`,
    `🧺 ${items}`,
    `💰 ${total.toLocaleString('uk-UA')} грн`
  ].join('\n');

  try {
    const results = await Promise.all(chatIds.map(chat_id =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text, disable_web_page_preview: true })
      })
    ));
    const ok = results.every(r => r.ok);
    return res.status(ok ? 200 : 502).json({ ok });
  } catch (e) {
    return res.status(502).json({ ok: false });
  }
};
