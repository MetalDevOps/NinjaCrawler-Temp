"""Entrypoint headless da Web API do DouK-Downloader (TikTokDownloader) para o
NinjaCrawler.

O `.exe` oficial do DouK-Downloader é interativo (menu); este entrypoint sobe a
mesma Web API (FastAPI/uvicorn) de forma headless, configurável por argumentos,
para ser empacotado via PyInstaller como o runtime `tiktok-api`.

Uso (após build):
    tiktok-api.exe --host 127.0.0.1 --port 5555 [--cookie "<cookie>"] [--token "<tok>"]

Build (na raiz do checkout do DouK-Downloader, com as deps + pyinstaller no venv):
    pyinstaller --onefile --name tiktok-api \
        --collect-all src --collect-submodules uvicorn \
        Tools/tiktok-api/server_entry.py

Observações:
- Reconfigura stdout/stderr para UTF-8 (errors=replace): o `rich` crasha no
  console cp1252 do Windows ao logar emojis, derrubando requisições.
- O cookie da conta também pode ser enviado por requisição (campo `cookie` dos
  endpoints /tiktok/*), então `--cookie` é opcional; quando informado, é gravado
  em settings.json como default.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys


def _force_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:
            pass


async def _serve(host: str, port: int, cookie: str | None) -> None:
    from src.custom.internal import PROJECT_ROOT
    from src.config.settings import Settings

    PROJECT_ROOT.mkdir(parents=True, exist_ok=True)
    settings_path = PROJECT_ROOT / "settings.json"
    data = dict(Settings.default)
    if settings_path.exists():
        try:
            data.update(json.loads(settings_path.read_text(encoding="utf-8")))
        except Exception:
            pass
    if cookie:
        data["cookie_tiktok"] = cookie
    settings_path.write_text(json.dumps(data, ensure_ascii=False, indent=4), encoding="utf-8")

    from src.application import TikTokDownloader
    from src.application.main_server import APIServer

    async with TikTokDownloader() as downloader:
        try:
            await downloader.database.update_config_data("Disclaimer", 1)
        except Exception:
            pass
        downloader.check_config()
        await downloader.check_settings(False)
        print(f"[tiktok-api] serving on http://{host}:{port}", flush=True)
        await APIServer(downloader.parameter, downloader.database).run_server(host, port)


def main() -> None:
    _force_utf8()
    parser = argparse.ArgumentParser(description="DouK-Downloader Web API (headless)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5555)
    parser.add_argument("--cookie", default=None, help="TikTok cookie (header string); opcional")
    parser.add_argument("--token", default=None, help="reservado; is_valid_token aceita qualquer valor")
    args = parser.parse_args()
    try:
        asyncio.run(_serve(args.host, args.port, args.cookie))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
