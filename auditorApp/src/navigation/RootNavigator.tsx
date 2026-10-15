import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {DarkTheme, DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useAuth} from '../store/AuthContext';
import {PortalLoginScreen} from '../screens/auth/PortalLoginScreen';
import {SetPinScreen} from '../screens/auth/SetPinScreen';
import {AuditorNavigator} from './AuditorNavigator';
import {useAppTheme} from '../store/ThemeContext';

const S = createNativeStackNavigator();

export function RootNavigator() {
  const {user, booting, pinRequired} = useAuth();
  const {isDark} = useAppTheme();

  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: '#8B80FF',
          background: '#111827',
          card: '#1F2937',
          border: '#374151',
        },
      }
    : DefaultTheme;

  if (booting) {
    return (
      <View style={[styles.loading, isDark && styles.loadingDark]}>
        <ActivityIndicator color="#0047B3" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <S.Navigator screenOptions={{headerShown: false}}>
        {!user ? (
          <S.Screen name="Login" component={PortalLoginScreen} />
        ) : pinRequired ? (
          <S.Screen name="SetPin" component={SetPinScreen} />
        ) : (
          <S.Screen name="Auditor" component={AuditorNavigator} />
        )}
      </S.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  loadingDark: {backgroundColor: '#111827'},
});
