/**
 * HostelHub Automated Load Testing Script (1,000 Requests)
 * Measures: Requests Per Second (RPS), Mean Latency (ms), Min/Max Latency, Success vs Failed.
 *
 * Usage:
 *   node scripts/load_test.js --url=http://localhost:8080/api/rooms/available --requests=1000 --concurrency=20
 */

import http from 'http';

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  acc[k] = v;
  return acc;
}, {});

const TARGET_URL = args.url || 'http://localhost:8080/api/rooms/available';
const TOTAL_REQUESTS = parseInt(args.requests || '1000', 10);
const CONCURRENCY = parseInt(args.concurrency || '20', 10);

console.log(`================================================================`);
console.log(` HOSTELHUB BENCHMARK LOAD TESTER`);
console.log(` Target URL       : ${TARGET_URL}`);
console.log(` Total Requests   : ${TOTAL_REQUESTS}`);
console.log(` Concurrency      : ${CONCURRENCY}`);
console.log(`================================================================`);

let completed = 0;
let successful = 0;
let failed = 0;
const latencies = [];
const instanceHits = {};

const parsedUrl = new URL(TARGET_URL);

function makeRequest() {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Connection': 'keep-alive',
          'User-Agent': 'HostelHub-LoadTest/1.0'
        },
        timeout: 4000
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          const duration = Date.now() - start;
          latencies.push(duration);

          const servedBy = res.headers['x-served-by'] || 'unknown';
          instanceHits[servedBy] = (instanceHits[servedBy] || 0) + 1;

          if (res.statusCode >= 200 && res.statusCode < 400) {
            successful++;
          } else {
            failed++;
          }
          completed++;
          resolve();
        });
      }
    );

    req.on('error', (err) => {
      const duration = Date.now() - start;
      latencies.push(duration);
      failed++;
      completed++;
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      failed++;
      completed++;
      resolve();
    });

    req.end();
  });
}

async function runWorker(totalForThisWorker) {
  for (let i = 0; i < totalForThisWorker; i++) {
    await makeRequest();
  }
}

async function startBenchmark() {
  const testStartTime = Date.now();
  const perWorker = Math.floor(TOTAL_REQUESTS / CONCURRENCY);
  const remainder = TOTAL_REQUESTS % CONCURRENCY;

  const workers = [];
  for (let c = 0; c < CONCURRENCY; c++) {
    const count = perWorker + (c === 0 ? remainder : 0);
    workers.push(runWorker(count));
  }

  await Promise.all(workers);
  const totalDurationMs = Date.now() - testStartTime;
  const totalDurationSec = totalDurationMs / 1000;

  latencies.sort((a, b) => a - b);
  const sumLatency = latencies.reduce((a, b) => a + b, 0);
  const meanLatency = (sumLatency / latencies.length).toFixed(2);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const rps = (TOTAL_REQUESTS / totalDurationSec).toFixed(2);

  console.log(`\n================ BENCHMARK RESULTS ================`);
  console.log(`Completed Requests : ${completed} / ${TOTAL_REQUESTS}`);
  console.log(`Successful (2xx)   : ${successful}`);
  console.log(`Failed (5xx/Err)   : ${failed}`);
  console.log(`Total Time Taken   : ${totalDurationSec.toFixed(3)} seconds`);
  console.log(`Throughput (RPS)   : ${rps} requests/sec`);
  console.log(`Average Latency    : ${meanLatency} ms`);
  console.log(`Median (P50)       : ${p50} ms`);
  console.log(`95th Percentile    : ${p95} ms`);
  console.log(`99th Percentile    : ${p99} ms`);
  console.log(`Min / Max Latency  : ${latencies[0]} ms / ${latencies[latencies.length - 1]} ms`);
  console.log(`--------------------------------------------------`);
  console.log(`Traffic Distribution Across Backend Instances:`);
  for (const [instance, count] of Object.entries(instanceHits)) {
    const percentage = ((count / completed) * 100).toFixed(1);
    console.log(`  • ${instance.padEnd(25)} : ${count} requests (${percentage}%)`);
  }
  console.log(`====================================================\n`);
}

startBenchmark();
