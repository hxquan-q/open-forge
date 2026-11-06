// Copyright The Open Forge contributors.

export type { HostClient, HostTransport } from "./client.js";
export { createHostClient } from "./client.js";
export { MODELS_HOST_METHODS, type ModelsHostMethods } from "./domains/models.js";
export {
	ModelTransportSchema,
	SETTINGS_HOST_METHODS,
	SessionInterruptContinueSchema,
	SessionInterruptModeSchema,
	type SettingsHostMethods,
} from "./domains/settings.js";
export type { HostErrorPayload, HostRequest, HostResponse } from "./envelope.js";
export type { HostProtocolErrorCode } from "./errors.js";
export { HOST_PROTOCOL_ERROR_CODES, HostProtocolError, isHostProtocolErrorCode } from "./errors.js";
export type { HostCallContext, HostDomainImplementation, HostMethodHandler } from "./host.js";
export { createDirectHostTransport, HostDispatcher } from "./host.js";
export type {
	HostMethodDefinition,
	HostMethodSignature,
	HostMethodSignatureMap,
	HostMethodSignatures,
} from "./method.js";
export { defineHostMethod } from "./method.js";
export { HostOwnerRegistry } from "./owners.js";
export type { HostStreamEvent, HostStreamView } from "./stream.js";
export { reduceHostStream } from "./stream.js";
