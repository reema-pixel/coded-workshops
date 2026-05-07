"""Tiny static server for the CODED Open Programs landing page.

Run with: python3 server.py
Then open http://127.0.0.1:7333 in your browser.
"""
import os
import http.server
import socketserver

PORT = 7333
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)


with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"CODED Open Programs — http://127.0.0.1:{PORT}/")
    httpd.serve_forever()
