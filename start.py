"""
Collaborative CodeSpace IDE - Project Launch Runner
Starts FastAPI backend server, Vite frontend server, waits for readiness,
and automatically opens the application in the default web browser.
"""

import sys
import os
import time
import subprocess
import webbrowser
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

BACKEND_URL = "http://127.0.0.1:8000/api/health"
FRONTEND_URL = "http://localhost:5173"


if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass


def wait_for_service(url: str, timeout: int = 25, service_name: str = "Service") -> bool:
    """Poll URL until HTTP 200 is returned or timeout expires."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as res:
                if res.getcode() == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def main():
    print("=" * 60)
    print("[*] STARTING COLLABORATIVE CODESPACE IDE")
    print("=" * 60)

    # 1. Start FastAPI Backend
    print("\n[1/3] Launching FastAPI backend server on port 8000...")
    backend_cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"]
    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=str(BACKEND_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    if not wait_for_service(BACKEND_URL, timeout=15, service_name="Backend"):
        print("[!] Backend server did not respond in time, checking status...")
    else:
        print("[+] Backend server is online and healthy at http://127.0.0.1:8000")

    # 2. Start Vite Frontend
    print("\n[2/3] Launching Vite frontend server on port 5173...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(FRONTEND_DIR),
    )

    # 3. Wait for Frontend & Open Browser
    print("\n[3/3] Waiting for frontend dev server to be ready...")
    if wait_for_service(FRONTEND_URL, timeout=20, service_name="Frontend"):
        print(f"[+] Frontend server is ready at {FRONTEND_URL}")
    else:
        print(f"[*] Opening browser at {FRONTEND_URL}")

    print(f"\n[>] Automatically opening Collaborative CodeSpace IDE in default browser: {FRONTEND_URL}")
    webbrowser.open(FRONTEND_URL)

    print("\n" + "=" * 60)
    print(" Collaborative CodeSpace IDE is running!")
    print(f"  * Frontend UI:   {FRONTEND_URL}")
    print("  * Backend API:   http://127.0.0.1:8000")
    print("  * API Docs:      http://127.0.0.1:8000/docs")
    print("=" * 60)
    print("Press Ctrl+C to stop both servers.\n")

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\n[*] Shutting down Collaborative CodeSpace IDE...")
        backend_proc.terminate()
        frontend_proc.terminate()
        try:
            backend_proc.wait(timeout=3)
            frontend_proc.wait(timeout=3)
        except Exception:
            backend_proc.kill()
            frontend_proc.kill()
        print("[+] Servers stopped cleanly.")


if __name__ == "__main__":
    main()
