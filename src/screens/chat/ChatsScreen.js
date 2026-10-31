// Chats (both roles) — the inbox. Threads load on focus; unread counts come
// from the server (peer messages not yet read_at-stamped).
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { EmptyState, Screen, ScreenHeader } from '../../ui';
import { Avatar, TrustBadge, timeAgo } from '../../components/market/cards';

export default function ChatsScreen({ navigation }) {
  const { token, user } = useApp();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer = null;
      const load = async (quiet = false) => {
        if (!token) return;
        if (!quiet) setLoading(true);
        try {
          const res = await api.chatThreads(token);
          if (!cancelled) setThreads(res.threads || []);
        } catch (e) {
          if (!cancelled) setError(e?.message || 'Could not load chats.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      load();
      // Light refresh while the inbox is visible (new-message awareness).
      timer = setInterval(() => load(true), 12000);
      return () => {
        cancelled = true;
        if (timer) clearInterval(timer);
      };
    }, [token])
  );

  return (
    <Screen keyboard={false} edges={['top', 'left', 'right']}>
      <ScreenHeader
        eyebrow="Your conversations"
        title="Chats"
        subtitle="Phone numbers stay private — chat right here."
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error && !threads.length ? (
        <EmptyState icon="cloud-offline-outline" title="Could not load" body={error} />
      ) : threads.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations yet"
          body={
            user?.role === 'employer'
              ? 'Open a house help profile and tap Message — introduce your household to start.'
              : 'Apply for a job or get discovered — when a household messages you, it lands here.'
          }
        />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => String(t.id)}
          renderItem={({ item: t }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
              onPress={() =>
                navigation.navigate('ChatThread', { threadId: t.id, peerName: t.peer.fullName })
              }
            >
              <Avatar url={t.peer.avatarUrl} name={t.peer.fullName} size={50} />
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.name} numberOfLines={1}>{t.peer.fullName}</Text>
                  {t.peer.trustBadge ? <TrustBadge compact /> : null}
                  <Text style={styles.time}>{t.lastMessageAt ? timeAgo(t.lastMessageAt) : ''}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={[styles.preview, t.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                    {t.lastFromMe ? 'You: ' : ''}
                    {t.lastMessage || 'Say hello 👋'}
                  </Text>
                  {t.unread > 0 ? (
                    <View style={styles.unreadDot}>
                      <Text style={styles.unreadText}>{t.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginBottom: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14.5, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  time: { marginLeft: 'auto', fontSize: 11, color: colors.muted, fontWeight: '700' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  preview: { flex: 1, fontSize: 13, color: colors.muted },
  previewUnread: { color: colors.ink, fontWeight: '700' },
  unreadDot: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { fontSize: 11, fontWeight: '800', color: colors.brandDark },
});
