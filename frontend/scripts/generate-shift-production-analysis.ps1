$ErrorActionPreference = 'Stop'

$outputPath = Join-Path (Get-Location) 'produccion-turnos-botellas-aptas.xlsx'

$rows = @(
  @{ Fecha='21/07/2026'; Operario='Samuel Flores'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5160 },
  @{ Fecha='21/07/2026'; Operario='Marcial Olmos'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2640 },
  @{ Fecha='22/07/2026'; Operario='Samuel Flores'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5520 },
  @{ Fecha='22/07/2026'; Operario='Marcial Olmos'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2520 },
  @{ Fecha='23/07/2026'; Operario='Samuel Flores'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5400 },
  @{ Fecha='23/07/2026'; Operario='Marcial Olmos'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2640 },
  @{ Fecha='24/07/2026'; Operario='Samuel Flores'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=4920 },
  @{ Fecha='24/07/2026'; Operario='Marcial Olmos'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2640 },
  @{ Fecha='25/07/2026'; Operario='Samuel Flores'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5520 },
  @{ Fecha='25/07/2026'; Operario='Esteban Pozo'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2400 },
  @{ Fecha='27/07/2026'; Operario='Gabriel Caisiri'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5400 },
  @{ Fecha='27/07/2026'; Operario='Elvis Rojas'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2880 },
  @{ Fecha='28/07/2026'; Operario='Gabriel Caisiri'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5520 },
  @{ Fecha='28/07/2026'; Operario='Elvis Rojas'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2880 },
  @{ Fecha='29/07/2026'; Operario='Gabriel Caisiri'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=4920 },
  @{ Fecha='29/07/2026'; Operario='Elvis Rojas'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2880 },
  @{ Fecha='30/07/2026'; Operario='Gabriel Caisiri'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5520 },
  @{ Fecha='30/07/2026'; Operario='Elvis Rojas'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=3000 },
  @{ Fecha='31/07/2026'; Operario='Gabriel Caisiri'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5520 },
  @{ Fecha='31/07/2026'; Operario='Elvis Rojas'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=1800 },
  @{ Fecha='01/08/2026'; Operario='Gabriel Caisiri'; Inicio='06:00'; Final='14:00'; Turno='Turno 1'; Aptas=5520 },
  @{ Fecha='01/08/2026'; Operario='Elvis Rojas'; Inicio='14:00'; Final='18:00'; Turno='Turno 2'; Aptas=2880 }
)

function Get-Hours($start, $end) {
  $startDate = [datetime]::ParseExact($start, 'HH:mm', $null)
  $endDate = [datetime]::ParseExact($end, 'HH:mm', $null)
  return ($endDate - $startDate).TotalHours
}

foreach ($row in $rows) {
  $row['Horas'] = Get-Hours $row.Inicio $row.Final
  $row['Productividad'] = [math]::Round($row.Aptas / $row.Horas, 1)
}

$rows = $rows | ForEach-Object { [pscustomobject]$_ }

$turnos = $rows | Group-Object Turno | ForEach-Object {
  $totalAptas = ($_.Group | Measure-Object Aptas -Sum).Sum
  $totalHoras = ($_.Group | Measure-Object Horas -Sum).Sum
  [pscustomobject]@{
    Turno = $_.Name
    Registros = $_.Count
    Horas = $totalHoras
    TotalAptas = $totalAptas
    PromedioTurno = [math]::Round($totalAptas / $_.Count, 0)
    AptasHora = [math]::Round($totalAptas / $totalHoras, 1)
  }
}

$t1 = $turnos | Where-Object { $_.Turno -eq 'Turno 1' }
$t2 = $turnos | Where-Object { $_.Turno -eq 'Turno 2' }
$brechaTotal = $t1.TotalAptas - $t2.TotalAptas
$efectoHoras = [math]::Round(($t1.Horas - $t2.Horas) * $t2.AptasHora, 0)
$efectoRitmo = [math]::Round(($t1.AptasHora - $t2.AptasHora) * $t1.Horas, 0)
$porcHoras = [math]::Round($efectoHoras / $brechaTotal, 3)
$porcRitmo = [math]::Round($efectoRitmo / $brechaTotal, 3)
$difProductividad = [math]::Round((($t1.AptasHora / $t2.AptasHora) - 1), 3)

$daily = $rows | Group-Object Fecha | ForEach-Object {
  $d1 = $_.Group | Where-Object { $_.Turno -eq 'Turno 1' } | Select-Object -First 1
  $d2 = $_.Group | Where-Object { $_.Turno -eq 'Turno 2' } | Select-Object -First 1
  [pscustomobject]@{
    Fecha = $_.Name
    Turno1 = if ($d1) { $d1.Aptas } else { $null }
    Turno2 = if ($d2) { $d2.Aptas } else { $null }
  }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $workbook = $excel.Workbooks.Add()
  while ($workbook.Worksheets.Count -lt 3) {
    [void]$workbook.Worksheets.Add()
  }

  $summary = $workbook.Worksheets.Item(1)
  $data = $workbook.Worksheets.Item(2)
  $charts = $workbook.Worksheets.Item(3)
  $summary.Name = 'Resumen'
  $data.Name = 'Datos'
  $charts.Name = 'Graficas'

  $summary.Range('A1').Value2 = 'Analisis de produccion por turno - Botellas aptas'
  $summary.Range('A1:H1').Merge() | Out-Null
  $summary.Range('A1').Font.Bold = $true
  $summary.Range('A1').Font.Size = 16
  $summary.Range('A3').Value2 = 'Conclusion principal'
  $summary.Range('A3').Font.Bold = $true
  $summary.Range('A4').Value2 = "El primer turno produce mas botellas aptas en total principalmente porque trabaja mas horas: $($t1.Horas) h frente a $($t2.Horas) h. Al comparar por hora, el primer turno tambien rinde mas, pero la diferencia baja a $([math]::Round($difProductividad * 100, 1))%."
  $summary.Range('A4:H5').Merge() | Out-Null
  $summary.Range('A4').WrapText = $true

  $summaryHeaders = @('Turno','Registros','Horas totales','Total aptas','Promedio por turno','Aptas por hora')
  for ($i = 0; $i -lt $summaryHeaders.Count; $i++) {
    $summary.Cells.Item(7, $i + 1).Value2 = $summaryHeaders[$i]
  }
  $summaryRow = 8
  foreach ($item in ($turnos | Sort-Object Turno)) {
    $summary.Cells.Item($summaryRow, 1).Value2 = $item.Turno
    $summary.Cells.Item($summaryRow, 2).Value2 = [double]$item.Registros
    $summary.Cells.Item($summaryRow, 3).Value2 = [double]$item.Horas
    $summary.Cells.Item($summaryRow, 4).Value2 = [double]$item.TotalAptas
    $summary.Cells.Item($summaryRow, 5).Value2 = [double]$item.PromedioTurno
    $summary.Cells.Item($summaryRow, 6).Value2 = [double]$item.AptasHora
    $summaryRow++
  }

  $summary.Range('A12').Value2 = 'Explicacion de la diferencia total'
  $summary.Range('A12').Font.Bold = $true
  $summary.Range('A13').Value2 = 'Diferencia total a favor del turno 1'
  $summary.Range('B13').Value2 = [double]$brechaTotal
  $summary.Range('A14').Value2 = 'Parte explicada por mas horas trabajadas'
  $summary.Range('B14').Value2 = [double]$efectoHoras
  $summary.Range('C14').Value2 = [double]$porcHoras
  $summary.Range('A15').Value2 = 'Parte explicada por mayor rendimiento por hora'
  $summary.Range('B15').Value2 = [double]$efectoRitmo
  $summary.Range('C15').Value2 = [double]$porcRitmo
  $summary.Range('C14:C15').NumberFormat = '0.0%'

  $summary.Range('A18').Value2 = 'Lectura para presentar'
  $summary.Range('A18').Font.Bold = $true
  $summary.Range('A19').Value2 = "No conviene comparar solo el total, porque los turnos no duran lo mismo. En el periodo analizado, el turno 1 acumula $($t1.Horas) horas y $($t1.TotalAptas) botellas aptas; el turno 2 acumula $($t2.Horas) horas y $($t2.TotalAptas) botellas aptas. La mayor parte de la brecha viene de las horas adicionales, y una parte menor viene de que el turno 1 tiene una productividad horaria ligeramente superior."
  $summary.Range('A19:H22').Merge() | Out-Null
  $summary.Range('A19').WrapText = $true

  $summary.Range('A7:F9').Borders.LineStyle = 1
  $summary.Range('A7:F7').Font.Bold = $true
  $summary.Range('A7:F7').Interior.Color = 14277081
  $summary.Columns.Item('A:H').AutoFit() | Out-Null
  $summary.Columns.Item('A').ColumnWidth = 42
  $summary.Columns.Item('B:F').ColumnWidth = 16

  $dataHeaders = @('Fecha','Operario','Hora inicio','Hora final','Turno','Botellas aptas','Horas','Aptas por hora')
  for ($i = 0; $i -lt $dataHeaders.Count; $i++) {
    $data.Cells.Item(1, $i + 1).Value2 = $dataHeaders[$i]
  }
  $dataRow = 2
  foreach ($row in $rows) {
    $data.Cells.Item($dataRow, 1).Value2 = $row.Fecha
    $data.Cells.Item($dataRow, 2).Value2 = $row.Operario
    $data.Cells.Item($dataRow, 3).Value2 = $row.Inicio
    $data.Cells.Item($dataRow, 4).Value2 = $row.Final
    $data.Cells.Item($dataRow, 5).Value2 = $row.Turno
    $data.Cells.Item($dataRow, 6).Value2 = [double]$row.Aptas
    $data.Cells.Item($dataRow, 7).Value2 = [double]$row.Horas
    $data.Cells.Item($dataRow, 8).Value2 = [double]$row.Productividad
    $dataRow++
  }
  $lastDataRow = $dataRow - 1
  $data.Range("A1:H$lastDataRow").Borders.LineStyle = 1
  $data.Range('A1:H1').Font.Bold = $true
  $data.Range('A1:H1').Interior.Color = 14277081
  $data.Columns.Item('A:H').AutoFit() | Out-Null

  $charts.Range('A1').Value2 = 'Datos para graficas'
  $charts.Range('A1').Font.Bold = $true
  $charts.Range('A3').Value2 = 'Turno'
  $charts.Range('B3').Value2 = 'Total aptas'
  $charts.Range('C3').Value2 = 'Aptas por hora'
  $charts.Range('D3').Value2 = 'Horas totales'
  $chartRow = 4
  foreach ($item in ($turnos | Sort-Object Turno)) {
    $charts.Cells.Item($chartRow, 1).Value2 = $item.Turno
    $charts.Cells.Item($chartRow, 2).Value2 = [double]$item.TotalAptas
    $charts.Cells.Item($chartRow, 3).Value2 = [double]$item.AptasHora
    $charts.Cells.Item($chartRow, 4).Value2 = [double]$item.Horas
    $chartRow++
  }

  $charts.Range('F3').Value2 = 'Causa'
  $charts.Range('G3').Value2 = 'Botellas'
  $charts.Range('F4').Value2 = 'Mas horas trabajadas'
  $charts.Range('G4').Value2 = [double]$efectoHoras
  $charts.Range('F5').Value2 = 'Mayor productividad/h'
  $charts.Range('G5').Value2 = [double]$efectoRitmo

  $charts.Range('A9').Value2 = 'Fecha'
  $charts.Range('B9').Value2 = 'Turno 1'
  $charts.Range('C9').Value2 = 'Turno 2'
  $dailyRow = 10
  foreach ($item in $daily) {
    $charts.Cells.Item($dailyRow, 1).Value2 = $item.Fecha
    if ($null -ne $item.Turno1) { $charts.Cells.Item($dailyRow, 2).Value2 = [double]$item.Turno1 }
    if ($null -ne $item.Turno2) { $charts.Cells.Item($dailyRow, 3).Value2 = [double]$item.Turno2 }
    $dailyRow++
  }
  $lastDailyRow = $dailyRow - 1
  $charts.Range("A3:D5").Font.Bold = $true
  $charts.Range("F3:G5").Font.Bold = $true
  $charts.Range("A9:C$lastDailyRow").Borders.LineStyle = 1
  $charts.Columns.Item('A:G').AutoFit() | Out-Null

  $xlColumnClustered = 51
  $xlColumnStacked = 52
  $xlLineMarkers = 65

  $chart1 = $charts.Shapes.AddChart2(201, $xlColumnClustered, 20, 250, 420, 260).Chart
  $chart1.SetSourceData($charts.Range('A3:B5'))
  $chart1.ChartTitle.Text = 'Total de botellas aptas por turno'
  $chart1.Axes(2).HasTitle = $true
  $chart1.Axes(2).AxisTitle.Text = 'Botellas aptas'
  $chart1.SeriesCollection(1).Format.Fill.ForeColor.RGB = 39423

  $chart2 = $charts.Shapes.AddChart2(201, $xlColumnClustered, 470, 250, 420, 260).Chart
  $chart2.SetSourceData($charts.Range('A3:A5,C3:C5'))
  $chart2.ChartTitle.Text = 'Productividad: botellas aptas por hora'
  $chart2.Axes(2).HasTitle = $true
  $chart2.Axes(2).AxisTitle.Text = 'Botellas/hora'
  $chart2.SeriesCollection(1).Format.Fill.ForeColor.RGB = 5287936

  $chart3 = $charts.Shapes.AddChart2(201, $xlColumnStacked, 20, 540, 420, 260).Chart
  $chart3.SetSourceData($charts.Range('F3:G5'))
  $chart3.ChartTitle.Text = 'Que explica la brecha total'
  $chart3.Axes(2).HasTitle = $true
  $chart3.Axes(2).AxisTitle.Text = 'Botellas'
  $chart3.SeriesCollection(1).Format.Fill.ForeColor.RGB = 12611584

  $chart4 = $charts.Shapes.AddChart2(201, $xlLineMarkers, 470, 540, 520, 260).Chart
  $chart4.SetSourceData($charts.Range("A9:C$lastDailyRow"))
  $chart4.ChartTitle.Text = 'Botellas aptas por fecha'
  $chart4.Axes(2).HasTitle = $true
  $chart4.Axes(2).AxisTitle.Text = 'Botellas aptas'

  $charts.Range('I3').Value2 = 'Mensaje para presentar'
  $charts.Range('I3').Font.Bold = $true
  $charts.Range('I4').Value2 = "El turno 1 no solo hizo mas botellas: tambien tuvo el doble de duracion por jornada. Por eso la comparacion mas justa es por hora. Total: $($t1.TotalAptas) vs $($t2.TotalAptas). Por hora: $($t1.AptasHora) vs $($t2.AptasHora)."
  $charts.Range('I4:L7').Merge() | Out-Null
  $charts.Range('I4').WrapText = $true
  $charts.Columns.Item('I:L').ColumnWidth = 18

  foreach ($sheet in @($summary, $data, $charts)) {
    $sheet.Range('A1:Z200').Font.Name = 'Calibri'
    $sheet.Range('A1:Z200').Font.Size = 10
  }

  if (Test-Path $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
  }
  $workbook.SaveAs($outputPath, 51)
  $workbook.Close($true)
}
finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

Write-Output $outputPath
