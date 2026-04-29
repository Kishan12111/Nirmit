export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fallbackData = {
  source: "phone",
  online: false,
  lat: null,
  lng: null,
  accuracy: null,
  alpha: 0,
  beta: 0,
  gamma: 0,
  motion: 0,
  sos: false,
  timestamp: 0
};

let latestPhoneData = { ...fallbackData };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
  "Cache-Control": "no-store"
};

function asFiniteNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizePayload(payload) {
  return {
    source: "phone",
    online: true,
    lat: payload.lat === null || payload.lat === undefined ? null : asFiniteNumber(payload.lat, null),
    lng: payload.lng === null || payload.lng === undefined ? null : asFiniteNumber(payload.lng, null),
    accuracy: payload.accuracy === null || payload.accuracy === undefined ? null : asFiniteNumber(payload.accuracy, null),
    alpha: asFiniteNumber(payload.alpha),
    beta: asFiniteNumber(payload.beta),
    gamma: asFiniteNumber(payload.gamma),
    motion: asFiniteNumber(payload.motion),
    sos: Boolean(payload.sos),
    timestamp: asFiniteNumber(payload.timestamp, Date.now())
  };
}

export async function GET() {
  const stale = latestPhoneData.timestamp && Date.now() - latestPhoneData.timestamp > 15000;

  return Response.json(
    {
      ...latestPhoneData,
      online: Boolean(latestPhoneData.online && !stale)
    },
    {
      headers: corsHeaders
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

export async function POST(request) {
  try {
    const payload = await request.json();
    latestPhoneData = normalizePayload(payload);

    return Response.json(
      {
        ok: true,
        data: latestPhoneData
      },
      {
        headers: corsHeaders
      }
    );
  } catch (error) {
    return Response.json({ ok: false, error: "Invalid phone data payload." }, { status: 400, headers: corsHeaders });
  }
}
