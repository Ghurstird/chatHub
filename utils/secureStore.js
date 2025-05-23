// utils/secureStore.js
import * as SecureStore from 'expo-secure-store';

export async function saveToken(token) {
  await SecureStore.setItemAsync('matrix_token', token);
}

export async function getToken() {
  return await SecureStore.getItemAsync('matrix_token');
}

export async function deleteToken() {
  await SecureStore.deleteItemAsync('matrix_token');
}

export async function saveUserId(userId) {
  await SecureStore.setItemAsync('user_id', userId);
}

export async function getUserId() {
  return await SecureStore.getItemAsync('user_id');
}

export async function deleteUserId() {
  await SecureStore.deleteItemAsync('user_id');
}
