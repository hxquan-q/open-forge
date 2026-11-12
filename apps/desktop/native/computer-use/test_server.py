# Copyright The Open Forge contributors.
import io
import json
from pathlib import Path
import queue
import sys
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import server
from test_executor import FakeWindows, NativeFixture


class InputPipe:
    def __init__(self):
        self.buffer = self
        self.queue = queue.Queue()

    def send(self, value):
        self.queue.put(json.dumps(value).encode() + b"\n")

    def __iter__(self):
        return self

    def __next__(self):
        value = self.queue.get(timeout=5)
        if value is None:
            raise StopIteration
        return value


class ProtocolOutput:
    def __init__(self):
        self.messages = queue.Queue()

    def write(self, value):
        self.messages.put(json.loads(value))
        return len(value)

    def flush(self):
        pass


class BlockingNative(NativeFixture):
    def __init__(self):
        super().__init__()
        self.entered = threading.Event()

    def press(self, keys):
        self.held.add(("key", keys))
        print("fixture dependency diagnostic")
        self.entered.set()
        while True:
            self.check()
            time.sleep(0.01)


class ServerProtocolTests(unittest.TestCase):
    def test_real_protocol_loop_waits_for_release_and_isolates_dependency_stdout(self):
        inputs, output, errors = InputPipe(), ProtocolOutput(), io.StringIO()
        native = BlockingNative()

        with patch.object(server, "Windows", FakeWindows), patch.object(server, "desktop_factory", lambda _: native), patch("sys.stdin", inputs), patch("sys.stdout", output), patch("sys.stderr", errors):
            thread = threading.Thread(target=server.serve, args=(Path("unused-fixture-cache"),))
            thread.start()
            try:
                inputs.send({"id": 1, "method": "initialize"})
                initialized = output.messages.get(timeout=5)
                self.assertEqual(initialized["result"]["serverInfo"]["name"], "vetta-computer-use")
                inputs.send({"id": 2, "method": "tools/call", "params": {"name": "computer_action", "arguments": {"op": "execute", "input": {"action": "press", "keys": "ctrl"}}}})
                self.assertTrue(native.entered.wait(timeout=5))
                inputs.send({"id": 3, "method": "tools/call", "params": {"name": "stop"}})
                responses = {value["id"]: value for value in (output.messages.get(timeout=5), output.messages.get(timeout=5))}
                self.assertEqual(json.loads(responses[2]["result"]["content"][0]["text"])["code"], "cancelled")
                self.assertEqual(json.loads(responses[3]["result"]["content"][0]["text"]), {"ok": True})
                self.assertEqual(native.held, set())
                self.assertIn(("release", ("key", "ctrl", True)), native.events)
                inputs.send({"id": 4, "method": "tools/call", "params": {"name": "computer_action", "arguments": {"op": "execute", "input": {"action": "observe"}}}})
                next_call = output.messages.get(timeout=5)
                self.assertTrue(json.loads(next_call["result"]["content"][0]["text"])["ok"])
                self.assertIn("fixture dependency diagnostic", errors.getvalue())
            finally:
                inputs.queue.put(None)
                thread.join(timeout=5)
                self.assertFalse(thread.is_alive())


if __name__ == "__main__":
    unittest.main()
