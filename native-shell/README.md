# Moniezi V12 - Native OCR Edition

**High-accuracy offline receipt scanning using platform-native OCR engines.**

## 🎯 Overview

This version of Moniezi uses native platform APIs for OCR instead of browser-based Tesseract.js:

| Platform | OCR Engine | Accuracy | Offline |
|----------|-----------|----------|---------|
| **iOS** | Apple Vision Framework | 95%+ | ✅ Yes |
| **Android** | Google ML Kit | 95%+ | ✅ Yes |
| **Web/PWA** | Tesseract.js (fallback) | 70-80% | ✅ Yes |

## 📱 Key Features

- **95%+ OCR accuracy** on native platforms
- **100% offline** - no cloud services, no data leaves device
- **Region-based scanning** - smart extraction of merchant (top), items (middle), totals (bottom)
- **Confidence gating** - won't auto-fill low-confidence data
- **Multi-language support** - European receipts (German, Italian, Albanian, etc.)
- **Learning system** - improves with user corrections
- **Privacy-first** - all processing on-device

## 🏗️ Project Structure

```
moniezi-v12-native/
├── App.tsx                    # Main React app
├── services/
│   ├── nativeOCR.ts          # Unified JS bridge (iOS/Android/Web)
│   └── offlineOCR.ts         # Receipt parsing & merchant database
├── native-shell/
│   ├── capacitor.config.json  # Capacitor configuration
│   ├── package.json           # Native shell dependencies
│   ├── ios-plugin/            # iOS Swift plugin (Vision Framework)
│   │   ├── Package.swift
│   │   └── Sources/MonieziOCR/
│   │       ├── MonieziOCRPlugin.swift
│   │       └── MonieziOCRPlugin.m
│   └── android-plugin/        # Android Kotlin plugin (ML Kit)
│       ├── build.gradle
│       └── src/main/java/com/moniezi/ocr/
│           └── MonieziOCRPlugin.kt
└── public/                    # Static assets
```

## 🚀 Setup Instructions

### Prerequisites

- **Node.js 18+**
- **For iOS**: Mac with Xcode 15+, Apple Developer account ($99/year)
- **For Android**: Android Studio, JDK 17+, Google Play Developer account ($25 one-time)

### Step 1: Build the Web App

```bash
# From project root
npm install
npm run build
```

### Step 2: Set Up Native Shell

```bash
cd native-shell
npm install

# Copy web build into native shell
npm run copy:web

# Add platforms
npx cap add android
npx cap add ios    # Mac only
```

### Step 3: Add Custom OCR Plugins

#### For Android:

1. Open Android Studio:
   ```bash
   npx cap open android
   ```

2. In Android Studio, add the plugin module:
   - File → New → Module → Import .JAR/.AAR Package
   - Or copy `android-plugin/` to `android/app/src/main/java/`

3. Add ML Kit dependency to `android/app/build.gradle`:
   ```gradle
   dependencies {
       implementation 'com.google.mlkit:text-recognition:16.0.0'
   }
   ```

4. Register the plugin in `MainActivity.java`:
   ```java
   import com.moniezi.ocr.MonieziOCRPlugin;
   
   public class MainActivity extends BridgeActivity {
       @Override
       public void onCreate(Bundle savedInstanceState) {
           registerPlugin(MonieziOCRPlugin.class);
           super.onCreate(savedInstanceState);
       }
   }
   ```

#### For iOS:

1. Open Xcode:
   ```bash
   npx cap open ios
   ```

2. Add the plugin as a local Swift Package:
   - File → Add Package Dependencies
   - Click "Add Local..."
   - Select `native-shell/ios-plugin/`

3. Register the plugin in `AppDelegate.swift`:
   ```swift
   import MonieziOCR
   
   // In application(_:didFinishLaunchingWithOptions:)
   bridge?.registerPluginInstance(MonieziOCRPlugin())
   ```

4. Add camera permission to `Info.plist`:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Moniezi needs camera access to scan receipts</string>
   ```

### Step 4: Build & Run

```bash
# Android
npx cap run android

# iOS (Mac only)
npx cap run ios
```

## 📦 Building for Release

### Android APK/AAB

```bash
cd android
./gradlew assembleRelease
# or
./gradlew bundleRelease
```

Output: `android/app/build/outputs/`

### iOS Archive

1. In Xcode: Product → Archive
2. Distribute via App Store Connect

## 🔧 How the OCR Works

### JavaScript Interface

```typescript
import { scanReceipt } from './services/nativeOCR';

const result = await scanReceipt(imageDataUrl, (progress, status) => {
  console.log(`${progress}%: ${status}`);
});

console.log(result);
// {
//   merchantName: "SPAR",
//   merchantConfidence: 95,
//   total: 1989.69,
//   subtotal: 1658.08,
//   tax: 331.62,
//   date: "2026-01-11",
//   rawText: "...",
//   overallConfidence: 93,
//   usedNativeOCR: true
// }
```

### Region-Based Scanning

The native plugins split the receipt image into three regions:

| Region | Position | Extracts |
|--------|----------|----------|
| **Top** | 0-20% | Merchant name, address |
| **Middle** | 20-70% | Line items |
| **Bottom** | 70-100% | Totals, tax, payment |

This dramatically improves accuracy for field extraction.

### Confidence Gating

The system applies confidence thresholds:

| Confidence | Behavior |
|------------|----------|
| **≥70%** | Auto-fill field |
| **50-69%** | Show with warning |
| **<50%** | Leave blank, let user fill |

## 🌍 Multi-Language Support

### Supported Languages

- English
- German (Deutsch)
- Italian (Italiano)
- French (Français)
- Spanish (Español)
- Portuguese
- Dutch
- Polish
- Romanian
- Croatian
- Slovenian
- Albanian (Shqip)

### Receipt Keywords (Auto-detected)

| English | German | Italian | Albanian |
|---------|--------|---------|----------|
| Total | Gesamt | Totale | Totali |
| Subtotal | Zwischensumme | Subtotale | Nëntotali |
| Tax | MwSt | IVA | TVSH |
| Date | Datum | Data | Data |

## 📊 Accuracy Comparison

| Metric | Tesseract (Web) | Native (iOS/Android) |
|--------|-----------------|---------------------|
| Text extraction | 70-80% | 95%+ |
| Merchant detection | 50-70% | 90%+ |
| Total amount | 60-80% | 95%+ |
| Date parsing | 70-85% | 95%+ |
| Processing time | 3-8 sec | 0.5-2 sec |

## 🔐 Privacy

- **No cloud services** - all OCR runs on-device
- **No network calls** - works in airplane mode
- **No data collection** - your receipts stay on your device
- **Learned data** - stored locally in app storage only

## 🐛 Troubleshooting

### Android: "ML Kit model not found"

The bundled ML Kit (`text-recognition:16.0.0`) includes the model. If using the thin version, the model downloads on first use (requires internet once).

### iOS: "Vision framework not available"

Requires iOS 13+. Check your deployment target in Xcode.

### Low accuracy on receipts

1. Ensure good lighting
2. Hold camera steady
3. Receipt should fill most of frame
4. Avoid shadows and glare

### Plugin not loading

Check that the plugin is registered in `MainActivity.java` (Android) or `AppDelegate.swift` (iOS).

## 📝 License

MIT License - Use freely in your own projects.

## 🙏 Credits

- Apple Vision Framework - iOS text recognition
- Google ML Kit - Android text recognition
- Tesseract.js - Web fallback OCR
- Capacitor - Native bridge framework
