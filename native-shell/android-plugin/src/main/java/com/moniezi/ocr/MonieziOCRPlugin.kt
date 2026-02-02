package com.moniezi.ocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.net.Uri
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.io.FileInputStream
import kotlin.math.roundToInt

/**
 * MonieziOCRPlugin - Native Android OCR using Google ML Kit
 *
 * This plugin provides high-accuracy text recognition that works 100% offline
 * using Google's on-device machine learning models.
 *
 * Accuracy: 95%+ for printed text (receipts, documents)
 * Languages: Supports Latin-based scripts (English, German, Italian, Spanish, Albanian, etc.)
 */
@CapacitorPlugin(name = "MonieziOCR")
class MonieziOCRPlugin : Plugin() {

    private val textRecognizer: TextRecognizer by lazy {
        // Use the bundled Latin text recognizer (works offline)
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }

    /**
     * Recognize all text in an image
     * @param image - Base64 encoded image or file URI
     * @returns { text: string, confidence: number, blocks: TextBlock[] }
     */
    @PluginMethod
    fun recognizeText(call: PluginCall) {
        val imageSource = call.getString("image")
        if (imageSource == null) {
            call.reject("Missing 'image' parameter")
            return
        }

        val bitmap = loadBitmap(imageSource)
        if (bitmap == null) {
            call.reject("Failed to load image")
            return
        }

        val inputImage = InputImage.fromBitmap(bitmap, 0)

        textRecognizer.process(inputImage)
            .addOnSuccessListener { visionText ->
                val result = processVisionText(visionText, bitmap.width, bitmap.height)
                call.resolve(result)
            }
            .addOnFailureListener { e ->
                call.reject("OCR failed: ${e.message}")
            }
    }

    /**
     * Recognize text with region information for better receipt parsing
     * Splits image into top (merchant), middle (items), bottom (totals) regions
     */
    @PluginMethod
    fun recognizeTextWithRegions(call: PluginCall) {
        val imageSource = call.getString("image")
        if (imageSource == null) {
            call.reject("Missing 'image' parameter")
            return
        }

        val bitmap = loadBitmap(imageSource)
        if (bitmap == null) {
            call.reject("Failed to load image")
            return
        }

        val inputImage = InputImage.fromBitmap(bitmap, 0)

        textRecognizer.process(inputImage)
            .addOnSuccessListener { visionText ->
                val result = processVisionTextWithRegions(visionText, bitmap.width, bitmap.height)
                call.resolve(result)
            }
            .addOnFailureListener { e ->
                call.reject("OCR failed: ${e.message}")
            }
    }

    /**
     * Process ML Kit result into our standard format
     */
    private fun processVisionText(visionText: Text, imageWidth: Int, imageHeight: Int): JSObject {
        val result = JSObject()
        val blocks = JSArray()

        val fullText = StringBuilder()
        var totalConfidence = 0f
        var elementCount = 0

        for (block in visionText.textBlocks) {
            for (line in block.lines) {
                fullText.append(line.text).append("\n")

                // ML Kit doesn't provide per-line confidence, but we can estimate
                // based on the recognition quality
                val lineConfidence = estimateConfidence(line)
                totalConfidence += lineConfidence
                elementCount++

                val blockObj = JSObject()
                blockObj.put("text", line.text)
                blockObj.put("confidence", lineConfidence)

                // Add bounding box (normalized 0-1)
                val bounds = JSObject()
                line.boundingBox?.let { rect ->
                    bounds.put("x", rect.left.toFloat() / imageWidth)
                    bounds.put("y", rect.top.toFloat() / imageHeight)
                    bounds.put("width", rect.width().toFloat() / imageWidth)
                    bounds.put("height", rect.height().toFloat() / imageHeight)
                }
                blockObj.put("bounds", bounds)

                blocks.put(blockObj)
            }
        }

        val avgConfidence = if (elementCount > 0) (totalConfidence / elementCount) * 100 else 0f

        result.put("text", fullText.toString().trim())
        result.put("confidence", avgConfidence.roundToInt())
        result.put("blocks", blocks)
        result.put("blockCount", elementCount)

        return result
    }

    /**
     * Process ML Kit result with region categorization
     */
    private fun processVisionTextWithRegions(visionText: Text, imageWidth: Int, imageHeight: Int): JSObject {
        val result = JSObject()

        // Region boundaries (percentage of image height)
        // Top 20% - merchant name, address
        // Middle 50% - items
        // Bottom 30% - totals
        val topThreshold = imageHeight * 0.20
        val bottomThreshold = imageHeight * 0.70

        val topTexts = mutableListOf<String>()
        val middleTexts = mutableListOf<String>()
        val bottomTexts = mutableListOf<String>()

        val topBlocks = JSArray()
        val middleBlocks = JSArray()
        val bottomBlocks = JSArray()

        var topConfidenceSum = 0f
        var middleConfidenceSum = 0f
        var bottomConfidenceSum = 0f

        var topCount = 0
        var middleCount = 0
        var bottomCount = 0

        val fullText = StringBuilder()

        for (block in visionText.textBlocks) {
            for (line in block.lines) {
                fullText.append(line.text).append("\n")

                val lineConfidence = estimateConfidence(line)
                val centerY = line.boundingBox?.centerY() ?: (imageHeight / 2)

                val blockObj = JSObject()
                blockObj.put("text", line.text)
                blockObj.put("confidence", lineConfidence)

                val bounds = JSObject()
                line.boundingBox?.let { rect ->
                    bounds.put("x", rect.left.toFloat() / imageWidth)
                    bounds.put("y", rect.top.toFloat() / imageHeight)
                    bounds.put("width", rect.width().toFloat() / imageWidth)
                    bounds.put("height", rect.height().toFloat() / imageHeight)
                }
                blockObj.put("bounds", bounds)

                when {
                    centerY < topThreshold -> {
                        topTexts.add(line.text)
                        topBlocks.put(blockObj)
                        topConfidenceSum += lineConfidence
                        topCount++
                    }
                    centerY > bottomThreshold -> {
                        bottomTexts.add(line.text)
                        bottomBlocks.put(blockObj)
                        bottomConfidenceSum += lineConfidence
                        bottomCount++
                    }
                    else -> {
                        middleTexts.add(line.text)
                        middleBlocks.put(blockObj)
                        middleConfidenceSum += lineConfidence
                        middleCount++
                    }
                }
            }
        }

        // Build regions object
        val regions = JSObject()

        val topRegion = JSObject()
        topRegion.put("text", topTexts.joinToString("\n"))
        topRegion.put("confidence", if (topCount > 0) ((topConfidenceSum / topCount) * 100).roundToInt() else 0)
        topRegion.put("blocks", topBlocks)
        regions.put("top", topRegion)

        val middleRegion = JSObject()
        middleRegion.put("text", middleTexts.joinToString("\n"))
        middleRegion.put("confidence", if (middleCount > 0) ((middleConfidenceSum / middleCount) * 100).roundToInt() else 0)
        middleRegion.put("blocks", middleBlocks)
        regions.put("middle", middleRegion)

        val bottomRegion = JSObject()
        bottomRegion.put("text", bottomTexts.joinToString("\n"))
        bottomRegion.put("confidence", if (bottomCount > 0) ((bottomConfidenceSum / bottomCount) * 100).roundToInt() else 0)
        bottomRegion.put("blocks", bottomBlocks)
        regions.put("bottom", bottomRegion)

        val totalCount = topCount + middleCount + bottomCount
        val totalConfidence = topConfidenceSum + middleConfidenceSum + bottomConfidenceSum
        val avgConfidence = if (totalCount > 0) (totalConfidence / totalCount) * 100 else 0f

        result.put("text", fullText.toString().trim())
        result.put("confidence", avgConfidence.roundToInt())
        result.put("regions", regions)

        return result
    }

    /**
     * Estimate confidence for a line of text
     * ML Kit doesn't provide direct confidence, so we use heuristics
     */
    private fun estimateConfidence(line: Text.Line): Float {
        // Base confidence on text characteristics
        var confidence = 0.85f // Base assumption for ML Kit accuracy

        val text = line.text

        // Reduce confidence for very short text
        if (text.length < 3) {
            confidence -= 0.1f
        }

        // Reduce confidence for unusual character patterns
        val alphanumericRatio = text.count { it.isLetterOrDigit() }.toFloat() / text.length.coerceAtLeast(1)
        if (alphanumericRatio < 0.5f) {
            confidence -= 0.1f
        }

        // Increase confidence for common receipt patterns
        val lowerText = text.lowercase()
        if (lowerText.contains("total") || lowerText.contains("subtotal") ||
            lowerText.contains("tax") || lowerText.contains("amount") ||
            text.matches(Regex(".*\\d+[.,]\\d{2}.*"))) {
            confidence += 0.05f
        }

        return confidence.coerceIn(0.1f, 1.0f)
    }

    /**
     * Load bitmap from various sources
     */
    private fun loadBitmap(source: String): Bitmap? {
        return try {
            when {
                // Base64 data URL
                source.startsWith("data:") -> {
                    loadBitmapFromDataUrl(source)
                }
                // File URI
                source.startsWith("file://") || source.startsWith("content://") -> {
                    loadBitmapFromUri(source)
                }
                // Capacitor file URL
                source.startsWith("capacitor://") || source.startsWith("http://localhost") -> {
                    loadBitmapFromCapacitorUrl(source)
                }
                // Raw base64
                source.length > 100 && !source.contains("/") -> {
                    val bytes = Base64.decode(source, Base64.DEFAULT)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                }
                // File path
                else -> {
                    BitmapFactory.decodeFile(source)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun loadBitmapFromDataUrl(dataUrl: String): Bitmap? {
        val commaIndex = dataUrl.indexOf(',')
        if (commaIndex == -1) return null

        val base64 = dataUrl.substring(commaIndex + 1)
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    private fun loadBitmapFromUri(uriString: String): Bitmap? {
        val uri = Uri.parse(uriString)
        val context = this.context ?: return null

        return context.contentResolver.openInputStream(uri)?.use { inputStream ->
            BitmapFactory.decodeStream(inputStream)
        }
    }

    private fun loadBitmapFromCapacitorUrl(urlString: String): Bitmap? {
        // Extract file path from Capacitor URL
        val path = urlString
            .replace("capacitor://localhost/_capacitor_file_", "")
            .replace("http://localhost/_capacitor_file_", "")

        val file = File(path)
        if (file.exists()) {
            return BitmapFactory.decodeFile(file.absolutePath)
        }

        return null
    }
}
