// k6 load test for the search and autocomplete read paths.
//
//   BASE_URL=http://localhost:3000/api k6 run ops/loadtest/search.js
//
// Reads are public, so no API key is needed. The thresholds fail the run if the
// error rate or p95 latency regress, which makes this usable as a CI gate too.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:3000/api';
const TERMS = ['laptop', 'phone', 'camera', 'headphones', 'watch', 'tablet', 'speaker'];

function term() {
  return TERMS[Math.floor(Math.random() * TERMS.length)];
}

export const options = {
  scenarios: {
    search: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '1m', target: 25 },
        { duration: '30s', target: 0 },
      ],
      exec: 'search',
    },
    autocomplete: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m',
      exec: 'autocomplete',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:search}': ['p(95)<500'],
    'http_req_duration{scenario:autocomplete}': ['p(95)<200'],
  },
};

export function search() {
  const res = http.get(`${BASE}/products/search?q=${term()}&pageSize=20`);
  check(res, { 'search 200': (r) => r.status === 200 });
  sleep(1);
}

export function autocomplete() {
  const prefix = term().slice(0, 3);
  const res = http.get(`${BASE}/products/autocomplete?q=${prefix}`);
  check(res, { 'autocomplete 200': (r) => r.status === 200 });
  sleep(0.5);
}
