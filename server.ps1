# =============================================================================
# SPHEREx SKY EXPLORER - LOCAL HTTP SERVER (TCP Socket Server - Zero Admin Needed)
# Chạy tại: http://localhost:8080
# =============================================================================

param(
  [int]$Port = 8080
)

$RootDir = $PSScriptRoot
if (-not $RootDir) {
  $RootDir = (Get-Location).Path
}

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".fits" = "application/fits"
}

$Endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Loopback, $Port)
$Listener = New-Object System.Net.Sockets.TcpListener($Endpoint)
$Listener.Start()

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " NASA SPHEREx & Planet X - Interactive Sky Map Server Started!" -ForegroundColor Green
Write-Host " Local URL : http://localhost:$Port" -ForegroundColor Yellow
Write-Host " Root Dir  : $RootDir" -ForegroundColor Gray
Write-Host "================================================================" -ForegroundColor Cyan

try {
  while ($true) {
    $Client = $Listener.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $RequestLine = $Reader.ReadLine()

      if (-not [string]::IsNullOrEmpty($RequestLine)) {
        # Đọc hết phần header còn lại
        while ($true) {
          $HeaderLine = $Reader.ReadLine()
          if ([string]::IsNullOrEmpty($HeaderLine)) { break }
        }

        $Parts = $RequestLine.Split(" ")
        $RawUrl = if ($Parts.Length -ge 2) { $Parts[1] } else { "/" }
        $CleanPath = ($RawUrl -split "\?")[0]
        if ($CleanPath -eq "/" -or [string]::IsNullOrEmpty($CleanPath)) {
          $CleanPath = "/index.html"
        }

        $RelativePath = $CleanPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $FilePath = Join-Path $RootDir $RelativePath

        if ((Test-Path $FilePath) -and -not (Get-Item $FilePath).PSIsContainer) {
          $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
          $ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
          $BodyBytes = [System.IO.File]::ReadAllBytes($FilePath)

          $HeaderText = "HTTP/1.1 200 OK`r`n" +
                        "Content-Type: $ContentType`r`n" +
                        "Content-Length: $($BodyBytes.Length)`r`n" +
                        "Cache-Control: no-cache`r`n" +
                        "Connection: close`r`n`r`n"
          $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($HeaderText)
          $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
          $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
        } else {
          $NotFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $CleanPath")
          $HeaderText = "HTTP/1.1 404 Not Found`r`n" +
                        "Content-Type: text/plain; charset=utf-8`r`n" +
                        "Content-Length: $($NotFoundBytes.Length)`r`n" +
                        "Connection: close`r`n`r`n"
          $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($HeaderText)
          $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
          $Stream.Write($NotFoundBytes, 0, $NotFoundBytes.Length)
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
