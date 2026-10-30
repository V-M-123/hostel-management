/**
 * HostelHub Local Cluster & Reverse Proxy Simulator
 *
 * Spawns 3 backend instances on ports 3001, 3002, and 3003,
 * and runs a reverse proxy on port 8080 with Round-Robin and Failover.
 *
 * Usage:
 *   node scripts/simulate_cluster.js
 */

import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.resolve(__dirname, '../backend/server.js');

const instances = [
  { id: 'hostel-backend-node1', port: 3001, process: null, alive: true },
  { id: 'hostel-backend-node2', port: 3002, process: null, alive: true },
  { id: 'hostel-backend-node3', port: 3003, process: null, alive: true }
];

console.log('====================================================');
console.log(' Starting HostelHub 3-Instance Backend Cluster...');
console.log('====================================================');

instances.forEach((inst) => {
  const env = {
    ...process.env,
    PORT: inst.port.toString(),
    INSTANCE_ID: inst.id
  };

  const child = spawn('node', [serverScript], { env, stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.on('data', (d) => {
    // print log lines
    const line = d.toString().trim();
    if (line.includes('Listening') || line.includes('[' + inst.id + ']')) {
      console.log(`[Cluster ${inst.id}] ${line}`);
    }
  });

  child.stderr.on('data', (d) => {
    console.error(`[Cluster ${inst.id} ERR] ${d.toString().trim()}`);
  });

  inst.process = child;
});

// Reverse Proxy on Port 8080 mimicking Nginx Load Balancer
let currentIndex = 0;
let failoverEnabled = true; // Simulates proxy_next_upstream

const proxyServer = http.createServer((req, res) => {
  if (req.url === '/lb-health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('HostelHub Load Balancer is healthy\n');
  }

  // Allow toggling failover via query param for demonstration
  if (req.url.startsWith('/toggle-failover')) {
    failoverEnabled = !failoverEnabled;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ failoverEnabled }));
  }

  attemptForward(req, res, 0);
});

function attemptForward(req, res, attemptCount) {
  if (attemptCount >= instances.length) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '502 Bad Gateway: All upstream backends unavailable' }));
  }

  const targetInstance = instances[currentIndex % instances.length];
  currentIndex++;

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: targetInstance.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${targetInstance.port}`,
        'x-forwarded-for': req.socket.remoteAddress
      },
      timeout: 4000
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'x-proxied-by': 'HostelHub-LoadBalancer-Port8080'
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      if (failoverEnabled && attemptCount < instances.length - 1) {
        attemptForward(req, res, attemptCount + 1);
      } else {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '502 Bad Gateway: Upstream connection failed' }));
      }
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      if (failoverEnabled && attemptCount < instances.length - 1) {
        attemptForward(req, res, attemptCount + 1);
      } else {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '504 Gateway Timeout' }));
      }
    }
  });

  req.pipe(proxyReq);
}

proxyServer.listen(8080, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(' HostelHub Load Balancer listening on http://localhost:8080');
  console.log(' Upstreams:');
  console.log('   - Instance 1: http://localhost:3001');
  console.log('   - Instance 2: http://localhost:3002');
  console.log('   - Instance 3: http://localhost:3003');
  console.log('====================================================');
});

// Graceful cleanup
process.on('SIGINT', () => {
  console.log('\nStopping cluster...');
  instances.forEach(inst => inst.process && inst.process.kill());
  proxyServer.close();
  process.exit(0);
});
