// Chat between a coach and their own clients: text, photos, voice notes and documents, with read
// receipts, search and a media gallery. Nobody else can reach a conversation — not another coach,
// not another client, and not the super admin.
//
// Each conversation is its own file, chat/<coachId>/<clientId>.json, rather than part of db.json:
// db.json is rewritten whole on every save, and messages pile up.
import fs from 'node:fs';
import path from 'node:path';
import { buildMessage, preview, unreadFor, markRead, search, pageOf, KEEP_MESSAGES } from '../lib/chat.js';
import { readMediaMeta } from './media.js';

export default function chatRoutes(ctx) {
  const { db, DATA, json, readBody, requireUser, role, access, userById, canChat, rid, hub, sendPush } = ctx;
  const safe = id => String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
  const fileOf = p => path.join(DATA, 'chat', safe(p.coach.id), safe(p.client.id) + '.json');
  const param = (req, k) => new URL(req.url, 'http://x').searchParams.get(k);

  // Reading and sending both need an active account; a paused one sees only its lock screen.
  function activeUser(req, res) {
    const user = requireUser(req, res);
    if (!user) return null;
    const a = access(user);
    if (a !== 'active') { json(res, 403, { error: 'access paused', access: a }); return null; }
    return user;
  }

  // The coach–client pair the caller forms with `peerId`, or null when they aren't linked. History
  // stays readable after a peer's access lapses; sending is checked separately with canChat.
  function pairWith(user, peerId) {
    const peer = userById(peerId);
    if (!peer || peer.id === user.id) return null;
    const r = role(user), pr = role(peer);
    if (r === 'coach' && pr === 'client' && peer.coachId === user.id) return { coach: user, client: peer, peer };
    if (r === 'client' && pr === 'coach' && user.coachId === peer.id) return { coach: peer, client: user, peer };
    return null;
  }
  function pairOr404(res, user, peerId) {
    const p = pairWith(user, peerId);
    if (!p) json(res, 404, { error: 'no such conversation' });
    return p;
  }

  const load = p => { try { return JSON.parse(fs.readFileSync(fileOf(p), 'utf8')); } catch { return []; } };
  function save(p, messages) {
    const file = fileOf(p);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(messages.slice(-KEEP_MESSAGES)));
    fs.renameSync(file + '.tmp', file);
  }

  // A client is not told their coach's account state: that is the coach's billing, not theirs.
  const peerView = (user, peer) => ({
    id: peer.id, name: peer.name, online: hub.isOnline(peer.id), lastSeen: hub.lastSeen(peer.id),
    ...(role(user) === 'coach' ? { access: access(peer) } : {})
  });

  return {
    // A coach has one thread per client; a client has the one with their coach.
    'GET /api/chat/threads': async (req, res) => {
      const user = activeUser(req, res); if (!user) return;
      const r = role(user);
      const peers = r === 'coach' ? db.users.filter(u => role(u) === 'client' && u.coachId === user.id)
        : r === 'client' ? [userById(user.coachId)].filter(Boolean) : [];
      const threads = peers.map(peer => {
        const messages = load(pairWith(user, peer.id));
        const last = messages[messages.length - 1] || null;
        return {
          peer: peerView(user, peer),
          last: last && { id: last.id, from: last.from, created: last.created, readAt: last.readAt, preview: preview(last) },
          unread: unreadFor(messages, user.id),
          canSend: canChat(user, peer.id)
        };
      }).sort((a, b) => (b.last?.created || 0) - (a.last?.created || 0) || a.peer.name.localeCompare(b.peer.name));
      json(res, 200, { threads, unread: threads.reduce((n, t) => n + t.unread, 0) });
    },

    'GET /api/chat/messages': async (req, res) => {
      const user = activeUser(req, res); if (!user) return;
      const p = pairOr404(res, user, param(req, 'peer')); if (!p) return;
      const limit = Math.max(1, Math.min(200, +param(req, 'limit') || 60));
      const { messages, more } = pageOf(load(p), { before: param(req, 'before'), limit });
      json(res, 200, { messages, more, peer: peerView(user, p.peer), canSend: canChat(user, p.peer.id) });
    },

    // Text, or one attachment uploaded first through POST /api/media with purpose 'chat'.
    'POST /api/chat/send': async (req, res) => {
      const user = activeUser(req, res); if (!user) return;
      const body = await readBody(req);
      const p = pairOr404(res, user, body.peer); if (!p) return;
      if (!canChat(user, p.peer.id)) return json(res, 403, { error: 'You can’t message this person right now.' });
      let media = null;
      if (body.mediaId) {
        media = readMediaMeta(DATA, String(body.mediaId));
        // Only a chat file this sender uploaded for this very conversation can be attached.
        if (!media || media.owner !== user.id || media.purpose !== 'chat' || media.peer !== p.peer.id) {
          return json(res, 400, { error: 'That attachment isn’t available.' });
        }
      }
      const built = buildMessage({ from: user.id, to: p.peer.id, text: body.text, media, duration: body.duration }, { id: rid(), now: Date.now() });
      if (built.error) return json(res, 400, { error: built.error });
      const messages = load(p);
      messages.push(built.message);
      save(p, messages);
      const m = built.message;
      hub.publish(p.peer.id, 'message', m);
      hub.publish(user.id, 'message', m);   // the sender's other open tabs
      // Push unless they're looking at the app: an app on screen already has the message, but one that
      // is closed, in the background, or frozen by the phone with its connection still open doesn't.
      if (!hub.isLooking(p.peer.id)) {
        sendPush(p.peer.id, { title: user.name, body: preview(m), tag: 'chat-' + user.id, url: '#/chat/' + user.id }).catch(() => {});
      }
      json(res, 200, { message: m });
    },

    // Marks what the peer sent as read, and tells the peer — that is the read receipt.
    'POST /api/chat/read': async (req, res) => {
      const user = activeUser(req, res); if (!user) return;
      const body = await readBody(req);
      const p = pairOr404(res, user, body.peer); if (!p) return;
      const messages = load(p);
      const at = Date.now();
      const ids = markRead(messages, user.id, p.peer.id, at);
      if (ids.length) {
        save(p, messages);
        const receipt = { by: user.id, peer: p.peer.id, ids, at };
        hub.publish(p.peer.id, 'read', receipt);
        hub.publish(user.id, 'read', receipt);   // clears the badge in the reader's other tabs
      }
      json(res, 200, { ok: true, marked: ids.length });
    },

    'GET /api/chat/search': async (req, res) => {
      const user = activeUser(req, res); if (!user) return;
      const p = pairOr404(res, user, param(req, 'peer')); if (!p) return;
      json(res, 200, { results: search(load(p), String(param(req, 'q') || '').slice(0, 100)) });
    },

    // Every photo, voice note and document in the conversation, newest first.
    'GET /api/chat/media': async (req, res) => {
      const user = activeUser(req, res); if (!user) return;
      const p = pairOr404(res, user, param(req, 'peer')); if (!p) return;
      json(res, 200, { items: load(p).filter(m => m.media).reverse() });
    }
  };
}
