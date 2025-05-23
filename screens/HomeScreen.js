// screens/HomeScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Button, Pressable} from 'react-native';
import { getToken, deleteToken, deleteUserId, getUserId } from '../utils/secureStore';
import axios from 'axios';
import baseUrl from '../utils/baseUrl';

const HomeScreen = ({ navigation }) => {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const BASE_URL = baseUrl();

    const fetchRooms = async () => {
        const token = await getToken();
        const userId = await getUserId()
        try {
            const res = await axios.get(`${BASE_URL}/_matrix/client/r0/sync`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
            });

            // 🔄 1. INVITES → JOIN
            const invitedRooms = res.data.rooms?.invite || {};
            for (const roomId of Object.keys(invitedRooms)) {
            try {
                await axios.post(`${BASE_URL}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/join`, {}, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
                });
                console.log("Joined room:", roomId);
            } catch (joinErr) {
                console.warn("Join failed for", roomId, joinErr.response?.data?.error || joinErr.message);
            }
            }

            // 🔄 2. Tekrar sync çek, joinedRooms al
            const refreshed = await axios.get(`${BASE_URL}/_matrix/client/r0/sync`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
            });

            const joinedRooms = refreshed.data.rooms?.join || {};
            const directRoomsMap = refreshed.data.account_data?.events?.find(ev => ev.type === "m.direct")?.content || {};

            // 🔍 Sadece birebir konuşma olan odaları al
            const directRoomIds = Object.values(directRoomsMap).flat();

            const roomList = Object.entries(joinedRooms)
                // .filter(([roomId]) => directRoomIds.includes(roomId))
                .map(([roomId, roomData]) => {
                    return { 
                        id: roomId, 
                        name: getRoomDisplayName(roomData, userId) 
                    };
                });

            setRooms(roomList);
        } catch (err) {
            console.error("Sync or join failed:", err);
        } finally {
            setLoading(false);
        }
    };

    const getRoomDisplayName = (roomData, myUserId) => {
        const stateEvents = roomData?.state?.events || [];

        // 1. Oda adı varsa onu al
        const nameEvent = stateEvents.find(ev => ev.type === "m.room.name");
        if (nameEvent?.content?.name) return nameEvent.content.name;

        // 2. canonical alias (örn: #genel:matrix.org) varsa onu al
        const aliasEvent = stateEvents.find(ev => ev.type === "m.room.canonical_alias");
        if (aliasEvent?.content?.alias) return aliasEvent.content.alias;

        // 3. m.room.member'dan diğer üyeleri bul
        const memberEvents = stateEvents.filter(ev => ev.type === "m.room.member");
        const otherMembers = memberEvents.filter(ev => ev.state_key !== myUserId);
        const joinedOthers = otherMembers.filter(ev => ev.content?.membership === "join");

        const getNameFrom = (member) => {
            const display = member?.content?.displayname;
            const userId = member?.state_key;

            if (display) return display;
            if (userId?.includes("telegram")) return "Telegram Bridge Bot";
            if (userId?.includes("google")) return "Google Chat bot";

            return userId || "Unnamed";
        };

        if (joinedOthers.length > 0) return getNameFrom(joinedOthers[0]);
        if (otherMembers.length > 0) return getNameFrom(otherMembers[0]);

        return "Bridge Bot";
    };





    const handleLogout = async () => {
        await deleteToken();
        await deleteUserId();
        navigation.replace("Login");
    };

    useEffect(() => {
        fetchRooms();
    }, []);

    const handleRoomPress = (room) => {
        navigation.navigate("Chat", {
            roomId: room.id,
            roomName: room.name
        });
    };

    const renderRoom = ({ item }) => (
        <Pressable onPress={() => handleRoomPress(item)}>
            <View style={styles.roomItem}>
            <Text style={styles.roomText}>{item.name}</Text>
            </View>
        </Pressable>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Your Conversations</Text>

            {loading ? (
                <ActivityIndicator size="large" />
            ) : rooms.length === 0 ? (
                <Text style={styles.noRoomsText}>No conversations found.</Text>
            ) : (
                <FlatList
                    data={rooms}
                    keyExtractor={item => item.id}
                    renderItem={renderRoom}
                    refreshing={loading}
                    onRefresh={fetchRooms}
                />
            )}

            <Button title="Logout" onPress={handleLogout} />
        </View>
    );
};




export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16
  },
  roomItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd'
  },
  roomText: {
    fontSize: 16
  },
  noRoomsText: {
    textAlign: 'center',
    fontSize: 16,
    color: 'gray',
    marginTop: 32
  }
});
