// Copyright The Open Forge contributors.
import type { DatasetProfileOptions, DatasetProfileResult } from "@vetta/runtime-node/dataset";

/**
 * Work 数据分析的宿主能力 Port（TASK-0026）：数据集文件剖析的具体实现
 * 由平台 Composition Root 注入（Desktop 走 runtime-node 本地实现）。
 * path 是用户显式选择的数据文件绝对路径；实现不得回落默认目录、
 * 不得修改源文件、不得联网上传。
 */
export interface CodingAgentDatasetOperations {
	profileDataset(path: string, options?: DatasetProfileOptions): Promise<DatasetProfileResult>;
}
