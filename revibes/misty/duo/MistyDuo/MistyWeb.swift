import SwiftUI
import WebKit

// Owns the web view that runs Misty, and passes the hinge angle to it.
@MainActor
final class MistyWeb: NSObject, ObservableObject, WKNavigationDelegate {
    let webView: WKWebView
    @Published var loadError: String?
    private var angle: Double = 180

    // The Vite dev server. Override with the launch argument -MistyURL <url>.
    static var url: URL {
        let custom = UserDefaults.standard.string(forKey: "MistyURL")
        return URL(string: custom ?? "http://localhost:5173/?duo")!
    }

    init(angle: Double) {
        self.angle = angle
        // A -MistyURL launch argument only lasts for that launch, so save it: opening the app
        // from the home screen later uses the same address.
        if let given = UserDefaults.standard.volatileDomain(forName: UserDefaults.argumentDomain)["MistyURL"] as? String {
            UserDefaults.standard.set(given, forKey: "MistyURL")
        }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()  // keeps Misty's saved canvas between launches
        let controller = config.userContentController
        // Tells the page it runs inside this shell, so it hides its own browser hinge slider.
        controller.addUserScript(WKUserScript(
            source: "window.__mistyDuoShell = true; window.__mistyDuoAngle = \(angle);",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // The canvas handles pinch zoom itself, so stop the page from zooming as well.
        controller.addUserScript(WKUserScript(
            source: """
            document.querySelector('meta[name=viewport]')?.setAttribute('content',
              'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
            """,
            injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        // The page asks for haptics through this handler (the controller keeps it alive).
        controller.add(Haptics(), name: Haptics.name)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.isInspectable = true  // Safari > Develop > Simulator, for debugging
        webView.scrollView.bounces = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        super.init()
        webView.navigationDelegate = self
        reload()
    }

    func reload() {
        loadError = nil
        webView.load(URLRequest(url: Self.url))
    }

    // On a real phone, localhost is the phone itself: type the Mac's address instead. It is saved,
    // so later launches use it. Accepts "192.168.1.20", "192.168.1.20:5173" or a full URL.
    func connect(to address: String) {
        var text = address.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.contains("://") { text = "http://" + text }
        guard var parts = URLComponents(string: text), parts.host != nil else {
            loadError = "\(address) is not an address."
            return
        }
        if parts.port == nil { parts.port = 5173 }
        if parts.query == nil { parts.query = "duo" }
        guard let url = parts.url else { return }
        UserDefaults.standard.set(url.absoluteString, forKey: "MistyURL")
        reload()
    }

    func setPosture(_ value: Double) {
        angle = value
        webView.evaluateJavaScript("window.mistyDuo && window.mistyDuo.setPosture(\(value)); true") { _, error in
            if let error { print("MistyDuo: posture not sent: \(error)") }
        }
    }

    // Where the fold divides the inner screen, in web pixels (points), or nil if there is none.
    private var fold: CGRect?

    func setFold(_ rect: CGRect?) {
        fold = rect
        let json = rect.map { "{x:\($0.minX),y:\($0.minY),width:\($0.width),height:\($0.height)}" } ?? "null"
        webView.evaluateJavaScript("window.mistyDuo && window.mistyDuo.setFold(\(json)); true")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        setPosture(angle)
        setFold(fold)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadError = error.localizedDescription
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadError = error.localizedDescription
    }
}

struct MistyWebView: UIViewRepresentable {
    let web: MistyWeb
    func makeUIView(context: Context) -> WKWebView { web.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
