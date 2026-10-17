/** Proxy Vercel → Railway BE. Browser vẫn gọi /api/v1 và /media (same-site). */

const SKIP = new Set(["host", "connection", "content-length", "transfer-encoding"]);

function collect(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function proxyToBe(req, res, rewritePath) {
  const base = String(process.env.BE_ORIGIN || "").replace(/\/$/, "");
  if (!base) {
    res.status(500).json({ message: "BE_ORIGIN chưa đặt trên Vercel (URL Railway BE, không kèm /api/v1)" });
    return;
  }

  const incoming = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const path = rewritePath ? rewritePath(incoming.pathname) : incoming.pathname;
  const target = `${base}${path}${incoming.search}`;

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || SKIP.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(",") : value;
  }

  const init = { method: req.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(req.method || "GET")) {
    init.body = await collect(req);
  }

  const up = await fetch(target, init);
  res.status(up.status);
  const cookies = typeof up.headers.getSetCookie === "function" ? up.headers.getSetCookie() : [];
  up.headers.forEach((value, key) => {
    if (key === "transfer-encoding" || key === "content-encoding") return;
    if (key === "set-cookie") return;
    res.setHeader(key, value);
  });
  if (cookies.length) res.setHeader("set-cookie", cookies);
  res.send(Buffer.from(await up.arrayBuffer()));
}
