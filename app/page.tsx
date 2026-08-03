"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Peer, type DataConnection, type MediaConnection } from "peerjs";
import { getDodgeDirection, getPunchKind, isBlocking, isWristTracked, resolvePunch, type DodgeDirection, type PunchHand } from "../src/game-rules";

type Fighter = "left" | "right";
type PunchKind = "straight" | "hook";
type MaskKind = "frog" | "pig" | "rabbit";
type FacePose = { x: number; y: number; scale: number; pitch: number; yaw: number; roll: number };
type EventMessage =
  | { type: "punch"; kind: PunchKind; hand: PunchHand }
  | { type: "dodge"; active: boolean; direction?: DodgeDirection }
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
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const opponentVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const faceDetectorRef = useRef<any>(null);
  const facePoseRef = useRef<FacePose | null>(null);
  const neutralFacePitchRef = useRef<number | null>(null);
  const lastWristRef = useRef({ left: 0, right: 0, at: 0 });
  const neutralShoulderXRef = useRef<number | null>(null);
  const cooldownRef = useRef({ left: 0, right: 0 });
  const dodgeRef = useRef(false);
  const dodgeDirectionRef = useRef<DodgeDirection | null>(null);
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
  const [mask, setMask] = useState<MaskKind>("frog");
  const [faceTracked, setFaceTracked] = useState(false);

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
      if (startedRef.current) {
        const result = resolvePunch(message.kind, dodgeDirectionRef.current, blockRef.current);
        if (result.outcome === "evaded") {
          setStatus(message.kind === "straight" ? "漂亮側閃，躲過直拳！" : "下蹲成功，躲過勾拳！");
          return;
        }
        const damage = result.damage;
        setMyHealth((health) => Math.max(0, health - damage));
        setOpponentHits((hits) => hits + 1);
        send({ type: "hit", damage });
        if (result.outcome === "blocked") setStatus("格檔成功，傷害降低！");
      }
    }
    if (message.type === "dodge") setStatus(message.active ? `對手正在${message.direction ?? ""}閃躲！` : "對手就位");
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

  const announcePunch = useCallback((kind: PunchKind, hand: PunchHand) => {
    setEffect({ side: "left", kind });
    setLastMove(`偵測到${hand === "left" ? "左" : "右"}${kind === "straight" ? "直拳" : "勾拳"}！`);
    // Preview effects work before the match starts; damage is only shared in a live round.
    if (startedRef.current) send({ type: "punch", kind, hand });
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
    const canvas = faceCanvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let frameId = 0;
    let renderer: any;

    const mountMask = async () => {
      const THREE = await import("three");
      if (disposed) return;
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
      camera.position.z = 3;
      scene.add(new THREE.AmbientLight(0xffffff, 1.8));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
      keyLight.position.set(1, 2, 3);
      scene.add(keyLight);

      const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05 });
      const orb = (color: number, radius: number, position: [number, number, number], scale?: [number, number, number]) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), material(color));
        mesh.position.set(...position);
        if (scale) mesh.scale.set(...scale);
        return mesh;
      };
      const group = new THREE.Group();
      if (mask === "frog") {
        group.add(orb(0x63c95b, 0.38, [0, 0, 0]));
        [[-0.2, 0.22], [0.2, 0.22]].forEach(([x, y]) => {
          group.add(orb(0x75e26d, 0.14, [x, y, 0.26]));
          group.add(orb(0xffffff, 0.08, [x, y, 0.38]));
          group.add(orb(0x151515, 0.04, [x, y, 0.45]));
        });
        group.add(orb(0xb0ee8b, 0.25, [0, -0.12, 0.3], [1.1, 0.48, 0.4]));
      }
      if (mask === "pig") {
        group.add(orb(0xff8db0, 0.39, [0, 0, 0]));
        group.add(orb(0xffa7c2, 0.2, [0, -0.05, 0.34], [1.22, 0.62, 0.38]));
        [[-0.08, -0.05], [0.08, -0.05]].forEach(([x, y]) => group.add(orb(0x9d4162, 0.035, [x, y, 0.44], [1, 1.4, 0.5])));
        [[-0.28, 0.25], [0.28, 0.25]].forEach(([x, y]) => group.add(orb(0xff8db0, 0.16, [x, y, 0], [1.15, 0.75, 0.5])));
      }
      if (mask === "rabbit") {
        group.add(orb(0xf7f3eb, 0.37, [0, 0, 0]));
        [[-0.16, 0.43], [0.16, 0.43]].forEach(([x, y]) => {
          group.add(orb(0xf7f3eb, 0.16, [x, y, -0.02], [0.78, 2.2, 0.55]));
          group.add(orb(0xffb6ca, 0.08, [x, y, 0.12], [0.5, 1.65, 0.35]));
        });
        group.add(orb(0xffa6bd, 0.075, [0, -0.06, 0.37], [1.25, 0.72, 0.5]));
      }
      scene.add(group);

      const render = () => {
        if (disposed) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width && height && (canvas.width !== width * renderer.getPixelRatio() || canvas.height !== height * renderer.getPixelRatio())) {
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
        const pose = facePoseRef.current;
        group.visible = Boolean(pose);
        if (pose) {
          group.position.set((pose.x - 0.5) * 2.1, (0.5 - pose.y) * 1.55, 0);
          group.scale.setScalar(pose.scale);
          group.rotation.set(pose.pitch, pose.yaw, pose.roll);
        }
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(render);
      };
      render();
    };
    mountMask();
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      renderer?.dispose();
    };
  }, [mask]);

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
      faceDetectorRef.current = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task" },
        runningMode: "VIDEO",
        numFaces: 1,
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
            const face = faceDetectorRef.current?.detectForVideo(video, now).faceLandmarks?.[0];
            if (face) {
              const nose = face[1];
              const leftEye = face[33];
              const rightEye = face[263];
              const leftEdge = face[234];
              const rightEdge = face[454];
              const forehead = face[10];
              const chin = face[152];
              const faceWidth = Math.abs(rightEdge.x - leftEdge.x);
              const faceHeight = Math.abs(chin.y - forehead.y);
              const faceCenter = (leftEdge.x + rightEdge.x) / 2;
              const faceMiddleY = (forehead.y + chin.y) / 2;
              const eyeLine = (leftEye.y + rightEye.y) / 2;
              const verticalFaceSpan = Math.max(chin.y - eyeLine, 0.01);
              const pitchRatio = (nose.y - eyeLine) / verticalFaceSpan;
              if (neutralFacePitchRef.current === null) neutralFacePitchRef.current = pitchRatio;
              facePoseRef.current = {
                // Centre and scale the mask from the whole face bounding area,
                // rather than only the nose, so it covers the entire head.
                x: 1 - faceCenter,
                y: faceMiddleY,
                scale: Math.max(0.85, Math.min(2.4, Math.max(faceWidth, faceHeight) * 4.6)),
                // Compare nose height against the neutral eye-to-chin proportion to tilt the 3D head.
                pitch: Math.max(-0.55, Math.min(0.55, (pitchRatio - neutralFacePitchRef.current) * 5)),
                // The camera preview is mirrored, so reverse raw face yaw for the 3D mask.
                yaw: -Math.max(-0.7, Math.min(0.7, ((nose.x - faceCenter) / Math.max(faceWidth, 0.01)) * 1.7)),
                roll: -Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x),
              };
              setFaceTracked((value) => value || true);
            } else {
              facePoseRef.current = null;
              neutralFacePitchRef.current = null;
              setFaceTracked(false);
            }
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
            if (dodging) dodgeDirectionRef.current = dodgeDirection;
            if (dodging !== dodgeRef.current) {
              dodgeRef.current = dodging;
              send({ type: "dodge", active: dodging, direction: dodgeDirection ?? undefined });
              if (dodging) setLastMove(`偵測到${dodgeDirection}閃躲！`);
            }
            if (!dodging) dodgeDirectionRef.current = null;
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
                announcePunch(punchKind, key);
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
            facePoseRef.current = null;
            neutralFacePitchRef.current = null;
            setFaceTracked(false);
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
            <article className="fighter you"><video ref={videoRef} autoPlay muted playsInline /><canvas ref={poseCanvasRef} className="pose-overlay" /><canvas ref={faceCanvasRef} className="three-mask-overlay" /><div className="mask-picker" aria-label="選擇 3D 頭套">{([{ key: "frog", emoji: "🐸" }, { key: "pig", emoji: "🐷" }, { key: "rabbit", emoji: "🐰" }] as const).map(({ key, emoji }) => <button key={key} className={mask === key ? "selected" : ""} onClick={() => setMask(key)} aria-label={`選擇 ${emoji} 3D 頭套`}>{emoji}</button>)}</div><span className={`face-tracking ${faceTracked ? "active" : ""}`}>{faceTracked ? "● 3D FACE" : "○ 找不到臉部"}</span><span className={`tracking ${tracking ? "active" : ""}`}>{tracking ? "● 上半身追蹤中" : "○ 找不到上半身"}</span><span className="tag">YOU</span>{effect?.side === "left" && <div className={`attack-fx ${effect.kind}`}><i /><i /><i /><b>{effect.kind === "straight" ? "KAPOW!" : "WHAM!"}</b></div>}</article>
            <article className="fighter friend"><video ref={opponentVideoRef} autoPlay playsInline /><span className="tag">FRIEND</span>{effect?.side === "right" && <div className={`attack-fx ${effect.kind}`}><i /><i /><i /><b>{effect.kind === "straight" ? "KAPOW!" : "WHAM!"}</b></div>} {!connected && <div className="waiting">等待對手<br /><small>分享下方連結</small></div>}</article>
          </section>
          <section className="room-card"><div><label>ROOM CODE</label><b>{roomCode}</b></div>{isHost && <button className="copy" disabled={!hostPeerReady} onClick={() => navigator.clipboard.writeText(roomLink)}>{hostPeerReady ? "複製邀請連結" : "正在建立房間…"}</button>}<p>{gameMessage || status} <span className="move-readout">{visibleWrists === 0 ? "手腕未入鏡：僅可閃躲" : lastMove}</span></p></section>
        </>}
        <footer>坐著即可玩：肩膀、雙手與頭部保持入鏡 · 對手側身即可閃躲</footer>
      </section>
    </main>
  );
}
