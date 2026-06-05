const { google } = require('googleapis');

function getGoogleClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

function addOneDayToDate(dateStr) {
  // YYYY-MM-DD 格式加一天
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + 1);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

async function addGoogleCalendarEvent(event) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    return { success: false, reason: 'not_configured' };
  }
  try {
    const auth = getGoogleClient();
    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);
    const calendar = google.calendar({ version: 'v3', auth });

    let resource;
    if (event.allDay) {
      // Google Calendar 全天活動：end date 是不包含的（exclusive）
      // 所以 7/6-7/10 要設 end = 7/11
      resource = {
        summary: event.title,
        description: event.description || '',
        location: event.location || '',
        start: { date: event.startTime },
        end: { date: addOneDayToDate(event.endTime) }
      };
    } else {
      resource = {
        summary: event.title,
        description: event.description || '',
        location: event.location || '',
        start: { dateTime: event.startTime, timeZone: 'Asia/Taipei' },
        end: { dateTime: event.endTime, timeZone: 'Asia/Taipei' }
      };
    }

    const result = await calendar.events.insert({ calendarId: 'primary', resource });
    return { success: true, link: result.data.htmlLink };
  } catch (err) {
    console.error('Google Calendar 錯誤:', err.message);
    console.error('錯誤詳情:', JSON.stringify(err.response?.data || {}));
    return { success: false, reason: err.message };
  }
}

async function getWeekEvents() {
  try {
    const auth = getGoogleClient();
    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);
    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const result = await calendar.events.list({
      calendarId: 'primary', timeMin: monday.toISOString(), timeMax: sunday.toISOString(),
      singleEvents: true, orderBy: 'startTime', timeZone: 'Asia/Taipei'
    });
    return result.data.items || [];
  } catch (err) {
    console.error('查詢行程錯誤:', err.message);
    return [];
  }
}

async function getTodayEvents(daysOffset = 0) {
  try {
    const auth = getGoogleClient();
    const { credentials } = await auth.refreshAccessToken();
    auth.setCredentials(credentials);
    const calendar = google.calendar({ version: 'v3', auth });
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    const result = await calendar.events.list({
      calendarId: 'primary', timeMin: start.toISOString(), timeMax: end.toISOString(),
      singleEvents: true, orderBy: 'startTime', timeZone: 'Asia/Taipei'
    });
    return result.data.items || [];
  } catch (err) {
    console.error('查詢行程錯誤:', err.message);
    return [];
  }
}

module.exports = { addGoogleCalendarEvent, getWeekEvents, getTodayEvents };
