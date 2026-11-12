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
from test_windows import native_fixture


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
    def test_protocol_workflow_reports_fresh_foreground_and_ime_after_observe_and_input(self):
        from PIL import Image
        inputs, output, errors = InputPipe(), ProtocolOutput(), io.StringIO()
        windows, native = native_fixture(), NativeFixture()
        original_press = native.press

        def press(keys):
            original_press(keys)
            if keys == "win+r":
                windows.user.foreground = 456
                windows.user.title = "Run"
                windows.kernel.exe = "C:/Windows/explorer.exe"
                windows.user.ime_open = 0

        def action(request_id, value):
            inputs.send({"id": request_id, "method": "tools/call", "params": {"name": "computer_action", "arguments": {"op": "execute", "input": value}}})
            response = output.messages.get(timeout=5)
            self.assertEqual(response["id"], request_id)
            result = json.loads(response["result"]["content"][0]["text"])
            self.assertTrue(result["ok"])
            return result

        with patch.object(server, "Windows", return_value=windows), patch.object(server, "desktop_factory", return_value=native), patch.object(native, "press", side_effect=press), patch("PIL.ImageGrab.grab", return_value=Image.new("RGB", (100, 80))), patch("sys.stdin", inputs), patch("sys.stdout", output), patch("sys.stderr", errors):
            thread = threading.Thread(target=server.serve, args=(Path("unused-fixture-cache"),))
            thread.start()
            try:
                inputs.send({"id": 1, "method": "initialize"})
                self.assertEqual(output.messages.get(timeout=5)["result"]["serverInfo"]["name"], "vetta-computer-use")
                observed = action(2, {"action": "observe"})
                self.assertIn('title="Document" exe="C:/editor.exe"; IME=open', observed["text"])
                self.assertEqual(observed["image"]["mimeType"], "image/png")
                pressed = action(3, {"action": "press", "keys": "p"})
                self.assertIn('title="Document" exe="C:/editor.exe"; IME=open', pressed["text"])
                launched = action(4, {"action": "press", "keys": "win+r"})
                typed = action(5, {"action": "type", "text": "editor.exe"})
                observed = action(6, {"action": "observe"})
                for result in (launched, typed, observed):
                    self.assertIn('hwnd=456 title="Run" exe="C:/Windows/explorer.exe"; IME=closed', result["text"])
                    self.assertNotIn('title="Document"', result["text"])
                self.assertEqual(native.events, [("press", "p"), ("press", "win+r")])
                self.assertEqual(native.typed_units, [ord(char) for char in "editor.exe"])
                self.assertEqual(windows.user.properties, {})
            finally:
                inputs.queue.put(None)
                thread.join(timeout=5)
                self.assertFalse(thread.is_alive())
        self.assertEqual(native.held, set())

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
