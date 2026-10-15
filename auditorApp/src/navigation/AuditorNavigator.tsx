import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DailyOverviewScreen } from '../screens/auditor/DailyOverviewScreen';
import { ProjectSelectionNativeScreen } from '../screens/auditor/ProjectSelectionNativeScreen';
import { AuditStartScreen } from '../screens/auditor/AuditStartScreen';
import { AuditAssessmentNativeScreen } from '../screens/auditor/AuditAssessmentNativeScreen';
import { ControlMeasuresScreen } from '../screens/auditor/ControlMeasuresScreen';
import { ChecklistResponseScreen } from '../screens/auditor/ChecklistResponseScreen';
import { DocumentsScreen } from '../screens/auditor/DocumentsWebScreen';
import { AssetVerificationFlowScreen } from '../screens/auditor/AssetVerificationFlowScreen';
import { VisitSheetScreen } from '../screens/auditor/VisitSheetWebScreen';
import { PreviousNcReviewScreen } from '../screens/auditor/PreviousNcReviewScreen';
import { HelpSupportScreen } from '../screens/auditor/HelpSupportScreen';
import { ReportHistoryScreen } from '../screens/auditor/ReportHistoryScreen';
import { NotificationHistoryScreen } from '../screens/auditor/NotificationHistoryScreen';
import { ScheduleScreen } from '../screens/auditor/ScheduleScreen';
import { ClientAuditCheckInScreen } from '../screens/auditor/ClientAuditCheckInScreen';
import { ClientAuditModulesScreen } from '../screens/auditor/ClientAuditModulesScreen';
import { ClientAuditResponseScreen } from '../screens/auditor/ClientAuditResponseScreen';
import { ClientAuditCompletionScreen } from '../screens/auditor/ClientAuditCompletionScreen';
import { UpdatesScreen } from '../screens/auditor/UpdatesScreen';
import { AuditorStackParamList } from './navigationTypes';
const S = createNativeStackNavigator<AuditorStackParamList>();
export function AuditorNavigator() {
  return (
    <S.Navigator
      screenOptions={{ headerBackTitle: 'Back', headerTintColor: '#2459D3' }}
    >
      <S.Screen
        name="Dashboard"
        component={DailyOverviewScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="ProjectSelection"
        component={ProjectSelectionNativeScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="AuditOverview"
        component={AuditStartScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="Assessment"
        component={AuditAssessmentNativeScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="ControlMeasures"
        component={ControlMeasuresScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="ChecklistResponse"
        component={ChecklistResponseScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="Documents"
        component={DocumentsScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="AssetVerification"
        component={AssetVerificationFlowScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="VisitSheet"
        component={VisitSheetScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="PreviousNcReview"
        component={PreviousNcReviewScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="ClientAuditCheckIn"
        component={ClientAuditCheckInScreen}
        options={{ headerShown: false }}
      />
      <S.Screen name="ClientAuditModules" component={ClientAuditModulesScreen} options={{ headerShown: false }} />
      <S.Screen name="ClientAuditResponse" component={ClientAuditResponseScreen} options={{ headerShown: false }} />
      <S.Screen name="ClientAuditCompletion" component={ClientAuditCompletionScreen} options={{ headerShown: false }} />
      <S.Screen
        name="Reports"
        component={ReportHistoryScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="Notifications"
        component={NotificationHistoryScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="Updates"
        component={UpdatesScreen}
        options={{ headerShown: false }}
      />
      <S.Screen
        name="HelpSupport"
        component={HelpSupportScreen}
        options={{ title: 'Help & Support' }}
      />
    </S.Navigator>
  );
}
