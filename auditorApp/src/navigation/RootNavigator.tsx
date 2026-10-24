import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useAuth} from '../store/AuthContext';
import {FieldLoginScreen} from '../screens/field/auth/FieldLoginScreen';
import {ChangePasswordScreen} from '../screens/field/auth/ChangePasswordScreen';
import {PinScreen} from '../screens/field/auth/PinScreen';
import {FieldNavigator} from './FieldNavigator';
import {c} from '../ui/theme';

const S = createNativeStackNavigator();

const theme = {...DefaultTheme, colors: {...DefaultTheme.colors, primary: c.green, background: c.bg, card: c.surface, border: c.line, text: c.text}};

export function RootNavigator() {
  const {user, booting, pinRequired} = useAuth();

  if (booting) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={c.green} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      <S.Navigator screenOptions={{headerShown: false, contentStyle: {backgroundColor: c.bg}}}>
        {!user ? (
          <S.Screen name="Login" component={FieldLoginScreen} />
        ) : user.mustChangePassword ? (
          <S.Screen name="ChangePassword" component={ChangePasswordScreen} />
        ) : pinRequired ? (
          <S.Screen name="Pin" component={PinScreen} />
        ) : (
          <S.Screen name="Field" component={FieldNavigator} />
        )}
      </S.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg},
});
