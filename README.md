# PunchCam

PunchCam is a two-player webcam fitness game for couples and friends. Its main
mode, Couple Raid, turns a three-minute workout into a cooperative boss battle:
players punch, duck, and block together to complete chemistry missions and
trigger a shared special move. A classic boxing duel remains available for
competitive play.

![PunchCam Couple Raid](public/assets/couple-raid-hero.png)

The game uses MediaPipe Tasks Vision for upper-body pose detection and face
tracking. PunchCam recognizes straight punches, hooks, side dodges, ducks, and
blocks, then synchronizes the match over PeerJS / WebRTC so two players can
exercise, cooperate, or compete in real time.

## Features

- Two-player room flow with invite links
- Real-time webcam and data connection with PeerJS / WebRTC
- MediaPipe-based pose detection for punches, dodges, ducks, and blocks
- Three-minute Couple Raid with a shared boss health bar and duo energy meter
- Chemistry Combo missions, bonus damage, and a cooperative special move
- Synchronized boss telegraphs, attack frames, motion-based dodges, and hit reactions
- Downloadable post-match result poster for sharing
- Face tracking for animated 3D masks
- Classic three-round boxing duel with health, hits, damage, KO, and results
- Tutorial mode for practicing each motion before the match
- Sound effects, vibration feedback, hit effects, and optional tracking overlays

## Game Modes

### Couple Raid

Create a room, invite your partner, and defeat the daily boss together in a
three-minute workout. Every detected straight punch and hook damages the boss.
Coordinated actions complete Chemistry Combo missions, deal bonus damage, and
charge the shared special move.

The Cloud Champion attacks every few seconds. Each attack has a synchronized
wind-up, a dedicated action frame, and a MediaPipe-based defense check:

| Boss attack | Warning | Correct defense |
| --- | --- | --- |
| Thunder Straight | Fist rushes toward the camera | Dodge left or right |
| Cyclone Sweep | Horizontal wind arc crosses the arena | Duck |
| Cloudquake Slam | Both fists strike the arena floor | Raise both hands to block |

Successful defenses display a Perfect result. Missed defenses trigger camera
impact, sound, and vibration feedback. Player attacks also switch the boss to a
playful hit-stagger frame.

### Boxing Duel

Classic Duel keeps the original two-camera boxing format. Players compete over
three 60-second rounds using straight punches, hooks, side dodges, ducks, and
blocks.

## Tech Stack

- Vite
- React
- TypeScript
- MediaPipe Tasks Vision
- PeerJS / WebRTC
- Three.js
- Vitest
- Playwright

## Requirements

- Node.js `>=22.13.0`
- A browser with webcam support

## Install

```bash
npm install
```

## Local Development

Start the development server:

```bash
npm run dev
```

Then open the local URL printed by Vite, usually:

```text
http://localhost:5173
```

For the best experience, allow camera and microphone permissions when the
browser asks.

## Memoji Headgear Pipeline

PunchCam can turn Apple Memoji recordings into transparent WebP frame sets that
appear as selectable headgear in the camera view.

Record each Memoji as a video in iMessage or FaceTime, keeping your face at a
steady distance while slowly rotating or tilting through the motion you want.
Save each `.mov`, `.mp4`, or `.m4v` file into:

```text
inputs/memoji/
```

Then run:

```bash
npm run memoji:build
```

The pipeline uses macOS AVFoundation to preserve the alpha channel, extracts
transparent PNG frames, auto-detects the visible alpha bounds, crops with
padding, converts the frames to WebP, and writes manifests under:

```text
public/assets/memoji/
```

Generated Memoji sets are discovered automatically by the app through
`public/assets/memoji/index.json`. Restart the dev server or refresh the page,
then select the `ME` button in the headgear picker.

Useful options:

```bash
npm run memoji:build -- --every 2 --quality 85 --padding 18
npm run memoji:rebuild
```

Requirements for this pipeline:

- macOS
- Xcode Command Line Tools for `swift`
- WebP tools for `cwebp`, installable with `brew install webp`

### Coached Recording Helper

If you want PunchCam to prompt the Apple Memoji recording motions for you, run:

```bash
npm run memoji:record
```

The helper opens a local browser coach page and shows a `3, 2, 1` countdown
before each take. It does not record your webcam by default. Keep the coach page
visible, start recording the actual Apple Memoji in Messages/FaceTime/iPhone,
and follow the prompts.

After exporting the Apple Memoji `.mov`, save it directly into `inputs/memoji/`,
then run `npm run memoji:build`.

Useful options:

```bash
npm run memoji:record -- --port 5199
npm run memoji:record -- --takes tools/memoji/my-takes.json
npm run memoji:record -- --record-camera --device 1 --prefix harry-reference
```

`--record-camera` is only for optional reference recordings. Those camera clips
do not contain Apple Memoji transparency and should not be used as final headgear
assets.

## Build

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Tests

Run unit tests:

```bash
npm test
```

Run type checking:

```bash
npm run lint
```

Run end-to-end tests:

```bash
npm run test:e2e
```

Current automated coverage includes:

- Punch, hook, dodge, duck, block, calibration, and damage rules
- Couple Raid action damage, Chemistry Combo timing, and match results
- Boss attack counters, telegraph/attack/recovery timeline, and scene selection
- Availability of every boss action image
- Lobby mode switching, invite URL handling, compact Raid cameras, and mobile layout

The camera-driven two-device flow should also be smoke-tested on real hardware
before a public release because webcam framing and network conditions vary by device.

## TURN Server Configuration

PunchCam includes a public STUN server by default. If you need better support
for strict NAT networks, configure a TURN server with these environment
variables:

```bash
VITE_TURN_URL=
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

Create a local `.env` file from `.env.example` if needed.
