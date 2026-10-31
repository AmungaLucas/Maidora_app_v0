// PostJob (employer) — create a listing. Edit lands later via PATCH; this
// screen covers the create path the hub CTA opens.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Banner, PrimaryButton, Screen, ScreenHeader, TextField } from '../../ui';
import { ChipRow } from '../../components/market/cards';

const JOB_TYPES = [
  { value: 'live_in', label: 'Live-in' },
  { value: 'live_out', label: 'Live-out' },
  { value: 'day_burg', label: 'Day burg' },
];

export default function PostJobScreen({ navigation }) {
  const { token, user } = useApp();
  const [form, setForm] = useState({
    title: '',
    description: '',
    jobType: '',
    county: user?.locationCounty || '',
    area: user?.locationArea || '',
    salaryAmount: '',
  });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setSaving(true);
    setBanner('');
    setErrors({});
    try {
      await api.postJob(
        {
          title: form.title,
          description: form.description,
          jobType: form.jobType,
          county: form.county,
          area: form.area,
          salaryAmount: form.salaryAmount ? Number(form.salaryAmount) : null,
        },
        token
      );
      setDone(true);
      setTimeout(() => navigation.goBack(), 700);
    } catch (e) {
      if (e?.errors) setErrors(e.errors);
      setBanner(e?.message || 'Could not post the job. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen keyboard={false}>
      <ScreenHeader
        eyebrow="Employer · New listing"
        title="Post a Job"
        subtitle="Clear duties and days attract the right applicants."
      />
      <Banner kind="error" message={banner} />
      {done ? <Banner kind="success" message="Job posted — it is live under Find Jobs." /> : null}

      <TextField
        label="Job title"
        value={form.title}
        onChangeText={set('title')}
        error={errors.title}
        placeholder="e.g. Full-time house help — live in"
        maxLength={120}
      />
      <TextField
        label="Duties & expectations"
        value={form.description}
        onChangeText={set('description')}
        error={errors.description}
        placeholder="Cleaning, laundry, cooking, days off, start date…"
        multiline
        style={{ fontSize: 16, color: colors.ink, minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }}
        maxLength={2000}
      />

      <View style={{ marginTop: 6 }}>
        <Text style={styles.label}>Job type</Text>
        <ChipRow options={JOB_TYPES} value={form.jobType} onChange={set('jobType')} allLabel="Pick one" />
        {errors.jobType ? <Text style={styles.errorText}>{errors.jobType}</Text> : null}
      </View>

      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <TextField label="County" value={form.county} onChangeText={set('county')} placeholder="Nairobi" maxLength={120} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Area / estate" value={form.area} onChangeText={set('area')} placeholder="Kilimani" maxLength={120} />
        </View>
      </View>

      <TextField
        label="Monthly salary (optional)"
        value={form.salaryAmount}
        onChangeText={set('salaryAmount')}
        error={errors.salaryAmount}
        placeholder="e.g. 15000"
        keyboardType="number-pad"
        hint="Listed jobs with a salary get more applications."
      />

      <PrimaryButton
        title={done ? 'Posted ✓' : 'Post job'}
        onPress={submit}
        loading={saving}
        loadingLabel="Posting…"
        disabled={!form.title || !form.description || !form.jobType || done}
        style={{ marginTop: 8 }}
      />
      <View style={styles.noteRow}>
        <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
        <Text style={styles.note}>
          Applicants can only apply after phone verification — spam stays out.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', color: colors.ink, marginBottom: 8 },
  errorText: { marginTop: 6, fontSize: 12, color: colors.danger },
  row2: { flexDirection: 'row', gap: 10 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  note: { flex: 1, fontSize: 12, color: colors.muted, lineHeight: 18 },
});
