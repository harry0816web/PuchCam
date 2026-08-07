import { useEffect, useRef, useState } from "react";
import { getPunchKind, isWristTracked, type PunchKind } from "../src/game-rules";

type Point = { x: number; y: number; visibility?: number };
type Hand = "left" | "right";
type Prompt = { hand: Hand; kind: PunchKind };
type Sample = { t: number; expected: Prompt; hand: Hand; shoulder: [number, number]; elbow: [number, number]; wrist: [number, number]; speed: number; kind: PunchKind | null };
const TEST_SEQUENCE: Prompt[] = [{ hand: "left", kind: "straight" }, { hand: "right", kind: "straight" }, { hand: "left", kind: "hook" }, { hand: "right", kind: "hook" }];
const ACTION_INTERVAL_MS = 2000;
const COUNTDOWN_MS = 3000;

const round = (value: number) => Math.round(value * 10_000) / 10_000;
const promptLabel = ({ hand, kind }: Prompt) => `${hand === "left" ? "左" : "右"}${kind === "straight" ? "直拳" : "勾拳"}`;

export default function PunchTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);
  const previousRef = useRef<{ at: number; left?: { x: number; y: number }; right?: { x: number; y: number } }>({ at: 0 });
  const sequenceStepRef = useRef(0);
  const samplesRef = useRef<Sample[]>([]);
  const phaseRef = useRef<"countdown" | "capture">("countdown");
  const phaseStartedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [sequenceStep, setSequenceStep] = useState(0);
  const [phase, setPhase] = useState<"countdown" | "capture">("countdown");
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState("按下開始後，依畫面提示做左／右直拳與勾拳，每個動作約兩秒。")
  const [result, setResult] = useState("");

  const draw = (points: Point[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    [[11, 13, 15, "#ff4a78"], [12, 14, 16, "#63b9ff"]].forEach(([shoulder, elbow, wrist, color]) => {
      const chain = [Number(shoulder), Number(elbow), Number(wrist)];
      ctx.beginPath();
      chain.forEach((index, position) => {
        const point = points[index];
        if (position === 0) ctx.moveTo(width - point.x * width, point.y * height);
        else ctx.lineTo(width - point.x * width, point.y * height);
      });
      ctx.strokeStyle = String(color); ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.stroke();
    });
  };

  const start = async () => {
    try {
      setResult("");
      samplesRef.current = [];
      previousRef.current = { at: 0 };
      sequenceStepRef.current = 0;
      setSequenceStep(0);
      phaseRef.current = "countdown";
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      detectorRef.current = await vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task" }, runningMode: "VIDEO", numPoses: 1 });
      startedAtRef.current = performance.now();
      phaseStartedAtRef.current = startedAtRef.current;
      recordingRef.current = true;
      setRecording(true);
      setPhase("countdown");
      setCountdown(3);
      setStatus("依畫面中央提示完成動作；倒數結束後會記錄約兩秒。紅色為左手，藍色為右手。");
      const frame = () => {
        const video = videoRef.current;
        if (recordingRef.current && video && video.readyState >= 2) {
          const now = performance.now();
          const phaseElapsed = now - phaseStartedAtRef.current;
          if (phaseRef.current === "countdown" && phaseElapsed >= COUNTDOWN_MS) {
            phaseRef.current = "capture";
            phaseStartedAtRef.current = now;
            setPhase("capture");
          } else if (phaseRef.current === "capture" && phaseElapsed >= ACTION_INTERVAL_MS) {
            const nextStep = (sequenceStepRef.current + 1) % TEST_SEQUENCE.length;
            sequenceStepRef.current = nextStep;
            phaseRef.current = "countdown";
            phaseStartedAtRef.current = now;
            setSequenceStep(nextStep);
            setPhase("countdown");
            setCountdown(3);
          }
          const points = detectorRef.current.detectForVideo(video, now).landmarks?.[0] as Point[] | undefined;
          if (points) {
            draw(points);
            const expected = TEST_SEQUENCE[sequenceStepRef.current];
            if (phaseRef.current === "countdown") setCountdown((value) => {
              const next = Math.max(1, 3 - Math.floor((now - phaseStartedAtRef.current) / 1000));
              return value === next ? value : next;
            });
            if (phaseRef.current === "countdown") {
              if (isWristTracked(points[15].visibility)) previousRef.current.left = { x: points[15].x, y: points[15].y };
              if (isWristTracked(points[16].visibility)) previousRef.current.right = { x: points[16].x, y: points[16].y };
              previousRef.current.at = now;
            }
            if (phaseRef.current === "capture") ([{ hand: "left" as const, shoulder: 11, elbow: 13, wrist: 15 }, { hand: "right" as const, shoulder: 12, elbow: 14, wrist: 16 }]).forEach(({ hand, shoulder, elbow, wrist }) => {
              if (!isWristTracked(points[wrist].visibility)) return;
              const previous = previousRef.current[hand];
              const speed = previous === undefined ? 0 : Math.hypot(points[wrist].x - previous.x, points[wrist].y - previous.y) / Math.max(1, now - previousRef.current.at);
              const kind = getPunchKind({ speed, shoulder: points[shoulder], elbow: points[elbow], wrist: points[wrist], hand, bodyCenterX: (points[11].x + points[12].x) / 2 });
              samplesRef.current.push({ t: Math.round(now - startedAtRef.current), expected, hand, shoulder: [round(points[shoulder].x), round(points[shoulder].y)], elbow: [round(points[elbow].x), round(points[elbow].y)], wrist: [round(points[wrist].x), round(points[wrist].y)], speed: round(speed), kind });
              previousRef.current[hand] = { x: points[wrist].x, y: points[wrist].y };
            });
            previousRef.current.at = now;
          }
          frameRef.current = requestAnimationFrame(frame);
        }
      };
      frame();
    } catch {
      setStatus("無法開啟鏡頭。請允許權限後重試。");
    }
  };

  const stop = () => {
    recordingRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    const samples = samplesRef.current;
    const summary = { version: 4, recordedAt: new Date().toISOString(), expectedCycle: TEST_SEQUENCE, actionIntervalMs: ACTION_INTERVAL_MS, frames: samples.length, straightFrames: samples.filter((sample) => sample.kind === "straight").length, hookFrames: samples.filter((sample) => sample.kind === "hook").length, samples };
    setResult(JSON.stringify(summary));
    setRecording(false);
    setStatus(`已記錄 ${samples.length} 個手腕軌跡點。複製 JSON 後貼回這個對話。`);
  };

  useEffect(() => () => { recordingRef.current = false; if (frameRef.current) cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  const expected = TEST_SEQUENCE[sequenceStep];
  return <main><section className="test-shell"><a href="/" className="test-back">← 回到遊戲</a><p className="eyebrow">MOTION LAB</p><h1>出拳<br /><em>校正工具。</em></h1><p className="intro">這個頁面不會評分或建立房間。它會在每個動作前倒數三秒，接著記錄兩秒的指定動作軌跡。</p><div className="test-camera"><video ref={videoRef} autoPlay muted playsInline /><canvas ref={canvasRef} />{recording && <div className={`test-prompt ${phase}`}><small>請準備：{promptLabel(expected)}</small><strong>{phase === "countdown" ? countdown : "出拳！"}</strong></div>}</div>{recording && <p className="test-sequence">{TEST_SEQUENCE.map((prompt, index) => <span key={`${prompt.hand}-${prompt.kind}`} className={index === sequenceStep ? "current" : ""}>{promptLabel(prompt)}</span>)}</p>}<p className="test-status">{status}{recording && expected && <strong> 現在：{promptLabel(expected)}</strong>}</p><div className="test-actions">{recording ? <button className="primary" onClick={stop}>停止並產生資料</button> : <button className="primary" onClick={start}>開始記錄動作模式</button>}{result && <button className="copy" onClick={() => navigator.clipboard.writeText(result)}>複製 JSON</button>}</div>{result && <textarea className="test-result" value={result} readOnly aria-label="出拳軌跡 JSON" />}</section></main>;
}
