# =============================================================================
# SPHEREx SKY EXPLORER - LOCAL HTTP SERVER + NASA IRSA LIVE API GATEWAY
# Chạy tại: http://localhost:8080
# Tích hợp trực tiếp với NASA/IPAC IRSA (https://irsa.ipac.caltech.edu/Missions/spherex.html):
#   1. GET /api/irsa/sia?ra=...&dec=...&radius=...
#   2. GET /api/irsa/cutout?access_url=...&ra=...&dec=...&size=...&mode=compact|full
# =============================================================================

param(
  [int]$Port = 8080
)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RootDir = $PSScriptRoot
if (-not $RootDir) {
  $RootDir = (Get-Location).Path
}

$CacheSiaDir = Join-Path $RootDir "cache\sia"
$CacheCutoutDir = Join-Path $RootDir "cache\cutouts"
New-Item -ItemType Directory -Path $CacheSiaDir -Force | Out-Null
New-Item -ItemType Directory -Path $CacheCutoutDir -Force | Out-Null

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".csv"  = "text/csv; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".fits" = "application/fits"
}

function Parse-QueryString([string]$QueryString) {
  $Params = @{}
  if ([string]::IsNullOrEmpty($QueryString)) { return $Params }
  foreach ($Pair in ($QueryString -split "&")) {
    if ([string]::IsNullOrEmpty($Pair)) { continue }
    $Kv = $Pair -split "=", 2
    $Key = [System.Uri]::UnescapeDataString($Kv[0])
    $Val = if ($Kv.Length -gt 1) { [System.Uri]::UnescapeDataString($Kv[1]) } else { "" }
    $Params[$Key] = $Val
  }
  return $Params
}

# Hàm rút gọn HDU EPSF (3.85 MB) giữ nguyên 100% PRIMARY, IMAGE, FLAGS, VARIANCE, ZODI, WCS-WAVE (~85 KB)
function Build-CompactFits([byte[]]$FullBytes) {
  $OutStream = New-Object System.IO.MemoryStream
  $Offset = 0
  $TotalLen = $FullBytes.Length

  while (($Offset + 2880) -le $TotalLen) {
    $HdrStart = $Offset
    $EndFound = $false
    $ExtName = "PRIMARY"
    $BitPix = 8
    $NAxis = 0
    $Axes = @()

    while (-not $EndFound -and ($Offset + 2880) -le $TotalLen) {
      $BlockStr = [System.Text.Encoding]::ASCII.GetString($FullBytes, $Offset, 2880)
      $Offset += 2880
      for ($c = 0; $c -lt 2880; $c += 80) {
        $Card = $BlockStr.Substring($c, 80)
        if ($Card -match "^EXTNAME\s*=\s*'([^']+)'") { $ExtName = $Matches[1].Trim() }
        elseif ($Card -match "^BITPIX\s*=\s*([0-9-]+)") { $BitPix = [int]$Matches[1] }
        elseif ($Card -match "^NAXIS\s*=\s*([0-9]+)") { $NAxis = [int]$Matches[1] }
        elseif ($Card -match "^NAXIS([1-9])\s*=\s*([0-9]+)") { $Axes += [int]$Matches[2] }
        elseif ($Card.Substring(0, 8).Trim() -eq "END") { $EndFound = $true; break }
      }
    }

    $HdrLen = $Offset - $HdrStart
    $DataBytes = 0
    if ($NAxis -gt 0 -and $Axes.Count -gt 0) {
      $Elems = 1
      foreach ($Ax in $Axes) { $Elems *= $Ax }
      $DataBytes = $Elems * ([Math]::Abs($BitPix) / 8)
    }
    $PaddedDataBytes = [int]([Math]::Ceiling($DataBytes / 2880.0) * 2880)

    # Giữ lại mọi HDU ngoại trừ bảng EPSF nặng 3.85 MB khi truyền lên WebGL
    if ($ExtName -ne "EPSF" -and ($Offset + $PaddedDataBytes) -le $TotalLen) {
      $OutStream.Write($FullBytes, $HdrStart, $HdrLen + $PaddedDataBytes)
    }

    $Offset += $PaddedDataBytes
  }

  return $OutStream.ToArray()
}

function Send-HttpResponse($Stream, [int]$StatusCode, [string]$StatusText, [string]$ContentType, [byte[]]$BodyBytes, [hashtable]$ExtraHeaders = @{}) {
  $HeaderBuilder = "HTTP/1.1 $StatusCode $StatusText`r`n" +
                   "Content-Type: $ContentType`r`n" +
                   "Content-Length: $($BodyBytes.Length)`r`n" +
                   "Access-Control-Allow-Origin: *`r`n" +
                   "Cache-Control: no-cache`r`n"
  foreach ($k in $ExtraHeaders.Keys) {
    $HeaderBuilder += "${k}: $($ExtraHeaders[$k])`r`n"
  }
  $HeaderBuilder += "Connection: close`r`n`r`n"
  $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($HeaderBuilder)
  $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
  if ($BodyBytes.Length -gt 0) {
    $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
  }
}

$Endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Loopback, $Port)
$Listener = New-Object System.Net.Sockets.TcpListener($Endpoint)
$Listener.Start()

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " NASA SPHEREx & Planet X - Interactive Sky Map + IRSA Live Gateway!" -ForegroundColor Green
Write-Host " Local URL : http://localhost:$Port" -ForegroundColor Yellow
Write-Host " IRSA API  : https://irsa.ipac.caltech.edu/SIA (spherex_dr1 / qr3)" -ForegroundColor Magenta
Write-Host "======================================================================" -ForegroundColor Cyan

try {
  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $RequestLine = $Reader.ReadLine()

      if (-not [string]::IsNullOrEmpty($RequestLine)) {
        while ($true) {
          $HeaderLine = $Reader.ReadLine()
          if ([string]::IsNullOrEmpty($HeaderLine)) { break }
        }

        $Parts = $RequestLine.Split(" ")
        $RawUrl = if ($Parts.Length -ge 2) { $Parts[1] } else { "/" }
        $UrlParts = $RawUrl -split "\?", 2
        $CleanPath = $UrlParts[0]
        $QueryString = if ($UrlParts.Length -gt 1) { $UrlParts[1] } else { "" }

        # =====================================================================
        # ENDPOINT 1: /api/irsa/sia (Truy vấn danh mục ảnh thật từ NASA IRSA SIAv2)
        # =====================================================================
        if ($CleanPath -eq "/api/irsa/sia") {
          $Q = Parse-QueryString $QueryString
          $RaNum = [double]($Q["ra"] -as [double])
          $DecNum = [double]($Q["dec"] -as [double])
          $RadNum = if ($Q.ContainsKey("radius")) { [double]$Q["radius"] } else { 0.05 }
          if ($RadNum -le 0 -or $RadNum -gt 2.0) { $RadNum = 0.05 }

          $RaKey = $RaNum.ToString("F4", [System.Globalization.CultureInfo]::InvariantCulture)
          $DecKey = $DecNum.ToString("F4", [System.Globalization.CultureInfo]::InvariantCulture)
          $RadKey = $RadNum.ToString("F3", [System.Globalization.CultureInfo]::InvariantCulture)
          $CacheFile = Join-Path $CacheSiaDir "sia_${RaKey}_${DecKey}_${RadKey}.csv"

          if (Test-Path $CacheFile) {
            $CachedBytes = [System.IO.File]::ReadAllBytes($CacheFile)
            Send-HttpResponse $Stream 200 "OK" "text/csv; charset=utf-8" $CachedBytes @{ "X-IRSA-Cache" = "HIT" }
          } else {
            $CsvContent = ""
            foreach ($Col in @("spherex_dr1", "spherex_qr3")) {
              $IrsaSiaUrl = "https://irsa.ipac.caltech.edu/SIA?COLLECTION=$Col&POS=circle+$RaKey+$DecKey+$RadKey&RESPONSEFORMAT=CSV"
              try {
                $Resp = Invoke-WebRequest -Uri $IrsaSiaUrl -UseBasicParsing -TimeoutSec 18
                if ($Resp.StatusCode -eq 200 -and ($Resp.Content -split "`n").Count -gt 2) {
                  $CsvContent = $Resp.Content
                  break
                }
              } catch {
                # Thử tiếp collection dự phòng
              }
            }

            if (-not [string]::IsNullOrEmpty($CsvContent)) {
              $CsvBytes = [System.Text.Encoding]::UTF8.GetBytes($CsvContent)
              [System.IO.File]::WriteAllBytes($CacheFile, $CsvBytes)
              Send-HttpResponse $Stream 200 "OK" "text/csv; charset=utf-8" $CsvBytes @{ "X-IRSA-Cache" = "LIVE" }
            } else {
              $ErrBytes = [System.Text.Encoding]::UTF8.GetBytes("s_ra,s_dec,obs_id,access_url`n")
              Send-HttpResponse $Stream 200 "OK" "text/csv; charset=utf-8" $ErrBytes @{ "X-IRSA-Cache" = "EMPTY" }
            }
          }
        }
        # =====================================================================
        # ENDPOINT 2: /api/irsa/cutout (Tải gói Multi-Extension FITS thật từ NASA IRSA)
        # =====================================================================
        elseif ($CleanPath -eq "/api/irsa/cutout") {
          $Q = Parse-QueryString $QueryString
          $AccessUrl = $Q["access_url"]
          $RaStr = $Q["ra"]
          $DecStr = $Q["dec"]
          $SizeStr = if ($Q.ContainsKey("size")) { $Q["size"] } else { "0.1" }
          $Mode = if ($Q.ContainsKey("mode")) { $Q["mode"] } else { "compact" }

          if ([string]::IsNullOrEmpty($AccessUrl) -or (-not $AccessUrl.StartsWith("https://irsa.ipac.caltech.edu/ibe/data/spherex/"))) {
            $Msg = [System.Text.Encoding]::UTF8.GetBytes("Invalid NASA IRSA access_url")
            Send-HttpResponse $Stream 400 "Bad Request" "text/plain; charset=utf-8" $Msg
          } else {
            # Tạo hash tên file cache
            $FileNamePart = [System.IO.Path]::GetFileNameWithoutExtension($AccessUrl)
            $SafeRa = ([double]$RaStr).ToString("F4", [System.Globalization.CultureInfo]::InvariantCulture)
            $SafeDec = ([double]$DecStr).ToString("F4", [System.Globalization.CultureInfo]::InvariantCulture)
            $SafeSize = ([double]$SizeStr).ToString("F3", [System.Globalization.CultureInfo]::InvariantCulture)

            $FullCachePath = Join-Path $CacheCutoutDir "${FileNamePart}_${SafeRa}_${SafeDec}_${SafeSize}_full.fits"
            $CompactCachePath = Join-Path $CacheCutoutDir "${FileNamePart}_${SafeRa}_${SafeDec}_${SafeSize}_compact.fits"

            if (-not (Test-Path $FullCachePath)) {
              $CutoutUrl = "${AccessUrl}?center=${SafeRa},${SafeDec}&size=${SafeSize}"
              try {
                Invoke-WebRequest -Uri $CutoutUrl -OutFile $FullCachePath -UseBasicParsing -TimeoutSec 25
                $FullBytes = [System.IO.File]::ReadAllBytes($FullCachePath)
                $CompactBytes = Build-CompactFits $FullBytes
                [System.IO.File]::WriteAllBytes($CompactCachePath, $CompactBytes)
              } catch {
                $ErrMsg = [System.Text.Encoding]::UTF8.GetBytes("Failed to fetch FITS cutout from NASA IRSA: $($_.Exception.Message)")
                Send-HttpResponse $Stream 502 "Bad Gateway" "text/plain; charset=utf-8" $ErrMsg
                $Stream.Flush()
                continue
              }
            }

            if ($Mode -eq "full") {
              $FitsBytes = [System.IO.File]::ReadAllBytes($FullCachePath)
              $DownloadName = "${FileNamePart}_cutout_ra${SafeRa}_dec${SafeDec}.fits"
              Send-HttpResponse $Stream 200 "OK" "application/fits" $FitsBytes @{
                "Content-Disposition" = "attachment; filename=`"$DownloadName`""
                "X-IRSA-Source" = "NASA-IPAC-IRSA-SPHEREx-L2"
              }
            } else {
              if (-not (Test-Path $CompactCachePath)) {
                $FullBytes = [System.IO.File]::ReadAllBytes($FullCachePath)
                $CompactBytes = Build-CompactFits $FullBytes
                [System.IO.File]::WriteAllBytes($CompactCachePath, $CompactBytes)
              }
              $FitsBytes = [System.IO.File]::ReadAllBytes($CompactCachePath)
              Send-HttpResponse $Stream 200 "OK" "application/fits" $FitsBytes @{
                "X-IRSA-Source" = "NASA-IPAC-IRSA-SPHEREx-L2-COMPACT"
              }
            }
          }
        }
        # =====================================================================
        # ENDPOINT 3: Phục vụ Static Files (index.html, css, js)
        # =====================================================================
        else {
          if ($CleanPath -eq "/" -or [string]::IsNullOrEmpty($CleanPath)) {
            $CleanPath = "/index.html"
          }
          $RelativePath = $CleanPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
          $FilePath = Join-Path $RootDir $RelativePath

          if ((Test-Path $FilePath) -and -not (Get-Item $FilePath).PSIsContainer) {
            $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
            $ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
            $BodyBytes = [System.IO.File]::ReadAllBytes($FilePath)
            Send-HttpResponse $Stream 200 "OK" $ContentType $BodyBytes
          } else {
            $NotFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $CleanPath")
            Send-HttpResponse $Stream 404 "Not Found" "text/plain; charset=utf-8" $NotFoundBytes
          }
        }
      }
      $Stream.Flush()
    } catch {
      # Bỏ qua lỗi đóng kết nối sớm từ trình duyệt
    } finally {
      $Client.Close()
    }
  }
} finally {
  $Listener.Stop()
}
