import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from '../components/common/AppIcon';
import {useNotifications} from '../store/NotificationContext';
import {c} from '../ui/theme';
import {FieldStackParamList, FieldTabParamList} from './fieldTypes';
import {AuditorNavigator} from './AuditorNavigator';
import {HomeScreen} from '../screens/field/HomeScreen';
import {AuditsScreen} from '../screens/field/AuditsScreen';
import {CalendarScreen} from '../screens/field/CalendarScreen';
import {ReportsScreen} from '../screens/field/ReportsScreen';
import {MoreScreen} from '../screens/field/MoreScreen';
import {BriefingScreen} from '../screens/field/BriefingScreen';
import {CheckInScreen} from '../screens/field/CheckInScreen';
import {AuditOverviewScreen} from '../screens/field/AuditOverviewScreen';
import {PointScreen} from '../screens/field/PointScreen';
import {FinishAuditScreen} from '../screens/field/FinishAuditScreen';
import {ProposePointScreen} from '../screens/field/ProposePointScreen';
import {ReportDetailScreen} from '../screens/field/ReportDetailScreen';
import {CorrectionScreen} from '../screens/field/CorrectionScreen';
import {CapaVerifyScreen} from '../screens/field/CapaVerifyScreen';
import {DealerQuestionsScreen} from '../screens/field/DealerQuestionsScreen';
import {NotificationsScreen} from '../screens/field/NotificationsScreen';
import {ProfileScreen} from '../screens/field/ProfileScreen';
import {TrainingScreen} from '../screens/field/TrainingScreen';
import {OfflineSyncScreen} from '../screens/field/OfflineSyncScreen';

const Tab = createBottomTabNavigator<FieldTabParamList>();
const Stack = createNativeStackNavigator<FieldStackParamList>();

const ICONS: Record<keyof FieldTabParamList, string> = {Home: 'home', Audits: 'clipboard-list', Calendar: 'calendar', Reports: 'file-text', More: 'menu'};

function Tabs() {
  const insets = useSafeAreaInsets();
  const {unreadCount} = useNotifications();
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: c.green,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {backgroundColor: c.surface, borderTopColor: c.line, height: 62 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8)},
        tabBarLabelStyle: {fontSize: 12, fontWeight: '600'},
        tabBarIcon: ({color}) => (
          <View>
            <Icon name={ICONS[route.name]} size={23} color={color} />
            {route.name === 'More' && unreadCount > 0 && <View style={st.dot} />}
          </View>
        ),
        tabBarLabel: ({color, focused}) => <Text style={[st.label, {color, fontWeight: focused ? '700' : '500'}]}>{route.name}</Text>,
      })}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Audits" component={AuditsScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export function FieldNavigator() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false, contentStyle: {backgroundColor: c.bg}, animation: 'slide_from_right'}}>
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="Briefing" component={BriefingScreen} />
      <Stack.Screen name="CheckIn" component={CheckInScreen} />
      <Stack.Screen name="AuditOverview" component={AuditOverviewScreen} />
      <Stack.Screen name="Point" component={PointScreen} />
      <Stack.Screen name="Finish" component={FinishAuditScreen} />
      <Stack.Screen name="ProposePoint" component={ProposePointScreen} options={{presentation: 'modal', animation: 'slide_from_bottom'}} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} />
      <Stack.Screen name="Correction" component={CorrectionScreen} />
      <Stack.Screen name="CapaVerify" component={CapaVerifyScreen} />
      <Stack.Screen name="DealerQuestions" component={DealerQuestionsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Training" component={TrainingScreen} />
      <Stack.Screen name="OfflineSync" component={OfflineSyncScreen} />
      <Stack.Screen name="Legacy" component={AuditorNavigator} />
    </Stack.Navigator>
  );
}

const st = StyleSheet.create({
  label: {fontSize: 12},
  dot: {position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: c.red, borderWidth: 1.5, borderColor: c.surface},
});
