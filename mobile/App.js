import React, { useContext, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SessionProvider, SessionContext } from './context/SessionContext';
import { StatusBar, Alert, Platform } from 'react-native';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import RoomListScreen from './screens/RoomListScreen';
import ChatScreen from './screens/ChatScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BottomTabNavigator from './navigation/BottomTabNavigator';

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api from './services/api'; 
import pushApi from './services/pushApi';
import { navigationRef } from './navigation/NavigationService';


// Bildirim izin ve token alma
async function registerForPushNotificationsAsync() {
  console.log('🔁 registerForPushNotificationsAsync çalıştı');
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('🛑 Mevcut izin durumu:', existingStatus);

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      Alert.alert('Bildirim izni reddedildi');
      return;
    }

    try {
      const token = await Notifications.getExpoPushTokenAsync();
      console.log('📬 Token başarıyla alındı:', token);
      return token;
    } catch (err) {
      console.error('❌ Token alınamadı:', err);
      return null;
    }

    return token;
  } else {
    Alert.alert('Fiziksel cihaz gerekli');
    return null;
  }
}

const Stack = createNativeStackNavigator();

const MainNavigator = () => {
  const { session } = useContext(SessionContext);

  // Bildirim token al ve backend'e gönder (giriş yapılmışsa)
  useEffect(() => {
    registerForPushNotificationsAsync().then(async (token) => {
      console.log('📡 token:', token);
      if (token && session?.userId) {
        // optional: backend'e gönder
        await pushApi.post('/save-token', { userId: session.userId, pushToken: token.data });

      }
    });

    const subscription = Notifications.addNotificationReceivedListener(notification => {
      
    });

    return () => subscription.remove();
  }, [session?.userId]);

  return (
    <Stack.Navigator initialRouteName={session ? 'Home' : 'Login'}>
      <Stack.Screen name="Home" component={BottomTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Giriş Yap" }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: "Kayıt Ol" }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: "Sohbet", headerShown: false }} />
    </Stack.Navigator>
  );
};

export default function App() {
  
  useEffect(() => {
    // Arkaplanda / foreground’da tıklama
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const { roomId } = response.notification.request.content.data;
      if (roomId && navigationRef.isReady()) {
        navigationRef.navigate('Chat', { roomId });
        
      }
    });

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX, 
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return () => subscription.remove();
  }, []);

  return (
    <SessionProvider>
      <SafeAreaProvider>
        <NavigationContainer 
          ref={navigationRef}
          onReady={() => {
            Notifications.getLastNotificationResponseAsync().then(response => {
              if (response) {
                const { roomId } = response.notification.request.content.data;
                navigationRef.current?.navigate('Chat', { roomId });
              }
            });
          }}
        >
          <StatusBar barStyle={'dark-content'} backgroundColor="gray" />
          <MainNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </SessionProvider>
  );
}

