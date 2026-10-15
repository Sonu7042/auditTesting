import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/store/AuthContext';
import { AuditContextProvider } from './src/store/AuditContext';
import { NotificationProvider } from './src/store/NotificationContext';
import { ThemeProvider, useAppTheme } from './src/store/ThemeContext';

function ThemedApp() {
  const {isDark} = useAppTheme();
  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />
      <RootNavigator />
    </>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>    
      <AuthProvider>
        <AuditContextProvider>
          <ThemeProvider>
            <NotificationProvider>
              <ThemedApp />
            </NotificationProvider>
          </ThemeProvider>
        </AuditContextProvider>
      </AuthProvider> 
    </SafeAreaProvider>
  );
}
