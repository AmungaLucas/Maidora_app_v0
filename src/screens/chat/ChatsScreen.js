// Chats — conversations between households and house helps (shared by both roles).
import React from 'react';
import { colors } from '../../theme';
import { EmptyState, Screen, ScreenHeader } from '../../ui';

export default function ChatsScreen() {
  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Messages"
        title="Chats"
        subtitle="Talk before you hire — interviews, details, directions."
      />
      <EmptyState
        icon="chatbubbles-outline"
        title="No conversations yet"
        body="When you start an interview or reply to a job, your chats will live here."
        badge="Chat opens with the first matches"
      />
    </Screen>
  );
}
