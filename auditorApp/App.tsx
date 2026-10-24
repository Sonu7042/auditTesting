import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider } from './src/store/AuthContext';
import { AuditContextProvider } from './src/store/AuditContext';
import { NotificationProvider } from './src/store/NotificationContext';
import { OutboxProvider } from './src/store/OutboxContext';
import { ThemeProvider } from './src/store/ThemeContext';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuditContextProvider>
          <ThemeProvider>
            <NotificationProvider>
              <OutboxProvider>
                <StatusBar barStyle="dark-content" />
                <RootNavigator />
              </OutboxProvider>
            </NotificationProvider>
          </ThemeProvider>
        </AuditContextProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
