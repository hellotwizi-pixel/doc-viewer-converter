/**
 * polyfills — 구형 WebView(안드로이드 기기·태블릿에 깔린 오래된 Chrome) 대응.
 * pdf.js가 최신 표준 API를 그대로 쓰기 때문에, 없으면 PDF가 아예 열리지 않는다.
 * 어떤 모듈보다 먼저 평가되어야 하므로 main.ts의 첫 import로 둔다.
 */

type Resolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

// Promise.withResolvers — Chrome 119+. pdf.js가 내부 전반에서 사용한다.
const P = Promise as unknown as {
  withResolvers?: <T>() => Resolvers<T>;
};
if (typeof P.withResolvers !== "function") {
  P.withResolvers = function <T>(): Resolvers<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// structuredClone — Chrome 98+. pdf.js가 주석/필드 전달에 쓴다.
const w = globalThis as unknown as { structuredClone?: <T>(v: T) => T };
if (typeof w.structuredClone !== "function") {
  w.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

// Array.prototype.at / String.prototype.at — Chrome 92+
if (typeof Array.prototype.at !== "function") {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, "at", {
    value: function (this: unknown[], n: number) {
      const i = Math.trunc(n) || 0;
      return this[i < 0 ? this.length + i : i];
    },
    writable: true,
    configurable: true,
  });
}
if (typeof String.prototype.at !== "function") {
  Object.defineProperty(String.prototype, "at", {
    value: function (this: string, n: number) {
      const i = Math.trunc(n) || 0;
      return this[i < 0 ? this.length + i : i];
    },
    writable: true,
    configurable: true,
  });
}
