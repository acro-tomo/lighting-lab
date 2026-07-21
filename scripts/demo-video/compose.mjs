// ナレーション同期タイムラインで全素材をMP4に合成する。
// 前提: capture-demo-assets.mjs / make-endcard.mjs 実行済み。
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const A = "output/demo-video/assets";
const SEG = "output/demo-video/segments";
const OUT = "output/demo-video/lighting-lab-openai-build-week-demo.mp4";
const NARRATION = "/Users/hoshi/AI/kokoro tts/output/lighting_lab.wav";

await mkdir(SEG, { recursive: true });

const ENC = ["-r", "30", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-an"];
const VF_BASE = "scale=1920:1080:flags=lanczos,setsar=1,fps=30";

const lastFrame = async (dir) => {
  const files = (await readdir(`${A}/frames/${dir}`)).filter((f) => f.endsWith(".png")).sort();
  return `${A}/frames/${dir}/${files[files.length - 1]}`;
};

// [name, type, source, duration, extraVF]
const segments = [
  ["01", "frames", "S1-open", 18.5, "fade=t=in:st=0:d=0.5"],
  ["02", "frames", "S2-drift", 15.3, null],
  ["03", "frames", "U12", 26.8, null],
  ["04", "still", `${A}/stills/A-warm.png`, 11.45, null],
  ["05", "still", `${A}/stills/A-neutral.png`, 8.09, null],
  ["06", "still", `${A}/stills/A-white.png`, 8.02, null],
  ["07", "still", `${A}/stills/A-warm.png`, 1.55, null],
  ["08", "still", `${A}/stills/A-neutral.png`, 1.04, null],
  ["09", "still", `${A}/stills/A-white.png`, 2.05, null],
  ["10", "still", `${A}/stills/A-warm.png`, 1.63, null],
  ["11", "still", `${A}/stills/A-bright.png`, 2.09, null],
  ["12", "still", `${A}/stills/A-dim.png`, 4.98, null],
  ["13", "still", `${A}/stills/C-narrow.png`, 5.12, null],
  ["14", "still", `${A}/stills/C-wide.png`, 6.37, null],
  ["15a", "frames", "S6a-living", 7.02, null],
  ["15b", "frames", "S6b-dining", 6.0, null],
  ["16", "frames", "U3", 3.93, null],
  ["17", "still", `${A}/frames/S8-pan/f0000.png`, 3.05, null],
  ["18", "frames", "S8-pan", 15.39, null],
  ["19", "still", "S8LAST", 1.98, null],
  ["20", "frames", "S9-pull", 9.7, null],
  ["21", "still", "S9LAST", 11.94, "fade=t=out:st=11.34:d=0.6"],
  ["22", "still", `${A}/endcard.png`, 6.0, "fade=t=in:st=0:d=0.4,fade=t=out:st=5.2:d=0.8"]
];

const outFiles = [];
for (const [id, type, source, dur, extraVF] of segments) {
  const out = `${SEG}/seg${id}.ts`;
  outFiles.push(out);
  const vf = extraVF ? `${VF_BASE},${extraVF}` : VF_BASE;
  let args;
  if (type === "frames") {
    args = ["-y", "-framerate", "30", "-i", `${A}/frames/${source}/f%04d.png`, "-t", String(dur), "-vf", vf, ...ENC, out];
  } else if (type === "still") {
    let src = source;
    if (src === "S8LAST") src = await lastFrame("S8-pan");
    if (src === "S9LAST") src = await lastFrame("S9-pull");
    args = ["-y", "-loop", "1", "-framerate", "30", "-i", src, "-t", String(dur), "-vf", vf, ...ENC, out];
  } else if (type === "webm-tail") {
    const [file, tail] = source.split("#");
    args = ["-y", "-sseof", `-${tail}`, "-i", file, "-t", String(dur), "-vf", vf, ...ENC, out];
  }
  await run("ffmpeg", args, { maxBuffer: 32 * 1024 * 1024 });
  console.log(`seg${id} ok (${dur}s)`);
}

const listPath = `${SEG}/list.txt`;
await writeFile(listPath, outFiles.map((f) => `file '${f.split("/").pop()}'`).join("\n"));

// 結合 + 音声(3秒オフセット、48kHz、ラウドネス整音)
await run("ffmpeg", [
  "-y",
  "-f", "concat", "-safe", "0", "-i", listPath,
  "-i", NARRATION,
  "-filter_complex",
  "[1:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,pan=stereo|c0=c0|c1=c0,adelay=3000|3000,apad[audio]",
  "-map", "0:v", "-map", "[audio]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-movflags", "+faststart",
  "-t", "178.0",
  OUT
], { maxBuffer: 64 * 1024 * 1024 });

const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1", OUT]);
console.log(`output=${OUT}`);
console.log(stdout.trim());
