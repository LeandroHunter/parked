# Parked

Remember where you parked, and get pointed back to your car.

Parked is a web app for the iPhone. You open it in Safari and add it to your Home Screen; after that it
opens full-screen like an app and works without a connection. There is no account, no server and no
tracking: the saved spot, note and photo stay in the app's private storage on the phone.

It was built as a web app, not a native Swift app, because a native app needs a Mac with Xcode to
compile and install, and none is available. See [What a web app cannot do](#what-a-web-app-cannot-do).

## Using it

1. **Parked** — tap the big button. The app collects GPS fixes for up to 15 seconds, keeps the most
   accurate fresh one, and saves it. If the best fix is vaguer than about ±35 m it does not save
   silently: you choose between trying again, placing the pin on a map, or saving it as approximate.
2. **Add details (optional)** — level or floor, a bay number or note, and a photo.
3. **Find my car** — a large arrow points at the saved spot and follows the phone as you turn, with
   the straight-line distance underneath. Inside the positioning error it stops pointing and says
   *Near your saved spot*.
4. **I found my car** — ends the session. Nothing is ever deleted automatically.

The arrow is a straight line, not a walking route. For a route, use **Open walking directions in
Apple Maps** on the guidance screen.

**English and German.** The **EN | DE** switch at the top right of the home screen changes every text
at once. The app starts in the phone's language (German on a German phone, otherwise English) and
remembers a manual choice.

**Locked like an app.** The page does not scroll or bounce, and it cannot be zoomed by pinching or
double-tapping. Each screen resizes its dial or main button to fit the display instead. Text size
still follows the iOS text-size setting; only at the very largest accessibility sizes, where a screen
genuinely cannot fit, does that one screen become scrollable so that no button is ever out of reach.

## Run it on this computer

Requires Node 24 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:5173>. A desktop has no compass, so add `?sim=1` to the address to drive the
interface with fake sensors. That mode shows a permanent striped **Simulation** banner, stamps the dial
*Simulated*, and stores to a separate database, so it cannot be mistaken for, or overwrite, real data.

```bash
npm run check
```

runs the type-check, the unit tests and the build.

## Put it on your iPhone

It is live at **<https://leandrohunter.github.io/parked/>**.

Safari only gives a page location and compass access over **https**, so the phone cannot use the
`localhost` address above. The site is hosted on GitHub Pages: `.github/workflows/deploy.yml` runs the
type-check and tests, builds, and publishes on every push to `main`. The built site in `dist/` is plain
static files, so it could equally be uploaded to any other https host.

On the iPhone:

1. Open <https://leandrohunter.github.io/parked/> in **Safari**.
2. Tap Share › **Add to Home Screen**. Do this: iOS may clear a website's storage after seven days
   without a visit, and Home Screen apps are exempt from that.
3. Open Parked from the Home Screen. The first tap on **Parked** asks for location (choose *Allow While
   Using*, with Precise on). The first tap on **Find my car** asks for Motion & Orientation access,
   which is the compass.

No Mac, Xcode, Apple Developer account or signing is involved.

## How the arrow is worked out

- The bearing from you to the car is computed from the two coordinates and is relative to **true north**.
- The phone's heading comes from the compass (`webkitCompassHeading`), not from GPS direction of travel,
  so it works while you stand still and turn. Safari's compass is relative to **magnetic north**, so the
  app converts it to true north using the World Magnetic Model (WMM2025) for your position and date.
- Arrow rotation = bearing − heading of the top of the screen. In landscape the screen rotation angle
  is added, so "up" always means "ahead of the top of the screen".
- Rotation is smoothed along the shortest arc, so crossing north never causes a full spin.
- Readings are checked before use: impossible coordinates, missing accuracy, stale timestamps and the
  compass's "not valid" flag are all rejected, and the screen says what is wrong and what to do.
- Near the car, the uncertainty of the saved spot and of your current fix are combined. Inside that
  radius the bearing is noise, so the arrow is replaced by *Near your saved spot*.

## What was verified, and what was not

Verified on a Windows PC:

- `npm run check`: type-check clean, 138 unit tests passing, build succeeds.
- The magnetic model matches all of NOAA's official WMM2025 test values to 0.01°, and an independent
  implementation across the globe.
- In a desktop browser with the labelled simulation: saving, the vague-fix choices, pin on a map,
  details and photo, reload persistence, replace (old spot kept on cancel, failure or interruption),
  denied and no-signal messages, arrow direction, north crossing, near-spot hysteresis, stale and weak
  signal states, compass permission prompt, resume from background, light and dark, portrait and
  landscape layout, and loading with the server switched off.
- Both languages: every key exists in English and German with matching placeholders (unit-tested), and
  the screens were checked in both.
- No scrolling: at iPhone 16 sizes (Home Screen app and Safari tab, portrait and landscape) no screen
  overflows in either language, and scroll, pinch and Ctrl-zoom attempts are ignored.

**Not verified — needs your iPhone:** anything involving the real GPS, the real compass, iOS permission
prompts, haptics, Home Screen behaviour and Apple Maps. No physical compass test has been done.

## iPhone checklist

Do these outdoors with the Home Screen app. Each line says what should happen.

Parking
- [ ] First tap on **Parked** shows the iOS location prompt; the countdown ring waits while it is open.
- [ ] Outdoors the spot saves within a few seconds, with a tick, and shows an accuracy of about ±5–15 m.
- [ ] Close the app from the app switcher and reopen: the spot is still there.
- [ ] Restart the phone and reopen: the spot is still there.
- [ ] Add a level, a note and a photo; close and reopen: all three are still there.
- [ ] Tap **Park here instead**, then **Cancel** during saving: the old spot is unchanged.
- [ ] Start a save, then switch apps before it finishes: on return it says *Saving was interrupted*.

Walking away and guidance
- [ ] Walk 50–100 m away. **Find my car** shows the Motion & Orientation prompt once, then the arrow.
- [ ] The distance matches reality to within the stated accuracy, and grows as you walk away.
- [ ] Face the car: the arrow points up. Turn your back to it: the arrow points down.
- [ ] **Stand still and turn slowly through a full circle:** the arrow keeps pointing at the car
      the whole way round, with no jump or spin when you pass north.
- [ ] Compare with the Compass app: the **N** on the dial agrees with it to within a few degrees.
- [ ] Rotate the phone to landscape while facing the car: the arrow still points up.
- [ ] Holding the phone upright (like taking a photo) versus flat: note any difference in steadiness.
- [ ] The arrow is steady, not jittery, and follows a quick turn without obvious lag.

Returning and reopening
- [ ] Lock the phone for a minute, unlock: the screen shows *Finding you…* briefly, then a fresh arrow.
- [ ] Switch to another app and back: same behaviour.
- [ ] Walk back to the car: within roughly 10 m it changes to *Near your saved spot* and stays there
      without flickering as you stand by the car.
- [ ] The spot is **not** removed on arrival. **I found my car** asks to confirm, then clears it.
- [ ] **Open walking directions in Apple Maps** opens Maps with a walking route to the spot.

Permissions and weak signals
- [ ] Deny location: the app explains how to turn it back on. Re-allow it: saving works again.
- [ ] Turn Precise Location off for the site: the app says it only has approximate location.
- [ ] Decline Motion & Orientation: distance and map still work, and the app says why there is no arrow.
- [ ] Indoors or in a multi-storey: the app reports a weak or missing signal, not a confident arrow.
- [ ] Next to the car or other metal: if the compass degrades, the app says so.

Language, scrolling and zoom
- [ ] Tap **DE** then **EN**: all text switches immediately. Close and reopen: the choice is kept.
- [ ] Drag up and down on the home and guidance screens: nothing moves or bounces.
- [ ] Pinch and double-tap anywhere outside the map: nothing zooms.
- [ ] Open the map: dragging and pinching the map itself still work.
- [ ] In parking details, tap the note field: the sheet stays above the keyboard with the field visible.

Offline
- [ ] Turn on Airplane Mode with Location Services still on. Open Parked: it loads, and the arrow and
      distance work once GPS has a fix. The map background is blank; that is expected.

## What a web app cannot do

- **Haptics.** Safari has no vibration API. The app attempts a tick through a hidden switch control, but
  iOS may ignore it, especially for the confirmation that arrives after the save completes.
- **Opening Settings.** A page cannot deep-link into iOS Settings, so recovery steps are written out.
- **Telling "permission denied" from "Location Services off".** Safari reports both the same way.
- **SF Symbols.** Not available or licensed for the web; the few icons are drawn by hand.
- **Maps.** MapKit is native-only. The secondary map uses OpenStreetMap tiles through Leaflet and needs
  an internet connection. The arrow and distance do not.
- **Storage guarantees.** Data lives in the browser's private storage for this site. Installing to the
  Home Screen protects it from Safari's seven-day cleanup; clearing website data in Settings deletes it.

Also by design: no underground navigation, no automatic floor detection, and no tracking of a car that
has been moved. Indoors, rely on the level, note and photo.

## Project layout

```
src/core/       Pure logic, no browser APIs, fully unit-tested
  geo.ts          bearing, distance, angle wrapping, arrow rotation
  wmm.ts          magnetic declination (World Magnetic Model 2025)
  smoothing.ts    shortest-arc angle smoothing
  readings.ts     validation and grading of location and compass readings
  acquisition.ts  bounded "best fresh fix" selection for saving
  guidance.ts     the engine: sensor readings in, what the screen may claim out
  session.ts      the saved parking session and its validation
  store.ts        atomic save / replace / clear with read-back verification
  format.ts       distance, accuracy and time wording
  i18n.ts         all on-screen text in English and German
src/platform/   Thin wrappers over browser APIs
  location.ts     Geolocation      compass.ts   DeviceOrientation
  storage.ts      IndexedDB        device.ts    haptics, wake lock
  sim.ts          DEBUG ONLY fake sensors (?sim=1)
src/ui/         Screens: guide.ts (arrow), map.ts, photo.ts, dom.ts,
                language.ts (EN/DE switch), viewport.ts (zoom lock, keyboard)
src/app.ts      Home screen and wiring
src/sw.ts       Service worker for offline use
tests/          node:test unit tests
scripts/        build.ts, serve.ts, make-icons.ps1
```

The only runtime dependency is Leaflet, copied into the build so nothing is loaded from a third-party
server except map tiles.
