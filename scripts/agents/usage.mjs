// Copyright The Open Forge contributors.

/** Reported usage is accounting evidence, not a billing guarantee or a monetary execution cap. */
export function reportedUsage(text) {
	let messages;
	try {
		messages = [JSON.parse(text)];
	} catch {
		try {
			messages = text
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
		} catch {
			return null;
		}
	}
	const events = messages.filter((event) => event?.type === "turn.completed" && event.usage);
	const results = messages.filter((event) => event?.type === "result" && event.usage);
	const used = events.length ? events : results;
	if (!used.length) return null;
	const number = (value) => Number.isSafeInteger(value) && value >= 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let cachedInputTokens = 0;
	let costUsd = 0;
	let knownCost = true;
	for (const event of used) {
		const usage = event.usage;
		if (!number(usage.input_tokens) || !number(usage.output_tokens)) return null;
		const cached = usage.cached_input_tokens ?? usage.cache_read_input_tokens ?? 0;
		if (!number(cached)) return null;
		inputTokens += usage.input_tokens;
		outputTokens += usage.output_tokens;
		cachedInputTokens += cached;
		if (
			typeof event.total_cost_usd === "number" &&
			Number.isFinite(event.total_cost_usd) &&
			event.total_cost_usd >= 0
		)
			costUsd += event.total_cost_usd;
		else knownCost = false;
	}
	if (![inputTokens, outputTokens, cachedInputTokens].every(Number.isSafeInteger)) return null;
	return { source: "cli-reported", inputTokens, outputTokens, cachedInputTokens, costUsd: knownCost ? costUsd : null };
}
