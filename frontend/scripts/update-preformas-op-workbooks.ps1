$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $root 'dist\preformas-op-sheets-data.json'
$targets = @(
  (Join-Path $root 'PREFORMAS SIN MOVIMIENTO - registros por OP.xlsx'),
  (Join-Path $root 'PREFORMAS SIN MOVIMIENTO - registros por OP actualizado.xlsx')
)

if (-not (Test-Path -LiteralPath $dataPath)) {
  throw "No se encontro el archivo de datos: $dataPath"
}

$payload = Get-Content -LiteralPath $dataPath -Raw | ConvertFrom-Json

function Get-WorkbookByPath($excel, [string] $fullPath) {
  foreach ($workbook in $excel.Workbooks) {
    if ($workbook.FullName -eq $fullPath) {
      return $workbook
    }
  }
  return $null
}

function Get-OrCreateWorksheet($workbook, [string] $sheetName) {
  foreach ($worksheet in $workbook.Worksheets) {
    if ($worksheet.Name -eq $sheetName) {
      return $worksheet
    }
  }

  $worksheet = $workbook.Worksheets.Add()
  $worksheet.Name = $sheetName
  return $worksheet
}

function Set-WorksheetRows($worksheet, $rows) {
  $usedRange = $worksheet.UsedRange
  $usedRange.ClearContents() | Out-Null

  $rowCount = $rows.Count
  $colCount = 1
  foreach ($row in $rows) {
    if ($row.Count -gt $colCount) {
      $colCount = $row.Count
    }
  }

  if ($rowCount -eq 0 -or $colCount -eq 0) {
    return
  }

  $values = New-Object 'object[,]' $rowCount, $colCount
  for ($r = 0; $r -lt $rowCount; $r++) {
    $row = $rows[$r]
    for ($c = 0; $c -lt $colCount; $c++) {
      if ($c -lt $row.Count) {
        $values[$r, $c] = $row[$c]
      } else {
        $values[$r, $c] = ''
      }
    }
  }

  $range = $worksheet.Range(
    $worksheet.Cells.Item(1, 1),
    $worksheet.Cells.Item($rowCount, $colCount)
  )
  $range.Value2 = $values
}

$createdExcel = $false
try {
  $excel = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
} catch {
  $excel = New-Object -ComObject Excel.Application
  $createdExcel = $true
}

$excel.DisplayAlerts = $false
$updated = @()

try {
  foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target)) {
      continue
    }

    $openedHere = $false
    $workbook = Get-WorkbookByPath $excel $target
    if ($null -eq $workbook) {
      $workbook = $excel.Workbooks.Open($target)
      $openedHere = $true
    }

    foreach ($sheetData in $payload.sheets) {
      $worksheet = Get-OrCreateWorksheet $workbook $sheetData.sheet
      Set-WorksheetRows $worksheet $sheetData.rows
    }

    if ($workbook.ReadOnly) {
      $directory = Split-Path -Parent $target
      $name = [IO.Path]::GetFileNameWithoutExtension($target)
      $fallback = Join-Path $directory "$name - datos actualizados.xlsx"
      $workbook.SaveAs($fallback)
      $updated += $fallback
    } else {
      $workbook.Save()
      $updated += $target
    }

    if ($openedHere) {
      $workbook.Close($true)
    }
  }
} finally {
  $excel.DisplayAlerts = $true
  if ($createdExcel) {
    $excel.Quit()
  }
}

$updated | ConvertTo-Json
