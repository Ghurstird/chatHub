import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SessionContext = createContext();


export const SessionProvider = ({ children }) => {
  const [session, setSessionState] = useState(null);
  
  const setSession = async (data) => {
    setSessionState(data);
    if (data) {
      await AsyncStorage.setItem('session', JSON.stringify(data));
    } else {
      await AsyncStorage.removeItem('session');
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('session');
    setSessionState(null);
  };

  const loadSession = async () => {
    const saved = await AsyncStorage.getItem('session');
    if (saved) {
      setSessionState(JSON.parse(saved));
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  return (
    <SessionContext.Provider value={{ session, setSession, logout }}>
      {children}
    </SessionContext.Provider>
  );
};
