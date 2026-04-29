import axios from 'axios';
import { ENV } from '../constants/env';

export const axiosInstance = axios.create({
  baseURL: ENV.API_URL,
  headers: { 'Content-Type': 'application/json' },
});
