"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Peer, type DataConnection, type MediaConnection } from "peerjs";
import { damageForPunch, getDodgeDirection, getPunchKind, isBlocking, isWristTracked } from "../src/game-rules";

type Fighter = "left" | "right";
type PunchKind = "straight" | "hook";
type EventMessage =
  | { type: "punch"; kind: PunchKind }
  | { type: "dodge"; active: boolean }
  | { type: "block"; active: boolean }
  | { type: "tutorialReady" }
  | { type: "ready" }
  | { type: "start"; startsAt: number }
  | { type: "hit"; damage: number };

const ROUND_SECONDS = 60;
const ROUNDS = 3;

const TUTORIAL_STEPS = [
  { key: "straight", title: "直拳", note: "手腕快速向前伸出，手臂伸直。" },
  { key: "hook", title: "勾拳", note: "手肘彎曲，手腕快速橫向揮過。" },
  { key: "side", title: "左右閃躲", note: "整個上半身或頭部，明顯向左或向右偏移。" },
  { key: "duck", title: "下蹲閃躲", note: "頭部下降、接近雙肩高度，躲開勾拳。" },
  { key: "block", title: "格檔", note: "雙手舉進畫面上方 32%，可減少 80% 傷害。" },
] as const;

const makeRoomCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const opponentVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const lastWristRef = useRef({ left: 0, right: 0, at: 0 });
  const neutralShoulderXRef = useRef<number | null>(null);
  const cooldownRef = useRef({ left: 0, right: 0 });
  const dodgeRef = useRef(false);
  const blockRef = useRef(false);
  const startedRef = useRef(false);
  const tutorialReadyRef = useRef(false);
  const opponentTutorialReadyRef = useRef(false);
  const countdownRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const [roomCode, setRoomCode] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [status, setStatus] = useState("建立房間，準備上擂台");
  const [isHost, setIsHost] = useState(false);
  const [connected, setConnected] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [round, setRound] = useState(1);
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [myHealth, setMyHealth] = useState(100);
  const [opponentHealth, setOpponentHealth] = useState(100);
  const [myHits, setMyHits] = useState(0);
  const [opponentHits, setOpponentHits] = useState(0);
  const [effect, setEffect] = useState<{ side: Fighter; kind: PunchKind } | null>(null);
  const [gameMessage, setGameMessage] = useState("");
  const [started, setStarted] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [lastMove, setLastMove] = useState("等待揮拳");
  const [visibleWrists, setVisibleWrists] = useState(0);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialComplete, setTutorialComplete] = useState(false);
  const [hostPeerReady, setHostPeerReady] = useState(false);

  const roomLink = typeof window === "undefined" || !roomCode ? "" : `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  const send = useCallback((message: EventMessage) => {
    if (connectionRef.current?.open) connectionRef.current.send(message);
  }, []);

  function scheduleMatchStart() {
    if (countdownRef.current || startedRef.current) return;
    countdownRef.current = true;
    const startsAt = Date.now() + 3000;
    send({ type: "start", startsAt });
    setStatus("雙方已準備，3 秒後開打！");
    window.setTimeout(() => startMatch(), 3000);
  }

  const receive = useCallback((raw: unknown) => {
    const message = raw as EventMessage;
    if (message.type === "punch") {
      setEffect({ side: "right", kind: message.kind });
      window.setTimeout(() => setEffect(null), 500);
      if (!dodgeRef.current && startedRef.current) {
        const damage = damageForPunch(message.kind, blockRef.current);
        setMyHealth((health) => Math.max(0, health - damage));
        setOpponentHits((hits) => hits + 1);
        send({ type: "hit", damage });
      }
    }
    if (message.type === "dodge") setStatus(message.active ? "對手正在閃躲！" : "對手就位");
    if (message.type === "block") setStatus(message.active ? "對手正在格檔！" : "對手解除格檔");
    if (message.type === "hit") {
      setOpponentHealth((health) => Math.max(0, health - message.damage));
      setMyHits((hits) => hits + 1);
    }
    if (message.type === "tutorialReady") {
      opponentTutorialReadyRef.current = true;
      setStatus("朋友已完成教學，等待你準備。");
      if (isHost && tutorialReadyRef.current) scheduleMatchStart();
    }
    if (message.type === "start" && !startedRef.current) {
      window.setTimeout(() => startMatch(), Math.max(0, message.startsAt - Date.now()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, send]);

  const attachConnection = useCallback((connection: DataConnection, callbacks?: { onOpen?: () => void; onFailure?: () => void }) => {
    let opened = false;
    connectionRef.current = connection;
    connection.on("open", () => {
      opened = true;
      setConnected(true);
      setStatus("朋友已進入房間，請完成動作教學");
      callbacks?.onOpen?.();
    });
    connection.on("data", receive);
    connection.on("error", () => {
      if (!opened) callbacks?.onFailure?.();
    });
    connection.on("close", () => {
      setConnected(false);
      if (!opened) callbacks?.onFailure?.();
      else setStatus("朋友離開了房間");
    });
  }, [receive, send]);

  const attachCall = useCallback((call: MediaConnection) => {
    call.answer(streamRef.current ?? undefined);
    call.on("stream", (remoteStream) => {
      if (opponentVideoRef.current) opponentVideoRef.current.srcObject = remoteStream;
    });
  }, []);

  const activateCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 }, audio: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
      setStatus("鏡頭已開啟，等待朋友加入");
    } catch {
      setStatus("無法使用鏡頭或麥克風，請允許瀏覽器權限後重試。");
    }
  }, []);

  const joinPeer = useCallback((code: string, host: boolean) => {
    const id = host ? `punch-arena-${code.toLowerCase()}` : undefined;
    const peer = id ? new Peer(id) : new Peer();
    peerRef.current = peer;
    peer.on("open", () => {
      if (host) {
        setHostPeerReady(true);
        setStatus("房間已準備完成，現在可以分享邀請連結。");
        return;
      }
      const hostId = `punch-arena-${code.toLowerCase()}`;
      let attempts = 0;
      const retry = () => {
        if (retryTimerRef.current !== null || connectionRef.current?.open) return;
        attempts += 1;
        const delay = Math.min(1000 + attempts * 300, 3000);
        setStatus(`尚未連上房主，${Math.ceil(delay / 1000)} 秒後自動重試…`);
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          connect();
        }, delay);
      };
      const connect = () => {
        if (connectionRef.current?.open) return;
        setStatus(`正在連上朋友的擂台…（第 ${attempts + 1} 次）`);
        const connection = peer.connect(hostId, { reliable: true });
        attachConnection(connection, {
          onOpen: () => {
            if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
            if (streamRef.current) attachCall(peer.call(hostId, streamRef.current));
          },
          onFailure: retry,
        });
      };
      connect();
    });
    peer.on("connection", attachConnection);
    peer.on("call", attachCall);
    peer.on("error", (error) => {
      if (host) {
        setHostPeerReady(false);
        setStatus(error.type === "unavailable-id" ? "此房間碼已有人使用，請建立另一個房間。" : "房間建立失敗，請重新建立房間。");
      }
    });
  }, [attachCall, attachConnection]);

  const createRoom = async () => {
    const code = makeRoomCode();
    setRoomCode(code);
    setIsHost(true);
    setHostPeerReady(false);
    await activateCamera();
    joinPeer(code, true);
  };

  const joinRoom = async () => {
    const code = roomInput.trim().toUpperCase();
    if (!code) return setStatus("請輸入朋友分享的房間碼。");
    setRoomCode(code);
    setIsHost(false);
    await activateCamera();
    joinPeer(code, false);
  };

  const startMatch = () => {
    startedRef.current = true;
    setStarted(true);
    setStatus("第一回合開始！出拳、勾拳或閃躲。 ");
  };

  const finishTutorial = () => {
    tutorialReadyRef.current = true;
    setTutorialComplete(true);
    send({ type: "tutorialReady" });
    setStatus("你已準備完成，等待朋友。 ");
    if (isHost && opponentTutorialReadyRef.current) scheduleMatchStart();
  };

  const announcePunch = useCallback((kind: PunchKind) => {
    setEffect({ side: "left", kind });
    setLastMove(kind === "straight" ? "偵測到直拳！" : "偵測到勾拳！");
    // Preview effects work before the match starts; damage is only shared in a live round.
    if (startedRef.current) send({ type: "punch", kind });
    window.setTimeout(() => setEffect(null), 500);
  }, [send]);

  const drawPose = useCallback((points: Array<{ x: number; y: number; visibility?: number }>) => {
    const canvas = poseCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const visible = (index: number) => (points[index]?.visibility ?? 1) > 0.45;
    const dot = (index: number, color: string, radius = 7) => {
      if (!visible(index)) return;
      ctx.beginPath();
      ctx.arc(width - points[index].x * width, points[index].y * height, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#161215";
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    const line = (a: number, b: number) => {
      if (!visible(a) || !visible(b)) return;
      ctx.beginPath();
      ctx.moveTo(width - points[a].x * width, points[a].y * height);
      ctx.lineTo(width - points[b].x * width, points[b].y * height);
      ctx.strokeStyle = "rgba(255,226,83,.86)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.stroke();
    };
    // Only use the upper-body chain: head, shoulders, elbows, and wrists.
    // This keeps the game playable while seated and avoids requiring hips or legs in frame.
    [[11, 13], [13, 15], [12, 14], [14, 16], [11, 12]].forEach(([a, b]) => line(a, b));
    [0, 11, 12, 13, 14].forEach((index) => dot(index, "#63b9ff", 6));
    dot(15, "#ff4a78", 12);
    dot(16, "#ff4a78", 12);
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("room");
    if (fromUrl) setRoomInput(fromUrl.toUpperCase());
  }, []);

  useEffect(() => {
    if (!started || seconds <= 0 || myHealth === 0 || opponentHealth === 0) return;
    const timer = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [started, seconds, myHealth, opponentHealth]);

  useEffect(() => {
    if (!started || (seconds > 0 && myHealth > 0 && opponentHealth > 0)) return;
    if (round < ROUNDS) {
      setGameMessage(`第 ${round} 回合結束，下一回合準備！`);
      setRound((value) => value + 1);
      setSeconds(ROUND_SECONDS);
      setMyHealth(100);
      setOpponentHealth(100);
      window.setTimeout(() => setGameMessage(""), 2500);
    } else {
      setStarted(false);
      startedRef.current = false;
      setGameMessage(myHits === opponentHits ? "平手！勢均力敵。" : myHits > opponentHits ? "你獲勝了！" : "朋友獲勝了！");
    }
  }, [started, seconds, myHealth, opponentHealth, round, myHits, opponentHits]);

  useEffect(() => {
    let cancelled = false;
    const runDetection = async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      detectorRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task" },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      const frame = () => {
        const video = videoRef.current;
        if (!cancelled && video && video.readyState >= 2 && detectorRef.current) {
          const result = detectorRef.current.detectForVideo(video, performance.now());
          const points = result.landmarks?.[0];
          if (points) {
            setTracking((value) => value || true);
            drawPose(points);
            const now = performance.now();
            const shoulderCenter = (points[11].x + points[12].x) / 2;
            const shoulderHeight = (points[11].y + points[12].y) / 2;
            const leftWristVisible = isWristTracked(points[15].visibility);
            const rightWristVisible = isWristTracked(points[16].visibility);
            const wristsInFrame = Number(leftWristVisible) + Number(rightWristVisible);
            setVisibleWrists((value) => value === wristsInFrame ? value : wristsInFrame);
            // The first stable frame becomes the seated player's neutral position.
            // This catches moving the whole upper body sideways, not only leaning the head.
            if (neutralShoulderXRef.current === null) neutralShoulderXRef.current = shoulderCenter;
            const dodgeDirection = getDodgeDirection({
              shoulderCenter,
              neutralShoulderCenter: neutralShoulderXRef.current,
              noseX: points[0].x,
              noseY: points[0].y,
              shoulderHeight,
            });
            const dodging = dodgeDirection !== null;
            // Slowly re-centre only while neutral, so a deliberate dodge isn't absorbed as a new baseline.
            if (!dodging) neutralShoulderXRef.current = neutralShoulderXRef.current * 0.97 + shoulderCenter * 0.03;
            if (dodging !== dodgeRef.current) {
              dodgeRef.current = dodging;
              send({ type: "dodge", active: dodging });
              if (dodging) setLastMove(`偵測到${dodgeDirection}閃躲！`);
            }
            // Guard requires both wrists to be raised into the top 32% of the
            // camera frame, so a relaxed hands-up pose is not treated as a block.
            // Dodge has priority over guard: crouching with raised hands is still a duck.
            const blocking = !dodging && isBlocking({
              leftWrist: points[15],
              rightWrist: points[16],
              wristsTracked: leftWristVisible && rightWristVisible,
            });
            if (blocking !== blockRef.current) {
              blockRef.current = blocking;
              send({ type: "block", active: blocking });
              if (blocking) setLastMove("偵測到格檔！受到傷害降低 80%");
            }
            ([{ key: "left", wrist: points[15], elbow: points[13], shoulder: points[11], visible: leftWristVisible }, { key: "right", wrist: points[16], elbow: points[14], shoulder: points[12], visible: rightWristVisible }] as const).forEach(({ key, wrist, elbow, shoulder, visible }) => {
              const previous = lastWristRef.current[key];
              const speed = previous ? Math.abs(wrist.x - previous) / Math.max(1, now - lastWristRef.current.at) : 0;
              const punchKind = getPunchKind({ speed, wrist, elbow, shoulder });
              // A hand must be confidently visible to attack. When neither wrist is
              // visible, only the head-and-shoulder dodge rule remains active.
              if (visible && !dodging && !blocking && now > cooldownRef.current[key] && punchKind) {
                announcePunch(punchKind);
                cooldownRef.current[key] = now + 650;
              }
              // Prevent the end of a dodge from immediately becoming a hook.
              if (dodging || blocking) cooldownRef.current[key] = now + 250;
              lastWristRef.current[key] = wrist.x;
            });
            lastWristRef.current.at = now;
          } else {
            setTracking(false);
            setVisibleWrists(0);
            const canvas = poseCanvasRef.current;
            canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
        if (!cancelled) animationRef.current = requestAnimationFrame(frame);
      };
      frame();
    };
    if (cameraReady) runDetection().catch(() => setStatus("動作辨識載入失敗，但視訊連線仍可使用。"));
    return () => { cancelled = true; if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [cameraReady, announcePunch, send, drawPose]);

  useEffect(() => () => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    peerRef.current?.destroy();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const lesson = TUTORIAL_STEPS[tutorialStep];

  return (
    <main>
      <section className="arena-shell">
        <header>
          <div className="brand"><span>✦</span> PUNCH//CAM</div>
          <div className="round-pill">ROUND {round} <b>{String(seconds).padStart(2, "0")}</b></div>
          <div className={`connection ${connected ? "online" : ""}`}>{connected ? "● LIVE" : "○ WAITING"}</div>
        </header>

        {roomCode && connected && !started && !tutorialComplete && <section className="tutorial-overlay" aria-label="動作教學">
          <div className="tutorial-top"><span>動作教學 {tutorialStep + 1} / {TUTORIAL_STEPS.length}</span><div className="tutorial-progress"><i style={{ width: `${((tutorialStep + 1) / TUTORIAL_STEPS.length) * 100}%` }} /></div></div>
          <div className={`coach-canvas ${lesson.key}`} aria-hidden="true"><div className="coach-head" /><div className="coach-body" /><i className="coach-arm left" /><i className="coach-arm right" /><i className="coach-leg left" /><i className="coach-leg right" /><b className="coach-effect">{lesson.key === "block" ? "GUARD" : lesson.key === "duck" ? "DUCK" : lesson.key === "side" ? "SWAY" : "POW!"}</b></div>
          <div className="tutorial-copy"><p>MOVE {String(tutorialStep + 1).padStart(2, "0")}</p><h2>{lesson.title}</h2><span>{lesson.note}</span></div>
          <div className="tutorial-actions">{tutorialStep > 0 && <button className="tutorial-back" onClick={() => setTutorialStep((step) => step - 1)}>上一個</button>}{tutorialStep < TUTORIAL_STEPS.length - 1 ? <button className="tutorial-next" onClick={() => setTutorialStep((step) => step + 1)}>下一個動作 →</button> : <button className="tutorial-next" onClick={finishTutorial}>準備開打 →</button>}</div>
        </section>}

        {!roomCode ? <section className="lobby">
          <p className="eyebrow">WEBCAM BOXING ARENA</p>
          <h1>用你的拳頭<br /><em>上擂台。</em></h1>
          <p className="intro">開鏡頭、分享一個連結，和朋友來場即時拳擊對決。</p>
          <button className="primary" onClick={createRoom}>建立拳擊房間 <span>↗</span></button>
          <div className="join-row"><input value={roomInput} onChange={(event) => setRoomInput(event.target.value)} maxLength={5} placeholder="輸入房間碼" aria-label="房間碼" /><button onClick={joinRoom}>加入</button></div>
          <div className="moves"><span>直拳</span><span>勾拳</span><span>閃躲</span></div>
        </section> : <>
          <section className="scoreboard">
            <div><label>YOU</label><strong>{myHealth}</strong><div className="health"><i style={{ width: `${myHealth}%` }} /></div><small>{myHits} HITS</small></div>
            <div className="vs">VS</div>
            <div className="opponent"><label>FRIEND</label><strong>{opponentHealth}</strong><div className="health"><i style={{ width: `${opponentHealth}%` }} /></div><small>{opponentHits} HITS</small></div>
          </section>
          <section className="video-grid">
            <article className="fighter you"><video ref={videoRef} autoPlay muted playsInline /><canvas ref={poseCanvasRef} className="pose-overlay" /><span className={`tracking ${tracking ? "active" : ""}`}>{tracking ? "● 上半身追蹤中" : "○ 找不到上半身"}</span><span className="tag">YOU</span>{effect?.side === "left" && <div className={`impact ${effect.kind}`}>POW!</div>}</article>
            <article className="fighter friend"><video ref={opponentVideoRef} autoPlay playsInline /><span className="tag">FRIEND</span>{effect?.side === "right" && <div className={`impact ${effect.kind}`}>BAM!</div>} {!connected && <div className="waiting">等待對手<br /><small>分享下方連結</small></div>}</article>
          </section>
          <section className="room-card"><div><label>ROOM CODE</label><b>{roomCode}</b></div>{isHost && <button className="copy" disabled={!hostPeerReady} onClick={() => navigator.clipboard.writeText(roomLink)}>{hostPeerReady ? "複製邀請連結" : "正在建立房間…"}</button>}<p>{gameMessage || status} <span className="move-readout">{visibleWrists === 0 ? "手腕未入鏡：僅可閃躲" : lastMove}</span></p></section>
        </>}
        <footer>坐著即可玩：肩膀、雙手與頭部保持入鏡 · 對手側身即可閃躲</footer>
      </section>
    </main>
  );
}
