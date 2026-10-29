# Stone Paper Scissors

Kheeladi's Stone Paper Scissors for phones and the web. Two ways to play:

- **Online with friends.** One person hosts and gets a four-letter room code and a QR code. Everyone else scans
  it, opens the link, or types the code on their own phone. Two to six people play; anyone else who joins watches
  and takes a seat at the next match.
- **On this phone.** Play Kheeladi's bots (Easy, Fair or Sharp), or pass one phone around with secret picks. Two to
  eight seats. Works without the server once the page has loaded.

Rules: two players play one throw or best of 3, 5 or 7. Groups play **points** (1 point for every player you beat,
most points after 3 to 10 rounds, a tie goes to a throw-off) or **knockout** (a throw counts when exactly two
shapes show; the losing shape is out; last one standing wins).

## How it works

```
phone ──WebSocket /ws──┐
phone ──WebSocket /ws──┼── server/index.js  (Node, one process)
phone ──WebSocket /ws──┘      ├─ serves public/ and shared/ (the web app)
                              ├─ server/rooms.js  rooms, seats, hosts, timers
                              └─ shared/engine.js the rules, shared with the browser
```

- **The server keeps every throw secret.** A phone gets only "Priya has locked in" until the last person has
  thrown; then everyone gets all the throws at once and plays the chant and the flip. You can change your throw
  until then.
- **Phones drop off and come back.** Each phone holds a private token for its seat, so a locked screen, a tunnel or
  a refresh rejoins the same seat on its own. A round waits 15 seconds for someone who dropped off, then plays
  without them (they sit that round out). The host can also stop waiting for anyone after 8 seconds, or set a
  10 or 20 second timer, after which a random throw is made. If the host is gone for 30 seconds, hosting passes on.
- **No database.** Rooms live in memory and close 15 minutes after the last person leaves. A server restart or a
  deploy ends the games in progress; players see "That game has ended" and can host a new one.
- **Limits.** Six players and six watchers per room, 60 messages per phone per 10 seconds, 12 new rooms per IP
  address per 10 minutes, 4 KB messages. Names are cleaned (no control characters, 16 letters at most) and made
  unique. Strict Content Security Policy; the fonts ship with the app (SIL Open Font License, `public/fonts/`).

| Path | What |
| --- | --- |
| `server/index.js` | HTTP and WebSocket server, static files, `/qr/CODE.svg`, `/api/rooms/CODE`, `/healthz` |
| `server/rooms.js` | Rooms: joining, seats, the host, picks, reveals, timers, reconnecting |
| `shared/` | Rules, match engine, bots and wording, used by the server and the browser |
| `public/` | The web app: `index.html`, `css/app.css`, `js/` (`online.js`, `local.js`, `ui.js`, `app.js`) |
| `test/` | `node --test`: the engine, and the server over real WebSockets |
| `e2e/multiplayer.mjs` | Several phone browsers host, join and play a full match (Playwright) |

## Run it

```bash
npm install
npm start            # http://localhost:8080
npm run dev          # restarts on changes
npm run check        # syntax check and all tests
npm run e2e          # multi-phone browser test (needs Playwright and Chromium)
```

To try it with real phones on the same Wi-Fi, start the server and open `http://<your computer's IP>:8080` on each
phone.

## Deploy (Render, free)

`render.yaml` describes one free web service in Render's Singapore region. Once, from a phone or a computer:

1. Open <https://dashboard.render.com/blueprints> and sign in with GitHub.
2. Tap **New Blueprint Instance**, connect GitHub if asked, and give Render access to this repository.
3. Pick `stone-paper-scissors`, keep the branch `main`, and tap **Deploy Blueprint**.

Render builds it in about two minutes and gives a link like `https://stone-paper-scissors.onrender.com`. Every push
to `main` redeploys it. No card is needed for the free plan; if a free limit is reached, Render pauses the service
for the rest of the month rather than charging.

The free plan sleeps after 15 minutes without visitors, so the first visit after a quiet spell takes about a minute
to load. While anyone is in a room, the room's own traffic keeps it awake.

A custom address such as `sps.kheeladi.com` can be added later in the service's **Settings > Custom Domains**.
