import {Platform} from 'react-native';

export const c = {
  bg: '#F2F2EF',
  surface: '#FFFFFF',
  line: '#E3E3DE',
  lineStrong: '#CFCFC9',
  text: '#1B1C1A',
  muted: '#5E625C',
  faint: '#8A8E88',
  green: '#1E6B3A',
  greenDark: '#17562E',
  greenSoft: '#E5EFE7',
  greenLine: '#9CC3A6',
  red: '#B42318',
  redSoft: '#FDECEA',
  redLine: '#F3C3BE',
  amber: '#8A4B00',
  amberSoft: '#FCEFD6',
  blue: '#1E4F91',
  blueSoft: '#E6EEF9',
  ink: '#151715',
  inkSoft: '#262A26',
  inkLine: '#3A3F3A',
  disabled: '#C8CEC8',
  disabledText: '#5D665F',
  navy: '#1D3557',
};

export const mono = Platform.select({ios: 'Menlo', default: 'monospace'});

export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'dark';

export const tones: Record<Tone, {bg: string; fg: string; line: string}> = {
  green: {bg: c.greenSoft, fg: c.green, line: c.greenLine},
  red: {bg: c.redSoft, fg: c.red, line: c.redLine},
  amber: {bg: c.amberSoft, fg: c.amber, line: '#EBCB8B'},
  blue: {bg: c.blueSoft, fg: c.blue, line: '#B7C9E8'},
  gray: {bg: '#ECECE8', fg: c.muted, line: c.line},
  dark: {bg: c.ink, fg: '#FFFFFF', line: c.ink},
};
