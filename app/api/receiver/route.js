export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawIp = searchParams.get("ip") || "";
  const cleaned = rawIp.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (!cleaned) {
    return Response.json({ error: "Missing ip query parameter." }, { status: 400 });
  }

  if (!/^[0-9a-zA-Z.:-]+$/.test(cleaned)) {
    return Response.json({ error: "Invalid ip format." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`http://${cleaned}/data`, { cache: "no-store" });
    if (!upstream.ok) {
      return Response.json({ error: `Upstream HTTP ${upstream.status}` }, { status: 502 });
    }

    const payload = await upstream.json();
    return Response.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return Response.json({ error: "Receiver fetch failed." }, { status: 502 });
  }
}
