import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';

type Props = {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

const paths: Record<string, string[]> = {
  'alert-triangle': ['M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z', 'M12 9v4', 'M12 17h.01'],
  'arrow-left': ['m19 12-14 0', 'm12 19-7-7 7-7'],
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  bell: ['M10.27 21a2 2 0 0 0 3.46 0', 'M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33'],
  briefcase: ['M6 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18', 'M16 9h4a2 2 0 0 1 2 2v11', 'M2 22h20', 'M10 6h2', 'M10 10h2', 'M10 14h2', 'M10 18h2', 'M18 13h.01', 'M18 17h.01'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'],
  camera: ['M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z'],
  'check-circle': ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'm9 11 3 3L22 4'],
  check: ['m20 6-11 11-5-5'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-left': ['m15 18-6-6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-up': ['m18 15-6-6-6 6'],
  clock: ['M10 2h4', 'M12 14v-4', 'M4 13a8 8 0 1 0 8-7', 'm9 17-3 3-3-3', 'M6 20v-7'],
  clipboard: ['M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3', 'M9 3h6v4H9Z'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  droplet: ['M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7Z'],
  'edit-2': ['M17 3a2.12 2.12 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5Z'],
  'edit-3': ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z'],
  'file-minus': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'm14 2 6 6', 'M9 15h6'],
  'file-text': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'm14 2 6 6', 'M8 13h8', 'M8 17h8', 'M8 9h2'],
  'help-circle': ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M9.1 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4', 'M12 18h.01'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'm3 16 5-5 4 4 3-3 6 6'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'm22 6-10 7L2 6'],
  'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  'map-pin': ['M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  'plus-circle': ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 8v8', 'M8 12h8'],
  'refresh-cw': ['M21 12a9 9 0 0 0-15.5-6.2L3 8', 'M3 3v5h5', 'M3 12a9 9 0 0 0 15.5 6.2L21 16', 'M16 16h5v5'],
  'rotate-ccw': ['M3 2v6h6', 'M3 8a9 9 0 1 1 2.64 6.36'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z', 'M17 21v-8H7v8', 'M7 3v5h8'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.35-4.35'],
  tool: ['M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5l-8.8 8.8a2.1 2.1 0 0 0 3 3Z'],
  'trash-2': ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v5', 'M14 11v5'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
};

export default function AppIcon({name, size = 24, color = '#222', style}: Props) {
  const iconPaths = paths[name] || paths['help-circle'];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      {name === 'camera' && <Circle cx="12" cy="13" r="3" stroke={color} strokeWidth={1.8} />}
      {name === 'eye' && <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.8} />}
      {name === 'image' && <Circle cx="8.5" cy="8.5" r="1.5" stroke={color} strokeWidth={1.8} />}
      {name === 'map-pin' && <Circle cx="12" cy="10" r="3" stroke={color} strokeWidth={1.8} />}
      {iconPaths.map((d, index) => (
        <Path key={`${name}-${index}`} d={d} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
