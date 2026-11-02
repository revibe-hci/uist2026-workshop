import SwiftUI

// Postures, matching src/lib/duo.js in the web app.
private let closedBelow = 15.0

// The iPhone Duo's outer screen, in points (the simulator reports 1398 x 2034 px at 3x).
private let outerSize = CGSize(width: 466, height: 678)

// On a real iPhone Duo the window is on the outer screen when its short side is below this.
// The inner screen is 669 x 951 pt.
private let outerScreenMaxSide = 560.0

struct ContentView: View {
    // Starts open. The launch argument -MistyAngle <0-180> starts it at another angle.
    private static let startAngle = UserDefaults.standard.object(forKey: "MistyAngle") == nil
        ? 180 : UserDefaults.standard.double(forKey: "MistyAngle")
    @StateObject private var web = MistyWeb(angle: ContentView.startAngle)
    @State private var angle = ContentView.startAngle
    @State private var motion: Task<Void, Never>?
    // True while the device reports a real hinge. Then the system moves the app to the outer
    // screen when it closes, so the app stops drawing its own outer display and slider.
    @State private var realHinge = false
    // -MistySimulatedHinge YES keeps the slider on a real device, for demos.
    private let forceSimulated = UserDefaults.standard.bool(forKey: "MistySimulatedHinge")

    @State private var windowSize = CGSize.zero

    private var closed: Bool { angle < closedBelow }
    private var simulated: Bool { !realHinge || forceSimulated }

    // iOS decides which screen shows the app, with hysteresis: it moves to the outer screen
    // below about 10-30° when folded slowly (earlier when folded fast), and back to the inner
    // screen only above about 150-160°. So at 90° the app can be on either screen, and the page
    // follows the screen rather than the angle: on the outer screen it always shows the outer
    // display.
    private var onOuterScreen: Bool {
        realHinge && !forceSimulated && min(windowSize.width, windowSize.height) < outerScreenMaxSide
    }
    private var pageAngle: Double { onOuterScreen ? 0 : angle }

    var body: some View {
        GeometryReader { geo in
            let outer = fitted(outerSize, in: geo.size)
            let drawOuter = closed && simulated
            ZStack {
                Color.black

                MistyWebView(web: web)
                    .frame(width: drawOuter ? outer.width : geo.size.width,
                           height: drawOuter ? outer.height : geo.size.height)
                    .clipShape(RoundedRectangle(cornerRadius: drawOuter ? 38 : 0, style: .continuous))
                    .animation(.spring(duration: 0.45), value: drawOuter)

                if simulated && !closed {
                    HingeShade(angle: angle).allowsHitTesting(false)
                } else if drawOuter {
                    Text("Outer display (simulated)")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.white.opacity(0.7))
                        .offset(y: -outer.height / 2 - 18)
                }

                if let error = web.loadError {
                    LoadErrorCard(error: error, retry: web.reload, connect: web.connect(to:))
                }

                if simulated {
                    VStack {
                        Spacer()
                        HingeControl(angle: $angle, move: move(to:))
                            .padding(.bottom, max(geo.safeAreaInsets.bottom, 10))
                    }
                }
            }
            .ignoresSafeArea()
            .onChange(of: foldRect(in: geo), initial: true) { _, rect in web.setFold(rect) }
            .onChange(of: geo.size, initial: true) { _, size in windowSize = size }
        }
        .ignoresSafeArea()
        .statusBarHidden(closed && simulated)
        .onHinge { reading in
            realHinge = reading != nil
            if let reading, !forceSimulated {
                motion?.cancel()
                angle = reading.degrees
            }
        }
        .onChange(of: pageAngle) { _, value in web.setPosture(value) }
        .task {
            // Test hook: -MistyAutoFold <angle> moves the hinge there a few seconds after launch.
            if UserDefaults.standard.object(forKey: "MistyAutoFold") != nil {
                try? await Task.sleep(for: .seconds(6))
                move(to: UserDefaults.standard.double(forKey: "MistyAutoFold"))
            }
        }
    }

    // Scale the outer display down if the screen is too small to show it at full size.
    private func fitted(_ size: CGSize, in space: CGSize) -> CGSize {
        let scale = min(1, (space.height - 120) / size.height, (space.width - 40) / size.width)
        return CGSize(width: size.width * scale, height: size.height * scale)
    }

    // Close or open the phone gradually, so the fold scrub plays on the way.
    private func move(to target: Double) {
        motion?.cancel()
        let start = angle
        motion = Task { @MainActor in
            let steps = 60
            for step in 1...steps {
                try? await Task.sleep(for: .milliseconds(25))
                if Task.isCancelled { return }
                let t = Double(step) / Double(steps)
                let eased = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
                angle = start + (target - start) * eased
            }
        }
    }
}

// Darkens both halves toward the hinge as the phone folds, so the posture is visible.
struct HingeShade: View {
    let angle: Double
    var body: some View {
        let depth = (180 - angle) / 180 * 0.55
        HStack(spacing: 0) {
            LinearGradient(colors: [.clear, .black.opacity(depth)], startPoint: .leading, endPoint: .trailing)
            Rectangle().fill(.black.opacity(depth > 0.01 ? 0.25 : 0)).frame(width: 1)
            LinearGradient(colors: [.black.opacity(depth), .clear], startPoint: .leading, endPoint: .trailing)
        }
        .opacity(depth > 0.01 ? 1 : 0)
    }
}

struct HingeControl: View {
    @Binding var angle: Double
    let move: (Double) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: angle < closedBelow ? "iphone" : "book")
                .frame(width: 18)
            Text("Simulated hinge")
                .font(.footnote.weight(.medium))
            Slider(value: $angle, in: 0...180)
                .frame(width: 200)
            Text("\(Int(angle.rounded()))°")
                .font(.footnote.monospacedDigit())
                .frame(width: 36, alignment: .trailing)
            Button("Close") { move(0) }
            Button("Open") { move(180) }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: Capsule())
    }
}

struct LoadErrorCard: View {
    let error: String
    let retry: () -> Void
    let connect: (String) -> Void
    @State private var address = ""

    var body: some View {
        VStack(spacing: 12) {
            Text("Can't reach Misty").font(.headline)
            Text("Loading \(MistyWeb.url.absoluteString) failed: \(error)")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Text("On the Mac, run: cd revibes/misty/app && npm run dev:phone\nThen type the Mac's address (ipconfig getifaddr en0).")
                .font(.footnote)
                .multilineTextAlignment(.center)
            TextField("Mac address, e.g. 192.168.1.20", text: $address)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit { connect(address) }
            HStack {
                Button("Try again", action: retry).buttonStyle(.bordered)
                Button("Connect") { connect(address) }
                    .buttonStyle(.borderedProminent)
                    .disabled(address.isEmpty)
            }
        }
        .padding(20)
        .frame(maxWidth: 400)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}
