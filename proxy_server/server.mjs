//server.mjs
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import sdk from 'matrix-js-sdk';
import { WebSocketServer } from 'ws';
import { Expo } from 'expo-server-sdk';

const expo = new Expo();
const pushTokens = new Map(); // userId -> token

async function sendPushNotification(userId, body, roomId, senderMatrixId, room) {
  const token = pushTokens.get(userId);
  if (!token) {
    console.warn(`⚠️ Token bulunamadı: ${userId}`);
    return;
  }

  const senderMember = room.getMember(senderMatrixId);
  const senderDisplayName = senderMember?.name || senderMatrixId;

  // Platform adı tahmini
  // let platform = 'Platform';
  // if (senderMatrixId.includes('whatsapp_')) platform = 'WhatsApp';
  // else if (senderMatrixId.includes('telegram_')) platform = 'Telegram';
  // else if (senderMatrixId.includes('bluesky_')) platform = 'Bluesky';

  const message = {
    to: token,
    sound: 'default',
    title: `${senderDisplayName}`, // (${platform}) , Bildirim başlığı
    body,
    priority: 'high',
    channelId: 'default',                                        // Mesaj içeriği
    data: {
      roomId,
      sender: senderMatrixId,
    },
    android: {
      vibrate: true,         
      // channelId: 'default',  
    },
  };

  try {
    const ticket = await expo.sendPushNotificationsAsync([message]);
    console.log('📲 Push gönderildi:', ticket);
  } catch (err) {
    console.error('❌ Push gönderilemedi:', err.message);
  }
}




const app = express();
app.use(cors());
app.use(bodyParser.json());

import dotenv from 'dotenv';

dotenv.config();

const MATRIX_URL = process.env.MATRIX_URL || 'http://localhost:8008';
const DOMAIN_NAME = process.env.DOMAIN_NAME || 'tanmatrix.local';
const ipv4 = process.env.SERVER_IP; // Bu değişkenin .env dosyasında tanımlanması gerekir.
const clients = new Map();
const websocketClients = new Map();


const WHATSAPP_BOT_ID = '@whatsappbot:' + DOMAIN_NAME;
const BLUESKY_BOT_ID   = '@blueskybot:' + DOMAIN_NAME;
const TELEGRAM_BOT_ID = '@telegrambot:' + DOMAIN_NAME;
const TWITTER_BOT_ID = '@twitterbot:' + DOMAIN_NAME;
const INSTAGRAM_BOT_ID = '@instagrambot:' + DOMAIN_NAME;

app.post('/save-token', (req, res) => {
  const { userId, pushToken } = req.body;

  if (pushToken === null) {
    pushTokens.delete(userId); // token kaldır
    console.log(`🚫 Token silindi: ${userId}`);
    return res.json({ success: true });
  }

  if (!Expo.isExpoPushToken(pushToken)) {
    return res.status(400).json({ error: 'Geçersiz push token' });
  }

  pushTokens.set(userId, pushToken);
  console.log(`🔒 Token kaydedildi: ${userId} → ${pushToken}`);
  res.json({ success: true });
});


function setupMessageListener(client, userId) {

  if (client._hasMessageListener) return; // aynı client'a tekrar eklenmesin
  client._hasMessageListener = true;

  
  

  client.on("Room.timeline", async (event, room) => {
    const content = event.getContent();
    const sender = event.getSender();

    if (!room || event.getType() !== "m.room.message" || sender === userId) return;

    const text =
      content.body?.toString?.() ||
      content.text?.toString?.() ||
      content.msg?.toString?.() ||
      "[medya/boş mesaj]";

    console.log(`📥 Yeni mesaj geldi | Oda: ${room.name} | Kimden: ${sender}`);
    setupAutoJoinHandler(client, userId);

    const isFromRelayBot = sender.includes("whatsapp_") ||
                           sender.includes("telegram_") ||
                           sender.includes("instagram_") ||
                           sender.includes("bluesky_") ||
                           sender.includes("twitter_") ||
                           sender.includes("meta_");

    if (isFromRelayBot) {
      const isUserInRoom = room.getJoinedMembers().some(m => m.userId === userId);

      if (isUserInRoom) {
        console.log("🔔 Push gönderilecek hedef kullanıcı:", userId);
        sendPushNotification(userId, text, room.roomId, sender, room);

      }
    }
  });
}



const joinedRoomsSet = new Set(); // dışarıda tanımla, kullanıcıya özel olabilir

function setupAutoJoinHandler(client, userId) {
  let joinQueue = Promise.resolve();

  client.on("Room.myMembership", (room, membership) => {
    if (membership === "invite" && !joinedRoomsSet.has(room.roomId)) {
      joinedRoomsSet.add(room.roomId); // tekrar denemeyi engelle

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
                joinedRoomsSet.delete(room.roomId); // başarısızsa tekrar deneme hakkı bırak
              })
              .finally(resolve);
          }, 1200);
        });
      });
    }
  });
}

// Mesaj Silme
app.post('/deleteMessage', async (req, res) => {
  const { userId, accessToken, roomId, eventId } = req.body;

  try {
    let client = clients.get(userId);
    if (!client) {
      client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
      await client.startClient();
      await new Promise(resolve => client.once('sync', resolve));
      clients.set(userId, client);
    }

    await client.redactEvent(roomId, eventId);
    res.json({ success: true });
  } catch (err) {
    console.error('Mesaj silme hatası:', err.message);
    res.status(500).json({ error: 'Mesaj silinemedi', details: err.message });
  }
});


// -------------------------------------
//  L O G I N / R E G I S T E R /  M E S S A G E S
// -------------------------------------
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const tempClient = sdk.createClient({ baseUrl: MATRIX_URL });

  try {
    const result = await tempClient.login('m.login.password', { user: username, password });

    // Eğer daha önceki bir client varsa, temizle
    if (clients.has(result.user_id)) {
      const oldClient = clients.get(result.user_id);
      oldClient.stopClient();         // sync’i durdurur, eventleri keser
      clients.delete(result.user_id); // hafızadan sil
    }

    // Yeni client’ı oluştur ve kaydet
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken: result.access_token, userId: result.user_id, crypto: false });
    await client.startClient();
    clients.set(result.user_id, client);

    setupAutoJoinHandler(client, result.user_id);
    setupMessageListener(client, result.user_id);

    await new Promise(resolve => client.once('sync', resolve));

    client.on('Room.timeline', (event, room) => {
      if (event.getType() !== 'm.room.message') return;

      const sender = event.getSender();
      const userIds = room.getJoinedMembers()
        .map(m => m.userId)
        .filter(id => id !== sender); // mesajı alanlar

      const payload = {
        type: 'new_message',
        roomId: room.roomId,
        sender,
        text: event.getContent()?.body || '',
        timestamp: event.getTs(),
      };

      userIds.forEach(uid => {
        const ws = websocketClients.get(uid);
        if (ws?.readyState === 1) {
          ws.send(JSON.stringify(payload));
          console.log('📨 WebSocket ile mesaj iletildi:', uid);
        }

      
        // console.log('📩 WebSocket sonrası push denenecek:', uid);
        // sendPushNotification(uid, 'Yeni Mesaj', payload.text);
      });

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
      WHATSAPP_BOT_ID,
      TELEGRAM_BOT_ID,
      BLUESKY_BOT_ID,
      TWITTER_BOT_ID,
      INSTAGRAM_BOT_ID,
    ];

    const existingDMs = client.getRooms().filter((room) => {
      const members = room.getJoinedMembers();
      return (
        members.length === 2 &&
        relayBotUserIds.includes(
          members.find((m) => m.userId !== client.getUserId())?.userId
        )
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

app.get('/rooms/:userId', async (req, res) => {
  const userId = req.params.userId;
  let client = clients.get(userId);

  if (!client) {
    const session = req.query; // accessToken eklenmiş olmalı
    if (!session.accessToken) return res.status(400).json({ error: 'Access token missing' });

    client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken: session.accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));
    setupAutoJoinHandler(client, userId);
    clients.set(userId, client);
  }

  setupAutoJoinHandler(client, userId);

  const rooms = client.getRooms()
  .filter(room => room.getMyMembership() === "join") // ✅ Sadece katıldığı odalar
  .map(room => {
    const unreadCount = room.getUnreadNotificationCount();
    const lastMessage = [...room.timeline].reverse().find(e => e.getType() === 'm.room.message');
    
    // Oda avatarını alma
    const avatarEvent = room.currentState.getStateEvents('m.room.avatar', '');
    const avatarUrl = avatarEvent?.getContent()?.url;
    const fullAvatarUrl = avatarUrl ? client.mxcUrlToHttp(avatarUrl, 96, 96, 'crop') : null;

    return {
      roomId: room.roomId,
      name: room.name || room.roomId,
      unreadCount,
      lastMessageTs: lastMessage?.getTs() || 0,
      avatarUrl: fullAvatarUrl,
    };
  });

  res.json(rooms);
});


app.get('/messages/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const { userId, accessToken } = req.query;

  let client = clients.get(userId);
  if (!client) {
    client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    setupAutoJoinHandler(client, userId);
    clients.set(userId, client);
  }
  setupAutoJoinHandler(client, userId);

  await new Promise(resolve => {
    if (client.isInitialSyncComplete()) return resolve();
    client.once('sync', resolve);
  });

  const room = client.getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  await client.scrollback(room, 50);
  const events = room.getLiveTimeline().getEvents();
  const messageEvents = events.filter((e) => 
    e.getType() === 'm.room.message' && !e.isRedacted() // 👈 sadece silinmemiş mesajlar
  );


  // Kullanıcı display name'lerini önbelleğe almak için Map
  const displayNameCache = new Map();

  const messages = await Promise.all(
    messageEvents.map(async (e) => {
      const sender = e.getSender();
      let displayName = displayNameCache.get(sender);

      if (!displayName) {
        try {
          const profile = await client.getProfileInfo(sender);
          displayName = profile.displayname || sender;
          displayNameCache.set(sender, displayName);
        } catch (err) {
          displayName = sender; // Hata durumunda sadece userId
        }
      }
      let duration = (e.getContent()?.msgtype === "m.video" || e.getContent()?.msgtype === "m.audio") ? e.getContent().info.duration : 0;
      return {
        sender,
        displayName,
        text: e.getContent()?.body || '',
        timestamp: e.getTs(),
        msgtype: e.getContent()?.msgtype || 'm.text',
        mxcUrl: e.getContent()?.url || null,
        url: e.getContent()?.url || null,
        event_id: e.getId(),
        duration 
      };
    })
  );

  res.json(messages.slice(-50));
});

app.get('/room-avatar/:roomId', (req, res) => {
  const { roomId } = req.params;
  const userId = req.query.userId; // gerekli ise kimden bakılacağını bilmek için
  const client = clients.get(userId);
  
  if (!client) return res.status(400).json({ error: 'Client not found' });

  const room = client.getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const avatarUrl = room.getAvatarUrl?.(client.baseUrl, 96, 96, 'crop');
  if (!avatarUrl) return res.status(204).send(); // no content

  // Eğer localhost içeriyorsa IP ile değiştir
  const fixedUrl = avatarUrl.replace('http://localhost', ipv4); // kendi IP'nle değiştir

  res.json({ avatarUrl: fixedUrl });
});

app.post('/sendMessage', async (req, res) => {
  const { userId, roomId, content } = req.body;
  console.log("REEQQQQQQQQQQQQ: " + JSON.stringify(req.body));
  const mxcUrl = content?.url
  const duration = content?.info?.duration
  const text = content?.body
  const msgtype = content?.msgtype
  console.log('📤 Mesaj gönderiliyor:', { userId, roomId, text, msgtype, mxcUrl, duration });
  const client = clients.get(userId);

  if (!client) {
    return res.status(400).json({ error: 'Client not connected' });
  }

  try {
    let content = {};
    let displayText = text || '';

    if (msgtype === 'm.text') {
      content = {
        body: displayText,
        msgtype: 'm.text',
      };
    } else if (msgtype === 'm.image') {
      console.log('📷 Resim gönderiliyor:', mxcUrl);
      content = {
        body: '📷 image',
        msgtype: 'm.image',
        url: mxcUrl,
        info: {
          mimetype: 'image/jpeg',
          w: 300,
          h: 200,
        },
      };
      displayText = displayText || '📷 image';
    } else if (msgtype === 'm.video') {
        {console.log("DURATTTTTTTTTTTTTTTTTTTTTT    " + duration);}
        content = {
          body: '🎥 video',
          msgtype: 'm.video',
          url: mxcUrl,
          info: {
            mimetype: 'video/mp4',
            w: 320,
            h: 240,
            //...(duration && { duration }), // ✅ gerçek duration varsa kullan
            duration
          },
        };
        displayText = displayText || '🎥 video';
      } else if (msgtype === 'm.audio') {
        content = {
          body: '🎤 ses mesajı',
          msgtype: 'm.audio',
          url: mxcUrl,
          info: {
            mimetype: 'audio/mp4',
            ...(duration && { duration }), // ✅ gerçek duration varsa kullan
          },
        };
        displayText = displayText || '🎤 ses mesajı';
      } else {
      return res.status(400).json({ error: 'Invalid msgtype' });
    }

    await client.sendEvent(roomId, 'm.room.message', content, '');

    // This is the key: notify frontend properly via WebSocket / return
    const message = {
      roomId,
      sender: userId,
      timestamp: Date.now(),
      text: displayText,
      msgtype,
      mxcUrl,
      type: 'new_message',
    };
    console.log('📤 Mesaj gönderildi:', message);
    // Optional: broadcast to frontend via socket
    //const wsClient = connectedSockets[userId]; // if using WebSocket map
    //if (wsClient) wsClient.send(JSON.stringify(message));

    // Send to the client who POSTed it
    res.json(message);
  } catch (err) {
    console.error('Mesaj gönderilemedi:', err.message);
    res.status(500).json({ error: 'Mesaj gönderilemedi', details: err.message });
  }
});

app.post('/markAsRead', async (req, res) => {
  const { userId, accessToken, roomId } = req.body;

  let client = clients.get(userId);
  if (!client) {
    client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    setupAutoJoinHandler(client, userId); // ✅ otomatik oda katılımı
    clients.set(userId, client);
  }
  setupAutoJoinHandler(client, userId);

  try {
    await new Promise(resolve => {
      if (client.isInitialSyncComplete()) return resolve();
      client.once('sync', resolve);
    });

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


// ---------------------
//  H E S A P  L I S T E S I
// ---------------------
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

      const loginMatch =
        body.match(/Successfully logged in(?:to| as) (.+)/i) ||
        body.match(/Logged in as (.+?) \(\d+\)/i);

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

  res.json(accounts); // örn: { whatsapp: '+9050...', bluesky: 'chathubdeneme1.bsky.social' }
});

// ---------------------
//  W H A T S A P P  I N I T
// ---------------------
app.post('/platform/whatsapp/init', async (req, res) => {
  const { userId, accessToken, phoneNumber } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length === 2 &&
      room.getJoinedMembers().some(m => m.userId === WHATSAPP_BOT_ID)
    );
    if (!dmRoom) return res.status(400).json({ error: 'WhatsApp bot ile DM bulunamadı' });

    await client.sendTextMessage(dmRoom.roomId, 'login phone');
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, phoneNumber);

    const timeoutMs = 10000;
    const start = Date.now();
    let responded = false;

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

// ---------------------
//  W H A T S A P P  L O G O U T
// ---------------------
app.post('/platform/whatsapp/logout', async (req, res) => {
  const { userId, accessToken } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length === 2 &&
      room.getJoinedMembers().some(m => m.userId === WHATSAPP_BOT_ID)
    );

    if (!dmRoom) return res.status(400).json({ error: 'WhatsApp bot ile DM bulunamadı' });

    // logout komutunu gönder
    await client.sendTextMessage(dmRoom.roomId, 'logout');

    const timeoutMs = 10000;
    const start = Date.now();
    let responded = false;   // ← Burada tanımlıyoruz

    return new Promise((resolveFinal) => {
      const handler = async (event, room) => {
        if (room.roomId !== dmRoom.roomId || responded) return;
        const body = event.getContent()?.body;
        if (typeof body !== 'string') return;

        console.log('💬 Gelen mesaj:', body);

        // login ID'yi yakala
        const match = body.match(/\*\s+`(\d{9,})`\s+\(\+\d+\)\s+-\s+`CONNECTED`/);
        if (match) {
          responded = true;
          client.removeListener('Room.timeline', handler);

          const loginId = match[1];
          await client.sendTextMessage(dmRoom.roomId, `!wa logout ${loginId}`);

          // WhatsApp odalarından çık (relay DM hariç)
          const roomsToLeave = client.getRooms().filter(room => {
            const nameIncludesWhatsApp = room.name?.toLowerCase().includes('(whatsapp)');
            const members = room.getJoinedMembers();
            const isRelayBotDM = members.length === 2 && members.some(m => m.userId === WHATSAPP_BOT_ID);
            return (nameIncludesWhatsApp && !isRelayBotDM);
          });

          for (const roomToLeave of roomsToLeave) {
            try {
              await client.leave(roomToLeave.roomId);
              console.log(`🚪 Çıkıldı: ${roomToLeave.roomId}`);
            } catch (err) {
              console.warn(`⚠️ Çıkılamadı: ${roomToLeave.roomId}`, err.message);
            }
          }

          return res.json({ success: true });
        }

        if (Date.now() - start > timeoutMs) {
          client.removeListener('Room.timeline', handler);
          if (!res.headersSent) {
            return res.status(408).json({ error: 'Login ID yakalanamadı' });
          }
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
    if (!res.headersSent) {
      res.status(500).json({ error: 'Çıkış hatası', details: err.message });
    }
  }
});



// ---------------------
//  B L U E S K Y  I N I T
// ---------------------
app.post('/platform/bluesky/init', async (req, res) => {
  const { userId, accessToken, username, password } = req.body;

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

    await client.sendTextMessage(dmRoom.roomId, 'login');
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, 'bsky.social');
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, username);
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, password);

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

    setupAutoJoinHandler(client, userId);

  } catch (err) {
    console.error('Bluesky init hatası:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Bluesky hesabı eklenemedi', details: err.message });
    }
  }
});

// ---------------------
//  B L U E S K Y  L O G O U T
// ---------------------
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
      if (typeof body !== 'string') return;

      console.log('💬 Gelen mesaj: ' + body);

      const match = body.match(/\*\s+`(did:[\w:]+)`\s+\((.+)\)\s+-\s+`CONNECTED`/);
      if (match) {
        responded = true;
        const loginId = match[1];
        client.removeListener('Room.timeline', handler);

        await client.sendTextMessage(dmRoom.roomId, `!bsky logout ${loginId}`);

        // Bluesky odalarından çık (relay DM hariç)
        const roomsToLeave = client.getRooms().filter(room => {
          const members = room.getJoinedMembers();
          const isRelayBotDM = members.length === 2 && members.some(m => m.userId === BLUESKY_BOT_ID);
          const hasRelayBot = members.some(m => m.userId === BLUESKY_BOT_ID);
          return hasRelayBot && !isRelayBotDM;
        });


        for (const room of roomsToLeave) {
          try {
            await client.leave(room.roomId);
          } catch (err) {
            console.warn(`⚠️ Çıkılamadı: ${room.roomId}`, err.message);
          }
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

// ---------------------------------
//  T E L E G R A M  I N I T  (AŞAMA 1)
// ---------------------------------
app.post('/platform/telegram/init', async (req, res) => {
  const { userId, accessToken, phone } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length === 2 &&
      room.getJoinedMembers().some(m => m.userId === TELEGRAM_BOT_ID)
    );
    if (!dmRoom) return res.status(400).json({ error: 'Telegram bot ile DM bulunamadı' });

    // 1️⃣ login komutu ve telefon numarası gönder
    await client.sendTextMessage(dmRoom.roomId, 'login');
    await new Promise(r => setTimeout(r, 1000));
    await client.sendTextMessage(dmRoom.roomId, phone);

    // “Login code sent…” mesajını beklemeden geri dönüyoruz
    return res.json({ success: true });
  } catch (err) {
    console.error('Telegram init hatası:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Telegram login başlatılamadı', details: err.message });
    }
  }
});

// ---------------------------------
//  T E L E G R A M  V E R I F Y  (AŞAMA 2)
// ---------------------------------
app.post('/platform/telegram/verify', async (req, res) => {
  const { userId, accessToken, code } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length === 2 &&
      room.getJoinedMembers().some(m => m.userId === TELEGRAM_BOT_ID)
    );
    if (!dmRoom) return res.status(400).json({ error: 'Telegram bot ile DM bulunamadı' });

    // 2️⃣ Kullanıcının girdiği kodu gönder
    await client.sendTextMessage(dmRoom.roomId, code);

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

      if (body.toLowerCase().includes('failed to submit input')) {
        // Ör: “Invalid code” gibi bir hata mesajı varsa
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.status(401).json({ error: 'Telegram giriş başarısız: Kod hatalı.' });
      }
    };

    client.on('Room.timeline', handler);

    setTimeout(() => {
      if (!responded) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        if (!res.headersSent) {
          return res.status(408).json({ error: 'Kod doğrulama zaman aşımına uğradı' });
        }
      }
    }, timeoutMs);

  } catch (err) {
    console.error('Telegram verify hatası:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Telegram kod doğrulanamadı', details: err.message });
    }
  }
});

// ---------------------------------
//  T E L E G R A M  L O G O U T
//  (Eğer logout istenirse, örnek bir yapı – bot’un logout komutunu desteklemesi gerekir)
// ---------------------------------
app.post('/platform/telegram/logout', async (req, res) => {
  const { userId, accessToken } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length === 2 &&
      room.getJoinedMembers().some(m => m.userId === TELEGRAM_BOT_ID)
    );
    if (!dmRoom) return res.status(400).json({ error: 'Telegram bot ile DM bulunamadı' });

    await client.sendTextMessage(dmRoom.roomId, 'logout');

    const timeoutMs = 10000;
    let responded = false;

    const handler = async (event, room) => {
      if (room.roomId !== dmRoom.roomId || responded) return;
      const body = event.getContent()?.body;
      if (typeof body !== 'string') return;

      console.log('💬 Gelen mesaj (Telegram logout):', body);

      // Eğer “Successfully logged out” veya benzer bir mesaj varsa kabul edelim:
      if (body.toLowerCase().includes('successfully logged out') || body.toLowerCase().includes('logged out')) {
        responded = true;
        client.removeListener('Room.timeline', handler);

        // Telegram odalarından çık (relay DM hariç)
        const roomsToLeave = client.getRooms().filter(room => {
          const nameIncludesTelegram = room.name?.toLowerCase().includes('(telegram)');
          const members = room.getJoinedMembers();
          const isRelayBotDM = members.length === 2 && members.some(m => m.userId === TELEGRAM_BOT_ID);
          return nameIncludesTelegram && !isRelayBotDM;
        });

        for (const room of roomsToLeave) {
          try {
            await client.leave(room.roomId);
          } catch (err) {
            console.warn(`⚠️ Çıkılamadı: ${room.roomId}`, err.message);
          }
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
          return res.status(408).json({ error: 'Telegram logout zaman aşımı' });
        }
      }
    }, timeoutMs);

  } catch (err) {
    console.error('Telegram logout hatası:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Telegram çıkış işlemi başarısız', details: err.message });
    }
  }
});


// ----------------------
//  T W I T T E R  I N I T
// ----------------------
app.post('/platform/twitter/init', async (req, res) => {
  const { userId, accessToken, cookies } = req.body;
  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(r => client.once('sync', r));

    // DM odasını bul:
    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().some(m => m.userId === TWITTER_BOT_ID)
    );
    if (!dmRoom) return res.status(400).json({ error: 'Twitter bot DM bulunamadı' });

    // Telegram‐benzeri, sadece “login” komutu gönder ve sonra cookies JSON’u
    await client.sendTextMessage(dmRoom.roomId, 'login');
    await new Promise(r => setTimeout(r, 800));
    // Bridge bot’un beklediği JSON: ct0 + auth_token
    await client.sendTextMessage(dmRoom.roomId, JSON.stringify(cookies));

    const timeoutMs = 10000;
    let responded = false;
    const handler = (event, room) => {
      if (room.roomId !== dmRoom.roomId || responded) return;
      const body = event.getContent()?.body;
      if (typeof body !== 'string') return;
      const match = body.match(/Successfully logged into @([\w]+)/i);
      if (match) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.json({ success: true, username: match[1] });
      }
      if (body.toLowerCase().includes('failed')) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.status(401).json({ error: 'Twitter login başarısız.' });
      }
    };
    client.on('Room.timeline', handler);
    setTimeout(() => {
      if (!responded) {
        client.removeListener('Room.timeline', handler);
        if (!res.headersSent) res.status(408).json({ error: 'Twitter login timeout.' });
      }
    }, timeoutMs);
  } catch (err) {
    console.error('Twitter init hatası:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Twitter init başarısız', details: err.message });
  }
});

// ----------------------
//  T W I T T E R  L O G O U T
// ----------------------
app.post('/platform/twitter/logout', async (req, res) => {
  const { userId, accessToken } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length === 2 &&
      room.getJoinedMembers().some(m => m.userId === TWITTER_BOT_ID)
    );
    if (!dmRoom) return res.status(400).json({ error: 'Twitter bot DM bulunamadı' });

    await client.sendTextMessage(dmRoom.roomId, 'logout');

    const timeoutMs = 10000;
    let responded = false;

    return new Promise((resolveFinal) => {
      const start = Date.now();

      const handler1 = (event, room) => {
        if (room.roomId !== dmRoom.roomId || responded) return;
        const body = event.getContent()?.body;
        if (typeof body !== 'string') return;

        const idMatch = body.match(/`(\d{9,})`/);
        if (idMatch) {
          responded = true;
          client.removeListener('Room.timeline', handler1);
          const loginId = idMatch[1];

          setTimeout(() => {
            client.sendTextMessage(dmRoom.roomId, `!twitter logout ${loginId}`).catch(err => {
              console.error('Twitter logout ID gönderme hatası:', err.message);
              return resolveFinal(res.status(500).json({ error: 'Logout ID gönderilemedi', details: err.message }));
            });
          }, 400); // 400ms gecikme


          const handler2 = async (evt2, room2) => {
            if (room2.roomId !== dmRoom.roomId) return;
            const body2 = evt2.getContent()?.body;
            if (typeof body2 !== 'string') return;

            if (body2.toLowerCase().includes('logged out')) {
              client.removeListener('Room.timeline', handler2);

            // Relay DM hariç tüm Instagram odalarından çık
            const roomsToLeave = client.getRooms().filter(room => {
              const nameIncludesTwitter = room.name?.toLowerCase().includes('(twitter)');
              const members = room.getJoinedMembers();
              const isRelayBotDM = members.length === 2 && members.some(m => m.userId === TWITTER_BOT_ID);
              return nameIncludesTwitter && !isRelayBotDM;
            });

              for (const room of roomsToLeave) {
                try {
                  await client.leave(room.roomId);
                  console.log(`🚪 Twitter odasından çıkıldı: ${room.roomId}`);
                } catch (err) {
                  console.warn(`⚠️ Oda çıkış hatası: ${room.roomId} - ${err.message}`);
                }
              }

              return resolveFinal(res.json({ success: true }));
            }
          };

          client.on('Room.timeline', handler2);

          setTimeout(() => {
            client.removeListener('Room.timeline', handler2);
            if (!res.headersSent) {
              return resolveFinal(res.status(408).json({ error: 'Twitter logout cevabı alınamadı (timeout)' }));
            }
          }, timeoutMs);
        }

        if (Date.now() - start > timeoutMs) {
          client.removeListener('Room.timeline', handler1);
          if (!res.headersSent) {
            return resolveFinal(res.status(408).json({ error: 'Logout ID alınamadı (timeout)' }));
          }
        }
      };

      client.on('Room.timeline', handler1);

      setTimeout(() => {
        client.removeListener('Room.timeline', handler1);
        if (!res.headersSent) {
          return resolveFinal(res.status(408).json({ error: 'Logout komutu cevabı alınamadı (timeout)' }));
        }
      }, timeoutMs);
    });

  } catch (err) {
    console.error('Twitter logout hatası:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Twitter çıkış işlemi başarısız', details: err.message });
    }
  }
});

// ----------------------
//  INSTAGRAM LOGIN
// ----------------------
app.post('/platform/instagram/init', async (req, res) => {
  const { userId, accessToken, cookies } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));
    
    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().some(m => m.userId === INSTAGRAM_BOT_ID)
    );
    if (!dmRoom) return res.status(400).json({ error: 'Instagram bot DM bulunamadı' });

    await client.sendTextMessage(dmRoom.roomId, 'login');
    await new Promise(r => setTimeout(r, 800));
    await client.sendTextMessage(dmRoom.roomId, JSON.stringify(cookies));

    const timeoutMs = 10000;
    let responded = false;

    const handler = (event, room) => {
      if (room.roomId !== dmRoom.roomId || responded) return;
      const body = event.getContent()?.body;
      if (typeof body !== 'string') return;

      const match = body.match(/Logged in as (.+?) \((\d+)\)/i);
      if (match) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.json({ success: true, username: match[1] });
      }


      if (body.toLowerCase().includes('failed')) {
        responded = true;
        client.removeListener('Room.timeline', handler);
        return res.status(401).json({ error: 'Instagram login başarısız.' });
      }
    };

    client.on('Room.timeline', handler);

    setTimeout(() => {
      if (!responded) {
        client.removeListener('Room.timeline', handler);
        if (!res.headersSent)
          res.status(408).json({ error: 'Instagram login timeout.' });
      }
    }, timeoutMs);

  } catch (err) {
    console.error('Instagram init hatası:', err.message);
    if (!res.headersSent)
      res.status(500).json({ error: 'Instagram init başarısız', details: err.message });
  }
});

// ----------------------
//  INSTAGRAM LOGOUT
// ----------------------
app.post('/platform/instagram/logout', async (req, res) => {
  const { userId, accessToken } = req.body;

  try {
    const client = sdk.createClient({ baseUrl: MATRIX_URL, accessToken, userId });
    await client.startClient();
    await new Promise(resolve => client.once('sync', resolve));

    const dmRoom = client.getRooms().find(room =>
      room.getMyMembership() === 'join' &&
      room.getJoinedMembers().length === 2 &&
      room.getJoinedMembers().some(m => m.userId === INSTAGRAM_BOT_ID)
    );

    if (!dmRoom) return res.status(400).json({ error: 'Instagram bot ile DM bulunamadı' });

    await client.sendTextMessage(dmRoom.roomId, 'logout');

    const timeoutMs = 10000;
    const start = Date.now();
    let responded = false;

    return new Promise((resolveFinal) => {
      const handler = async (event, room) => {
        if (room.roomId !== dmRoom.roomId || responded) return;
        const body = event.getContent()?.body;
        if (typeof body !== 'string') return;

        const match = body.match(/\*\s+`(\d{9,})`\s+\(.+\)\s+-\s+`CONNECTED`/);
        if (match) {
          responded = true;
          client.removeListener('Room.timeline', handler);

          const loginId = match[1];
          await client.sendTextMessage(dmRoom.roomId, `!meta logout ${loginId}`);

          // Relay DM hariç tüm Instagram odalarından çık
          const roomsToLeave = client.getRooms().filter(room => {
            const nameIncludesInstagram = room.name?.toLowerCase().includes('(instagram)');
            const members = room.getJoinedMembers();
            const isRelayBotDM = members.length === 2 && members.some(m => m.userId === INSTAGRAM_BOT_ID);
            return nameIncludesInstagram && !isRelayBotDM;
          });

          for (const room of roomsToLeave) {
            try {
              await client.leave(room.roomId);
              console.log(`🚪 Instagram odasından çıkıldı: ${room.roomId}`);
            } catch (err) {
              console.warn(`⚠️ Çıkılamadı: ${room.roomId}`, err.message);
            }
          }

          return resolveFinal(res.json({ success: true }));
        }

        if (body.toLowerCase().includes('logged out')) {
          responded = true;
          client.removeListener('Room.timeline', handler);
          return resolveFinal(res.json({ success: true }));
        }

        if (Date.now() - start > timeoutMs) {
          client.removeListener('Room.timeline', handler);
          if (!res.headersSent) {
            return resolveFinal(res.status(408).json({ error: 'Instagram logout timeout' }));
          }
        }
      };

      client.on('Room.timeline', handler);

      setTimeout(() => {
        client.removeListener('Room.timeline', handler);
        if (!res.headersSent) {
          return resolveFinal(res.status(408).json({ error: 'Zaman aşımı' }));
        }
      }, timeoutMs);
    });

  } catch (err) {
    console.error('Instagram logout hatası:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Instagram çıkış işlemi başarısız', details: err.message });
    }
  }
});





// ---------------------
//  W E B S O C K E T  S E R V E R
// ---------------------
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

export { app };

