"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_ROUTE_POINTS = 180;
const MAX_DEPTH_POINTS = 180;
const MIN_ROUTE_MOVE_METERS = 0.2;
const MIN_TUNNEL_TILT_DEG = 1.0;
const FALLBACK_STEP_METERS = 0.6;
const BETA_SMOOTHING = 0.2;
const POSITION_SMOOTHING = 0.35;
const MAX_SPEED_MPS = 2.5;
const MAX_JUMP_METERS = 8;
const STATIONARY_RADIUS_METERS = 2;
const STATIONARY_HOLD_MS = 4000;
const GPS_ACCURACY_LIMIT = 12;
const TILT_STRONG_DEG = 8;
const TILT_STABLE_MS = 1200;
const TELEMETRY_INTERVAL_MS = 300;
const DEPTH_LIMIT = 100;
const DEFAULT_IP = "192.168.1.45";

const initialTelemetry = {
  gasPpm: 0,
  temperatureC: 0,
  humidityPct: 0,
  heartRate: 72,
  lat: null,
  lng: null,
  gpsAccuracy: null,
  alpha: 0,
  beta: 0,
  gamma: 0,
  motion: 0,
  sos: false,
  online: false,
  sleepMode: false,
  timestamp: 0
};

const gaugeRanges = {
  gas: { max: 1200, warning: 900, danger: 1100, unit: "ppm" },
  temperature: { max: 60, warning: 38, danger: 42, unit: "°C" },
  humidity: { max: 100, warning: 70, danger: 90, unit: "%" },
  heartRate: { max: 150, warning: 105, danger: 120, unit: "bpm" }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeGas(rawValue) {
  if (!Number.isFinite(rawValue)) return 0;
  // If the sender reports a 0-4000 range, scale it down (e.g. 2500 -> 500).
  return rawValue > 1500 ? Math.round(rawValue * 0.2) : Math.round(rawValue);
}

function distanceMeters(a, b) {
  if (!a || !b) {
    return 0;
  }

  const earthRadius = 6371000;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function latLngToOffsetMeters(origin, point) {
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos((origin[0] * Math.PI) / 180);

  return {
    north: (point[0] - origin[0]) * metersPerLat,
    east: (point[1] - origin[1]) * metersPerLng
  };
}

function formatPoint(lat, lng) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function getTone(telemetry) {
  if (telemetry.sos || telemetry.gasPpm >= gaugeRanges.gas.danger || telemetry.temperatureC >= gaugeRanges.temperature.danger || telemetry.heartRate >= gaugeRanges.heartRate.danger) {
    return "danger";
  }

  if (telemetry.gasPpm >= gaugeRanges.gas.warning || telemetry.temperatureC >= gaugeRanges.temperature.warning || telemetry.heartRate >= gaugeRanges.heartRate.warning) {
    return "warning";
  }

  return "safe";
}

function getStatusLabel(value, range) {
  if (value >= range.danger) return "DANGER";
  if (value >= range.warning) return "WARN";
  return "SAFE";
}

function svgArcPath(percentage) {
  const radius = 78;
  const centerX = 100;
  const centerY = 100;
  const startAngle = 225;
  const endAngle = 225 + 270 * percentage;
  const start = polarToPoint(centerX, centerY, radius, endAngle);
  const end = polarToPoint(centerX, centerY, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;

  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function polarToPoint(cx, cy, radius, angleDeg) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

function GaugeCard({ title, value, unit, range, gradientId, statusClassName = "" }) {
  const percentage = clamp(value / range.max, 0, 1);
  const status = getStatusLabel(value, range);
  const fillPath = svgArcPath(percentage);

  return (
    <article className="glass-card gauge-card">
      <div className="card-label">{title}</div>
      <svg viewBox="0 0 200 180" className="gauge-svg" aria-label={`${title} gauge`} role="img">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {title === "Humidity" ? (
              <>
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0ea5e9" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="50%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#ef4444" />
              </>
            )}
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="82" className="gauge-track" />
        <path d={fillPath} className="gauge-fill" style={{ stroke: `url(#${gradientId})` }} />
        <circle cx="100" cy="100" r="64" className="gauge-core" />
        <text x="100" y="92" textAnchor="middle" className="gauge-value">
          {Number(value).toFixed(range === gaugeRanges.temperature ? 1 : 0)}
        </text>
        <text x="100" y="112" textAnchor="middle" className="gauge-unit">
          {unit}
        </text>
        <text x="100" y="146" textAnchor="middle" className={`gauge-status ${statusClassName || status.toLowerCase()}`}>
          {status}
        </text>
      </svg>
    </article>
  );
}

function MapPanel({ telemetry, routePoints, routeDistance, routeStatus, onResetRoute }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const markersRef = useRef({ map: null, start: null, current: null, sos: null, route: null });
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.L || !containerRef.current || mapRef.current) {
      return;
    }

    const L = window.L;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true
    }).setView([12.9716, 77.5946], 17);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    markersRef.current = {
      map,
      start: null,
      current: null,
      sos: null,
      route: L.polyline([], {
        color: "#67e8f9",
        weight: 5,
        opacity: 0.85,
        lineJoin: "round",
        lineCap: "round"
      }).addTo(map)
    };

    // ensure leaflet calculates sizes correctly when mounted
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 250);

    // invalidate on container resize
    if (window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver(() => map.invalidateSize());
      resizeObserverRef.current.observe(containerRef.current);
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;

    if (!map || !L || !telemetry.lat || !telemetry.lng) {
      return;
    }

    const currentPoint = [telemetry.lat, telemetry.lng];
    const startPoint = routePoints[0] || currentPoint;
    const icons = {
      person: L.divIcon({ className: "map-marker person-marker", html: "<div class='person-dot'></div>", iconSize: [44, 44], iconAnchor: [22, 22] }),
      start: L.divIcon({ className: "map-marker start-marker", html: "<div class='start-dot'>S</div>", iconSize: [34, 34], iconAnchor: [17, 17] }),
      sos: L.divIcon({ className: "map-marker sos-marker", html: "<div class='sos-dot'>SOS</div>", iconSize: [56, 56], iconAnchor: [28, 28] })
    };

    if (!markersRef.current.start) {
      markersRef.current.start = L.marker(startPoint, { icon: icons.start }).addTo(map);
    } else {
      markersRef.current.start.setLatLng(startPoint);
    }

    if (!markersRef.current.current) {
      markersRef.current.current = L.marker(currentPoint, { icon: icons.person }).addTo(map);
    } else {
      markersRef.current.current.setLatLng(currentPoint);
    }

    if (telemetry.sos) {
      if (!markersRef.current.sos) {
        markersRef.current.sos = L.marker(currentPoint, { icon: icons.sos }).addTo(map);
      } else {
        markersRef.current.sos.setLatLng(currentPoint);
      }
    } else if (markersRef.current.sos) {
      map.removeLayer(markersRef.current.sos);
      markersRef.current.sos = null;
    }

        if (routePoints.length > 0) {
      markersRef.current.route.setLatLngs(routePoints);
    }

    if (routePoints.length > 1) {
      map.panTo(currentPoint, {
        animate: true,
        duration: 0.6
      });
    } else {
      map.setView(currentPoint, map.getZoom(), { animate: true });
    }
    // sometimes leaflet needs a nudge when container is visible
    setTimeout(() => map.invalidateSize(), 120);
  }, [telemetry.lat, telemetry.lng, telemetry.sos, routePoints]);

  return (
    <article className="glass-card map-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">GPS route tracking</p>
          <h2>Live route map</h2>
        </div>
        <div className="chip-row">
          <span className="chip">{routeStatus}</span>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map && telemetry.lat !== null && telemetry.lng !== null) {
                map.setView([telemetry.lat, telemetry.lng], 17, { animate: true });
              }
            }}
            title="Center on user"
          >
            Center
          </button>
          <button className="ghost-button" type="button" onClick={onResetRoute}>
            Reset route
          </button>
        </div>
      </div>

      <div className="map-grid">
        <div className="map-frame" ref={containerRef} />
        <div className="map-meta">
          <div>
            <span>Start</span>
            <strong>{routePoints[0] ? formatPoint(routePoints[0][0], routePoints[0][1]) : "Waiting for GPS"}</strong>
          </div>
          <div>
            <span>Current</span>
            <strong>{telemetry.lat !== null && telemetry.lng !== null ? formatPoint(telemetry.lat, telemetry.lng) : "Waiting for GPS"}</strong>
          </div>
          <div>
            <span>Distance</span>
            <strong>{routeDistance >= 1000 ? `${(routeDistance / 1000).toFixed(2)} km` : `${routeDistance.toFixed(0)} m`}</strong>
          </div>
          <div>
            <span>SOS</span>
            <strong>{telemetry.sos ? "Active" : "Clear"}</strong>
          </div>
        </div>
      </div>
    </article>
  );
}

function TunnelPanel({ telemetry, routePoints, depthTrail, depthDistance, onResetTunnel, onCalibrate }) {
  const latest = depthTrail.at(-1) || { distance: 0, depth: 0, north: 0, east: 0 };
  const prev = depthTrail.at(-2) || latest;
  const depthTrend = latest.depth - prev.depth;
  const distanceTrend = latest.distance - prev.distance;
  const positionText = `${latest.north >= 0 ? `N ${Math.abs(latest.north).toFixed(1)} m` : `S ${Math.abs(latest.north).toFixed(1)} m`}, ${latest.east >= 0 ? `E ${Math.abs(latest.east).toFixed(1)} m` : `W ${Math.abs(latest.east).toFixed(1)} m`}`;
  const startPoint = routePoints[0];
  const endPoint = routePoints.at(-1);
  const startDepth = depthTrail[0] || latest;
  const minDepth = depthTrail.reduce((min, point) => Math.min(min, point.depth), 0);
  const maxDepth = depthTrail.reduce((max, point) => Math.max(max, point.depth), 0);
  const depthSpan = Math.max(20, Math.abs(maxDepth) + Math.abs(minDepth));
  const routeWidth = 694;
  const routeLeft = 148;
  const routeTop = 124;
  const routeBottom = 314;

  const depthLinePoints = depthTrail
    .map((point) => {
      const x = routeLeft + (point.distance / Math.max(20, depthDistance || 20)) * routeWidth;
      const normalizedDepth = (point.depth - minDepth) / depthSpan;
      const y = routeTop + normalizedDepth * (routeBottom - routeTop);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const directionLinePoints = depthTrail
    .map((point) => {
      const x = routeLeft + (point.distance / Math.max(20, depthDistance || 20)) * routeWidth;
      const normalizedDepth = (point.depth - minDepth) / depthSpan;
      const y = routeTop + normalizedDepth * (routeBottom - routeTop) - point.east * 0.12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const fillPath = depthTrail.length
    ? `M ${routeLeft},${routeTop} L ${depthLinePoints.replaceAll(" ", " L ")} L ${routeLeft + (latest.distance / Math.max(20, depthDistance || 20)) * routeWidth},${routeTop} Z`
    : "";

  const isBackAtStart = routePoints.length > 1 && routePoints[0] && routePoints.at(-1) && distanceMeters(routePoints[0], routePoints.at(-1)) < 10;
  const directionLabel = isBackAtStart ? "Returning" : distanceTrend < -0.5 ? "Returning" : depthTrend < -0.4 ? "Descending" : depthTrend > 0.4 ? "Ascending" : "Stable";

  return (
    <article className="glass-card tunnel-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Tunnel profile</p>
          <h2>Depth and direction</h2>
        </div>
        <div className="chip-row">
          <span className="chip neon">{isBackAtStart ? "Back at start" : `Depth ${Math.abs(latest.depth).toFixed(1)} m`}</span>
          <button className="ghost-button" type="button" onClick={onCalibrate}>
            Calibrate
          </button>
          <button className="ghost-button" type="button" onClick={onResetTunnel}>
            Reset
          </button>
        </div>
      </div>

      <div className="tunnel-layout">
        <svg viewBox="0 0 900 360" className="tunnel-svg" role="img" aria-label="Tunnel route profile">
          <defs>
            <linearGradient id="tunnelSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#101b33" />
              <stop offset="100%" stopColor="#050b17" />
            </linearGradient>
            <linearGradient id="tunnelEarth" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8dd3ff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="routeGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#facc15" />
            </linearGradient>
            <pattern id="gridPattern" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect x="0" y="0" width="900" height="360" fill="url(#tunnelSky)" />
          <path d="M0,112 C120,56 170,132 272,90 C376,46 442,118 548,86 C648,56 726,110 832,74 C860,64 882,66 900,60 L900,136 L0,136 Z" fill="rgba(255,255,255,0.06)" />
          <path d="M0,128 C110,160 204,124 296,150 C392,176 470,136 576,158 C676,178 764,146 900,160 L900,360 L0,360 Z" fill="url(#tunnelEarth)" />
          <rect x="0" y="126" width="900" height="234" fill="url(#gridPattern)" opacity="0.6" />

          <line x1="56" y1="126" x2="56" y2="314" className="depth-axis" />
          <line x1="50" y1="126" x2="62" y2="126" className="depth-tick" />
          <line x1="50" y1="216" x2="62" y2="216" className="depth-tick" />
          <line x1="50" y1="314" x2="62" y2="314" className="depth-tick" />
          <text x="72" y="132" className="depth-label">
            0m
          </text>
          <text x="72" y="220" className="depth-label">
            -50m
          </text>
          <text x="72" y="318" className="depth-label">
            -100m
          </text>

          <line x1="148" y1="324" x2="842" y2="324" className="depth-axis" />
          <text x="468" y="348" className="depth-label">
            Distance travelled + route direction
          </text>

          <path d={fillPath} className="depth-fill" />
          <polyline points={depthLinePoints} className="depth-line" />
          <polyline points={directionLinePoints} className="direction-line" />

          <g transform={`translate(${routeLeft + (latest.distance / Math.max(20, depthDistance || 20)) * routeWidth}, ${routeTop + ((latest.depth - minDepth) / depthSpan) * (routeBottom - routeTop)})`}>
            <circle cx="0" cy="0" r="10" className="depth-person" />
            <path
              d="M -6 -14 L 6 -14 L 0 -24 Z"
              fill="#22d3ee"
              transform={`rotate(${directionLabel === "Descending" ? 180 : directionLabel === "Returning" ? 90 : 0})`}
            />
          </g>
          <circle cx={routeLeft} cy={routeTop} r="7" className="depth-start" />

          <g className="scale-group" transform={`translate(${routeLeft - 2}, ${routeTop - 22})`}>
            <line x1="0" y1="0" x2="100" y2="0" />
            <line x1="0" y1="-6" x2="0" y2="6" />
            <line x1="100" y1="-6" x2="100" y2="6" />
            <text x="32" y="-8">
              10 m
            </text>
          </g>

          <g className="depth-label-group">
            {depthTrail
              .map((point, index) => ({ ...point, index }))
              .filter((point, index) => index === 0 || index === depthTrail.length - 1 || index % 8 === 0)
              .slice(-5)
              .map((point) => {
                const x = routeLeft + (point.distance / Math.max(20, depthDistance || 20)) * routeWidth;
                const normalizedDepth = (point.depth - minDepth) / depthSpan;
                const y = routeTop + normalizedDepth * (routeBottom - routeTop);
                const label = point.index === depthTrail.length - 1 ? "Current" : `${point.distance.toFixed(0)}m`;

                return (
                  <g key={`${point.distance}-${point.depth}`}>
                    <line x1={x} y1={y} x2={x} y2={y - 28} className="depth-callout" />
                    <circle cx={x} cy={y} r="4" className="depth-dot" />
                    <text x={x + 8} y={y - 32} className="depth-small-label">
                      {label}
                    </text>
                  </g>
                );
              })}
          </g>
        </svg>

        <aside className="tunnel-side">
          <div className="info-card glowing-card">
            <span>Total distance</span>
            <strong>{depthDistance >= 1000 ? `${(depthDistance / 1000).toFixed(2)} km` : `${depthDistance.toFixed(1)} m`}</strong>
          </div>

          <div className="info-card glowing-card">
            <span>Start point</span>
            <strong>{startPoint ? formatPoint(startPoint[0], startPoint[1]) : "Waiting for GPS"}</strong>
          </div>

          <div className="info-card glowing-card">
            <span>End point</span>
            <strong>{endPoint ? formatPoint(endPoint[0], endPoint[1]) : "Waiting for GPS"}</strong>
          </div>

          <div className="info-card glowing-card">
            <span>Current depth</span>
            <strong>{latest.depth < 0 ? `${Math.abs(latest.depth).toFixed(1)} m below surface` : `${latest.depth.toFixed(1)} m above surface`}</strong>
          </div>

          <div className="info-card glowing-card">
            <span>Relative position</span>
            <strong>{positionText}</strong>
          </div>

          <div className="info-card glowing-card">
            <span>Direction</span>
            <strong>{directionLabel}</strong>
          </div>

          <div className="history-card">
            <div className="history-title">Direction steps</div>
            <div className="history-metrics">
              <div>
                <span>North/South</span>
                <strong>{latest.north >= 0 ? "North" : "South"} {Math.abs(latest.north).toFixed(1)} m</strong>
              </div>
              <div>
                <span>East/West</span>
                <strong>{latest.east >= 0 ? "East" : "West"} {Math.abs(latest.east).toFixed(1)} m</strong>
              </div>
              <div>
                <span>Steps tracked</span>
                <strong>{depthTrail.length}</strong>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [espIp, setEspIp] = useState(DEFAULT_IP);
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [routePoints, setRoutePoints] = useState([]);
  const [depthTrail, setDepthTrail] = useState([{ distance: 0, depth: 0, north: 0, east: 0 }]);
  const [receiverStatus, setReceiverStatus] = useState("Waiting for receiver...");
  const [statusTone, setStatusTone] = useState("idle");
  const [debugInfo, setDebugInfo] = useState({ ip: "", receiver: null, phone: null, updatedAt: 0, receiverError: null, phoneError: null });
  const [lightTheme, setLightTheme] = useState(() => !!(typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem('helmet-light-theme') === '1'));
  const [sosCountdown, setSosCountdown] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [callHold, setCallHold] = useState(false);
  const emergencyContact = { name: "Emergency Contact", number: "+91 98765 43210" };

  const routePointsRef = useRef([]);
  const depthTrailRef = useRef([{ distance: 0, depth: 0, north: 0, east: 0 }]);
  const calibrationRef = useRef({ beta: 0, gamma: 0, motion: 9.81 });
  const latestTelemetryRef = useRef(initialTelemetry);
  const lastSuccessRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const filteredBetaRef = useRef(0);
  const filteredPointRef = useRef(null);
  const lastPointTimeRef = useRef(0);
  const stationaryAnchorRef = useRef(null);
  const stationarySinceRef = useRef(0);
  const tiltStrongSinceRef = useRef(0);

  useEffect(() => {
    let nextIp = "";
    try {
      const params = new URLSearchParams(window.location.search);
      const receiverParam = params.get("receiver") || "";
      nextIp = receiverParam.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    } catch (error) {
      nextIp = "";
    }

    if (nextIp) {
      setEspIp(nextIp);
      localStorage.setItem("helmetReceiverEspIp", nextIp);
    } else {
      const savedIp = localStorage.getItem("helmetReceiverEspIp");
      if (savedIp) {
        setEspIp(savedIp);
      }
    }
    // apply theme class early
    if (typeof document !== 'undefined') {
      if (lightTheme) document.documentElement.classList.add('light-theme');
      else document.documentElement.classList.remove('light-theme');
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (lightTheme) document.documentElement.classList.add('light-theme');
      else document.documentElement.classList.remove('light-theme');
    }
    try {
      localStorage.setItem('helmet-light-theme', lightTheme ? '1' : '0');
    } catch (e) {}
  }, [lightTheme]);

  useEffect(() => {
    latestTelemetryRef.current = telemetry;
    setStatusTone(getTone(telemetry));
  }, [telemetry]);

  useEffect(() => {
    if (telemetry.sos) {
      if (!sosActive && sosCountdown === null && !isCalling && !callHold) {
        setSosActive(true);
        setSosCountdown(10);
      }
    } else if (!callHold && !isCalling) {
      setSosActive(false);
      setSosCountdown(null);
    }
  }, [telemetry.sos, sosActive, sosCountdown, isCalling, callHold]);

  useEffect(() => {
    if (sosCountdown === null) return;
    if (sosCountdown <= 0) {
      setSosCountdown(null);
      setIsCalling(true);
      setCallHold(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setSosCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [sosCountdown]);


  useEffect(() => {
    const timer = window.setInterval(async () => {
      const now = Date.now();
      let phonePayload = null;
      let receiverPayload = null;
      let phoneError = null;
      let receiverError = null;
      let phoneOnline = false;
      let receiverOnline = false;
      let receiverSleep = false;

      try {
        const response = await fetch("/api/phone-data", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        phonePayload = await response.json();
        phoneOnline = Boolean(phonePayload.online);
      } catch (error) {
        phonePayload = null;
        phoneError = "phone-data fetch failed";
      }

      if (espIp) {
        try {
          const response = await fetch(`/api/receiver?ip=${encodeURIComponent(espIp)}`, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          receiverPayload = await response.json();
          receiverOnline = Boolean(receiverPayload.online);
          receiverSleep = Boolean(receiverPayload.sleepMode);
        } catch (error) {
          receiverPayload = null;
          receiverError = "receiver fetch failed";
        }
      }

      if (phonePayload || receiverPayload) {
        hasConnectedRef.current = true;
        lastSuccessRef.current = now;
      }

      const currentTelemetry = latestTelemetryRef.current;
      let nextTelemetry = { ...currentTelemetry };

      if (receiverPayload) {
        nextTelemetry = {
          ...nextTelemetry,
          gasPpm: normalizeGas(Number(receiverPayload.gasPpm ?? 0)),
          temperatureC: Number(receiverPayload.temperatureC ?? 0),
          humidityPct: Number(receiverPayload.humidityPct ?? 0),
          heartRate: Number(receiverPayload.heartRate ?? 72),
          online: receiverOnline,
          sleepMode: receiverSleep
        };
      }

      if (phonePayload) {
        nextTelemetry = {
          ...nextTelemetry,
          lat: phonePayload.lat === null || phonePayload.lat === undefined ? null : Number(phonePayload.lat),
          lng: phonePayload.lng === null || phonePayload.lng === undefined ? null : Number(phonePayload.lng),
          gpsAccuracy: phonePayload.accuracy === null || phonePayload.accuracy === undefined ? null : Number(phonePayload.accuracy),
          alpha: Number(phonePayload.alpha ?? 0),
          beta: Number(phonePayload.beta ?? 0),
          gamma: Number(phonePayload.gamma ?? 0),
          motion: Number(phonePayload.motion ?? 0),
          sos: Boolean(phonePayload.sos)
        };
      }

      if (phonePayload || receiverPayload) {
        nextTelemetry.timestamp = now;
      }

      setDebugInfo({
        ip: espIp,
        receiver: receiverPayload,
        phone: phonePayload,
        updatedAt: now,
        receiverError,
        phoneError
      });

      setTelemetry(nextTelemetry);
      latestTelemetryRef.current = nextTelemetry;

      if (receiverSleep) {
        setReceiverStatus("Energy saver mode (sender asleep)");
      } else if (phoneOnline && receiverOnline) {
        setReceiverStatus("Phone + receiver online");
      } else if (phoneOnline && !receiverOnline) {
        setReceiverStatus("Phone online, receiver offline");
      } else if (!phoneOnline && receiverOnline) {
        setReceiverStatus("Receiver online, phone offline");
      } else if (!hasConnectedRef.current) {
        setReceiverStatus("Waiting for phone/receiver data...");
      } else if (now - lastSuccessRef.current >= 15000) {
        setReceiverStatus("Phone/receiver data stale");
      } else {
        setReceiverStatus("Phone/receiver offline");
      }

      if (nextTelemetry.lat !== null && nextTelemetry.lng !== null) {
        const accuracy = nextTelemetry.gpsAccuracy;
        const accuracyOk = Number.isFinite(accuracy) ? accuracy <= GPS_ACCURACY_LIMIT : true;
        if (!accuracyOk) {
          return;
        }
        const nowMs = now;
        const currentRoute = routePointsRef.current;
        const lastPoint = currentRoute.at(-1) || null;
        const lastPointTime = lastPointTimeRef.current || nowMs;
        const dtSeconds = Math.max(0.1, (nowMs - lastPointTime) / 1000);

        let point = [nextTelemetry.lat, nextTelemetry.lng];
        if (filteredPointRef.current) {
          const [prevLat, prevLng] = filteredPointRef.current;
          point = [
            prevLat + (point[0] - prevLat) * POSITION_SMOOTHING,
            prevLng + (point[1] - prevLng) * POSITION_SMOOTHING
          ];
        }

        const gpsStep = lastPoint ? distanceMeters(lastPoint, point) : 0;
        const maxStep = Math.max(MAX_JUMP_METERS, MAX_SPEED_MPS * dtSeconds);
        const accuracyBuffer = Number.isFinite(accuracy) ? Math.max(accuracy, MIN_ROUTE_MOVE_METERS) : MIN_ROUTE_MOVE_METERS;
        const movedEnough = !lastPoint || (gpsStep >= accuracyBuffer && gpsStep <= maxStep);

        if (!lastPoint || movedEnough) {
          filteredPointRef.current = point;
        }

        const betaOffsetRaw = filteredBetaRef.current - calibrationRef.current.beta;
        const tiltActiveRaw = Math.abs(betaOffsetRaw) >= MIN_TUNNEL_TILT_DEG;
        const anchor = stationaryAnchorRef.current || point;
        const anchorDistance = distanceMeters(anchor, point);

        if (!tiltActiveRaw && anchorDistance <= STATIONARY_RADIUS_METERS) {
          if (!stationarySinceRef.current) {
            stationarySinceRef.current = nowMs;
          }
          if (nowMs - stationarySinceRef.current >= STATIONARY_HOLD_MS) {
            point = anchor;
          }
        } else {
          stationarySinceRef.current = 0;
          stationaryAnchorRef.current = point;
        }

        if (movedEnough || currentRoute.length === 0) {
          const nextRoute = [...currentRoute, point].slice(-MAX_ROUTE_POINTS);
          routePointsRef.current = nextRoute;
          setRoutePoints(nextRoute);
          lastPointTimeRef.current = nowMs;
        }

        const currentTrail = depthTrailRef.current;
        const lastTrailPoint = currentTrail.at(-1) || { distance: 0, depth: 0, north: 0, east: 0 };
        let stepMeters = movedEnough ? gpsStep : 0;
        filteredBetaRef.current += (nextTelemetry.beta - filteredBetaRef.current) * BETA_SMOOTHING;
        const betaOffset = filteredBetaRef.current - calibrationRef.current.beta;
        const tiltRatio = clamp(betaOffset / 90, -1, 1);
        const tiltActive = Math.abs(betaOffset) >= MIN_TUNNEL_TILT_DEG;
        const tiltStrong = Math.abs(betaOffset) >= TILT_STRONG_DEG;

        if (tiltStrong) {
          if (!tiltStrongSinceRef.current) {
            tiltStrongSinceRef.current = nowMs;
          }
        } else {
          tiltStrongSinceRef.current = 0;
        }

        const tiltQualified = tiltStrongSinceRef.current && nowMs - tiltStrongSinceRef.current >= TILT_STABLE_MS;

        const originPoint = routePointsRef.current[0] || point;
        const depthDelta = stepMeters * tiltRatio;
        const relative = latLngToOffsetMeters(originPoint, point);
        const distanceFromStart = distanceMeters(originPoint, point);

        if (stepMeters >= MIN_ROUTE_MOVE_METERS && tiltQualified) {
          const nextTrail = [
            ...currentTrail,
            {
              distance: distanceFromStart,
              depth: clamp(lastTrailPoint.depth + depthDelta, -DEPTH_LIMIT, DEPTH_LIMIT),
              north: relative.north,
              east: relative.east
            }
          ].slice(-MAX_DEPTH_POINTS);

          depthTrailRef.current = nextTrail;
          setDepthTrail(nextTrail);
        }
      }
    }, TELEMETRY_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [espIp]);

  const routeDistance = useMemo(() => {
    let total = 0;

    for (let index = 1; index < routePoints.length; index += 1) {
      total += distanceMeters(routePoints[index - 1], routePoints[index]);
    }

    return total;
  }, [routePoints]);

  const currentTone = getTone(telemetry);
  const isBackAtStart = routePoints.length > 1 && routePoints[0] && routePoints.at(-1) && distanceMeters(routePoints[0], routePoints.at(-1)) < 10;

  function persistIp(nextIp) {
    const clean = nextIp.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    setEspIp(clean);
    localStorage.setItem("helmetReceiverEspIp", clean);
  }

  function resetRoute() {
    const initialPoint = telemetry.lat !== null && telemetry.lng !== null ? [telemetry.lat, telemetry.lng] : [];
    const nextRoute = initialPoint.length ? [initialPoint] : [];

    routePointsRef.current = nextRoute;
    depthTrailRef.current = [{ distance: 0, depth: 0, north: 0, east: 0 }];

    setRoutePoints(nextRoute);
    setDepthTrail(depthTrailRef.current);
  }

  function resetTunnel() {
    calibrationRef.current = { beta: telemetry.beta, gamma: telemetry.gamma, motion: telemetry.motion || 9.81 };
    depthTrailRef.current = [{ distance: 0, depth: 0, north: 0, east: 0 }];
    setDepthTrail(depthTrailRef.current);
  }

  return (
    <main className={`app-shell tone-${statusTone}`}>
      <section className="ambient ambient-a" />
      <section className="ambient ambient-b" />
      <section className="ambient ambient-c" />

      <div className="page-shell">
        <header className="hero-shell glass-card">
          <div>
            <p className="eyebrow">Smart Helmet</p>
            <h1>Live Safety Dashboard</h1>
            <p className="hero-copy">Gas, vitals, GPS, and tunnel profile.</p>
          </div>

          <div className="hero-actions">
            <div className="status-badge">{receiverStatus}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setLightTheme((s) => !s)}
                title="Toggle light theme"
              >
                {lightTheme ? 'Dark' : 'Light'}
              </button>
            </div>
            <label className="ip-field">
              <span>Receiver ESP32 IP</span>
              <div className="input-row">
                <input
                  value={espIp}
                  onChange={(event) => persistIp(event.target.value)}
                  placeholder={DEFAULT_IP}
                  spellCheck="false"
                />
                <button type="button" onClick={() => persistIp(espIp)}>
                  Connect
                </button>
              </div>
            </label>
          </div>
        </header>

        <section className="gauge-grid">
          <GaugeCard title="Gas Level" value={telemetry.gasPpm} unit={gaugeRanges.gas.unit} range={gaugeRanges.gas} gradientId="gasGradient" />
          <GaugeCard title="Temperature" value={telemetry.temperatureC} unit={gaugeRanges.temperature.unit} range={gaugeRanges.temperature} gradientId="tempGradient" />
          <GaugeCard title="Humidity" value={telemetry.humidityPct} unit={gaugeRanges.humidity.unit} range={gaugeRanges.humidity} gradientId="humidityGradient" statusClassName="live" />
          <GaugeCard title="Heart Rate" value={telemetry.heartRate} unit={gaugeRanges.heartRate.unit} range={gaugeRanges.heartRate} gradientId="heartGradient" />
        </section>

        <section className="mini-metrics">
          <div className="mini-card">
            <span>Gyro Alpha</span>
            <strong>{telemetry.alpha.toFixed(1)}°</strong>
          </div>
          <div className="mini-card">
            <span>Gyro Beta</span>
            <strong>{telemetry.beta.toFixed(1)}°</strong>
          </div>
          <div className="mini-card">
            <span>Gyro Gamma</span>
            <strong>{telemetry.gamma.toFixed(1)}°</strong>
          </div>
          <div className="mini-card">
            <span>Motion</span>
            <strong>{telemetry.motion.toFixed(2)} m/s2</strong>
          </div>
        </section>

        {telemetry.sos ? (
          <section className="sos-banner">
            <div>
              <p>SOS ALERT</p>
              <strong>{telemetry.lat !== null && telemetry.lng !== null ? `Emergency at ${formatPoint(telemetry.lat, telemetry.lng)}` : "Emergency triggered. GPS not available yet."}</strong>
            </div>
            <a href={telemetry.lat !== null && telemetry.lng !== null ? `https://www.google.com/maps?q=${telemetry.lat},${telemetry.lng}` : "#"} target="_blank" rel="noreferrer">
              Open location
            </a>
          </section>
        ) : null}

        {sosActive || isCalling || callHold ? (
          <section className="sos-overlay" role="dialog" aria-live="polite">
            <div className="sos-modal">
              <div className="sos-header">
                <span>Emergency Protocol</span>
                <strong>SOS Detected</strong>
              </div>
              <div className="sos-body">
                {isCalling ? (
                  <>
                    <div className="calling-card">
                      <div className="calling-pfp">EH</div>
                      <div>
                        <h3>Calling {emergencyContact.name}</h3>
                        <p>{emergencyContact.number}</p>
                      </div>
                    </div>
                    <div className="calling-pulse" />
                    <p>Stay calm. Help is being notified.</p>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setIsCalling(false);
                        setCallHold(false);
                        setSosActive(false);
                        setSosCountdown(null);
                      }}
                    >
                      End call
                    </button>
                  </>
                ) : (
                  <>
                    <div className="countdown-ring">
                      <span>{sosCountdown ?? 10}</span>
                    </div>
                    <h3>Confirm this is not an accident</h3>
                    <p>Auto-call will start in {sosCountdown ?? 10} seconds.</p>
                    <div className="sos-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          setSosActive(false);
                          setSosCountdown(null);
                          setIsCalling(false);
                          setCallHold(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSosCountdown(null);
                          setIsCalling(true);
                          setCallHold(true);
                        }}
                      >
                        Call now
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <section className="content-grid">
          <MapPanel
            telemetry={telemetry}
            routePoints={routePoints}
            routeDistance={routeDistance}
            routeStatus={isBackAtStart ? "Returned to start" : `${routePoints.length} tracked points`}
            onResetRoute={resetRoute}
          />

          <TunnelPanel
            telemetry={telemetry}
            routePoints={routePoints}
            depthTrail={depthTrail}
            depthDistance={depthTrail.at(-1)?.distance || 0}
            onResetTunnel={resetTunnel}
            onCalibrate={resetTunnel}
          />
        </section>

        <section className="footer-strip glass-card">
          <div>
            <span>Status</span>
            <strong className={`tone-text ${currentTone}`}>{currentTone.toUpperCase()}</strong>
          </div>
          <div>
            <span>Last update</span>
            <strong>{telemetry.timestamp ? new Date(telemetry.timestamp).toLocaleTimeString() : "Waiting"}</strong>
          </div>
          <div>
            <span>Map state</span>
            <strong>{isBackAtStart ? "Back at start" : "Tracking route"}</strong>
          </div>
          <div>
            <span>Receiver signal</span>
            <strong>{telemetry.online ? "Online" : "Stale"}</strong>
          </div>
        </section>

        <section className="footer-strip glass-card">
          <div>
            <span>Receiver IP</span>
            <strong>{debugInfo.ip || "Not set"}</strong>
          </div>
          <div>
            <span>Receiver payload</span>
            <strong>{debugInfo.receiver ? "OK" : debugInfo.receiverError || "None"}</strong>
          </div>
          <div>
            <span>Phone payload</span>
            <strong>{debugInfo.phone ? "OK" : debugInfo.phoneError || "None"}</strong>
          </div>
          <div>
            <span>Debug updated</span>
            <strong>{debugInfo.updatedAt ? new Date(debugInfo.updatedAt).toLocaleTimeString() : "Waiting"}</strong>
          </div>
        </section>
      </div>
    </main>
  );
}
