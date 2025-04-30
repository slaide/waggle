#!/usr/bin/env uv run python3

import argparse
from pathlib import Path
import git
import typing as tp
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from asgiref.wsgi import WsgiToAsgi

parser=argparse.ArgumentParser(description="")
parser.add_argument("--port","-p",type=int,default=8000,help=f"Port to serve on. defaults to None.")
args=parser.parse_args()

PORT=args.port

app = FastAPI()

app.mount(
    "/",
    # html=True -> serve index.html on path=="/"
    StaticFiles(directory="static", html=True),
    name="static",
)

# target for webhook that triggers code pull on commit.
# from https://medium.com/@aadibajpai/deploying-to-pythonanywhere-via-github-6f967956e664
@app.post("/update_server")
def update_server(request:Request):
    if request.method=="POST" and git is not None:
        repo=git.Repo("./waggle")
        origin=repo.remotes.origin
        origin.pull()

        return "Updated successfully", 200
    else:
        return "Update failed", 400

# implement routes regardless, but only start server here if this is the main entry point
if __name__ == '__main__':
    uvicorn.run(app, port=PORT)
else:
    application = WsgiToAsgi(app)