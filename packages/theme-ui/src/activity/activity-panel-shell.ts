// Copyright The Open Forge contributors.

/**
 * 外壳宽度必须当场落到终值。0.2s 过渡会让外壳比里面的内容表面慢一截，
 * 窗口缩放时原生页面停在较窄的尺寸，右侧露出空白。
 */
export function activityPanelShellWidthTransition(): "none" {
	return "none";
}
