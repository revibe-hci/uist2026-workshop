import SwiftUI

// Misty on a foldable iPhone (table 7 remix). The app hosts the Misty web app and simulates
// the hinge: no public API reports a foldable iPhone's fold angle, so a slider stands in for it.
@main
struct MistyDuoApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
