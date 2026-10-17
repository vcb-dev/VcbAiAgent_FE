/** Vercel Edge: trình duyệt gọi /api/v1 (same-site), server chuyển sang Railway BE. */
export const config = {
  matcher: ["/api/v1/:path*", "/media/:path*"],
};

export default async function middleware(request) {
  const base = String(process.env.BE_ORIGIN || "").replace(/\/$/, "");
  if (!base) {
    return Response.json(
      { message: "BE_ORIGIN chưa đặt trên Vercel — dán URL Railway BE (https://….up.railway.app), không kèm /api/v1" },
      { status: 500 },
    );
  }

  const incoming = new URL(request.url);
  const target = `${base}${incoming.pathname}${incoming.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  // Edge fetch tự bung gzip; nếu còn header này thì trình duyệt bung lần nữa và axios fail dù HTTP 200.
  headers.delete("accept-encoding");

  const init = { method: request.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = request.body;
    init.duplex = "half";
  }

  const up = await fetch(target, init);
  const out = new Headers(up.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(up.body, { status: up.status, statusText: up.statusText, headers: out });
}
