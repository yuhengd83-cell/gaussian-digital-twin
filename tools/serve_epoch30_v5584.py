from __future__ import annotations
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import sys
import threading
import webbrowser

ROOT=Path(__file__).resolve().parent.parent
PORT=8108
FILE='2026-10-15_10-31-41_3DGS_epoch_30.spz'
EXPECTED='e332130c5c8ae17babcf013d135108e63146f3115ede3509d8d9cb23ea5f1f13'
URL='http://127.0.0.1:8108/agv-test.html?v=5.5.8.4&scene=epoch30_20261015'

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Avoid stale HTML/config reused from another local test build.
        if self.path.split('?')[0].endswith(('.html','.json','.mjs','.js')):
            self.send_header('Cache-Control','no-store, max-age=0')
        super().end_headers()

def main():
    print('=== AGV v5.5.8.4 read-only ROS2 receiver / pinned epoch_30 local run ===',flush=True)
    print('SERVING_ROOT = '+str(ROOT),flush=True)
    config=json.loads((ROOT/'config/scenes.json').read_text(encoding='utf-8'))
    model=next((m for m in config.get('models',[]) if m.get('id')=='epoch30_20261015'),None)
    assert model and model['url']==('models/'+FILE),'ERROR: incorrect epoch30 scene catalog'
    p=ROOT/'models'/FILE
    assert p.is_file(),'ERROR: expected epoch30 SPZ file is missing'
    assert p.stat().st_size==29254747,'ERROR: incorrect SPZ byte count'
    with p.open('rb') as handle: actual=hashlib.file_digest(handle,'sha256').hexdigest()
    assert actual==EXPECTED,'ERROR: incorrect epoch30 SPZ SHA-256'
    print('PINNED_MODEL = '+FILE,flush=True)
    print('MODEL_BYTES = '+str(p.stat().st_size),flush=True)
    print('SHA256_OK = '+actual,flush=True)
    print('OPEN_URL = '+URL,flush=True)
    try:
        server=ThreadingHTTPServer(('127.0.0.1',PORT),partial(Handler,directory=str(ROOT)))
    except OSError as e:
        print('PORT '+str(PORT)+' IS ALREADY IN USE: '+str(e),flush=True)
        print('No browser was opened. Close the old 8108 server and retry.',flush=True)
        return 2
    with server:
        threading.Timer(0.5,lambda:webbrowser.open(URL,new=2)).start()
        print('LISTENING = 127.0.0.1:'+str(PORT),flush=True)
        try:server.serve_forever()
        except KeyboardInterrupt:pass
        return 0

if __name__=='__main__':sys.exit(main())
