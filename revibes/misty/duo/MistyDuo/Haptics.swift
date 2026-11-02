import UIKit
import WebKit

// Plays the haptics the page asks for (window.webkit.messageHandlers.mistyHaptic, from
// src/lib/duo.js in the web app). A web page can't vibrate an iPhone on its own.
//
//   "level"  the fold crossed into another blend level: a selection tick, like a picker wheel
//   "select" holding still selected a level: a medium impact
//   "apply"  closing the phone applied the level: the success notification
@MainActor
final class Haptics: NSObject, WKScriptMessageHandler {
    static let name = "mistyHaptic"

    private let tick = UISelectionFeedbackGenerator()
    private let tap = UIImpactFeedbackGenerator(style: .medium)
    private let done = UINotificationFeedbackGenerator()

    override init() {
        super.init()
        tick.prepare()
        tap.prepare()
        done.prepare()
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let kind = message.body as? String else { return }
        #if DEBUG
        print("MistyDuo haptic: \(kind)")
        #endif
        switch kind {
        case "level":
            tick.selectionChanged()
            tick.prepare()
        case "select":
            tap.impactOccurred()
            tap.prepare()
        case "apply":
            done.notificationOccurred(.success)
            done.prepare()
        default:
            break
        }
    }
}
