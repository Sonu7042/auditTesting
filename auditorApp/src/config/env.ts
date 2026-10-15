import { Platform } from 'react-native';
const developmentUrl =
  Platform.OS === 'android'
    ? 'http://192.168.1.20:5000/api'
    : 'http://localhost:5000/api';
export const env = Object.freeze({
  apiUrl: __DEV__ ? developmentUrl 
    : 'https://audit-portal-with-app-e11i.vercel.app/api',  
});




