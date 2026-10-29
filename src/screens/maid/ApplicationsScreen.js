// Applications (Househelp) — track jobs you have applied for.
import React from 'react';
import { colors } from '../../theme';
import { EmptyState, Screen, ScreenHeader } from '../../ui';

export default function ApplicationsScreen() {
  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Househelp · Applications"
        title="Applications"
        subtitle="Follow every job you have applied for."
      />
      <EmptyState
        icon="document-text-outline"
        title="No applications yet"
        body="Once you apply for jobs, you can track their status here — pending, viewed, interview and hired."
        badge="Applications open with the first job posts"
      />
    </Screen>
  );
}
