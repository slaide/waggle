#!/usr/bin/env uv run python3

import argparse
import git
import uvicorn
import subprocess
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pathlib import Path
from email.utils import formatdate
import mimetypes

PROJROOTDIR=Path(__file__).resolve().parent

app = FastAPI()

def run_bash_command(command: str, cwd: Path | None = None, check: bool = True):
    """
    Execute a command through bash -c with source ~/.bashrc.
    
    Args:
        command: The command to execute
        cwd: Working directory (defaults to PROJROOTDIR)
        check: Whether to raise exception on non-zero exit code
    """
    if cwd is None:
        cwd = PROJROOTDIR
    
    full_command = f"source ~/.bashrc && {command}"
    return subprocess.run(['bash', '-c', full_command], cwd=cwd, check=check)

@app.get("/repo_url")
def get_repo_url():
    repo = git.Repo(PROJROOTDIR)
    url = repo.remotes.origin.url
    branch = repo.active_branch.name
    commit = repo.head.commit
    # Convert git@github.com:user/repo.git to https://github.com/user/repo
    https_url = url.replace('git@github.com:', 'https://github.com/').replace('.git', '')
    html = f"""
    <html>
        <body>
            repository: <a href="{https_url}">{url}</a><br>
            commit: <a href="{https_url}/commit/{commit.hexsha}">{commit.hexsha}</a><br>
            branch: {branch}, timestamp: {commit.committed_datetime}
        </body>
    </html>
    """
    return HTMLResponse(content=html)

# target for webhook that triggers code pull on commit.
# from https://medium.com/@aadibajpai/deploying-to-pythonanywhere-via-github-6f967956e664
@app.post("/update_server")
def update_server(request:Request):
    try:
        # pull
        run_bash_command('git pull')

        # manually execute post-merge commands to keep them tracked in the repo
        run_bash_command(f'bash {PROJROOTDIR}/server/build.sh')
        run_bash_command('touch /var/www/padraig_eu_pythonanywhere_com_wsgi.py')
        run_bash_command(f'bash {PROJROOTDIR}/server/reload.sh')

        return "Updated successfully", 200
    
    except subprocess.CalledProcessError as e:
        error_msg = f"Command failed: {' '.join(e.cmd)} (exit code {e.returncode})"
        print(error_msg)
        raise HTTPException(status_code=500, detail=error_msg) from e
    except Exception as e:
        error_msg = f"Update failed: {str(e)}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=error_msg) from e



# this matches all requests, so any other path that should be registered must be registered before!
@app.get("/{full_path:path}")
def serve(full_path: str) -> FileResponse:
    file_path = PROJROOTDIR / full_path
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

    if full_path=="" or full_path=="/":
        return serve("static/index.html")

    # 3) Neither found → 404
    raise HTTPException(status_code=404, detail="Not Found")

# implement routes regardless, but only start server here if this is the main entry point
if __name__ == '__main__':
    parser=argparse.ArgumentParser(description="")
    default_port=8000
    parser.add_argument("--port","-p",type=int,default=default_port,help=f"Port to serve on. defaults to {default_port}.")
    args=parser.parse_args()

    PORT=args.port

    uvicorn.run(app, port=PORT)
