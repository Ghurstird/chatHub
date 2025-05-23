// screens/ChatScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TextInput, Button } from 'react-native';

import axios from 'axios';
import { getToken, getUserId } from '../utils/secureStore';
import baseUrl from '../utils/baseUrl';

const ChatScreen = ({ route }) => {
  const { roomId, roomName } = route.params;
  const [messages, setMessages] = useState([]);
  const [myUserId, setMyUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roomMembers, setRoomMembers] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const BASE_URL = baseUrl();

  useEffect(() => {
    const init = async () => {
      const userId = await getUserId();
      setMyUserId(userId);
      fetchMessages(myUserId);
    };
    init();
  }, []);

  

const fetchMessages = async () => {
    const token = await getToken();
    try {
      const messagesRes = await axios.get(
        `${BASE_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=50`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const stateRes = await axios.get(
        `${BASE_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const memberEvents = stateRes.data.filter(ev => ev.type === "m.room.member");
      setRoomMembers(memberEvents);

      const events = messagesRes.data.chunk.filter(ev => ev.type === "m.room.message");
      setMessages(events.reverse());

    } catch (err) {
      console.error("Fetch messages error:", err.message);
    } finally {
      setLoading(false);
    }
};




  useEffect(() => {
    fetchMessages();
  }, []);

  const getDisplayName = (userId) => {
    if (userId === myUserId) return "You";

    const member = roomMembers.find(ev => ev.state_key === userId);
    return member?.content?.displayname || userId;
  };

  const handleSendMessage = async () => {
  if (!newMessage.trim()) return;

  setSending(true);
  const token = await getToken();

  try {
    // emin olmak için önce odaya join ol
    await axios.post(
      `${BASE_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/join`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    // sonra mesaj gönder
    await axios.put(
      `${BASE_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${Date.now()}`,
      {
        msgtype: "m.text",
        body: newMessage
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    setNewMessage("");
    fetchMessages(); // yeniden mesajları çek
  } catch (err) {
    console.error("Send message error:", err.message);
  } finally {
    setSending(false);
  }
};





  const renderItem = ({ item }) => {
    const isMe = item.sender === myUserId;
  
    return (
      <View
        style={[
          styles.messageContainer,
          isMe ? styles.myMessage : styles.otherMessage
        ]}
      >
        <Text style={styles.senderText}>
          {getDisplayName(item.sender)}
        </Text>
        <View style={styles.messageBubble}>
          <Text style={styles.messageText}>{item.content.body}</Text>
        </View>

      </View>
      
    );
  };


  return (
    <View style={styles.container}>
      <Text style={styles.header}>{roomName}</Text>
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <FlatList
          data={messages}
          keyExtractor={item => item.event_id}
          renderItem={renderItem}
        />
      )}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={newMessage}
          onChangeText={setNewMessage}
          editable={!sending}
        />
        <Button title="Send" onPress={handleSendMessage} disabled={!newMessage.trim() || sending} />
      </View>

    </View>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 10,
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  messageContainer: {
    marginVertical: 6,
    maxWidth: "80%",
  },
  myMessage: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  otherMessage: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  senderText: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  messageBubble: {
    backgroundColor: "#e1ffc7",
    padding: 10,
    borderRadius: 12,
  },
  messageText: {
    fontSize: 16,
    color: "#000"
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: "#fff",
  }

});

