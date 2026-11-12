#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
DIST="$PROJECT_DIR/dist"
META="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
mkdir -p "$DIST" "$META"
if [[ -f package.json ]]; then
  /usr/bin/time -p npm install --no-audit --no-fund
  if node -e "const p=require('./package.json');process.exit(p.scripts?.build?0:1)"; then
    /usr/bin/time -p npm run build
  else
    /usr/bin/time -p cp index.html "$DIST/index.html"
  fi
else
  /usr/bin/time -p cp index.html "$DIST/index.html"
fi
/usr/bin/time -p node -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({project:process.argv[2],directory:process.argv[3]}))' \
  "$META/deployment-output.json" "$PROJECT_DIR" "$DIST"
/usr/bin/time -p node -e '
const http=require("http"),fs=require("fs"),path=require("path");
const root=process.argv[1],port=Number(process.env.PORT||3000),mime={".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".png":"image/png",".jpg":"image/jpeg"};
http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname)}catch{res.writeHead(400).end();return}
let file=path.resolve(root,"."+pathname);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}try{if(fs.statSync(file).isDirectory())file=path.join(file,"index.html");res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");res.end(fs.readFileSync(file))}catch{res.writeHead(404).end("Not found")}}).listen(port,"0.0.0.0");
' "$DIST"
