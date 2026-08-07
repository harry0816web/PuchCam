#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaults = {
  input: "inputs/memoji",
  output: "public/assets/memoji",
  work: "work/memoji",
  every: 3,
  quality: 80,
  padding: 12,
  force: false,
  recursive: false,
};

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--recursive") {
      options.recursive = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === "--input") options.input = next;
    else if (arg === "--output") options.output = next;
    else if (arg === "--work") options.work = next;
    else if (arg === "--every") options.every = Number(next);
    else if (arg === "--quality") options.quality = Number(next);
    else if (arg === "--padding") options.padding = Number(next);
    else throw new Error(`Unknown option ${arg}`);
    index += 1;
  }
  if (!Number.isInteger(options.every) || options.every < 1) throw new Error("--every must be a positive integer");
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) throw new Error("--quality must be 1-100");
  if (!Number.isInteger(options.padding) || options.padding < 0) throw new Error("--padding must be a non-negative integer");
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function assertTool(command, hint) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Missing ${command}. ${hint}`);
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "memoji";
}

function listVideos(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listVideos(fullPath);
    if (/\.(mov|mp4|m4v)$/i.test(entry.name)) return [fullPath];
    return [];
  });
}

function expandCrop(bounds, padding) {
  const x = Math.max(0, bounds.minX - padding);
  const y = Math.max(0, bounds.minY - padding);
  const maxX = Math.min(bounds.width - 1, bounds.maxX + padding);
  const maxY = Math.min(bounds.height - 1, bounds.maxY + padding);
  return { x, y, width: maxX - x + 1, height: maxY - y + 1 };
}

const options = parseArgs(process.argv.slice(2));
if (process.platform !== "darwin") throw new Error("This pipeline needs macOS AVFoundation to preserve Memoji alpha.");
assertTool("swift", "Install Xcode Command Line Tools.");
assertTool("cwebp", "Install WebP tools, for example: brew install webp");

const inputDir = path.resolve(root, options.input);
const outputDir = path.resolve(root, options.output);
const workDir = path.resolve(root, options.work);
mkdirSync(inputDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const videos = options.recursive
  ? listVideos(inputDir)
  : readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(mov|mp4|m4v)$/i.test(entry.name))
    .map((entry) => path.join(inputDir, entry.name))
    .sort();

if (videos.length === 0) {
  console.log(`No Memoji videos found in ${path.relative(root, inputDir)}.`);
  console.log("Drop .mov/.mp4 recordings there, then run npm run memoji:build.");
  process.exit(0);
}

const extractor = path.join(root, "tools/memoji/ExtractMemojiFrames.swift");
const manifests = [];

for (const inputPath of videos) {
  const video = path.relative(inputDir, inputPath);
  const id = slugify(video);
  const title = id.replace(/-/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
  const assetDir = path.join(outputDir, id);
  const manifestPath = path.join(assetDir, "manifest.json");
  const sourceMtime = statSync(inputPath).mtimeMs;

  if (!options.force) {
    try {
      const existing = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (existing.sourceFile === video && existing.sourceModifiedMs === sourceMtime) {
        console.log(`Skipping ${video}; manifest is current.`);
        manifests.push(existing);
        continue;
      }
    } catch {
      // Rebuild when the manifest is absent or malformed.
    }
  }

  console.log(`Processing ${video} -> ${path.relative(root, assetDir)}`);
  const jobWorkDir = path.join(workDir, id);
  const pngDir = path.join(jobWorkDir, "png");
  const cropPath = path.join(jobWorkDir, "crop.json");
  rmSync(jobWorkDir, { recursive: true, force: true });
  rmSync(assetDir, { recursive: true, force: true });
  mkdirSync(pngDir, { recursive: true });
  mkdirSync(assetDir, { recursive: true });

  run("swift", [extractor, inputPath, pngDir, "--every", String(options.every), "--crop-json", cropPath]);

  const cropBounds = JSON.parse(readFileSync(cropPath, "utf8"));
  const crop = expandCrop(cropBounds, options.padding);
  const pngs = readdirSync(pngDir).filter((file) => file.endsWith(".png")).sort();
  const frames = [];

  for (const png of pngs) {
    const frame = png.replace(".png", ".webp");
    const from = path.join(pngDir, png);
    const to = path.join(assetDir, frame);
    run("cwebp", [
      "-quiet",
      "-q", String(options.quality),
      "-mt",
      "-crop", String(crop.x), String(crop.y), String(crop.width), String(crop.height),
      from,
      "-o", to,
    ]);
    frames.push(frame);
  }

  const manifest = {
    id,
    title,
    sourceFile: video,
    sourceModifiedMs: sourceMtime,
    generatedAt: new Date().toISOString(),
    frameCount: frames.length,
    every: options.every,
    quality: options.quality,
    width: crop.width,
    height: crop.height,
    crop,
    defaultFrame: frames[Math.floor(frames.length / 2)] ?? frames[0],
    frames,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  manifests.push(manifest);
}

const index = {
  generatedAt: new Date().toISOString(),
  items: manifests.map(({ id, title, frameCount, width, height, defaultFrame }) => ({
    id,
    title,
    frameCount,
    width,
    height,
    defaultFrame,
    manifest: `/assets/memoji/${id}/manifest.json`,
  })),
};
writeFileSync(path.join(outputDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Built ${manifests.length} Memoji asset set(s).`);
