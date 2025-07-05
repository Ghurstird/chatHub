import React, { useContext, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Button,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { SessionContext } from '../context/SessionContext';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import Slider from '@react-native-community/slider';

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import pushApi from '../services/pushApi';


const PROFILE_IMAGE_KEY = 'profile_image_uri';
const THEME_KEY = 'theme_value'; // renk hex kodu veya dosya yolu

const ProfileScreen = ({ navigation }) => {
  const { session, logout } = useContext(SessionContext);
  const [platforms, setPlatforms] = useState({});
  const [imageUri, setImageUri] = useState(null);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const NOTIFICATION_PREF_KEY = 'notifications_enabled';
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFICATION_PREF_KEY).then(value => {
      setNotificationsEnabled(value !== 'false');
    });
  }, []);

  const toggleNotifications = async () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    await AsyncStorage.setItem(NOTIFICATION_PREF_KEY, String(newValue));

    if (!newValue) {
      // Bildirimleri kapat: sunucudan token'ı sil
      await pushApi.post('/save-token', { userId: session.userId, pushToken: null });
      Alert.alert('Bildirimler kapatıldı');
    } else {
      // Bildirimleri aç: izin iste ve token gönder
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('İzin Gerekli', 'Bildirimleri açmak için izne ihtiyacımız var.');
        return;
      }

      const token = await Notifications.getExpoPushTokenAsync();
      await pushApi.post('/save-token', { userId: session.userId, pushToken: token.data });
      Alert.alert('Bildirimler açıldı');
    }
  };

  const removeAvatar = async () => {
    try {
      await AsyncStorage.removeItem(PROFILE_IMAGE_KEY);
      setImageUri(null);
      Alert.alert('Avatar kaldırıldı');
    } catch (e) {
      console.error('Avatar kaldırma hatası:', e);
    }
  };



  // RGB renk seçimi için state
  const [red, setRed] = useState(0);
  const [green, setGreen] = useState(0);
  const [blue, setBlue] = useState(0);

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Oturumunuzu sonlandırmak istediğinizden emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Evet',
        style: 'destructive',
        onPress: () => {
          logout();
          navigation.replace('Login');
        },
      },
    ]);
  };

  const fetchAccounts = async () => {
    try {
      const res = await api.get(`/accounts/${encodeURIComponent(session.userId)}`);
      setPlatforms(res.data || {});
    } catch (err) {
      console.warn('Platformlar alınamadı:', err.message);
    }
  };

  const copyToClipboard = async (text) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopyalandı', 'Kullanıcı ID kopyalandı');
  };

  const loadImage = async () => {
    const savedUri = await AsyncStorage.getItem(PROFILE_IMAGE_KEY);
    if (savedUri) {
      setImageUri(savedUri);
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('İzin Gerekli', 'Galeriye erişim izni vermelisiniz.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedAsset = result.assets[0];
      const filename = selectedAsset.uri.split('/').pop();
      const newPath = FileSystem.documentDirectory + filename;

      try {
        await FileSystem.copyAsync({
          from: selectedAsset.uri,
          to: newPath,
        });

        await AsyncStorage.setItem(PROFILE_IMAGE_KEY, newPath);
        setImageUri(newPath);
      } catch (error) {
        console.error('Resim kaydedilemedi:', error);
      }
    }
  };

  // RGB'yi HEX'e çevirme fonksiyonu
  const rgbToHex = (r, g, b) => {
    const toHex = (c) => {
      const hex = c.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Sabit renk kaydet
  const saveColorTheme = async () => {
    const hexColor = rgbToHex(red, green, blue);
    try {
      await AsyncStorage.setItem(THEME_KEY, hexColor);
      console.log('Tema kaydedildi:', hexColor);
      Alert.alert('Tema kaydedildi', `Renk: ${hexColor}`);
      setThemeModalVisible(false);
    } catch (error) {
      console.error('Tema kaydedilemedi:', error);
    }
  };

  // Tema galeriden seçme fonksiyonu modal içinden çağrılacak
  const pickThemeImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('İzin Gerekli', 'Galeriye erişim izni vermelisiniz.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedAsset = result.assets[0];
      const filename = selectedAsset.uri.split('/').pop();
      const newPath = FileSystem.documentDirectory + 'theme_' + filename;

      try {
        await FileSystem.copyAsync({
          from: selectedAsset.uri,
          to: newPath,
        });

        await AsyncStorage.setItem(THEME_KEY, newPath);
        Alert.alert('Tema resmi kaydedildi');
        setThemeModalVisible(false);
      } catch (error) {
        console.error('Tema resmi kaydedilemedi:', error);
      }
    }
  };

  useEffect(() => {
    loadImage();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAccounts();
    }, [session.userId])
  );

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity onPress={pickImage}>
        <Image
          source={imageUri ? { uri: imageUri } : require('../assets/profile.png')}
          style={styles.avatar}
        />
      </TouchableOpacity>
      {imageUri && (
        <TouchableOpacity onPress={removeAvatar}>
          <Text style={{ color: 'red', textAlign: 'center', marginBottom: 10 }}>
            Avatarı Kaldır
          </Text>
        </TouchableOpacity>
      )}


      <Text style={styles.username}>{session.username}</Text>

      <TouchableOpacity onLongPress={() => copyToClipboard(session.userId)}>
        <Text style={styles.userId}>{session.userId}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Bağlı Hesaplar:</Text>
      {Object.entries(platforms).length === 0 ? (
        <Text style={styles.emptyText}>Hiçbir platform bağlı değil.</Text>
      ) : (
        Object.entries(platforms).map(([platform, username]) => (
          <Text key={platform} style={styles.platformItem}>
            • {platform}: {username}
          </Text>
        ))
      )}

      {/* Tema seçme butonu */}
      <TouchableOpacity style={styles.themeButton} onPress={() => setThemeModalVisible(true)}>
        <Text style={styles.buttonText}>Tema Seç</Text>
      </TouchableOpacity>
      
      {/* Bildirim Açma/Kapama */}
      <TouchableOpacity
        style={[styles.themeButton, {  backgroundColor: notificationsEnabled ? '#6c757d' : '#28a745' }]}
        onPress={toggleNotifications}
      >
        <Text style={styles.buttonText}>
          {notificationsEnabled ? 'Bildirimleri Kapat' : 'Bildirimleri Aç'}
        </Text>
      </TouchableOpacity>



      {/* Tema seçim modalı */}
      <Modal
        visible={themeModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 10 }}>Tema Seçimi</Text>

            <TouchableOpacity
              style={[styles.optionButton, { marginBottom: 10 }]}
              onPress={pickThemeImage}
            >
              <Text style={styles.optionButtonText}>Galeriden Seç</Text>
            </TouchableOpacity>

            <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 5 }}>Sabit Renk Oluştur</Text>

            {/* Renk sliderları + Anlık renk gösterimi ve Hex kodu */}
            <View style={styles.sliderRow}>
              <Text style={{ color: 'red', width: 30 }}>R: {red}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={255}
                step={1}
                minimumTrackTintColor="red"
                maximumTrackTintColor="#000"
                value={red}
                onValueChange={setRed}
              />
            </View>
            <View style={styles.sliderRow}>
              <Text style={{ color: 'green', width: 30 }}>G: {green}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={255}
                step={1}
                minimumTrackTintColor="green"
                maximumTrackTintColor="#000"
                value={green}
                onValueChange={setGreen}
              />
            </View>
            <View style={styles.sliderRow}>
              <Text style={{ color: 'blue', width: 30 }}>B: {blue}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={255}
                step={1}
                minimumTrackTintColor="blue"
                maximumTrackTintColor="#000"
                value={blue}
                onValueChange={setBlue}
              />
            </View>

            {/* Anlık renk kutusu ve hex kodu */}
            <View style={styles.colorPreviewRow}>
              <View
                style={[
                  styles.colorPreviewBox,
                  { backgroundColor: rgbToHex(red, green, blue) },
                ]}
              />
              <Text style={styles.hexCodeText}>{rgbToHex(red, green, blue)}</Text>
            </View>

            <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'space-around' }}>
              <Button title="İptal" onPress={() => setThemeModalVisible(false)} />
              <Button title="Kaydet" onPress={saveColorTheme} />
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ marginTop: 40 }}>
        <Button title="Çıkış Yap" color="red" onPress={handleLogout} />
      </View>
    </ScrollView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: { padding: 20, flex: 1 },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    marginBottom: 20,
    backgroundColor: '#eee',
  },
  username: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  userId: { fontSize: 12, textAlign: 'center', color: '#666', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 20 },
  platformItem: { fontSize: 14, marginTop: 4 },
  emptyText: { fontSize: 14, color: '#888', marginTop: 10 },
  themeButton: {
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    width: '90%',
    height: 420,
  },
  optionButton: {
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  optionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  slider: {
    flex: 1,
    marginLeft: 10,
  },
  colorPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  colorPreviewBox: {
    width: 40,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#000',
    marginRight: 10,
  },
  hexCodeText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
