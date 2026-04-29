"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const emptyReading = {
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

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

export default function PhoneSensorPage() {
  const [reading, setReading] = useState(emptyReading);
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [lastSent, setLastSent] = useState(null);
  const readingRef = useRef(emptyReading);
  const watchRef = useRef(null);

  useEffect(() => {
    readingRef.current = reading;
  }, [reading]);

  useEffect(() => {
    function handleOrientation(event) {
      setReading((current) => ({
        ...current,
        alpha: Number(event.alpha ?? 0),
        beta: Number(event.beta ?? 0),
        gamma: Number(event.gamma ?? 0),
        timestamp: Date.now()
      }));
    }

    function handleMotion(event) {
      const acceleration = event.accelerationIncludingGravity || event.acceleration || {};
      const x = Number(acceleration.x ?? 0);
      const y = Number(acceleration.y ?? 0);
      const z = Number(acceleration.z ?? 0);

      setReading((current) => ({
        ...current,
        motion: Math.sqrt(x * x + y * y + z * z),
        timestamp: Date.now()
      }));
    }

    window.addEventListener("deviceorientation", handleOrientation);
    window.addEventListener("devicemotion", handleMotion);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.removeEventListener("devicemotion", handleMotion);
    };
  }, []);

  useEffect(() => {
    if (!sharing) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/phone-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...readingRef.current,
            timestamp: Date.now()
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        setLastSent(new Date());
        setStatus("Streaming to dashboard API");
      } catch (error) {
        setStatus("Could not send phone data");
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sharing]);

  async function requestSensorAccess() {
    setStatus("Requesting sensor access...");

    try {
      const orientationPermission = window.DeviceOrientationEvent?.requestPermission;
      const motionPermission = window.DeviceMotionEvent?.requestPermission;

      if (typeof orientationPermission === "function") {
        const result = await orientationPermission.call(window.DeviceOrientationEvent);
        if (result !== "granted") {
          setStatus("Orientation permission was not granted");
          return;
        }
      }

      if (typeof motionPermission === "function") {
        const result = await motionPermission.call(window.DeviceMotionEvent);
        if (result !== "granted") {
          setStatus("Motion permission was not granted");
          return;
        }
      }

      if ("geolocation" in navigator) {
        watchRef.current = navigator.geolocation.watchPosition(
          (position) => {
            setReading((current) => ({
              ...current,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: Number(position.coords.accuracy ?? null),
              timestamp: Date.now()
            }));
          },
          () => setStatus("Location permission unavailable; motion still works"),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
      }

      setSharing(true);
      setStatus("Streaming to dashboard API");
    } catch (error) {
      setStatus("Sensor access failed");
    }
  }

  function stopSharing() {
    setSharing(false);
    setStatus("Paused");

    if (watchRef.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }

  const cards = useMemo(
    () => [
      ["Latitude", reading.lat === null ? "--" : reading.lat.toFixed(6)],
      ["Longitude", reading.lng === null ? "--" : reading.lng.toFixed(6)],
      ["Accuracy", reading.accuracy === null ? "--" : `${formatNumber(reading.accuracy, 0)} m`],
      ["Alpha", `${formatNumber(reading.alpha)} deg`],
      ["Beta", `${formatNumber(reading.beta)} deg`],
      ["Gamma", `${formatNumber(reading.gamma)} deg`],
      ["Motion", `${formatNumber(reading.motion, 2)} m/s2`]
    ],
    [reading]
  );

  return (
    <main className="app-shell tone-safe">
      <section className="ambient ambient-a" />
      <section className="ambient ambient-b" />

      <div className="page-shell">
        <header className="hero-shell glass-card">
          <div>
            <p className="eyebrow">Phone Sensor</p>
            <h1>Helmet Sensor Bridge</h1>
            <p className="hero-copy">Open this page on the phone through the HTTPS ngrok link to stream GPS and motion data.</p>
          </div>

          <div className="hero-actions">
            <div className="status-badge">{status}</div>
            <div className="chip-row">
              <button className="ghost-button" type="button" onClick={requestSensorAccess} disabled={sharing}>
                Start sensors
              </button>
              <button className="ghost-button" type="button" onClick={stopSharing} disabled={!sharing}>
                Stop
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setReading((current) => ({ ...current, sos: !current.sos, timestamp: Date.now() }))}
              >
                SOS {reading.sos ? "On" : "Off"}
              </button>
            </div>
          </div>
        </header>

        <section className="mini-metrics">
          {cards.map(([label, value]) => (
            <div className="mini-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </section>

        <section className="footer-strip glass-card">
          <div>
            <span>API</span>
            <strong>/api/phone-data</strong>
          </div>
          <div>
            <span>Sharing</span>
            <strong>{sharing ? "Active" : "Paused"}</strong>
          </div>
          <div>
            <span>SOS</span>
            <strong>{reading.sos ? "Active" : "Clear"}</strong>
          </div>
          <div>
            <span>Last sent</span>
            <strong>{lastSent ? lastSent.toLocaleTimeString() : "Waiting"}</strong>
          </div>
        </section>
      </div>
    </main>
  );
}
