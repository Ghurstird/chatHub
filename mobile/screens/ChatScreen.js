import React, { useState, useContext, useRef, useEffect , useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  Modal,
  Alert,
  Button,
  ScrollView,
  ActivityIndicator,
  ImageBackground,
  Dimensions
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { Video } from 'expo-av';
import Slider from '@react-native-community/slider';
import * as Progress from 'react-native-progress';
import { Buffer } from 'buffer';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import { SessionContext } from '../context/SessionContext';
import { MATRIX_BASE_URL, WEBSOCKET_BASE_URL } from '../config/matrixConfig';

import Toast from 'react-native-simple-toast';
import * as Clipboard from 'expo-clipboard';
import * as VideoThumbnails from 'expo-video-thumbnails';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

const ChatScreen = ({ navigation, route }) => {
  const BASE_URL = MATRIX_BASE_URL.slice(0, -5) + ":8008"
  const { roomId, roomName } = route.params;
  const { session } = useContext(SessionContext);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(null);
  const [mediaModalVisible, setMediaModalVisible] = useState(false);
  const [mediaToShow, setMediaToShow] = useState(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);

  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const videoRef = useRef(null);
  const [initialScrollDone, setInitialScrollDone] = useState(false);

  const [platforms, setPlatforms] = useState({});

  const [audioSound, setAudioSound] = useState(null);
  const [audioStatus, setAudioStatus] = useState({
    isPlaying: false,
    positionMillis: 0,
    durationMillis: 0,
  });
  const [audioLoading, setAudioLoading] = useState(false);
  const [currentPlayingUri, setCurrentPlayingUri] = useState(null);
  const statusUpdateThrottleRef = useRef(null);
  
  


  const flatListRef = useRef(null);
  const insets = useSafeAreaInsets();
  const wsRef = useRef(null);

  // Arama durumları
  const [searchMode, setSearchMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [backgroundRGB, setBackgroundRGB] = useState(null);

  const [roomDisplayName, setRoomDisplayName] = useState(roomName || ''); // roomName varsa onu kullan

  // roomNameFull'u tanımla
  const roomNameFull = route.params?.roomNameFull || roomName || '';

  const [isSliding, setIsSliding] = useState(false);
  const playbackStatusRef = useRef(null);
  const animationFrameRef = useRef(null);

  
  const fetchRoomName = async () => {
    try {
      const res = await api.get(`/rooms/${encodeURIComponent(session.userId)}`, {
        params: { accessToken: session.accessToken },
      });

      const room = res.data.find(r => r.roomId === roomId);
      if (room?.name) {
        setRoomDisplayName(room.name);
      } else {
        setRoomDisplayName('Sohbet');
      }
    } catch (err) {
      console.warn('Oda ismi alınamadı:', err.message);
      setRoomDisplayName('Sohbet');
    }
  };
  const formatRoomName = roomName => roomName.replace(/\s*\(.*?\)\s*$/, '').trim();

  useEffect(() => {
    if (!session?.userId) return;
    fetchAccounts();
    //console.log('Session User ID:', session.userId); // Debug
  }, [session.userId]);

  const fetchAccounts = async () => {
    try {
      const res = await api.get(`/accounts/${encodeURIComponent(session.userId)}`);
      setPlatforms(res.data || {});
    } catch (err) {
      console.warn('Platformlar alınamadı:', err.message);
      }
   };

  useEffect(() => {
    if (!roomName) {
      fetchRoomName();
    }

    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Galeriye kayıt izni gerekli.');
      }
    })();
  }, []);
  useEffect(() => {
    fetchRoomAvatar();
  }, [roomId]);

  
  useEffect(() => {
    const loadBackgroundImage = async () => {
      try {
        const uri = await AsyncStorage.getItem('theme_value');
        //console.log('Tema URI:', uri); // Debug

        if (!uri) {
          // tema daha önce ayarlanmamış
          setBackgroundImage(null);
          setBackgroundRGB("#585e6e");
          return;
        }

        if (uri.includes('file://')) {
          setBackgroundImage(uri);
          setBackgroundRGB(null);
        } else {
          setBackgroundRGB(uri);
          setBackgroundImage(null);
        }
      } catch (e) {
        console.error('Tema yüklenirken hata:', e);
      }
    };

    loadBackgroundImage();
  }, []);

  const fetchRoomAvatar = async () => {
  try {
    const res = await api.get(`/room-avatar/${encodeURIComponent(roomId)}`, {
      params: {
        userId: session.userId, // session.userId backend'de client'a atanmış olmalı
      },
    });

    if (res.data?.avatarUrl) {
      setAvatarUrl(res.data.avatarUrl);
    } else {
      
      console.log('Avatar bulunamadı veya boş.');
    }
  } catch (error) {
    console.error('Avatar alınamadı:', error);
  }
};
//console.log('ROOM ID:', roomId); // Debug
  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  const formatTimeSeconds = (millis) => {
    if (!millis) return '00:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const resolveMxcUrl = (mxcUrl) => {
    if (!mxcUrl?.startsWith('mxc://')) return mxcUrl;
    const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) return '';
    const [, server, mediaId] = match;
    const base = session.baseUrl || BASE_URL;
    return `${base}/_matrix/media/v3/download/${server}/${mediaId}`;
  };

  const fetchMessages = async () => {
    try {
      const res = await api.get(`/messages/${encodeURIComponent(roomId)}`, {
        params: {
          userId: session.userId,
          accessToken: session.accessToken,
        },
      });
      setMessages(res.data || []);
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Mesajlar alınamadı:', error);
    }
  };

  const saveWithGallery = async (uri, msgtype) => {
    let extension = 'bin';
    if (msgtype === 'm.image') extension = 'jpg';
    else if (msgtype === 'm.video') extension = 'mp4';
    else if (msgtype === 'm.audio') extension = 'mp3';

    let fileName = uri.split('/').pop().split('?')[0]; // Dosya adı
    let cacheDir = FileSystem.cacheDirectory + 'media/';
    const localPath = `${cacheDir}${fileName}.${extension}`;

    try {
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        // ⚡ Zaten indirilmişse direkt return et
        return localPath;
      }

      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });

      const callback = ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        setDownloadProgress(totalBytesWritten / totalBytesExpectedToWrite);
      };

      const { uri: downloadedUri } = await FileSystem.downloadAsync(uri, localPath, {}, callback);

      // Opsiyonel: Galeriye eklemek istiyorsan bu satırı da koruyabilirsin
      await MediaLibrary.createAssetAsync(downloadedUri);

      return downloadedUri;
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert('İndirme Hatası', err.message);
      return null;
    }
  };

  const openMedia = async (uri, type) => {
    setLoadingMedia(true);
    const localUri = await saveWithGallery(uri, type);
    if (!localUri) {
      setLoadingMedia(false);
      return;
    }

    if (type === 'm.video') {
      setVideoProgress(0);
      setVideoDuration(0);
    }
    setMediaToShow({ uri: localUri, type });
    setMediaModalVisible(true);
    setLoadingMedia(false);
  };



  const closeMediaModal = async () => {
    setMediaModalVisible(false);
    setDownloadProgress(0);
    if (audioSound) {
      await audioSound.unloadAsync();
      setAudioSound(null);
      setAudioStatus({ isPlaying: false, positionMillis: 0, durationMillis: 0 });
      setCurrentPlayingUri(null);
    }
  };


  const getVideoDurationMillis = async (uri) => {
    try {
      const result = await VideoThumbnails.getThumbnailAsync(uri);
      console.log("video thumbnail result::", result);
      const duration = result?.duration || 0;
      console.log("videoDuration::", duration);
      return duration;
    } catch (e) {
      console.warn('Video süresi alınamadı:', e.message);
      return 0;
    }
  };


  
  const getAudioDurationMillis = async (uri) => {
    const { sound, status } = await Audio.Sound.createAsync(
      { uri },
      {},
      null,
      false
    );
    const duration = status.durationMillis || 0;
    await sound.unloadAsync();
    console.log("AudioDuration:: " + duration);
    return duration || 1;
  };


  // sendMediaMessage güncelle
const sendMediaMessage = async (uri, msgtype, mimeType) => {
  setUploading(true);
  try {
    const base64Data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryData = Buffer.from(base64Data, 'base64');

    const uploadUrl = `${session.baseUrl || BASE_URL}/_matrix/media/v3/upload`;

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: binaryData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Upload failed: ${errorText}`);
    }

    const result = await res.json();
    const mxcUrl = result.content_uri;

    let duration = 0;
    if (msgtype === 'm.video') {
      duration = await getAudioDurationMillis(uri);
    } else if (msgtype === 'm.audio') {
      duration = await getAudioDurationMillis(uri);
    }

    // Twitter özel durumu
    if (roomNameFull.includes('Twitter') || roomNameFull.includes('X')) {
      if (msgtype === 'm.audio') msgtype = 'm.video';
    }
    //(duration);
    const content = {
      body: msgtype === 'm.video' ? '🎥 video' : msgtype === 'm.audio' ? '🎧 ses' : '📎 medya',
      msgtype,
      url: mxcUrl,
      info: {
        mimetype: mimeType,
        ...(msgtype === 'm.video' && { w: 320, h: 240 }),
        ...(duration > 0 && { duration }),
        //duration
      },
    };

    await api.post('/sendMessage', {
      userId: session.userId,
      accessToken: session.accessToken,
      roomId,
      content
    });

    await fetchMessages();
  } catch (err) {
    console.error('Medya gönderilemedi:', err.message);
    Alert.alert('Hata', 'Medya gönderilemedi: ' + err.message);
  } finally {
    setUploading(false);
  }
};


  const pickMedia = async (type) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          type === 'image'
            ? ImagePicker.MediaTypeOptions.Images
            : ImagePicker.MediaTypeOptions.Videos,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const msgType = type === 'image' ? 'm.image' : 'm.video';
        const mime = asset.mimeType || (type === 'image' ? 'image/jpeg' : 'video/mp4'); // ✅ fallback
        await sendMediaMessage(asset.uri, msgType, mime);
      }
    } catch (error) {
      console.error('Medya seçilemedi:', error);
    }
  };


  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Ses kaydı için izin gerekli.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {
      console.error('Kayıt başlatılamadı:', err);
      Alert.alert('Hata', 'Kayıt başlatılamadı.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (uri) {
        await sendMediaMessage(uri, 'm.audio', 'audio/mp4');
      }
    } catch (err) {
      console.error('Kayıt durdurulamadı:', err);
      Alert.alert('Hata', 'Kayıt durdurulamadı.');
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const newMessage = {
        userId: session.userId,
        accessToken: session.accessToken,
        roomId,
        content: {body: text, msgtype: "m.text"}
      };

      const res = await api.post('/sendMessage', newMessage);
      await fetchMessages();
      setText('');
      scrollToBottom();
    } catch (err) {
      console.error('Mesaj gönderilemedi:', err.message);
      Alert.alert('Hata', 'Mesaj gönderilemedi.');
    } finally {
      setSending(false);
    }
  };



  const markAsRead = async () => {
    try {
      await api.post('/markAsRead', {
        userId: session.userId,
        accessToken: session.accessToken,
        roomId,
      });
    } catch (err) {
      console.warn('Okundu olarak işaretlenemedi:', err.message);
    }
  };

  // Arama fonksiyonları
  const toggleSearchMode = () => {
    if (!searchMode) {
      setSearchMode(true);
      setSearchTerm('');
      setSearchResults([]);
      setCurrentSearchIndex(0);
      setSearching(false);
    } else {
      setSearchMode(false);
    }
  };

  const performSearch = () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const term = searchTerm.toLowerCase();
    const results = [];
    
    messages.forEach((msg, index) => {
      if (msg.text && msg.text.toLowerCase().includes(term)) {
        results.push({
          ...msg,
          index: index
        });
      }
    });
    
    setSearchResults(results);
    setCurrentSearchIndex(0);
    setSearching(true);
    
    if (results.length > 0) {
      scrollToMessage(results[0].index);
    }
  };

  const navigateSearch = (direction) => {
    if (searchResults.length === 0) return;

    let newIndex;
    if (direction === 'next') {
      newIndex = (currentSearchIndex + 1) % searchResults.length;
    } else {
      newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    }

    setCurrentSearchIndex(newIndex);
    scrollToMessage(searchResults[newIndex].index);
  };

  const scrollToMessage = (index) => {
    if (flatListRef.current && messages.length > index) {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5
      });
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    setSearchResults([]);
    setSearching(false);
  };

  useEffect(() => {
    fetchMessages().then(markAsRead);

    const ws = new WebSocket(WEBSOCKET_BASE_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ userId: session.userId }));
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'new_message' && data.roomId === roomId) {
          fetchMessages().then(markAsRead);
          scrollToBottom();
        }
      } catch (error) {
        console.error('WebSocket mesajı işlenirken hata:', error);
      }
    };

    ws.onerror = (e) => {
      console.error('WebSocket hata:', e.message);
    };

    return () => {
      ws.close();
      if (audioSound) {
        audioSound.unloadAsync();
        setAudioSound(null);
        setAudioStatus({
          isPlaying: false,
          positionMillis: 0,
          durationMillis: 0
        });
        setCurrentPlayingUri(null);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [roomId]);

  // Ses oynatıcı kontrol fonksiyonları
  const playAudio = async (uri) => {
    try {
      // Aynı ses zaten çalıyorsa duraklat/devam ettir
      if (currentPlayingUri === uri) {
        if (audioStatus.isPlaying) {
          await pauseAudio();
        } else {
          await resumeAudio();
        }
        return;
      }

      // Önceki sesi durdur
      if (audioSound) {
        await stopAudio();
      }

      setAudioLoading(true); // Yükleme başladı
      
      // Yeni ses oynatıcı oluştur
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, statusUpdateInterval: 200 },
        onPlaybackStatusUpdate
      );
      
      setAudioSound(sound);
      setCurrentPlayingUri(uri);
      
      // İlk durum güncellemesi için
      const status = await sound.getStatusAsync();
      onPlaybackStatusUpdate(status);
      
      // Süre bilgisini al ve güncelle
      const duration = status.durationMillis || 0;
      setAudioStatus(prev => ({
        ...prev,
        durationMillis: duration
      }));
      
      setAudioLoading(false); // Yükleme tamamlandı
    } catch (err) {
      console.error('Ses oynatılamadı:', err);
      Alert.alert('Hata', 'Ses oynatılamadı.');
      setAudioLoading(false);
    }
  };

  const pauseAudio = async () => {
    if (audioSound) {
      await audioSound.pauseAsync();
      setAudioStatus(prev => ({
        ...prev,
        isPlaying: false
      }));
    }
  };

  async function resumeAudio() {
    if (audioSound) {
      await audioSound.playAsync();
      setAudioStatus(prev => ({
        ...prev,
        isPlaying: true
      }));
    }
  }

  const stopAudio = async () => {
    if (audioSound) {
      await audioSound.stopAsync();
      await audioSound.unloadAsync();
      setAudioSound(null);
      setAudioStatus({
        isPlaying: false,
        positionMillis: 0,
        durationMillis: 0
      });
      setCurrentPlayingUri(null);
    }
  };

  const onPlaybackStatusUpdate = useCallback((status) => {
    playbackStatusRef.current = status;
    
    if (!status.isLoaded) {
      if (status.error) console.error(`Playback error: ${status.error}`);
      return;
    }

    // Kaydırma sırasında güncelleme yapma
    if (isSliding) return;
    
    // Raf ile optimize edilmiş güncelleme
    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = null;
        
        setAudioStatus(prev => ({
          ...prev,
          isPlaying: status.isPlaying,
          positionMillis: status.positionMillis,
          durationMillis: status.durationMillis || prev.durationMillis
        }));

        if (status.didJustFinish) {
          setAudioStatus({
            isPlaying: false,
            positionMillis: 0,
            durationMillis: status.durationMillis,
          });
          setCurrentPlayingUri(null);
        }
      });
    }
  }, [isSliding]);


  const seekAudio = async (value) => {
    if (audioSound && audioStatus.durationMillis) {
      await audioSound.setPositionAsync(value);
      setAudioStatus(prev => ({
        ...prev,
        positionMillis: value
      }));
    }
  };

  // Ses oynatıcı UI bileşeni
  const AudioPlayer = ({ uri }) => {
    const isCurrentPlaying = currentPlayingUri === uri;
    const isPlaying = isCurrentPlaying && audioStatus.isPlaying;

    // Slider için maksimum değeri hesapla
    const maxValue = audioStatus.durationMillis > 0 
      ? audioStatus.durationMillis 
      : 1;

    return (
      <View style={styles.audioPlayerContainer}>
        <TouchableOpacity
          onPress={() => playAudio(uri)}
          style={styles.audioPlayPauseButton}
          disabled={audioLoading}
        >
          {audioLoading && isCurrentPlaying ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={{ fontSize: 18 }}>
              {isPlaying ? '⏸' : '▶'}
            </Text>
          )}
        </TouchableOpacity>

        <Slider
          style={styles.audioSlider}
          minimumValue={0}
          maximumValue={isCurrentPlaying ? (audioStatus.durationMillis || 1) : 1}
          value={isCurrentPlaying ? audioStatus.positionMillis : 0}
          onSlidingComplete={seekAudio}
          disabled={!isCurrentPlaying}
          minimumTrackTintColor="#007bff"
          maximumTrackTintColor="#ccc"
          thumbTintColor="#007bff"
        />


        <Text style={styles.audioTimeText}>
          {formatTimeSeconds(audioStatus.positionMillis)} / 
          {formatTimeSeconds(audioStatus.durationMillis)}
        </Text>
      </View>
    );
  };

  const handleSlidingStart = () => {
    setIsSliding(true);
  };

  const handleSlidingComplete = async (value) => {
    setIsSliding(false);
    await seekAudio(value);
  };

  // YENİ: Slider değeri değiştiğinde anlık geri bildirim
  const handleValueChange = (value) => {
    if (isSliding) {
      setAudioStatus(prev => ({
        ...prev,
        positionMillis: value
      }));
    }
  };

  // Mesaj render fonksiyonu
  const renderMessage = ({ item, index }) => {
    Object.keys(platforms).forEach(platform => {
      let username = platforms[platform];
      platforms[platform] = username.replace(/^[@+]/, "");
    });
    const isPlatformUser = Object.values(platforms).some(username =>
      item.sender.includes(username) || 
      item.displayName
      .replace(/\s+/g, '')
      .replace(/\((Twitter|WhatsApp|Instagram|Bluesky|Telegram)\)/g, '').
      includes(username) ||
      username.includes(item.sender) ||
      username.includes(item.displayName.replace(/\s+/g, '').replace(/\((Twitter|WhatsApp|Instagram|Bluesky|Telegram)\)/g, '')) 
    );

    const isOwnMessage = (item.sender === session.userId) || isPlatformUser ;
    const isSearchMatch = searching && searchResults.some(result => result.index === index);

    const bubbleStyle = isSearchMatch 
      ? [styles.bubble, styles.searchMatchBubble, isOwnMessage ? styles.bubbleRight : styles.bubbleLeft]
      : [styles.bubble, isOwnMessage ? styles.bubbleRight : styles.bubbleLeft];

    if (item.msgtype === 'm.image') {
      return (
        <View style={[styles.messageContainer, isOwnMessage ? styles.messageRight : styles.messageLeft]}>
          <View style={[styles.bubble, isOwnMessage ? styles.bubbleRight : styles.bubbleLeft]}>
            
            <TouchableOpacity 
              onLongPress={() => {
                if ((item.sender === session.userId || isPlatformUser) && item.event_id) {
                  Alert.alert('Mesajı Sil', 'Bu medya mesajını silmek istiyor musun?', [
                    { text: 'İptal', style: 'cancel' },
                    {
                      text: 'Sil',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await api.post('/deleteMessage', {
                            userId: session.userId,
                            accessToken: session.accessToken,
                            roomId,
                            eventId: item.event_id,
                          });
                          Toast.show('Mesaj silindi', Toast.SHORT);
                          await fetchMessages();
                        } catch (err) {
                          Alert.alert('Hata', 'Mesaj silinemedi.');
                        }
                      },
                    },
                  ]);
                }
              }}
              delayLongPress={500} 
              onPress={() => openMedia(resolveMxcUrl(item.url), 'm.image')}>
              <Image
                source={{ uri: resolveMxcUrl(item.url) }}
                style={styles.image}
                resizeMode="cover"
              />
            </TouchableOpacity>
            <Text style={styles.timestampInside}>{formatTime(item.timestamp)}</Text>
          </View>
        </View>
      );
    }

    if (item.msgtype === 'm.video') {
      return (
        <View style={[styles.messageContainer, isOwnMessage ? styles.messageRight : styles.messageLeft]}>
          <View style={[styles.bubble, isOwnMessage ? styles.bubbleRight : styles.bubbleLeft]}>
            <TouchableOpacity 
              onLongPress={() => {
                if ((item.sender === session.userId || isPlatformUser) && item.event_id) {
                  Alert.alert('Mesajı Sil', 'Bu medya mesajını silmek istiyor musun?', [
                    { text: 'İptal', style: 'cancel' },
                    {
                      text: 'Sil',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await api.post('/deleteMessage', {
                            userId: session.userId,
                            accessToken: session.accessToken,
                            roomId,
                            eventId: item.event_id,
                          });
                          Toast.show('Mesaj silindi', Toast.SHORT);
                          await fetchMessages();
                        } catch (err) {
                          Alert.alert('Hata', 'Mesaj silinemedi.');
                        }
                      },
                    },
                  ]);
                }
              }}
              delayLongPress={500}
              onPress={() => openMedia(resolveMxcUrl(item.url), 'm.video')}>
              <Video
                source={{ uri: resolveMxcUrl(item.url) }}
                style={styles.videoThumbnail}
                resizeMode="contain"
                useNativeControls={false}
                shouldPlay={false}
                isLooping={false}
              />
              <View style={styles.playButtonOverlay}>
                <Text style={{ color: '#fff', fontSize: 20 }}>▶️</Text>
              </View>
              
              {/* Video süresi */}
              <Text style={styles.videoDurationText}>
                {formatTimeSeconds(item.duration || 10000)}
              </Text>

              {/* Zaman damgası */}
              <Text style={styles.timestampInside}>{formatTime(item.timestamp)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (item.msgtype === 'm.audio') {
      const isCurrentPlaying = currentPlayingUri === resolveMxcUrl(item.url);
      const audioBackgroundColor = isOwnMessage ? '#0084ff' : '#e8f0fe';
      const timestampColor = isOwnMessage ? 'white' : 'black';

      return (
        <View style={[styles.messageContainer, isOwnMessage ? styles.messageRight : styles.messageLeft]}>
          <View style={[styles.audioPlayerContainer, { backgroundColor: audioBackgroundColor }]}>
            <TouchableOpacity
              onLongPress={() => {
                if ((item.sender === session.userId || isPlatformUser) && item.event_id) {
                  Alert.alert('Mesajı Sil', 'Bu medya mesajını silmek istiyor musun?', [
                    { text: 'İptal', style: 'cancel' },
                    {
                      text: 'Sil',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await api.post('/deleteMessage', {
                            userId: session.userId,
                            accessToken: session.accessToken,
                            roomId,
                            eventId: item.event_id,
                          });
                          Toast.show('Mesaj silindi', Toast.SHORT);
                          await fetchMessages();
                        } catch (err) {
                          Alert.alert('Hata', 'Mesaj silinemedi.');
                        }
                      },
                    },
                  ]);
                }
              }}
              delayLongPress={500}
              onPress={async () => {
                if (isCurrentPlaying && audioStatus.isPlaying) {
                  await pauseAudio();
                } else if (isCurrentPlaying && !audioStatus.isPlaying) {
                  await resumeAudio();
                } else {
                  await playAudio(resolveMxcUrl(item.url));
                }
              }}
              style={styles.audioPlayPauseButton}
            >
              <Text style={{ fontSize: 18 }}>
                {isCurrentPlaying && audioStatus.isPlaying ? '🎙⏸' : '🎙▶'}
              </Text>
            </TouchableOpacity>

            <Slider
              style={styles.audioSlider}
              minimumValue={0}
              maximumValue={isCurrentPlaying ? (item.content || 1) : 1}
              value={isCurrentPlaying ? audioStatus.positionMillis / audioStatus.durationMillis : 0}
              minimumTrackTintColor="red"
              maximumTrackTintColor="#ccc"
              thumbTintColor="orange"
              onSlidingComplete={seekAudio}
              disabled={!isCurrentPlaying}
            />

            <View style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
              <Text style={styles.audioTimeText}>
                {isCurrentPlaying
                  ? `${formatTimeSeconds(audioStatus.positionMillis)} / ${formatTimeSeconds(audioStatus.durationMillis)}`
                  : `00:00 / ${formatTimeSeconds(item.duration)}`}
              </Text>
              <Text style={{ fontSize: 10, color: timestampColor, marginTop: 2 }}>
                {formatTime(item.timestamp)}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    // renderMessage fonksiyonu (sadece metin mesajları kısmı)
    return (
      <View style={[styles.messageContainer, isOwnMessage ? styles.messageRight : styles.messageLeft]}>
        <TouchableWithoutFeedback
          onLongPress={() => {
            const options = [
              {
                text: 'Mesajı Kopyala',
                onPress: () => {
                  Clipboard.setStringAsync(item.text);
                  Toast.show('Mesaj kopyalandı', Toast.SHORT);
                },
              },
            ];

            // Sadece kendi veya platform hesabından gelen mesajlar silinebilir
            if ((item.sender === session.userId || isPlatformUser) && item.event_id) {
              options.push({
                text: 'Mesajı Sil',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await api.post('/deleteMessage', {
                      userId: session.userId,
                      accessToken: session.accessToken,
                      roomId,
                      eventId: item.event_id,
                    });
                    Toast.show('Mesaj silindi', Toast.SHORT);
                    await fetchMessages();
                  } catch (err) {
                    Alert.alert('Hata', 'Mesaj silinemedi.');
                  }
                },
              });
            }

            options.push({ text: 'İptal', style: 'cancel' });

            Alert.alert('Mesaj İşlemleri', '', options);
          }}
          delayLongPress={500}
        >
          <View style={bubbleStyle}>
            <Text style={[styles.messageText, isOwnMessage && { color: '#fff' }]}>{item.text}</Text>
            <Text style={styles.timestampInside}>{formatTime(item.timestamp)}</Text>
          </View>
        </TouchableWithoutFeedback>
      </View>
    );
  };

  // getDateLabel ve groupMessagesWithDates fonksiyonlarını ekle:
  const getDateLabel = (timestamp) => {
    const today = new Date();
    const date = new Date(timestamp);
    const diff = today.setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0);

    if (diff === 0) return 'Bugün';
    if (diff === 86400000) return 'Dün';

    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

const groupMessagesWithDates = (msgs) => {
  const grouped = [];
  let lastDate = '';

  msgs.forEach((msg, index) => {
    const currentDate = getDateLabel(msg.timestamp);
    if (currentDate !== lastDate) {
      grouped.push({
        type: 'date',
        date: currentDate,
        key: `date-${msg.timestamp}-${index}`
      });
      lastDate = currentDate;
    }
    grouped.push({ ...msg, type: 'message', key: `${msg.timestamp}-${index}` });
  });

  return grouped;
};



  return (
    
  <SafeAreaView style={[styles.container ,{backgroundColor:backgroundRGB} ,{ paddingBottom: insets.bottom }]}>
    {/* Header */}
    <View style={[styles.header]}>
  <TouchableOpacity 
    onPress={() => navigation.goBack()} 
    style={styles.backButton}
  >
    <Ionicons name="arrow-back" size={24} color="#000" />
  </TouchableOpacity>

  {!searchMode ? (
    <>
      {/* Avatar ve Başlık */}
      <View style={styles.titleContainer}>
        {avatarUrl && (
          <Image 
            source={{ uri: avatarUrl }}
            style={styles.avatar}
          />
        )}
        {!avatarUrl && (
          <Image 
            source={require('../assets/profile.png')}
            style={styles.avatar}
          />
        )}
        <Text style={styles.headerTitle}>{formatRoomName(roomDisplayName)}</Text>
      </View>

      <TouchableOpacity 
        onPress={toggleSearchMode} 
        style={styles.searchButton}
        accessibilityLabel="Mesaj ara"
      >
        <MaterialIcons name="search" size={24} color="#000" />
      </TouchableOpacity>
    </>
  ) : (
    <>
      <TextInput
        style={styles.searchInput}
        placeholder="Mesaj ara..."
        autoFocus
        value={searchTerm}
        onChangeText={setSearchTerm}
        onSubmitEditing={performSearch}
        returnKeyType="search"
      />
      <TouchableOpacity 
        onPress={toggleSearchMode} 
        style={styles.cancelSearchButton}
      >
        <Text style={styles.cancelText}>Vazgeç</Text>
      </TouchableOpacity>
    </>
  )}
</View>


    {/* Arama Navigasyon Barı */}
    {searching && searchResults.length > 0 && (
      <View style={styles.searchNavBar}>
        <Text style={styles.searchResultsText}>
          {currentSearchIndex + 1}/{searchResults.length}
        </Text>
        
        <View style={styles.searchNavButtons}>
          <TouchableOpacity 
            onPress={() => navigateSearch('prev')}
            style={styles.navButton}
            disabled={searchResults.length <= 1}
          >
            <MaterialIcons 
              name="arrow-upward" 
              size={24} 
              color={searchResults.length > 1 ? "#000" : "#ccc"} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={() => navigateSearch('next')}
            style={styles.navButton}
            disabled={searchResults.length <= 1}
          >
            <MaterialIcons 
              name="arrow-downward" 
              size={24} 
              color={searchResults.length > 1 ? "#000" : "#ccc"} 
            />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          onPress={clearSearch}
          style={styles.closeSearchButton}
        >
          <MaterialIcons name="close" size={24} color="#000" />
        </TouchableOpacity>
      </View>
    )}

    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={0 } // Adjusted for safe area insets
    >
    <ImageBackground 
      source={backgroundImage ? { uri: backgroundImage } : null} 
      style={{ flex: 1 }} 
      resizeMode="cover"
    >
      {/*FlatList componentini şu şekilde değiştir:*/}
      <FlatList
        ref={flatListRef}
        data={groupMessagesWithDates(messages)}
        keyExtractor={(item) => item.key}
        renderItem={({ item, index }) => {
          if (item.type === 'date') {
            return (
              <View style={{ alignItems: 'center', marginVertical: 10 }}>
                <View style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <Text style={{ color: '#444', fontWeight: 'bold' }}>{item.date}</Text>
                </View>
              </View>
            );
          } else {
            return renderMessage({ item, index });
          }
        }}
        onContentSizeChange={() => {
          if (!initialScrollDone) {
            scrollToBottom();
            setInitialScrollDone(true);
          }
        }}
        onLayout={scrollToBottom}
      />
      </ImageBackground>

      {uploading && (
        <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={{ marginTop: 10, color: '#007bff' }}>Medya yükleniyor...</Text>
        </View>
      )}


      <View style={[styles.inputContainer]}>
        {/*medya butonlarını koşullu göster:*/}
        {!roomNameFull?.includes('Bluesky') && (
          <>
            <TouchableOpacity style={styles.mediaButton} onPress={() => pickMedia('image')}>
              <Text>🖼️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaButton} onPress={() => pickMedia('video')}>
              <Text>🎥</Text>
            </TouchableOpacity>
            {!recording ? (
              <TouchableOpacity onPress={startRecording} style={styles.recordButton}>
                <Text style={{ color: '#fff' }}>🎙️</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={stopRecording} style={[styles.recordButton, { backgroundColor: 'red' }]}>
                <Text style={{ color: '#fff' }}>⏹️</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TextInput
          placeholder="Mesaj yaz..."
          multiline
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          editable={!sending}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={sending}
          style={styles.sendButton}
          accessibilityLabel="Mesaj gönder"
        >
          <Text style={styles.sendButtonText}>Gönder</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>

    <Modal
      visible={mediaModalVisible}
      transparent
      animationType="fade"
      onRequestClose={closeMediaModal}
    >
      <View style={styles.modalBackground}>
        <View style={styles.modalContent}>
          {loadingMedia && <Progress.Bar progress={downloadProgress} width={200}  />}

          {!loadingMedia && mediaToShow && mediaToShow.type === 'm.image' && (
            <Image source={{ uri: mediaToShow.uri }} style={styles.modalImage} resizeMode="center" />
          )}

          {!loadingMedia && mediaToShow && mediaToShow.type === 'm.video' && (
            <Video
              ref={videoRef}
              source={{ uri: mediaToShow.uri }}
              style={styles.modalVideo}
              useNativeControls
              resizeMode="contain"
              shouldPlay
              onPlaybackStatusUpdate={status => {
                if (status.isLoaded) {
                  setVideoProgress(status.positionMillis);
                  setVideoDuration(status.durationMillis || 0);
                }
              }}
            />
            
          )}
          {(videoDuration > 0 && mediaToShow.type === 'm.video') && (
            <Text style={{ marginTop: 6, fontSize: 12, color: '#444' }}>
              {formatTimeSeconds(videoProgress)} / {formatTimeSeconds(videoDuration)}
            </Text>
          )}

          {!loadingMedia && mediaToShow && mediaToShow.type === 'm.audio' && (
            <AudioPlayer uri={mediaToShow.uri} />
          )}

          <Button title="Kapat" onPress={closeMediaModal} />
        </View>
      </View>
    </Modal>
  </SafeAreaView>

  );
};

const styles = StyleSheet.create({
  
  container: { flex: 1 },
  messageContainer: { marginVertical: 5, marginHorizontal: 10, maxWidth: '70%' },
  messageLeft: { alignSelf: 'flex-start' },
  messageRight: { alignSelf: 'flex-end' },
  bubble: { padding: 10, borderRadius: 10 },
  bubbleLeft: { 
    backgroundColor: '#eee',
    borderTopEndRadius: 10,
    borderBottomEndRadius: 10,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 0
  },
  bubbleRight: { 
    backgroundColor: '#0084ff',
    borderTopEndRadius: 10,
    borderBottomEndRadius: 0,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10
  },
  titleContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
  marginLeft: 8,
},
  searchMatchBubble: {
    backgroundColor: '#ffeb3b',
    borderColor: '#ffc107',
    borderWidth: 1,
  },
  messageText: { color: '#000' },
  image: { width: 200, height: 150, borderRadius: 10 },
  videoThumbnail: { width: 200, height: 150, borderRadius: 10, backgroundColor: '#000' },
  video: { width: 200, height: 150 },
  playButtonOverlay: {
    position: 'absolute',
    top: '32%',
    left: '40%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 20,
    padding: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatar: {
  width: 32,
  height: 32,
  borderRadius: 16,
  marginRight: 8,
},
  backButton: {
    marginRight: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 10,
  },
  searchButton: {
    padding: 5,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#eee',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
  },
  cancelSearchButton: {
    padding: 5,
  },
  cancelText: {
    color: '#0084ff',
    fontWeight: '500',
  },
  searchNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  searchResultsText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#666',
  },
  searchNavButtons: {
    flexDirection: 'row',
    marginRight: 20,
  },
  navButton: {
    marginHorizontal: 10,
  },
  closeSearchButton: {
    padding: 5,
  },
  audioPlayerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'orange',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 5,
    width: 250,
  },
  audioPlayPauseButton: {
    padding: 8,
    marginRight: 8,
  },
  audioSlider: {
    flex: 1,
    height: 40,
  },
  audioTimeText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#444',
    width: 80,
    textAlign: 'right',
  },
  timestamp: { fontSize: 10, color: 'white', marginTop: 5, textAlign: 'right' },
  inputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  mediaButton: { padding: 10 },
  recordButton: {
    padding: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
    marginHorizontal: 5,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 100,
    marginHorizontal: 5,
  },
  sendButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#0084ff',
    borderRadius: 20,
  },
  sendButtonText: { color: '#fff', fontWeight: 'bold' },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '100%',
    maxHeight: '100%',
    alignItems: 'center',
  },
  modalImage: {
    width: screenWidth * 0.9,
    height: screenHeight * 0.6,
    resizeMode: 'contain',
  },

  modalVideo: {
    width: screenWidth * 0.9,
    height: screenHeight * 0.6,
    resizeMode: 'contain',
  },
  timestampInside: {
    fontSize: 10,
    color: 'black',
    textAlign: 'right',
    marginTop: 4,
  },
  searchMatchBubble: {
    backgroundColor: '#ffeb3b',
    borderColor: '#ffc107',
    borderWidth: 1,
  },
  videoDurationText: {
    position: 'absolute',
    bottom: 6,
    left: 10,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 10,
    borderRadius: 4,
    overflow: 'hidden',
  },

});

export default ChatScreen;