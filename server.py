#!/usr/bin/env python3

import os
import argparse
from pathlib import Path

from http.server import HTTPServer, BaseHTTPRequestHandler

import re
from typing import Optional, Dict

parser=argparse.ArgumentParser(description="")
parser.add_argument("--port","-p",type=int,default=8000,help=f"Port to serve on. defaults to None.")
args=parser.parse_args()

PORT=args.port

# try to use flask, which is a very robust web server framework
# (if it not installed, fall back to a hand rolled implementation)
try:
    import flask
    
    from flask import Flask, send_file, send_from_directory
    
    # no need to specify port or manually start flask
    app = Flask(__name__)
    
except:

    # Map converter name → regex for a single segment (string) or multiple (path)
    _CONVERTER_REGEX = {
        'string': r'[^/]+',
        'path':   r'.+',
        'int':    r'\d+',
        'float':  r'\d+(?:\.\d+)?',
        'uuid':   r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-'
                  r'[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
                  r'[0-9a-fA-F]{12}',
    }

    _pattern = re.compile(
        r'<'
          r'(?:(?P<conv>\w+)'           # optional converter name
            r'(?:\((?P<args>[^)]*)\))?:' # optional "(a,b,c)"
          r')?'
          r'(?P<var>\w+)'               # variable name
        r'>'
    )

    def _compile_route_to_regex(route: str) -> re.Pattern:
        pos = 0
        parts = []

        for m in _pattern.finditer(route):
            # literal text before this placeholder
            parts.append(re.escape(route[pos:m.start()]))

            conv = m.group('conv') or 'string'
            var  = m.group('var')
            args = m.group('args')

            if conv == 'any':
                # any(foo,bar,baz)
                choices = [re.escape(x) for x in args.split(',')]
                expr = f"(?:{'|'.join(choices)})"
            else:
                expr = _CONVERTER_REGEX.get(conv, _CONVERTER_REGEX['string'])

            parts.append(f"(?P<{var}>{expr})")
            pos = m.end()

        # trailing literal text
        parts.append(re.escape(route[pos:]))
        pattern = '^' + ''.join(parts) + '$'
        return re.compile(pattern)

    def match_flask_route(route_pattern: str, url_path: str) -> Optional[Dict[str, str]]:
        """
        Returns a dict of extracted variables if url_path matches
        the Flask-style route_pattern, or None otherwise.
        """
        regex = _compile_route_to_regex(route_pattern)
        m = regex.match(url_path)
        return m.groupdict() if m else None

    class CustomServer:
        """ flask-style custom server implementation to preserve flask interace in environments withou flask installed """

        def __init__(self):
            self.paths={}

        def run(self,port:int):
            """ run server forever (this function does not return) """

            server_address = ('', port)
            httpd = HTTPServer(server_address, RequestHandler)
            print(f"Serving on http://127.0.0.1:{port}/")
            httpd.serve_forever()

        def route(self,path:str):
            """ set route handler (may use flask-style pattern matching) """

            def sethandler(f):
                print(f"set handler for {path}")
                self.paths[path]=f
                return f

            return sethandler

        def handle(self,path:str):
            for pattern,handler in self.paths.items():
                print(f"testing {path} against {pattern}")
                
                res=match_flask_route(pattern,path)
                if res is not None:
                    print(f"matched {res}")
                    handler(**res)
                else:
                    print("not matched")

    app=CustomServer()

    # this is a terrible solution, but it works to preserve the flask interface
    requestHandler={"h":None}
    def send_file(path:str):                        
        #assert path[0]=="/", f"{path} does not match"
        #path=path[1:]

        filepath = os.path.abspath(os.path.join('.', path))

        handler=requestHandler["h"]
        try:
            with open(filepath, 'rb') as file:
                data = file.read()
                handler.send_response(200)
                handler.send_header('Content-Type', get_content_type(filepath))
                handler.end_headers()
                handler.wfile.write(data)
                
        except FileNotFoundError:
            print(f"file {filepath} ({path}) not found")
            handler.send_response(404)
            handler.end_headers()

    # fall back to basic http server if flask is not available
    class RequestHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            requestHandler["h"]=self
            app.handle(self.path)

    def get_content_type(path:str)->str:
        # table with some mime types based on file endings (machine generated)
        mime_types = {
            # text
            '.txt':  'text/plain',
            '.htm':  'text/html',
            '.html': 'text/html',
            '.css':  'text/css',
            '.csv':  'text/csv',
            '.md':   'text/markdown',
            '.rtf':  'application/rtf',
        
            # JavaScript
            '.js':   'application/javascript',
            '.mjs':  'application/javascript',
            '.json': 'application/json',
            '.xml':  'application/xml',
            '.yaml': 'application/x-yaml',
            '.yml':  'application/x-yaml',
        
            # images
            '.png':  'image/png',
            '.jpg':  'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif':  'image/gif',
            '.bmp':  'image/bmp',
            '.webp': 'image/webp',
            '.svg':  'image/svg+xml',
            '.ico':  'image/vnd.microsoft.icon',
            '.tiff': 'image/tiff',
        
            # audio
            '.mp3':  'audio/mpeg',
            '.wav':  'audio/wav',
            '.ogg':  'audio/ogg',
            '.flac': 'audio/flac',
            '.aac':  'audio/aac',
        
            # video
            '.mp4':  'video/mp4',
            '.mov':  'video/quicktime',
            '.avi':  'video/x-msvideo',
            '.wmv':  'video/x-ms-wmv',
            '.webm': 'video/webm',
            '.mpeg': 'video/mpeg',
            '.mkv':  'video/x-matroska',
        
            # fonts
            '.woff':  'font/woff',
            '.woff2': 'font/woff2',
            '.ttf':   'font/ttf',
            '.otf':   'font/otf',
            '.eot':   'application/vnd.ms-fontobject',
        
            # archives
            '.zip':  'application/zip',
            '.tar':  'application/x-tar',
            '.gz':   'application/gzip',
            '.rar':  'application/vnd.rar',
            '.7z':   'application/x-7z-compressed',
        
            # office documents
            '.pdf':  'application/pdf',
            '.doc':  'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls':  'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt':  'application/vnd.ms-powerpoint',
            '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        
            # default
            '':      'application/octet-stream',  # fallback for unknown extensions
        }
        
        # ensure file ending is lower case
        path=path.lower()

        for ext, mimetype in mime_types.items():
            if path.endswith(ext):
                return mimetype
                
        return 'application/octet-stream'

# -- actually implement routing logic below

@app.route("/")
@app.route("/index.html")
def sendindex():
    return send_file("index.html")
        
@app.route('/js/<path:requested_path>')
def serve_script(requested_path:str):
    return send_file(str(Path("js")/requested_path))

@app.route('/css/<path:requested_path>')
def serve_style(requested_path:str):
    return send_file(str(Path("css")/requested_path))

# implement routes regardless, but only start server here if this is the main entry point
if __name__ == '__main__':
    app.run(port=PORT)
