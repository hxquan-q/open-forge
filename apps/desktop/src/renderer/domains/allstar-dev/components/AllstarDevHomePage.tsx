// Modified by The Open Forge contributors.
import { useAllstarDevHomePageModel } from "../hooks/useAllstarDevHomePageModel";
import { AllstarDevHomePageView } from "./AllstarDevHomePageView";

/** 「Allstar 自主开发」版块首页（/allstar）：连接层装配 model，展示交给 View。 */
export function AllstarDevHomePage(): JSX.Element {
	return <AllstarDevHomePageView model={useAllstarDevHomePageModel()} />;
}
