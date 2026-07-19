import express from 'express';
import cors from 'cors';
import webpush from 'web-push';

const app = express();
app.use(cors());
app.use(express.json());

// === ТВОИ КЛЮЧИ ===
const PUBLIC_KEY  = 'BLVDUl6EgcxqX0LpSVN4p09PuKdmJh9pmLVEpz1UjYnVIWhDaZhp7IUcuUoR6MFt8JYPOB4XSJVuRZMqqBDeIY8';
const PRIVATE_KEY = 'nlD7GfoQ2XbQDFU_VffXLCeGgtZEyZukjN6qtVq5caI';

webpush.setVapidDetails('mailto:test@test.com', PUBLIC_KEY, PRIVATE_KEY);

// хранилище в памяти (позже улучшим)
const subs = {};       // подписки: {userId: subscription}
const reminders = [];  // напоминания: {userId, title, time}

// приложение получает публичный ключ
app.get('/key', (req, res) => res.json({ key: PUBLIC_KEY }));

// сохранить подписку
app.post('/subscribe', (req, res) => {
  const { userId, subscription } = req.body;
  subs[userId] = subscription;
  console.log('Подписан:', userId);
  res.json({ ok: true });
});

// добавить напоминание
app.post('/remind', (req, res) => {
  const { userId, title, time } = req.body;
  reminders.push({ userId, title, time: Number(time) });
  console.log('Напоминание:', title, new Date(time).toLocaleString());
  res.json({ ok: true });
});

// тест — отправить пуш прямо сейчас
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

// проверяем напоминания каждые 30 секунд
setInterval(async () => {
  const now = Date.now();
  for (let i = reminders.length - 1; i >= 0; i--) {
    const r = reminders[i];
    if (r.time <= now) {
      const sub = subs[r.userId];
      if (sub) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({
            title: '🔔 Напоминание',
            body: r.title
          }));
          console.log('Отправлено:', r.title);
        } catch (e) { console.log('Ошибка:', e.message); }
      }
      reminders.splice(i, 1);
    }
  }
}, 30000);

app.get('/', (req, res) => res.send('Push server работает ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Сервер запущен на порту', PORT));
