#!/usr/bin/env python3

import os
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT=8000

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path
        
        if path == '/':
            path = '/index.html'
            
        filepath = os.path.abspath(os.path.join('.', path[1:]))

        try:
            with open(filepath, 'rb') as file:
                data = file.read()
                self.send_response(200)
                self.send_header('Content-Type', get_content_type(filepath))
                self.end_headers()
                self.wfile.write(data)
                
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()

def get_content_type(path):
    mime_types = {
        '.txt': 'text/plain',
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript'
    }
    
    for ext, type in mime_types.items():
        if path.endswith(ext):
            return type
            
    return 'application/octet-stream'

def run_server(port:int):
    server_address = ('', port)
    httpd = HTTPServer(server_address, RequestHandler)
    print(f"Serving on http://127.0.0.1:{port}/")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server(port=PORT)
