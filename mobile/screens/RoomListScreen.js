// ✅ RoomListScreen.js (geliştirilmiş: ikon + canlı güncelleme)
import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Button,
  Image,
  RefreshControl,
} from 'react-native';
import { SessionContext } from '../context/SessionContext';
import api from '../services/api';
import { WEBSOCKET_BASE_URL } from '../config/matrixConfig';
import { SafeAreaView } from 'react-native-safe-area-context';

const RoomListScreen = ({ navigation }) => {
  const { session, setSession, logout } = useContext(SessionContext);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loginAgain = async () => {
  if (!session?.username || !session?.password) {
    console.warn("⛔ Kullanıcı adı veya şifre yok, yeniden giriş yapılamaz.");
    return;
  }

  try {
    const res = await api.post('/login', {
      username: session.username,
      password: session.password,
    });
    setSession({ ...res.data, username: session.username, password: session.password });
    return res.data.userId;
  } catch (err) {
    console.error('Yeniden giriş başarısız:', err.message);
  }
};


  const handleRefresh = async () => {
    setRefreshing(true);
    const userId = await loginAgain();
    if (userId) await fetchRooms();
    setRefreshing(false);
  };

  const fetchRooms = async () => {
    try {
      const res = await api.get(`/rooms/${encodeURIComponent(session.userId)}`);
      const sorted = res.data.sort((a, b) => (b.unreadCount || 0) - (a.unreadCount || 0));
      setRooms(sorted);
    } catch (err) {
      console.error('Oda listesi alınamadı:', err.message);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (!session?.userId) return;
    fetchRooms();

    // const ws = new WebSocket(WEBSOCKET_BASE_URL);
    // ws.onopen = () => {
    //   ws.send(JSON.stringify({ userId: session.userId }));
    // };
    // ws.onmessage = (e) => {
    //   const data = JSON.parse(e.data);
    //   if (data.type === 'room_update') {
    //     console.log('🆕 Yeni oda güncellemesi geldi. Liste yenileniyor...');
    //     handleRefresh();
    //   }
    // };

    
    // 🕒 Her 10 saniyede bir fetchRooms çağır
    const intervalId = setInterval(() => {
      console.log('🔄 3 saniyelik periyodik oda güncellemesi');
      fetchRooms();
    }, 3000);

    return () => {
      clearInterval(intervalId); // component unmount olunca temizle
      // ws.close();
    }  
  }, [session.userId]);

  const handleLogout = () => {
    logout();
    navigation.replace('Login');
  };

  const getPlatformIcon = (roomInfo) => {
    const source = `${roomInfo.name} ${roomInfo.roomId}`.toLowerCase();
    
    if (source.includes('telegram')) return require('../assets/telegram.png');
    if (source.includes('bluesky')) return require('../assets/bluesky.png');
    if (source.includes('twitter')) return require('../assets/twitter.png');
    if (source.includes('google chat')) return require('../assets/googlechat.png');
    if (source.includes('google message') || source.includes('gmessages')) return require('../assets/gmessages.png');
    if (source.includes('meta')) return require('../assets/meta.png');
    if (source.includes('instagram')) return require('../assets/instagram.png');
    if (source.includes('facebook')) return require('../assets/facebook.png');
    if (source.includes('whatsapp')) return require('../assets/whatsapp.png');
    return require('../assets/groupChat.png');
  };

  const renderItem = ({ item }) => {
    const icon = getPlatformIcon(item);
    return (
      <TouchableOpacity
        style={styles.roomItem}
        onPress={() => navigation.navigate('Chat', { roomId: item.roomId, roomName: item.name})}
      >
        {icon && <Image source={icon} style={styles.icon} />}
        <View style={styles.roomContent}>
          <Text style={styles.roomText}>{item.name}</Text>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBubble}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };


  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#666" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Button title="Çıkış Yap" onPress={handleLogout} color="red" />
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.roomId}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.emptyText}>Hiç oda bulunamadı.</Text>}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />
    </SafeAreaView>
  );
};

export default RoomListScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  roomText: { fontSize: 16, marginLeft: 12 },
  icon: { width: 30, height: 30, resizeMode: 'contain' },
  emptyText: {
    marginTop: 32,
    textAlign: 'center',
    color: '#888',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  roomContent: {
  flex: 1,
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginLeft: 12,
  },
  unreadBubble: {
    backgroundColor: 'red',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  unreadText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },

});
