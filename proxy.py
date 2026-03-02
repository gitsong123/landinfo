"""
CORS 프록시 서버 (Python 3 내장 모듈만 사용)
포트: 3001

ECVAM / 생태자연도 WMS GetFeatureInfo 를 CORS 제약 없이 조회하기 위한 로컬 프록시.
ECVAM은 세션 쿠키 기반 인증 → 시작 시 apiConfirm.do 로 세션 초기화.
"""
import http.server, urllib.request, urllib.parse, ssl, sys, http.cookiejar

PORT          = 3001
ALLOWED_HOSTS = {'ecvam.neins.go.kr', 'api.mcee.go.kr', 'aid.mcee.go.kr', 'api.forest.go.kr'}
ECVAM_APIKEY  = 'MUTW-PGHX-76CT-ENMD'

# 자체 서명 인증서 무시
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode    = ssl.CERT_NONE

# ── ECVAM 세션 관리 ──────────────────────────────────────────────
COOKIE_JAR = http.cookiejar.CookieJar()
OPENER = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(COOKIE_JAR),
    urllib.request.HTTPSHandler(context=SSL_CTX),
)

def init_ecvam_session():
    """서버 시작 시 ECVAM apiConfirm.do 를 호출해 세션 쿠키를 확보한다."""
    confirm_url = f'https://ecvam.neins.go.kr/apiConfirm.do?APIKEY={ECVAM_APIKEY}'
    try:
        req = urllib.request.Request(
            confirm_url,
            headers={'User-Agent': 'Mozilla/5.0 (CORS-Proxy)'}
        )
        with OPENER.open(req, timeout=10) as resp:
            resp.read()
        cookies = [c.name for c in COOKIE_JAR]
        print(f'[ECVAM] Session OK. Cookies: {cookies}')
    except Exception as e:
        print(f'[ECVAM] Session init failed: {e}')
    sys.stdout.flush()

# ── HTTP 핸들러 ──────────────────────────────────────────────────
class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[Proxy] {args[0] if args else ''}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        qs   = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        urls = qs.get('url', [])
        if not urls:
            self.send_response(400)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'Missing ?url= parameter')
            return

        target = urllib.parse.unquote(urls[0])
        parsed = urllib.parse.urlparse(target)

        if parsed.hostname not in ALLOWED_HOSTS:
            body = f'Forbidden: {parsed.hostname}'.encode()
            self.send_response(403)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
            return

        try:
            req = urllib.request.Request(
                target,
                headers={'User-Agent': 'Mozilla/5.0 (CORS-Proxy)'}
            )
            # ECVAM 요청은 세션 쿠키가 포함된 OPENER 사용
            if parsed.hostname == 'ecvam.neins.go.kr':
                resp_ctx = OPENER.open(req, timeout=10)
            elif parsed.scheme == 'https':
                resp_ctx = urllib.request.urlopen(req, context=SSL_CTX, timeout=10)
            else:
                resp_ctx = urllib.request.urlopen(req, timeout=10)

            with resp_ctx as resp:
                data = resp.read()
                ct   = resp.headers.get('Content-Type', 'application/octet-stream')

            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin',  '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Content-Type', ct)
            self.send_header('Content-Length', len(data))
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            body = f'Proxy error: {e}'.encode()
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)

if __name__ == '__main__':
    init_ecvam_session()
    srv = http.server.HTTPServer(('127.0.0.1', PORT), ProxyHandler)
    print(f'\nCORS Proxy running: http://localhost:{PORT}\n')
    sys.stdout.flush()
    srv.serve_forever()
