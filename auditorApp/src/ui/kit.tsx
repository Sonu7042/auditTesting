import React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from '../components/common/AppIcon';
import {c, mono, Tone, tones} from './theme';

export {Icon};

type ScreenProps = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  closeIcon?: boolean;
  right?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  dark?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
};

export function Screen({title, subtitle, onBack, closeIcon, right, footer, children, scroll = true, refreshing, onRefresh, dark, contentStyle, scrollEnabled = true}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const fg = dark ? '#FFFFFF' : c.text;
  const body = scroll ? (
    <ScrollView
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[s.content, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.green} colors={[c.green]} /> : undefined}>
      {children}
    </ScrollView>
  ) : (
    <View style={[s.fill, contentStyle]}>{children}</View>
  );
  return (
    <KeyboardAvoidingView style={[s.fill, {backgroundColor: dark ? c.ink : c.bg}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {title !== undefined && (
        <View style={[s.header, {paddingTop: insets.top + 10}, dark && s.headerDark]}>
          {onBack && (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={s.back}>
              <Icon name={closeIcon ? 'x' : 'chevron-left'} size={24} color={fg} />
            </Pressable>
          )}
          <View style={s.headerText}>
            <Text style={[s.headerTitle, {color: fg}]} numberOfLines={1}>{title}</Text>
            {!!subtitle && <Text style={[s.headerSub, dark && {color: '#B9BEB8'}]} numberOfLines={1}>{subtitle}</Text>}
          </View>
          {right}
        </View>
      )}
      {title === undefined && <View style={{height: insets.top}} />}
      {body}
      {footer && <View style={[s.footer, {paddingBottom: Math.max(insets.bottom, 12) + 4}, dark && s.footerDark]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

export function PageTitle({title, subtitle, right}: {title: string; subtitle?: string; right?: React.ReactNode}) {
  return (
    <View style={s.pageTitleRow}>
      <View style={s.fill}>
        <Text style={s.pageTitle}>{title}</Text>
        {!!subtitle && <Text style={s.pageSub}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function Card({children, style, tone, onPress}: {children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: Tone; onPress?: () => void}) {
  const t = tone ? tones[tone] : null;
  const st = [s.card, t && {backgroundColor: t.bg, borderColor: t.line}, style];
  if (onPress) return <Pressable onPress={onPress} style={({pressed}) => [st, pressed && s.pressed]}>{children}</Pressable>;
  return <View style={st}>{children}</View>;
}

export function Badge({label, tone = 'gray', style}: {label: string; tone?: Tone; style?: StyleProp<ViewStyle>}) {
  const t = tones[tone];
  return (
    <View style={[s.badge, {backgroundColor: t.bg}, style]}>
      <Text style={[s.badgeText, {color: t.fg}]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'light' | 'outlineDark';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Button({label, onPress, variant = 'primary', disabled, loading, icon, style, small}: ButtonProps) {
  const v = {
    primary: {bg: c.green, fg: '#FFFFFF', line: c.green},
    secondary: {bg: c.surface, fg: c.text, line: c.lineStrong},
    danger: {bg: c.surface, fg: c.red, line: c.redLine},
    light: {bg: '#FFFFFF', fg: c.text, line: '#FFFFFF'},
    outlineDark: {bg: 'transparent', fg: '#FFFFFF', line: c.inkLine},
  }[variant];
  const off = disabled || loading;
  const bg = off && variant === 'primary' ? c.disabled : v.bg;
  const fg = off && variant === 'primary' ? c.disabledText : v.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: !!off}}
      disabled={off}
      onPress={onPress}
      style={({pressed}) => [s.button, small && s.buttonSmall, {backgroundColor: bg, borderColor: off && variant === 'primary' ? c.disabled : v.line}, off && variant !== 'primary' && s.dim, pressed && s.pressed, style]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <Text style={[s.buttonText, small && s.buttonTextSmall, {color: fg}]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chips<T extends string>({options, value, onChange}: {options: Array<{key: T; label: string}>; value: T; onChange: (v: T) => void}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      {options.map(o => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Segmented<T extends string>({options, value, onChange, style}: {options: Array<{key: T; label: string; sub?: string}>; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle>}) {
  return (
    <View style={[s.seg, style]}>
      {options.map(o => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.segItem, on && s.segItemOn]}>
            <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{o.label}</Text>
            {!!o.sub && <Text style={s.segSub}>{o.sub}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

type FieldProps = TextInputProps & {label?: string; required?: boolean; error?: string; right?: React.ReactNode; inputStyle?: StyleProp<TextStyle>};

export function Field({label, required, error, right, style, inputStyle, multiline, ...props}: FieldProps) {
  return (
    <View style={[s.field, style as StyleProp<ViewStyle>]}>
      {!!label && <Text style={s.fieldLabel}>{label}{required ? ' *' : ''}</Text>}
      <View style={[s.inputWrap, !!error && {borderColor: c.red}]}>
        <TextInput placeholderTextColor={c.faint} multiline={multiline} style={[s.input, multiline && s.multiline, inputStyle]} {...props} />
        {right}
      </View>
      {!!error && <Text style={s.fieldError}>{error}</Text>}
    </View>
  );
}

export function ChoiceButton({label, selected, tone = 'green', onPress, style, small}: {label: string; selected: boolean; tone?: 'green' | 'red' | 'gray'; onPress: () => void; style?: StyleProp<ViewStyle>; small?: boolean}) {
  const t = tone === 'red' ? {bg: c.redSoft, line: c.red, fg: c.red} : tone === 'gray' ? {bg: '#ECECE8', line: c.muted, fg: c.text} : {bg: c.greenSoft, line: c.green, fg: c.text};
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{selected}}
      onPress={onPress}
      style={[s.choice, small && s.choiceSmall, selected && {backgroundColor: t.bg, borderColor: t.line, borderWidth: 1.5}, style]}>
      <Text style={[s.choiceText, small && s.choiceTextSmall, selected && {color: t.fg}]}>{label}</Text>
    </Pressable>
  );
}

export function Progress({value, tone = 'green', height = 6, track = c.line}: {value: number; tone?: 'green' | 'amber' | 'red'; height?: number; track?: string}) {
  const color = tone === 'amber' ? c.amber : tone === 'red' ? c.red : c.green;
  return (
    <View style={{height, borderRadius: height, backgroundColor: track, overflow: 'hidden'}}>
      <View style={{width: `${Math.max(0, Math.min(100, value))}%`, height, backgroundColor: color, borderRadius: height}} />
    </View>
  );
}

export function Toggle({value, onChange}: {value: boolean; onChange: (v: boolean) => void}) {
  return <Switch value={value} onValueChange={onChange} trackColor={{false: c.lineStrong, true: c.green}} thumbColor="#FFFFFF" ios_backgroundColor={c.lineStrong} />;
}

export function Loading({label}: {label?: string}) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={c.green} size="large" />
      {!!label && <Text style={[s.muted, {marginTop: 10}]}>{label}</Text>}
    </View>
  );
}

export function ErrorBox({message, onRetry}: {message: string; onRetry?: () => void}) {
  return (
    <View style={s.error}>
      <Icon name="alert-circle" size={18} color={c.red} />
      <Text style={s.errorText}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={s.retry}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Empty({title, body, icon = 'clipboard-list'}: {title: string; body?: string; icon?: string}) {
  return (
    <View style={s.empty}>
      <Icon name={icon} size={30} color={c.faint} />
      <Text style={s.emptyTitle}>{title}</Text>
      {!!body && <Text style={s.emptyBody}>{body}</Text>}
    </View>
  );
}

export function SectionLabel({children, style}: {children: React.ReactNode; style?: StyleProp<TextStyle>}) {
  return <Text style={[s.sectionLabel, style]}>{children}</Text>;
}

export function Row({title, sub, left, right, onPress, last}: {title: string; sub?: string; left?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; last?: boolean}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({pressed}) => [s.row, !last && s.rowLine, pressed && s.pressed]}>
      {left}
      <View style={s.fill}>
        <Text style={s.rowTitle}>{title}</Text>
        {!!sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={18} color={c.muted} /> : null)}
    </Pressable>
  );
}

export function Mono({children, style}: {children: React.ReactNode; style?: StyleProp<TextStyle>}) {
  return <Text style={[s.mono, style]}>{children}</Text>;
}

export function Photo({uri, label, style, children}: {uri?: string; label?: string; style?: StyleProp<ViewStyle>; children?: React.ReactNode}) {
  return (
    <View style={[s.photo, style]}>
      {uri ? <Image source={{uri}} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Text style={s.photoLabel}>{label}</Text>}
      {children}
    </View>
  );
}

export const s = StyleSheet.create({
  fill: {flex: 1},
  content: {padding: 16, paddingBottom: 32, gap: 12},
  header: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line},
  headerDark: {backgroundColor: c.ink, borderBottomColor: c.ink},
  back: {width: 32, height: 32, alignItems: 'center', justifyContent: 'center'},
  headerText: {flex: 1},
  headerTitle: {fontSize: 18, fontWeight: '700', color: c.text},
  headerSub: {fontSize: 12.5, color: c.muted, marginTop: 1},
  footer: {paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, gap: 10},
  footerDark: {backgroundColor: c.ink, borderTopColor: c.ink},
  pageTitleRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4},
  pageTitle: {fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -0.3},
  pageSub: {fontSize: 14, color: c.muted, marginTop: 4, lineHeight: 20},
  card: {backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 16},
  pressed: {opacity: 0.75},
  badge: {alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4},
  badgeText: {fontSize: 12, fontWeight: '700'},
  button: {minHeight: 52, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14},
  buttonSmall: {minHeight: 42, borderRadius: 12},
  buttonText: {fontSize: 16, fontWeight: '700'},
  buttonTextSmall: {fontSize: 14},
  dim: {opacity: 0.5},
  chips: {gap: 8, paddingVertical: 2},
  chip: {borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9},
  chipOn: {backgroundColor: c.ink, borderColor: c.ink},
  chipText: {fontSize: 14, fontWeight: '600', color: c.text},
  chipTextOn: {color: '#FFFFFF'},
  seg: {flexDirection: 'row', backgroundColor: '#E2E4DF', borderRadius: 12, padding: 3},
  segItem: {flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4},
  segItemOn: {backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: {width: 0, height: 1}, elevation: 1},
  segText: {fontSize: 13.5, fontWeight: '600', color: c.muted},
  segTextOn: {color: c.text, fontWeight: '700'},
  segSub: {fontSize: 11, color: c.muted, fontFamily: mono, marginTop: 1},
  field: {gap: 6},
  fieldLabel: {fontSize: 13, fontWeight: '700', color: c.text},
  inputWrap: {flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.lineStrong, borderRadius: 12, backgroundColor: c.surface},
  input: {flex: 1, minHeight: 48, paddingHorizontal: 13, fontSize: 15, color: c.text},
  multiline: {minHeight: 56, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top'},
  fieldError: {fontSize: 12.5, color: c.red},
  choice: {flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6},
  choiceSmall: {minHeight: 42},
  choiceText: {fontSize: 16, fontWeight: '700', color: c.text},
  choiceTextSmall: {fontSize: 13.5},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 200},
  muted: {fontSize: 13, color: c.muted},
  error: {flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.redSoft, borderColor: c.redLine, borderWidth: 1, borderRadius: 12, padding: 12},
  errorText: {flex: 1, color: c.red, fontSize: 13.5, lineHeight: 19},
  retry: {color: c.red, fontWeight: '800', fontSize: 13.5},
  empty: {alignItems: 'center', padding: 28, gap: 8},
  emptyTitle: {fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center'},
  emptyBody: {fontSize: 13.5, color: c.muted, textAlign: 'center', lineHeight: 19},
  sectionLabel: {fontSize: 12, fontWeight: '700', color: c.muted, letterSpacing: 1, textTransform: 'uppercase', fontFamily: mono},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13},
  rowLine: {borderBottomWidth: 1, borderBottomColor: c.line},
  rowTitle: {fontSize: 15, fontWeight: '600', color: c.text},
  rowSub: {fontSize: 12.5, color: c.muted, marginTop: 2},
  mono: {fontFamily: mono, fontSize: 12, color: c.muted},
  photo: {borderRadius: 12, backgroundColor: '#DFE3DE', overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
  photoLabel: {fontSize: 13, color: c.muted},
});
