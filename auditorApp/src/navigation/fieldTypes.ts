import {CompositeScreenProps, NavigatorScreenParams} from '@react-navigation/native';
import {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

export type FieldTabParamList = {
  Home: undefined;
  Audits: undefined;
  Calendar: undefined;
  Reports: undefined;
  More: undefined;
};

export type FieldStackParamList = {
  Tabs: NavigatorScreenParams<FieldTabParamList> | undefined;
  Briefing: {jobId: string};
  CheckIn: {jobId: string};
  AuditOverview: {jobId: string};
  Point: {jobId: string; itemId: string};
  Finish: {jobId: string};
  ProposePoint: {jobId: string; discipline?: string; sectionName?: string};
  ReportDetail: {reportId: string};
  Correction: {reportId: string};
  CapaVerify: {jobId?: string};
  DealerQuestions: {reportId: string};
  Notifications: undefined;
  Profile: undefined;
  Training: undefined;
  OfflineSync: undefined;
  Legacy: undefined;
};

export type StackProps<K extends keyof FieldStackParamList> = NativeStackScreenProps<FieldStackParamList, K>;
export type TabProps<K extends keyof FieldTabParamList> = CompositeScreenProps<BottomTabScreenProps<FieldTabParamList, K>, NativeStackScreenProps<FieldStackParamList>>;
