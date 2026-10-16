import { Platform } from 'react-native';

// Android Emulator: 'http://10.0.2.2:5000/api'
// Physical Device (Wi-Fi): 'http://192.168.1.28:5000/api'
// Device with USB (adb reverse): 'http://localhost:5000/api'




// sonu ip address

// const developmentUrl =
//   Platform.OS === 'android'
//     ? 'http://192.168.1.15:5000/api'
//     : 'http://localhost:5000/api';

// export const env = Object.freeze({
//   apiUrl: __DEV__ ? developmentUrl 
//     : 'https://audit-testing-bdzn.vercel.app/api',  
// });


// rohit verma ip adress 
const developmentUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:5000/api'
    : 'http://localhost:5000/api';

export const env = Object.freeze({
  apiUrl: __DEV__ ? developmentUrl 
    : 'https://audit-portal-with-app-e11i.vercel.app/api',  
});
