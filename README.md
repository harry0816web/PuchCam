# PunchCam

PunchCam is a two-player real-time webcam boxing game that runs in the browser.
Players create or join a room, turn on their camera, and fight by physically
throwing punches, dodging, ducking, and blocking.

The game uses MediaPipe Tasks Vision for upper-body pose detection and face
tracking. PunchCam recognizes straight punches, hooks, side dodges, ducks, and
blocks, then synchronizes the match over PeerJS / WebRTC so two players can
compete in real time.

## Features

- Two-player room flow with invite links
- Real-time webcam and data connection with PeerJS / WebRTC
- MediaPipe-based pose detection for punches, dodges, ducks, and blocks
- Face tracking for animated 3D masks
- Three-round boxing match flow with health, hits, damage, KO, and round results
- Tutorial mode for practicing each motion before the match
- Sound effects, vibration feedback, hit effects, and optional tracking overlays

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
