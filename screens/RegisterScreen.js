// screens/RegisterScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Button, Alert } from 'react-native';
import axios from 'axios';
import { getToken } from '../utils/secureStore';
import baseUrl from '../utils/baseUrl';

const RegisterScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const BASE_URL = baseUrl();

  const handleRegister = async () => {
    if (password !== confirm) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    try {
      const res = await axios.post(`${BASE_URL}/_matrix/client/r0/register`, {
        username,
        password,
        auth: { type: "m.login.dummy" }
      });
  
      const { access_token, user_id } = res.data;
  
      const botUserIds = [
        "@telegrambot:tanmatrix.local",
        "@signalbot:tanmatrix.local"

      ];

      for (let botUserId of botUserIds) {
        await axios.post(
          `${BASE_URL}/_matrix/client/v3/createRoom`,
          {
            invite: [botUserId],
            is_direct: true
          },
          {
            headers: {
              Authorization: `Bearer ${access_token}`
            }
          }
        );
        
        console.log("DM created with", botUserId);
      }
      

      Alert.alert("Success", "Registration successful");
      navigation.navigate("Login");
    } catch (err) {
      Alert.alert("Registration failed", err.response?.data?.error || err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>
      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        secureTextEntry
        onChangeText={setConfirm}
      />
      <Button title="Register" onPress={handleRegister} />
    </View>
  );
};

export default RegisterScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    marginBottom: 32,
    textAlign: 'center',
    fontWeight: 'bold'
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    marginBottom: 16,
    borderRadius: 8,
  }
});
