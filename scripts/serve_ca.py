import http.server, socketserver, pathlib, sys

CA = pathlib.Path(sys.argv[1]).read_bytes()

PAGE = b"""<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>ink - install CA</title>
<style>body{font:17px -apple-system,sans-serif;margin:0;padding:40px 24px;line-height:1.6;color:#22251f;background:#f6f5ef}
h1{font-size:24px}a.btn{display:block;margin:28px 0;padding:18px;background:#344337;color:#fff;
border-radius:10px;text-align:center;text-decoration:none;font-weight:600}
ol{padding-left:22px}li{margin:10px 0}code{background:#e9e8e0;padding:2px 6px;border-radius:4px;font-size:15px}</style>
</head><body>
<h1>ink - local certificate</h1>
<a class=btn href="/ink-local-ca.crt">1. Download the certificate</a>
<ol>
<li>Tap <b>Allow</b> when asked to download a configuration profile.</li>
<li>Open <b>Settings</b> - a <b>Profile Downloaded</b> item appears near the top. Tap it, then <b>Install</b> (top right) and enter your passcode.</li>
<li>Go to <b>Settings &gt; General &gt; About &gt; Certificate Trust Settings</b>.</li>
<li>Turn <b>ON</b> the switch next to <b>ink local dev CA</b>.</li>
<li>Open <code>https://192.168.1.112:3000/tablet</code></li>
</ol>
<p>Step 4 is required. Installing the profile alone is not enough.</p>
</body></html>"""

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('.crt'):
            body, ctype = CA, 'application/x-x509-ca-cert'
            extra = [('Content-Disposition', 'attachment; filename="ink-local-ca.crt"')]
        else:
            body, ctype, extra = PAGE, 'text/html; charset=utf-8', []
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        for k, v in extra: self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", 8080), H) as httpd:
    httpd.serve_forever()
