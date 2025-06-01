import { Button, StyleSheet, Text, View } from 'react-native'
import React, { useContext } from 'react'
import { SessionContext } from '../context/SessionContext';

const ProfileScreen = ({ navigation }) => {
    const { session, setSession, logout } = useContext(SessionContext);
    const handleLogout = () => {
        logout();
        navigation.replace('Login');
    };

  return (
    <View>
      <Text>ProfileScreen</Text>
      <Button title="Çıkış Yap" onPress={handleLogout} color="red" />
    </View>
  )
}

export default ProfileScreen

const styles = StyleSheet.create({})