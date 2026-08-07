#!/usr/bin/env python3
"""Show coached Memoji/head-rotation prompts with a countdown overlay.

By default this does not record the camera. It opens a local browser coach page
so you can record the actual Apple Memoji in Messages/FaceTime/iPhone while
following the prompts.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "inputs" / "memoji" / "recordings"

DEFAULT_TAKES = [
    {
        "id": "idle-front",
        "title": "正面自然表情",
        "instruction": "在 Apple Memoji 錄影裡保持正面，表情自然。",
        "duration": 4,
    },
    {
        "id": "slow-yaw",
        "title": "左右轉頭",
        "instruction": "錄 Memoji 時慢慢看左邊，再慢慢看右邊，最後回正。",
        "duration": 7,
    },
    {
        "id": "slow-pitch",
        "title": "上下點頭",
        "instruction": "錄 Memoji 時慢慢往上看，再慢慢往下看，最後回正。",
        "duration": 6,
    },
    {
        "id": "circle",
        "title": "繞一圈",
        "instruction": "錄 Memoji 時讓頭像沿著圓走：上、右、下、左，慢慢回正。",
        "duration": 9,
    },
    {
        "id": "shout",
        "title": "吶喊表情",
        "instruction": "錄 Memoji 時張嘴或做出出拳吶喊表情，頭保持正面。",
        "duration": 4,
    },
    {
        "id": "hit",
        "title": "被打到",
        "instruction": "錄 Memoji 時做出被打到的表情，頭小幅往旁邊晃一下。",
        "duration": 4,
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Coached Memoji recorder")
    parser.add_argument("--device", default="0", help="ffmpeg AVFoundation video device index or name. Default: 0")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output directory for recordings")
    parser.add_argument("--prefix", default="memoji", help="Filename prefix")
    parser.add_argument("--countdown", type=int, default=3, help="Countdown seconds before each take")
    parser.add_argument("--width", type=int, default=1280, help="Capture width")
    parser.add_argument("--height", type=int, default=720, help="Capture height")
    parser.add_argument("--fps", type=int, default=30, help="Capture frame rate")
    parser.add_argument("--record-camera", action="store_true", help="Also record the selected AVFoundation camera")
    parser.add_argument("--coach-only", action="store_true", help="Deprecated; prompts only is now the default")
    parser.add_argument("--list-devices", action="store_true", help="List AVFoundation devices and exit")
    parser.add_argument("--takes", help="JSON file with custom takes")
    parser.add_argument("--port", type=int, default=0, help="Coach browser UI port. Default: choose automatically")
    return parser.parse_args()


def list_devices() -> int:
    if not shutil.which("ffmpeg"):
        print("ffmpeg was not found. Install it with: brew install ffmpeg", file=sys.stderr)
        return 1
    result = subprocess.run(
        ["ffmpeg", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    print(result.stdout)
    return 0


def load_takes(path: str | None) -> list[dict[str, object]]:
    if not path:
        return DEFAULT_TAKES
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("--takes JSON must be an array")
    for take in data:
        for key in ("id", "title", "instruction", "duration"):
            if key not in take:
                raise ValueError(f"take is missing {key}: {take}")
    return data


def run_ffmpeg(args: argparse.Namespace, output_path: Path, duration: int) -> subprocess.Popen[bytes]:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg was not found. Install it with: brew install ffmpeg")

    capture_input = f"{args.device}:none"
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "avfoundation",
        "-framerate",
        str(args.fps),
        "-video_size",
        f"{args.width}x{args.height}",
        "-i",
        capture_input,
        "-t",
        str(duration),
        "-an",
        "-c:v",
        "h264_videotoolbox",
        "-allow_sw",
        "1",
        "-pix_fmt",
        "yuv420p",
        str(output_path),
    ]
    return subprocess.Popen(command, cwd=ROOT)


class BrowserRecorderApp:
    def __init__(self, args: argparse.Namespace, takes: list[dict[str, object]]) -> None:
        self.args = args
        self.takes = takes
        self.output_dir = Path(args.output).resolve()
        if args.record_camera:
            self.output_dir.mkdir(parents=True, exist_ok=True)
        self.session = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        self.current = 0
        self.cancelled = False
        self.process: subprocess.Popen[bytes] | None = None
        self.started = False
        self.done = False
        self.lock = threading.Lock()
        self.state = {
            "title": "PunchCam Memoji Recorder",
            "instruction": "按 Start 後，在 Apple Memoji 錄影畫面依提示動作。這個頁面只提示，不會錄你的攝影機。",
            "counter": "READY",
            "progress": "提示模式：請用 Apple Memoji 自己錄影並匯出 .mov",
            "started": False,
            "done": False,
        }

    def set_text(self, title: str, instruction: str, counter: str, progress: str) -> None:
        with self.lock:
            self.state.update({
                "title": title,
                "instruction": instruction,
                "counter": counter,
                "progress": progress,
                "started": self.started,
                "done": self.done,
            })

    def start(self) -> None:
        if self.started:
            return
        self.started = True
        threading.Thread(target=self.next_take, daemon=True).start()

    def cancel(self) -> None:
        self.cancelled = True
        if self.process and self.process.poll() is None:
            self.process.terminate()
        self.done = True
        self.set_text("已取消", "錄影已停止。", "STOP", f"輸出：{self.output_dir}")

    def next_take(self) -> None:
        if self.cancelled:
            return
        if self.current >= len(self.takes):
            self.done = True
            self.set_text("完成", "所有片段都錄好了。", "OK", f"輸出：{self.output_dir}")
            return

        take = self.takes[self.current]
        self.current += 1
        self.record_take(take)

    def record_take(self, take: dict[str, object]) -> None:
        take_id = str(take["id"])
        title = str(take["title"])
        instruction = str(take["instruction"])
        duration = int(take["duration"])
        progress = f"{self.current}/{len(self.takes)}  {duration} 秒"

        self.set_text(title, instruction, "準備", progress)
        time.sleep(1)
        for value in range(self.args.countdown, 0, -1):
            if self.cancelled:
                return
            self.set_text(title, instruction, str(value), progress)
            time.sleep(1)

        output_path = self.output_dir / f"{self.args.prefix}-{take_id}-{self.session}.mov"
        self.set_text(title, instruction, "GO", "請在 Apple Memoji 錄這一段")

        if self.args.record_camera:
            self.set_text(title, instruction, "REC", f"錄影中：{output_path.name}")
            self.process = run_ffmpeg(self.args, output_path, duration)
            status = self.process.wait()
            if status != 0 and not self.cancelled:
                self.set_text("錄影失敗", f"ffmpeg 結束碼：{status}", "ERR", "請回終端看錯誤訊息。")
                self.cancel()
                return
        else:
            time.sleep(duration)

        if self.cancelled:
            return
        self.set_text("休息一下", "下一段快開始了。", "✓", f"完成提示：{take_id}")
        time.sleep(1.2)
        self.next_take()

    def snapshot(self) -> dict[str, object]:
        with self.lock:
            return dict(self.state)


def coach_html() -> str:
    return """<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PunchCam Memoji Recorder</title>
<style>
  :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #171315; color: #fff7ec; }
  main { width: min(920px, calc(100vw - 48px)); text-align: center; }
  h1 { margin: 0 0 20px; font-size: clamp(34px, 6vw, 72px); line-height: 1; }
  p { margin: 0 auto 24px; max-width: 760px; font-size: clamp(22px, 3vw, 36px); line-height: 1.3; }
  #counter { font-size: clamp(92px, 22vw, 220px); font-weight: 900; line-height: .9; color: #ffe253; }
  #progress { margin-top: 24px; color: #c8bec0; font-size: 18px; }
  button { margin-top: 28px; border: 2px solid #fff7ec; background: #ff4a78; color: #201316; font-size: 24px; font-weight: 900; padding: 14px 30px; cursor: pointer; }
  button[hidden] { display: none; }
</style>
</head>
<body>
<main>
  <h1 id="title">PunchCam Memoji Recorder</h1>
  <p id="instruction">載入中...</p>
  <div id="counter">READY</div>
  <div id="progress"></div>
  <button id="start">Start</button>
</main>
<script>
const title = document.querySelector("#title");
const instruction = document.querySelector("#instruction");
const counter = document.querySelector("#counter");
const progress = document.querySelector("#progress");
const start = document.querySelector("#start");

async function refresh() {
  const state = await fetch("/state").then((response) => response.json());
  title.textContent = state.title;
  instruction.textContent = state.instruction;
  counter.textContent = state.counter;
  progress.textContent = state.progress;
  start.hidden = state.started;
}
start.addEventListener("click", async () => {
  await fetch("/start", { method: "POST" });
  start.hidden = true;
  refresh();
});
refresh();
setInterval(refresh, 200);
</script>
</body>
</html>
"""


def serve_browser_ui(app: BrowserRecorderApp, port: int) -> None:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            return

        def do_GET(self) -> None:
            if self.path == "/":
                body = coach_html().encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path == "/state":
                body = json.dumps(app.snapshot()).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_error(404)

        def do_POST(self) -> None:
            if self.path == "/start":
                app.start()
                self.send_response(204)
                self.end_headers()
                return
            if self.path == "/cancel":
                app.cancel()
                self.send_response(204)
                self.end_headers()
                return
            self.send_error(404)

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"Coach window: {url}")
    webbrowser.open(url)
    try:
        while not app.done:
            server.handle_request()
    except KeyboardInterrupt:
        app.cancel()
    finally:
        server.server_close()


def main() -> int:
    args = parse_args()
    if args.list_devices:
        return list_devices()
    if not args.coach_only and sys.platform != "darwin":
        print("Recording mode currently uses macOS AVFoundation. Use --coach-only on other systems.", file=sys.stderr)
        return 1

    try:
        takes = load_takes(args.takes)
    except Exception as error:
        print(f"Could not load takes: {error}", file=sys.stderr)
        return 1

    app = BrowserRecorderApp(args, takes)
    serve_browser_ui(app, args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
