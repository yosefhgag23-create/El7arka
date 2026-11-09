# Generates every brand asset from build\brand\logo-source.jpg (logo on a white background):
#   src\Fleet.Desktop\app.ico + src\Fleet.Web\public\favicon.ico   multi-size icon of the house mark on a white tile
#   src\Fleet.Web\public\brand\logo.png                              full logo, transparent background
#   src\Fleet.Web\public\brand\mark.png                              house mark only, transparent background
#   src\Fleet.Desktop\logo.png                                       full logo for the splash screen
param(
    [string]$Source = "$PSScriptRoot\brand\logo-source.jpg",
    # Bounding box of the house mark inside the source image (x, y, width, height).
    [int[]]$MarkBox = @(83, 45, 340, 247)
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Resolve-Path "$PSScriptRoot\.."
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))

# Near-white pixels become transparent (with a soft edge) so the logo sits on any background.
function Remove-White([System.Drawing.Bitmap]$bmp) {
    $out = New-Object System.Drawing.Bitmap $bmp.Width, $bmp.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y = 0; $y -lt $bmp.Height; $y++) {
        for ($x = 0; $x -lt $bmp.Width; $x++) {
            $c = $bmp.GetPixel($x, $y)
            $light = [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
            $a = if ($light -ge 238) { 0 } elseif ($light -le 200) { 255 } else { [int](255 * (238 - $light) / 38) }
            $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B))
        }
    }
    return $out
}

function Save-Png([System.Drawing.Image]$img, [string]$path) {
    $full = Join-Path $root $path
    New-Item -ItemType Directory -Force (Split-Path $full) | Out-Null
    $img.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Wrote $path"
}

# Square canvas with the mark centered and the given padding ratio.
function New-Mark([System.Drawing.Image]$clear, [int]$size, [double]$pad, [bool]$tile) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
    $g.Clear([System.Drawing.Color]::Transparent)
    if ($tile) {
        $r = [Math]::Max(2, [int]($size * 0.2)); $d = $r * 2; $w = $size - 1
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($w - $d, 0, $d, $d, 270, 90)
        $path.AddArc($w - $d, $w - $d, $d, $d, 0, 90); $path.AddArc(0, $w - $d, $d, $d, 90, 90); $path.CloseFigure()
        $g.FillPath([System.Drawing.Brushes]::White, $path)
    }
    $inner = $size * (1 - 2 * $pad)
    $scale = [Math]::Min($inner / $MarkBox[2], $inner / $MarkBox[3])
    $w2 = $MarkBox[2] * $scale; $h2 = $MarkBox[3] * $scale
    $dest = New-Object System.Drawing.RectangleF (($size - $w2) / 2), (($size - $h2) / 2), $w2, $h2
    $srcRect = New-Object System.Drawing.RectangleF $MarkBox[0], $MarkBox[1], $MarkBox[2], $MarkBox[3]
    $g.DrawImage($clear, $dest, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    return $bmp
}

function Get-IconFrame([System.Drawing.Bitmap]$bmp) {
    $size = $bmp.Width
    $ms = New-Object System.IO.MemoryStream
    if ($size -ge 256) {
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    } else {
        # Classic 32-bit DIB frame (BITMAPINFOHEADER + bottom-up BGRA + AND mask); PNG frames below 256px are not read by every consumer.
        $bw = New-Object System.IO.BinaryWriter $ms
        $bw.Write([UInt32]40); $bw.Write([Int32]$size); $bw.Write([Int32]($size * 2))
        $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]0)
        $bw.Write([UInt32]($size * $size * 4)); $bw.Write([Int32]0); $bw.Write([Int32]0)
        $bw.Write([UInt32]0); $bw.Write([UInt32]0)
        for ($y = $size - 1; $y -ge 0; $y--) {
            for ($x = 0; $x -lt $size; $x++) {
                $c = $bmp.GetPixel($x, $y)
                $bw.Write([byte]$c.B); $bw.Write([byte]$c.G); $bw.Write([byte]$c.R); $bw.Write([byte]$c.A)
            }
        }
        $maskRow = [int]([Math]::Ceiling($size / 32.0) * 4)
        $bw.Write((New-Object byte[] ($maskRow * $size)))
        $bw.Flush()
    }
    return ,$ms.ToArray()
}

$clear = Remove-White $src
Save-Png $clear 'src\Fleet.Web\public\brand\logo.png'
Save-Png $clear 'src\Fleet.Desktop\logo.png'
$mark = New-Mark $clear 256 0.04 $false
Save-Png $mark 'src\Fleet.Web\public\brand\mark.png'

$sizes = 256, 64, 48, 32, 16
$frames = foreach ($s in $sizes) { ,(Get-IconFrame (New-Mark $clear $s 0.1 $true)) }
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]; $len = $frames[$i].Length
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$len); $bw.Write([UInt32]$offset)
    $offset += $len
}
foreach ($f in $frames) { $bw.Write($f) }
$bw.Flush()
foreach ($o in 'src\Fleet.Desktop\app.ico', 'src\Fleet.Web\public\favicon.ico') {
    [System.IO.File]::WriteAllBytes((Join-Path $root $o), $ms.ToArray())
    Write-Host "Wrote $o"
}
$src.Dispose()
