import AVFoundation
import CoreImage
import CoreVideo
import Foundation

struct CropBounds: Codable {
  var minX: Int
  var minY: Int
  var maxX: Int
  var maxY: Int
  var width: Int
  var height: Int
  var frameCount: Int
}

func usage() -> Never {
  fputs("Usage: swift ExtractMemojiFrames.swift <input.mov> <output-dir> [--every n] [--crop-json path]\n", stderr)
  exit(64)
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard arguments.count >= 2 else { usage() }

let inputURL = URL(fileURLWithPath: arguments[0])
let outputURL = URL(fileURLWithPath: arguments[1], isDirectory: true)
var every = 1
var cropJSONPath: String?
var index = 2

while index < arguments.count {
  switch arguments[index] {
  case "--every":
    guard index + 1 < arguments.count, let parsed = Int(arguments[index + 1]), parsed > 0 else { usage() }
    every = parsed
    index += 2
  case "--crop-json":
    guard index + 1 < arguments.count else { usage() }
    cropJSONPath = arguments[index + 1]
    index += 2
  default:
    usage()
  }
}

try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)

let asset = AVURLAsset(url: inputURL)
let semaphore = DispatchSemaphore(value: 0)
var loadedTrack: AVAssetTrack?
var loadedError: Error?

asset.loadTracks(withMediaType: .video) { tracks, error in
  loadedTrack = tracks?.first
  loadedError = error
  semaphore.signal()
}
semaphore.wait()

if let loadedError {
  fputs("Could not load video track: \(loadedError.localizedDescription)\n", stderr)
  exit(1)
}
guard let videoTrack = loadedTrack else {
  fputs("No video track found in \(inputURL.path)\n", stderr)
  exit(1)
}

let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(
  track: videoTrack,
  outputSettings: [
    String(kCVPixelBufferPixelFormatTypeKey): NSNumber(value: kCVPixelFormatType_32BGRA)
  ]
)
output.alwaysCopiesSampleData = false
reader.add(output)

let context = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB) as Any])
guard reader.startReading() else {
  fputs("Could not start AVAssetReader: \(reader.error?.localizedDescription ?? "unknown error")\n", stderr)
  exit(1)
}

var sourceFrameIndex = 0
var exportedFrameIndex = 0
var bounds: CropBounds?

func updateBounds(from pixelBuffer: CVPixelBuffer) {
  CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

  guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }
  let width = CVPixelBufferGetWidth(pixelBuffer)
  let height = CVPixelBufferGetHeight(pixelBuffer)
  let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
  let bytes = base.assumingMemoryBound(to: UInt8.self)

  var minX = width
  var minY = height
  var maxX = -1
  var maxY = -1

  for y in 0..<height {
    let row = bytes + y * bytesPerRow
    for x in 0..<width {
      let alpha = row[x * 4 + 3]
      if alpha > 8 {
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
      }
    }
  }

  guard maxX >= minX, maxY >= minY else { return }
  if var current = bounds {
    current.minX = min(current.minX, minX)
    current.minY = min(current.minY, minY)
    current.maxX = max(current.maxX, maxX)
    current.maxY = max(current.maxY, maxY)
    current.frameCount = exportedFrameIndex + 1
    bounds = current
  } else {
    bounds = CropBounds(
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      width: width,
      height: height,
      frameCount: exportedFrameIndex + 1
    )
  }
}

while let sampleBuffer = output.copyNextSampleBuffer() {
  defer { sourceFrameIndex += 1 }
  guard sourceFrameIndex % every == 0 else { continue }
  guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { continue }

  updateBounds(from: imageBuffer)

  let image = CIImage(cvPixelBuffer: imageBuffer)
  let fileURL = outputURL.appendingPathComponent(String(format: "frame-%05d.png", exportedFrameIndex))
  try context.writePNGRepresentation(
    of: image,
    to: fileURL,
    format: .RGBA8,
    colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
    options: [:]
  )
  exportedFrameIndex += 1
}

guard reader.status == .completed else {
  fputs("Reader failed: \(reader.error?.localizedDescription ?? "unknown error")\n", stderr)
  exit(1)
}

if let cropJSONPath, let bounds {
  let data = try JSONEncoder().encode(bounds)
  try data.write(to: URL(fileURLWithPath: cropJSONPath), options: .atomic)
}

print("exported \(exportedFrameIndex) frames")
