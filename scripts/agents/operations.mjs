// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { decisionDigest, ingestSignal, nightlyPacket, recordLesson } from "./feedback.mjs";
import { publishRelease, reconcileRelease, resumeRollout, updateRollout } from "./release.mjs";
import { cleanupSubject, recoverCleanup } from "./services.mjs";

export const OPERATIONS = [
	"signal",
	"nightly",
	"lesson",
	"digest",
	"publish",
	"reconcile",
	"rollout",
	"resume-rollout",
	"cleanup-subject",
	"cleanup-proof",
	"lessons-report",
];
export const OPERATION_OPTIONS = ["--input", "--date", "--proof", "--release-id", "--resource", "--resource-id"];

function required(options, key) {
	if (!options[key]) throw new Error(`required option: ${key}`);
	return options[key];
}
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const quoted = (value) =>
	value
		.replaceAll("\r", "")
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");

export async function operation({ command, options, root, store, policy, settings }) {
	if (command === "signal") return ingestSignal(store, json(required(options, "--input")));
	if (command === "nightly") return nightlyPacket({ repo: root, store, date: required(options, "--date") });
	if (command === "lesson") return recordLesson({ repo: root, store, lesson: json(required(options, "--input")) });
	if (command === "digest") return decisionDigest(store);
	if (command === "lessons-report")
		return {
			markdown: store
				.read()
				.lessons.map((lesson) =>
					[
						`## ${lesson.ruleDigest.slice(0, 12)} — Seen ${lesson.seen}×`,
						"Candidate data; not an enforced instruction.",
						quoted(lesson.rule),
						...lesson.reasons.map(quoted),
						`Dates: ${lesson.dates.join(", ")}; promotion: ${lesson.promotion}.`,
						...lesson.evidence.map((item) => `- ${item.reference.kind}: ${item.reference.id} (${item.date})`),
					].join("\n\n"),
				)
				.join("\n\n"),
		};
	if (command === "cleanup-subject")
		return {
			subject: cleanupSubject(store.read(), required(options, "--resource"), required(options, "--resource-id")),
		};
	if (command === "cleanup-proof") return recoverCleanup(store, json(required(options, "--input")));
	const context = { root, store, policy, settings };
	if (command === "publish")
		return publishRelease({
			...context,
			request: json(required(options, "--input")),
			proofs: (options.proofs ?? []).map(json),
		});
	const id = required(options, "--release-id");
	if (command === "reconcile") return reconcileRelease({ ...context, id });
	if (command === "rollout") return updateRollout({ ...context, id, proofs: (options.proofs ?? []).map(json) });
	if (command === "resume-rollout") return resumeRollout({ ...context, id, proofs: (options.proofs ?? []).map(json) });
	throw new Error("unsupported operation");
}
