const { google } = require('googleapis');

async function addGoogleCalendarEvent(event) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    return { success: false, reason: 'not_configured' };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: event.title,
        description: event.description || '',
        location: event.location || '',
        start: { dateTime: event.startTime, timeZone: 'Asia/Taipei' },
        end: { dateTime: event.endTime, timeZone: 'Asia/Taipei' }
      }
    });

    return { success: true, link: result.data.htmlLink };
  } catch (err) {
    console.error('Google Calendar 錯誤:', err.message);
    console.error('錯誤詳情:', JSON.stringify(err.response?.data || {}));
    return { success: false, reason: err.message };
  }
}

module.exports = { addGoogleCalendarEvent };
