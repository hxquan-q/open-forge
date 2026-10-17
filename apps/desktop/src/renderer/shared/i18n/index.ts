// Modified by The Open Forge contributors.
// Renderer i18next 实例（主窗口）。zh（fallback 与默认产品语言）静态内联，
// init 同步生效、首帧不闪；en 按需单 lazy chunk（ISSUE-0021 B 第二片）：
// 初值语言为 en 时挂载前 await 装载，切换到 en 时先装载再原子 changeLanguage。
// 初值来自主进程同步暴露的 window.vetta.i18n.initialState（preference + language）。

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { initDesktopI18n } from "@/shared/desktop-brand";
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, isSupportedLanguage, NAMESPACES } from "@/shared/i18n/config";
// 仅测试同步性分支使用（生产构建被 Rollup 摇树，en 仍走动态装载）。
import { enResources as enResourcesForTests } from "@/shared/i18n/en-resources";
import { zhResources } from "@/shared/i18n/zh-resources";

function readInitialLanguage(): string {
	const state = window.vetta?.i18n?.initialState;
	if (state && isSupportedLanguage(state.language)) return state.language;
	const fromMain = window.vetta?.i18n?.initialLanguage;
	if (fromMain && isSupportedLanguage(fromMain)) return fromMain;
	// 极端兜底：preload 尚未就绪时默认英文（正常路径不会走到）。
	return DEFAULT_LANGUAGE;
}

let subscribed = false;

type EnResourcesModule = typeof import("@/shared/i18n/en-resources");

let enResourcesPromise: Promise<EnResourcesModule> | undefined;

/** 按需装载 en catalog（单 lazy chunk）；幂等。 */
function loadEnResources(): Promise<EnResourcesModule> {
	enResourcesPromise ??= import("@/shared/i18n/en-resources");
	return enResourcesPromise;
}

function initialize(lng: string, en?: EnResourcesModule["enResources"]): void {
	// initAsync:false 强制同步初始化：i18next 默认把资源装载推到 setTimeout，
	// 那样 init() 返回后 isInitialized 仍为 false，createRoot 首帧的 useTranslation
	// 会拿到 key 或触发 Suspense。资源在场（zh 静态 / en 已装载）、同步装载无 IO，
	// 故 init 返回即就绪。useSuspense:false 再兜一层：即便未就绪也不抛 Suspense。
	void initDesktopI18n(i18n.use(initReactI18next), {
		resources: en === undefined ? { zh: zhResources } : { zh: zhResources, en },
		lng,
		fallbackLng: FALLBACK_LANGUAGE,
		ns: NAMESPACES,
		defaultNS: "common",
		initAsync: false,
		interpolation: { escapeValue: false },
		returnNull: false,
		react: { useSuspense: false },
	});
	document.documentElement.lang = lng;
}

function subscribeLanguageChanges(): void {
	// 订阅主进程语言广播（含本窗口自身 setLanguage 的回环，changeLanguage 幂等）。
	if (subscribed || !window.vetta?.i18n) return;
	subscribed = true;
	window.vetta.i18n.onLanguageChanged((state) => {
		const apply = () => {
			void i18n.changeLanguage(state.language);
			document.documentElement.lang = state.language;
		};
		// en：先装载全部 ns 再原子切换，避免半中文半英文的中间态。
		if (state.language === "en") {
			void loadEnResources().then((module) => {
				for (const ns of NAMESPACES) {
					i18n.addResourceBundle("en", ns, module.enResources[ns], true, true);
				}
				apply();
			});
			return;
		}
		apply();
	});
}

/**
 * 在 React 挂载前调用（与 applyInitialTheme 并列）。幂等。
 * zh（默认）：同步完成，返回 undefined。en：返回 Promise，resolve 时 i18n 已
 * 同步初始化完毕（en 全 ns 在场）——调用方应 await 后再挂载，保证首帧即正确语言。
 * 测试环境（import.meta.env.TEST，生产构建被摇树）en 走静态分支保持完全同步，
 * 使既有同步断言的测试文件零改动。
 */
export function initI18n(): Promise<void> | undefined {
	subscribeLanguageChanges();
	if (i18n.isInitialized) return undefined;
	const lng = readInitialLanguage();
	if (lng !== "en") {
		initialize(lng);
		return undefined;
	}
	if (import.meta.env.TEST) {
		initialize("en", enResourcesForTests);
		return undefined;
	}
	return loadEnResources().then((module) => {
		initialize("en", module.enResources);
	});
}

export { i18n };
