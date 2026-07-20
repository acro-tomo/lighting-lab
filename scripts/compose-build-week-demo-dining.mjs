import { access, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = resolve(import.meta.dirname, "..");
const fromRoot = (path) => resolve(rootDir, path);

const inputs = {
  desktop: fromRoot("output/build-week-video/raw/demo2-dining-desktop.webm"),
  mobile: fromRoot("output/build-week-video/raw/demo2-dining-mobile.webm"),
  finished: fromRoot("output/build-week-video/finished-dining-high.png"),
  narration: process.env.NARRATION_PATH
    ? resolve(process.env.NARRATION_PATH)
    : "/Users/hoshi/AI/kokoro tts/output/lighting_lab.wav",
  output: fromRoot("output/build-week-video/ldk-lighting-lab-build-week-demo-dining-high.mp4")
};

const duration = 144.465;

// Timed to the Kokoro narration. The recorded actions are kept chronological
// through the dining comparison; later pauses deliberately hold the completed
// 512-sample image rather than showing an in-progress renderer.
const clips = [
  { source: "desktop", start: 0, duration: 3.0 },
  { source: "desktop", start: 0, duration: 20.585 },
  { source: "desktop", start: 20, duration: 3.0 },
  { source: "desktop", start: 0, duration: 10.51 },
  { source: "desktop", start: 30, duration: 14.1 },
  { source: "desktop", start: 37, duration: 10.65 },
  { source: "finished", duration: 13.25 },
  { source: "desktop", start: 54, duration: 9.685 },
  { source: "mobile", start: 0, duration: 9.125 },
  { source: "mobile", start: 8, duration: 2.5 },
  { source: "mobile", start: 1, duration: 1.5 },
  { source: "finished", duration: 16.46 },
  { source: "desktop", start: 0, duration: 13.35 }
];

for (const path of Object.values(inputs).slice(0, 4)) await access(path);
await mkdir(dirname(inputs.output), { recursive: true });

const filters = [];
const labels = [];
const mediaInputArgs = [];
const preparedClips = clips.map((clip, inputIndex) => {
  if (clip.source === "finished") {
    mediaInputArgs.push("-loop", "1", "-framerate", "30", "-i", inputs.finished);
  } else {
    mediaInputArgs.push("-ss", String(clip.start), "-t", String(clip.duration), "-i", inputs[clip.source]);
  }
  return { ...clip, inputIndex };
});
const audioInputIndex = preparedClips.length;
mediaInputArgs.push("-i", inputs.narration);

for (const [index, clip] of preparedClips.entries()) {
  const label = `clip${index}`;
  labels.push(`[${label}]`);
  if (clip.source === "finished") {
    const frameCount = Math.round(clip.duration * 30);
    filters.push(
      `[${clip.inputIndex}:v]trim=end_frame=${frameCount},setpts=PTS-STARTPTS,` +
      `scale=1280:-2,crop=1280:720:0:(ih-720)/2,fps=30,setsar=1,settb=AVTB[${label}]`
    );
    continue;
  }

  const transform = clip.source === "mobile"
    ? "scale=332:720,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f0e0b,setsar=1,settb=AVTB"
    : "scale=1280:720,setsar=1,settb=AVTB";
  filters.push(`[${clip.inputIndex}:v]setpts=PTS-STARTPTS,fps=30,${transform}[${label}]`);
}

filters.push(`${labels.join("")}concat=n=${clips.length}:v=1:a=0[video]`);
filters.push(`[${audioInputIndex}:a]aresample=48000,atrim=duration=${duration}[audio]`);

const args = [
  "-y",
  ...mediaInputArgs,
  "-filter_complex", filters.join(";"),
  "-map", "[video]",
  "-map", "[audio]",
  "-shortest",
  "-r", "30",
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "192k",
  "-movflags", "+faststart",
  "-t", String(duration),
  inputs.output
];

console.log(`narration=${inputs.narration}`);
console.log(`output=${inputs.output}`);
await execFileAsync("ffmpeg", args, { maxBuffer: 10 * 1024 * 1024 });
console.log(`duration=${duration}`);
