import { useEffect, useRef, useState } from 'react';
type Place = { latitude: number; longitude: number; placeName: string };
type MapInstance = { region: unknown; annotations: unknown[]; destroy: () => void };
type MapKit = {
 init: (options: { authorizationCallback: (done: (token: string) => void) => void }) => void;
 addEventListener: (name: string, listener: () => void) => void;
 removeEventListener: (name: string, listener: () => void) => void;
 Coordinate: new (latitude: number, longitude: number) => unknown;
 CoordinateSpan: new (latitudeDelta: number, longitudeDelta: number) => unknown;
 CoordinateRegion: new (center: unknown, span: unknown) => unknown;
 MarkerAnnotation: new (coordinate: unknown, options: {title: string}) => unknown;
 Map: new (element: HTMLElement, options: {region: unknown}) => MapInstance;
};
let sdkPromise: Promise<MapKit> | undefined;
let authorizedToken: string | undefined;
function loadMapKit(): Promise<MapKit> {
 const current = (window as Window & {mapkit?: MapKit}).mapkit;
 if (current) return Promise.resolve(current);
 if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
  const existing = document.getElementById('apple-delivery-mapkit') as HTMLScriptElement | null;
  const script = existing ?? document.createElement('script');
  const timeout = setTimeout(() => reject(new Error('Apple Maps load timed out')), 8000);
  script.addEventListener('load', () => { clearTimeout(timeout); const sdk = (window as Window & {mapkit?: MapKit}).mapkit; if (sdk) resolve(sdk); else reject(new Error('Apple Maps unavailable')); }, {once: true});
  script.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Apple Maps unavailable')); }, {once: true});
  if (!existing) { script.id = 'apple-delivery-mapkit'; script.async = true; script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js'; document.head.append(script); }
 });
 return sdkPromise;
}

export function AppleDeliveryMap({ token, place, fallbackUrl }: {token: string; place?: Place; fallbackUrl: string}) {
 const host = useRef<HTMLDivElement>(null);
 const sdkRef = useRef<MapKit | null>(null);
 const mapRef = useRef<MapInstance | null>(null);
 const [failed, setFailed] = useState(false);
 const [ready, setReady] = useState(false);
 useEffect(() => {
  if (!token || failed || !host.current) return;
  let live = true;
  let sdk: MapKit | undefined;
  let instance: MapInstance | undefined;
  const fail = () => { if (live) setFailed(true); };
  loadMapKit().then(loaded => {
   if (!live || !host.current) return;
   sdk = loaded; sdkRef.current = loaded;
   loaded.addEventListener('error', fail);
   if (authorizedToken !== token) { loaded.init({authorizationCallback: done => done(token)}); authorizedToken = token; }
   const center = new loaded.Coordinate(place?.latitude ?? 60.1662, place?.longitude ?? 24.9315);
   instance = new loaded.Map(host.current, {region: new loaded.CoordinateRegion(center, new loaded.CoordinateSpan(.014, .024))});
   mapRef.current = instance;
   if (place) instance.annotations = [new loaded.MarkerAnnotation(center, {title: place.placeName})];
   setReady(true);
  }).catch(fail);
  return () => { live = false; sdk?.removeEventListener('error', fail); instance?.destroy(); mapRef.current = null; sdkRef.current = null; };
 }, [token, failed]); // Coordinates update below without loading or initializing the SDK again.
 useEffect(() => {
  const sdk = sdkRef.current, map = mapRef.current;
  if (!sdk || !map || !ready) return;
  const center = new sdk.Coordinate(place?.latitude ?? 60.1662, place?.longitude ?? 24.9315);
  map.region = new sdk.CoordinateRegion(center, new sdk.CoordinateSpan(.014, .024));
  map.annotations = place ? [new sdk.MarkerAnnotation(center, {title: place.placeName})] : [];
 }, [place?.latitude, place?.longitude, place?.placeName, ready]);
 const fallback = !token || failed;
 const appleUrl = place ? 'https://maps.apple.com/place?coordinate=' + encodeURIComponent(place.latitude + ',' + place.longitude) + '&name=' + encodeURIComponent(place.placeName) : null;
 return <>
  {fallback ? <iframe key={fallbackUrl} src={fallbackUrl} title="Interactive delivery location map" loading="eager" referrerPolicy="no-referrer" /> : <div ref={host} role="region" aria-label="Interactive Apple Maps delivery location" style={{height: 220, width: '100%', borderRadius: 'var(--r-10)', overflow: 'hidden'}} />}
  {failed && <p role="status">Apple Maps could not load. Showing OpenStreetMap.</p>}
  {!fallback && !ready && <p role="status">Loading Apple Maps...</p>}
  <span>{fallback ? 'OpenStreetMap: drag to pan, use + / - to zoom.' : 'Apple Maps: drag to pan and use the zoom controls.'} Select a saved place to move the marker.</span>
  {appleUrl && <a href={appleUrl} target="_blank" rel="noopener noreferrer" className="link" style={{display:'inline-block',marginTop:'var(--s-8)',fontSize:'var(--fs-13)'}}>Open in Apple Maps</a>}
 </>;
}
