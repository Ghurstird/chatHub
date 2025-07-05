// pushApi.js
import axios from 'axios';

import { API_BASE_URL } from '@env';

const pushApi = axios.create({
  baseURL: API_BASE_URL, // Ortam değişkeninden gelen URL
  headers: {
    'Content-Type': 'application/json',
  },
});

export default pushApi;
