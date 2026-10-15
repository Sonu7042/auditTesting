import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

const logo = require('./bexex-logo.png');

export function BrandLogo({
  width = 126,
  style,
}: {
  width?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      accessibilityLabel="Bexex"
      source={logo}
      resizeMode="contain"
      style={[{ width, height: width * 0.3 }, style]}
    />
  );
}
