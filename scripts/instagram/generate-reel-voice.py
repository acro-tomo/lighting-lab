from __future__ import annotations

import json
import os
import signal
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

FRAMES_DIR = Path("output/reel-frames")
AUDIO_DIR = Path("output/reel-audio")
CONFIG_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("marketing/instagram/reels/ldk-walkthrough.voice.json")
VOICE_GENERATOR = Path("/Users/hoshi/AI/音声/reel-voice-generator/generate_reel_voice.py")
AIVIS_ENGINE = Path("/Applications/AivisSpeech.app/Contents/Resources/AivisSpeech-Engine/run")
AIVIS_ENGINE_URL = "http://127.0.0.1:10101"
ENGINE_START_TIMEOUT = 90
XFADE = 0.4


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as source:
        return source.getnframes() / source.getframerate()


def engine_is_ready() -> bool:
    try:
        with urllib.request.urlopen(f"{AIVIS_ENGINE_URL}/version", timeout=2) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def stop_engine(process: subprocess.Popen[object]) -> None:
    if process.poll() is not None:
        return
    os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()


def ensure_aivis_engine() -> None:
    if engine_is_ready():
        return
    if not AIVIS_ENGINE.is_file():
        raise RuntimeError(f"AivisSpeech Engine が無い: {AIVIS_ENGINE}")

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    log_path = AUDIO_DIR / "aivis-engine.log"
    with log_path.open("w", encoding="utf-8") as log:
        try:
            process = subprocess.Popen(
                [str(AIVIS_ENGINE), "--host", "127.0.0.1", "--port", "10101"],
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except OSError as error:
            raise RuntimeError(f"AivisSpeech Engine を起動できない: {AIVIS_ENGINE} ({error})") from error

    print("AivisSpeech Engine を起動しています…")
    deadline = time.monotonic() + ENGINE_START_TIMEOUT
    while time.monotonic() < deadline:
        if engine_is_ready():
            return
        if process.poll() is not None:
            raise RuntimeError(
                f"AivisSpeech Engine の起動に失敗した（終了コード {process.returncode}）。ログ: {log_path}"
            )
        time.sleep(0.5)
    stop_engine(process)
    raise RuntimeError(f"AivisSpeech Engine の起動が {ENGINE_START_TIMEOUT} 秒以内に完了しない。ログ: {log_path}")


def main() -> None:
    if not (FRAMES_DIR / "shots.json").exists():
        raise RuntimeError(f"{FRAMES_DIR}/shots.json が無い。先に npm run ig:reel-capture を実行する。")

    config = json.loads(CONFIG_PATH.read_text())
    frames = json.loads((FRAMES_DIR / "shots.json").read_text())
    shots = [shot for shot in frames["shots"] if shot["id"] in config["shots"]]
    if not shots:
        raise RuntimeError(f"{CONFIG_PATH} に shots.json と一致する台本が無い。")
    if len(shots) != len(frames["shots"]):
        raise RuntimeError(f"{CONFIG_PATH} の台本が不足している。")
    if not VOICE_GENERATOR.exists():
        raise RuntimeError(f"リール音声生成ツールが無い: {VOICE_GENERATOR}")
    ensure_aivis_engine()

    durations = [shot["frames"] / frames["fps"] for shot in shots]
    xfade = max(0, min(XFADE, min(durations) / 2 - 1 / frames["fps"]))
    starts: list[float] = []
    elapsed = 0.0
    for duration in durations:
        starts.append(elapsed)
        elapsed += duration - xfade
    elapsed += xfade

    run_dir = AUDIO_DIR / f"run-{int(time.time() * 1000)}-{os.getpid()}"
    run_dir.mkdir(parents=True, exist_ok=True)
    cues = []
    try:
        for index, shot in enumerate(shots):
            script = run_dir / f"{shot['id']}.txt"
            path = run_dir / f"{shot['id']}.wav"
            script.write_text(config["shots"][shot["id"]], encoding="utf-8")
            try:
                subprocess.run(
                    [
                        sys.executable,
                        str(VOICE_GENERATOR),
                        str(script),
                        "--speaker-id", str(config["speakerId"]),
                        "--speed", str(config["speed"]),
                        "--intonation", str(config["intonation"]),
                        "--tempo-dynamics", str(config["tempoDynamics"]),
                        "--volume", str(config["volume"]),
                        "--output", str(path),
                    ],
                    check=True,
                )
            except subprocess.CalledProcessError as error:
                raise RuntimeError(f"{shot['id']} の音声生成に失敗した（終了コード {error.returncode}）。") from error
            duration = wav_duration(path)
            max_duration = elapsed - starts[index] if index == len(shots) - 1 else starts[index + 1] - starts[index]
            if duration > max_duration:
                raise RuntimeError(
                    f"{shot['id']} の音声が {duration:.2f}秒で、許容尺 {max_duration:.2f}秒を超えた。"
                    "台本を短くするか、撮影尺を延ばす。"
                )

            cues.append(
                {
                    "id": shot["id"],
                    "path": path.as_posix(),
                    "start": starts[index],
                    "duration": duration,
                    "maxDuration": max_duration,
                }
            )
            print(f"voice={shot['id']} {duration:.2f}s / {max_duration:.2f}s")
    except RuntimeError:
        shutil.rmtree(run_dir)
        raise

    next_manifest = AUDIO_DIR / f"manifest-{os.getpid()}.json"
    next_manifest.write_text(
        json.dumps(
            {
                "duration": elapsed,
                "fps": frames["fps"],
                "shots": [
                    {"id": shot["id"], "frames": shot["frames"], "start": starts[index], "maxDuration": cues[index]["maxDuration"]}
                    for index, shot in enumerate(shots)
                ],
                "cues": cues,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    os.replace(next_manifest, AUDIO_DIR / "manifest.json")
    for previous_run in AUDIO_DIR.glob("run-*"):
        if previous_run != run_dir:
            shutil.rmtree(previous_run)
    print(f"voice ready: {AUDIO_DIR / 'manifest.json'}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"エラー: {error}") from error
