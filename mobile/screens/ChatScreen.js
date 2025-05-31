import React, { useContext, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  ToastAndroid,
  Platform,
  Alert,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SessionContext } from '../context/SessionContext';
import api from '../services/api';
import { WEBSOCKET_BASE_URL } from '../config/matrixConfig';
import * as Clipboard from 'expo-clipboard';

const handleCopy = (text) => {
  Clipboard.setStringAsync(text);
  if (Platform.OS === 'android') {
    ToastAndroid.show('Mesaj kopyalandı', ToastAndroid.SHORT);
  } else {
    Alert.alert('Kopyalandı', 'Mesaj panoya kopyalandı.');
  }
};

const formatDisplayName = (mxid) => {
  return mxid?.split(':')[0]?.replace('@', '') || 'Unknown';
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const ChatScreen = ({ route }) => {
  const { roomId, roomName} = route.params;
  const { session } = useContext(SessionContext);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const fetchMessages = async () => {
    try {
      const res = await api.get(`/messages/${encodeURIComponent(roomId)}`, {
        params: { userId: session.userId, accessToken: session.accessToken },
      });
      setMessages(res.data);
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Mesajlar alınamadı:', err.message);
    }
  };

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post('/sendMessage', {
        userId: session.userId,
        accessToken: session.accessToken,
        roomId,
        text,
      });
      setText('');
      scrollToBottom();
    } catch (err) {
      console.error('Mesaj gönderilemedi:', err.message);
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
      console.warn('Okundu işareti gönderilemedi:', err.message);
    }
  };

  
  useEffect(() => {
    fetchMessages().then(markAsRead);
    
    const ws = new WebSocket(WEBSOCKET_BASE_URL);
    ws.onopen = () => ws.send(JSON.stringify({ userId: session.userId }));

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'new_message' && data.roomId === roomId) {
        setMessages((prev) => {
          const alreadyExists = prev.some(
            (m) => m.timestamp === data.timestamp && m.sender === data.sender
          );
          if (alreadyExists) return prev;
          return [...prev, { sender: data.sender, text: data.text, timestamp: data.timestamp }];
        });
        scrollToBottom();
      }
    };

    return () => ws.close();
  }, [roomId]);

  const renderItem = ({ item }) => {
    console.log(item.sender);
    const isOwnMessage = item.sender === session.userId;
    return (
      <View style={[
        styles.messageContainer,
        isOwnMessage ? styles.messageRight : styles.messageLeft
      ]}>
        <Pressable onLongPress={() => handleCopy(item.text)}>
          <View style={[styles.bubble, isOwnMessage ? styles.bubbleRight : styles.bubbleLeft]}>
            {isOwnMessage ? <Text style={styles.senderName}>Ben</Text> : <Text style={styles.senderName}>{roomName}</Text>}
            <Text>{item.text}</Text>
            <Text style={styles.timestamp}>{formatTime(item.timestamp)}</Text>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={80}
      >
        {/* <TouchableWithoutFeedback onPress={Keyboard.dismiss}> */}
          <View style={styles.container}>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderItem}
              keyExtractor={(item, index) => `${item.timestamp}-${item.sender}-${index}`}
              contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
              onContentSizeChange={scrollToBottom}
              onLayout={scrollToBottom}
            />

            <View style={[styles.inputContainer]}>
              <TextInput
                style={styles.input}
                placeholder="Mesaj yaz..."
                value={text}
                onChangeText={setText}
              />
              <Button title="Gönder" onPress={handleSend} disabled={sending} />
            </View>
          </View>
        {/* </TouchableWithoutFeedback> */}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  messageContainer: {
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageLeft: {
    justifyContent: 'flex-start',
  },
  messageRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    minWidth: 75,
    width: '75%',
    padding: 10,
    borderRadius: 12,
  },
  bubbleLeft: {
    backgroundColor: '#e0e0e0',
    borderTopLeftRadius: 0,
  },
  bubbleRight: {
    backgroundColor: '#cce5ff',
    borderTopRightRadius: 0,
    alignSelf: "flex-end"
  },
  senderName: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 10,
    textAlign: 'right',
    marginTop: 4,
    color: '#555',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',

  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 6,
    marginRight: 8,
  },
});
