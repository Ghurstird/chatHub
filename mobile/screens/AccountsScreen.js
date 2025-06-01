import React, { useContext, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
  TextInput,
  Button,
  Alert,
  Pressable,
  Platform,
  ToastAndroid,
  ActivityIndicator
} from 'react-native';
import { SessionContext } from '../context/SessionContext';
import api from '../services/api';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from "@react-navigation/native"

const PLATFORMS = [
  { name: 'WhatsApp', icon: require('../assets/whatsapp.png'), key: 'whatsapp' },
  { name: 'Instagram', icon: require('../assets/instagram.png'), key: 'instagram' },
  { name: 'Facebook', icon: require('../assets/facebook.png'), key: 'facebook' },
  { name: 'Twitter', icon: require('../assets/twitter.png'), key: 'twitter' },
  { name: 'Telegram', icon: require('../assets/telegram.png'), key: 'telegram' },
  { name: 'Bluesky', icon: require('../assets/bluesky.png'), key: 'bluesky' },
];

const AccountsScreen = () => {
  const { session } = useContext(SessionContext);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [step, setStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [connectedAccounts, setConnectedAccounts] = useState({});
  const [blueskyUsername, setBlueskyUsername] = useState('');
  const [blueskyPassword, setBlueskyPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const openModal = (platform) => {
    setSelectedPlatform(platform);
    setStep(1);
    setPhoneNumber('');
    setCode('');
    setBlueskyUsername('');
    setBlueskyPassword('');
    setModalVisible(true);
  };

  const handleLongPress = async (text) => {
    await Clipboard.setStringAsync(text);
  };

  const handleLogout = async (platformKey) => {
    try {
      const res = await api.post(`/platform/${platformKey}/logout`, {
        userId: session.userId,
        accessToken: session.accessToken,
      });

      if (res.data.success) {
        Alert.alert("✅ Başarılı", `${platformKey} hesabınızdan çıkış yapıldı.`);
        setConnectedAccounts((prev) => {
          const updated = { ...prev };
          delete updated[platformKey];
          return updated;
        });
      } else {
        Alert.alert("❌ Başarısız", "Çıkış yapılamadı.");
      }
    } catch (err) {
      Alert.alert("❌ Hata", err.response?.data?.error || err.message);
    }
  };

  const handleWhatsappConnect = async () => {
    setLoading(true); // <-- Eksik olan satır
    try {
      const res = await api.post('/platform/whatsapp/init', {
        userId: session.userId,
        accessToken: session.accessToken,
        phoneNumber,
      });
      setCode(res.data.code);
      setStep(2);
    } catch (err) {
      Alert.alert('Başarısız', err.response?.data?.error || err.message);
    } finally {
      setLoading(false); // <-- Eksik olan satır
    }
  };

  const handleBlueskyConnect = async () => {
    setLoading(true); // <-- Eksik olan satır
    try {
      const res = await api.post('/platform/bluesky/init', {
        userId: session.userId,
        accessToken: session.accessToken,
        username: blueskyUsername,
        password: blueskyPassword,
      });
      Alert.alert("✅ Başarılı", "Bluesky hesabı eklendi");
      setModalVisible(false);
      await fetchAccounts(); // burada fetchAccounts1 değil, doğru fonksiyon fetchAccounts
    } catch (err) {
      Alert.alert("❌ Hata", err.response?.data?.error || err.message);
    } finally {
      setLoading(false); // <-- Eksik olan satır
    }
  };

  const fetchAccounts = async () => {
        try {
          const res = await api.get(`/accounts/${encodeURIComponent(session.userId)}`);
          const map = {};
          Object.entries(res.data).forEach(([platform, username]) => {
            map[platform] = username;
          });
          setConnectedAccounts(map);
        } catch (err) {
          console.warn('Hesaplar alınamadı:', err.message);
        }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchAccounts();
    }, [session.userId])
  );

  return (
    <ScrollView style={styles.container}>
      {PLATFORMS.map(platform => (
        <View key={platform.key} style={styles.platformItem}>
          <Image source={platform.icon} style={styles.icon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {platform.name}
              {connectedAccounts[platform.key] && ` (${connectedAccounts[platform.key]})`}
            </Text>

          </View>
          {connectedAccounts[platform.key] ? (
            <TouchableOpacity style={[styles.button, { backgroundColor: 'red' }]} onPress={() => handleLogout(platform.key)}>
              <Text style={styles.buttonText}>Çıkış Yap</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.button} onPress={() => openModal(platform.key)}>
              <Text style={styles.buttonText}>Hesap Ekle</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Modal (şimdilik sadece WhatsApp için aktif) */}
      {selectedPlatform === 'whatsapp' && (
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={styles.modalBox}>
              {step === 1 ? (
                <>
                  <Text style={styles.modalTitle}>Telefon Numaranızı Girin</Text>
                  <TextInput
                    placeholder="+905xxxxxxxxx"
                    style={styles.input}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                  />
                  {loading ? (
                    <ActivityIndicator size="large" color="#007bff" style={{ marginVertical: 12 }} />
                  ) : (
                    <Button title="Bağlan" onPress={handleWhatsappConnect} />
                  )}
                  <Button title="İptal" color="red" onPress={() => setModalVisible(false)} />
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>WhatsApp uygulamasına bu kodu girin:</Text>
                  <Pressable onLongPress={() => handleLongPress(code)}><Text style={styles.codeBox}>{code}</Text></Pressable>
                  <Button title="Tamam" color="blue" onPress={() => setModalVisible(false)} />
                </>
              )}
              
            </View>
          </View>
        </Modal>
      )}
      {selectedPlatform === 'bluesky' && (
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Bluesky Bilgilerini Girin</Text>
              <TextInput
                placeholder="Kullanıcı Adı (örnek: test.bsky.social)"
                value={blueskyUsername}
                onChangeText={setBlueskyUsername}
                style={styles.input}
              />
              <TextInput
                placeholder="Şifre"
                value={blueskyPassword}
                onChangeText={setBlueskyPassword}
                style={styles.input}
                secureTextEntry
              />
              {loading ? (
                <ActivityIndicator size="large" color="#007bff" style={{ marginVertical: 12 }} />
              ) : (
                <Button title="Bağlan" onPress={handleBlueskyConnect} />
              )}
              <Button title="İptal" color="red" onPress={() => setModalVisible(false)} />
              
            </View>
          </View>
        </Modal>
      )}

    </ScrollView>
  );
};

export default AccountsScreen;

const styles = StyleSheet.create({
  container: { padding: 16 },
  platformItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#ddd',
    paddingBottom: 12,
  },
  icon: { width: 36, height: 36, resizeMode: 'contain', marginRight: 12 },
  name: { fontSize: 16, fontWeight: 'bold' },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 24,
  },
  modalBox: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  codeBox: {
    backgroundColor: '#f2f2f2',
    padding: 12,
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 12,
    textAlign: 'center',
    borderRadius: 6,
  },
});
