import React, {useState} from 'react';
import {Alert, ImageBackground, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Feather from '../../components/common/AppIcon';
import {useAuth} from '../../store/AuthContext';
import {BrandLogo} from '../../components/common/BrandLogo';
import {useAppTheme} from '../../store/ThemeContext';

const background = require('./building.png');
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 4);

export function SetPinScreen() {
  const {isDark} = useAppTheme();
  const {width, height} = useWindowDimensions();
  const compact = height < 700 || width < 370;
  const {hasPin, completePin, logout} = useAuth();
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (pin.length !== 4) return setError('PIN must be 4 digits');
    if (!hasPin && pin !== confirmation) return setError('PIN does not match');
    setBusy(true);
    try {if (!(await completePin(pin))) {setError('Wrong PIN'); setPin('');}} finally {setBusy(false);}
  };

  const confirmLogout = () => Alert.alert(
    'Logout',
    'Do you want to cancel secure setup and return to login?',
    [{text:'Cancel',style:'cancel'},{text:'Logout',style:'destructive',onPress:logout}],
  );

  return <ImageBackground source={background} resizeMode="cover" style={styles.background}>
    <View style={styles.overlay}/><SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><View style={[styles.card, isDark && styles.cardDark, compact && styles.cardCompact]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Logout" hitSlop={10} onPress={confirmLogout} style={[styles.logout, compact && styles.logoutCompact]}><Feather name="log-out" size={compact ? 19 : 21} color="white"/></Pressable>
        <BrandLogo width={compact ? 112 : 132}/><Text style={[styles.subtitle, isDark && styles.textDark, compact && styles.subtitleCompact]}>{hasPin ? 'Enter your device security PIN.' : 'Set your device security PIN.'}</Text>
        <TextInput autoFocus style={[styles.input, isDark && styles.inputDark, compact && styles.inputCompact]} placeholder={hasPin ? 'Enter Pin' : 'Set Pin'} placeholderTextColor="#94979D" keyboardType="number-pad" secureTextEntry maxLength={4} value={pin} onChangeText={value => setPin(digits(value))}/>
        <Text style={[styles.help, isDark && styles.mutedDark, compact && styles.helpCompact]}>{hasPin ? 'Use the 4-digit PIN you set after login.' : 'Set a 4-digit PIN to protect audit data during site visits.'}</Text>
        {!hasPin && <><TextInput style={[styles.input, isDark && styles.inputDark, compact && styles.inputCompact]} placeholder="Re-Enter Pin" placeholderTextColor="#94979D" keyboardType="number-pad" secureTextEntry maxLength={4} value={confirmation} onChangeText={value => setConfirmation(digits(value))} onSubmitEditing={submit}/><Text style={[styles.help, isDark && styles.mutedDark, compact && styles.helpCompact]}>Confirm your PIN to complete secure setup.</Text></>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        <Pressable disabled={busy} onPress={submit} style={[styles.button, compact && styles.buttonCompact, busy && styles.disabled]}><Text style={styles.buttonText}>{hasPin ? 'Unlock' : 'Log In'}</Text></Pressable>
        <Text style={[styles.signIn, isDark && styles.mutedDark]}>Sign in to access your Audit Portal</Text><View style={styles.footer}><Pressable onPress={() => Linking.openURL('mailto:support@bexex.com')}><Text style={[styles.support, isDark && styles.textDark]}>Contact Support</Text></Pressable><Text style={[styles.version, isDark && styles.mutedDark]}>version 2.11.5234</Text></View>
      </View></ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </ImageBackground>;
}

const styles = StyleSheet.create({background:{flex:1,backgroundColor:'#6BB7E3'},overlay:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'rgba(43,159,218,0.25)'},safe:{flex:1},fill:{flex:1},textDark:{color:'#F8FAFC'},mutedDark:{color:'#9CA3AF'},cardDark:{backgroundColor:'#1F2937'},inputDark:{backgroundColor:'#111827',borderColor:'#374151',color:'#F8FAFC'},scroll:{flexGrow:1,justifyContent:'center',paddingHorizontal:24,paddingVertical:32},scrollCompact:{paddingHorizontal:16,paddingVertical:16},card:{width:'100%',maxWidth:520,alignSelf:'center',backgroundColor:'rgba(250,252,255,0.94)',borderRadius:30,paddingHorizontal:30,paddingTop:42,paddingBottom:36,shadowColor:'#172033',shadowOffset:{width:0,height:8},shadowOpacity:.2,shadowRadius:20,elevation:10},cardCompact:{borderRadius:24,paddingHorizontal:22,paddingTop:26,paddingBottom:23},logout:{position:'absolute',right:30,top:30,width:45,height:45,borderRadius:23,backgroundColor:'#1E1E1E',alignItems:'center',justifyContent:'center'},logoutCompact:{right:20,top:20,width:40,height:40,borderRadius:20},logoutIcon:{color:'white',fontSize:25,transform:[{rotate:'180deg'}]},logo:{fontSize:46,lineHeight:50,fontWeight:'900',letterSpacing:-3,color:'#050505'},logoCompact:{fontSize:39,lineHeight:43},subtitle:{fontSize:16,letterSpacing:.4,color:'#596477',marginTop:2,marginBottom:32},subtitleCompact:{fontSize:14,marginBottom:22},input:{height:62,borderWidth:1,borderColor:'#CDD0D5',backgroundColor:'#F4F4F6',borderRadius:15,paddingHorizontal:24,fontSize:18,color:'#20242A',shadowColor:'#000',shadowOffset:{width:0,height:4},shadowOpacity:.12,shadowRadius:5,elevation:4},inputCompact:{height:52,paddingHorizontal:18,fontSize:16},help:{fontSize:14,color:'#596477',lineHeight:20,marginTop:18,marginBottom:30},helpCompact:{fontSize:12,lineHeight:18,marginTop:12,marginBottom:19},error:{color:'#C62828',fontSize:13,marginTop:-12,marginBottom:14},button:{height:60,borderRadius:14,backgroundColor:'#1E1E1E',alignItems:'center',justifyContent:'center'},buttonCompact:{height:52},disabled:{opacity:.55},buttonText:{fontSize:18,color:'white',fontWeight:'600'},signIn:{fontSize:14,color:'#606B7E',textAlign:'center',marginTop:21},footer:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:25},support:{fontSize:13,color:'#4F5B6D',textDecorationLine:'underline'},version:{fontSize:13,color:'#4F5B6D'}});
