"""Mega X dev server — single port for the whole stack.

In production, mega-x.ai is one origin serving three things via nginx:
  /              → mega-x static site
  /console/*     → Phyntom X8 Console SPA (vite build artifacts)
  /v1/* /health  → Phyntom X8 API (FastAPI)

This dev server mirrors that topology locally so links can be relative
and there's no CORS / cross-origin cookie story during development.

  http://localhost:8000/             → mega-x static (this process)
  http://localhost:8000/console/*    → reverse proxy → vite dev :5173
  http://localhost:8000/v1/*         → reverse proxy → FastAPI :8001
  http://localhost:8000/health       → reverse proxy → FastAPI :8001

Run:  python tools/dev_server.py [port]    (default 8000, bind 127.0.0.1)

Env overrides:
  PHYNTOM_CONSOLE_URL   target for /console/* proxy   (default http://localhost:5173)
  PHYNTOM_API_URL       target for /v1/* and /health  (default http://localhost:8001)

If a proxy target is down, the response is a 502 with a clear hint
("start the vite dev server / start the FastAPI backend") so you know
which sibling process needs attention.
"""
import http.server
import socketserver
import sys
import signal
import os
import urllib.request
import urllib.error
from urllib.parse import urlsplit


PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
HOST = "127.0.0.1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

CONSOLE_URL = os.environ.get("PHYNTOM_CONSOLE_URL", "http://localhost:5173").rstrip("/")
API_URL = os.environ.get("PHYNTOM_API_URL", "http://localhost:8001").rstrip("/")

# Headers we should NOT forward verbatim (per RFC 7230 § 6.1 / proxy hygiene).
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}


class ReuseTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    # Threaded so a hung upstream doesn't block sibling requests.
    allow_reuse_address = True
    daemon_threads = True


class DevHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler with two additions:

    1. Reverse-proxies `/console/*` to the vite dev server and `/v1/*` /
       `/health` to the FastAPI backend. Everything else falls through
       to SimpleHTTPRequestHandler.
    2. Sends `Cache-Control: no-store` on every response so the browser
       doesn't cache dev assets.
    """

    # ── error / cache hygiene ──
    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            self.close_connection = True

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # ── routing ──
    def _proxy_target(self):
        """Return (target_base_url, upstream_label) if the request path should
        be proxied; otherwise None."""
        path = urlsplit(self.path).path
        if path == "/console" or path.startswith("/console/"):
            return CONSOLE_URL, "vite (phyntom-console)"
        if path.startswith("/v1/") or path == "/v1" or path == "/health":
            return API_URL, "FastAPI (tools.ai_native)"
        return None

    def _do_request(self):
        tgt = self._proxy_target()
        if tgt is None:
            # Static file
            return super().do_GET() if self.command == "GET" else super().do_HEAD()
        target_base, upstream = tgt
        self._proxy(target_base, upstream)

    def do_GET(self):
        self._do_request()

    def do_HEAD(self):
        self._do_request()

    def do_POST(self):
        tgt = self._proxy_target()
        if tgt is None:
            self.send_error(405, "Method Not Allowed")
            return
        self._proxy(*tgt)

    def do_PATCH(self):
        self.do_POST()

    def do_PUT(self):
        self.do_POST()

    def do_DELETE(self):
        self.do_POST()

    def do_OPTIONS(self):
        # CORS preflight should not normally happen (same origin), but if
        # something does fire one (e.g. vite HMR client), pass it through.
        if self._proxy_target() is None:
            self.send_response(204)
            self.end_headers()
            return
        self.do_POST()

    # ── reverse proxy core ──
    def _proxy(self, target_base: str, upstream_label: str) -> None:
        upstream_url = target_base + self.path

        # Forward body (if any) and headers.
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length > 0 else None

        req_headers = {}
        for k, v in self.headers.items():
            if k.lower() in HOP_BY_HOP:
                continue
            req_headers[k] = v
        req_headers.setdefault("X-Forwarded-Host", self.headers.get("Host", ""))
        req_headers.setdefault("X-Forwarded-Proto", "http")
        req_headers.setdefault("X-Forwarded-For", self.client_address[0])

        req = urllib.request.Request(
            upstream_url, data=body, method=self.command, headers=req_headers,
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() in HOP_BY_HOP:
                        continue
                    if k.lower() == "cache-control":
                        # We add no-store ourselves in end_headers.
                        continue
                    self.send_header(k, v)
                self.end_headers()
                payload = resp.read()
                if self.command != "HEAD":
                    self.wfile.write(payload)
        except urllib.error.HTTPError as e:
            # Upstream returned a non-2xx; forward as-is so dev tooling sees it.
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() in HOP_BY_HOP:
                    continue
                self.send_header(k, v)
            self.end_headers()
            payload = e.read()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except (urllib.error.URLError, ConnectionError, OSError) as e:
            # Upstream is unreachable — give a 502 with a hint.
            hint = (
                f"[dev_server] upstream {upstream_label} at {target_base} not reachable: {e}\n"
                f"Start it:\n"
                f"  - vite (console):   pnpm --filter @megax/console dev   (from frontend/mega-x/)\n"
                f"                       or: cd frontend/mega-x/apps/console && pnpm dev\n"
                f"  - FastAPI backend:  python -m tools.ai_native.main\n"
            )
            self.log_error(hint.replace("\n", " | "))
            body_bytes = hint.encode("utf-8", "replace")
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body_bytes)))
            self.send_header("X-Dev-Upstream-Down", upstream_label)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body_bytes)


handler = DevHandler
httpd = ReuseTCPServer((HOST, PORT), handler)


def shutdown(*_):
    print(f"\n[dev_server] shutting down")
    httpd.shutdown()
    httpd.server_close()
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown)
if hasattr(signal, "SIGBREAK"):
    signal.signal(signal.SIGBREAK, shutdown)
if hasattr(signal, "SIGTERM"):
    signal.signal(signal.SIGTERM, shutdown)


print(f"[dev_server] serving {ROOT} on http://{HOST}:{PORT}")
print(f"[dev_server]   /console/* → {CONSOLE_URL}")
print(f"[dev_server]   /v1/*, /health → {API_URL}")
print(f"[dev_server]   everything else → static (cwd)")
# Legacy compatibility line — .vscode/tasks.json "mega-x: static server"
# problemMatcher.endsPattern matches "Serving HTTP on". Don't remove
# without also updating tasks.json.
print(f"[dev_server] Serving HTTP on {HOST} port {PORT} — ready", flush=True)
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    shutdown()
