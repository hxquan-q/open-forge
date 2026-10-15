// Modified by The Open Forge contributors.

/**
 * 进程执行端口。
 *
 * 把「真的 spawn 一个 ssh」隔在接口后面，是为了让命令构造、输出解析、错误分类这些
 * 真正容易出错的逻辑可以在没有 SSH 服务器的情况下测试。生产实现只有一个，见
 * {@link createNodeSshProcessRunner}。
 */

export interface SshProcessInvocation {
	readonly argv: readonly string[];
	/** 写入 stdin 后立刻关闭。用于把文件内容推给远端的 `base64 -d`。 */
	readonly stdin?: Uint8Array;
	/**
	 * 增量 stdout。给出时表示调用方要流式消费，结果里的 `stdout` 为空——长驻的后台
	 * 任务（dev server）会一直吐日志，再累积一份等于让内存随运行时间无限增长。
	 */
	readonly onStdout?: (chunk: Uint8Array) => void;
	readonly onStderr?: (chunk: Uint8Array) => void;
	readonly signal?: AbortSignal;
	readonly timeoutMs?: number;
	/** 追加到子进程的环境变量。用于挂 askpass。 */
	readonly env?: Readonly<Record<string, string>>;
}

export interface SshProcessResult {
	/** 进程被信号杀死时为 null——此时不能断言远端命令的结果，见 ADR-0124。 */
	readonly exitCode: number | null;
	readonly stdout: Uint8Array;
	readonly stderr: string;
	/** 因超时或 AbortSignal 终止。与「远端命令返回非零」是不同性质的失败。 */
	readonly aborted: boolean;
	/** `aborted` 的原因是 `timeoutMs` 到点，而不是 AbortSignal。 */
	readonly timedOut?: boolean;
}

/** 一条保持打开的双向通道：远端 helper 这类要来回说很多句话的对端用它。 */
export interface SshProcessChannel {
	write(data: Uint8Array): void;
	/**
	 * 背压感知写：等本端把这块字节交给底层（管道排空 / SSH 窗口放行）再兑现。
	 *
	 * 大文件上传逐块 `write` 会把远端消化不了的部分全部堆在本地内存里；文件传输这类
	 * 「写入速率受网络限制」的调用方用它 pacing。给不出 drain 信号的实现可以不实现，
	 * 调用方按 `writeAsync?.()` 检测后退化为 {@link write}。
	 */
	writeAsync?(data: Uint8Array): Promise<void>;
	/** 关闭 stdin。对端据此知道不会再有请求，收尾后退出。 */
	end(): void;
	/** 立刻终止本地 ssh 进程。 */
	kill(): void;
	/** 进程结束后兑现；被信号杀死时 exitCode 为 null。 */
	readonly exited: Promise<{ readonly exitCode: number | null; readonly stderr: string }>;
}

export interface SshChannelInvocation {
	readonly argv: readonly string[];
	readonly onStdout: (chunk: Uint8Array) => void;
	readonly env?: Readonly<Record<string, string>>;
}

export interface SshProcessRunner {
	run(invocation: SshProcessInvocation): Promise<SshProcessResult>;
	/** 可选：只支持一问一答的执行器（测试替身）不必实现，调用方据此降级。 */
	open?(invocation: SshChannelInvocation): SshProcessChannel;
	/**
	 * 可选：丢弃指定 target 的共享连接资源（已认证会话、ControlMaster、转发监听）。
	 *
	 * 主机配置变更或删除时由连接层调用；不给出时失效只丢缓存壳，实现可能继续复用
	 * 同 target 的旧连接——那正是「改了配置仍连着旧机器」的来源。
	 */
	invalidate?(target: string): void;
}

/** `ssh` 自身的退出码。255 是 OpenSSH 用来表示「连接层失败」的保留值。 */
export const SSH_TRANSPORT_FAILURE_EXIT_CODE = 255;
