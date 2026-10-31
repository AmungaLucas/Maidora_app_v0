// Real chat backend — employer ↔ househelp threads, polling-based (cPanel
// Passenger has no websockets; ?after=<id> incremental fetch keeps poll
// payloads tiny).
//
//   POST /api/chat/threads                    {peerId} → find-or-create
//   GET  /api/chat/threads                    my threads (peer + last message
//                                             + unread count)
//   GET  /api/chat/threads/:id/messages       ?after=<id> — new messages since
//                                             (also bulk-stamps read_at on the
//                                             peer's messages = "read on open")
//   POST /api/chat/threads/:id/messages       {body} → message row
//
// Starting a thread is a platform service → requireVerified (§5 gate).
// Browsing/listing threads stays requireAuth so an unverified user can still
// read threads that exist (§15.1 read-only scope).
const express = require('express');
const { pool } = require('../config/db');
const { requireAuth, requireVerified } = require('../middleware/auth');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadThreadForUser(threadId, uid) {
  const [[t]] = await pool.query('SELECT * FROM chat_threads WHERE id = ? LIMIT 1', [threadId]);
  if (!t) return null;
  if (t.user_a_id !== uid && t.user_b_id !== uid) return null;
  return t;
}

function peerOf(thread, uid) {
  return thread.user_a_id === uid ? thread.user_b_id : thread.user_a_id;
}

// POST /api/chat/threads — find-or-create a thread with `peerId`.
router.post('/threads', requireAuth, requireVerified, async (req, res, next) => {
  try {
    const peerId = String((req.body || {}).peerId || '');
    if (!UUID_RE.test(peerId)) return res.status(400).json({ message: 'Invalid recipient.' });
    if (peerId === req.user.uid) {
      return res.status(400).json({ message: 'You cannot message yourself.' });
    }
    const [[peer]] = await pool.query(
      "SELECT id, role, account_status FROM users WHERE id = ? AND account_status = 'active' LIMIT 1",
      [peerId]
    );
    if (!peer) return res.status(404).json({ message: 'That account is not available.' });

    // Ordered pair — lexically smaller uuid first so find-or-create always
    // hits the same row (and the UNIQUE key).
    const [a, b] = [req.user.uid, peerId].sort();
    let [[thread]] = await pool.query('SELECT * FROM chat_threads WHERE user_a_id = ? AND user_b_id = ? LIMIT 1', [a, b]);
    if (!thread) {
      const [ins] = await pool.query(
        'INSERT INTO chat_threads (user_a_id, user_b_id) VALUES (?, ?)',
        [a, b]
      );
      [[thread]] = await pool.query('SELECT * FROM chat_threads WHERE id = ?', [ins.insertId]);
      console.error(`[CHAT] thread #${thread.id} created — ${req.user.uid} ↔ ${peerId}`);
    }
    res.status(200).json({ threadId: Number(thread.id) });
  } catch (e) {
    next(e);
  }
});

// GET /api/chat/threads — inbox: peer identity + last message + unread count.
router.get('/threads', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.last_message_at,
              CASE WHEN t.user_a_id = ? THEN t.user_b_id ELSE t.user_a_id END AS peer_id,
              (SELECT m.body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
              (SELECT m.sender_id FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
              (SELECT m.created_at FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_at,
              (SELECT COUNT(*) FROM chat_messages m
                WHERE m.thread_id = t.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
       FROM chat_threads t
       WHERE t.user_a_id = ? OR t.user_b_id = ?
       ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
       LIMIT 100`,
      [req.user.uid, req.user.uid, req.user.uid, req.user.uid]
    );
    const threads = [];
    for (const r of rows) {
      const [[peer]] = await pool.query(
        'SELECT id, full_name, avatar_url, kyc_status, role FROM users WHERE id = ? LIMIT 1',
        [r.peer_id]
      );
      threads.push({
        id: Number(r.id),
        lastMessage: r.last_body || null,
        lastMessageAt: r.last_at || r.last_message_at || null,
        lastFromMe: r.last_sender === req.user.uid,
        unread: Number(r.unread || 0),
        peer: peer
          ? {
              id: peer.id,
              fullName: peer.full_name,
              avatarUrl: peer.avatar_url || null,
              role: peer.role || null,
              trustBadge: peer.kyc_status === 'approved',
            }
          : { id: r.peer_id, fullName: 'Deleted account', avatarUrl: null, role: null, trustBadge: false },
      });
    }
    res.json({ threads });
  } catch (e) {
    next(e);
  }
});

// GET /api/chat/threads/:id/messages?after=<id> — incremental fetch. Opening
// (or polling) the thread marks the PEER's messages read — seen = read.
router.get('/threads/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid thread id.' });
    const thread = await loadThreadForUser(id, req.user.uid);
    if (!thread) return res.status(404).json({ message: 'Conversation not found.' });

    const after = Math.max(0, parseInt(req.query.after, 10) || 0);
    const [rows] = await pool.query(
      `SELECT id, sender_id, body, read_at, created_at
       FROM chat_messages WHERE thread_id = ? AND id > ?
       ORDER BY id ASC LIMIT 200`,
      [id, after]
    );
    const peerId = peerOf(thread, req.user.uid);
    // Seen on open — stamp read_at for everything the peer sent.
    await pool.query(
      'UPDATE chat_messages SET read_at = NOW() WHERE thread_id = ? AND sender_id = ? AND read_at IS NULL',
      [id, peerId]
    );
    res.json({
      messages: rows.map((m) => ({
        id: Number(m.id),
        fromMe: m.sender_id === req.user.uid,
        body: m.body,
        readAt: m.read_at,
        createdAt: m.created_at,
      })),
      peerId,
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/chat/threads/:id/messages — send (verified gate: a suspended/
// unverified sender cannot start NEW conversations, and existing threads
// stay read-only for them — §5 services).
router.post('/threads/:id/messages', requireAuth, requireVerified, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid thread id.' });
    const thread = await loadThreadForUser(id, req.user.uid);
    if (!thread) return res.status(404).json({ message: 'Conversation not found.' });

    const body = String((req.body || {}).body || '').trim().slice(0, 2000);
    if (!body) return res.status(400).json({ message: 'Type a message first.' });

    const [ins] = await pool.query(
      'INSERT INTO chat_messages (thread_id, sender_id, body) VALUES (?, ?, ?)',
      [id, req.user.uid, body]
    );
    await pool.query('UPDATE chat_threads SET last_message_at = NOW() WHERE id = ?', [id]);
    res.status(201).json({
      message: { id: Number(ins.insertId), fromMe: true, body, readAt: null, createdAt: new Date() },
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
