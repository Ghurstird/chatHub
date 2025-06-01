import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SessionProvider, SessionContext } from './context/SessionContext';
import { StatusBar } from 'react-native';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import RoomListScreen from './screens/RoomListScreen';
import ChatScreen from './screens/ChatScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BottomTabNavigator from './navigation/BottomTabNavigator';



const Stack = createNativeStackNavigator();

const MainNavigator = () => {
  const { session } = useContext(SessionContext);
  
  return (
    <Stack.Navigator initialRouteName={session ? 'RoomList' : 'Login'}>
      <Stack.Screen name="Home" component={BottomTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Giriş Yap" }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: "Kayıt Ol" }} />
      {/* <Stack.Screen name="RoomList" component={RoomListScreen} options={{ title: 'Odalar' }} /> */}
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Mesajlar' }} />
    </Stack.Navigator>
  );
};

export default function App() {
  return (
    <SessionProvider>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar barStyle={'dark-content'} backgroundColor="gray" />
          <MainNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </SessionProvider>
  );
}
