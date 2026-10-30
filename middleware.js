/** Vercel Edge: trình duyệt gọi cùng origin → cookie SameSite=Strict. Server chuyển sang Railway BE. */
export const config = {
  matcher: ["/api/:path*", "/media/:path*", "/web/:path*", "/wv/:path*", "/__login"],
};

export default async function middleware(request) {
  const base = String(process.env.BE_ORIGIN || "").replace(/\/$/, "");
  if (!base) {
    return Response.json(
      { message: "BE_ORIGIN chưa đặt trên Vercel — URL Railway BE, không kèm /api" },
      { status: 500 },
    );
  }

  const incoming = new URL(request.url);
  const target = `${base}${incoming.pathname}${incoming.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
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
