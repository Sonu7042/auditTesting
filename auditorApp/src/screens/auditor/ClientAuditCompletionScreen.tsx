import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Feather from '../../components/common/AppIcon';
import {AuditorHeader} from '../../components/common/AuditorHeader';
import {auditorApi} from '../../api/auditor.api';
import {AuditorStackParamList} from '../../navigation/navigationTypes';
import {useAppTheme} from '../../store/ThemeContext';

type Props=NativeStackScreenProps<AuditorStackParamList,'ClientAuditCompletion'>;

export function ClientAuditCompletionScreen({navigation,route}:Props){
  const {isDark}=useAppTheme();
  const signatureRef=useRef<any>(null);
  const [readiness,setReadiness]=useState<any>(null);
  const [remarks,setRemarks]=useState('');
  const [accepted,setAccepted]=useState(false);
  const [signature,setSignature]=useState('');
  const [hasInk,setHasInk]=useState(false);
  const [scrollEnabled,setScrollEnabled]=useState(true);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{try{setReadiness((await auditorApi.clientAuditCompletionReadiness(route.params.jobId)).readiness);}catch(reason){setError((reason as Error).message);}finally{setLoading(false);}},[route.params.jobId]);
  useEffect(()=>{load();},[load]);
  const saveSignature=(data:string)=>{setSignature(data);setHasInk(true);Alert.alert('Signature ready','Your signature is ready for final submission.');};
  const clearSignature=()=>{signatureRef.current?.clearSignature();setSignature('');setHasInk(false);};
  const complete=async()=>{
    if(!readiness?.ready){setError(readiness?.blockers?.join('. ')||'Audit is not ready for completion.');return;}
    if(!remarks.trim()){setError('Final audit remarks are required.');return;}
    if(!accepted){setError('Accept the auditor declaration before submitting.');return;}
    if(!signature){setError('Draw and save your digital signature first.');return;}
    setSubmitting(true);setError('');
    try{const result=await auditorApi.completeClientAudit(route.params.jobId,{finalRemarks:remarks.trim(),declarationAccepted:true,signature});Alert.alert('Audit completed',result.message,[{text:'OK',onPress:()=>navigation.navigate('Schedule')}]);}
    catch(reason){setError((reason as Error).message);}finally{setSubmitting(false);}
  };
  const summary=readiness?.summary;
  return <View style={[s.screen,isDark&&s.dark]}><AuditorHeader navigation={navigation}/><ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={s.content}>
    <Pressable onPress={()=>navigation.goBack()} style={s.back}><Feather name="arrow-left" size={18} color={isDark?'#fff':'#111'}/><Text style={[s.backText,isDark&&s.light]}>Checklist</Text></Pressable>
    <Text style={[s.title,isDark&&s.light]}>Review & complete audit</Text>
    {loading?<ActivityIndicator color="#154A95"/>:readiness&&<>
      <View style={[s.card,isDark&&s.cardDark]}><Text style={[s.site,isDark&&s.light]}>{readiness.site.dealerName} - {readiness.site.locationName}</Text><View style={s.progressRow}><Text style={s.progressLabel}>Checklist progress</Text><Text style={s.progressValue}>{summary.progressPercentage}%</Text></View><View style={s.track}><View style={[s.fill,{width:`${summary.progressPercentage}%`}]} /></View></View>
      <View style={s.summaryGrid}><Summary label="Total" value={summary.total}/><Summary label="Compliant" value={summary.compliant} green/><Summary label="Non-compliant" value={summary.nonCompliant} red/><Summary label="N/A" value={summary.na}/><Summary label="Evidence" value={summary.evidencePhotos}/><Summary label="Critical" value={summary.severity.CRITICAL} red/></View>
      {!readiness.ready&&<View style={s.blocker}><Text style={s.blockerTitle}>Completion blocked</Text>{readiness.blockers.map((item:string)=><Text key={item} style={s.blockerText}>• {item}</Text>)}</View>}
      <View style={[s.card,isDark&&s.cardDark]}><Text style={[s.label,isDark&&s.light]}>Final audit remarks *</Text><TextInput multiline value={remarks} onChangeText={setRemarks} placeholder="Enter overall audit conclusion and important observations" placeholderTextColor="#94A3B8" style={s.remarks}/></View>
      <View style={[s.card,isDark&&s.cardDark]}><Text style={[s.label,isDark&&s.light]}>Auditor digital signature *</Text><Text style={s.hint}>Sign inside the box, then press Save signature.</Text><View style={s.signatureBox}><SignatureScreen ref={signatureRef} onOK={saveSignature} onBegin={()=>{setHasInk(true);setScrollEnabled(false);}} onEnd={()=>setScrollEnabled(true)} onClear={()=>{setHasInk(false);setSignature('');}} androidHardwareAccelerationDisabled webStyle={'html,body{width:100%;height:100%;overscroll-behavior:none}.m-signature-pad{box-shadow:none;border:none;height:100%}.m-signature-pad--body{border:1px dashed #94a3b8;border-radius:10px;touch-action:none}.m-signature-pad--body canvas{touch-action:none}.m-signature-pad--footer{display:none}'}/></View><View style={s.signatureActions}><Pressable onPress={clearSignature} style={s.clear}><Text style={s.clearText}>Clear</Text></Pressable><Pressable disabled={!hasInk} onPress={()=>signatureRef.current?.readSignature()} style={[s.save,!hasInk&&s.disabled]}><Text style={s.saveText}>{signature?'Signature saved':'Save signature'}</Text></Pressable></View></View>
      <Pressable onPress={()=>setAccepted(value=>!value)} style={[s.declaration,isDark&&s.cardDark]}><View style={[s.checkbox,accepted&&s.checked]}>{accepted&&<Feather name="check" size={15} color="#fff"/>}</View><Text style={[s.declarationText,isDark&&s.light]}>I declare that this audit was conducted objectively and all submitted information and evidence are accurate.</Text></Pressable>
      {!!error&&<Text style={s.error}>{error}</Text>}
      <Pressable disabled={submitting||!readiness.ready} onPress={complete} style={[s.complete,(!readiness.ready||submitting)&&s.disabled]}>{submitting?<ActivityIndicator color="#fff"/>:<><Feather name="send" size={17} color="#fff"/><Text style={s.completeText}>Submit & complete audit</Text></>}</Pressable>
    </>}
  </ScrollView></View>;
}

function Summary({label,value,green,red}:{label:string;value:number;green?:boolean;red?:boolean}){return <View style={s.summary}><Text style={[s.summaryValue,green&&s.green,red&&s.red]}>{value}</Text><Text style={s.summaryLabel}>{label}</Text></View>}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#F3F4F6'},dark:{backgroundColor:'#111827'},content:{padding:18,paddingBottom:45},light:{color:'#F8FAFC'},back:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:14},backText:{fontWeight:'700',color:'#111'},title:{fontSize:25,fontWeight:'900',color:'#111',marginBottom:16},card:{backgroundColor:'#fff',borderRadius:18,padding:16,marginBottom:14,borderWidth:1,borderColor:'#E5E7EB'},cardDark:{backgroundColor:'#1F2937',borderColor:'#374151'},site:{fontSize:16,fontWeight:'900',color:'#111'},progressRow:{flexDirection:'row',justifyContent:'space-between',marginTop:16},progressLabel:{fontSize:13,color:'#64748B'},progressValue:{fontSize:16,fontWeight:'900',color:'#15803D'},track:{height:9,borderRadius:6,backgroundColor:'#E5E7EB',overflow:'hidden',marginTop:8},fill:{height:'100%',backgroundColor:'#22C55E'},summaryGrid:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:14},summary:{width:'31%',backgroundColor:'#fff',borderRadius:14,padding:13,alignItems:'center'},summaryValue:{fontSize:21,fontWeight:'900',color:'#334155'},summaryLabel:{fontSize:10,color:'#64748B',marginTop:3},green:{color:'#15803D'},red:{color:'#DC2626'},blocker:{backgroundColor:'#FEF2F2',borderWidth:1,borderColor:'#FECACA',borderRadius:14,padding:14,marginBottom:14},blockerTitle:{fontWeight:'900',color:'#B91C1C',marginBottom:6},blockerText:{fontSize:12,color:'#B91C1C',marginTop:3},label:{fontSize:14,fontWeight:'900',color:'#111'},remarks:{height:105,borderWidth:1,borderColor:'#CBD5E1',borderRadius:11,padding:12,textAlignVertical:'top',marginTop:10,color:'#111',backgroundColor:'#fff'},hint:{fontSize:12,color:'#64748B',marginTop:6,marginBottom:10},signatureBox:{height:230,borderRadius:11,overflow:'hidden'},signatureActions:{flexDirection:'row',justifyContent:'flex-end',gap:9,marginTop:10},clear:{height:42,borderWidth:1,borderColor:'#CBD5E1',borderRadius:10,paddingHorizontal:18,justifyContent:'center'},clearText:{fontWeight:'800',color:'#475569'},save:{height:42,backgroundColor:'#154A95',borderRadius:10,paddingHorizontal:18,justifyContent:'center'},saveText:{fontWeight:'800',color:'#fff'},declaration:{backgroundColor:'#fff',borderRadius:16,padding:15,flexDirection:'row',gap:11,marginBottom:14},checkbox:{width:23,height:23,borderRadius:6,borderWidth:1,borderColor:'#94A3B8',alignItems:'center',justifyContent:'center'},checked:{backgroundColor:'#166534',borderColor:'#166534'},declarationText:{flex:1,fontSize:12,lineHeight:18,color:'#334155'},error:{color:'#DC2626',backgroundColor:'#FEF2F2',padding:13,borderRadius:12,marginBottom:12},complete:{height:52,borderRadius:13,backgroundColor:'#166534',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},completeText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.45}});
