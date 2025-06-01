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
const WHATSAPP_BOT_ID = '@whatsappbot:tanmatrix.local';
const BLUESKY_BOT_ID = '@blueskybot:tanmatrix.local';


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
      '@whatsappbot:tanmatrix.local',
      '@metabot:tanmatrix.local',
      '@twitterbot:tanmatrix.local',
      '@telegrambot:tanmatrix.local',
      '@blueskybot:tanmatrix.local',
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

  } catch (err) {
    console.error('READ ERROR:', err);
    res.status(500).json({ error: 'Okundu olarak işaretleme başarısız', details: err.message });
  }
});

app.get('/accounts/:userId', async (req, res) => {
  const userId = req.params.userId;
  const client = clients.get(userId);
  if (!client) return res.status(400).json({ error: 'Client not found' });

  const rooms = client.getRooms();
  const accounts = {};

  for (const room of rooms) {
    const members = room.getJoinedMembers();
    const relayBot = members.find(m => /^@([a-z]+)bot:/.test(m.userId));
    if (!relayBot) continue;

    const match = relayBot.userId.match(/^@([a-z]+)bot:/);
    if (!match) continue;

    const platform = match[1]; // örn: whatsapp

    const events = room.getLiveTimeline().getEvents();
    let lastLoginMsgTime = -1;
    let lastLogoutMsgTime = -1;
    let username = null;

    for (const ev of events) {
      const ts = ev.getTs();
      const body = ev.getContent()?.body;
      if (typeof body !== 'string') continue;

      const loginMatch = body.match(/Successfully logged in as (.+)/i);
      if (loginMatch) {
        lastLoginMsgTime = ts;
        username = loginMatch[1].trim();
      }

      if (body.toLowerCase().includes('logged out')) {
        lastLogoutMsgTime = ts;
      }
    }

    if (lastLoginMsgTime > lastLogoutMsgTime && username) {
      accounts[platform] = username;
    }
  }


  res.json(accounts); // örn: { whatsapp: '+9050...', bluesky: 'ghurstird.bsky.social' }
});

app.post('/platform/whatsapp/init', async (req, res) => {
  const { userId, accessToken, phoneNumber } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length == 2 && 
      room.getJoinedMembers().some(m => m.userId === WHATSAPP_BOT_ID) 
    );
    if (!dmRoom) return res.status(400).json({ error: 'WhatsApp bot ile DM bulunamadı' });

    await client.sendTextMessage(dmRoom.roomId, 'login phone');
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, phoneNumber);

    const timeoutMs = 10000;
    const start = Date.now();
    let responded = false;  // ✅ yanıt kontrolü

    const handler = (event, room) => {
      if (room.roomId !== dmRoom.roomId || responded) return;

      const body = event.getContent()?.body;
      if (typeof body !== 'string') return;

      if (body.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/)) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.json({ code: body });
      }

      if (body.toLowerCase().includes('invalid value') || body.toLowerCase().includes('must start with +')) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.status(422).json({ error: 'Telefon numarası "+90" ile başlamalıdır.' });
      }
    };


    client.on('Room.timeline', handler);

    setTimeout(() => {
      if (!responded) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.status(408).json({ error: 'Kod alınamadı' });
      }
    }, timeoutMs);

  } catch (err) {
    console.error('WhatsApp init hatası:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'WhatsApp başlatılamadı', details: err.message });
    }
  }
});


app.post('/platform/whatsapp/logout', async (req, res) => {
  const { userId, accessToken } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length == 2 && 
      room.getJoinedMembers().some(m => m.userId === WHATSAPP_BOT_ID) 
    );

    if (!dmRoom) return res.status(400).json({ error: 'WhatsApp bot ile DM bulunamadı' });

    // logout komutunu gönder
    await client.sendTextMessage(dmRoom.roomId, 'logout');

    const timeoutMs = 10000;
    const start = Date.now();

    return new Promise((resolveFinal) => {
      const handler = async (event, room) => {
        if (room.roomId !== dmRoom.roomId) return;
        const body = event.getContent()?.body;

        if (typeof body === 'string') {
          console.log('💬 Gelen mesaj: '+ body);

          // login ID'yi yakala
          const match = body.match(/\*\s+`(\d{9,})`\s+\(\+\d+\)\s+-\s+`CONNECTED`/);


          if (match) {
            const loginId = match[1];
            client.removeListener('Room.timeline', handler);

            // relay bota !wa logout komutunu gönder
            await client.sendTextMessage(dmRoom.roomId, `!wa logout ${loginId}`);

            const roomsToLeave = client.getRooms().filter(room => {
              const nameIncludesWhatsApp = room.name?.toLowerCase().includes('(whatsapp)');
              const members = room.getJoinedMembers();
              const isRelayBotDM = members.length === 2 && members.some(m => m.userId === WHATSAPP_BOT_ID);
              return nameIncludesWhatsApp && !isRelayBotDM;
            });

            for (const room of roomsToLeave) {
              try {
                await client.leave(room.roomId);
                console.log(`🚪 Çıkıldı: ${room.roomId}`);
              } catch (err) {
                console.warn(`⚠️ Çıkılamadı: ${room.roomId}`, err.message);
              }
            }

            // Sonucu beklemeden dönebiliriz ya da yeni bir dinleyici açabiliriz (şimdilik direkt dönelim)
            return res.json({ success: true });
          }
        }

        if (Date.now() - start > timeoutMs) {
          client.removeListener('Room.timeline', handler);
          return res.status(408).json({ error: 'Login ID yakalanamadı' });
        }
      };

      client.on('Room.timeline', handler);

      setTimeout(() => {
        client.removeListener('Room.timeline', handler);
        if (!res.headersSent) {
          return res.status(408).json({ error: 'Zaman aşımı' });
        }
      }, timeoutMs);
    });

  } catch (err) {
    console.error('WhatsApp logout hatası:', err.message);
    res.status(500).json({ error: 'Çıkış hatası', details: err.message });
  }
});

app.post('/platform/bluesky/init', async (req, res) => {
  const { userId, accessToken, username, password } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length == 2 && 
      room.getJoinedMembers().some(m => m.userId === BLUESKY_BOT_ID) 
    );
    if (!dmRoom) return res.status(400).json({ error: 'Bluesky bot ile DM bulunamadı' });

    // Adımları sırayla gönder
    await client.sendTextMessage(dmRoom.roomId, 'login');
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, 'bsky.social');
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, username);
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, password);

    // Başarılı giriş mesajını dinle
    const timeoutMs = 10000;
    let responded = false;

    const handler = (event, room) => {
      if (room.roomId !== dmRoom.roomId || responded) return;

      const body = event.getContent()?.body;
      if (typeof body !== 'string') return;

      if (body.includes('Successfully logged in as')) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.json({ success: true });
      }

      if (body.toLowerCase().includes('failed to create session')) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.status(401).json({ error: 'Bluesky giriş başarısız: Kullanıcı adı veya şifre hatalı.' });
      }
    };

    client.on('Room.timeline', handler);

    setTimeout(() => {
      if (!responded) {
        client.removeListener('Room.timeline', handler);
        if (!res.headersSent) {
          return res.status(408).json({ error: 'Bluesky login yanıtı zaman aşımına uğradı' });
        }
      }
    }, timeoutMs);

  } catch (err) {
    console.error('Bluesky init hatası:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Bluesky hesabı eklenemedi', details: err.message });
    }
  }
});

app.post('/platform/bluesky/logout', async (req, res) => {
  const { userId, accessToken } = req.body;
  

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length === 2 &&
      room.getJoinedMembers().some(m => m.userId === BLUESKY_BOT_ID)
    );

    if (!dmRoom) return res.status(400).json({ error: 'Bluesky bot ile DM bulunamadı' });

    await client.sendTextMessage(dmRoom.roomId, 'logout');

    const timeoutMs = 10000;
    let responded = false;

    const handler = async (event, room) => {
      if (room.roomId !== dmRoom.roomId || responded) return;

      const body = event.getContent()?.body;
      console.log('💬 Gelen mesaj: '+ body);
      if (typeof body !== 'string') return;

      const match = body.match(/\*\s+`(did:[\w:]+)`\s+\((.+)\)\s+-\s+`CONNECTED`/);

      if (match) {
        responded = true;
        const loginId = match[1];
        client.removeListener('Room.timeline', handler);

        await client.sendTextMessage(dmRoom.roomId, `!bsky logout ${loginId}`);
        const roomsToLeave = client.getRooms().filter(room => {
          const nameIncludesBluesky = room.name?.toLowerCase().includes('(bluesky)');
          const members = room.getJoinedMembers();
          const isRelayBotDM = members.length === 2 && members.some(m => m.userId === BLUESKY_BOT_ID);
          return nameIncludesBluesky && !isRelayBotDM;
        });


        for (const room of roomsToLeave) {
          try {
            await client.leave(room.roomId);
          } catch {}
        }


        return res.json({ success: true });
      }
    };

    client.on('Room.timeline', handler);

    setTimeout(() => {
      if (!responded) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        if (!res.headersSent) {
          return res.status(408).json({ error: 'Login ID alınamadı (timeout)' });
        }
      }
    }, timeoutMs);

  } catch (err) {
    console.error('Bluesky logout hatası:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Çıkış işlemi başarısız', details: err.message });
    }
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
