# Misty Duo: Misty on a foldable iPhone (table 7 remix)

A SwiftUI app that runs Misty in a web view on the iPhone Duo. The fold drives Misty:

| Hinge | What shows |
|---|---|
| Open, above 165° | The full Misty canvas, on the inner display |
| Folding, 15° to 165° | **Pick a blend level:** the angle sets how much of the selected blend to keep, with a preview. Hold still to select a level. |
| Closed, below 15° | **Apply it:** closing applies the selected level. **Outer display:** the selected Code Render at phone width, still interactive. For a blend, **change switches** along the bottom turn each change category on or off with one thumb. |

**Blend levels.** A blend with N change categories has levels 0 (the original) to N (the full
blend); level k keeps its first k categories. Folding from open to shut moves from level N down to
0. While folding, a track under the levels fills continuously with the angle, with a live
percentage, while the highlighted level snaps to the nearest whole level. A level counts as selected once it is held for 0.7 s, so the levels passed on the way down while
closing do not replace it. The preview is exact for levels already cached (0, N, and any applied
before) and an approximate cross-fade otherwise. Closing applies the selected level: from the
cache, or with one model call. Closing without holding a level changes nothing.

**Haptics.** On the phone, crossing into a new level while folding plays a light tick (like a
picker wheel), holding still to select a level plays a firmer tap, and closing to apply it plays
the success pattern. The page asks the app for each one (`mistyHaptic`), since a web page can't
vibrate an iPhone. A fast close also ticks as it passes levels; that doesn't change the selection.

**Touch and Select.** On a phone (or with `?duo`) the toolbar has a Touch / Select switch for
what a one-finger drag on content does. Touch, the default: it pans the canvas, even over an
example or a rendered UI, and a tap selects a UI; nodes don't move by accident. Select: it picks a
section of an example and drags it onto a UI, moves nodes, and connects the handle for a global
blend. Empty canvas pans and pinch zooms in both. The choice is remembered on the device. Without
a touch screen the switch is hidden.

**Level meter.** On the outer screen, a vertical meter in the strip under the clock shows the
level the app understood, from the full blend at the top to the original at the bottom. It appears
the moment the phone closes, pulses when the level came from the fold, and follows the change
switches; a combination that is not a level reads "Mix".

The change switches are the canvas's Applied Changes toggles: all on, all off and any combination
already seen come from the cache, and a new combination asks the model once. Reset turns them all
back on with no model call.

The fold and the outer display follow the selected Code Render, or the latest blend when nothing
is selected. When the system reports where the fold divides the inner screen, the level picker sits on the left
half and the preview on the right half, off the crease.

## Hinge: real or simulated

- **iOS 27.1 and later, on an iPhone Duo:** the app reads the real hinge with SwiftUI's
  `onHingeChange` (status and angle) and the fold position with `reservedRegions(kind: .division)`.
  It hides its slider. iOS moves the app between the screens itself, and Misty follows the screen
  it is on: the outer screen always shows the outer display, the inner screen shows the canvas or
  the fold scrub.
- **Anywhere else** (older iOS, the iPad mini simulator, a browser): a "Simulated hinge" slider
  stands in, and the app draws a 466 x 678 pt outer display when closed. Launch with
  `-MistySimulatedHinge YES` to keep the slider on a real iPhone Duo.

**What iOS does with the screens** (measured in the iPhone Duo simulator, iOS 27.2 build
24B91016s): folding slowly keeps the app on the inner screen down to about 10-30°, while a quick
fold moves it to the outer screen as early as 60°. Opening from closed keeps it on the outer screen
until about 150-160°. So at 90° the app can be on either screen. The app tells them apart by size:
the outer screen is 466 x 678 pt and the inner one 669 x 951 pt.

## Demo blend

`?duo&demo` starts Misty from a recorded blend (`../app/src/lib/duo-demo.json`): the "Store:
featured card" example blended onto the parks UI, selected. Fold right away, with no model call.
It replaces the saved canvas each time it loads. In the app: `-MistyURL "http://localhost:5173/?duo&demo"`.

## Run on a physical iPhone Duo

Tested on an iPhone Duo (iOS 27.2, build 24B91020), by cable and over eduroam.

1. **On the phone,** turn on Settings > Privacy & Security > Developer Mode (the phone restarts),
   connect it to the Mac by cable, and trust the Mac.
2. **On the Mac,** start the bridge as in `../app/README.md`, then serve Misty in phone mode:

   ```bash
   cd revibes/misty/app && npm run dev:phone
   ```

3. **Build, install and trust.** In Xcode, open `MistyDuo.xcodeproj`, pick your team under Signing
   & Capabilities (the Personal Team works), pick the phone, and press Run. Or from a terminal,
   with your team ID and the phone's ID from `xcrun devicectl list devices`:

   ```bash
   cd revibes/misty/duo && xcodebuild -project MistyDuo.xcodeproj -scheme MistyDuo -destination 'id=<phone id>' -derivedDataPath build -allowProvisioningUpdates DEVELOPMENT_TEAM=<team id> build
   ```

   ```bash
   xcrun devicectl device install app --device <phone id> revibes/misty/duo/build/Build/Products/Debug-iphoneos/MistyDuo.app
   ```

   The first time, the phone refuses to open it: trust your Apple ID in Settings > General >
   VPN & Device Management.
4. **Point the app at the Mac over the cable.** The cable gives the Mac a link-local address
   (169.254.x.x), which works even when the phone is on cellular and needs no Wi-Fi. Find it with:

   ```bash
   ifconfig | grep "inet 169.254"
   ```

   Type it into the app's card, or launch with it (the app saves it for later launches):

   ```bash
   xcrun devicectl device process launch --device <phone id> --terminate-existing hci.revibe.misty.duo -- -MistyURL 'http://169.254.x.x:5173/?duo&demo'
   ```

   The address can change when the cable is reconnected.

**Without a cable (tested on eduroam).** Eduroam gives each device a public address and, here,
let the phone reach the Mac directly. The dev server's guard refuses public addresses until you
allow them:

1. Find the Mac's address with `ipconfig getifaddr en0` and launch the app with it (or type it
   into the app's card):

   ```bash
   xcrun devicectl device process launch --device <phone id> --terminate-existing hci.revibe.misty.duo -- -MistyURL 'http://<mac address>:5173/?duo&demo'
   ```

2. The dev server logs `[misty] refused <phone address>`. Restart it allowing that address:

   ```bash
   cd revibes/misty/app && PHONE_IPS=<phone address> npm run dev:phone
   ```

3. Relaunch or reload the app. Both addresses can change when either device rejoins the network,
   so repeat this at the start of a session. Some eduroam sites block traffic between devices;
   then use the cable. Only the listed address can use the bridge through the dev server.

To see the phone's screens from the Mac, `xcrun devicectl device capture screenshot` takes the
outer screen by default; add `--display-unique-id` with an ID from
`xcrun devicectl device info displays` for the inner one.

## Run in a simulator

**iPhone Duo simulator.** It needs its own runtime, `iOS-27-2-iPhone19-4`. The regular iOS 27.2
runtime does not include the iPhone Duo and fails with "Incompatible device".
`xcodebuild -downloadPlatform iOS` on Xcode 27.2 downloads both, about 16 GB in total. Then:

```bash
xcrun simctl create "iPhone Duo" com.apple.CoreSimulator.SimDeviceType.iPhone-Duo
```

```bash
cd revibes/misty/duo && xcodebuild -project MistyDuo.xcodeproj -scheme MistyDuo -destination 'platform=iOS Simulator,name=iPhone Duo' -derivedDataPath build build
```

Move the hinge in Device Hub (Xcode > Open Developer Tool > Device Hub; hold Option for the
angle slider), or from a terminal with the third-party `hinge` tool
(`brew install artemnovichkov/tap/hinge`; it uses a private Apple protocol):

```bash
hinge sweep 180 0 3
```

**iPad mini simulator:** works with any installed runtime and uses the simulated hinge.

```bash
cd revibes/misty/duo && xcodebuild -project MistyDuo.xcodeproj -scheme MistyDuo -destination 'platform=iOS Simulator,name=iPad mini (A17 Pro)' -derivedDataPath build build
```

If `xcodebuild` says the developer directory is the command line tools, point it at Xcode once
with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.

Launch arguments, for demos and testing:

- `-MistyAngle 90` starts the simulated hinge at 90°.
- `-MistyAutoFold 0` moves the simulated hinge to 0° six seconds after launch.
- `-MistyURL http://192.168.1.20:5173/?duo` loads Misty from another address.
- `-MistySimulatedHinge YES` uses the slider even when a real hinge is present.

## Without the iOS app

Open http://localhost:5173/?duo in a browser. A "Simulated hinge" slider appears at the top
right and drives the same three postures.

## Files

- `MistyDuo/Hinge.swift`: the real hinge and fold position (iOS 27.1).
- `MistyDuo/Haptics.swift`: plays the haptics the page asks for.
- `MistyDuo/ContentView.swift`: the simulated hinge slider, outer display frame and fold shading.
- `MistyDuo/MistyWeb.swift`: the web view, the Mac address, and passing hinge state to the page.
- `Info.plist`: local network access for the dev server.
- `../app/src/lib/duo.js`: postures, angle and fold position in the web app.
- `../app/src/components/DuoView.jsx`: the fold scrub, the outer display, the browser slider.
- `../app/src/lib/duo-demo.json`: the recorded demo blend.
- `../app/vite.config.js`: `/bridge` forwarding and the address guard for `npm run dev:phone`.
