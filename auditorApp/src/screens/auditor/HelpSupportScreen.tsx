import React from 'react';
import {Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import Feather from '../../components/common/AppIcon';
import {useAppTheme} from '../../store/ThemeContext';

const topics = [
  ['Start a new audit', 'Choose an assigned project and begin the required assessment.'],
  ['Complete assessment', 'Review control measures, documents, workforce, machinery, chemicals, and the visit sheet.'],
  ['Audit schedule', 'Review upcoming inspections and their assigned dates.'],
  ['Reports', 'Open previous reports and review completed audit history.'],
  ['Notifications', 'Track audit assignments, reminders, and status updates.'],
];

export function HelpSupportScreen() {
  const {width} = useWindowDimensions();
  const {isDark} = useAppTheme();
  const compact = width < 370;
  const tablet = width >= 768;
  return <ScrollView style={[styles.screen, isDark && styles.screenDark]} contentContainerStyle={[styles.content, compact && styles.contentCompact, tablet && styles.contentTablet]}>
    <View style={styles.hero}><Feather name="help-circle" size={tablet ? 46 : 38} color="#174D9C"/><Text style={[styles.title, tablet && styles.titleTablet, isDark && styles.titleDark]}>Help & Support</Text><Text style={[styles.subtitle, isDark && styles.subtitleDark]}>Quick guidance for your auditor workspace.</Text></View>
    <View style={[styles.topicWrap, tablet && styles.topicWrapTablet]}>
    {topics.map(([title, detail], index) => <View key={title} style={[styles.card, tablet && styles.cardTablet, isDark && styles.cardDark]}><View style={[styles.number, isDark && styles.numberDark]}><Text style={styles.numberText}>{index + 1}</Text></View><View style={styles.flex}><Text style={[styles.cardTitle, isDark && styles.cardTitleDark]}>{title}</Text><Text style={[styles.cardText, isDark && styles.cardTextDark]}>{detail}</Text></View></View>)}
    </View>
    <Pressable onPress={() => Linking.openURL('mailto:support@bexex.com?subject=Audit%20Portal%20Support')} style={styles.contact}><Feather name="mail" size={20} color="white"/><Text style={styles.contactText}>Contact Support</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({screen:{flex:1,backgroundColor:'#F3F4F6'},screenDark:{backgroundColor:'#111827'},content:{padding:22,paddingBottom:42,gap:13,width:'100%',maxWidth:640,alignSelf:'center'},contentCompact:{padding:15},contentTablet:{maxWidth:820,padding:32},titleTablet:{fontSize:32},topicWrap:{gap:13},topicWrapTablet:{flexDirection:'row',flexWrap:'wrap',gap:16},cardTablet:{width:'48%'},hero:{alignItems:'center',paddingVertical:24},title:{fontSize:27,fontWeight:'800',color:'#172033',marginTop:12},titleDark:{color:'#F8FAFC'},subtitle:{fontSize:14,color:'#687386',textAlign:'center',marginTop:7},subtitleDark:{color:'#9CA3AF'},card:{backgroundColor:'white',borderRadius:17,padding:16,flexDirection:'row',gap:13,elevation:2},cardDark:{backgroundColor:'#1F2937'},number:{width:34,height:34,borderRadius:17,backgroundColor:'#EAF0FF',alignItems:'center',justifyContent:'center'},numberDark:{backgroundColor:'#26344A'},numberText:{fontWeight:'800',color:'#174D9C'},flex:{flex:1},cardTitle:{fontSize:16,fontWeight:'700',color:'#171717'},cardTitleDark:{color:'#F1F5F9'},cardText:{fontSize:13,color:'#687386',lineHeight:19,marginTop:5},cardTextDark:{color:'#9CA3AF'},contact:{height:54,borderRadius:14,backgroundColor:'#174D9C',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,marginTop:10},contactText:{fontSize:16,fontWeight:'700',color:'white'}});
