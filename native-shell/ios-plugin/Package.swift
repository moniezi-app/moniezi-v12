// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MonieziOCR",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "MonieziOCR",
            targets: ["MonieziOCRPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", branch: "main")
    ],
    targets: [
        .target(
            name: "MonieziOCRPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "Sources/MonieziOCR")
    ]
)
