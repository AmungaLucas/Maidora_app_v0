// ChatThread — one conversation. Polling-based (cPanel gateway has no
// websockets): full history on open, then ?after=<lastId> every 4 s — the
// server marks the peer's messages read on every open/poll, so "seen" works
// without a separate endpoint.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useApp } from '../../context/AppContext';
import { colors, radius } from '../../theme';
import { Screen } from '../../ui';
import { Avatar } from '../../components/market/cards';

export default function ChatThreadScreen({ route, navigation }) {
  const { threadId, peerName } = route.params || {};
  const { token } = useApp();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const lastIdRef = useRef(0);
  const listRef = useRef(null);

  // Header title (reactnavigation.org/docs/headers)
  useEffect(() => {
    navigation.setOptions({ title: peerName || 'Chat' });
  }, [navigation, peerName]);

  const poll = useCallback(async () => {
    if (!token || !threadId) return;
    try {
      const res = await api.chatMessages(threadId, lastIdRef.current, token);
      if (res.messages?.length) {
        lastIdRef.current = res.messages[res.messages.length - 1].id;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = res.messages.filter((m) => !seen.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
        // Nudge the list to the bottom once per batch.
        setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 80);
      }
      setError('');
    } catch (e) {
      setError(e?.message || 'Connection hiccup — retrying…');
    }
  }, [token, threadId]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    (async () => {
      setLoading(true);
      // Full history first (after=0 returns up to 200 — plenty for v1).
      try {
        const res = await api.chatMessages(threadId, 0, token);
        if (cancelled) return;
        setMessages(res.messages || []);
        lastIdRef.current = res.messages?.length ? res.messages[res.messages.length - 1].id : 0;
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load the conversation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
      timer = setInterval(poll, 4000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, token]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await api.chatSend(threadId, body, token);
      if (res.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev;
          return [...prev, res.message];
        });
        lastIdRef.current = Math.max(lastIdRef.current, res.message.id);
      }
      setDraft('');
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 80);
    } catch (e) {
      setError(e?.message || 'Message not sent — try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen keyboard scroll={false} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => String(m.id)}
              contentContainerStyle={styles.list}
              onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Ionicons name="hand-left-outline" size={28} color={colors.muted} />
                  <Text style={styles.emptyText}>
                    Say hello — introduce yourself and the work you need.
                  </Text>
                </View>
              }
              renderItem={({ item: m }) => (
                <View style={[styles.bubble, m.fromMe ? styles.bubbleMine : styles.bubblePeer]}>
                  <Text style={[styles.bubbleText, m.fromMe && { color: colors.cream }]}>{m.body}</Text>
                  <Text style={[styles.bubbleTime, m.fromMe && { color: 'rgba(247,243,233,0.7)' }]}>
                    {m.fromMe && m.readAt ? 'Seen · ' : ''}
                    {new Date(m.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message…"
                placeholderTextColor={colors.muted}
                multiline
                style={styles.input}
                maxLength={2000}
              />
              <Pressable
                onPress={send}
                disabled={!draft.trim() || sending}
                style={({ pressed }) => [
                  styles.sendBtn,
                  (!draft.trim() || sending) && styles.sendBtnOff,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.cream} />
                ) : (
                  <Ionicons name="paper-plane" size={17} color={colors.cream} />
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingVertical: 14, gap: 8 },
  emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyText: { color: colors.muted, fontSize: 13.5, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 3,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    borderBottomRightRadius: radius.sm,
  },
  bubblePeer: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleText: { fontSize: 14.5, lineHeight: 20, color: colors.ink },
  bubbleTime: { fontSize: 10, color: colors.muted, alignSelf: 'flex-end' },
  error: { fontSize: 12, color: colors.danger, textAlign: 'center', paddingVertical: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 14.5,
    color: colors.ink,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: colors.line },
});
