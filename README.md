# Kheeladi games: Stone Paper Scissors, and Snakes & Ladders reversed

Two Kheeladi games for phones and the web, each playable two ways:

- **Online with friends.** One person hosts and gets a four-letter room code and a QR code. Everyone else scans
  it, opens the link, or types the code on their own phone. Two to six people play; anyone else who joins watches
  and takes a seat at the next game. The host picks the game in the lobby.
- **On this phone.** One or two people, plus Kheeladi's bots (Easy, Fair or Sharp) in the other seats. Two people
  share the phone side by side: each gets their own column of three buttons and both tap at the same time. A pick
  shows only "Locked in" until both are in, so nobody can copy, and nobody has to hand the phone over (keyboard:
  A S D on the left, J K L on the right). Works without the server once the page has loaded.

**Stone Paper Scissors.** Two players play one throw or best of 3, 5 or 7. Groups play **points** (1 point for
every player you beat, most points after 3 to 10 rounds, a tie goes to a throw-off) or **knockout** (a throw counts
when exactly two shapes show; the losing shape is out; last one standing wins).

**Snakes & Ladders, reversed.** Everyone starts on 100 and races down to 0, so snakes help (they slide you closer to
home) and ladders set you back. There is no taking turns: every turn, everyone throws stone, paper or scissors at
once, and whoever beats the most players rolls two dice (if everyone ties, throw again). The dice are CSS 3D cubes
that tumble onto the board; pieces hop square by square and ride the snakes along their curves. Any roll that reaches
0 wins; no exact roll is needed. You can throw your next shape while the pieces are still moving, and the server
opens the next throw the moment the last move has played out, so a game takes about a minute.

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
- **Rounds never wait.** Every round runs on a clock: 5 seconds to throw (the host can pick 3 or 10), after a
  1.5 second look at the last result. The cards turn the moment the last person throws; anyone still thinking when
  time is up gets a random throw. A six-phone knockout plays out in about half a minute.
- **Phones drop off and come back.** A phone that drops off sits the round out at once, and its private token
  rejoins the same seat on its own when it is back (a locked screen, a tunnel, a refresh). If the host is gone for
  30 seconds, hosting passes on.
- **No database.** Rooms live in memory and close 15 minutes after the last person leaves. A server restart or a
  deploy ends the games in progress; players see "That game has ended" and can host a new one.
- **Limits.** Six players and six watchers per room, 60 messages per phone per 10 seconds, 12 new rooms per IP
  address per 10 minutes, 4 KB messages. Names are cleaned (no control characters, 16 letters at most) and made
  unique. Strict Content Security Policy; the fonts ship with the app (SIL Open Font License, `public/fonts/`).

| Path | What |
| --- | --- |
| `server/index.js` | HTTP and WebSocket server, static files, `/qr/CODE.svg`, `/api/rooms/CODE`, `/healthz` |
| `server/rooms.js` | Rooms: joining, seats, the host, picks, reveals, timers, reconnecting |
| `shared/` | Rules, match engines (`engine.js` for Stone Paper Scissors, `snakes.js` for Snakes & Ladders), bots and wording, used by the server and the browser |
| `public/` | The web app: `index.html`, `css/app.css`, `js/` (`online.js`, `local.js`, `snakes.js`, `ui.js`, `app.js`) |
| `test/` | `node --test`: the engine, and the server over real WebSockets |
| `e2e/multiplayer.mjs`, `e2e/snakes.mjs`, `e2e/duo.mjs` | Several phone browsers host, join and play each game to the end, and two people share one phone (Playwright) |

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
3. Pick this repository, keep the branch `main`, and tap **Deploy Blueprint**.

Render builds it in about two minutes and gives a link like `https://stone-paper-scissors.onrender.com`. Every push
to `main` redeploys it. No card is needed for the free plan; if a free limit is reached, Render pauses the service
for the rest of the month rather than charging.

The free plan sleeps after 15 minutes without visitors, and waking takes about a minute. To avoid that wait,
`KEEP_AWAKE=1` (set in `render.yaml`) has the server visit its own address every 10 minutes. That keeps one
service up all month on about 744 of the 750 free hours Render gives each account, so it should be the only free
service on the account; set `KEEP_AWAKE` to `0` in the service's **Environment** settings to let it sleep.

A custom address such as `sps.kheeladi.com` can be added later in the service's **Settings > Custom Domains**.
