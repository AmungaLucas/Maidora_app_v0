// Full vertical lockup: mark + MAIDORA + "Trusted help for your household".
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BrandMark from './BrandMark';
import { colors, fonts } from '../../theme';

export default function BrandLockup({
  markSize = 132,
  wordSize = 34,
  tagSize = 10.5,
  ink = colors.brandSoft,
  pillar,
  accent = colors.gold,
  word = colors.brand,
  tag = colors.goldDark,
  showTag = true,
  gap = 20,
}) {
  return (
    <View style={[styles.col, { gap }]}>
      <BrandMark size={markSize} ink={ink} pillar={pillar} accent={accent} />
      <Text
        style={[
          styles.word,
          { fontSize: wordSize, color: word, fontFamily: fonts.bold },
        ]}
      >
        MAIDORA
      </Text>
      {showTag ? (
        <Text
          style={[
            styles.tag,
            { fontSize: tagSize, color: tag, fontFamily: fonts.medium },
          ]}
        >
          Trusted help for your household
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: 'center' },
  word: {
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: 8.2, // 0.24em of 34px
    textAlign: 'center',
  },
  tag: {
    fontWeight: '500',
    marginTop: 12,
    letterSpacing: 2.9, // 0.28em of 10.5px
    textTransform: 'uppercase',
    opacity: 0.93,
    textAlign: 'center',
  },
});
