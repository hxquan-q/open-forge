// Copyright The Open Forge contributors.

/** The closed JSON Schema subset used by the checked-in autonomy contracts. */
const KEYWORDS = new Set([
	"$schema",
	"$id",
	"title",
	"description",
	"type",
	"properties",
	"required",
	"additionalProperties",
	"items",
	"minItems",
	"maxItems",
	"uniqueItems",
	"enum",
	"const",
	"pattern",
	"minLength",
	"maxLength",
	"minimum",
	"maximum",
	"minProperties",
	"anyOf",
	"$defs",
	"$ref",
]);
const TYPES = new Set(["object", "array", "string", "integer", "number", "boolean", "null"]);

export function canonical(value) {
	if (value === null || typeof value !== "object") {
		if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) {
			throw new Error("non-JSON value");
		}
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
		.join(",")}}`;
}

function reference(root, name) {
	const match = /^#\/\$defs\/([a-zA-Z][a-zA-Z0-9_-]*)$/u.exec(name);
	if (!match || !Object.hasOwn(root.$defs ?? {}, match[1])) throw new Error("unsupported or missing schema reference");
	return root.$defs[match[1]];
}

function checkDefinition(schema, root = schema, ancestors = new Set()) {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("invalid schema definition");
	for (const key of Object.keys(schema)) {
		if (!KEYWORDS.has(key)) throw new Error(`unsupported schema keyword: ${key}`);
	}
	if (schema.type !== undefined && !TYPES.has(schema.type)) throw new Error("unsupported schema type");
	if (schema.$ref) {
		if (ancestors.has(schema.$ref)) throw new Error("unsupported recursive schema reference");
		checkDefinition(reference(root, schema.$ref), root, new Set([...ancestors, schema.$ref]));
	}
	for (const child of Object.values(schema.$defs ?? {})) checkDefinition(child, root, ancestors);
	for (const child of Object.values(schema.properties ?? {})) checkDefinition(child, root, ancestors);
	if (schema.items) checkDefinition(schema.items, root, ancestors);
	if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
		checkDefinition(schema.additionalProperties, root, ancestors);
	}
	for (const child of schema.anyOf ?? []) checkDefinition(child, root, ancestors);
	if (schema.pattern) new RegExp(schema.pattern, "u");
}

function hasType(value, type) {
	if (type === "null") return value === null;
	if (type === "array") return Array.isArray(value);
	if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
	if (type === "integer") return Number.isSafeInteger(value);
	if (type === "number") return typeof value === "number" && Number.isFinite(value);
	return typeof value === type;
}

function problems(schema, value, path, root) {
	if (schema.$ref) {
		const referenced = problems(reference(root, schema.$ref), value, path, root);
		if (referenced.length) return referenced;
	}
	if (schema.anyOf && !schema.anyOf.some((child) => problems(child, value, path, root).length === 0)) {
		return [`${path}: does not match any allowed shape`];
	}
	if (schema.type && !hasType(value, schema.type)) return [`${path}: expected ${schema.type}`];
	const errors = [];
	if (schema.enum && !schema.enum.some((entry) => canonical(entry) === canonical(value)))
		errors.push(`${path}: invalid enum`);
	if (Object.hasOwn(schema, "const") && canonical(schema.const) !== canonical(value))
		errors.push(`${path}: wrong constant`);
	if (typeof value === "string") {
		if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: too short`);
		if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: too long`);
		if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: invalid pattern`);
	}
	if (typeof value === "number") {
		if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
		if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
	}
	if (Array.isArray(value)) {
		if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
		if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
		if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length)
			errors.push(`${path}: duplicate item`);
		if (schema.items) {
			value.forEach((entry, index) => {
				errors.push(...problems(schema.items, entry, `${path}[${index}]`, root));
			});
		}
	}
	if (hasType(value, "object")) {
		if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties)
			errors.push(`${path}: too few properties`);
		for (const key of schema.required ?? []) {
			if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required`);
		}
		for (const key of Object.keys(value)) {
			if (Object.hasOwn(schema.properties ?? {}, key)) {
				errors.push(...problems(schema.properties[key], value[key], `${path}.${key}`, root));
			} else if (schema.additionalProperties === false) {
				errors.push(`${path}.${key}: unknown property`);
			} else if (typeof schema.additionalProperties === "object") {
				errors.push(...problems(schema.additionalProperties, value[key], `${path}.${key}`, root));
			}
		}
	}
	return errors;
}

export function assertSchema(schema, value) {
	checkDefinition(schema);
	const errors = problems(schema, value, "$", schema);
	if (errors.length) throw new Error(`invalid autonomy contract: ${errors.join("; ")}`);
	return value;
}
