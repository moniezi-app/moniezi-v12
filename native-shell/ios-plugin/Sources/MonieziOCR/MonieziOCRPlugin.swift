import Foundation
import Capacitor
import Vision
import UIKit

/**
 * MonieziOCRPlugin - Native iOS OCR using Apple Vision Framework
 * 
 * This plugin provides high-accuracy text recognition that works 100% offline
 * using Apple's on-device machine learning models.
 * 
 * Accuracy: 95%+ for printed text (receipts, documents)
 * Languages: Supports 18+ languages including English, German, Italian, Spanish, etc.
 */
@objc(MonieziOCRPlugin)
public class MonieziOCRPlugin: CAPPlugin, CAPBridgedPlugin {
    
    public let identifier = "MonieziOCRPlugin"
    public let jsName = "MonieziOCR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognizeText", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recognizeTextWithRegions", returnType: CAPPluginReturnPromise)
    ]
    
    // MARK: - Simple Text Recognition
    
    /**
     * Recognize all text in an image
     * @param imageData - Base64 encoded image or file URI
     * @returns { text: string, confidence: number, blocks: TextBlock[] }
     */
    @objc func recognizeText(_ call: CAPPluginCall) {
        guard let imageSource = call.getString("image") else {
            call.reject("Missing 'image' parameter")
            return
        }
        
        // Load image from base64 or file URI
        guard let image = loadImage(from: imageSource) else {
            call.reject("Failed to load image")
            return
        }
        
        // Get recognition level (fast vs accurate)
        let useFastMode = call.getBool("fast") ?? false
        
        performOCR(on: image, fast: useFastMode) { result in
            switch result {
            case .success(let ocrResult):
                call.resolve(ocrResult)
            case .failure(let error):
                call.reject("OCR failed: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Region-Based Recognition (for receipts)
    
    /**
     * Recognize text with region information for better receipt parsing
     * Splits image into top (merchant), middle (items), bottom (totals) regions
     */
    @objc func recognizeTextWithRegions(_ call: CAPPluginCall) {
        guard let imageSource = call.getString("image") else {
            call.reject("Missing 'image' parameter")
            return
        }
        
        guard let image = loadImage(from: imageSource) else {
            call.reject("Failed to load image")
            return
        }
        
        performRegionBasedOCR(on: image) { result in
            switch result {
            case .success(let ocrResult):
                call.resolve(ocrResult)
            case .failure(let error):
                call.reject("OCR failed: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Core OCR Implementation
    
    private func performOCR(on image: UIImage, fast: Bool, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard let cgImage = image.cgImage else {
            completion(.failure(NSError(domain: "MonieziOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid image"])))
            return
        }
        
        // Create Vision request
        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
                return
            }
            
            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                DispatchQueue.main.async {
                    completion(.success([
                        "text": "",
                        "confidence": 0,
                        "blocks": []
                    ]))
                }
                return
            }
            
            // Process observations
            var fullText = ""
            var blocks: [[String: Any]] = []
            var totalConfidence: Float = 0
            var blockCount = 0
            
            for observation in observations {
                guard let topCandidate = observation.topCandidates(1).first else { continue }
                
                let text = topCandidate.string
                let confidence = topCandidate.confidence
                
                fullText += text + "\n"
                totalConfidence += confidence
                blockCount += 1
                
                // Get bounding box (normalized 0-1 coordinates, origin bottom-left)
                let boundingBox = observation.boundingBox
                
                blocks.append([
                    "text": text,
                    "confidence": confidence,
                    "bounds": [
                        "x": boundingBox.origin.x,
                        "y": 1 - boundingBox.origin.y - boundingBox.height, // Convert to top-left origin
                        "width": boundingBox.width,
                        "height": boundingBox.height
                    ]
                ])
            }
            
            let avgConfidence = blockCount > 0 ? (totalConfidence / Float(blockCount)) * 100 : 0
            
            DispatchQueue.main.async {
                completion(.success([
                    "text": fullText.trimmingCharacters(in: .whitespacesAndNewlines),
                    "confidence": avgConfidence,
                    "blocks": blocks,
                    "blockCount": blockCount
                ]))
            }
        }
        
        // Configure recognition
        request.recognitionLevel = fast ? .fast : .accurate
        request.usesLanguageCorrection = true
        
        // Support multiple languages for European receipts
        if #available(iOS 16.0, *) {
            request.automaticallyDetectsLanguage = true
        }
        
        // Set supported languages (including Albanian region languages)
        request.recognitionLanguages = ["en-US", "de-DE", "it-IT", "fr-FR", "es-ES", "pt-PT", "nl-NL", "pl-PL", "ro-RO", "hr-HR", "sl-SI", "sq-AL"]
        
        // Perform request
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
    }
    
    // MARK: - Region-Based OCR for Receipts
    
    private func performRegionBasedOCR(on image: UIImage, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard let cgImage = image.cgImage else {
            completion(.failure(NSError(domain: "MonieziOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid image"])))
            return
        }
        
        let imageHeight = CGFloat(cgImage.height)
        let imageWidth = CGFloat(cgImage.width)
        
        // Define regions (normalized coordinates)
        // Top 20% - typically merchant name, address
        // Middle 50% - items
        // Bottom 30% - totals, payment info
        let regions: [(name: String, rect: CGRect)] = [
            ("top", CGRect(x: 0, y: 0.8, width: 1.0, height: 0.2)),      // Top 20%
            ("middle", CGRect(x: 0, y: 0.3, width: 1.0, height: 0.5)),   // Middle 50%
            ("bottom", CGRect(x: 0, y: 0, width: 1.0, height: 0.3))      // Bottom 30%
        ]
        
        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
                return
            }
            
            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                DispatchQueue.main.async {
                    completion(.success(self.emptyRegionResult()))
                }
                return
            }
            
            // Categorize observations by region
            var regionTexts: [String: [String]] = ["top": [], "middle": [], "bottom": []]
            var regionBlocks: [String: [[String: Any]]] = ["top": [], "middle": [], "bottom": []]
            var regionConfidences: [String: [Float]] = ["top": [], "middle": [], "bottom": []]
            var fullText = ""
            
            for observation in observations {
                guard let topCandidate = observation.topCandidates(1).first else { continue }
                
                let text = topCandidate.string
                let confidence = topCandidate.confidence
                let boundingBox = observation.boundingBox
                
                fullText += text + "\n"
                
                // Determine which region this text belongs to
                let centerY = boundingBox.origin.y + boundingBox.height / 2
                
                var regionName = "middle"
                for (name, rect) in regions {
                    if centerY >= rect.origin.y && centerY <= rect.origin.y + rect.height {
                        regionName = name
                        break
                    }
                }
                
                regionTexts[regionName]?.append(text)
                regionConfidences[regionName]?.append(confidence)
                regionBlocks[regionName]?.append([
                    "text": text,
                    "confidence": confidence,
                    "bounds": [
                        "x": boundingBox.origin.x,
                        "y": 1 - boundingBox.origin.y - boundingBox.height,
                        "width": boundingBox.width,
                        "height": boundingBox.height
                    ]
                ])
            }
            
            // Calculate average confidences
            func avgConfidence(_ arr: [Float]) -> Float {
                guard !arr.isEmpty else { return 0 }
                return (arr.reduce(0, +) / Float(arr.count)) * 100
            }
            
            let result: [String: Any] = [
                "text": fullText.trimmingCharacters(in: .whitespacesAndNewlines),
                "confidence": avgConfidence(Array(regionConfidences.values.flatMap { $0 })),
                "regions": [
                    "top": [
                        "text": regionTexts["top"]?.joined(separator: "\n") ?? "",
                        "confidence": avgConfidence(regionConfidences["top"] ?? []),
                        "blocks": regionBlocks["top"] ?? []
                    ],
                    "middle": [
                        "text": regionTexts["middle"]?.joined(separator: "\n") ?? "",
                        "confidence": avgConfidence(regionConfidences["middle"] ?? []),
                        "blocks": regionBlocks["middle"] ?? []
                    ],
                    "bottom": [
                        "text": regionTexts["bottom"]?.joined(separator: "\n") ?? "",
                        "confidence": avgConfidence(regionConfidences["bottom"] ?? []),
                        "blocks": regionBlocks["bottom"] ?? []
                    ]
                ]
            ]
            
            DispatchQueue.main.async {
                completion(.success(result))
            }
        }
        
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        
        if #available(iOS 16.0, *) {
            request.automaticallyDetectsLanguage = true
        }
        
        request.recognitionLanguages = ["en-US", "de-DE", "it-IT", "fr-FR", "es-ES", "pt-PT", "nl-NL", "pl-PL", "ro-RO", "hr-HR", "sl-SI"]
        
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
    }
    
    private func emptyRegionResult() -> [String: Any] {
        return [
            "text": "",
            "confidence": 0,
            "regions": [
                "top": ["text": "", "confidence": 0, "blocks": []],
                "middle": ["text": "", "confidence": 0, "blocks": []],
                "bottom": ["text": "", "confidence": 0, "blocks": []]
            ]
        ]
    }
    
    // MARK: - Image Loading Helpers
    
    private func loadImage(from source: String) -> UIImage? {
        // Check if it's a base64 data URL
        if source.hasPrefix("data:") {
            return loadImageFromDataURL(source)
        }
        
        // Check if it's a file URL
        if source.hasPrefix("file://") || source.hasPrefix("capacitor://") {
            return loadImageFromFileURL(source)
        }
        
        // Try as raw base64
        if let data = Data(base64Encoded: source) {
            return UIImage(data: data)
        }
        
        // Try as file path
        if FileManager.default.fileExists(atPath: source) {
            return UIImage(contentsOfFile: source)
        }
        
        return nil
    }
    
    private func loadImageFromDataURL(_ dataURL: String) -> UIImage? {
        // Format: data:image/jpeg;base64,/9j/4AAQ...
        guard let commaIndex = dataURL.firstIndex(of: ",") else { return nil }
        let base64String = String(dataURL[dataURL.index(after: commaIndex)...])
        guard let data = Data(base64Encoded: base64String) else { return nil }
        return UIImage(data: data)
    }
    
    private func loadImageFromFileURL(_ urlString: String) -> UIImage? {
        // Handle capacitor:// URLs
        var path = urlString
        if path.hasPrefix("capacitor://localhost/_capacitor_file_") {
            path = path.replacingOccurrences(of: "capacitor://localhost/_capacitor_file_", with: "")
        }
        
        if let url = URL(string: path) {
            if let data = try? Data(contentsOf: url) {
                return UIImage(data: data)
            }
        }
        
        // Try direct file path
        let cleanPath = path.replacingOccurrences(of: "file://", with: "")
        return UIImage(contentsOfFile: cleanPath)
    }
}
