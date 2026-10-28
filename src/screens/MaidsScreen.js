// Maids (Employer) — browse and discover verified house helps.
import React from 'react';
import { colors } from '../theme';
import { EmptyState, Screen, ScreenHeader } from '../ui';

export default function MaidsScreen() {
  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Employer · Discover"
        title="Maids"
        subtitle="Verified house helps near you, with reviews."
      />
      <EmptyState
        icon="people-outline"
        title="Browsing opens soon"
        body="You will browse verified profiles with experience, skills, reviews and availability — and save favourites to your shortlist."
        badge="Profiles are coming in the next release"
      />
    </Screen>
  );
}
