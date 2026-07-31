// 完成した mp4 が投稿仕様を満たしているか確認し、目視用のフレームを抜き出す。
//
// 使い方:
//   REEL_CONFIG=marketing/instagram/reels/<name>.reel.json npm run ig:reel-check
//   npm run ig:reel-check -- marketing/instagram/out/reel-dining-pendant-vs-downlight.mp4
//
// 「生成した」で完成扱いにしないための工程。仕様チェックは自動で落とせるが、
// テロップの重なり・比較対象が見えているか・免責が読めるかは人間が見るしかないので、
// 等間隔で抜いた PNG を output/reel-check/<name>/ に置く。
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

const EXPECTED = {
  width: 1080,
  height: 1920,
  fps: 30,
  videoCodec: "h264",
  audioCodec: "aac"
};
const FRAME_COUNT = Number(process.env.REEL_CHECK_FRAMES ?? 8);

const pathArg = process.argv.slice(2).find((arg) => arg.endsWith(".mp4"));
const configPath = process.env.REEL_CONFIG;
if (!pathArg && !configPath) {
  throw new Error("REEL_CONFIG を指定するか、mp4 のパスを引数で渡す。");
}
const target = pathArg
  ? resolve(pathArg)
  : resolve("marketing/instagram/out", JSON.parse(await readFile(configPath, "utf8")).outName);

if (!existsSync(target)) {
  throw new Error(`mp4 が無い: ${target}\n先に撮影とエンコードを実行する。`);
}

// ffprobe は同梱していないので、ffmpeg が出力先なしで落ちるときの stderr を読む。
async function probe(file) {
  try {
    await execFileAsync(ffmpegPath, ["-hide_banner", "-i", file], { maxBuffer: 8 * 1024 * 1024 });
    return "";
  } catch (error) {
    return String(error.stderr ?? "");
  }
}

const info = await probe(target);
const videoLine = info.split("\n").find((line) => line.includes("Stream") && line.includes("Video:")) ?? "";
const audioLine = info.split("\n").find((line) => line.includes("Stream") && line.includes("Audio:")) ?? "";
const durationMatch = info.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);

const resolutionMatch = videoLine.match(/,\s(\d{2,5})x(\d{2,5})/);
const fpsMatch = videoLine.match(/([\d.]+)\s*fps/);
const videoCodecMatch = videoLine.match(/Video:\s*([a-zA-Z0-9]+)/);
const audioCodecMatch = audioLine.match(/Audio:\s*([a-zA-Z0-9]+)/);

const durationSec = durationMatch
  ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
  : 0;

const actual = {
  width: resolutionMatch ? Number(resolutionMatch[1]) : 0,
  height: resolutionMatch ? Number(resolutionMatch[2]) : 0,
  fps: fpsMatch ? Number(fpsMatch[1]) : 0,
  videoCodec: videoCodecMatch ? videoCodecMatch[1].toLowerCase() : "?",
  audioCodec: audioCodecMatch ? audioCodecMatch[1].toLowerCase() : "?"
};

const checks = [
  ["幅", actual.width, EXPECTED.width, actual.width === EXPECTED.width],
  ["高さ", actual.height, EXPECTED.height, actual.height === EXPECTED.height],
  ["fps", actual.fps, EXPECTED.fps, Math.abs(actual.fps - EXPECTED.fps) < 0.5],
  ["映像コーデック", actual.videoCodec, EXPECTED.videoCodec, actual.videoCodec === EXPECTED.videoCodec],
  ["音声コーデック", actual.audioCodec, EXPECTED.audioCodec, actual.audioCodec === EXPECTED.audioCodec],
  ["音声トラック", audioLine ? "あり" : "なし", "あり", Boolean(audioLine)]
];

console.log(`\n${basename(target)}  ${durationSec.toFixed(2)}s\n`);
for (const [label, got, want, ok] of checks) {
  console.log(`  ${ok ? "OK  " : "NG  "}${label.padEnd(14)}${got}${ok ? "" : `  (期待: ${want})`}`);
}

// 等間隔でフレームを抜く。先頭と末尾は転換の途中に当たりやすいので少し内側にずらす。
const frameDir = resolve("output/reel-check", basename(target, ".mp4"));
await rm(frameDir, { recursive: true, force: true });
await mkdir(frameDir, { recursive: true });
for (let index = 0; index < FRAME_COUNT; index += 1) {
  const at = durationSec * ((index + 0.5) / FRAME_COUNT);
  await execFileAsync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error",
    "-ss", at.toFixed(2), "-i", target,
    "-frames:v", "1", "-y",
    `${frameDir}/t${at.toFixed(1).padStart(5, "0")}s.png`
  ]);
}

const failed = checks.filter(([, , , ok]) => !ok);
console.log(`\n目視用フレーム: ${frameDir}（${FRAME_COUNT}枚）`);
console.log("  次を目で確認する: テロップの重なり / 比較対象が見えているか / 免責が読めるか / 安全領域");
console.log(`\n仕様チェック: ${failed.length === 0 ? "PASS" : `FAIL (${failed.length}件)`}\n`);
if (failed.length > 0) process.exitCode = 1;
