// Forgot password — placeholder until email delivery (nodemailer) is switched on.
import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { LINKS, colors, radius } from '../../theme';
import { PrimaryButton, Screen } from '../../ui';

export default function ForgotPasswordScreen({ navigation }) {
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      {/* Back button comes from the native-stack header (App.js); the title
          stays in the content. */}
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.body}>
        Password resets are sent by email or SMS. We are switching on automated delivery right
        now — in the meantime, our support team can help you get back into your account.
      </Text>

      <View style={{ flex: 1, minHeight: 20 }} />

      <View style={styles.supportCard}>
        <Text style={styles.supportTitle}>Need help now?</Text>
        <Text style={styles.supportBody}>
          Email us and we will verify your identity and reset your access.
        </Text>
        <Text
          style={styles.supportLink}
          onPress={() => Linking.openURL(`mailto:${LINKS.supportEmail}`)}
        >
          {LINKS.supportEmail}
        </Text>
      </View>

      <PrimaryButton title="Back to Log In" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, marginTop: 10 },
  body: { marginTop: 10, fontSize: 15, lineHeight: 23, color: colors.muted },
  supportCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    marginBottom: 22,
  },
  supportTitle: { fontSize: 16, fontWeight: '800', color: colors.forest },
  supportBody: { marginTop: 6, fontSize: 14, lineHeight: 21, color: colors.muted },
  supportLink: { marginTop: 10, color: colors.forest, fontWeight: '800', fontSize: 15, textDecorationLine: 'underline' },
});
