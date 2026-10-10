# Regenerates the PNG app icons in src/icons from the same arrow shape used in the app.
# Run with Windows PowerShell:  powershell -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\src\icons'
New-Item -ItemType Directory -Force $outDir | Out-Null

function New-Icon([int]$size, [double]$arrowScale, [string]$name) {
  # 24-bit RGB: iOS wants an opaque icon and rounds the corners itself.
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#c8401c'))

  # Same geometry as the dial arrow: tip (0,-86), wings (+-47,62), notch (0,35).
  $unit = $size / 512.0
  $g.TranslateTransform([single](250 * $unit), [single](262 * $unit))
  $g.RotateTransform(32)
  $s = [single]($arrowScale * $unit)
  $g.ScaleTransform($s, $s)

  $left = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(0, -86)), (New-Object System.Drawing.PointF(-47, 62)), (New-Object System.Drawing.PointF(0, 35)))
  $right = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(0, -86)), (New-Object System.Drawing.PointF(47, 62)), (New-Object System.Drawing.PointF(0, 35)))
  $light = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#fffdf8'))
  $shade = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f0dfd0'))
  $g.FillPolygon($light, $left)
  $g.FillPolygon($shade, $right)

  $g.Dispose()
  $path = Join-Path $outDir $name
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Output "$name ($size px)"
}

New-Icon 180 2.05 'apple-touch-icon.png'
New-Icon 192 2.05 'icon-192.png'
New-Icon 512 2.05 'icon-512.png'
# Maskable icons may be cropped to a circle, so the arrow stays inside the central safe zone.
New-Icon 512 1.55 'icon-maskable-512.png'
