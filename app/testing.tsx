import { useEffect, useRef, useState } from "react";
import { getPunchKind, isWristTracked, type PunchKind } from "../src/game-rules";

type Point = { x: number; y: number; visibility?: number };
type Sample = { t: number; hand: "left" | "right"; shoulder: [number, number]; elbow: [number, number]; wrist: [number, number]; speed: number; kind: PunchKind | null };

const round = (value: number) => Math.round(value * 10_000) / 10_000;

export default function PunchTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const recordingRef = useRef(false);
  const startedAtRef = useRef(0);
  const previousRef = useRef<{ at: number; left?: { x: number; y: number }; right?: { x: number; y: number } }>({ at: 0 });
  const samplesRef = useRef<Sample[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("按下開始後，做 5～10 次你認為是直拳的動作。")
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 1280, height: 720 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      detectorRef.current = await vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task" }, runningMode: "VIDEO", numPoses: 1 });
      startedAtRef.current = performance.now();
      recordingRef.current = true;
      setRecording(true);
      setStatus("記錄中：請做直拳。紅色為左手，藍色為右手。");
      const frame = () => {
        const video = videoRef.current;
        if (recordingRef.current && video && video.readyState >= 2) {
          const now = performance.now();
          const points = detectorRef.current.detectForVideo(video, now).landmarks?.[0] as Point[] | undefined;
          if (points) {
            draw(points);
            ([{ hand: "left" as const, shoulder: 11, elbow: 13, wrist: 15 }, { hand: "right" as const, shoulder: 12, elbow: 14, wrist: 16 }]).forEach(({ hand, shoulder, elbow, wrist }) => {
              if (!isWristTracked(points[wrist].visibility)) return;
              const previous = previousRef.current[hand];
              const speed = previous === undefined ? 0 : Math.hypot(points[wrist].x - previous.x, points[wrist].y - previous.y) / Math.max(1, now - previousRef.current.at);
              const kind = getPunchKind({ speed, shoulder: points[shoulder], elbow: points[elbow], wrist: points[wrist] });
              samplesRef.current.push({ t: Math.round(now - startedAtRef.current), hand, shoulder: [round(points[shoulder].x), round(points[shoulder].y)], elbow: [round(points[elbow].x), round(points[elbow].y)], wrist: [round(points[wrist].x), round(points[wrist].y)], speed: round(speed), kind });
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
    const summary = { version: 1, recordedAt: new Date().toISOString(), frames: samples.length, straightFrames: samples.filter((sample) => sample.kind === "straight").length, hookFrames: samples.filter((sample) => sample.kind === "hook").length, samples };
    setResult(JSON.stringify(summary));
    setRecording(false);
    setStatus(`已記錄 ${samples.length} 個手腕軌跡點。複製 JSON 後貼回這個對話。`);
  };

  useEffect(() => () => { recordingRef.current = false; if (frameRef.current) cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  return <main><section className="test-shell"><a href="/" className="test-back">← 回到遊戲</a><p className="eyebrow">MOTION LAB</p><h1>直拳<br /><em>校正工具。</em></h1><p className="intro">這個頁面不會建立房間或傳送影像。它只在你的瀏覽器中記錄姿勢座標，供我們調整直拳判定。</p><div className="test-camera"><video ref={videoRef} autoPlay muted playsInline /><canvas ref={canvasRef} /></div><p className="test-status">{status}</p><div className="test-actions">{recording ? <button className="primary" onClick={stop}>停止並產生資料</button> : <button className="primary" onClick={start}>開始記錄直拳</button>}{result && <button className="copy" onClick={() => navigator.clipboard.writeText(result)}>複製 JSON</button>}</div>{result && <textarea className="test-result" value={result} readOnly aria-label="直拳軌跡 JSON" />}</section></main>;
}
