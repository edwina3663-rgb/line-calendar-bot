require('dotenv').config();
const express = require('express');
const { middleware, Client } = require('@line/bot-sdk');
const { parseCalendarEvent } = require('./nlp');
const { addGoogleCalendarEvent } = require('./google-calendar');
const { addTimeTreeEvent } = require('./timetree');

const app = express();
const PORT = process.env.PORT || 3000;

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
};

const client = new Client(lineConfig);

// 健康檢查（Render 需要）
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'LINE 行事曆機器人運作中 🤖' });
});

// LINE Webhook
app.post('/webhook', middleware(lineConfig), async (req, res) => {
  res.json({ status: 'ok' });

  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event);
    }
  }
});

async function handleMessage(event) {
  const userId = event.source.userId;
  const userText = event.message.text;
  const replyToken = event.replyToken;

  console.log(`收到訊息：${userText}`);

  try {
    // 用 Claude 解析意圖
    const parsed = await parseCalendarEvent(userText);

    if (!parsed.isCalendarEvent) {
      // 不是新增活動的請求
      await client.replyMessage(replyToken, {
        type: 'text',
        text: parsed.reply || '你好！你可以跟我說「幫我加入明天下午三點開會」來新增行事曆活動 📅'
      });
      return;
    }

    // 格式化時間顯示
    const startDate = new Date(parsed.startTime);
    const endDate = new Date(parsed.endTime);
    const dateStr = startDate.toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    });
    const startTimeStr = startDate.toLocaleTimeString('zh-TW', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit'
    });
    const endTimeStr = endDate.toLocaleTimeString('zh-TW', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit'
    });

    // 同時寫入兩個行事曆
    const [googleResult, timetreeResult] = await Promise.all([
      addGoogleCalendarEvent(parsed),
      addTimeTreeEvent(parsed)
    ]);

    // 組合回覆訊息
    let calendarStatus = '';
    if (googleResult.success) {
      calendarStatus += '📆 Google 行事曆 ✅\n';
    } else if (googleResult.reason !== 'not_configured') {
      calendarStatus += '📆 Google 行事曆 ❌\n';
    }
    if (timetreeResult.success) {
      calendarStatus += '🌲 TimeTree ✅\n';
    } else if (timetreeResult.reason !== 'not_configured') {
      calendarStatus += '🌲 TimeTree ❌\n';
    }
    if (!calendarStatus) {
      calendarStatus = '（行事曆尚未設定，活動已解析成功）\n';
    }

    let replyText = `✅ 已新增活動！\n\n`;
    replyText += `📌 ${parsed.title}\n`;
    replyText += `📅 ${dateStr}\n`;
    replyText += `🕐 ${startTimeStr} - ${endTimeStr}\n`;
    if (parsed.location) replyText += `📍 ${parsed.location}\n`;
    if (parsed.description) replyText += `📝 ${parsed.description}\n`;
    replyText += `\n${calendarStatus}`;

    await client.replyMessage(replyToken, {
      type: 'text',
      text: replyText
    });

  } catch (err) {
    console.error('處理訊息時發生錯誤:', err);
    await client.replyMessage(replyToken, {
      type: 'text',
      text: '抱歉，處理時發生錯誤，請稍後再試 🙏'
    }).catch(() => {});
  }
}

app.listen(PORT, () => {
  console.log(`🚀 伺服器啟動：port ${PORT}`);
});
