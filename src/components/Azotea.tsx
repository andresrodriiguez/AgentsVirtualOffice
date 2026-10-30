import { useEffect, useState } from "react";

// La Azotea: cielo de Valencia (Venezuela) según la hora real, clima real (Open-Meteo, sin API key) y la guacamaya mensajera.

const TZ = "America/Caracas";
const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=10.16&longitude=-68.00&current=temperature_2m,weather_code&timezone=America%2FCaracas";

export type Phase = "night" | "dawn" | "day" | "sunset";
export type Weather = "clear" | "clouds" | "fog" | "rain" | "storm";

function localHour(d = new Date()): number {
  const [h, m] = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .format(d)
    .split(":")
    .map(Number);
  return h + m / 60;
}

export function phaseOf(hour: number): Phase {
  // Cerca del ecuador el sol sale ~6:15 y se pone ~18:30 todo el año.
  if (hour >= 5.5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 17.75) return "day";
  if (hour >= 17.75 && hour < 19.25) return "sunset";
  return "night";
}

export function weatherOf(code: number): Weather {
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 86)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code >= 2) return "clouds";
  return "clear";
}

const WEATHER_ICON: Record<Weather, string> = { clear: "☀️", clouds: "⛅", fog: "🌫️", rain: "🌧️", storm: "⛈️" };
const NIGHT_ICON: Partial<Record<Weather, string>> = { clear: "🌙", clouds: "☁️" };

export function useValencia() {
  const [hour, setHour] = useState(localHour);
  const [weather, setWeather] = useState<{ kind: Weather; temp: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setHour(localHour()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(WEATHER_URL);
        const j = (await r.json()) as { current?: { temperature_2m: number; weather_code: number } };
        if (alive && j.current) setWeather({ kind: weatherOf(j.current.weather_code), temp: Math.round(j.current.temperature_2m) });
      } catch {
        // Sin internet: el cielo sigue la hora igual.
      }
    };
    void load();
    const t = setInterval(load, 15 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return { hour, phase: phaseOf(hour), weather };
}

export function WeatherChip({ hour, phase, weather }: ReturnType<typeof useValencia>) {
  const time = new Intl.DateTimeFormat("es-VE", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date());
  const kind = weather?.kind ?? "clear";
  const icon = phase === "night" ? (NIGHT_ICON[kind] ?? WEATHER_ICON[kind]) : WEATHER_ICON[kind];
  return (
    <span className="weather-chip" title={`Valencia · ${hour.toFixed(1)} h`}>
      {icon} {weather ? `${weather.temp}°` : ""} Valencia · {time}
    </span>
  );
}

// Cerros de Carabobo detrás de la ciudad, con el lago de Valencia al pie.
const SKYLINE =
  "M0 60 V44 H18 V36 H30 V46 H44 V28 H52 V22 H58 V28 H66 V40 H82 V18 H96 V40 H108 V32 H124 V48 H140 V26 H150 V12 H156 V26 H166 V42 H182 V34 H200 V46 H214 V30 H228 V20 H240 V30 H252 V44 H270 V38 H290 V50 H306 V24 H318 V16 H330 V24 H340 V44 H360 V36 H378 V48 H400 V60 Z";

const HILLS = "M0 60 V30 C30 18 55 10 80 20 C105 30 120 8 150 6 C180 4 200 22 230 18 C260 14 280 2 310 8 C340 14 360 26 400 20 V60 Z";

export function SkyBand({ hour, phase, weather }: ReturnType<typeof useValencia>) {
  const kind = weather?.kind ?? "clear";
  // El sol recorre el cielo de 6 a 19 h; la luna de 19 a 6.
  const dayT = Math.min(1, Math.max(0, (hour - 6) / 13));
  const nightT = ((hour + 24 - 19) % 24) / 11;
  const isNight = phase === "night";
  const t = isNight ? Math.min(1, nightT) : dayT;
  const orb = { left: `${6 + t * 88}%`, top: `${70 - Math.sin(t * Math.PI) * 55}%` };
  return (
    <div className={`sky sky-${phase} wx-${kind}`} aria-hidden>
      {isNight && <div className="stars" />}
      <div className={isNight ? "moon" : "sun"} style={orb} />
      {(kind === "clouds" || kind === "rain" || kind === "storm" || kind === "fog") && (
        <>
          <div className="cloud c1" />
          <div className="cloud c2" />
          <div className="cloud c3" />
        </>
      )}
      {(kind === "rain" || kind === "storm") && <div className="rain" />}
      {kind === "storm" && <div className="flash" />}
      <svg className="hills" viewBox="0 0 400 60" preserveAspectRatio="none">
        <path d={HILLS} />
      </svg>
      <svg className="skyline" viewBox="0 0 400 60" preserveAspectRatio="none">
        <path d={SKYLINE} />
      </svg>
      <div className="sea" />
    </div>
  );
}

export function Macaw({ x, y, name }: { x: string; y: string; name: string }) {
  return (
    <div className="macaw" style={{ ["--x" as string]: x, ["--y" as string]: y }}>
      <svg viewBox="0 0 16 16" shapeRendering="crispEdges" width="52" height="52">
        <rect x="6" y="2" width="4" height="3" fill="#e63946" />
        <rect x="9" y="3" width="1" height="1" fill="#fff" />
        <rect x="10" y="3" width="2" height="2" fill="#2b2d42" />
        <rect x="5" y="5" width="6" height="4" fill="#e63946" />
        <rect className="wing" x="2" y="5" width="4" height="2" fill="#f4c35a" />
        <rect className="wing" x="1" y="7" width="4" height="2" fill="#1d70b8" />
        <rect x="6" y="9" width="3" height="5" fill="#e63946" />
        <rect x="7" y="13" width="2" height="3" fill="#1d70b8" />
      </svg>
      <span>¡{name} terminó!</span>
    </div>
  );
}
