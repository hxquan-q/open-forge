// Copyright The Open Forge contributors.

import { useWeKnoraViewModel } from "../hooks/useWeKnoraViewModel";
import { WeKnoraPageView } from "./WeKnoraPageView";

/** 「智能客服」页面容器：只接线——把视图模型与动作接到纯展示视图上。 */
export function WeKnoraPage(): JSX.Element {
	const { model, actions } = useWeKnoraViewModel();
	return <WeKnoraPageView viewModel={model} actions={actions} />;
}
