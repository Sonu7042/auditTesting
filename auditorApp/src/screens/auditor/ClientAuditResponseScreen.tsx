import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Image, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {launchCamera, Asset} from 'react-native-image-picker';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import Feather from '../../components/common/AppIcon';
import {AuditorHeader} from '../../components/common/AuditorHeader';
import {auditorApi} from '../../api/auditor.api';
import {AuditorStackParamList} from '../../navigation/navigationTypes';
import {ClientAuditQuestion} from '../../types/domain';
import {useAppTheme} from '../../store/ThemeContext';

type Props=NativeStackScreenProps<AuditorStackParamList,'ClientAuditResponse'>;
type Answer='COMPLIANT'|'NON_COMPLIANT'|'NA'|'';

export function ClientAuditResponseScreen({navigation,route}:Props){
  const {isDark}=useAppTheme();
  const [question,setQuestion]=useState<ClientAuditQuestion|null>(null);
  const [answer,setAnswer]=useState<Answer>('');
  const [observation,setObservation]=useState('');
  const [measurement,setMeasurement]=useState('');
  const [naReason,setNaReason]=useState('');
  const [recommendation,setRecommendation]=useState('');
  const [responsiblePerson,setResponsiblePerson]=useState('');
  const [targetDate,setTargetDate]=useState('');
  const [photos,setPhotos]=useState<Asset[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  const load=useCallback(async()=>{
    try{
      const session=(await auditorApi.clientAuditSession(route.params.jobId)).session;
      const found:ClientAuditQuestion|undefined=session.modules.flatMap((module:any)=>module.sections.flatMap((section:any)=>section.questions)).find((item:any)=>item.id===route.params.questionId);
      if(!found)throw new Error('Checklist question was not found.');
      setQuestion(found);
      const response=found.response;
      setAnswer((response?.answer||'') as Answer);setObservation(response?.observation||'');setMeasurement(response?.measurementValue==null?'':String(response.measurementValue));setNaReason(response?.naReason||'');setRecommendation(response?.recommendation||'');setResponsiblePerson(response?.responsiblePerson||'');setTargetDate(response?.targetDate?.slice(0,10)||'');
    }catch(reason){setError((reason as Error).message);}finally{setLoading(false);}
  },[route.params.jobId,route.params.questionId]);
  useEffect(()=>{load();},[load]);

  const captureEvidence=async()=>{
    if(photos.length>=10){setError('Maximum 10 new photos are allowed.');return;}
    if(Platform.OS==='android'){
      const permission=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if(permission!==PermissionsAndroid.RESULTS.GRANTED){setError('Camera permission is required.');return;}
    }
    const result=await launchCamera({mediaType:'photo',cameraType:'back',quality:.8,saveToPhotos:false});
    if(result.errorMessage)setError(result.errorMessage);
    else if(result.assets?.[0]?.uri)setPhotos(previous=>[...previous,result.assets![0]]);
  };

  const save=async(responseStatus:'DRAFT'|'SUBMITTED')=>{
    if(!question)return;
    setSaving(true);setError('');
    try{
      const form=new FormData();
      form.append('responseStatus',responseStatus);form.append('answer',answer);form.append('observation',observation);form.append('measurementValue',measurement);form.append('naReason',naReason);form.append('recommendation',recommendation);form.append('responsiblePerson',responsiblePerson);form.append('targetDate',targetDate);
      photos.forEach((photo,index)=>form.append('evidence',{uri:photo.uri!,type:photo.type||'image/jpeg',name:photo.fileName||`evidence-${Date.now()}-${index}.jpg`} as any));
      const result=await auditorApi.saveClientAuditResponse(route.params.jobId,question.id,form);
      Alert.alert(responseStatus==='SUBMITTED'?'Response submitted':'Draft saved',result.message,[{text:'OK',onPress:()=>navigation.goBack()}]);
    }catch(reason){setError((reason as Error).message);}finally{setSaving(false);}
  };

  if(loading)return <View style={[s.screen,s.center,isDark&&s.dark]}><ActivityIndicator color="#154A95"/></View>;
  return <View style={[s.screen,isDark&&s.dark]}><AuditorHeader navigation={navigation}/><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Pressable onPress={()=>navigation.goBack()} style={s.back}><Feather name="arrow-left" size={18} color={isDark?'#fff':'#111'}/><Text style={[s.backText,isDark&&s.light]}>Checklist</Text></Pressable>
    {question&&<>
      <View style={[s.card,isDark&&s.cardDark]}><View style={s.badges}><Text style={s.code}>{question.questionCode}</Text><Text style={s.severity}>{question.severityOnFail}</Text></View><Text style={[s.question,isDark&&s.light]}>{question.questionText}</Text>{question.expectedCondition&&<Text style={s.expected}>Expected: {question.expectedCondition}</Text>}{question.regulationRef&&<Text style={s.reference}>Reference: {question.regulationRef}</Text>}</View>
      <View style={[s.card,isDark&&s.cardDark]}>
        <Text style={[s.label,isDark&&s.light]}>Response *</Text><View style={s.choiceRow}>{(['COMPLIANT','NON_COMPLIANT','NA'] as Answer[]).filter(value=>value!=='NA'||question.naAllowed).map(value=><Pressable key={value} onPress={()=>setAnswer(value)} style={[s.choice,answer===value&&s.choiceActive]}><Text style={[s.choiceText,answer===value&&s.choiceTextActive]}>{value==='NON_COMPLIANT'?'Non-Compliant':value==='NA'?'N/A':'Compliant'}</Text></Pressable>)}</View>
        {question.responseType==='MEASUREMENT'&&<Field label={`Measurement${question.measurementUnit?` (${question.measurementUnit})`:''}`} value={measurement} onChangeText={setMeasurement} keyboardType="decimal-pad" placeholder={`Allowed ${question.minimumValue??'-'} to ${question.maximumValue??'-'}`}/>} 
        {answer==='NA'&&<Field label={`N/A reason${question.naReasonRequired?' *':''}`} value={naReason} onChangeText={setNaReason} multiline placeholder="Explain why this item is not applicable"/>}
        <Field label={`Observation${answer==='NON_COMPLIANT'?' *':''}`} value={observation} onChangeText={setObservation} multiline placeholder="Enter site observation"/>
        {answer==='NON_COMPLIANT'&&<><Field label="Recommendation" value={recommendation} onChangeText={setRecommendation} multiline placeholder="Recommended corrective action"/><Field label="Responsible person" value={responsiblePerson} onChangeText={setResponsiblePerson} placeholder="Person responsible for action"/><Field label="Target date" value={targetDate} onChangeText={setTargetDate} placeholder="YYYY-MM-DD"/></>}
      </View>
      <View style={[s.card,isDark&&s.cardDark]}><Text style={[s.label,isDark&&s.light]}>Evidence {question.evidenceRequired?`(minimum ${question.minimumEvidence})`: '(optional)'}</Text><View style={s.photoGrid}>{(question.response?.evidence||[]).map(photo=><Image key={photo.id} source={{uri:photo.imageUrl}} style={s.photo}/>)}{photos.map((photo,index)=><View key={`${photo.uri}-${index}`}><Image source={{uri:photo.uri}} style={s.photo}/><Pressable onPress={()=>setPhotos(previous=>previous.filter((_,i)=>i!==index))} style={s.remove}><Feather name="x" size={13} color="#fff"/></Pressable></View>)}</View><Pressable onPress={captureEvidence} style={s.cameraButton}><Feather name="camera" size={17} color="#154A95"/><Text style={s.cameraText}>Capture evidence photo</Text></Pressable></View>
      {!!error&&<Text style={s.error}>{error}</Text>}
      <View style={s.actions}><Pressable disabled={saving} onPress={()=>save('DRAFT')} style={s.draftButton}><Text style={s.draftText}>Save draft</Text></Pressable><Pressable disabled={saving} onPress={()=>save('SUBMITTED')} style={s.submitButton}>{saving?<ActivityIndicator color="#fff"/>:<Text style={s.submitText}>Submit response</Text>}</Pressable></View>
    </>}
  </ScrollView></View>;
}

function Field({label,...props}:{label:string;value:string;onChangeText:(value:string)=>void;placeholder?:string;multiline?:boolean;keyboardType?:any}){return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput {...props} style={[s.input,props.multiline&&s.multiline]} placeholderTextColor="#94A3B8"/></View>}

const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#F3F4F6'},dark:{backgroundColor:'#111827'},center:{alignItems:'center',justifyContent:'center'},content:{padding:18,paddingBottom:45},light:{color:'#F8FAFC'},back:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:14},backText:{fontWeight:'700',color:'#111'},card:{backgroundColor:'#fff',borderRadius:18,padding:16,marginBottom:14,borderWidth:1,borderColor:'#E5E7EB'},cardDark:{backgroundColor:'#1F2937',borderColor:'#374151'},badges:{flexDirection:'row',gap:8},code:{fontSize:11,fontWeight:'900',color:'#15803D',backgroundColor:'#DCFCE7',paddingHorizontal:8,paddingVertical:4,borderRadius:7},severity:{fontSize:11,fontWeight:'900',color:'#9A3412',backgroundColor:'#FFEDD5',paddingHorizontal:8,paddingVertical:4,borderRadius:7},question:{fontSize:17,fontWeight:'800',color:'#111',marginTop:12,lineHeight:24},expected:{fontSize:13,color:'#475569',marginTop:10},reference:{fontSize:11,color:'#64748B',marginTop:8},label:{fontSize:14,fontWeight:'800',color:'#111',marginBottom:10},choiceRow:{flexDirection:'row',gap:7,flexWrap:'wrap'},choice:{borderWidth:1,borderColor:'#CBD5E1',borderRadius:10,paddingHorizontal:12,paddingVertical:10},choiceActive:{backgroundColor:'#154A95',borderColor:'#154A95'},choiceText:{fontSize:12,fontWeight:'700',color:'#334155'},choiceTextActive:{color:'#fff'},field:{marginTop:16},fieldLabel:{fontSize:12,fontWeight:'700',color:'#475569',marginBottom:6},input:{minHeight:45,borderWidth:1,borderColor:'#CBD5E1',borderRadius:11,paddingHorizontal:12,color:'#111',backgroundColor:'#fff'},multiline:{height:90,textAlignVertical:'top',paddingTop:12},photoGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},photo:{width:88,height:88,borderRadius:10,backgroundColor:'#E5E7EB'},remove:{position:'absolute',right:-4,top:-4,width:23,height:23,borderRadius:12,backgroundColor:'#DC2626',alignItems:'center',justifyContent:'center'},cameraButton:{marginTop:12,height:44,borderRadius:11,borderWidth:1,borderColor:'#154A95',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},cameraText:{color:'#154A95',fontWeight:'800'},error:{color:'#DC2626',backgroundColor:'#FEF2F2',padding:13,borderRadius:12,marginBottom:12},actions:{flexDirection:'row',gap:10},draftButton:{flex:1,height:49,borderRadius:12,borderWidth:1,borderColor:'#154A95',alignItems:'center',justifyContent:'center'},draftText:{color:'#154A95',fontWeight:'800'},submitButton:{flex:1,height:49,borderRadius:12,backgroundColor:'#154A95',alignItems:'center',justifyContent:'center'},submitText:{color:'#fff',fontWeight:'800'}});
