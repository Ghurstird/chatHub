import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import RoomListScreen from '../screens/RoomListScreen';
import AccountsScreen from '../screens/AccountsScreen';
import { Ionicons } from '@expo/vector-icons';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="RoomList"
        component={RoomListScreen}
        options={{
          title: 'Mesajlar',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-ellipses" size={size} color={color} />,
        }}
      />
      <Tab.Screen    
        name="Accounts"
        component={AccountsScreen}
        options={{
          title: 'Hesaplar',
          tabBarIcon: ({ color, size }) => <Ionicons name="apps" size={size} color={color} />,
        }}
      />
       <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profilim',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

export default BottomTabNavigator;
