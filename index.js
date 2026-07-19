import express from 'express';
import cors from 'cors';
import webpush from 'web-push';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PUBLIC_KEY  = 'BLVDUl6EgcxqX0LpSVN4p09PuKdmJh9pmLVEpz1UjYnVIWhDaZhp7IUcuUoR6MFt8JYPOB4XSJVuRZMqqBDeIY8';
const PRIVATE_KEY = 'nlD7GfoQ2XbQDFU_VffXLCeGgtZEyZukjN6qtVq5caI';

webpush.setVapidDetails('mailto:test@test.com', PUBLIC_KEY, PRIVATE_KEY);

const subs = {};       // { userId: pushSubscription }
const userData = {};   // { userId: { tasks:[], notifyHour:'09:00', tzOffset:180, sentKeys:{} } }

app.get('/key', (req, res) => res.json({ key: PUBLIC_KEY }));

app.post('/subscribe', (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) return res.json({ ok: false, err: 'нет userId/subscription' });
  subs[userId] = subscription;
  console.log('✅ Подписан:', userId);
  res.json({ ok: true });
});

app.post('/sync', (req, res) => {
  const { userId, tasks, notifyHour, tzOffset } = req.body;
  if (!userId) return res.json({ ok: false, err: 'нет userId' });
  if (!userData[userId]) userData[userId] = { sentKeys: {} };
  userData[userId].tasks = Array.isArray(tasks) ? tasks : [];
  userData[userId].notifyHour = notifyHour || '09:00';
  userData[userId].tzOffset = typeof tzOffset === 'number' ? tzOffset : 180;
  console.log(`📥 Синхронизация от ${userId}: ${userData[userId].tasks.length} задач, notifyHour=${userData[userId].notifyHour}, tzOffset=${userData[userId].tzOffset}`);
  res.json({ ok: true, count: userData[userId].tasks.length });
});

app.post('/test', async (req, res) => {
  const { userId } = req.body;
  const sub = subs[userId];
  if (!sub) return res.json({ ok: false, err: 'нет подписки' });
  try {
    await webpush.sendNotification(sub, JSON.stringify({
      title: '🔔 Тест',
      body: 'Пуш работает!'
    }));
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, err: e.message });
  }
});

function localDateParts(tzOffsetMin) {
  const localMs = Date.now() + tzOffsetMin * 60000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const tk = y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  return { tk, hm: hh + ':' + mi };
}

async function sendPush(userId, title, body, taskId) {
  const sub = subs[userId];
  if (!sub) return;
  try {
    await webpush.sendNotification(sub, JSON.stringify({ title, body, taskId }));
    console.log('📤 Отправлено', userId, title);
  } catch (e) {
    console.log('❌ Ошибка отправки', userId, e.message);
    if (e.statusCode === 404 || e.statusCode === 410) delete subs[userId];
  }
}

// ===== Настройки повторных напоминаний =====
const REMINDER_INTERVAL_MIN = 20;  // через сколько минут повторить, если не выполнено
const MAX_REMINDERS = 3;           // максимум повторов (включая первый пуш)

setInterval(() => {
  Object.keys(userData).forEach(userId => {
    const u = userData[userId];
    if (!u || !subs[userId]) return;
    const { tk, hm } = localDateParts(u.tzOffset || 180);

    (u.tasks || []).forEach(t => {
      if (t.done || !t.date || !t.time) return;
      if (t.date === tk && t.time === hm) {
        const key = 'task_' + t.id + '_' + tk;
        if (u.sentKeys[key]) return;
        u.sentKeys[key] = 1;
        sendPush(userId, '⏰ ' + (t.title || 'Напоминание'), 'Пора выполнить дело');
      }
    });

    const nh = u.notifyHour || '09:00';
    if (hm === nh) {
      const dailyKey = 'daily_' + tk;
      if (!u.sentKeys[dailyKey]) {
        u.sentKeys[dailyKey] = 1;
        const todo = (u.tasks || []).filter(t => !t.done && t.date === tk).length;
        if (todo > 0) {
          sendPush(userId, '📋 План на сегодня', `У тебя ${todo} ${todo === 1 ? 'дело' : 'дел(а)'} на сегодня`);
        }
      }
    }
  });
}, 60000);

app.get('/', (req, res) => res.send('Push server работает ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Сервер запущен на порту', PORT));
