// The live event stream (Server-Sent Events): new messages, read receipts, presence and notifications
// reach the app as they happen, instead of on its next poll. Open to paused accounts too — "your
// access is back" is exactly the event a lock screen is waiting for.
export default function eventRoutes(ctx) {
  const { requireUser, hub, onPresence } = ctx;

  return {
    'GET /api/events': async (req, res) => {
      const user = requireUser(req, res); if (!user) return;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'   // nginx: pass each event straight through
      });
      // How long the browser waits before reconnecting after the stream drops.
      res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ id: user.id })}\n\n`);
      if (hub.add(user.id, res)) onPresence(user, true);
      req.on('close', () => { if (hub.remove(user.id, res)) onPresence(user, false); });
    }
  };
}
