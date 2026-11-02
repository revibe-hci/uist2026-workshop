import SwiftUI

// The real hinge, on iOS 27.1 and later (SwiftUI's onHingeChange and DeviceHinge).
// Devices without a hinge, and older iOS, report nothing, and the app keeps its simulated slider.

struct HingeReading: Equatable {
    var degrees: Double  // 0 closed, 180 flat, matching the web app
}

// Calls `update` with each hinge reading, or nil when the view has no hinge to report.
struct HingeObserver: ViewModifier {
    let update: (HingeReading?) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 27.1, *) {
            content.onHingeChange { _, context in
                update(context.hinge.map(Self.reading))
            }
        } else {
            content
        }
    }

    // The status is the reliable signal, so it wins at the ends of the range. The angle's update
    // rate and precision are system policy, so it only fills in the partly open range.
    @available(iOS 27.1, *)
    private static func reading(_ hinge: DeviceHinge) -> HingeReading {
        switch hinge.status {
        case .closed: return HingeReading(degrees: 0)
        case .fullyOpen: return HingeReading(degrees: 180)
        default: return HingeReading(degrees: min(max(hinge.angle.degrees, 0), 180))
        }
    }
}

extension View {
    func onHinge(_ update: @escaping (HingeReading?) -> Void) -> some View {
        modifier(HingeObserver(update: update))
    }
}

// Where the fold divides the screen, in the proxy's coordinates (iOS 27.1 "division" region).
func foldRect(in geo: GeometryProxy) -> CGRect? {
    guard #available(iOS 27.1, *) else { return nil }
    return geo.reservedRegions(kind: .division).first(where: \.isActive)?.frame
}
