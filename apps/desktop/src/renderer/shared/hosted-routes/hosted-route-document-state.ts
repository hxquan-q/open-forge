// Copyright The Open Forge contributors.
import type { Disposable } from "@vetta-org/capability-sdk";
import type { RendererCapabilityHost } from "../capabilities/renderer-capability-host.js";
import type { HostedRouteService } from "./hosted-route-service.js";

interface HostedRouteDocumentState {
	readonly version: 1;
	capabilityHost?: RendererCapabilityHost;
	routes?: HostedRouteService;
	registrations?: readonly Disposable[];
	registrationOwner?: symbol;
}

// These three owners must survive module replacement together. A full document
// reload creates a new global and therefore a new permission/routing lifetime.
const documentGlobal = globalThis as typeof globalThis & {
	__openForgeHostedRouteDocument_v1?: HostedRouteDocumentState;
};

export function hostedRouteDocumentState(): HostedRouteDocumentState {
	documentGlobal.__openForgeHostedRouteDocument_v1 ??= { version: 1 };
	return documentGlobal.__openForgeHostedRouteDocument_v1;
}
