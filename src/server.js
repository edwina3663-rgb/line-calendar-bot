require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { parseCalendarEvent } = require('./nlp');
const { addGoogleCalendarEvent, getWeekEvents, getTodayEvents } = require('./google-calendar');

const app = express();
const PORT = process.env.PORT || 3000;

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const NOTIFY_USER_IDS = (process.env.NOTIFY_USER_IDS || '').split(',').filter(Boolean);

// 健康檢查
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'LINE 行事曆機器人運作中 🤖' });
});

// 驗證 LINE 簽名
function validateSignature(body, signature) {
  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
}

// LINE Webhook
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-line-signature'];
  const body = req.body;

  if (!validateSignature(body, signature)) {
    return res.status(403).send('Invalid signature');
  }

  res.json({ status: 'ok' });

  const events = JSON.parse(body).events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event);
    }
  }
});

// 每日提醒 endpoint（由 UptimeRobot 或外部 cron 呼叫）
app.get('/remind', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== process.env.REMIND_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    const events = await getTodayEvents(1); // 取明天的活動
    if (events.length === 0) {
      return res.json({ status: 'ok', message: '明天沒有行程' });
    }

    let msg = '📅 明天的行程提醒：\n\n';
    for (const e of events) {
      const start = new Date(e.start.dateTime || e.start.date);
      const timeStr = e.start.dateTime
        ? start.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
        : '整天';
      msg += `📌 ${e.summary}\n🕐 ${timeStr}\n`;
      if (e.location) msg += `📍 ${e.location}\n`;
      msg += '\n';
    }

    // 傳給所有通知對象
    for (const userId of NOTIFY_USER_IDS) {
      await pushMessage(userId, msg.trim());
    }

    res.json({ status: 'ok', sent: NOTIFY_USER_IDS.length });
  } catch (err) {
    console.error('提醒錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function pushMessage(userId, text) {
  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to: userId,
      messages: [{ type: 'text', text }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    }
  );
}

async function replyMessage(replyToken, text) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [{ type: 'text', text }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    }
  );
}

async function handleMessage(event) {
  const userText = event.message.text.trim();
  const replyToken = event.replyToken;

  console.log(`收到訊息：${userText}`);

  try {
    // 查詢這週行程
    if (userText.includes('這週行程') || userText.includes('本週行程') || userText.includes('這周行程')) {
      const events = await getWeekEvents();
      if (events.length === 0) {
        await replyMessage(replyToken, '📅 這週沒有行程');
        return;
      }
      let msg = '📅 這週行程：\n\n';
      for (const e of events) {
        const start = new Date(e.start.dateTime || e.start.date);
        const dateStr = start.toLocaleDateString('zh-TW', {
          timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'short'
        });
        const timeStr = e.start.dateTime
          ? start.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
          : '整天';
        msg += `📌 ${e.summary}\n📅 ${dateStr} ${timeStr}\n`;
        if (e.location) msg += `📍 ${e.location}\n`;
        msg += '\n';
      }
      await replyMessage(replyToken, msg.trim());
      return;
    }

    // 查詢今天行程
    if (userText.includes('今天行程') || userText.includes('今日行程')) {
      const events = await getTodayEvents(0);
      if (events.length === 0) {
        await replyMessage(replyToken, '📅 今天沒有行程');
        return;
      }
      let msg = '📅 今天行程：\n\n';
      for (const e of events) {
        const start = new Date(e.start.dateTime || e.start.date);
        const timeStr = e.start.dateTime
          ? start.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
          : '整天';
        msg += `📌 ${e.summary}\n🕐 ${timeStr}\n`;
        if (e.location) msg += `📍 ${e.location}\n`;
        msg += '\n';
      }
      await replyMessage(replyToken, msg.trim());
      return;
    }

    // 查詢明天行程
    if (userText.includes('明天行程') || userText.includes('明日行程')) {
      const events = await getTodayEvents(1);
      if (events.length === 0) {
        await replyMessage(replyToken, '📅 明天沒有行程');
        return;
      }
      let msg = '📅 明天行程：\n\n';
      for (const e of events) {
        const start = new Date(e.start.dateTime || e.start.date);
        const timeStr = e.start.dateTime
          ? start.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })
          : '整天';
        msg += `📌 ${e.summary}\n🕐 ${timeStr}\n`;
        if (e.location) msg += `📍 ${e.location}\n`;
        msg += '\n';
      }
      await replyMessage(replyToken, msg.trim());
      return;
    }

    // 新增活動
    const parsed = await parseCalendarEvent(userText);

    if (!parsed.isCalendarEvent) {
      await replyMessage(replyToken, parsed.reply || '你好！你可以：\n📅 新增活動：「幫我加入明天下午三點開會」\n🔍 查詢行程：「這週行程」、「今天行程」、「明天行程」');
      return;
    }

    const startDate = new Date(parsed.startTime);
    const endDate = new Date(parsed.endTime);
    const dateStr = startDate.toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    });
    const startTimeStr = startDate.toLocaleTimeString('zh-TW', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit'
    });
    const endTimeStr = endDate.toLocaleTimeString('zh-TW', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit'
    });

    const googleResult = await addGoogleCalendarEvent(parsed);

    let calendarStatus = googleResult.success ? '📆 Google 行事曆 ✅' : '📆 Google 行事曆 ❌';

    let replyText = `✅ 已新增活動！\n\n`;
    replyText += `📌 ${parsed.title}\n`;
    replyText += `📅 ${dateStr}\n`;
    replyText += `🕐 ${startTimeStr} - ${endTimeStr}\n`;
    if (parsed.location) replyText += `📍 ${parsed.location}\n`;
    if (parsed.description) replyText += `📝 ${parsed.description}\n`;
    replyText += `\n${calendarStatus}`;

    await replyMessage(replyToken, replyText);

  } catch (err) {
    console.error('處理訊息時發生錯誤:', err);
    await replyMessage(replyToken, '抱歉，處理時發生錯誤，請稍後再試 🙏').catch(() => {});
  }
}

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動：port ${PORT}`);
});
