#!/usr/bin/env python3
"""Loopback-only, Studio development transport for panel-owned Caiyun GETs."""
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def valid_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        return False
    url = urlsplit(value)
    return (url.scheme == "https" and url.netloc == "api.caiyunapp.com"
            and re.fullmatch(r"/v2\.6/[A-Za-z0-9]+/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/(?:weather|realtime|daily|minutely|hourly)", url.path) is not None
            and not url.fragment)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def send_json(self, status, data):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "null")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def permitted(self):
        return self.path == "/api/transport/caiyun" and self.headers.get("Origin") == "null" and self.headers.get("Host") == "127.0.0.1:8768"

    def do_OPTIONS(self):
        self.send_json(200 if self.permitted() else 403, b"{}")

    def do_POST(self):
        if not self.permitted():
            self.send_json(403, b"{}")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 1 <= size <= 4096 or self.headers.get_content_type() != "application/json":
                raise ValueError("invalid request")
            value = json.loads(self.rfile.read(size)).get("url")
            if not valid_url(value):
                raise ValueError("invalid URL")
            with build_opener(NoRedirect()).open(Request(value, headers={"Accept": "application/json"}), timeout=15) as response:
                data = response.read(1024 * 1024 + 1)
                if len(data) > 1024 * 1024:
                    raise ValueError("response too large")
                json.loads(data)
            self.send_json(200, data)
        except (ValueError, TypeError, AttributeError, HTTPError, URLError, OSError):
            self.send_json(502, b'{"error":"Weather request failed"}')

if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8768), Handler)
    print("Studio Caiyun transport listening on 127.0.0.1:8768", flush=True)
    server.serve_forever()
