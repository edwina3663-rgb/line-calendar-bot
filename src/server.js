require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { parseCalendarEvent } = require('./nlp');
const { addGoogleCalendarEvent } = require('./google-calendar');
const { addTimeTreeEvent } = require('./timetree');

const app = express();
const PORT = process.env.PORT || 3000;

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

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
  const userText = event.message.text;
  const replyToken = event.replyToken;

  console.log(`收到訊息：${userText}`);

  try {
    const parsed = await parseCalendarEvent(userText);

    if (!parsed.isCalendarEvent) {
      await replyMessage(replyToken, parsed.reply || '你好！你可以跟我說「幫我加入明天下午三點開會」來新增行事曆活動 📅');
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

    const [googleResult, timetreeResult] = await Promise.all([
      addGoogleCalendarEvent(parsed),
      addTimeTreeEvent(parsed)
    ]);

    let calendarStatus = '';
    if (googleResult.success) calendarStatus += '📆 Google 行事曆 ✅\n';
    else if (googleResult.reason !== 'not_configured') calendarStatus += '📆 Google 行事曆 ❌\n';
    if (timetreeResult.success) calendarStatus += '🌲 TimeTree ✅\n';
    else if (timetreeResult.reason !== 'not_configured') calendarStatus += '🌲 TimeTree ❌\n';
    if (!calendarStatus) calendarStatus = '（行事曆尚未設定，活動已解析成功）\n';

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
