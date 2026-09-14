// Uploaded files: progress photos, and the photos, voice notes and documents sent in chat.
//
// Each file is stored as <id>.bin with a <id>.json sidecar holding who may read it. Keeping that
// out of db.json matters because db.json is rewritten whole on every save, and chat media piles up.
//
// Files are served from the app's own origin, so what may be uploaded is an allowlist. No SVG and
// no HTML: either would run script in the app's context the moment someone opened it.
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a',
  'application/pdf': 'pdf', 'text/plain': 'txt',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
// Base64 is 4/3 the size of the file, plus a little JSON around it.
const BODY_LIMIT = Math.ceil(MEDIA_MAX_BYTES * 4 / 3) + 64 * 1024;
const ID = /^[A-Za-z0-9_-]{8,40}$/;

// Who uploaded a file and for whom, or null. Chat reads it to check an attachment before sending.
export function readMediaMeta(DATA, id) {
  if (!ID.test(id || '')) return null;
  try { return JSON.parse(fs.readFileSync(path.join(DATA, 'media', id + '.json'), 'utf8')); } catch { return null; }
}

export default function mediaRoutes(ctx) {
  const { json, readBody, requireUser, access, role, ownClient, rid, DATA, canChat } = ctx;
  const dir = path.join(DATA, 'media');
  fs.mkdirSync(dir, { recursive: true });
  const readMeta = id => readMediaMeta(DATA, id);

  // The uploader can always read their own file. A chat file is readable by the other person in
  // that conversation; a progress photo by the uploader's own coach. The super admin gets neither.
  function canRead(user, m) {
    if (user.id === m.owner) return true;
    if (m.purpose === 'chat') return user.id === m.peer;
    if (m.purpose === 'photo') return role(user) === 'coach' && !!ownClient(user, m.owner);
    return false;
  }

  return {
    'POST /api/media': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      if (access(user) !== 'active') return json(res, 403, { error: 'access paused' });
      if (+(req.headers['content-length'] || 0) > BODY_LIMIT) return json(res, 413, { error: 'File too large — the limit is 10 MB.' });
      const body = await readBody(req, BODY_LIMIT);
      const mime = String(body.mime || '').split(';')[0].trim().toLowerCase();
      if (!TYPES[mime]) return json(res, 415, { error: 'That file type isn’t supported.' });
      const purpose = body.purpose === 'chat' ? 'chat' : 'photo';
      let peer = null;
      if (purpose === 'chat') {
        peer = String(body.peer || '');
        if (!canChat(user, peer)) return json(res, 403, { error: 'You can’t send files to this person.' });
      }
      const buf = Buffer.from(String(body.data || ''), 'base64');
      if (!buf.length) return json(res, 400, { error: 'The file is empty.' });
      if (buf.length > MEDIA_MAX_BYTES) return json(res, 413, { error: 'File too large — the limit is 10 MB.' });
      const id = rid();
      const name = String(body.name || 'file.' + TYPES[mime]).replace(/[\\/\r\n"]/g, '_').slice(0, 120);
      const meta = { id, owner: user.id, peer, purpose, mime, name, size: buf.length, created: Date.now() };
      fs.writeFileSync(path.join(dir, id + '.bin'), buf);
      fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(meta));
      json(res, 200, { media: meta });
    },

    'GET /api/media': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const meta = readMeta(new URL(req.url, 'http://x').searchParams.get('id'));
      // Not-found for both "doesn't exist" and "not yours", so an id can't be probed for existence.
      if (!meta || !canRead(user, meta)) return json(res, 404, { error: 'not found' });
      let data;
      try { data = fs.readFileSync(path.join(dir, meta.id + '.bin')); } catch { return json(res, 404, { error: 'not found' }); }
      const inline = /^(image|audio)\//.test(meta.mime) || meta.mime === 'application/pdf';
      res.writeHead(200, {
        'Content-Type': meta.mime,
        'Content-Length': data.length,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`
      });
      res.end(data);
    }
  };
}
