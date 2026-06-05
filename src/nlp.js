const axios = require('axios');

async function parseCalendarEvent(userMessage) {
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  const prompt = `現在時間是：${now}（台北時間）

使用者說：「${userMessage}」

請判斷這是不是要新增行事曆活動的請求。

如果是單天含時間的活動，回傳：
{
  "isCalendarEvent": true,
  "allDay": false,
  "title": "活動標題（必須完整保留使用者說的名稱，不可刪減任何字）",
  "startTime": "2026-07-06T14:00:00+08:00",
  "endTime": "2026-07-06T15:00:00+08:00",
  "description": "",
  "location": ""
}

如果是單天全天或跨天活動（例如「7/6-7/10 墾丁旅遊」），回傳：
{
  "isCalendarEvent": true,
  "allDay": true,
  "title": "活動標題（必須完整保留使用者說的名稱，不可刪減任何字）",
  "startTime": "2026-07-06",
  "endTime": "2026-07-10",
  "description": "",
  "location": ""
}

如果不是新增活動的請求，回傳：
{
  "isCalendarEvent": false,
  "reply": "一般回覆內容"
}

重要規則：
- 只回傳 JSON，不要有任何其他文字或 markdown
- title 必須完整保留使用者輸入的活動名稱，例如「若秦數感夏令營」就是「若秦數感夏令營」，不可以改成「秦數感夏令營」
- 時間格式：有時間用 ISO 8601 含 +08:00；全天/跨天用 YYYY-MM-DD
- 沒說結束時間預設加 1 小時
- 今天、明天、後天、下週等要根據現在時間計算
- 跨天活動 endTime 填最後一天的日期（包含當天）
- location 預設空字串`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      }
    }
  );

  const text = response.data.choices[0].message.content.trim();
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

module.exports = { parseCalendarEvent };
