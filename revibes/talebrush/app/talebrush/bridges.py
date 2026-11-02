"""One LLM bridge per writing model (remix: choose the Claude model that writes the story).

The workshop bridge (llm-bridge/bridge.py) answers with one model, chosen when it
starts (BRIDGE_MODEL), and ignores the model name in each request. So that the
writer can choose which Claude model writes the sentences, TaleBrush starts one
more bridge for each model the writer chooses, the first time that model is used:

    BRIDGE_MODEL=<model> python3 llm-bridge/bridge.py claude <port>

on the first free port from 8788 to 8799. llm-bridge/ itself is not changed.
A bridge that already runs a model on one of those ports (started by hand, or
left by an earlier TaleBrush run) is used instead of starting a new one.
TaleBrush stops the bridges it started when it stops.

Fortune recognition always uses the main bridge (--bridge, port 8787 by
default), so stories written by different models are rated by the same model.
"""

import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request

from .llm import BridgeClient, BridgeError

# Aliases that the claude command accepts for --model. Each one means the newest model of that family.
MODELS = [
    {"id": "haiku", "label": "Haiku"},
    {"id": "sonnet", "label": "Sonnet"},
    {"id": "opus", "label": "Opus"},
    {"id": "fable", "label": "Fable"},
]
MODEL_IDS = [m["id"] for m in MODELS]
PORTS = range(8788, 8800)
START_TIMEOUT = 20  # seconds to wait for a new bridge to answer /health


def label_of(model):
    """The name shown to the writer, e.g. "Sonnet" for "sonnet"."""
    for m in MODELS:
        if m["id"] == model:
            return m["label"]
    return model or "the bridge's default model"


def probe(url, timeout=1.0):
    """The /health answer of a bridge at url, or None if no bridge answers there."""
    try:
        with urllib.request.urlopen(url + "/health", timeout=timeout) as r:
            info = json.loads(r.read() or b"{}")
    except (OSError, ValueError):
        return None
    return info if isinstance(info, dict) and "backend" in info else None


def port_is_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


class BridgePool:
    """The main bridge, plus one bridge for each other writing model, started on first use."""

    def __init__(self, main, script, log=print, probe=probe, spawn=None, ports=PORTS,
                 port_is_free=port_is_free, start_timeout=START_TIMEOUT):
        self.main = main          # BridgeClient of the main bridge
        self.script = script      # path of llm-bridge/bridge.py
        self.log = log
        self.probe = probe
        self.spawn = spawn or self._spawn
        self.ports = ports
        self.port_is_free = port_is_free
        self.start_timeout = start_timeout
        self.clients = {}         # model id -> BridgeClient of the bridge that runs it
        self.procs = {}           # model id -> process, for the bridges TaleBrush started
        self._lock = threading.Lock()

    def describe(self, info):
        """For /api/health: the models the writer can choose, and the extra bridges that run now.

        info is the main bridge's /health answer. Only Claude models can be chosen, so with
        a Codex bridge the list is empty and the page hides the choice.
        """
        default = info.get("model") if info else None
        if not info or info.get("backend") != "claude":
            return {"models": [], "default": default, "running": {}}
        return {"models": MODELS, "default": default,
                "running": {m: c.base_url for m, c in self.clients.items()}}

    def writer_for(self, model, notify=lambda message: None):
        """Return (client, model id) for the bridge that writes with `model`.

        model None means the main bridge's own model. A bridge for another model is
        started if none runs yet; notify(message) tells the page while it starts.
        """
        if model is not None and model not in MODEL_IDS:
            raise ValueError(f"Unknown model {model!r}. Choose one of: {', '.join(MODEL_IDS)}.")
        info = self.main.health()  # raises BridgeError when the main bridge is down
        if model is None or info.get("model") == model:
            return self.main, info.get("model")
        if info.get("backend") != "claude":
            raise BridgeError("Choosing the writing model needs the main LLM bridge to run Claude Code. "
                              "Start it with: python3 llm-bridge/bridge.py claude")
        with self._lock:
            client = self.clients.get(model)
            if client and self._runs(client.base_url, model):
                return client, model
            self.clients.pop(model, None)
            for port in self.ports:  # a bridge for this model may already run
                url = f"http://localhost:{port}"
                if self._runs(url, model):
                    self.log(f"using the LLM bridge at {url} for {model}")
                    self.clients[model] = BridgeClient(url)
                    return self.clients[model], model
            port = next((p for p in self.ports if self.port_is_free(p)), None)
            if port is None:
                raise BridgeError(f"No free port from {self.ports[0]} to {self.ports[-1]} "
                                  f"to start an LLM bridge for {label_of(model)}.")
            notify(f"Starting an LLM bridge for {label_of(model)} on port {port}. "
                   "This happens once per model and takes a few seconds...")
            self.log(f"starting an LLM bridge for {model} on port {port}")
            url = f"http://localhost:{port}"
            proc = self.spawn(model, port)
            self.procs[model] = proc
            deadline = time.time() + self.start_timeout
            while not self._runs(url, model):
                if proc.poll() is not None:
                    raise BridgeError(f"The LLM bridge for {label_of(model)} stopped while starting "
                                      f"(exit code {proc.returncode}). Its message is in the TaleBrush terminal.")
                if time.time() > deadline:
                    proc.terminate()
                    raise BridgeError(f"The LLM bridge for {label_of(model)} did not answer within "
                                      f"{self.start_timeout} seconds.")
                time.sleep(0.2)
            self.clients[model] = BridgeClient(url)
            return self.clients[model], model

    def stop(self):
        """Stop the bridges TaleBrush started."""
        for proc in self.procs.values():
            if proc.poll() is None:
                proc.terminate()
        for proc in self.procs.values():
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        self.procs.clear()
        self.clients.clear()

    # ---------------------------------------------------------------- helpers

    def _runs(self, url, model):
        info = self.probe(url)
        return bool(info) and info.get("backend") == "claude" and info.get("model") == model

    def _spawn(self, model, port):
        if not os.path.isfile(self.script):
            raise BridgeError(f"The LLM bridge script was not found at {self.script}.")
        proc = subprocess.Popen(
            [sys.executable, str(self.script), "claude", str(port)],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(self.script))),  # the repository root
            env={**os.environ, "BRIDGE_MODEL": model},
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        threading.Thread(target=self._forward, args=(proc, model), daemon=True).start()
        return proc

    @staticmethod
    def _forward(proc, model):
        """Copy the bridge's log lines to the TaleBrush terminal, marked with the model."""
        for line in proc.stdout:
            print(f"({model}) {line.rstrip()}", flush=True)
