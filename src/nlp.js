const axios = require('axios');

async function parseCalendarEvent(userMessage) {
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  const prompt = `現在時間是：${now}（台北時間）

使用者說：「${userMessage}」

請判斷這是不是要新增行事曆活動的請求。
如果是，請回傳 JSON 格式（不要有其他文字，不要加markdown）：
{
  "isCalendarEvent": true,
  "title": "活動標題",
  "startTime": "2024-01-15T14:00:00+08:00",
  "endTime": "2024-01-15T15:00:00+08:00",
  "description": "備註（若無則空字串）",
  "location": "地點（若無則空字串）"
}

如果不是新增活動的請求，回傳：
{
  "isCalendarEvent": false,
  "reply": "一般回覆內容"
}

注意：
- 時間格式必須是 ISO 8601，時區 +08:00
- 若使用者沒說結束時間，預設加 1 小時
- 若只說日期沒說時間，預設整天（00:00 到 23:59）
- 今天、明天、後天、下週等相對時間要根據現在時間計算
- 只回傳 JSON，不要有任何其他文字`;

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
