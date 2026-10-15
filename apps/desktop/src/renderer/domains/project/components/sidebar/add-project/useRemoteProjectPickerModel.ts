// Modified by The Open Forge contributors.
import type { SshHostSummary } from "@preload/api-types/ssh";
import { EMPTY_SSH_HOST_FORM, toSshHostFormInput } from "@shared/lib/ssh-host-form";
import type { RemoteDirectoryEntry } from "@vetta/ssh-transport";
import type { SshHostFormValues } from "@vetta-org/theme-ui/settings";
import { useCallback, useEffect, useRef, useState } from "react";

export function useRemoteProjectPickerModel() {
	const [hosts, setHosts] = useState<readonly SshHostSummary[]>([]);
	const [hostsLoading, setHostsLoading] = useState(true);
	const [hostsError, setHostsError] = useState(false);
	const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
	const [remotePath, setRemotePath] = useState("");
	const [entries, setEntries] = useState<readonly RemoteDirectoryEntry[]>([]);
	const [browsing, setBrowsing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [addingHost, setAddingHost] = useState(false);
	const [hostForm, setHostFormState] = useState<SshHostFormValues>(EMPTY_SSH_HOST_FORM);
	const [savingHost, setSavingHost] = useState(false);
	const [hostFormError, setHostFormError] = useState<string | null>(null);
	// null 表示「跟随当前目录名」：用户一旦输入就以输入为准，直到换主机或回到列表。
	const [projectNameInput, setProjectNameInput] = useState<string | null>(null);
	const mounted = useRef(true);
	const hostRequest = useRef(0);
	const browseRequest = useRef(0);
	const saving = useRef(false);

	const reloadHosts = useCallback(async () => {
		const request = ++hostRequest.current;
		setHostsLoading(true);
		setHostsError(false);
		try {
			const next = await window.vetta.ssh.listHosts();
			if (mounted.current && request === hostRequest.current) setHosts(next);
		} catch {
			if (mounted.current && request === hostRequest.current) setHostsError(true);
		} finally {
			if (mounted.current && request === hostRequest.current) setHostsLoading(false);
		}
	}, []);

	useEffect(() => {
		mounted.current = true;
		void reloadHosts();
		return () => {
			mounted.current = false;
			hostRequest.current++;
			browseRequest.current++;
		};
	}, [reloadHosts]);

	const browse = useCallback(async (hostId: string, path: string | undefined) => {
		const request = ++browseRequest.current;
		setBrowsing(true);
		setError(null);
		try {
			const listing = await window.vetta.ssh.listRemoteDirectory({ hostId, remotePath: path });
			// Returning to hosts or choosing another host invalidates the previous listing.
			if (!mounted.current || request !== browseRequest.current) return;
			setRemotePath(listing.remotePath);
			setEntries(listing.entries.filter((entry) => entry.kind === "directory" || entry.kind === "symlink"));
		} catch (caught) {
			if (!mounted.current || request !== browseRequest.current) return;
			setEntries([]);
			setError(caught instanceof Error ? caught.message : String(caught));
		} finally {
			if (mounted.current && request === browseRequest.current) setBrowsing(false);
		}
	}, []);

	const selectHost = useCallback(
		(hostId: string) => {
			setSelectedHostId(hostId);
			setRemotePath("");
			setEntries([]);
			setProjectNameInput(null);
			void browse(hostId, undefined);
		},
		[browse],
	);

	const enterDirectory = useCallback(
		(name: string) => {
			if (selectedHostId !== null) void browse(selectedHostId, `${remotePath.replace(/\/+$/, "")}/${name}`);
		},
		[browse, remotePath, selectedHostId],
	);

	const goToParent = useCallback(() => {
		if (selectedHostId === null || remotePath === "/") return;
		const parent = remotePath.replace(/\/+$/, "").replace(/\/[^/]*$/, "");
		void browse(selectedHostId, parent.length === 0 ? "/" : parent);
	}, [browse, remotePath, selectedHostId]);

	const retryBrowse = useCallback(() => {
		if (selectedHostId !== null) void browse(selectedHostId, remotePath || undefined);
	}, [browse, remotePath, selectedHostId]);

	const back = useCallback(() => {
		browseRequest.current++;
		setSelectedHostId(null);
		setEntries([]);
		setRemotePath("");
		setError(null);
		setBrowsing(false);
		setProjectNameInput(null);
	}, []);

	const startAddHost = useCallback(() => {
		setHostFormState(EMPTY_SSH_HOST_FORM);
		setHostFormError(null);
		setAddingHost(true);
	}, []);
	const cancelAddHost = useCallback(() => {
		if (!saving.current) setAddingHost(false);
	}, []);
	const setHostForm = useCallback((patch: Partial<SshHostFormValues>) => {
		if (saving.current) return;
		setHostFormState((previous) => ({ ...previous, ...patch }));
		setHostFormError(null);
	}, []);
	const submitHost = useCallback(async () => {
		if (saving.current || !hostForm.target.trim()) return;
		saving.current = true;
		setSavingHost(true);
		setHostFormError(null);
		try {
			const created = await window.vetta.ssh.createHost(toSshHostFormInput(hostForm));
			if (!mounted.current) return;
			hostRequest.current++;
			setHosts((previous) => [
				...previous.filter((host) => host.id !== created.id),
				{ ...created, status: "disconnected" },
			]);
			setHostsError(false);
			setAddingHost(false);
			// Creation is complete before connecting: a browse failure must never recreate the host.
			selectHost(created.id);
		} catch (caught) {
			if (mounted.current) setHostFormError(caught instanceof Error ? caught.message : String(caught));
		} finally {
			saving.current = false;
			if (mounted.current) setSavingHost(false);
		}
	}, [hostForm, selectHost]);

	const selectedHost = selectedHostId === null ? undefined : hosts.find((host) => host.id === selectedHostId);
	// 远端根目录没有 basename，退回主机名——它仍然比空串更像一个项目名。
	const defaultProjectName = remotePath ? remoteBasename(remotePath) || (selectedHost?.label ?? "") : "";
	const projectName = projectNameInput ?? defaultProjectName;
	const setProjectName = useCallback((value: string) => setProjectNameInput(value), []);

	return {
		hosts,
		hostsLoading,
		hostsError,
		reloadHosts,
		selectedHostId,
		selectedHost,
		remotePath,
		entries,
		browsing,
		error,
		canSubmit: selectedHostId !== null && remotePath.length > 0 && !browsing && error === null,
		projectName,
		defaultProjectName,
		setProjectName,
		selectHost,
		enterDirectory,
		goToParent,
		retryBrowse,
		back,
		addingHost,
		hostForm,
		savingHost,
		hostFormError,
		startAddHost,
		cancelAddHost,
		setHostForm,
		submitHost,
	};
}

/** 远端路径是 POSIX 形态；根目录无 basename 时返回空串，由调用方决定退回什么。 */
function remoteBasename(path: string): string {
	return path.split("/").filter(Boolean).pop() ?? "";
}

export type RemoteProjectPickerModel = ReturnType<typeof useRemoteProjectPickerModel>;
