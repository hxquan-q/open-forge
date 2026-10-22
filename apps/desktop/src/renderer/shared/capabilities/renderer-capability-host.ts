// Modified by The Open Forge contributors.
import { CapabilityAccessController, CapabilityHub, type CapabilityProviderBinding } from "@vetta/capability-runtime";
import type {
	CapabilityAccessHandle,
	CapabilityAccessSessionFactory,
	CapabilityAccessSessionOptions,
	Disposable,
} from "@vetta-org/capability-sdk";
import { hostedRouteDocumentState } from "../hosted-routes/hosted-route-document-state.js";

export class RendererCapabilityHost implements CapabilityAccessSessionFactory {
	private readonly hub = new CapabilityHub();
	private readonly access = new CapabilityAccessController(this.hub);

	createSession(options: CapabilityAccessSessionOptions): CapabilityAccessHandle {
		return this.access.createSession(options);
	}

	registerDomainProviders(ownerId: string, bindings: readonly CapabilityProviderBinding[]): Disposable {
		return this.hub.domain.registerOwner(ownerId, bindings);
	}
}

const documentState = hostedRouteDocumentState();
documentState.capabilityHost ??= new RendererCapabilityHost();
export const rendererCapabilityHost = documentState.capabilityHost;
