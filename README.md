# LINE 行事曆機器人 🤖📅

用自然語言透過 LINE 新增行事曆活動，自動同步 Google Calendar 和 TimeTree。

## 使用方式

在 LINE 聊天室輸入：
- 「幫我加入明天下午三點開會」
- 「下週五下午兩點牙醫回診持續一小時」
- 「2024/12/25 耶誕節聚餐 在台北101」

## 環境變數設定

複製 `.env.example` 為 `.env` 並填入對應值：

```
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
ANTHROPIC_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
TIMETREE_ACCESS_TOKEN=
TIMETREE_CALENDAR_ID=
```

## 部署到 Render

1. 把這個專案推到 GitHub
2. 在 Render 連接 GitHub repo
3. 填入環境變數
4. 部署完成後取得網址
5. 把網址 + `/webhook` 填入 LINE Developers 的 Webhook URL
