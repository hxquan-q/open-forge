"""MASEval sidecar: system-as-unit wrap of the isolated Desktop Agent session.

The Python adapter shells out to the shared Bun case runner. It does not import
product code and does not download GAIA or other public MAS benchmarks.
Coded against MASEval 0.5.x.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from maseval.core.agent import AgentAdapter
from maseval.core.benchmark import Benchmark
from maseval.core.environment import Environment
from maseval.core.evaluator import Evaluator
from maseval.core.history import MessageHistory
from maseval.core.model import ChatResponse, ModelAdapter
from maseval.core.task import Task

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDENS_PATH = REPO_ROOT / "scripts" / "eval" / "goldens" / "tool-routing.json"
RUN_CASE = REPO_ROOT / "scripts" / "eval" / "harness" / "run-case.ts"
RESULTS_DIR = REPO_ROOT / "scripts" / "eval" / "results"
EVAL_DOTENV = REPO_ROOT / "scripts" / "eval" / ".env"


def _load_eval_dotenv() -> None:
    if not EVAL_DOTENV.is_file():
        return
    for raw_line in EVAL_DOTENV.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_eval_dotenv()


def _load_goldens() -> list[dict[str, Any]]:
    raw = json.loads(GOLDENS_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit("tool-routing goldens must be an array")
    return raw


def _run_case(query: str, case_id: Optional[str] = None) -> dict[str, Any]:
    command = ["bun", str(RUN_CASE), "--input", query]
    if case_id:
        command.extend(["--id", case_id])
    completed = subprocess.run(
        command,
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=False,
        env={
            **os.environ,
            "VETTA_KNOWLEDGE_DISABLED": "1",
            "DEEPEVAL_DISABLE_DOTENV": "1",
        },
    )
    if completed.returncode != 0:
        raise RuntimeError(
            completed.stderr.strip() or completed.stdout.strip() or f"run-case exited {completed.returncode}"
        )
    payload = _parse_case_json(completed.stdout)
    if not isinstance(payload, dict):
        raise RuntimeError("run-case must print a JSON object")
    return payload


def _parse_case_json(stdout: str) -> dict[str, Any]:
    text = stdout.strip()
    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        pass
    start = text.rfind("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        payload = json.loads(text[start : end + 1])
        if isinstance(payload, dict):
            return payload
    raise RuntimeError("run-case stdout did not contain a JSON object")


def _write_report(kind: str, cases: list[dict[str, Any]]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S.%f")[:-3] + "Z"
    output_path = RESULTS_DIR / f"{kind}-{stamp.replace(':', '-')}.json"
    body = {
        "kind": kind,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "subjectModel": os.environ.get("OPENFORGE_EVAL_SUBJECT_MODEL", "deepseek-chat"),
        "judgeModel": "maseval-tool-routing-evaluator",
        "cases": cases,
    }
    output_path.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output_path


def _score_case(payload: dict[str, Any], expected_first: str, forbidden: Sequence[str]) -> dict[str, Any]:
    first = payload.get("firstToolName")
    tools = payload.get("toolsCalled") or []
    leaked = payload.get("isolationViolations") or []
    first_ok = (expected_first == "" and first is None) or first == expected_first
    forbidden_hit = [name for name in forbidden if name in tools]
    passed = first_ok and not forbidden_hit and not leaked and not payload.get("errorMessage")
    return {
        "passed": passed,
        "score": 1.0 if passed else 0.0,
        "firstToolName": first,
        "expectedFirstTool": expected_first,
        "toolsCalled": tools,
        "forbiddenHit": forbidden_hit,
        "isolationViolations": leaked,
        "skillNames": payload.get("skillNames") or [],
        "activeToolNames": payload.get("activeToolNames") or [],
        "errorMessage": payload.get("errorMessage"),
    }


class UnusedModelAdapter(ModelAdapter):
    """MASEval requires a ModelAdapter factory; the Desktop Agent is the subject."""

    @property
    def model_id(self) -> str:
        return "unused-desktop-subject"

    def _chat_impl(
        self,
        messages: List[Dict[str, Any]],
        generation_params: Optional[Dict[str, Any]] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        **kwargs: Any,
    ) -> ChatResponse:
        raise RuntimeError("MASEval sidecar does not call a judge model; the Desktop Agent is the subject")


class IsolatedRoutingEnvironment(Environment):
    def setup_state(self, environment_data: dict) -> dict[str, Any]:
        return {"isolated": True, **environment_data}

    def create_tools(self) -> dict[str, Any]:
        return {}


class VettaDesktopAdapter(AgentAdapter):
    def __init__(self, case_id: str) -> None:
        super().__init__({"id": case_id}, "desktop-agent")
        self.last_result: dict[str, Any] = {}

    def _run_agent(self, query: str) -> dict[str, Any]:
        case_id = self.agent.get("id") if isinstance(self.agent, dict) else None
        self.last_result = _run_case(query, case_id if isinstance(case_id, str) else None)
        history = MessageHistory()
        history.add_message("user", query)
        history.add_message("assistant", str(self.last_result.get("actualOutput") or ""))
        tools = self.last_result.get("toolsCalled") or []
        if tools:
            history.add_tool_call(
                tool_calls=[
                    {
                        "id": f"eval-{index}",
                        "type": "function",
                        "function": {"name": name, "arguments": "{}"},
                    }
                    for index, name in enumerate(tools)
                    if isinstance(name, str)
                ]
            )
        self.messages = history
        return self.last_result


class ToolRoutingEvaluator(Evaluator):
    def __init__(self, task: Task, environment: Environment, user: Any = None) -> None:
        super().__init__(task, environment, user)
        self.task = task

    def filter_traces(self, traces: Dict[str, Any]) -> Dict[str, Any]:
        if isinstance(traces, dict) and "agents" in traces:
            return traces["agents"]
        return traces if isinstance(traces, dict) else {}

    def __call__(self, traces: Dict[str, Any], final_answer: Optional[str] = None) -> Dict[str, Any]:
        expected = str(self.task.evaluation_data.get("expectedFirstTool", ""))
        forbidden = self.task.evaluation_data.get("forbiddenTools") or []
        payload = final_answer if isinstance(final_answer, dict) else {}
        return _score_case(payload, expected, forbidden)


class VettaDesktopBenchmark(Benchmark):
    def get_model_adapter(self, model_id: str, **kwargs: Any) -> ModelAdapter:
        adapter = UnusedModelAdapter()
        self.register(kwargs.get("register_category", "models"), kwargs.get("register_name", model_id), adapter)
        return adapter

    def setup_environment(self, agent_data: Dict[str, Any], task: Task, seed_generator: Any) -> Environment:
        return IsolatedRoutingEnvironment(dict(task.environment_data))

    def setup_agents(
        self,
        agent_data: Dict[str, Any],
        environment: Environment,
        task: Task,
        user: Any,
        seed_generator: Any,
    ) -> Tuple[Sequence[AgentAdapter], Dict[str, AgentAdapter]]:
        adapter = VettaDesktopAdapter(task.id)
        return [adapter], {"desktop-agent": adapter}

    def setup_evaluators(
        self,
        environment: Environment,
        task: Task,
        agents: Sequence[AgentAdapter],
        user: Any,
        seed_generator: Any,
    ) -> Sequence[Evaluator]:
        return [ToolRoutingEvaluator(task, environment, user)]

    def run_agents(self, agents: Sequence[AgentAdapter], task: Task, environment: Environment, query: str) -> Any:
        adapter = agents[0]
        adapter.run(query)
        return getattr(adapter, "last_result", {})

    def evaluate(
        self,
        evaluators: Sequence[Evaluator],
        agents: Dict[str, AgentAdapter],
        final_answer: Any,
        traces: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for evaluator in evaluators:
            filtered = evaluator.filter_traces(traces)
            results.append(evaluator(filtered, final_answer))
        return results


def _tasks_from_goldens() -> list[Task]:
    tasks: list[Task] = []
    for golden in _load_goldens():
        tasks.append(
            Task(
                id=str(golden["id"]),
                query=str(golden["input"]),
                evaluation_data={
                    "expectedFirstTool": golden.get("expectedFirstTool", ""),
                    "forbiddenTools": list(golden.get("forbiddenTools") or []),
                    "criteria": golden.get("criteria", ""),
                },
                metadata={"source": "scripts/eval/goldens/tool-routing.json"},
            )
        )
    return tasks


def _case_from_report(report: dict[str, Any]) -> dict[str, Any]:
    evaluation = report.get("eval") or []
    first_eval = evaluation[0] if isinstance(evaluation, list) and evaluation else {}
    if not isinstance(first_eval, dict):
        first_eval = {}
    error = report.get("error") or {}
    task = report.get("task") or {}
    first_tool = first_eval.get("firstToolName")
    expected_first = first_eval.get("expectedFirstTool")
    first_miss = []
    if first_eval.get("passed") is False and first_tool != expected_first:
        first_miss.append(f"first tool was {first_tool or '(none)'}, expected {expected_first or '(none)'}")
    return {
        "id": report.get("task_id") or (task.get("metadata") or {}).get("id"),
        "firstToolName": first_tool,
        "toolsCalled": first_eval.get("toolsCalled") or [],
        "skillNames": first_eval.get("skillNames") or [],
        "activeToolNames": first_eval.get("activeToolNames") or [],
        "violations": (first_eval.get("isolationViolations") or []) + (first_eval.get("forbiddenHit") or []) + first_miss,
        "judgeScore": first_eval.get("score"),
        "judgeReason": json.dumps(first_eval, ensure_ascii=False) if first_eval else None,
        "errorMessage": first_eval.get("errorMessage") or (error.get("error_message") if isinstance(error, dict) else None),
        "passed": first_eval.get("passed"),
        "status": report.get("status"),
    }


def main() -> int:
    if os.environ.get("OPENFORGE_EVAL") != "1":
        print("[eval:agent:maseval] harness-only; set OPENFORGE_EVAL=1 to run live cases")
        return 0
    if not os.environ.get("DEEPSEEK_API_KEY"):
        print("[eval:agent:maseval] OPENFORGE_EVAL=1 requires DEEPSEEK_API_KEY in the environment.", file=sys.stderr)
        return 2

    benchmark = VettaDesktopBenchmark(n_task_repeats=1, num_workers=1, progress_bar=True)
    reports = benchmark.run(_tasks_from_goldens(), {"name": "desktop-agent"})
    cases = [_case_from_report(report) for report in reports if isinstance(report, dict)]
    output_path = _write_report("maseval-tool-routing", cases)
    passed = sum(1 for case in cases if case.get("passed") is True)
    failed = len(cases) - passed
    print(f"[eval:agent:maseval] {passed} passed, {failed} failed; report {output_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
