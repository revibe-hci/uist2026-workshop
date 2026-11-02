#!/usr/bin/env python3
"""TaleBrush, rebuilt from the CHI 2022 paper for the Revibing HCI workshop.

Serves the web interface (static/) and a small REST API for the paper's two
language-model components:

    GET  /api/health      is the LLM bridge reachable, and which model answers
    POST /api/recognize   fortune recognition for a batch of sentences, one
                          rating per character
    POST /api/generate    fortune-controlled generation for sketched sentence
                          slots; streams newline-delimited JSON events

Remix: both POST routes take a list of characters (the protagonist first)
instead of one protagonist; see DEVELOPER.md.

The paper used a Flask server. This one uses only the Python standard library,
so nothing has to be installed. Model calls go through the workshop's LLM
bridge, which must be running:

    python3 llm-bridge/bridge.py claude                  (from the repository root)
    python3 revibes/talebrush/app/server.py              then open http://localhost:5177

Options: --port (default 5177, or TALEBRUSH_PORT) and --bridge (default
http://localhost:8787, or TALEBRUSH_BRIDGE).
"""

import argparse
import json
import mimetypes
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

APP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(APP_DIR))

from talebrush.cast import clean_characters  # noqa: E402
from talebrush.generation import GenerationCancelled, Generator, parse_request  # noqa: E402
from talebrush.llm import BridgeClient, BridgeError  # noqa: E402
from talebrush.recognition import Recognizer  # noqa: E402

STATIC_DIR = (APP_DIR / "static").resolve()
DEFAULT_PORT = 5177
DEFAULT_BRIDGE = "http://localhost:8787"

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


def log(message):
    print(f"[talebrush {time.strftime('%H:%M:%S')}] {message}", flush=True)


class App:
    def __init__(self, bridge_url):
        self.llm = BridgeClient(bridge_url)
        self.recognizer = Recognizer(self.llm)
        self.generator = Generator(self.llm, self.recognizer, log=log)


class Handler(BaseHTTPRequestHandler):
    app = None  # set in main()
    server_version = "TaleBrush/1.0"

    def log_message(self, fmt, *args):  # keep the console for API summaries
        pass

    # ---------------------------------------------------------------- plumbing

    def send_json(self, status, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        return json.loads(raw or b"{}")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.handle_health()
        if path in ("", "/"):
            path = "/index.html"
        self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self.read_json()
        except ValueError:
            return self.send_json(400, {"error": "The request body is not valid JSON."})
        if path == "/api/recognize":
            return self.handle_recognize(body)
        if path == "/api/generate":
            return self.handle_generate(body)
        self.send_json(404, {"error": f"Unknown endpoint {path}"})

    def serve_static(self, path):
        target = (STATIC_DIR / path.lstrip("/")).resolve()
        if not str(target).startswith(str(STATIC_DIR) + os.sep) or not target.is_file():
            return self.send_json(404, {"error": f"Not found: {path}"})
        data = target.read_bytes()
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/json", "image/svg+xml"):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")  # edits to the app show up on reload
        self.end_headers()
        self.wfile.write(data)

    # ---------------------------------------------------------------- API

    def handle_health(self):
        llm = self.app.llm
        try:
            info = llm.health()
            bridge = {"ok": True, "url": llm.base_url, "backend": info.get("backend"), "model": info.get("model")}
        except BridgeError as e:
            bridge = {"ok": False, "url": llm.base_url, "error": str(e)}
        self.send_json(200, {"ok": True, "bridge": bridge})

    def handle_recognize(self, body):
        items = body.get("items") if isinstance(body, dict) else None
        if not isinstance(items, list) or not all(isinstance(it, dict) for it in items):
            return self.send_json(400, {"error": "items must be a list of {context, sentence} objects."})
        characters = clean_characters(body.get("characters"), body.get("protagonist"))
        started = time.time()
        try:
            fortunes = self.app.recognizer.recognize(characters, items)
        except BridgeError as e:
            log(f"recognition failed: {e}")
            return self.send_json(502, {"error": str(e)})
        who = "" if len(characters) == 1 else f" for {len(characters)} characters"
        log(f"recognized {len(items)} sentence(s){who} in {time.time() - started:.1f}s")
        self.send_json(200, {"characters": characters, "fortunes": fortunes})

    def handle_generate(self, body):
        try:
            request = parse_request(body)
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        def emit(event):
            try:
                self.wfile.write((json.dumps(event) + "\n").encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                raise GenerationCancelled()

        try:
            self.app.generator.run(request, emit)
        except GenerationCancelled:
            log("generation stopped by the writer")
        except BridgeError as e:
            log(f"generation failed: {e}")
            self.try_emit(emit, {"type": "error", "message": str(e)})
        except Exception as e:  # report unexpected errors to the page instead of hanging
            traceback.print_exc()
            self.try_emit(emit, {"type": "error", "message": f"Server error: {e}"})

    @staticmethod
    def try_emit(emit, event):
        try:
            emit(event)
        except GenerationCancelled:
            pass


def main():
    parser = argparse.ArgumentParser(description="Run the TaleBrush web app.")
    parser.add_argument("--port", type=int, default=int(os.environ.get("TALEBRUSH_PORT", DEFAULT_PORT)))
    parser.add_argument("--bridge", default=os.environ.get("TALEBRUSH_BRIDGE", DEFAULT_BRIDGE),
                        help="URL of the LLM bridge (default http://localhost:8787)")
    args = parser.parse_args()

    Handler.app = App(args.bridge)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError:
        sys.exit(f"Port {args.port} is in use. Start TaleBrush on another port: "
                 f"python3 server.py --port {args.port + 1}")
    server.daemon_threads = True
    log(f"TaleBrush is running at http://localhost:{args.port}")
    try:
        info = Handler.app.llm.health()
        log(f"LLM bridge at {args.bridge}: backend={info.get('backend')}, model={info.get('model')}")
    except BridgeError as e:
        log(f"WARNING: {e}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("stopped")


if __name__ == "__main__":
    main()
