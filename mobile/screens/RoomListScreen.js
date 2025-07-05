import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { SessionContext } from '../context/SessionContext';
import api from '../services/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MATRIX_BASE_URL } from '../config/matrixConfig';

const RoomListScreen = ({ navigation }) => {
  const BASE_URL = MATRIX_BASE_URL.slice(0, -5) + ":8008"
  const { session, setSession, logout  } = useContext(SessionContext);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  
  const PLATFORM_ICONS = [
    { key: 'whatsapp', icon: require('../assets/whatsapp.png') },
    { key: 'instagram', icon: require('../assets/instagram.png') },
    { key: 'twitter', icon: require('../assets/twitter.png') },
    { key: 'telegram', icon: require('../assets/telegram.png') },
    { key: 'bluesky', icon: require('../assets/bluesky.png') },
  ];

  const togglePlatform = (platformKey) => {
    setSelectedPlatforms((prev) => {
      const updated = prev.includes(platformKey)
        ? prev.filter((key) => key !== platformKey)
        : [...prev, platformKey];
      return updated;
    });
  };

  useEffect(() => {
    loginAgain();
  }, []); 


  const loginAgain = async () => {
    if (!session?.username || !session?.password) return;
    try {
      const res = await api.post('/login', { username: session.username, password: session.password });
      setSession({ ...res.data, username: session.username, password: session.password });
      console.log("Yeniden giriş başarılı");
      return res.data.userId;
    } catch (err) {
      console.error('Yeniden giriş başarısız:', err.message);
      // ① Oturumu temizle
      logout();
      // ② Login ekranına dön
      navigation.replace('Login');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const userId = await loginAgain();
    if (userId) await fetchRooms();
    setRefreshing(false);
  };

  const formatRoomName = roomName => roomName.replace(/\s*\(.*?\)\s*$/, '').trim();

  const fetchRooms = async () => {
    console.log('📦 userId:', session?.userId);
    try {
      const res = await api.get(`/rooms/${encodeURIComponent(session.userId)}`, {
        params: {
          accessToken: session.accessToken,
        },
      });

      const filtered = res.data.filter(room => {
        const roomName = room.name?.toLowerCase() || '';

        const platformMatched =
          selectedPlatforms.length === 0 ||
          selectedPlatforms.some(platform => roomName.includes(`(${platform.toLowerCase()})`));

        return (
          !roomName.includes("bridge bot") &&
          !roomName.includes("empty room (was ") &&
          (
            roomName.includes("(bluesky)") ||
            roomName.includes("(telegram)") ||
            roomName.includes("(twitter)") ||
            roomName.includes("(whatsapp)") ||
            roomName.includes("(instagram)")
          ) &&
          platformMatched
        );
      });
      
      const sorted = filtered.sort((a, b) => b.lastMessageTs - a.lastMessageTs);
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

    const intervalId = setInterval(() => {
      fetchRooms();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [session.userId, selectedPlatforms]);

  const getPlatformIcon = (roomInfo) => {
    const source = `${roomInfo.name} ${roomInfo.roomId}`.toLowerCase();
    if (source.includes('telegram')) return require('../assets/telegram.png');
    if (source.includes('bluesky')) return require('../assets/bluesky.png');
    if (source.includes('twitter')) return require('../assets/twitter.png');
    if (source.includes('instagram')) return require('../assets/instagram.png');
    if (source.includes('whatsapp')) return require('../assets/whatsapp.png');
    return require('../assets/groupChat.png');
  };

  const filterURL = (mxcUrl) => {
    const newURL = mxcUrl.replace('http://localhost:8008', BASE_URL);
    
    return newURL;
  };

const renderItem = ({ item }) => {
  const platformIcon = getPlatformIcon(item);
  
  const avatar = item.avatarUrl
    ? { uri: filterURL(item.avatarUrl) }
    : require('../assets/profile.png');
  
  return (
    <TouchableOpacity
      style={styles.roomItem}
      onPress={() =>
        navigation.navigate('Chat', {
          roomId: item.roomId,
          roomName: formatRoomName(item.name),
          roomNameFull: item.name,
        })
      }
    >
      <Image source={avatar} style={styles.avatar} />

      <View style={styles.roomContent}>
        <Text style={styles.roomText}>{formatRoomName(item.name)}</Text>
        
      </View>
      <Image source={platformIcon} style={styles.platformIcon} />
      {item.unreadCount > 0 && (
          <View style={styles.unreadBubble}>
            <Text style={styles.unreadText}>{item.unreadCount}</Text>
          </View>
      )}
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

  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>

        <View style={styles.platformBar}>
          {PLATFORM_ICONS.map(({ key, icon }) => (
            <TouchableOpacity
              key={key}
              onPress={() => togglePlatform(key)}
              style={[
                styles.platformIconWrapper,
                selectedPlatforms.includes(key) && styles.platformIconSelected
              ]}
            >
              <Image source={icon} style={styles.platformIcon} />
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Sohbet Ara..."
          placeholderTextColor="#888"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      
      <FlatList
        data={filteredRooms}
        keyExtractor={(item) => item.roomId}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Hiç sohbet bulunamadı.</Text>
        }
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 16,
    color: '#000',
    backgroundColor: '#f2f2f2',
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  roomContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  roomText: {
    fontSize: 16,
    flex: 1,
  },
  unreadBubble: {
    backgroundColor: 'red',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  unreadText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  platformBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  platformIconWrapper: {
    padding: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundsColor: '#fff',
  },
  platformIconSelected: {
    backgroundColor: '#cce5ff',
    borderColor: '#007bff',
  },
  platformIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  emptyText: {
    marginTop: 32,
    textAlign: 'center',
    color: '#888',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  filterContainer: {
    marginBottom: 10,
    maxHeight: 30,
  },
  filterButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
  },
  filterButtonActive: {
    backgroundColor: '#64b5f6',
  },
  filterButtonText: {
    fontWeight: '500',
    color: '#333',
    fontSize: 10,
  },
});
