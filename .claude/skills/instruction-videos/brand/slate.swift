import AppKit
import CoreText

let args = CommandLine.arguments
let logoPath = args[1], fontPath = args[2], outPath = args[3], text = args[4]
CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: fontPath) as CFURL, .process, nil)
let W = 1440.0, H = 900.0
let logo = NSImage(contentsOfFile: logoPath)!
let logoRep = logo.representations.first!
let logoW = 820.0
let logoH = logoW * Double(logoRep.pixelsHigh) / Double(logoRep.pixelsWide)
let clear = logoH / 3.0
let gap = max(clear, 72.0)
let font = NSFont(name: "AzoftSans", size: 44) ?? NSFont(name: "Azoft Sans", size: 44)!
let color = NSColor(srgbRed: 0x1A / 255.0, green: 0x1A / 255.0, blue: 0x1A / 255.0, alpha: 1)
let para = NSMutableParagraphStyle(); para.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .paragraphStyle: para, .kern: 1.0]
let str = NSAttributedString(string: text, attributes: attrs)
let textSize = str.size()
let total = logoH + gap + textSize.height
let top = (H - total) / 2.0

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current?.imageInterpolation = .high
let logoRect = NSRect(x: (W - logoW) / 2, y: H - top - logoH, width: logoW, height: logoH)
logo.draw(in: logoRect)
let textRect = NSRect(x: 0, y: H - top - logoH - gap - textSize.height, width: W, height: textSize.height)
str.draw(in: textRect)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: outPath))
print("font", font.fontName, "logoH", Int(logoH), "gap", Int(gap), "text", Int(textSize.width), "x", Int(textSize.height))
