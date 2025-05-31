// ✅ LoginScreen.js (username + password session'a kaydedilir)
import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SessionContext } from '../context/SessionContext';
import api from '../services/api';

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { setSession } = useContext(SessionContext);

  const handleLogin = async () => {
    try {
      const res = await api.post('/login', { username, password });
      setSession({ ...res.data, username, password });
      Alert.alert('Giriş Yapma Başarılı!');
      navigation.replace('RoomList');
    } catch (err) {
      Alert.alert('Hata', err.response?.data?.error || err.message);
    }
  };

  return (
    <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
    <View style={styles.container}>
      <Image source={require('../assets/logo.png')} style={{width: 250, height: 250, resizeMode: 'contain'}}/>
      <View style={{width: "100%"}}>
        <View>
          <TextInput placeholder="Kullanıcı Adı" style={styles.input} onChangeText={setUsername} value={username}/>
          <TextInput placeholder="Şifre" style={styles.input} secureTextEntry onChangeText={setPassword} value={password} />
        </View>
        <View>
          <Button title="Giriş Yap" onPress={handleLogin} />
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
