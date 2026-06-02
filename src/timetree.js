const axios = require('axios');

async function addTimeTreeEvent(event) {
  if (!process.env.TIMETREE_ACCESS_TOKEN || !process.env.TIMETREE_CALENDAR_ID) {
    return { success: false, reason: 'not_configured' };
  }

  try {
    const response = await axios.post(
      `https://timetreeapis.com/calendars/${process.env.TIMETREE_CALENDAR_ID}/events`,
      {
        data: {
          attributes: {
            category: 'schedule',
            title: event.title,
            all_day: false,
            start_at: event.startTime,
            end_at: event.endTime,
            description: event.description || '',
            location: event.location || '',
            start_timezone: 'Asia/Taipei',
            end_timezone: 'Asia/Taipei'
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TIMETREE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.timetree.v1+json'
        }
      }
    );

    return { success: true, id: response.data.data?.id };
  } catch (err) {
    console.error('TimeTree 錯誤:', err.response?.data || err.message);
    return { success: false, reason: err.message };
  }
}

module.exports = { addTimeTreeEvent };
