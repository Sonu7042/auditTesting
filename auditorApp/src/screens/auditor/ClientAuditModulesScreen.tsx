import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Feather from '../../components/common/AppIcon';
import {AuditorHeader} from '../../components/common/AuditorHeader';
import {auditorApi} from '../../api/auditor.api';
import {AuditorStackParamList} from '../../navigation/navigationTypes';
import {ClientAuditSession} from '../../types/domain';
import {useAppTheme} from '../../store/ThemeContext';

type Props = NativeStackScreenProps<AuditorStackParamList, 'ClientAuditModules'>;

export function ClientAuditModulesScreen({navigation, route}: Props) {
  const {isDark} = useAppTheme();
  const [session, setSession] = useState<ClientAuditSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setSession((await auditorApi.clientAuditSession(route.params.jobId)).session); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }, [route.params.jobId]);
  useEffect(() => { const unsubscribe = navigation.addListener('focus', load); return unsubscribe; }, [navigation, load]);

  return <View style={[s.screen, isDark && s.dark]}><AuditorHeader navigation={navigation}/><ScrollView contentContainerStyle={s.content}>
    <Pressable onPress={() => navigation.goBack()} style={s.back}><Feather name="arrow-left" size={18} color={isDark?'#fff':'#111'}/><Text style={[s.backText,isDark&&s.light]}>Check-in</Text></Pressable>
    <Text style={[s.title,isDark&&s.light]}>Audit checklist</Text>
    {loading?<ActivityIndicator color="#154A95"/>:session&&<>
      <View style={[s.progressCard,isDark&&s.cardDark]}><View style={s.progressTop}><Text style={[s.progressTitle,isDark&&s.light]}>Overall progress</Text><Text style={s.progressValue}>{session.progress?.percentage||0}%</Text></View><View style={s.track}><View style={[s.fill,{width:`${session.progress?.percentage||0}%`}]} /></View><Text style={s.muted}>{session.progress?.submittedQuestions||0} of {session.progress?.totalQuestions||0} submitted</Text></View>
      {(session.modules||[]).map(module=><View key={module.moduleCode} style={[s.moduleCard,isDark&&s.cardDark]}>
        <View style={s.moduleHeader}><View style={s.flex}><Text style={[s.moduleTitle,isDark&&s.light]}>{module.moduleCode.replace(/_/g,' ')}</Text><Text style={s.muted}>{module.submittedCount}/{module.questionCount} submitted · {module.draftCount} draft</Text></View><Text style={s.modulePercent}>{module.progressPercent}%</Text></View>
        <View style={s.track}><View style={[s.fill,{width:`${module.progressPercent}%`}]} /></View>
        {module.sections.map(section=><View key={section.sectionName} style={s.section}><Text style={[s.sectionTitle,isDark&&s.light]}>{section.sectionName}</Text>{section.questions.map(question=><Pressable key={question.id} onPress={()=>navigation.navigate('ClientAuditResponse',{jobId:route.params.jobId,questionId:question.id})} style={s.questionRow}><View style={s.flex}><Text style={s.code}>{question.questionCode}</Text><Text numberOfLines={2} style={[s.question,isDark&&s.light]}>{question.questionText}</Text></View><View style={[s.status,question.response?.responseStatus==='SUBMITTED'?s.submitted:question.response?s.draft:s.pending]}><Text style={s.statusText}>{question.response?.responseStatus||'PENDING'}</Text></View><Feather name="chevron-right" size={18} color="#64748B"/></Pressable>)}</View>)}
      </View>)}
      <Pressable onPress={()=>navigation.navigate('ClientAuditCompletion',{jobId:route.params.jobId})} style={[s.completeButton,(session.progress?.percentage||0)<100&&s.completeDisabled]}><Feather name="check-circle" size={18} color="#fff"/><Text style={s.completeText}>{(session.progress?.percentage||0)===100?'Review & complete audit':'Complete all questions to continue'}</Text></Pressable>
    </>}
    {!!error&&<Text style={s.error}>{error}</Text>}
  </ScrollView></View>;
}

const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#F3F4F6'},dark:{backgroundColor:'#111827'},content:{padding:18,paddingBottom:40},light:{color:'#F8FAFC'},back:{flexDirection:'row',gap:8,alignItems:'center',marginBottom:14},backText:{fontWeight:'700',color:'#111'},title:{fontSize:26,fontWeight:'900',color:'#111',marginBottom:16},progressCard:{backgroundColor:'#fff',borderRadius:18,padding:16,marginBottom:14},cardDark:{backgroundColor:'#1F2937'},progressTop:{flexDirection:'row',justifyContent:'space-between'},progressTitle:{fontSize:15,fontWeight:'800',color:'#111'},progressValue:{fontSize:18,fontWeight:'900',color:'#15803D'},track:{height:8,borderRadius:5,backgroundColor:'#E5E7EB',overflow:'hidden',marginTop:10},fill:{height:'100%',backgroundColor:'#22C55E'},muted:{fontSize:12,color:'#64748B',marginTop:7},moduleCard:{backgroundColor:'#fff',borderRadius:18,padding:16,marginBottom:14},moduleHeader:{flexDirection:'row',alignItems:'center'},flex:{flex:1},moduleTitle:{fontSize:16,fontWeight:'900',color:'#111'},modulePercent:{fontWeight:'900',color:'#154A95'},section:{marginTop:17},sectionTitle:{fontSize:13,fontWeight:'800',color:'#334155',marginBottom:5},questionRow:{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:12,borderTopWidth:1,borderTopColor:'#E5E7EB'},code:{fontSize:11,fontWeight:'800',color:'#15803D'},question:{fontSize:13,color:'#111',marginTop:3},status:{borderRadius:8,paddingHorizontal:7,paddingVertical:4},pending:{backgroundColor:'#E5E7EB'},draft:{backgroundColor:'#FEF3C7'},submitted:{backgroundColor:'#DCFCE7'},statusText:{fontSize:9,fontWeight:'900',color:'#334155'},completeButton:{height:52,borderRadius:13,backgroundColor:'#166534',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},completeDisabled:{backgroundColor:'#94A3B8'},completeText:{color:'#fff',fontWeight:'900'},error:{color:'#DC2626',backgroundColor:'#FEF2F2',padding:13,borderRadius:12}});
