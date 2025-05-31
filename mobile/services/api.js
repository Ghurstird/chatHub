import axios from 'axios';
import { MATRIX_BASE_URL } from '../config/matrixConfig';

const api = axios.create({
  baseURL: MATRIX_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
