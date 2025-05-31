// ✅ server.mjs (güncellenmiş hali)
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import sdk from 'matrix-js-sdk';
import { WebSocketServer } from 'ws';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const MATRIX_URL = 'http://localhost:8008';
const clients = new Map();
const websocketClients = new Map();

function setupAutoJoinHandler(client, userId) {
  let joinQueue = Promise.resolve();

  client.on("Room.myMembership", (room, membership) => {
    if (membership === "invite") {
      joinQueue = joinQueue.then(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            client.joinRoom(room.roomId)
              .then(() => {
                console.log(`🤝 Otomatik katıldı: ${room.roomId}`);
                const ws = websocketClients.get(userId);
                if (ws?.readyState === 1) {
                  ws.send(JSON.stringify({ type: "room_update" }));
                }
              })
              .catch((err) => {
                console.warn(`⚠️ Odaya katılım başarısız: ${room.roomId} → ${err.message}`);
              })
              .finally(resolve);
          }, 1200);
        });
      });
    }
  });
}

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const tempClient = sdk.createClient({ baseUrl: MATRIX_URL });

  try {
    const result = await tempClient.login('m.login.password', { user: username, password });

    const client = sdk.createClient({
      baseUrl: MATRIX_URL,
      accessToken: result.access_token,
      userId: result.user_id,
      crypto: false,
    });

    await client.startClient();
    clients.set(result.user_id, client);
    setupAutoJoinHandler(client, result.user_id);

    await new Promise(resolve => client.once('sync', resolve));

    client.on('Room.timeline', (event, room) => {
      if (event.getType() !== 'm.room.message') return;
      const payload = JSON.stringify({
        type: 'new_message',
        roomId: room.roomId,
        sender: event.getSender(),
        text: event.getContent()?.body || '',
        timestamp: event.getTs(),
      });
      const ws = websocketClients.get(result.user_id);
      if (ws?.readyState === 1) ws.send(payload);
    });

    client.on('Room', () => {
      const ws = websocketClients.get(result.user_id);
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'room_update' }));
      }
    });

    res.json({ userId: result.user_id, accessToken: result.access_token });
  } catch (err) {
    res.status(401).json({ error: 'Login failed', details: err.message });
  }
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const tempClient = sdk.createClient({ baseUrl: MATRIX_URL });

  try {
    const result = await tempClient.registerRequest({
      username,
      password,
      auth: { type: 'm.login.dummy' },
      inhibit_login: false,
    });

    const client = sdk.createClient({
      baseUrl: MATRIX_URL,
      accessToken: result.access_token,
      userId: result.user_id,
      crypto: false,
    });

    await client.startClient();
    setupAutoJoinHandler(client, result.user_id);
    await new Promise((resolve) => client.once('sync', resolve));

    const relayBotUserIds = [
      '@telegrambot:tanmatrix.local',
      '@blueskybot:tanmatrix.local',
      '@twitterbot:tanmatrix.local',
      '@googlechatbot:tanmatrix.local',
      '@gmessagesbot:tanmatrix.local',
      '@metabot:tanmatrix.local',
      '@whatsappbot:tanmatrix.local',
    ];

    const existingDMs = client.getRooms().filter((room) => {
      const members = room.getJoinedMembers();
      return (
        members.length === 2 &&
        relayBotUserIds.includes(members.find((m) => m.userId !== client.getUserId())?.userId)
      );
    });

    const alreadyDMdBots = new Set(
      existingDMs.map((room) =>
        room.getJoinedMembers().find((m) => m.userId !== client.getUserId())?.userId
      )
    );

    for (const botUserId of relayBotUserIds) {
      if (!alreadyDMdBots.has(botUserId)) {
        try {
          await client.createRoom({ invite: [botUserId], is_direct: true });
          console.log(`✅ ${botUserId} ile DM başlatıldı`);
        } catch (e) {
          console.warn(`❗ ${botUserId} ile DM başlatılamadı: ${e.message}`);
        }
      } else {
        console.log(`ℹ️ ${botUserId} ile DM zaten var`);
      }
    }

    res.json({
      userId: result.user_id,
      accessToken: result.access_token,
      deviceId: result.device_id,
    });
  } catch (err) {
    res.status(400).json({ error: 'Register failed', details: err.message });
  }
});

app.get('/rooms/:userId', (req, res) => {
  const userId = req.params.userId;
  const client = clients.get(userId);
  if (!client) return res.status(400).json({ error: 'Client not found' });
  const rooms = client.getRooms().map(room => {
  const unreadCount = room.getUnreadNotificationCount();
  return {
    roomId: room.roomId,
    name: room.name || room.roomId,
    unreadCount,
  };
});

  res.json(rooms);
});

app.get('/messages/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const { userId, accessToken } = req.query;
  const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
  await client.startClient();
  await new Promise(resolve => client.once('sync', resolve));
  const room = client.getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });
  await client.scrollback(room, 50);
  const events = room.getLiveTimeline().getEvents();
  const messages = events
    .filter((e) => e.getType() === 'm.room.message')
    .map((e) => ({
      sender: e.getSender(),
      text: e.getContent()?.body || '',
      timestamp: e.getTs(),
    }));
  res.json(messages.slice(-50));
});

app.post('/sendMessage', async (req, res) => {
  const { userId, accessToken, roomId, text } = req.body;
  const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
  await client.startClient();
  await new Promise(resolve => client.once('sync', resolve));
  try {
    await client.sendTextMessage(roomId, text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Mesaj gönderilemedi', details: err.message });
  }
});

app.post('/markAsRead', async (req, res) => {
  const { userId, accessToken, roomId } = req.body;
  const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });

  try {
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const room = client.getRoom(roomId);
    if (!room) {
      console.error('Kullanıcı odada değil:', roomId);
      return res.status(404).json({ error: 'Kullanıcı odaya katılmamış' });
    }

    const lastEvent = room.getLiveTimeline().getEvents().at(-1);
    if (!lastEvent) {
      console.warn('Oda için son event bulunamadı.');
      return res.status(400).json({ error: 'Son mesaj bulunamadı' });
    }

    await client.sendReadReceipt(lastEvent);
    res.json({ success: true });

    // const events = room.getLiveTimeline().getEvents();
    // for (let i=0; i<events.length; i++) {
    //   let event = events.at(i); 
    //   if (!event) {
    //     console.warn('Oda için son event bulunamadı.');
    //     return res.status(400).json({ error: 'Son mesaj bulunamadı' });
    //   }
      
    //   await client.sendReadReceipt(event);
    //   res.json({ success: true });
    // }

  } catch (err) {
    console.error('READ ERROR:', err);
    res.status(500).json({ error: 'Okundu olarak işaretleme başarısız', details: err.message });
  }
});



const wss = new WebSocketServer({ port: 3001 });
wss.on('connection', ws => {
  ws.on('message', msg => {
    try {
      const { userId } = JSON.parse(msg);
      websocketClients.set(userId, ws);
    } catch {}
  });
  ws.on('close', () => {
    for (const [uid, client] of websocketClients.entries()) {
      if (client === ws) websocketClients.delete(uid);
    }
  });
});

app.listen(3000, () => console.log('✅ Server http://localhost:3000'));
