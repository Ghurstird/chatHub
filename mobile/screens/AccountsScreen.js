// AccountsScreen.js
import React, { useContext, useState, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { SessionContext } from '../context/SessionContext';
import api from '../services/api';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from "@react-navigation/native";
import { WebView } from 'react-native-webview';
import { TextInputMask } from 'react-native-masked-text';


// Yeni eklenen import:
import CookieManager from '@react-native-cookies/cookies';

const PLATFORMS = [
  { name: 'WhatsApp', icon: require('../assets/whatsapp.png'), key: 'whatsapp' },
  { name: 'Instagram', icon: require('../assets/instagram.png'), key: 'instagram' },
  { name: 'Twitter', icon: require('../assets/twitter.png'), key: 'twitter' },
  { name: 'Telegram', icon: require('../assets/telegram.png'), key: 'telegram' },
  { name: 'Bluesky', icon: require('../assets/bluesky.png'), key: 'bluesky' },
];

const AccountsScreen = () => {
  const { session  } = useContext(SessionContext);

  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Ortak state’ler
  const [loading, setLoading] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState({});
  const [logoutLoadingKey, setLogoutLoadingKey] = useState(null);
  const [webviewVisible, setWebviewVisible] = useState(false);

  // WhatsApp için
  const [step, setStep] = useState(1);           // Hem WhatsApp hem Telegram’da kullanacağız
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');

  // Bluesky için
  const [blueskyUsername, setBlueskyUsername] = useState('');
  const [blueskyPassword, setBlueskyPassword] = useState('');

  // Telegram için
  const [telegramPhone, setTelegramPhone] = useState('');
  const [telegramCode, setTelegramCode] = useState('');

  // Twitter için
  const [twitterLoading, setTwitterLoading] = useState(false);
  const [twitterLoggedIn, setTwitterLoggedIn] = useState(false);

  // Instagram için
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [instagramLoggedIn, setInstagramLoggedIn] = useState(false);



  // Modal açılınca tüm geçici alanları temizleyelim
  const openModal = (platform) => {
    setSelectedPlatform(platform);
    if (platform === 'twitter' || platform === "instagram") {
      setWebviewVisible(true);
      return;
    }
    
    setStep(1);
    setPhoneNumber('');
    setCode('');
    setBlueskyUsername('');
    setBlueskyPassword('');
    setTelegramPhone('');
    setTelegramCode('');
    setModalVisible(true);
  };
  

  const handleLongPress = async (text) => {
    await Clipboard.setStringAsync(text);
  };

  // Hesap listesi çekme
  const fetchAccounts = async () => {
    try {
      const res = await api.get(`/accounts/${encodeURIComponent(session.userId)}`);
      const map = {};
      Object.entries(res.data).forEach(([platform, username]) => {
        map[platform] = username;
      });
      setConnectedAccounts(map);
      console.log(connectedAccounts);
    } catch (err) {
      console.warn('Hesaplar alınamadı:', err.message);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
    }, [session.userId])
  );

  // ---------------------
  // ÇIKIŞ (Logout) İŞLEMİ
  // ---------------------
  const handleLogout = (platformKey, platformUsername) => {
    Alert.alert(
      `${platformUsername} hesabından çıkış`,
      'Bu hesaptan çıkış yapmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Devam',
          style: 'destructive',
          onPress: async () => {
            setLogoutLoadingKey(platformKey);
            try {
              const res = await api.post(`/platform/${platformKey}/logout`, {
                userId: session.userId,
                accessToken: session.accessToken,
              });

              if (res.data.success) {
                Alert.alert("✅ Başarılı", `${platformKey} hesabınızdan çıkış yapıldı.`);
                setConnectedAccounts(prev => {
                  const updated = { ...prev };
                  delete updated[platformKey];
                  return updated;
                });
              } else {
                Alert.alert("❌ Başarısız", "Çıkış yapılamadı.");
              }
            } catch (err) {
              Alert.alert("❌ Hata", err.response?.data?.error || err.message);
            } finally {
              setLogoutLoadingKey(null);
            }
          }
        }
      ]
    );
  };

  const isValidPhoneNumber = (number) => {
    const cleaned = number.replace(/\s/g, ''); // boşlukları sil
    return /^\+905\d{9}$/.test(cleaned);
  };


  // ---------------------
  // WHATSAPP BAĞLAMA (2 adımdan sonra kod gösterme)
  // ---------------------
  const handleWhatsappConnect = async () => {
    setLoading(true);
    if (!isValidPhoneNumber(phoneNumber)) {
      Alert.alert("Geçersiz Numara", "Lütfen geçerli bir numara girin: +90 5XX XXX XX XX");
      setLoading(false)
      return;
    }
    
    try {
      const res = await api.post('/platform/whatsapp/init', {
        userId: session.userId,
        accessToken: session.accessToken,
        phoneNumber,
      });
      // Bot’tan gelen pairing kodu
      setCode(res.data.code);
      setStep(2);
    } catch (err) {
      Alert.alert('Başarısız', err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------
  // BLUESKY BAĞLAMA
  // ---------------------
  const handleBlueskyConnect = async () => {
    setLoading(true);
    try {
      const res = await api.post('/platform/bluesky/init', {
        userId: session.userId,
        accessToken: session.accessToken,
        username: blueskyUsername,
        password: blueskyPassword,
      });
      Alert.alert("✅ Başarılı", "Bluesky hesabı eklendi");
      setModalVisible(false);
      await fetchAccounts();
    } catch (err) {
      Alert.alert("❌ Hata", err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------
  // TELEGRAM BAĞLAMA (2 aşama: telefon → kod)
  // ---------------------
  const formattedPhone = telegramPhone.replace(/\s/g, '');


  const handleTelegramStep1 = async () => {
    setLoading(true);
    if (!isValidPhoneNumber(telegramPhone)) {
      Alert.alert("Geçersiz Numara", "Lütfen geçerli bir numara girin: +90 5XX XXX XX XX");
      setLoading(false)
      return;
    }
    try {
      await api.post('/platform/telegram/init', {
        userId: session.userId,
        accessToken: session.accessToken,
        phone: formattedPhone,
      });
      setStep(2);
    } catch (err) {
      Alert.alert('Başarısız', err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramStep2 = async () => {
    setLoading(true);
    try {
      const res = await api.post('/platform/telegram/verify', {
        userId: session.userId,
        accessToken: session.accessToken,
        code: telegramCode,
      });
      if (res.data.success) {
        Alert.alert("✅ Başarılı", `Telegram hesabı eklendi`);
        setModalVisible(false);
        await fetchAccounts();
      } else {
        Alert.alert("❌ Başarısız", "Kod doğrulanamadı.");
      }
    } catch (err) {
      Alert.alert('❌ Hata', err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------
  // RENDER
  // ---------------------
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
            logoutLoadingKey === platform.key ? (
              <ActivityIndicator size="small" color="#ff4444" />
            ) : (
              <TouchableOpacity
                style={[styles.button, { backgroundColor: 'red' }]}
                onPress={() => handleLogout(platform.key, connectedAccounts[platform.key])}
              >
                <Text style={styles.buttonText}>Çıkış Yap</Text>
              </TouchableOpacity>
            )
          ) : (
            <TouchableOpacity
              style={styles.button}
              onPress={() => openModal(platform.key)}
            >
              <Text style={styles.buttonText}>Hesap Ekle</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/*  WHATSAPP MODAL  */}
      {selectedPlatform === 'whatsapp' && (
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={styles.modalBox}>
              {step === 1 ? (
                <>
                  <Text style={styles.modalTitle}>Telefon Numaranızı Girin</Text>
                  <TextInputMask
                    type={'custom'}
                    options={{
                      mask: '+90 999 999 99 99'
                    }}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="numeric"
                    placeholder="+90 5__ ___ __ __"
                    placeholderTextColor="#888"
                    style={{
                      borderWidth: 1,
                      borderColor: '#ccc',
                      borderRadius: 10,
                      padding: 10,
                      marginVertical: 10,
                      fontSize: 16,
                      color: '#000',
                    }}
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
                  <Pressable onLongPress={() => handleLongPress(code)}>
                    <Text style={styles.codeBox}>{code}</Text>
                  </Pressable>
                  <Button title="Tamam" color="blue" onPress={() => setModalVisible(false)} />
                </>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/*  BLUESKY MODAL  */}
      {selectedPlatform === 'bluesky' && (
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Bluesky Bilgilerini Girin</Text>
              <TextInput
                placeholder="Kullanıcı Adı (örnek: test.bsky.social)"
                placeholderTextColor="#888"
                value={blueskyUsername}
                onChangeText={setBlueskyUsername}
                style={styles.input}
              />
              <TextInput
                placeholder="Şifre"
                placeholderTextColor="#888"
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

      {/*  TELEGRAM MODAL  */}
      {selectedPlatform === 'telegram' && (
        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={styles.modalBox}>
              {step === 1 ? (
                <>
                  <Text style={styles.modalTitle}>Telegram Telefon Numaranızı Girin</Text>
                  <TextInputMask
                    type={'custom'}
                    options={{
                      mask: '+90 999 999 99 99'
                    }}
                    value={telegramPhone}
                    onChangeText={setTelegramPhone}
                    keyboardType="numeric"
                    placeholder="+90 5__ ___ __ __"
                    placeholderTextColor="#888"
                    style={{
                      borderWidth: 1,
                      borderColor: '#ccc',
                      borderRadius: 10,
                      padding: 10,
                      marginVertical: 10,
                      fontSize: 16,
                      color: '#000',
                    }}
                  />
                  {loading ? (
                    <ActivityIndicator size="large" color="#007bff" style={{ marginVertical: 12 }} />
                  ) : (
                    <Button title="Devam" onPress={handleTelegramStep1} />
                  )}
                  <Button title="İptal" color="red" onPress={() => setModalVisible(false)} />
                </>
              ) : (
                <>
                  <Text style={styles.modalTitle}>Telegram’dan Gelen Kodu Girin</Text>
                  <TextInput
                    placeholder="Örnek: 23417"
                    placeholderTextColor="#888"
                    style={styles.input}
                    value={telegramCode}
                    onChangeText={setTelegramCode}
                    keyboardType="number-pad"
                  />
                  {loading ? (
                    <ActivityIndicator size="large" color="#007bff" style={{ marginVertical: 12 }} />
                  ) : (
                    <Button title="Doğrula" onPress={handleTelegramStep2} />
                  )}
                  <Button title="İptal" color="red" onPress={() => setModalVisible(false)} />
                </>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* TWITTER MODAL */}
      {selectedPlatform === 'twitter' && webviewVisible && (
        <Modal visible animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={[styles.modalBox, { height: '100%', width: "100%" }]}>
              <Text style={styles.modalTitle}>X.com’da Giriş Yapın</Text>
              <WebView
                source={{ uri: 'https://x.com/login' }}
                incognito
                style={{ flex: 1, marginBottom: 12 }}
                onNavigationStateChange={async (navState) => {
                  if (twitterLoggedIn) return; // Zaten giriş yapılmışsa tekrar deneme

                  if (navState.url.startsWith('https://x.com/')) {
                    setTwitterLoading(true);
                    try {
                      const cookies = await CookieManager.get('https://x.com');
                      const ct0 = cookies.ct0?.value;
                      const auth_token = cookies.auth_token?.value;
                      if (ct0 && auth_token) {
                        setTwitterLoggedIn(true); // Burada flag'i set et
                        const cookieJSON = { ct0, auth_token };
                        const res = await api.post('/platform/twitter/init', {
                          userId: session.userId,
                          accessToken: session.accessToken,
                          cookies: cookieJSON
                        });
                        if (res.data.success) {
                          Alert.alert('✅ Başarılı', `Twitter: ${res.data.username}`);
                          setWebviewVisible(false);
                          await fetchAccounts();
                        } else {
                          Alert.alert('❌ Hata', res.data.error || 'Bağlanılamadı.');
                        }
                      }
                    } catch (err) {
                      console.warn('Cookie fetch hatası:', err.message);
                    } finally {
                      setTwitterLoading(false);
                    }
                  }
                }}

              />
              {twitterLoading && (
                <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#1DA1F2" />
                </View>
              )}
              <Button
                title="İptal"
                color="red"
                onPress={() => {
                  setWebviewVisible(false);
                  setSelectedPlatform(null);
                }}
              />
            </View>
          </View>
        </Modal>
      )}

      {selectedPlatform === 'instagram' && webviewVisible && (
        <Modal visible animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <View style={[styles.modalBox, { height: '100%', width: "100%" }]}>
              <Text style={styles.modalTitle}>Instagram’da Giriş Yapın</Text>
              <WebView
                source={{ uri: 'https://www.instagram.com/accounts/login/' }}
                incognito
                style={{ flex: 1, marginBottom: 12 }}
                onNavigationStateChange={async (navState) => {
                  if (instagramLoggedIn) return; // Daha önce başarılı giriş varsa tekrar deneme

                  if (navState.url.startsWith('https://www.instagram.com')) {
                    setInstagramLoading(true);
                    try {
                      const cookies = await CookieManager.get('https://www.instagram.com');
                      const {
                        sessionid, csrftoken, mid, ig_did, ds_user_id
                      } = cookies;

                      if (sessionid?.value && csrftoken?.value && mid?.value && ig_did?.value && ds_user_id?.value) {
                        setInstagramLoggedIn(true); // Tek seferlik çalışsın diye flag'i aktif et
                        const cookieJSON = {
                          sessionid: sessionid.value,
                          csrftoken: csrftoken.value,
                          mid: mid.value,
                          ig_did: ig_did.value,
                          ds_user_id: ds_user_id.value,
                        };

                        const res = await api.post('/platform/instagram/init', {
                          userId: session.userId,
                          accessToken: session.accessToken,
                          cookies: cookieJSON,
                        });

                        if (res.data.success) {
                          Alert.alert('✅ Başarılı', `Instagram: ${res.data.username}`);
                          setWebviewVisible(false);
                          await fetchAccounts();
                        } else {
                          Alert.alert('❌ Hata', res.data.error || 'Bağlanılamadı.');
                        }
                      }
                    } catch (err) {
                      console.warn('Instagram cookie fetch hatası:', err.message);
                    } finally {
                      setInstagramLoading(false);
                    }
                  }
                }}

              />
              {instagramLoading && (
                <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#C13584" />
                </View>
              )}
              <Button
                title="İptal"
                color="red"
                onPress={() => {
                  setWebviewVisible(false);
                  setSelectedPlatform(null);
                }}
              />
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
    padding: 10
  },
  modalBox: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 10
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
    color: "black"
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
  twitterLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    zIndex: 10,
  },
  twitterLoadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#1DA1F2',
  },
});
