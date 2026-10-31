// Hamburger button for screens that live inside the Profile drawer.
// Renders NOTHING when the screen is mounted outside a drawer (e.g. the
// root-stack copies of Settings / Payment / KycIntro opened from the Home
// banners) — those keep their existing headers.
//
// GHOST STYLE (owner feedback 2026-10-31): the old white card + border made
// the button look like a chip floating on the cream header. It is now a bare
// icon with a subtle drop shadow — the shadow rides on the glyph itself via
// textShadow, which renders on BOTH iOS and Android (View elevation needs a
// background to cast from, which we removed on purpose).
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

export default function DrawerMenuButton({ navigation }) {
  if (!navigation || typeof navigation.openDrawer !== 'function') return null;
  return (
    <Pressable
      onPress={() => navigation.openDrawer()}
      hitSlop={10}
      style={styles.menuBtn}
      accessibilityLabel="Open menu"
    >
      <Ionicons name="menu" size={26} color={colors.brand} style={styles.menuGlyph} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menuBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGlyph: {
    textShadowColor: 'rgba(22, 38, 29, 0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
