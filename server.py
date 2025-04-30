#!/usr/bin/env uv run python3

import argparse
from pathlib import Path
import git
import typing as tp

parser=argparse.ArgumentParser(description="")
parser.add_argument("--port","-p",type=int,default=8000,help=f"Port to serve on. defaults to None.")
args=parser.parse_args()

PORT=args.port

from flask import Flask, send_file, send_from_directory, request

# no need to specify port or manually start flask
app = Flask(__name__)

# -- actually implement routing logic below

@app.route("/")
@app.route("/index.html")
def sendindex():
    return serve_static_file("index.html")

@app.route('/src/<path:requested_path>')
def serve_script(requested_path:str):
    return serve_static_file(str(Path("src")/requested_path))

@app.route('/css/<path:requested_path>')
def serve_style(requested_path:str):
    return serve_static_file(str(Path("css")/requested_path))

def serve_static_file(path:str):
    return send_from_directory("static",path)

# target for webhook that triggers code pull on commit.
# from https://medium.com/@aadibajpai/deploying-to-pythonanywhere-via-github-6f967956e664
@app.route("/update_server", methods=["POST"])
def update_server():
    if request.method=="POST" and git is not None:
        repo=git.Repo("./waggle")
        origin=repo.remotes.origin
        origin.pull()

        return "Updated successfully", 200
    else:
        return "Update failed", 400

# implement routes regardless, but only start server here if this is the main entry point
if __name__ == '__main__':
    app.run(port=PORT)
