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
const REMIND_SECRET = process.env.REMIND_SECRET || '';

// 對話狀態暫存（記憶體）
const userState = {};

// 健康檢查
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'LINE 行事曆機器人運作中 🤖' });
});

function validateSignature(body, signature) {
  const hash = crypto.createHmac('SHA256', LINE_CHANNEL_SECRET).update(body).digest('base64');
  return hash === signature;
}

// LINE Webhook
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!validateSignature(req.body, signature)) return res.status(403).send('Invalid signature');
  res.json({ status: 'ok' });
  const events = JSON.parse(req.body).events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event);
    }
  }
});

// 每日提醒
app.get('/remind', async (req, res) => {
  if (req.query.secret !== REMIND_SECRET) return res.status(403).json({ error: 'forbidden' });
  try {
    const events = await getTodayEvents(1);
    if (events.length === 0) return res.json({ status: 'ok', message: '明天沒有行程' });
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
    for (const userId of NOTIFY_USER_IDS) await pushMessage(userId, msg.trim());
    res.json({ status: 'ok', sent: NOTIFY_USER_IDS.length });
  } catch (err) {
    console.error('提醒錯誤:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function pushMessage(userId, text) {
  await axios.post('https://api.line.me/v2/bot/message/push',
    { to: userId, messages: [{ type: 'text', text }] },
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
  );
}

async function replyMessage(replyToken, text) {
  await axios.post('https://api.line.me/v2/bot/message/reply',
    { replyToken, messages: [{ type: 'text', text }] },
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
  );
}

function formatEventReply(parsed, googleResult) {
  const isAllDay = parsed.allDay;
  let dateStr = '';

  if (isAllDay) {
    const start = new Date(parsed.startTime + 'T00:00:00+08:00');
    const end = new Date(parsed.endTime + 'T00:00:00+08:00');
    const startStr = start.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'short' });
    const endStr = end.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'short' });
    dateStr = startStr === endStr ? `📅 ${startStr} 整天` : `📅 ${startStr} ～ ${endStr}`;
  } else {
    const start = new Date(parsed.startTime);
    const end = new Date(parsed.endTime);
    const dateLabel = start.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    const startTime = start.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' });
    const endTime = end.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' });
    dateStr = `📅 ${dateLabel}\n🕐 ${startTime} - ${endTime}`;
  }

  let text = `✅ 已新增活動！\n\n📌 ${parsed.title}\n${dateStr}\n`;
  if (parsed.location) text += `📍 ${parsed.location}\n`;
  if (parsed.description) text += `📝 ${parsed.description}\n`;
  text += `\n${googleResult.success ? '📆 Google 行事曆 ✅' : '📆 Google 行事曆 ❌'}`;
  return text;
}

async function handleMessage(event) {
  const userId = event.source.userId;
  const userText = event.message.text.trim();
  const replyToken = event.replyToken;

  console.log(`收到訊息：${userText}`);

  try {
    const state = userState[userId];

    // ── 對話狀態：等待活動內容 ──
    if (state?.step === 'waiting_content') {
      // 取消
      if (userText === '取消') {
        delete userState[userId];
        await replyMessage(replyToken, '已取消新增活動 😊');
        return;
      }
      // 解析活動內容
      const parsed = await parseCalendarEvent(userText);
      if (!parsed.isCalendarEvent) {
        await replyMessage(replyToken, '我看不太懂這個活動內容，請重新描述，例如：\n「7/6-7/10 墾丁旅遊」\n「明天下午三點牙醫回診」\n\n傳「取消」可以離開');
        return;
      }
      // 儲存解析結果，詢問地點
      userState[userId] = { step: 'waiting_location', parsed };
      await replyMessage(replyToken, `📌 活動：${parsed.title}\n\n請問有地點嗎？\n有的話請輸入地點，沒有請傳「略過」`);
      return;
    }

    // ── 對話狀態：等待地點 ──
    if (state?.step === 'waiting_location') {
      if (userText === '取消') {
        delete userState[userId];
        await replyMessage(replyToken, '已取消新增活動 😊');
        return;
      }
      const parsed = state.parsed;
      if (userText !== '略過') {
        parsed.location = userText;
      }
      delete userState[userId];

      const googleResult = await addGoogleCalendarEvent(parsed);
      await replyMessage(replyToken, formatEventReply(parsed, googleResult));
      return;
    }

    // ── 單純輸入「新增活動」→ 進入對話流程 ──
    const addKeywords = ['新增活動', '新增', '加入活動', '➕ 新增活動', '幫我新增活動', '幫我加入', '新增行程', '加入行程'];
    if (addKeywords.includes(userText)) {
      userState[userId] = { step: 'waiting_content' };
      await replyMessage(replyToken, '請說明活動內容 📝\n\n例如：\n• 「7/6-7/10 墾丁旅遊」\n• 「明天下午三點牙醫回診」\n• 「下週五晚上七點聚餐」\n\n傳「取消」可以離開');
      return;
    }

    // ── 查詢這週行程 ──
    if (userText.includes('這週行程') || userText.includes('本週行程') || userText.includes('這周行程')) {
      const events = await getWeekEvents();
      if (events.length === 0) { await replyMessage(replyToken, '📅 這週沒有行程'); return; }
      let msg = '📅 這週行程：\n\n';
      for (const e of events) {
        const start = new Date(e.start.dateTime || e.start.date);
        const dateLabel = start.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'short' });
        const timeStr = e.start.dateTime ? start.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }) : '整天';
        msg += `📌 ${e.summary}\n📅 ${dateLabel} ${timeStr}\n`;
        if (e.location) msg += `📍 ${e.location}\n`;
        msg += '\n';
      }
      await replyMessage(replyToken, msg.trim());
      return;
    }

    // ── 查詢今天行程 ──
    if (userText.includes('今天行程') || userText.includes('今日行程')) {
      const events = await getTodayEvents(0);
      if (events.length === 0) { await replyMessage(replyToken, '📅 今天沒有行程'); return; }
      let msg = '📅 今天行程：\n\n';
      for (const e of events) {
        const start = new Date(e.start.dateTime || e.start.date);
        const timeStr = e.start.dateTime ? start.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }) : '整天';
        msg += `📌 ${e.summary}\n🕐 ${timeStr}\n`;
        if (e.location) msg += `📍 ${e.location}\n`;
        msg += '\n';
      }
      await replyMessage(replyToken, msg.trim());
      return;
    }

    // ── 查詢明天行程 ──
    if (userText.includes('明天行程') || userText.includes('明日行程')) {
      const events = await getTodayEvents(1);
      if (events.length === 0) { await replyMessage(replyToken, '📅 明天沒有行程'); return; }
      let msg = '📅 明天行程：\n\n';
      for (const e of events) {
        const start = new Date(e.start.dateTime || e.start.date);
        const timeStr = e.start.dateTime ? start.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }) : '整天';
        msg += `📌 ${e.summary}\n🕐 ${timeStr}\n`;
        if (e.location) msg += `📍 ${e.location}\n`;
        msg += '\n';
      }
      await replyMessage(replyToken, msg.trim());
      return;
    }

    // ── 直接輸入活動內容（含日期關鍵字）→ 嘗試解析 ──
    const parsed = await parseCalendarEvent(userText);
    if (parsed.isCalendarEvent) {
      userState[userId] = { step: 'waiting_location', parsed };
      await replyMessage(replyToken, `📌 活動：${parsed.title}\n\n請問有地點嗎？\n有的話請輸入地點，沒有請傳「略過」`);
      return;
    }

    // ── 一般回覆 ──
    await replyMessage(replyToken, parsed.reply || '你好！我是行事曆小幫手 🗓\n\n你可以：\n➕ 傳「新增活動」\n📅 傳「這週行程」\n🔍 傳「今天行程」或「明天行程」');

  } catch (err) {
    console.error('處理訊息時發生錯誤:', err);
    await replyMessage(replyToken, '抱歉，處理時發生錯誤，請稍後再試 🙏').catch(() => {});
  }
}

app.listen(PORT, () => console.log(`🚀 伺服器啟動：port ${PORT}`));
