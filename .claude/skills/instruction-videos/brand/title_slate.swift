import AppKit
import CoreText

let args = CommandLine.arguments
let logoPath = args[1], regularPath = args[2], boldPath = args[3], outPath = args[4]
let label = args[5], title = args[6]
let opaque = args.count > 7 && args[7] == "white"
for p in [regularPath, boldPath] { CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: p) as CFURL, .process, nil) }

let W = 1440.0, H = 900.0
let logo = NSImage(contentsOfFile: logoPath)!
let lr = logo.representations.first!
let logoW = 700.0
let logoH = logoW * Double(lr.pixelsHigh) / Double(lr.pixelsWide)
let dark = NSColor(srgbRed: 0x1A / 255.0, green: 0x1A / 255.0, blue: 0x1A / 255.0, alpha: 1)
let blue = NSColor(srgbRed: 0x00 / 255.0, green: 0x55 / 255.0, blue: 0xB2 / 255.0, alpha: 1)
let gray = NSColor(srgbRed: 0x6B / 255.0, green: 0x72 / 255.0, blue: 0x80 / 255.0, alpha: 1)
let para = NSMutableParagraphStyle(); para.alignment = .center

func attributed(_ text: String, _ font: NSFont, _ color: NSColor, kern: Double = 0.5) -> NSAttributedString {
  NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: para, .kern: kern])
}

let regular = { (size: Double) in NSFont(name: "AzoftSans", size: size)! }
let bold = { (size: Double) in NSFont(name: "AzoftSans-Bold", size: size) ?? NSFont(name: "AzoftSans", size: size)! }

let subtitle = attributed("Личный кабинет работника", regular(36), dark, kern: 1.0)
let labelStr = attributed(label, regular(26), gray, kern: 1.0)
var titleSize = 60.0
var titleStr = attributed(title, bold(titleSize), blue)
while titleStr.size().width > W - 200 && titleSize > 30 {
  titleSize -= 2
  titleStr = attributed(title, bold(titleSize), blue)
}

let gapLogo = logoH / 3.0 + 8
let gapTitleBlock = 72.0
let gapLabel = 14.0
let blocks = logoH + gapLogo + subtitle.size().height + gapTitleBlock + labelStr.size().height + gapLabel + titleStr.size().height
var y = H - (H - blocks) / 2.0

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current?.imageInterpolation = .high
if opaque {
  NSColor.white.setFill()
  NSRect(x: 0, y: 0, width: W, height: H).fill()
}
y -= logoH
logo.draw(in: NSRect(x: (W - logoW) / 2, y: y, width: logoW, height: logoH))
y -= gapLogo + subtitle.size().height
subtitle.draw(in: NSRect(x: 0, y: y, width: W, height: subtitle.size().height))
y -= gapTitleBlock + labelStr.size().height
labelStr.draw(in: NSRect(x: 0, y: y, width: W, height: labelStr.size().height))
y -= gapLabel + titleStr.size().height
titleStr.draw(in: NSRect(x: 0, y: y, width: W, height: titleStr.size().height))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: outPath))
print("titleSize", titleSize, "boldFont", bold(10).fontName)
