// My Jobs (Employer) — manage your posted jobs and hires.
import React from 'react';
import { colors } from '../../theme';
import { EmptyState, Screen, ScreenHeader } from '../../ui';

export default function MyJobsScreen() {
  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Employer · Hiring"
        title="My Jobs"
        subtitle="Your job posts, applicants and current hires."
      />
      <EmptyState
        icon="clipboard-outline"
        title="No job posts yet"
        body="Post what you need done — cleaning, childcare, cooking — and review applicants from verified house helps."
        badge="Job posting is coming in the next release"
      />
    </Screen>
  );
}
