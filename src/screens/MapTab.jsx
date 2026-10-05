import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BigValue, ConfirmButton, Empty, Icon } from '../components/ui.jsx';
import { ACTIVITY_LABEL, distanceM, formatDistance, geoSupported, isFresh, kmh, requestPosition } from '../lib/location.js';
import { ago, formatStay } from '../lib/time.js';
import { haptic } from '../lib/haptics.js';

// Standard OpenStreetMap tiles (free, no key, attribution required), darkened
// with a CSS filter on the tile layer to match the app. Fine for a household;
// a busier app should move to a keyed provider such as MapTiler or Stadia.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const RADII = [100, 200, 500];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initialOf = name => (name || '?').trim().charAt(0).toUpperCase();

// Small activity glyphs for the map pins (plain SVG strings for Leaflet markers).
const ACT_SVG = {
  walking: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.8"/><path d="M10 21l2-6 3 3v5M9 12l2-4 3 2 3 1M11 8l-2 4-3 1"/></svg>',
  cycling: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2 7M14 6h2"/></svg>',
  driving: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM5 11h14"/><circle cx="7.5" cy="16" r="1"/><circle cx="16.5" cy="16" r="1"/></svg>',
};
const CLOCK_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

const clock = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
function dayName(iso, now) {
  const d = new Date(iso), t = new Date(now);
  const days = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function MapTab({ hh, actions, nameOf, notify, me, now }) {
  const mapEl = useRef(null);
  const map = useRef(null);
  const layers = useRef({ people: new Map(), places: new Map(), draft: null });
  const fitted = useRef(false);
  const addRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', lat: null, lng: null, radius: 200 });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);

  const mine = hh.members.find(m => m.user_id === me);
  const sharing = Boolean(mine?.share_location);
  const locOf = id => hh.locations.find(l => l.user_id === id);
  const myLoc = locOf(me);
  const isOnline = id => hh.online.includes(id);
  const stayOf = id => {
    const pr = hh.presence.find(x => x.user_id === id && x.inside);
    const place = pr && hh.places.find(pl => pl.id === pr.place_id);
    return place ? { place, since: Date.parse(pr.changed_at) } : null;
  };
  // How long someone has been staying where they are: since they entered a saved
  // place, or since they stopped moving anywhere else. Counts only up to the last
  // update, so a closed app doesn't keep the timer running.
  const stayFor = id => {
    const l = locOf(id);
    if (!l) return null;
    const saved = stayOf(id);
    const since = saved ? saved.since : l.still_since ? Date.parse(l.still_since) : null;
    if (!since) return null;
    const end = isFresh(l, now) ? now : Date.parse(l.updated_at);
    return { ms: Math.max(0, end - since), place: saved?.place || null };
  };
  const STAY_MIN = 3 * 60000; // don't show a timer for brief stops
  const movingOf = id => { const l = locOf(id); return isFresh(l, now) && l.activity && l.activity !== 'still' ? l : null; };
  const people = [...hh.members].sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : 0));
  const shown = people.filter(m => m.share_location && locOf(m.user_id));

  // ---------- map setup ----------
  useEffect(() => {
    const m = L.map(mapEl.current, { zoomControl: false, center: [20.6, 78.9], zoom: 4, worldCopyJump: true });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, className: 'dark-tiles' }).addTo(m);
    m.attributionControl.setPrefix(false);
    map.current = m;
    setReady(true);
    // the page slides in; measure again once it has settled
    const t = setTimeout(() => m.invalidateSize(), 420);
    const store = layers.current;
    return () => {
      clearTimeout(t);
      m.remove();
      map.current = null;
      store.people.clear();
      store.places.clear();
      store.draft = null;
    };
  }, []);

  // tap the map to drop the new place's pin
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const onClick = e => {
      if (!adding) return;
      setDraft(d => ({ ...d, lat: e.latlng.lat, lng: e.latlng.lng }));
      haptic('select');
    };
    m.on('click', onClick);
    return () => m.off('click', onClick);
  }, [adding, ready]);

  // ---------- people markers ----------
  const peopleKey = shown.map(m => { const l = locOf(m.user_id); const st = stayFor(m.user_id); return `${m.user_id}:${l.lat}:${l.lng}:${isOnline(m.user_id)}:${m.display_name}:${l.activity}:${kmh(l.speed)}:${isFresh(l, now)}:${st ? Math.floor(st.ms / 60000) : ''}`; }).join('|');
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set();
    for (const p of shown) {
      const l = locOf(p.user_id);
      seen.add(p.user_id);
      const icon = L.divIcon({
        className: 'pin-wrap',
        html: (() => {
          const mv = movingOf(p.user_id);
          const st = stayFor(p.user_id);
          return `<div class="pin${isOnline(p.user_id) ? ' online' : ''}${p.user_id === me ? ' me' : ''}${mv ? ' moving' : ''}"><span>${esc(initialOf(p.display_name))}</span>`
            + (mv ? `<b class="pin-act">${ACT_SVG[mv.activity] || ''}</b><em class="pin-speed">${kmh(mv.speed)} km/h</em>` : '')
            + (!mv && st && st.ms >= STAY_MIN ? `<em class="pin-stay">${CLOCK_SVG}${esc(formatStay(st.ms))}</em>` : '')
            + '</div>';
        })(),
        iconSize: [46, 46],
        iconAnchor: [23, 23],
      });
      const existing = layers.current.people.get(p.user_id);
      if (existing) { existing.setLatLng([l.lat, l.lng]); existing.setIcon(icon); }
      else layers.current.people.set(p.user_id, L.marker([l.lat, l.lng], { icon, keyboard: false }).addTo(m));
    }
    for (const [id, mk] of layers.current.people) if (!seen.has(id)) { mk.remove(); layers.current.people.delete(id); }
  }, [peopleKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- place circles ----------
  const placesKey = hh.places.map(p => `${p.id}:${p.lat}:${p.lng}:${p.radius_m}:${p.name}`).join('|');
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set();
    for (const p of hh.places) {
      seen.add(p.id);
      const old = layers.current.places.get(p.id);
      if (old) { old.circle.remove(); old.label.remove(); }
      const circle = L.circle([p.lat, p.lng], { radius: p.radius_m, color: '#ffffff', weight: 1, opacity: 0.55, fillColor: '#ffffff', fillOpacity: 0.06, interactive: false }).addTo(m);
      const label = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: 'place-label-wrap', html: `<div class="place-label">${esc(p.name)}</div>`, iconSize: null }),
        interactive: false, keyboard: false,
      }).addTo(m);
      layers.current.places.set(p.id, { circle, label });
    }
    for (const [id, l] of layers.current.places) if (!seen.has(id)) { l.circle.remove(); l.label.remove(); layers.current.places.delete(id); }
  }, [placesKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- draft pin while adding ----------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (layers.current.draft) { layers.current.draft.remove(); layers.current.draft = null; }
    if (adding && draft.lat != null) {
      layers.current.draft = L.circle([draft.lat, draft.lng], { radius: draft.radius, color: '#ffffff', weight: 1.5, dashArray: '4 6', fillColor: '#ffffff', fillOpacity: 0.12, interactive: false }).addTo(m);
    }
  }, [adding, draft.lat, draft.lng, draft.radius, ready]);

  // fit everyone and every place in view once data arrives
  useEffect(() => {
    const m = map.current;
    if (!m || fitted.current || !hh.loaded) return;
    const pts = [...shown.map(p => { const l = locOf(p.user_id); return [l.lat, l.lng]; }), ...hh.places.map(p => [p.lat, p.lng])];
    if (!pts.length) return;
    fitted.current = true;
    if (pts.length === 1) m.setView(pts[0], 15);
    else m.fitBounds(pts, { padding: [48, 48], maxZoom: 15 });
  }, [hh.loaded, peopleKey, placesKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // header "+" opens the add-place panel
  useEffect(() => {
    const open = () => startAdding();
    window.addEventListener('weee:add', open);
    return () => window.removeEventListener('weee:add', open);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const flyTo = (lat, lng, zoom = 16) => map.current?.flyTo([lat, lng], zoom, { duration: 0.8 });

  function fitAll() {
    const pts = [...shown.map(p => { const l = locOf(p.user_id); return [l.lat, l.lng]; }), ...hh.places.map(p => [p.lat, p.lng])];
    if (pts.length === 1) flyTo(pts[0][0], pts[0][1], 15);
    else if (pts.length) map.current?.flyToBounds(pts, { padding: [48, 48], maxZoom: 15, duration: 0.8 });
  }

  function startAdding() {
    setAdding(true);
    setDraft({ name: '', lat: null, lng: null, radius: 200 });
    setResults([]);
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => addRef.current?.focus(), 350);
  }

  async function toggleSharing() {
    if (sharing) {
      if (await actions.setSharing(false)) notify('Location sharing is off. Your position was deleted.');
      return;
    }
    if (!geoSupported()) { notify("This browser can't share location."); return; }
    setBusy(true);
    try {
      await requestPosition();
      if (await actions.setSharing(true)) notify('Sharing your location with your household');
    } catch (err) {
      notify(err?.code === 1
        ? 'Location is blocked. Allow it for Weee in your phone settings, then try again.'
        : "Couldn't find your location. Check that Location Services is on and try again.");
    }
    setBusy(false);
  }

  async function useMyLocation() {
    setBusy(true);
    try {
      const pos = await requestPosition();
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      setDraft(d => ({ ...d, lat, lng }));
      flyTo(lat, lng, 16);
    } catch {
      notify("Couldn't find your location. Tap the map to drop the pin instead.");
    }
    setBusy(false);
  }

  async function search(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query.trim())}`, { headers: { 'Accept-Language': 'en' } });
      const found = (await res.json()).map(x => ({ id: x.place_id, label: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }));
      setResults(found);
      if (!found.length) notify('No places found. Try a shorter name or add the area, like "Toit Indiranagar".');
    } catch {
      notify("Search isn't working right now. Tap the map to drop the pin instead.");
    }
    setSearching(false);
  }

  function pick(r) {
    setDraft(d => ({ ...d, name: d.name || r.label.split(',')[0].slice(0, 60), lat: r.lat, lng: r.lng }));
    setResults([]);
    flyTo(r.lat, r.lng, 16);
  }

  async function savePlace(e) {
    e.preventDefault();
    if (!draft.name.trim()) { notify('Give the place a name, like Home or Office'); return; }
    if (draft.lat == null) { notify('Search for the place, use your location, or tap the map'); return; }
    const ok = await actions.addPlace({ name: draft.name.trim(), lat: draft.lat, lng: draft.lng, radius: draft.radius });
    if (ok) { notify(`Saved ${draft.name.trim()}. You'll be told when someone arrives or leaves.`); setAdding(false); }
  }

  const statusLine = m => {
    const l = locOf(m.user_id);
    if (!m.share_location) return 'Location off';
    if (!l) return 'Waiting for a location';
    const mv = movingOf(m.user_id);
    if (mv) return `${ACTIVITY_LABEL[mv.activity]} · ${kmh(mv.speed)} km/h`;
    const stay = stayFor(m.user_id);
    if (stay?.place) return `At ${stay.place.name} · ${formatStay(stay.ms)}`;
    if (stay && stay.ms >= STAY_MIN) return `Here for ${formatStay(stay.ms)}`;
    if (m.user_id !== me && myLoc) return `${formatDistance(distanceM(myLoc, l))} away`;
    return 'Sharing location';
  };

  return (
    <section className="map-tab">
      <div className={`map-card${adding ? ' picking' : ''}`}>
        <div ref={mapEl} className="map" aria-label="Map of your household" />
        <div className="map-tools">
          {myLoc && <button className="icon big" onClick={() => flyTo(myLoc.lat, myLoc.lng)} aria-label="Show me"><Icon.locate /></button>}
          {(shown.length + hh.places.length) > 1 && <button className="icon big" onClick={fitAll} aria-label="Show everyone"><Icon.map /></button>}
        </div>
        {adding && <div className="map-hint">{draft.lat == null ? 'Tap the map to drop a pin' : 'Pin dropped. Tap again to move it'}</div>}
      </div>

      {adding && (
        <form className="panel add-place" onSubmit={savePlace} autoComplete="off">
          <div className="panel-head">
            <div className="panel-title">New place</div>
            <button type="button" className="icon" onClick={() => setAdding(false)} aria-label="Cancel"><Icon.x /></button>
          </div>
          <div className="search-row">
            <input ref={addRef} id="placeSearch" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a café, office or address"
              onKeyDown={e => { if (e.key === 'Enter') search(e); }} aria-label="Search for a place" />
            <button type="button" className="btn ghost small" onClick={search} disabled={searching}>{searching ? '…' : 'Search'}</button>
          </div>
          {results.length > 0 && (
            <div className="results">
              {results.map(r => <button type="button" key={r.id} className="result" onClick={() => pick(r)}>{r.label}</button>)}
            </div>
          )}
          <button type="button" className="btn ghost" onClick={useMyLocation} disabled={busy}><Icon.locate /> Use where I am now</button>
          <label className="field"><span>Name</span><input id="placeName" maxLength={60} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Home, Office, Gym…" /></label>
          <div className="field"><span>Alert when within</span>
            <div className="kinds">
              {RADII.map(r => <button type="button" key={r} role="radio" aria-checked={draft.radius === r} className="kind" onClick={() => setDraft(d => ({ ...d, radius: r }))}>{r} m</button>)}
            </div>
          </div>
          <button className="btn">Save place</button>
        </form>
      )}

      <div className="label">People</div>
      <div className="bento">
        {people.map(m => {
          const l = locOf(m.user_id);
          const online = isOnline(m.user_id);
          const battery = l?.battery;
          const mv = m.share_location ? movingOf(m.user_id) : null;
          return (
            <button key={m.user_id} type="button" className="tile person" onClick={() => l && m.share_location && flyTo(l.lat, l.lng)}>
              <div className="tile-top">
                <span className={`face${online ? ' online' : ''}`}>{initialOf(m.display_name)}</span>
                {battery != null && <span className="batt-wrap">{Icon.battery(battery, l.charging)}<small>{battery}%</small></span>}
              </div>
              {mv ? <BigValue value={kmh(mv.speed)} unit="km/h" className="speed" />
                : battery != null ? <BigValue value={battery} unit="%" /> : null}
              <div className="tile-title">{m.user_id === me ? 'You' : m.display_name}</div>
              <div className="tile-sub">{statusLine(m)}</div>
              <div className="tile-sub faint">
                {online && <span className="live-dot" />}
                <span>{online ? 'Online now' : m.last_seen ? `Seen ${ago(m.last_seen, now)}` : 'Not seen yet'}{l && m.share_location ? ` · updated ${ago(l.updated_at, now)}` : ''}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="panel share-card">
        <div className="toggle-row" onClick={busy ? undefined : toggleSharing} role="switch" aria-checked={sharing} tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && !busy && toggleSharing()}>
          <span className="grow">
            <b>Share my location</b>
            <span className="meta block">{sharing
              ? 'Your household can see where you are and your battery. Only your latest position is kept.'
              : 'Off. Turn it on so your household can see where you are and get alerts at your saved places.'}</span>
          </span>
          <span className={`switch${sharing ? ' on' : ''}`} aria-hidden="true"><i /></span>
        </div>
        <p className="hint tight">Updates while Weee is open on your phone. Battery shows on Android; iPhone browsers don't share it.</p>
      </div>

      <div className="label">Places <span className="count">{hh.places.length}</span>
        {!adding && <button type="button" className="btn ghost small push" onClick={startAdding}><Icon.plus /> Add place</button>}
      </div>
      {!hh.loaded ? <Empty title="Loading…" /> : hh.places.length === 0 ? (
        <Empty title="No places yet">Save places like Home, Office or your favourite café. When someone who shares their location arrives or leaves, everyone else gets a notification.</Empty>
      ) : (
        <div className="list">
          {hh.places.map(p => {
            const here = hh.presence.filter(pr => pr.place_id === p.id && pr.inside);
            const visits = hh.visits.filter(v => v.place_id === p.id).slice().reverse().slice(0, 8);
            const showing = history === p.id;
            return (
              <div key={p.id} className={`row place${showing ? ' open' : ''}`}>
                <button type="button" className="place-dot" onClick={() => flyTo(p.lat, p.lng)} aria-label={`Show ${p.name} on the map`}><Icon.map /></button>
                <div className="main" onClick={() => flyTo(p.lat, p.lng)}>
                  <div className="name">{p.name}</div>
                  <div className="meta">
                    {here.length
                      ? here.map(pr => `${nameOf(pr.user_id)} here · ${formatStay(now - Date.parse(pr.changed_at))}`).join(' · ')
                      : 'Nobody here'} · {p.radius_m} m
                  </div>
                  {visits.length > 0 && (
                    <button type="button" className="link small-link" onClick={e => { e.stopPropagation(); setHistory(showing ? null : p.id); }}>
                      {showing ? 'Hide history' : `History · ${visits.length} visit${visits.length === 1 ? '' : 's'}`}
                    </button>
                  )}
                </div>
                <button type="button" className={`icon${p.notify ? ' bell-on' : ''}`} data-haptic="select" onClick={() => actions.togglePlaceAlerts(p)}
                  aria-label={p.notify ? `Turn off alerts for ${p.name}` : `Turn on alerts for ${p.name}`} aria-pressed={p.notify}>{Icon.bell(p.notify)}</button>
                <ConfirmButton label={`Delete ${p.name}`} confirmLabel="Delete?" onConfirm={() => actions.removePlace(p)}><Icon.trash /></ConfirmButton>
                {showing && (
                  <div className="visits">
                    {visits.map(v => {
                      const end = v.left_at ? Date.parse(v.left_at) : now;
                      return (
                        <div key={v.id} className="visit">
                          <span className="visit-who">{nameOf(v.user_id)}</span>
                          <span className="visit-when">{dayName(v.arrived_at, now)} · {clock(v.arrived_at)}{v.left_at ? ` – ${clock(v.left_at)}` : ' – now'}</span>
                          <span className="visit-len">{formatStay(end - Date.parse(v.arrived_at))}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
