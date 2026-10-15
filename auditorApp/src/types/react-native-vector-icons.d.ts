declare module 'react-native-vector-icons/Feather' {
  import {ComponentType} from 'react';
  import {TextProps} from 'react-native';

  export interface IconProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  const FeatherIcon: ComponentType<IconProps>;
  export default FeatherIcon;
}
