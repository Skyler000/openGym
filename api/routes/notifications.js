// The in-app notification feed. Deliberately open to paused accounts: "your access has paused"
// is exactly the notification a locked client most needs to be able to read.
export default function notificationRoutes(ctx) {
  const { db, json, readBody, saveDb, requireUser } = ctx;

  return {
    'GET /api/notifications': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const mine = db.notifications.filter(n => n.userId === user.id).sort((a, b) => b.created - a.created).slice(0, 100);
      json(res, 200, { notifications: mine, unread: mine.filter(n => !n.read).length });
    },

    // Just the count, for the app to poll cheaply while it is open.
    'GET /api/notifications/unread': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      json(res, 200, { unread: db.notifications.filter(n => n.userId === user.id && !n.read).length });
    },

    // Marks the given ids as read, or every unread notification when no ids are sent.
    'POST /api/notifications/read': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? new Set(body.ids) : null;
      let marked = 0;
      for (const n of db.notifications) {
        if (n.userId !== user.id || n.read || (ids && !ids.has(n.id))) continue;
        n.read = true;
        marked++;
      }
      if (marked) saveDb();
      json(res, 200, { ok: true, marked });
    }
  };
}
