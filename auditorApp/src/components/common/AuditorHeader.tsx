import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Feather from './AppIcon';   
import { NavigationProp } from '@react-navigation/native';    
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MenuIcon from '../../assets/auditor/menu.svg';    
import HomeIcon from '../../assets/auditor/home.svg';  
import ClipboardListIcon from '../../assets/auditor/clipboard_list.svg';   
import SquarePenIcon from '../../assets/auditor/square_pen.svg';    
import RefreshCwIcon from '../../assets/auditor/refresh_cw.svg';
import CalendarDaysIcon from '../../assets/header/calendar_days.svg';
import HelpIcon from '../../assets/header/help_icon.svg';
import LogoutIcon from '../../assets/header/logout.svg';
import MoonIcon from '../../assets/header/moon.svg';
import NotificationBellIcon from '../../assets/header/notification_bell.svg';
import { BrandLogo } from './BrandLogo';   
import { AuditorStackParamList } from '../../navigation/navigationTypes';
import { useAuditContext } from '../../store/AuditContext';
import { useAuth } from '../../store/AuthContext'; 
import { useNotifications } from '../../store/NotificationContext';
import { useAppTheme } from '../../store/ThemeContext';

const menuItems: {      
  label: string;         
  icon: React.ComponentType<{
    width?: number;
    height?: number;
    color?: string;
    fill?: string;
  }>;
  route: keyof AuditorStackParamList;
}[] = [
  { label: 'Home', icon: HomeIcon, route: 'Dashboard' },
  { label: 'New Audit', icon: ClipboardListIcon, route: 'ProjectSelection' },
  { label: 'Reports', icon: SquarePenIcon, route: 'Reports' },
  { label: 'Schedule', icon: CalendarDaysIcon, route: 'Schedule' },
  { label: 'Update', icon: RefreshCwIcon, route: 'Updates' },
];

type Nav = NavigationProp<AuditorStackParamList>;

export function AuditorHeader({ navigation }: { navigation: Nav }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const tablet = width >= 768;
  const largeTablet = width >= 1024;
  const notificationIconSize = compact ? 20 : largeTablet ? 26 : tablet ? 24 : 22;
  const profileActionIconSize = compact ? 14 : largeTablet ? 18 : tablet ? 17 : 16;
  const drawerIconSize = compact ? 20 : largeTablet ? 26 : tablet ? 24 : 22;
  const currentRoute = navigation.getState().routes[navigation.getState().index]?.name;
  const { user, logout } = useAuth();
  const { clear } = useAuditContext();
  const { unreadCount } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false); 
  const [profileOpen, setProfileOpen] = useState(false);
  const {isDark: nightMode, setDark: changeNightMode} = useAppTheme();

  const initials = (user?.fullName || 'A')
    .trim()
    .split(/\s+/)
    .map(value => value[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const go = async (route: keyof AuditorStackParamList) => {
    setMenuOpen(false);
    if (route === 'ProjectSelection') await clear();
    navigation.navigate(route as never);
  };

  return (
    <View
      style={[
        styles.header,
        compact && styles.headerCompact,
        tablet && styles.headerTablet,
        largeTablet && styles.headerLargeTablet,
        nightMode && styles.headerDark,
        { paddingTop: insets.top + 10 },
      ]}
    >
      <Pressable
        accessibilityLabel="Open menu"
        onPress={() => setMenuOpen(true)}
        style={styles.menuButton}
      >
        <MenuIcon width={tablet ? 30 : 27} height={tablet ? 30 : 27} />

      </Pressable>
      <Pressable
        onPress={() => go('Dashboard')}
        style={[styles.logoWrap, nightMode && styles.logoDarkBackground]}
      >
        <BrandLogo width={compact ? 68 : largeTablet ? 96 : tablet ? 86 : 78} />
      </Pressable>
      <View style={styles.headerSpacer} />
      <Pressable
        accessibilityLabel="Notifications"
        onPress={() => navigation.navigate('Notifications')} 
        style={[
          styles.bell,
          compact && styles.bellCompact,
          tablet && styles.bellTablet,
        ]}
      >
        <NotificationBellIcon
          width={notificationIconSize} 
          height={notificationIconSize}                 
          color={nightMode ? '#FFF' : '#202020'}  
        />  
        {unreadCount > 0 && (
          <View style={[styles.badge, compact && styles.badgeCompact]}>
            <Text style={[styles.badgeText, compact && styles.badgeTextCompact]}>
              {unreadCount > 9 ? '9+' : unreadCount} 
            </Text>
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityLabel="Open profile menu"
        onPress={() => setProfileOpen(true)}
        style={styles.avatar}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </Pressable>

      <Modal
        transparent
        visible={menuOpen}
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          style={styles.drawerBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable      
            style={[
              styles.drawer,    
              {
                paddingTop: insets.top + 18,
                width: tablet ? Math.min(340, width * 0.46) : Math.min(280, width * 0.82),
              },
              nightMode && styles.drawerDark, 
            ]}
            onPress={event => event.stopPropagation()}   
          >  
            <View style={styles.drawerBrand}>   
              <BrandLogo width={86} />  
              <Pressable onPress={() => setMenuOpen(false)}> 
                <Feather
                  name="x"
                  size={24}
                  color={nightMode ? 'white' : '#222'}
                />
              </Pressable>
            </View>
            {menuItems.map(item => {
              const ItemIcon = item.icon;
              const isActive = currentRoute === item.route;
              return (
                    <Pressable
                      key={item.label}
                      style={[styles.drawerItem, tablet && styles.drawerItemTablet, isActive && styles.drawerItemActive]}
                      onPress={() => go(item.route)}
                    >
                      <ItemIcon
                        width={drawerIconSize}
                        height={drawerIconSize}
                        color={isActive ? '#5646FF' : nightMode ? '#FFF' : '#111'}
                        fill={isActive ? '#5646FF' : 'none'}
                      />
                      <Text style={[styles.drawerText, tablet && styles.drawerTextTablet, nightMode && styles.textDark, isActive && styles.drawerTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={profileOpen}
        animationType="fade"
        onRequestClose={() => setProfileOpen(false)}
      >
        <Pressable
          style={[
            styles.modalBackdrop,
            compact && styles.modalBackdropCompact,
            {
              paddingTop: insets.top + 64,
            },
          ]}
          onPress={() => setProfileOpen(false)}
        >
          <Pressable
            style={[
              styles.profileMenu,
              compact && styles.profileMenuCompact,
              tablet && styles.profileMenuTablet,
              largeTablet && styles.profileMenuLargeTablet,
              nightMode && styles.profileMenuDark,
            ]}
            onPress={event => event.stopPropagation()}
          >
            <View
              style={[
                styles.profileTop,
                compact && styles.profileTopCompact,
                tablet && styles.profileTopTablet,
                nightMode && styles.profileTopDark,
              ]}
            >
              <View
                style={[
                  styles.largeAvatar,
                  compact && styles.largeAvatarCompact,
                  tablet && styles.largeAvatarTablet,
                ]}
              >
                <Text
                  style={[
                    styles.largeAvatarText,
                    compact && styles.largeAvatarTextCompact,
                  ]}
                >
                  {initials}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.profileName,
                  compact && styles.profileNameCompact,
                  nightMode && styles.textDark,
                ]}
              >
                {user?.fullName || user?.username || 'Auditor'}
              </Text>
              <Text style={styles.profileRole}>Auditor</Text>
            </View>
            <View
              style={[
                styles.profileActions,
                compact && styles.profileActionsCompact,
              ]}
            >
              <Pressable
                onPress={() => {
                  setProfileOpen(false);
                  navigation.navigate('HelpSupport');
                }}
                style={[
                  styles.profileAction,
                  compact && styles.profileActionCompact,
                ]}
              >
                <View
                  style={[
                    styles.actionIcon,
                    compact && styles.actionIconCompact,
                  ]}
                >
                  <HelpIcon
                    width={profileActionIconSize}
                    height={profileActionIconSize}
                    color={nightMode ? '#FFF' : '#3B3B3B'}
                  />
                </View>
                <Text style={[styles.actionText, nightMode && styles.textDark]}>
                  Help & Support
                </Text>
              </Pressable>
              <View
                style={[
                  styles.profileAction,
                  compact && styles.profileActionCompact,
                ]}
              >
                <View
                  style={[
                    styles.actionIcon,
                    compact && styles.actionIconCompact,
                  ]}
                >
                  <MoonIcon
                    width={profileActionIconSize}
                    height={profileActionIconSize}
                    color={nightMode ? '#FFF' : '#3B3B3B'}
                  />
                </View>
                <Text style={[styles.actionText, nightMode && styles.textDark]}>
                  Night Mode
                </Text>
                <Switch
                  value={nightMode}
                  onValueChange={changeNightMode}
                  trackColor={{ false: '#CFCFCF', true: '#4B6FB2' }}
                  thumbColor="white"
                  style={[
                    styles.themeSwitch,
                    compact && styles.themeSwitchCompact,
                    tablet && styles.themeSwitchTablet,
                  ]}
                />
              </View>
              <Pressable
                onPress={async () => {
                  setProfileOpen(false);
                  await logout();
                }}
                style={[
                  styles.profileAction,
                  compact && styles.profileActionCompact,
                ]}
              >
                <View
                  style={[
                    styles.actionIcon,
                    compact && styles.actionIconCompact,
                  ]}
                >
                  <LogoutIcon
                    width={profileActionIconSize}
                    height={profileActionIconSize}
                    color={nightMode ? '#FFF' : '#3B3B3B'}
                  />
                </View>
                <Text style={[styles.actionText, nightMode && styles.textDark]}>
                  Logout
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 10,
  },
  headerCompact: { paddingHorizontal: 14 },
  headerTablet: { paddingHorizontal: 36, minHeight: 72 },
  headerLargeTablet: { paddingHorizontal: 48, minHeight: 80 },
  headerDark: { backgroundColor: '#111827' },
  menuButton: {
    width: 48,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  logoWrap: {},
  logoDarkBackground: {
    backgroundColor: 'white',
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  headerSpacer: { flex: 1 },
  bell: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellCompact: { width: 36, height: 36 },
  bellTablet: { width: 44, height: 44 },
  badge: {
    position: 'absolute',
    right: 1,
    top: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF3B48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCompact: {
    right: 0,
    top: 1,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: 'white' },
  badgeTextCompact: { fontSize: 8 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#29394D',
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    marginLeft: 8,
  },
  avatarText: { color: 'white', fontWeight: '800', fontSize: 14 },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.25)',
    alignItems: 'flex-start',
  },
  drawer: {
    width: 250,
    height: '100%',
    backgroundColor: 'white',
    paddingHorizontal: 18,
    elevation: 20,
  },
  drawerDark: { backgroundColor: '#1F2937' },
  drawerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  drawerItem: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 17,
    borderRadius: 14,
    paddingHorizontal: 10,
  },
  drawerItemActive: { backgroundColor: '#F3F1FF' },
  drawerItemTablet: { height: 64, paddingHorizontal: 14 },
  drawerText: { fontSize: 16, fontWeight: '600', color: '#222' },
  drawerTextTablet: { fontSize: 18 },
  drawerTextActive: { color: '#5646FF' },
  textDark: { color: '#F8FAFC' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.16)',
    paddingHorizontal: 18,
    alignItems: 'flex-end',
  },
  modalBackdropCompact: { paddingHorizontal: 10 },
  profileMenu: {
    width: 280,
    maxWidth: '92%',
    backgroundColor: 'rgba(248,248,248,.98)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    padding: 8,
    elevation: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
  },
  profileMenuCompact: { width: 250, borderRadius: 22, padding: 6 },
  profileMenuTablet: { width: 300 },
  profileMenuLargeTablet: { width: 330 },
  profileMenuDark: { backgroundColor: '#1F2937', borderColor: '#374151' },
  profileTop: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 17,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
  },
  profileTopCompact: { paddingTop: 13, paddingBottom: 14 },
  profileTopTablet: { paddingTop: 18, paddingBottom: 19 },
  profileTopDark: { borderBottomColor: '#374151' },
  largeAvatar: {
    width: 72,
    height: 72, 
    borderRadius: 36,
    backgroundColor: '#181919',
    alignItems: 'center',                    
    justifyContent: 'center', 
    elevation: 7,
    marginBottom: 11,
  },
  largeAvatarCompact: { width: 62, height: 62, borderRadius: 31 },
  largeAvatarTablet: { width: 78, height: 78, borderRadius: 39 },
  largeAvatarText: { fontSize: 26, fontWeight: '700', color: 'white' },
  largeAvatarTextCompact: { fontSize: 23 },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#181919',
    maxWidth: '100%',
  },
  profileNameCompact: { fontSize: 18 },
  profileRole: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 5,
  },
  profileActions: { paddingVertical: 7 },
  profileActionsCompact: { paddingVertical: 5 },
  profileAction: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileActionCompact: { minHeight: 43, paddingHorizontal: 8, gap: 10 },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CFCFCF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconCompact: { width: 28, height: 28, borderRadius: 14 },
  actionText: { fontSize: 15, fontWeight: '500', color: '#1F1F1F', flex: 1 },
  themeSwitch: { transform: [{ scale: 0.8 }] },
  themeSwitchCompact: { transform: [{ scale: 0.72 }] },
  themeSwitchTablet: { transform: [{ scale: 0.85 }] },
});
