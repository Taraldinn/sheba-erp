#!/usr/bin/env python3
import json
import os
import sys
import tarfile
import base64
import time
import urllib.request
import urllib.error

MCP_URL = "https://app.funchole.dev/mcp"
AUTH_TOKEN = "fh_mcp_cvIt09UWBuGT_lIh8xyT7mjGawxxzRaCVzuW3bvrz9s"
FUNCTION_ID = "9e3f155c-d2e4-4d2b-bac7-e8bde13c5264"
VERSION_ID = "4d028dd6-42f5-43ff-ba66-38e4f829b436"

class McpClient:
    def __init__(self, url, token):
        self.url = url
        self.token = token
        self.session_id = None
        self.msg_id = 0
        self._init_session()

    def _init_session(self):
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream, application/json"
        }
        init_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "deploy-script", "version": "1.0"}
            }
        }
        req = urllib.request.Request(self.url, data=json.dumps(init_payload).encode('utf-8'), headers=headers)
        with urllib.request.urlopen(req) as resp:
            self.session_id = resp.headers.get("Mcp-Session-Id")
            print(f"[MCP] Initialized session: {self.session_id}")

    def call_tool(self, name, arguments):
        self.msg_id += 1
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream, application/json",
            "Mcp-Session-Id": self.session_id
        }
        payload = {
            "jsonrpc": "2.0",
            "id": self.msg_id,
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments
            }
        }
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode('utf-8'), headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read().decode('utf-8')
                for line in raw.split("\n"):
                    if line.startswith("data:"):
                        data_json = json.loads(line[5:].strip())
                        if "result" in data_json:
                            res = data_json["result"]
                            if "content" in res and len(res["content"]) > 0:
                                text = res["content"][0].get("text", "")
                                try:
                                    return json.loads(text)
                                except Exception:
                                    return text
                            return res
                        if "error" in data_json:
                            raise Exception(f"MCP error: {data_json['error']}")
                return raw
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8')
            raise Exception(f"HTTP {e.code}: {body}")

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    out_dir = os.path.join(repo_root, "sass-admin", "out")
    if not os.path.exists(out_dir):
        print(f"Error: out directory {out_dir} not found. Run npm run build first.")
        sys.exit(1)

    print("[1/5] Archiving static output...")
    tar_path = "/tmp/sass-admin-build.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        for root, dirs, files in os.walk(out_dir):
            for f in files:
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, out_dir)
                tar.add(full_path, arcname=rel_path)

    with open(tar_path, "rb") as f:
        tar_b64 = base64.b64encode(f.read()).decode("utf-8")
    print(f"Archive created: {len(tar_b64)} b64 chars")

    with open(os.path.join(out_dir, "index.html"), "r") as f:
        root_index_html = f.read()

    package_json = json.dumps({
        "name": "sass-admin-static",
        "private": True,
        "scripts": {
            "build": "node unpack.mjs"
        }
    }, indent=2)

    unpack_mjs = """import fs from 'node:fs';
import { execSync } from 'node:child_process';

console.log('Unpacking static bundle...');
const b64 = fs.readFileSync('bundle.b64', 'utf8').trim();
fs.writeFileSync('bundle.tar.gz', Buffer.from(b64, 'base64'));
fs.mkdirSync('dist', { recursive: true });
execSync('tar -xzf bundle.tar.gz -C dist');
const filesCount = fs.readdirSync('dist').length;
console.log(`Unpack complete! Root dist entries: ${filesCount}`);
"""

    files = [
        {"path": "package.json", "content": package_json},
        {"path": "unpack.mjs", "content": unpack_mjs},
        {"path": "bundle.b64", "content": tar_b64},
        {"path": "index.html", "content": root_index_html}
    ]

    print("[2/5] Connecting to FuncHole MCP...")
    client = McpClient(MCP_URL, AUTH_TOKEN)

    print(f"[3/5] Submitting source files to function {FUNCTION_ID} version {VERSION_ID}...")
    res = client.call_tool("submit_function_version_source", {
        "functionId": FUNCTION_ID,
        "versionId": VERSION_ID,
        "entrypoint": "package.json",
        "files": files
    })
    print("Submit response:", res)

    print(f"[4/5] Deploying version {VERSION_ID}...")
    dep_res = client.call_tool("deploy_function_version", {
        "functionId": FUNCTION_ID,
        "versionId": VERSION_ID
    })
    print("Deploy response:", dep_res)

    print("[5/5] Polling deployment status...")
    status = "UNKNOWN"
    for i in range(30):
        time.sleep(3)
        status_res = client.call_tool("get_function_version", {
            "functionId": FUNCTION_ID,
            "versionId": VERSION_ID
        })
        status = status_res.get("status") if isinstance(status_res, dict) else "UNKNOWN"
        print(f"[{i+1}/30] Version status: {status}")
        if status in ("READY", "FAILED"):
            break

    if status == "READY":
        print("Function version deployed successfully and is READY!")
    else:
        print(f"Function version ended with status: {status}")
        logs_res = client.call_tool("get_function_version_build_logs", {
            "functionId": FUNCTION_ID,
            "versionId": VERSION_ID
        })
        print("Build logs:", logs_res)

if __name__ == "__main__":
    main()
