using namespace System.Drawing
using namespace System.Drawing.Drawing2D
using namespace System.Drawing.Imaging
using namespace System.Drawing.Text

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ModelDir = Join-Path $ProjectRoot 'TRAINING\model'
$OutputDir = Join-Path $ProjectRoot 'deliverables\SOP1_SOP2\thesis_figures'
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$Width = 1600
$Height = 1000

function Get-Color([string]$Hex) {
    return [ColorTranslator]::FromHtml($Hex)
}

$Ink = Get-Color '#172033'
$Muted = Get-Color '#64748b'
$Grid = Get-Color '#dbe3ee'
$Panel = Get-Color '#f8fafc'
$Blue = Get-Color '#2563eb'
$Cyan = Get-Color '#0891b2'
$Amber = Get-Color '#d97706'
$Purple = Get-Color '#7c3aed'
$Green = Get-Color '#059669'
$White = [Color]::White

function New-Font([single]$Size, [FontStyle]$Style = [FontStyle]::Regular) {
    return [Font]::new('Arial', $Size, $Style, [GraphicsUnit]::Pixel)
}

function Write-Text {
    param(
        [Graphics]$Graphics,
        [string]$Text,
        [Font]$Font,
        [Color]$Color,
        [single]$X,
        [single]$Y,
        [ValidateSet('Left', 'Center', 'Right')][string]$Align = 'Left'
    )
    $Brush = [SolidBrush]::new($Color)
    $Format = [StringFormat]::new()
    $Format.Alignment = switch ($Align) {
        'Center' { [StringAlignment]::Center }
        'Right' { [StringAlignment]::Far }
        default { [StringAlignment]::Near }
    }
    try {
        $Graphics.DrawString($Text, $Font, $Brush, $X, $Y, $Format)
    }
    finally {
        $Format.Dispose()
        $Brush.Dispose()
    }
}

function New-Figure([string]$Title, [string]$Subtitle) {
    $Bitmap = [Bitmap]::new($Width, $Height, [PixelFormat]::Format32bppArgb)
    $Bitmap.SetResolution(144, 144)
    $Graphics = [Graphics]::FromImage($Bitmap)
    $Graphics.SmoothingMode = [SmoothingMode]::AntiAlias
    $Graphics.TextRenderingHint = [TextRenderingHint]::AntiAliasGridFit
    $Graphics.Clear($White)
    $TitleFont = New-Font 44 ([FontStyle]::Bold)
    $SubtitleFont = New-Font 22
    try {
        Write-Text $Graphics $Title $TitleFont $Ink 90 45
        Write-Text $Graphics $Subtitle $SubtitleFont $Muted 90 100
    }
    finally {
        $TitleFont.Dispose()
        $SubtitleFont.Dispose()
    }
    return @{ Bitmap = $Bitmap; Graphics = $Graphics }
}

function Complete-Figure {
    param(
        [hashtable]$Figure,
        [string]$FileName,
        [string]$Footer
    )
    $Graphics = $Figure.Graphics
    $FooterFont = New-Font 17
    $Pen = [Pen]::new($Grid, 2)
    try {
        $Graphics.DrawLine($Pen, 90, 935, 1510, 935)
        Write-Text $Graphics $Footer $FooterFont $Muted 90 950
        $Path = Join-Path $OutputDir $FileName
        $Figure.Bitmap.Save($Path, [ImageFormat]::Png)
        Write-Output "Created $Path"
    }
    finally {
        $Pen.Dispose()
        $FooterFont.Dispose()
        $Graphics.Dispose()
        $Figure.Bitmap.Dispose()
    }
}

function Fill-Rectangle([Graphics]$Graphics, [Color]$Color, [single]$X, [single]$Y, [single]$W, [single]$H) {
    $Brush = [SolidBrush]::new($Color)
    try { $Graphics.FillRectangle($Brush, $X, $Y, $W, $H) }
    finally { $Brush.Dispose() }
}

function Draw-Line([Graphics]$Graphics, [Color]$Color, [single]$Thickness, [single]$X1, [single]$Y1, [single]$X2, [single]$Y2) {
    $Pen = [Pen]::new($Color, $Thickness)
    try { $Graphics.DrawLine($Pen, $X1, $Y1, $X2, $Y2) }
    finally { $Pen.Dispose() }
}

function Format-Percent([double]$Value, [int]$Digits = 2) {
    return ('{0:N' + $Digits + '}%') -f ($Value * 100)
}

function New-DatasetComposition {
    $Groups = Import-Csv -LiteralPath (Join-Path $ProjectRoot 'TRAINING\data\dataset.csv') |
        Group-Object -Property label
    $NonAggressive = [int](($Groups | Where-Object Name -eq '0').Count)
    $Aggressive = [int](($Groups | Where-Object Name -eq '1').Count)
    $Total = $NonAggressive + $Aggressive

    $Figure = New-Figure 'Dataset Composition' 'Distribution of aggressive and non-aggressive comments in the complete dataset'
    $G = $Figure.Graphics
    Fill-Rectangle $G $Panel 90 175 1420 700

    $BluePen = [Pen]::new($Blue, 92)
    $AmberPen = [Pen]::new($Amber, 92)
    try {
        $G.DrawArc($BluePen, 280, 305, 440, 440, -90, 360)
        $G.DrawArc($AmberPen, 280, 305, 440, 440, -90, [single](360 * $Aggressive / $Total))
    }
    finally {
        $BluePen.Dispose()
        $AmberPen.Dispose()
    }

    $BigFont = New-Font 54 ([FontStyle]::Bold)
    $LabelFont = New-Font 22 ([FontStyle]::Bold)
    $ValueFont = New-Font 44 ([FontStyle]::Bold)
    $BodyFont = New-Font 22
    $SmallFont = New-Font 17
    try {
        Write-Text $G $Total.ToString('N0') $BigFont $Ink 500 470 Center
        Write-Text $G 'total comments' $BodyFont $Muted 500 535 Center

        Fill-Rectangle $G $Blue 870 355 36 36
        Write-Text $G 'Non-aggressive' $LabelFont $Ink 930 355
        Write-Text $G $NonAggressive.ToString('N0') $ValueFont $Ink 930 405
        Write-Text $G (Format-Percent ($NonAggressive / $Total) 0) $BodyFont $Muted 930 465

        Fill-Rectangle $G $Amber 870 575 36 36
        Write-Text $G 'Aggressive' $LabelFont $Ink 930 575
        Write-Text $G $Aggressive.ToString('N0') $ValueFont $Ink 930 625
        Write-Text $G (Format-Percent ($Aggressive / $Total) 0) $BodyFont $Muted 930 685
        Write-Text $G 'Class ratio: 3 non-aggressive comments for every 1 aggressive comment' $SmallFont $Muted 870 790
    }
    finally {
        $BigFont.Dispose(); $LabelFont.Dispose(); $ValueFont.Dispose(); $BodyFont.Dispose(); $SmallFont.Dispose()
    }
    Complete-Figure $Figure 'Figure_15_Dataset_Composition.png' 'Source: TRAINING/data/dataset.csv'
}

function New-OverallMetrics {
    $Metrics = @(Import-Csv -LiteralPath (Join-Path $ModelDir 'sop2_metrics_from_predictions.csv'))
    $Figure = New-Figure 'Overall Precision, Recall, and F1-score' 'Aggressive class results on the same 12,980-comment test set'
    $G = $Figure.Graphics
    $AxisFont = New-Font 19
    $LabelFont = New-Font 22 ([FontStyle]::Bold)
    $ValueFont = New-Font 20 ([FontStyle]::Bold)
    $Left = 175
    $Top = 220
    $ChartHeight = 590
    $Base = $Top + $ChartHeight
    try {
        foreach ($Tick in 0, 20, 40, 60, 80, 100) {
            $Y = $Base - ($Tick / 100) * $ChartHeight
            Draw-Line $G $Grid 2 $Left $Y 1510 $Y
            Write-Text $G "$Tick%" $AxisFont $Muted 145 ($Y - 12) Right
        }

        $Legend = @(
            @{ Name = 'Precision'; Color = $Blue },
            @{ Name = 'Recall'; Color = $Amber },
            @{ Name = 'F1-score'; Color = $Purple }
        )
        for ($Index = 0; $Index -lt $Legend.Count; $Index++) {
            $X = 500 + $Index * 230
            Fill-Rectangle $G $Legend[$Index].Color $X 163 25 25
            Write-Text $G $Legend[$Index].Name $AxisFont $Muted ($X + 38) 160
        }

        $ModelNames = @('Naive Bayes', 'VADER', 'Hybrid (60/40)')
        $Keys = @('precision', 'recall', 'f1_score')
        $Colors = @($Blue, $Amber, $Purple)
        for ($ModelIndex = 0; $ModelIndex -lt $Metrics.Count; $ModelIndex++) {
            $GroupX = 290 + $ModelIndex * 440
            for ($MetricIndex = 0; $MetricIndex -lt 3; $MetricIndex++) {
                $Value = [double]$Metrics[$ModelIndex].($Keys[$MetricIndex])
                $BarHeight = $Value * $ChartHeight
                $X = $GroupX + $MetricIndex * 104
                $Y = $Base - $BarHeight
                Fill-Rectangle $G $Colors[$MetricIndex] $X $Y 78 $BarHeight
                Write-Text $G (Format-Percent $Value) $ValueFont $Ink ($X + 39) ($Y - 35) Center
            }
            Write-Text $G $ModelNames[$ModelIndex] $LabelFont $Ink ($GroupX + 143) 830 Center
        }
        Write-Text $G 'Score (%)' $AxisFont $Muted 40 495
    }
    finally {
        $AxisFont.Dispose(); $LabelFont.Dispose(); $ValueFont.Dispose()
    }
    Complete-Figure $Figure 'Figure_16_Overall_Precision_Recall_F1.png' 'Decision threshold = 0.50; blocklist and whitelist overrides disabled'
}

function New-ConfusionMatrix {
    param(
        [pscustomobject]$Metric,
        [string]$Title,
        [string]$Subtitle,
        [string]$FileName
    )
    $Values = @(
        @([int]$Metric.true_negative, [int]$Metric.false_positive),
        @([int]$Metric.false_negative, [int]$Metric.true_positive)
    )
    $Names = @(
        @('True negative', 'False positive'),
        @('False negative', 'True positive')
    )
    $Figure = New-Figure $Title "$Subtitle predictions at the fixed 0.50 decision threshold"
    $G = $Figure.Graphics
    $LabelFont = New-Font 22 ([FontStyle]::Bold)
    $AxisFont = New-Font 19
    $CountFont = New-Font 56 ([FontStyle]::Bold)
    $CellFont = New-Font 21
    $CellNameFont = New-Font 19 ([FontStyle]::Bold)
    $MatrixX = 520
    $MatrixY = 265
    $CellWidth = 400
    $CellHeight = 255
    try {
        Write-Text $G 'Predicted class' $LabelFont $Ink 920 180 Center
        Write-Text $G 'Non-aggressive' $AxisFont $Muted 720 225 Center
        Write-Text $G 'Aggressive' $AxisFont $Muted 1120 225 Center
        Write-Text $G 'Actual class' $LabelFont $Ink 120 500 Center
        Write-Text $G 'Non-aggressive' $AxisFont $Muted 480 380 Right
        Write-Text $G 'Aggressive' $AxisFont $Muted 480 635 Right

        for ($Row = 0; $Row -lt 2; $Row++) {
            $RowTotal = $Values[$Row][0] + $Values[$Row][1]
            for ($Column = 0; $Column -lt 2; $Column++) {
                $Value = $Values[$Row][$Column]
                $X = $MatrixX + $Column * $CellWidth
                $Y = $MatrixY + $Row * $CellHeight
                $CellColor = if ($Row -eq $Column) { Get-Color '#1d4ed8' } else { Get-Color '#dbeafe' }
                $TextColor = if ($Row -eq $Column) { $White } else { $Ink }
                Fill-Rectangle $G $CellColor ($X + 4) ($Y + 4) ($CellWidth - 8) ($CellHeight - 8)
                Write-Text $G $Value.ToString('N0') $CountFont $TextColor ($X + $CellWidth / 2) ($Y + 72) Center
                Write-Text $G ((Format-Percent ($Value / $RowTotal)) + ' of actual class') $CellFont $TextColor ($X + $CellWidth / 2) ($Y + 143) Center
                Write-Text $G $Names[$Row][$Column] $CellNameFont $TextColor ($X + $CellWidth / 2) ($Y + 198) Center
            }
        }
        Fill-Rectangle $G $Panel 520 815 800 64
        Write-Text $G ('Accuracy: ' + (Format-Percent ([double]$Metric.accuracy)) + '  |  Test samples: 12,980') $LabelFont $Ink 920 830 Center
    }
    finally {
        $LabelFont.Dispose(); $AxisFont.Dispose(); $CountFont.Dispose(); $CellFont.Dispose(); $CellNameFont.Dispose()
    }
    Complete-Figure $Figure $FileName 'Rows show actual labels; columns show predicted labels'
}

function New-WeightComparison {
    $Weights = @(Import-Csv -LiteralPath (Join-Path $ModelDir 'hybrid_weight_ranking.csv') |
        Sort-Object { [double]$_.'NB Weight' })
    $Selected = $Weights | Where-Object { [double]$_.'NB Weight' -eq 0.60 }
    $Best = $Weights | Sort-Object { [double]$_.F1 } -Descending | Select-Object -First 1
    $Figure = New-Figure 'Hybrid-weight Metrics Comparison' 'Precision, recall, and F1-score across 21 Naive Bayes-VADER weight combinations'
    $G = $Figure.Graphics
    $AxisFont = New-Font 19
    $LabelFont = New-Font 22 ([FontStyle]::Bold)
    $SmallBold = New-Font 19 ([FontStyle]::Bold)
    $Left = 175
    $Right = 1490
    $Top = 260
    $Bottom = 800
    $Minimum = 0.55
    $Maximum = 0.95
    $Series = @(
        @{ Key = 'Precision'; Label = 'Precision'; Color = $Blue },
        @{ Key = 'Recall'; Label = 'Recall'; Color = $Amber },
        @{ Key = 'F1'; Label = 'F1-score'; Color = $Purple }
    )
    try {
        for ($SeriesIndex = 0; $SeriesIndex -lt $Series.Count; $SeriesIndex++) {
            $LegendX = 235 + $SeriesIndex * 190
            Draw-Line $G $Series[$SeriesIndex].Color 7 $LegendX 186 ($LegendX + 42) 186
            $LegendBrush = [SolidBrush]::new($Series[$SeriesIndex].Color)
            try { $G.FillEllipse($LegendBrush, $LegendX + 15, 180, 12, 12) }
            finally { $LegendBrush.Dispose() }
            Write-Text $G $Series[$SeriesIndex].Label $AxisFont $Muted ($LegendX + 57) 173
        }
        Fill-Rectangle $G (Get-Color '#f3e8ff') 900 148 500 82
        Write-Text $G 'Implemented: 60% NB / 40% VADER' $LabelFont $Purple 925 155
        $SelectedMetrics = 'P ' + (Format-Percent ([double]$Selected.Precision)) +
            '  |  R ' + (Format-Percent ([double]$Selected.Recall)) +
            '  |  F1 ' + (Format-Percent ([double]$Selected.F1))
        Write-Text $G $SelectedMetrics $AxisFont $Muted 925 195

        foreach ($Tick in 55, 65, 75, 85, 95) {
            $Y = $Bottom - (($Tick / 100) - $Minimum) / ($Maximum - $Minimum) * ($Bottom - $Top)
            Draw-Line $G $Grid 2 $Left $Y $Right $Y
            Write-Text $G "$Tick%" $AxisFont $Muted 145 ($Y - 12) Right
        }
        foreach ($Tick in 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100) {
            $X = $Left + ($Tick / 100) * ($Right - $Left)
            Draw-Line $G $Ink 2 $X $Bottom $X ($Bottom + 9)
            Write-Text $G "$Tick%" $AxisFont $Muted $X ($Bottom + 16) Center
        }
        Draw-Line $G $Ink 3 $Left $Bottom $Right $Bottom

        foreach ($Item in $Series) {
            $Points = [PointF[]]::new($Weights.Count)
            for ($Index = 0; $Index -lt $Weights.Count; $Index++) {
                $Weight = [double]$Weights[$Index].'NB Weight'
                $Score = [double]$Weights[$Index].($Item.Key)
                $Points[$Index] = [PointF]::new(
                    [single]($Left + $Weight * ($Right - $Left)),
                    [single]($Bottom - ($Score - $Minimum) / ($Maximum - $Minimum) * ($Bottom - $Top))
                )
            }
            $LinePen = [Pen]::new($Item.Color, 6)
            try { $G.DrawLines($LinePen, $Points) }
            finally { $LinePen.Dispose() }
            foreach ($Point in $Points) {
                $Dot = [SolidBrush]::new($Item.Color)
                try { $G.FillEllipse($Dot, $Point.X - 6, $Point.Y - 6, 12, 12) }
                finally { $Dot.Dispose() }
            }
        }

        $SelectedX = $Left + [double]$Selected.'NB Weight' * ($Right - $Left)
        $BestX = $Left + [double]$Best.'NB Weight' * ($Right - $Left)
        $BestY = $Bottom - ([double]$Best.F1 - $Minimum) / ($Maximum - $Minimum) * ($Bottom - $Top)
        $GuidePen = [Pen]::new($Purple, 3)
        $GuidePen.DashStyle = [DashStyle]::Dash
        try { $G.DrawLine($GuidePen, $SelectedX, $Top, $SelectedX, $Bottom) }
        finally { $GuidePen.Dispose() }
        foreach ($Item in $Series) {
            $SelectedY = $Bottom - ([double]$Selected.($Item.Key) - $Minimum) / ($Maximum - $Minimum) * ($Bottom - $Top)
            $SelectedBrush = [SolidBrush]::new($Item.Color)
            try { $G.FillEllipse($SelectedBrush, $SelectedX - 13, $SelectedY - 13, 26, 26) }
            finally { $SelectedBrush.Dispose() }
        }
        $BestPen = [Pen]::new($Green, 6)
        try { $G.DrawEllipse($BestPen, $BestX - 16, $BestY - 16, 32, 32) }
        finally { $BestPen.Dispose() }
        Write-Text $G ('Highest F1: 65/35 (' + (Format-Percent ([double]$Best.F1)) + ')') $SmallBold $Green ($BestX + 24) ($BestY - 40)
        Write-Text $G 'Naive Bayes weight (VADER receives the remaining weight)' $LabelFont $Ink (($Left + $Right) / 2) 870 Center
        Write-Text $G 'Metric score (%)' $AxisFont $Muted 20 495
    }
    finally {
        $AxisFont.Dispose(); $LabelFont.Dispose(); $SmallBold.Dispose()
    }
    Complete-Figure $Figure 'Figure_20_Hybrid_Weight_Comparison.png' 'Weights were ranked by F1; 60/40 was retained as the implemented, interpretable balance'
}

New-DatasetComposition
New-OverallMetrics

$Metrics = @(Import-Csv -LiteralPath (Join-Path $ModelDir 'sop2_metrics_from_predictions.csv'))
New-ConfusionMatrix $Metrics[0] 'Naive Bayes Confusion Matrix' 'Naive Bayes' 'Figure_17_Naive_Bayes_Confusion_Matrix.png'
New-ConfusionMatrix $Metrics[1] 'VADER Confusion Matrix' 'VADER' 'Figure_18_VADER_Confusion_Matrix.png'
New-ConfusionMatrix $Metrics[2] 'Hybrid Confusion Matrix' '60% Naive Bayes + 40% VADER' 'Figure_19_Hybrid_Confusion_Matrix.png'
New-WeightComparison
