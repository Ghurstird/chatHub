import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SessionContext } from '../context/SessionContext';
import api from '../services/api';

const RegisterScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { setSession } = useContext(SessionContext);
  const [loading, setLoading] = useState(false);


  const handleRegister = async () => {
    setLoading(true);
    try {
      const res = await api.post('/register', { username, password });
      setSession(res.data);
      Alert.alert("Kayıt olma işlemi başarılı !")
      navigation.replace('Login');
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
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
    <View style={styles.container}>
      <Image source={require('../assets/logo.png')} style={{width: 250, height: 250, resizeMode: 'contain'}}/>

      <View style={{width: "100%"}}>
        <TextInput placeholder='Kullanıcı Adı' style={styles.input} onChangeText={setUsername} />
        <TextInput placeholder="Şifre" style={styles.input} secureTextEntry onChangeText={setPassword} />
        {loading ? (
          <ActivityIndicator size="large" color="#007bff" />
        ) : (
          <Button title="Kayıt Ol" onPress={handleRegister} />
        )}
        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={styles.linkText}>
            Zaten hesabın var mı? <Text style={styles.linkHighlight}>O zaman giriş yap</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
    </KeyboardAvoidingView>
  );
};

export default RegisterScreen;

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, alignItems: "center", gap: 75},
  label: { fontSize: 16, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
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
