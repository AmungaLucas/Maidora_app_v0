// Find Jobs (Househelp) — placeholder until listings ship.
import React from 'react';
import { colors } from '../theme';
import { EmptyState, Screen, ScreenHeader } from '../ui';

export default function FindJobsScreen() {
  return (
    <Screen keyboard={false}>
      <ScreenHeader
        eyebrow="Househelp · Find work"
        title="Find Jobs"
        subtitle="Household jobs near you, matched to your skills."
      />
      <EmptyState
        icon="briefcase-outline"
        title="No job listings yet"
        body="Families near you will post cleaning, childcare and cooking jobs here. You will be able to apply with one tap."
        badge="Listings are coming in the next release"
      />
    </Screen>
  );
}
