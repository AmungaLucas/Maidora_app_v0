// Hamburger button for screens that live inside the Profile drawer.
// Renders NOTHING when the screen is mounted outside a drawer (e.g. the
// root-stack copies of Settings / Payment / KycIntro opened from the Home
// banners) — those keep their existing headers.
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
      <Ionicons name="menu" size={24} color={colors.brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
