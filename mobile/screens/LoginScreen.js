// ✅ LoginScreen.js (username + password session'a kaydedilir)
import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ActivityIndicator} from 'react-native';
import { SessionContext } from '../context/SessionContext';
import api from '../services/api';
import { Keyboard } from 'react-native'; // en üstte ekle

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { setSession } = useContext(SessionContext);
  const [loading, setLoading] = useState(false);


  const handleLogin = async () => {
    Keyboard.dismiss(); // 🧩 KLAVYEYİ KAPAT
    setLoading(true);
    try {
      const res = await api.post('/login', { username, password });
      setSession({ ...res.data, username, password });
      navigation.replace('Home');

    } catch (err) {
      Alert.alert('Hata', err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 100}
    >
    <View style={styles.container}>
      <Image source={require('../assets/logo.png')} style={{width: 250, height: 250, resizeMode: 'contain'}}/>
      <View style={{width: "100%"}}>
        <View>
          <TextInput placeholder="Kullanıcı Adı" placeholderTextColor={'#888'} style={styles.input} onChangeText={setUsername} value={username} color={'#000'}/>
          <TextInput placeholder="Şifre" placeholderTextColor={'#888'} style={styles.input} secureTextEntry onChangeText={setPassword} value={password} color={'#000'} />
        </View>
        <View>
          {loading ? (
            <ActivityIndicator size="large" color="#007bff" />
          ) : (
            <Button title="Giriş Yap" onPress={handleLogin} />
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.replace('Register')}>
          <Text style={styles.linkText}>
            Hesabın yok mu? <Text style={styles.linkHighlight}>O zaman kayıt ol</Text>
          </Text>
        </TouchableOpacity>
      </View>  
    </View>
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, alignItems: "center", gap: 75,},
  label: { fontSize: 16, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
    width: "100%"
  },
  linkText: {
    marginTop: 20,
    textAlign: 'center',
    color: '#444',
  },
  linkHighlight: {
    color: '#007bff',
    textDecorationLine: 'underline',
  },
});
