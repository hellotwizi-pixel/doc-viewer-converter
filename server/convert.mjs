/**
 * convert — 문서(PPTX/HWP/DOC/PPT 등) → PDF 변환 HTTP 서비스.
 * LibreOffice headless(`soffice --convert-to pdf`)로 원본 충실도를 살린다.
 * POST /convert  (body = 파일 바이트, 헤더 X-Filename = 원본 파일명)  → PDF 바이트
 * GET  /health   → ok
 *
 * 프라이버시: 변환 후 임시파일 즉시 삭제. 로그에 내용 남기지 않음.
 */
import http from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";

const PORT = process.env.PORT || 8787;
const SOFFICE =
  process.env.SOFFICE_BIN ||
  ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "/usr/bin/soffice", "/usr/bin/libreoffice"].find(
    (p) => existsSync(p)
  ) ||
  "soffice";
const MAX_BYTES = 60 * 1024 * 1024;
const ALLOWED = new Set([".pptx", ".ppt", ".hwp", ".hwpx", ".doc", ".docx", ".xlsx", ".xls"]);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Filename");
}

function convert(inputPath, outDir) {
  const profile = `file://${join(outDir, "lo-profile")}`;
  return new Promise((resolve, reject) => {
    execFile(
      SOFFICE,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=${profile}`,
        "--convert-to",
        "pdf",
        "--outdir",
        outDir,
        inputPath,
      ],
      { timeout: 120000 },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))
    );
  });
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  if (req.method === "GET" && req.url === "/health") return res.writeHead(200).end("ok");
  if (req.method !== "POST" || req.url !== "/convert") return res.writeHead(404).end("not found");

  const name = (req.headers["x-filename"] || "doc").toString();
  const ext = extname(name).toLowerCase();
  if (!ALLOWED.has(ext)) return res.writeHead(415).end("unsupported type");

  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BYTES) {
      res.writeHead(413).end("too large");
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", async () => {
    if (!chunks.length) return res.writeHead(400).end("empty");
    const dir = mkdtempSync(join(tmpdir(), "conv-"));
    const inPath = join(dir, `in-${randomUUID()}${ext}`);
    try {
      writeFileSync(inPath, Buffer.concat(chunks));
      await convert(inPath, dir);
      const pdfPath = inPath.replace(new RegExp(`${ext}$`), ".pdf");
      const pdf = readFileSync(pdfPath);
      res.writeHead(200, { "Content-Type": "application/pdf" });
      res.end(pdf);
    } catch (e) {
      res.writeHead(500).end("convert failed");
      console.error("convert error:", (e && e.message) || e);
    } finally {
      rmSync(dir, { recursive: true, force: true }); // 원본·결과 즉시 삭제(프라이버시)
    }
  });
});

server.listen(PORT, () => console.log(`convert server on :${PORT} (soffice=${SOFFICE})`));
