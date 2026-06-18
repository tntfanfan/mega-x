"""Lightweight static-file server used by VSCode launch tasks.

Why not just `python -m http.server`?
- VSCode tasks on Windows don't reliably propagate SIGTERM/Ctrl-C to the
  child process on Stop Debugging, leaving an orphan that holds the port.
  This wrapper installs a SIGINT/SIGBREAK handler and exits cleanly.
- Forces SO_REUSEADDR so a quick restart isn't blocked by TIME_WAIT.

Run: python tools/dev_server.py [port]    (default 8000, bind 127.0.0.1)
"""
import http.server, socketserver, sys, signal, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
HOST = "127.0.0.1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

handler = http.server.SimpleHTTPRequestHandler
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
print(f"[dev_server] Serving HTTP on {HOST} port {PORT}")
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    shutdown()
