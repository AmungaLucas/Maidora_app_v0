// DatePickerModal — three-step date picker popup (§7 profile DOB, §8 KYC DOB).
// The user picks the YEAR first, then the MONTH, then the DAY — each step in
// the same popup, with a back link to revisit the previous step. Built on the
// built-in Modal (no new native deps) and styled like the app's bottom sheet.
//
//   <DatePickerModal
//     visible={open}
//     initialDate={form.dateOfBirth}        // ISO 'YYYY-MM-DD' or ''
//     onClose={() => setOpen(false)}
//     onConfirm={(iso) => setForm(...)}
//     title="Your date of birth"
//     minAge={16} maxAge={80}               // defaults match server validation
//   />
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');

export default function DatePickerModal({
  visible,
  onClose,
  onConfirm,
  initialDate,
  title = 'Select date',
  minAge = 16,
  maxAge = 80,
}) {
  // step 1 = year, 2 = month, 3 = day
  const [step, setStep] = useState(1);
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null); // 1..12
  const [day, setDay] = useState(null); // 1..31

  // Re-seed every time the popup opens (fresh pick, or prefill from a saved value).
  useEffect(() => {
    if (!visible) return;
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      const [y, m, d] = initialDate.split('-').map(Number);
      setYear(y);
      setMonth(m);
      setDay(d);
      setStep(3);
    } else {
      setYear(null);
      setMonth(null);
      setDay(null);
      setStep(1);
    }
  }, [visible, initialDate]);

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const list = [];
    for (let y = currentYear - minAge; y >= currentYear - maxAge; y -= 1) list.push(y);
    return list;
  }, [currentYear, minAge, maxAge]);

  const daysInMonth = year && month ? new Date(year, month, 0).getDate() : 31;

  const pickYear = (y) => {
    setYear(y);
    setStep(2);
  };
  const pickMonth = (m) => {
    setMonth(m);
    // Clamp an impossible day when switching to a shorter month.
    const max = new Date(year, m, 0).getDate();
    if (day && day > max) setDay(max);
    setStep(3);
  };

  const confirm = () => {
    if (!year || !month || !day) return;
    onConfirm(`${year}-${pad(month)}-${pad(day)}`);
    onClose();
  };

  const summary = [
    { label: year ? String(year) : 'Year', filled: !!year },
    { label: month ? MONTHS[month - 1] : 'Month', filled: !!month },
    { label: day ? String(day) : 'Day', filled: !!day },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.stepLabel}>Step {step} of 3 — {step === 1 ? 'year of birth' : step === 2 ? 'month' : 'day'}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {/* Selection summary */}
          <View style={styles.summaryRow}>
            {summary.map((s, i) => (
              <View key={i} style={[styles.summaryPill, s.filled && styles.summaryPillActive, step === i + 1 && styles.summaryPillCurrent]}>
                <Text style={[styles.summaryText, s.filled && styles.summaryTextActive]} numberOfLines={1}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Step 1 — year */}
          {step === 1 ? (
            <ScrollView style={styles.yearList} contentContainerStyle={styles.yearGrid} showsVerticalScrollIndicator={false}>
              {years.map((y) => (
                <Pressable key={y} style={[styles.yearItem, year === y && styles.gridItemActive]} onPress={() => pickYear(y)}>
                  <Text style={[styles.yearText, year === y && styles.gridTextActive]}>{y}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {/* Step 2 — month */}
          {step === 2 ? (
            <View style={styles.gridWrap}>
              <View style={styles.grid}>
                {MONTHS.map((m, i) => {
                  const idx = i + 1;
                  return (
                    <Pressable key={m} style={[styles.monthItem, month === idx && styles.gridItemActive]} onPress={() => pickMonth(idx)}>
                      <Text style={[styles.monthText, month === idx && styles.gridTextActive]}>{m.slice(0, 3)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Step 3 — day */}
          {step === 3 ? (
            <View style={styles.gridWrap}>
              <Text style={styles.dayHint}>{month ? `${MONTHS[month - 1]} ${year || ''} — pick the day` : 'Pick the day'}</Text>
              <View style={styles.grid}>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.dayItem, day === d && styles.gridItemActive]}
                    onPress={() => setDay(d)}
                  >
                    <Text style={[styles.dayText, day === d && styles.gridTextActive]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Footer — back + confirm */}
          <View style={styles.footer}>
            {step > 1 ? (
              <Pressable
                onPress={() => setStep((s) => Math.max(1, s - 1))}
                style={styles.backBtn}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={16} color={colors.forest} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>
            ) : (
              <View style={{ width: 70 }} />
            )}
            <Pressable
              style={[styles.confirmBtn, (!year || !month || !day) && styles.confirmBtnDisabled]}
              onPress={confirm}
              disabled={!year || !month || !day}
            >
              <Text style={styles.confirmText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(22,38,29,0.45)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 22,
    paddingBottom: 30,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  stepLabel: { marginTop: 3, fontSize: 12.5, color: colors.muted, fontWeight: '600' },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  summaryPill: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  summaryPillActive: { borderColor: colors.forest },
  summaryPillCurrent: { borderColor: colors.gold, backgroundColor: colors.goldSoft || '#FBF3E3' },
  summaryText: { fontSize: 14.5, fontWeight: '700', color: colors.muted },
  summaryTextActive: { color: colors.forest },
  yearList: { maxHeight: 300, marginTop: 14 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  yearItem: {
    width: '23%',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  yearText: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  gridWrap: { marginTop: 14 },
  dayHint: { fontSize: 12.5, color: colors.muted, fontWeight: '600', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthItem: {
    width: '31%',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  monthText: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  dayItem: {
    width: '12.6%',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: colors.cream,
  },
  dayText: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  gridItemActive: { borderColor: colors.forest, backgroundColor: colors.greenSoft },
  gridTextActive: { color: colors.forest },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 10 },
  backText: { color: colors.forest, fontWeight: '700', fontSize: 15 },
  confirmBtn: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
