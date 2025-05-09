#!/usr/bin/env uv run python3

# register filetypes that may not be known to the system
# (for the purposes of network transfer as raw data, they are all text)
import mimetypes
mimetypes.add_type("text/plain", ".mtl", strict=True)

import argparse
import git
import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from email.utils import formatdate

PROJROOTDIR=Path(__file__).resolve().parent

app = FastAPI()

# target for webhook that triggers code pull on commit.
# from https://medium.com/@aadibajpai/deploying-to-pythonanywhere-via-github-6f967956e664
@app.post("/update_server")
def update_server(request:Request):
    repo=git.Repo(PROJROOTDIR)
    origin=repo.remotes.origin
    origin.pull()

    return "Updated successfully", 200

STATIC_DIR=PROJROOTDIR/"static"
# this matches all requests, so any other path that should be registered must be registered before!
@app.get("/{full_path:path}")
async def serve(full_path: str):
    file_path = STATIC_DIR / full_path
    if file_path.is_file():
        media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"

        # stat for mtime/size
        stat = file_path.stat()
        # format Last-Modified in HTTP-date format
        last_modified = formatdate(stat.st_mtime, usegmt=True)

        headers={
            # to never make cache go stale: max-age=31536000, immutable
            # to disable caching: public, no-cache
            # something kinda ideal: public, max-age=3600, must-revalidate (IF ONLY IT WORKED!!!! browser just does not revalidate)

            # require revalidation (based on ETag)
            "Cache-Control": "public, no-cache",
            "Last-Modified": last_modified,
            # some 'unique' file state identifier
            "ETag": f"W/\"{stat.st_mtime}-{stat.st_size}\"",
        }
        return FileResponse(
            path=file_path,
            media_type=media_type,
            headers=headers,
        )

    if full_path=="":
        return await serve("index.html")

    # 3) Neither found → 404
    raise HTTPException(status_code=404, detail="Not Found")

# implement routes regardless, but only start server here if this is the main entry point
if __name__ == '__main__':
    parser=argparse.ArgumentParser(description="")
    parser.add_argument("--port","-p",type=int,default=8000,help=f"Port to serve on. defaults to None.")
    args=parser.parse_args()

    PORT=args.port

    uvicorn.run(app, port=PORT)
