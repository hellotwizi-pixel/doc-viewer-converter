/**
 * pdf.js 워커에 구형 WebView 폴리필을 앞에 붙인다.
 * 워커는 별도 전역이라 메인 스레드의 폴리필(src/core/polyfills.ts)이 닿지 않는다.
 * 폴리필이 없으면 오래된 Chrome/WebView에서 PDF가 아예 열리지 않는다.
 *   - Promise.withResolvers : Chrome 119+
 *   - structuredClone       : Chrome 98+
 *   - Array/String#at       : Chrome 92+
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MARK = "/*baro-webview-polyfill*/";

const PREFIX = `${MARK}
(function(g){
  if (typeof g.Promise === "function" && typeof g.Promise.withResolvers !== "function") {
    g.Promise.withResolvers = function () {
      var res, rej;
      var p = new g.Promise(function (a, b) { res = a; rej = b; });
      return { promise: p, resolve: res, reject: rej };
    };
  }
  if (typeof g.structuredClone !== "function") {
    g.structuredClone = function (v) { return JSON.parse(JSON.stringify(v)); };
  }
  if (typeof Array.prototype.at !== "function") {
    Object.defineProperty(Array.prototype, "at", {
      value: function (n) { n = Math.trunc(n) || 0; return this[n < 0 ? this.length + n : n]; },
      writable: true, configurable: true
    });
  }
  if (typeof String.prototype.at !== "function") {
    Object.defineProperty(String.prototype, "at", {
      value: function (n) { n = Math.trunc(n) || 0; return this[n < 0 ? this.length + n : n]; },
      writable: true, configurable: true
    });
  }
})(typeof self !== "undefined" ? self : globalThis);
`;

const targets = ["dist/pdf.worker.mjs", "dist/pdf.worker.min.mjs"];
let patched = 0;

for (const file of targets) {
  if (!existsSync(file)) continue;
  const src = readFileSync(file, "utf8");
  if (src.startsWith(MARK)) continue; // 이미 적용됨
  writeFileSync(file, PREFIX + src);
  patched++;
}

console.log(`pdf worker 폴리필 적용: ${patched}개`);
