$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$manifestPath = Join-Path $repoRoot "public/sample-data/wst/library-index-v2.json"
$analyticsPath = Join-Path $repoRoot "public/sample-data/wst/library-analytics.json"

function Get-WaveguideLengthMap {
  param(
    [string]$FolderPath,
    [int]$FallbackCount
  )

  $routeConfigPath = Join-Path $FolderPath "route-config.json"
  $legacyConfigPath = Join-Path $FolderPath "waveguide-config.json"
  $configPath = if (Test-Path -LiteralPath $routeConfigPath) { $routeConfigPath } else { $legacyConfigPath }
  if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $map = @{}
    if ($config.routes) {
      foreach ($entry in $config.routes) {
        $routeMatch = [regex]::Match([string]$entry.route, "\d+")
        if ($routeMatch.Success -and $null -ne $entry.lengthMm) {
          $map[[int]$routeMatch.Value] = [double]$entry.lengthMm
        }
      }
      if ($map.Count -gt 0) { return $map }
    }
    if ($config.waveguideLengths) {
      foreach ($entry in $config.waveguideLengths) {
        $map[[int]$entry.index] = [double]$entry.lengthMm
      }
      if ($map.Count -gt 0) { return $map }
    }
    $count = if ($config.propagationWaveguideCount) { [int]$config.propagationWaveguideCount } else { $FallbackCount }
    $start = if ($null -ne $config.propagationWaveguideStartMm) { [double]$config.propagationWaveguideStartMm } else { 0.0 }
    $interval = if ($null -ne $config.propagationWaveguideIntervalMm) { [double]$config.propagationWaveguideIntervalMm } else { 4.0 }
    for ($index = 1; $index -le $count; $index += 1) {
      $map[$index] = $start + (($index - 1) * $interval)
    }
    return $map
  }

  $defaultMap = @{}
  for ($index = 1; $index -le $FallbackCount; $index += 1) {
    $defaultMap[$index] = ($index - 1) * 4.0
  }
  return $defaultMap
}

function Get-TraceMeanLoss {
  param(
    [string]$Path,
    [double]$TargetWavelengthNm,
    [double]$WindowNm,
    [double]$LaunchPowerDbm
  )

  $sum = 0.0
  $count = 0
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line -split "\s+"
    if ($parts.Count -lt 2) { continue }
    $wavelength = [double]$parts[0]
    if ([math]::Abs($wavelength - $TargetWavelengthNm) -gt $WindowNm) { continue }
    $powerW = [double]$parts[1]
    if ($powerW -le 0) { continue }
    $powerDbm = 10 * [math]::Log10($powerW * 1000)
    $lossDb = [math]::Abs($LaunchPowerDbm - $powerDbm)
    $sum += $lossDb
    $count += 1
  }

  if ($count -eq 0) { return $null }
  return $sum / $count
}

function Get-LinearFit {
  param([array]$Points)
  if (-not $Points -or $Points.Count -lt 2) { return $null }

  $sumX = 0.0
  $sumY = 0.0
  $sumXY = 0.0
  $sumXX = 0.0
  foreach ($point in $Points) {
    $sumX += [double]$point.x
    $sumY += [double]$point.y
    $sumXY += ([double]$point.x * [double]$point.y)
    $sumXX += ([double]$point.x * [double]$point.x)
  }

  $n = [double]$Points.Count
  $denominator = ($n * $sumXX) - ($sumX * $sumX)
  if ($denominator -eq 0) { return $null }

  $slope = (($n * $sumXY) - ($sumX * $sumY)) / $denominator
  $intercept = ($sumY - ($slope * $sumX)) / $n
  $mse = 0.0
  foreach ($point in $Points) {
    $predicted = ($slope * [double]$point.x) + $intercept
    $mse += [math]::Pow(([double]$point.y - $predicted), 2)
  }
  $mse = $mse / $n

  return [pscustomobject]@{
    slope = $slope
    mse = $mse
  }
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$analyticsIndex = New-Object System.Collections.Generic.List[object]

foreach ($entry in $manifest) {
  $folderPath = Join-Path $repoRoot ("public/" + $entry.folder)
  $waveguideLengths = Get-WaveguideLengthMap -FolderPath $folderPath -FallbackCount ([int]$entry.waveguideCount)
  $targetWavelengthNm = 1550.0
  $windowNm = 5.0
  $mseThreshold = 0.5
  $launchPowerDbm = 10.0

  $chipPoints = @{}
  foreach ($fileName in $entry.files) {
    if ($fileName -notmatch "Chip(\d+)_WG(\d+)") { continue }
    $chipId = "Chip$($matches[1])"
    $waveguideIndex = [int]$matches[2]
    if (-not $waveguideLengths.ContainsKey($waveguideIndex)) { continue }
    $meanLoss = Get-TraceMeanLoss -Path (Join-Path $folderPath $fileName) -TargetWavelengthNm $targetWavelengthNm -WindowNm $windowNm -LaunchPowerDbm $launchPowerDbm
    if ($null -eq $meanLoss) { continue }
    if (-not $chipPoints.ContainsKey($chipId)) {
      $chipPoints[$chipId] = New-Object System.Collections.Generic.List[object]
    }
    $chipPoints[$chipId].Add([pscustomobject]@{
      x = [double]$waveguideLengths[$waveguideIndex]
      y = [double]$meanLoss
    })
  }

  $chipFits = New-Object System.Collections.Generic.List[object]
  foreach ($chipId in $chipPoints.Keys) {
    $fit = Get-LinearFit -Points ($chipPoints[$chipId] | Sort-Object x)
    if ($null -eq $fit) { continue }
    $chipFits.Add([pscustomobject]@{
      chipId = $chipId
      slopeDbPerCm = [double]$fit.slope * 10
      mse = [double]$fit.mse
      passMse = ([double]$fit.mse -le $mseThreshold)
    })
  }

  $measuredChips = $chipFits.Count
  $passingFits = @($chipFits | Where-Object { $_.passMse })
  $fittedChips = $passingFits.Count
  $failedFits = @($chipFits | Where-Object { -not $_.passMse }).Count
  $avgPropagation = if ($fittedChips -gt 0) { ($passingFits | Measure-Object -Property slopeDbPerCm -Average).Average } else { $null }
  $yield = if ($measuredChips -gt 0) { (100.0 * $fittedChips) / $measuredChips } else { $null }
  $computedAt = [DateTime]::UtcNow.ToString("o")

  $analyticsIndex.Add([pscustomobject]@{
    id = $entry.id
    datasetId = $entry.datasetId
    label = $entry.label
    projectName = $entry.projectName
    waferName = $entry.waferName
    selectedDate = $entry.selectedDate
    folder = $entry.folder
    measurementType = $entry.measurementType
    measurementMode = $entry.measurementMode
    mpw = $entry.mpw
    slot = $entry.slot
    waveguideType = $entry.waveguideType
    platformId = $entry.platformId
    platformLabel = $entry.platformLabel
    buildingBlockId = $entry.buildingBlockId
    buildingBlockLabel = $entry.buildingBlockLabel
    traceCount = $entry.traceCount
    rowCount = $entry.rowCount
    chipCount = $entry.chipCount
    waveguideCount = $entry.waveguideCount
    analyticsSummary = [pscustomobject]@{
      propagationAverage = if ($null -ne $avgPropagation) { [math]::Round([double]$avgPropagation, 12) } else { $null }
      yield = if ($null -ne $yield) { [math]::Round([double]$yield, 12) } else { $null }
      measuredChips = $measuredChips
      computedAt = $computedAt
    }
    analyticsReview = [pscustomobject]@{
      excludedChipIds = @()
      includedChipIds = @()
      totalChipCount = $measuredChips
      selectedChipCount = $measuredChips
      measuredChips = $measuredChips
      fittedChips = $fittedChips
      failedFits = $failedFits
      savedAt = $computedAt
      propagationSettings = [pscustomobject]@{
        propagationTargetWavelengthNm = $targetWavelengthNm
        propagationWindowNm = $windowNm
        propagationSpectralStepNm = 10.0
        propagationMseThreshold = $mseThreshold
      }
    }
  })
}

$sortedIndex = $analyticsIndex | Sort-Object projectName, label
$parent = Split-Path -Parent $analyticsPath
if (-not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}
($sortedIndex | ConvertTo-Json -Depth 10) + "`n" | Set-Content -LiteralPath $analyticsPath

Write-Output "Updated analytics cache for $($sortedIndex.Count) published dataset(s)."
