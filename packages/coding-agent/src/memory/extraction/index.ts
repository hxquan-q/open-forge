// Modified by The Open Forge contributors.

export type {
	AutomaticExtractionRunnerOptions,
	ExtractionErrorKind,
	ExtractionSuggestion,
	ExtractionSuggestionAction,
	ExtractorPort,
} from "./automatic-extraction.js";
export {
	AutomaticExtractionRunner,
	classifyExtractionError,
	ExtractionBudgetExhaustedError,
	ExtractionBudgetLedger,
	InvalidExtractionOutputError,
	mergeSuggestions,
	validateSuggestion,
} from "./automatic-extraction.js";
