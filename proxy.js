/**
 * CORS 프록시 서버 (Node.js 내장 모듈만 사용)
 * 사용법: node proxy.js
 * 포트:   3001
 *
 * index.html에서 ECVAM / 생태자연도 WMS GetFeatureInfo를
 * CORS 제약 없이 조회하기 위한 로컬 프록시입니다.
 */

const http  = require('http');
const https = require('https');
const url   = require('url');

const PORT = 3001;

/* 허용된 대상 호스트 (보안) */
const ALLOWED_HOSTS = [
  'ecvam.neins.go.kr',
  'api.mcee.go.kr',
  'aid.mcee.go.kr'
];

http.createServer(function (req, res) {

  /* ── CORS Preflight ── */
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  /* ── 대상 URL 파싱 ── */
  const parsed    = url.parse(req.url, true);
  const targetUrl = decodeURIComponent(parsed.query.url || '');

  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing ?url= parameter');
    return;
  }

  const targetParsed = url.parse(targetUrl);

  if (!ALLOWED_HOSTS.includes(targetParsed.hostname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden host: ' + targetParsed.hostname);
    return;
  }

  /* ── 대상 서버에 요청 전달 ── */
  const isHttps = targetParsed.protocol === 'https:';
  const client  = isHttps ? https : http;

  const options = {
    hostname: targetParsed.hostname,
    port:     isHttps ? 443 : 80,
    path:     targetParsed.path,
    method:   'GET',
    headers:  {
      'User-Agent': 'Mozilla/5.0 (CORS-Proxy)',
      'Accept':     '*/*'
    },
    /* 자체 서명 인증서 허용 (정부 서버 일부) */
    rejectUnauthorized: false
  };

  const proxyReq = client.request(options, function (proxyRes) {
    const ct = proxyRes.headers['content-type'] || 'application/octet-stream';
    res.writeHead(proxyRes.statusCode, {
      'Content-Type':                ct,
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', function (e) {
    console.error('[Proxy Error]', e.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + e.message);
  });

  proxyReq.end();

}).listen(PORT, '127.0.0.1', function () {
  console.log('');
  console.log('┌─────────────────────────────────────────┐');
  console.log('│  🌿 CORS 프록시 서버 시작                    │');
  console.log('│  http://localhost:' + PORT + '                    │');
  console.log('│  Ctrl+C 로 종료                           │');
  console.log('└─────────────────────────────────────────┘');
  console.log('');
});
