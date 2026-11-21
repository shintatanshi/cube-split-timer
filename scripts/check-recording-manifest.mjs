import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicManifestPath = resolve(rootDir, "public/recording/recording-manifest.json");

function fail(message) {
  console.error(`recording manifest check failed: ${message}`);
  process.exitCode = 1;
}

function hasRecordingMode(url) {
  try {
    const parsedUrl = new URL(url);

    return parsedUrl.searchParams.get("recording") === "1";
  } catch {
    return false;
  }
}

if (!existsSync(publicManifestPath)) {
  fail("public/recording/recording-manifest.json does not exist");
  process.exit();
}

let manifest;

try {
  manifest = JSON.parse(readFileSync(publicManifestPath, "utf8"));
} catch (error) {
  fail(`public manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit();
}

if (!Array.isArray(manifest.shots) || manifest.shots.length === 0) {
  fail("shots must be a non-empty array");
}

manifest.shots?.forEach((shot, index) => {
  const label = shot?.shotId ?? `shots[${index}]`;

  if (!shot?.shotId) {
    fail(`${label}: shotId is required`);
  }

  if (!shot?.role) {
    fail(`${label}: role is required`);
  }

  if (!shot?.title) {
    fail(`${label}: title is required`);
  }

  if (typeof shot?.useInVideo?.start !== "number" || typeof shot?.useInVideo?.end !== "number") {
    fail(`${label}: useInVideo.start and useInVideo.end must be numbers`);
  }

  if (typeof shot?.recording?.durationSec !== "number") {
    fail(`${label}: recording.durationSec must be a number`);
  }

  if (!shot?.recording?.url || !hasRecordingMode(shot.recording.url)) {
    fail(`${label}: recording.url must be an absolute URL with recording=1`);
  }

  if (!shot?.recording?.waitFor) {
    fail(`${label}: recording.waitFor is required`);
  }

  if (!Array.isArray(shot?.recording?.actions)) {
    fail(`${label}: recording.actions must be an array`);
  }

  if (!shot?.recording?.saveAs) {
    fail(`${label}: recording.saveAs is required`);
  }

  if (!shot?.visualPurpose) {
    fail(`${label}: visualPurpose is required`);
  }

  if (!shot?.fallback?.url || !hasRecordingMode(shot.fallback.url)) {
    fail(`${label}: fallback.url must be an absolute URL with recording=1`);
  }

  if (!shot?.fallback?.saveAs) {
    fail(`${label}: fallback.saveAs is required`);
  }
});

manifest.tutorialFlows?.forEach((flow, index) => {
  const label = flow?.flowId ?? `tutorialFlows[${index}]`;

  if (!flow?.flowId) {
    fail(`${label}: flowId is required`);
  }

  if (!flow?.startUrl || !hasRecordingMode(flow.startUrl)) {
    fail(`${label}: startUrl must be an absolute URL with recording=1`);
  }

  if (!Array.isArray(flow?.steps) || flow.steps.length === 0) {
    fail(`${label}: steps must be a non-empty array`);
  }

  flow.steps?.forEach((step, stepIndex) => {
    const stepLabel = step?.stepId ?? `${label}.steps[${stepIndex}]`;

    if (!step?.stepId) {
      fail(`${stepLabel}: stepId is required`);
    }

    if (!step?.action?.type) {
      fail(`${stepLabel}: action.type is required`);
    }

    if (step.action.type === "openUrl" && (!step.action.url || !hasRecordingMode(step.action.url))) {
      fail(`${stepLabel}: openUrl action must use recording=1`);
    }

    if (step.action.type === "click" && !step.action.selector) {
      fail(`${stepLabel}: click action requires selector`);
    }

    if (step.action.type === "waitFor" && !step.action.selector) {
      fail(`${stepLabel}: waitFor action requires selector`);
    }
  });

  if (flow?.fallback?.url && !hasRecordingMode(flow.fallback.url)) {
    fail(`${label}: fallback.url must use recording=1`);
  }
});

if (process.exitCode) {
  process.exit();
}

console.log(
  `recording manifest OK: ${manifest.shots.length} shots, ${manifest.tutorialFlows?.length ?? 0} tutorial flows`,
);
