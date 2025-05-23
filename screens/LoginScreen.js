// screens/LoginScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Button, Alert, Pressable } from 'react-native';
import axios from 'axios';
import { saveToken, saveUserId } from '../utils/secureStore';
import baseUrl from '../utils/baseUrl';

const LoginScreen = ({ navigation }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const BASE_URL = baseUrl();

    const handleLogin = async () => {
        try {
            const response = await axios.post(`${BASE_URL}/_matrix/client/r0/login`, {
                type: 'm.login.password',
                user: username,
                password: password
            });

            console.log("Access token:", response.data.access_token);

            

            // TODO: Save token to context or asyncStorage
            await saveToken(response.data.access_token);
            await saveUserId(response.data.user_id);
            Alert.alert("Success", "Login successful");
            navigation.navigate("Home");

        } catch (err) {
            Alert.alert("Login failed", err.response?.data?.error || err.message);
        }
    };

  return (
    <View style={styles.container}>
        <Text style={styles.title}>Matrix Login</Text>
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
        <Button title="Login" onPress={handleLogin} />
        <Pressable onPress={() => navigation.navigate("Register")}>
            <Text style={styles.registerLink}>Don't have an account? Register here</Text>
        </Pressable>
    </View>
  );
};

export default LoginScreen;

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
    },
    registerLink: {
        marginTop: 16,
        color: '#007bff',
        textAlign: 'center',
        textDecorationLine: 'underline',
        fontWeight: 'bold'
    }   
});
