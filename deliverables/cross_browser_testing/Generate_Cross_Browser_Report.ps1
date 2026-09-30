# Generates a genuine DOCX using Office Open XML. Microsoft Word and Python are not required.
[CmdletBinding()]
param(
    [string]$InventoryPath = '',
    [string]$ResultsPath = '',
    [string]$ScreenshotDirectory = '',
    [string]$OutputPath = ''
)
$ErrorActionPreference='Stop'
if(-not $InventoryPath){$InventoryPath=Join-Path $PSScriptRoot 'browser_versions.json'}
if(-not $ResultsPath){$ResultsPath=Join-Path $PSScriptRoot 'cross_browser_results.json'}
if(-not $ScreenshotDirectory){$ScreenshotDirectory=Join-Path $PSScriptRoot 'screenshots'}
if(-not $OutputPath){$OutputPath=Join-Path $PSScriptRoot 'Cross_Browser_Compatibility_Test_Report.docx'}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing
$defs=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'test_definitions.json') -Raw | ConvertFrom-Json
$warnings=[Collections.Generic.List[string]]::new()
$inventory=$null; $results=$null
if(Test-Path -LiteralPath $InventoryPath){
    if([IO.Path]::GetExtension($InventoryPath) -eq '.csv') {
        $rows=@(Import-Csv -LiteralPath $InventoryPath)
        $runIds=@($rows.runId | Select-Object -Unique)
        if($runIds.Count -ne 1){throw 'Inventory CSV must describe one run.'}
        $inventory=[pscustomobject]@{runId=$runIds[0];browsers=$rows;operatingSystem='';extensionVersion='';capturedAt='';extensionHashes=@()}
    }else{$inventory=Get-Content -LiteralPath $InventoryPath -Raw | ConvertFrom-Json}
}else{$warnings.Add('Browser inventory missing. Versions and installation status were not verified.')}
if(Test-Path -LiteralPath $ResultsPath){
    if([IO.Path]::GetExtension($ResultsPath) -eq '.csv') {
        $rows=@(Import-Csv -LiteralPath $ResultsPath)
        if(-not $rows.Count){throw 'Results CSV is empty.'}
        foreach($field in @('runId','testDate','testerName','operatingSystem','extensionVersion','generalObservations')) {
            if(@($rows.$field | Select-Object -Unique).Count -gt 1){throw "Conflicting $field values in CSV. Export a single master form."}
        }
        $first=$rows[0]
        $results=[pscustomobject]@{schemaVersion=1;runId=$first.runId;environment=[pscustomobject]@{
            testDate=$first.testDate;testerName=$first.testerName;operatingSystem=$first.operatingSystem
            extensionVersion=$first.extensionVersion;observations=$first.generalObservations
        };browsers=@($rows | Group-Object browserId | ForEach-Object {
            $group=$_.Group
            foreach($field in @('browserObservations','browserScreenshot')){
                if(@($group.$field | Select-Object -Unique).Count -gt 1){throw "Conflicting $field for $($_.Name)."}
            }
            [pscustomobject]@{id=$_.Name;observations=$group[0].browserObservations;screenshot=$group[0].browserScreenshot
                tests=@($group | ForEach-Object {[pscustomobject]@{id=[int]$_.testId;status=$_.status;observations=$_.observations;screenshot=$_.screenshot}})}
        })}
    }else{$results=Get-Content -LiteralPath $ResultsPath -Raw | ConvertFrom-Json}
    if($results.schemaVersion -ne 1){throw 'Unsupported results schema version.'}
    if($results.inventory -and $inventory -and $results.inventory.runId -ne $inventory.runId){throw 'Embedded and external inventories belong to different runs.'}
    if(-not $inventory -and $results.inventory){$inventory=$results.inventory;$warnings.Clear()}
}else{$warnings.Add('Test results missing. All required tests are Not Tested.')}
if($inventory -and $results){
    if($results.runId -and $inventory.runId -ne $results.runId){throw 'Inventory and results run IDs differ. Use files from the same testing run.'}
    if(-not $results.runId){$warnings.Add('Results have no run ID; association with the inventory is unverified.')}
}
foreach($collection in @(@($inventory.browsers),@($results.browsers))){
    $ids=@($collection | Where-Object {$_} | ForEach-Object {$_.id})
    if(@($ids | Group-Object | Where-Object Count -gt 1).Count){throw 'Duplicate browser IDs in input.'}
    if(@($ids | Where-Object {$_ -notin $defs.browsers.id}).Count){throw 'Input includes a browser outside the four-browser scope.'}
}
$normalized=@(foreach($b in $defs.browsers){
    $entry=@($results.browsers | Where-Object id -EQ $b.id) | Select-Object -First 1
    $machine=@($inventory.browsers | Where-Object id -EQ $b.id) | Select-Object -First 1
    $duplicates=@($entry.tests | Group-Object id | Where-Object Count -gt 1)
    if($duplicates.Count){throw "Duplicate test IDs for $($b.name)."}
    if(@($entry.tests | Where-Object {$_ -and $_.id -notin $defs.tests.id}).Count){throw "Unknown test IDs for $($b.name)."}
    $items=@(foreach($test in $defs.tests){
        $record=@($entry.tests | Where-Object id -EQ $test.id) | Select-Object -First 1
        $status='Not Tested'
        if($record){
            switch -CaseSensitive ($record.status) {
                'Pass' {$status='Passed'}
                'Passed' {$status='Passed'}
                'Fail' {$status='Failed'}
                'Failed' {$status='Failed'}
                'Not Tested' {}
                default {$warnings.Add("Invalid status for $($b.name), test $($test.id); treated as Not Tested.")}
            }
        }
        [pscustomobject]@{id=$test.id;label=$test.label;status=$status;observations=$record.observations;screenshot=$record.screenshot}
    })
    $passed=@($items | Where-Object status -EQ 'Passed').Count
    $failed=@($items | Where-Object status -EQ 'Failed').Count
    $notTested=12-$passed-$failed
    $overall=if($passed -eq 12){'Passed'}elseif($failed -gt 0){'Failed'}else{'Not Tested'}
    if($machine -and [string]$machine.installed -eq 'False' -and ($passed+$failed -gt 0)){
        $warnings.Add("$($b.name) has recorded test outcomes but the inventory says it was not installed. Reconcile this discrepancy.")
    }
    [pscustomobject]@{id=$b.id;name=$b.name;machine=$machine;tests=$items;passed=$passed;failed=$failed;notTested=$notTested;overall=$overall
        observations=$entry.observations;screenshot=$(if($entry.screenshot){$entry.screenshot}else{$b.screenshot})}
})

# XML helpers escape all submitted content. Invalid XML control characters are discarded.
function X([object]$value){[Security.SecurityElement]::Escape(([string]$value -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]',''))}
function Value-Or([object]$value,[string]$fallback='No evidence provided'){if([string]::IsNullOrWhiteSpace([string]$value)){$fallback}else{[string]$value}}
function P([object]$text,[string]$style='Normal') {
    $paragraphs=foreach($line in ([string]$text -split '\r?\n')){'<w:p><w:pPr><w:pStyle w:val="'+$style+'"/></w:pPr><w:r><w:t xml:space="preserve">'+(X $line)+'</w:t></w:r></w:p>'}
    $paragraphs -join ''
}
function Table($headers,$rows,$widths) {
    $xml=[Text.StringBuilder]::new()
    [void]$xml.Append('<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>')
    foreach($width in $widths){[void]$xml.Append('<w:gridCol w:w="'+$width+'"/>')};[void]$xml.Append('</w:tblGrid>')
    $all=[Collections.Generic.List[object]]::new();$all.Add($headers);foreach($row in $rows){$all.Add($row)}
    for($r=0;$r -lt $all.Count;$r++){
        [void]$xml.Append('<w:tr><w:trPr><w:cantSplit/>'+$(if($r -eq 0){'<w:tblHeader/>'})+'</w:trPr>')
        for($c=0;$c -lt $headers.Count;$c++){
            [void]$xml.Append('<w:tc><w:tcPr><w:tcW w:w="'+$widths[$c]+'" w:type="dxa"/>'+$(if($r -eq 0){'<w:shd w:fill="E8EEF5"/>'})+'</w:tcPr>')
            [void]$xml.Append((P $all[$r][$c] $(if($r -eq 0){'TableHeader'}else{'TableText'})));[void]$xml.Append('</w:tc>')
        };[void]$xml.Append('</w:tr>')
    };[void]$xml.Append('</w:tbl>');$xml.ToString()
}
$body=[Text.StringBuilder]::new()
function Add([string]$xml){[void]$body.Append($xml)}
function Page {Add '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'}
Add (P 'Cross Browser Compatibility Test Report' 'Title')
Add (P 'Cyber Aggression Detector | Manifest V3 desktop extension' 'Subtitle')
Add (P 'Test objective' 'Heading1')
Add (P 'Assess extension loading, protection controls, classification, masking, custom lists, logging, dynamic scanning, and settings persistence in Google Chrome, Microsoft Edge, Brave, and Opera. Results below are tester-recorded observations, not inferred from browser launch success.')
Add (P 'Testing environment' 'Heading1')
$envRows=[Collections.Generic.List[object]]::new()
$envRows.Add(@('Test date',(Value-Or $results.environment.testDate 'Not Tested')))
$envRows.Add(@('Tester',(Value-Or $results.environment.testerName)))
$envRows.Add(@('Operating system reported by tester',(Value-Or $results.environment.operatingSystem)))
$envRows.Add(@('Operating system detected',(Value-Or $inventory.operatingSystem)))
$envRows.Add(@('Extension version reported by tester',(Value-Or $results.environment.extensionVersion)))
$envRows.Add(@('Extension version detected',(Value-Or $inventory.extensionVersion)))
$envRows.Add(@('Inventory capture time',(Value-Or $inventory.capturedAt)))
$envRows.Add(@('Run identifier',(Value-Or $inventory.runId)))
$envRows.Add(@('Required configuration','Hybrid 60% Naive Bayes / 40% VADER; threshold 0.50'))
Add (Table @('Field','Recorded value') $envRows @(3300,6060))
Add (P 'Overall results' 'Heading1')
$rows=[Collections.Generic.List[object]]::new()
foreach($b in $normalized){$rows.Add(@($b.name,$b.passed,$b.failed,$b.notTested,$b.overall))}
Add (Table @('Browser','Passed','Failed','Not Tested','Overall') $rows @(2700,1200,1200,1500,2760))
Add (P 'Passed requires all 12 required tests to be Passed. Any Failed item produces Failed. Otherwise the overall result is Not Tested, including partially completed testing. Screenshot availability is reported separately; a screenshot alone does not prove a test passed.' 'Small')
Page
Add (P 'Browser versions and installation records' 'Heading1')
$rows=[Collections.Generic.List[object]]::new()
foreach($b in $normalized){$rows.Add(@($b.name,(Value-Or $b.machine.version 'Not detected'),(Value-Or $b.machine.fileVersion 'Not detected'),$(if($b.machine){[string]$b.machine.installed}else{'Not detected'})))}
Add (Table @('Browser','Product version','File version','Installed') $rows @(2700,2460,2460,1740))
foreach($b in $normalized){
    Add (P $b.name 'Heading2')
    Add (P ('Executable: '+(Value-Or $b.machine.executablePath)) 'Small')
    Add (P ('Launch record: '+(Value-Or $b.machine.launchStatus 'Not Tested')) 'Small')
    if($b.machine.launchError){Add (P ('Launch error: '+$b.machine.launchError) 'Small')}
}
Add (P 'General observations and data checks' 'Heading1')
Add (P (Value-Or $results.environment.observations))
if($warnings.Count){foreach($warning in $warnings){Add (P $warning)}}else{Add (P 'No input inconsistencies were identified by the report generator. This does not independently verify the submitted observations.')}

$images=[Collections.Generic.List[object]]::new()
$evidenceRoot=[IO.Path]::GetFullPath($ScreenshotDirectory)
foreach($b in $normalized){
    Page
    Add (P ($b.name+' detailed results') 'Heading1')
    Add (P ("Overall: $($b.overall). Passed: $($b.passed); Failed: $($b.failed); Not Tested: $($b.notTested)."))
    $rows=[Collections.Generic.List[object]]::new()
    foreach($test in $b.tests){$rows.Add(@("$($test.id). $($test.label)",$test.status))}
    Add (Table @('Required test','Recorded result') $rows @(7500,1860))
    Add (P 'Observations and encountered problems' 'Heading2')
    Add (P (Value-Or $b.observations))
    foreach($test in $b.tests){if($test.observations){Add (P ("Test $($test.id): $($test.observations)"))}}
    $references=[Collections.Generic.List[object]]::new()
    $references.Add([pscustomobject]@{filename=$b.screenshot;caption="$($b.name) compatibility overview"})
    foreach($test in $b.tests){if($test.screenshot){$references.Add([pscustomobject]@{filename=$test.screenshot;caption="$($b.name) test $($test.id) $($test.label)"})}}
    foreach($reference in $references){
        $filename=[string]$reference.filename
        # Only PNG filenames directly inside the evidence folder are accepted.
        if([IO.Path]::GetFileName($filename) -ne $filename -or $filename -notmatch '(?i)\.png$'){
            Add (P ("$($reference.caption): No evidence provided (invalid PNG filename).") 'Small');continue
        }
        $imagePath=Join-Path $evidenceRoot $filename
        if(-not(Test-Path -LiteralPath $imagePath -PathType Leaf)){
            Add (P ("$($reference.caption): No evidence provided. Expected $filename.") 'Small');continue
        }
        $img=$null
        try{
            $img=[Drawing.Image]::FromFile($imagePath)
            if($img.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Png.Guid){throw 'File is not a PNG'}
            $ratio=[Math]::Min(6.5/$img.Width,7.2/$img.Height)
            $cx=[long]($img.Width*$ratio*914400);$cy=[long]($img.Height*$ratio*914400)
        }catch{Add (P ("$($reference.caption): No evidence provided (unreadable PNG: $filename).") 'Small');continue}
        finally{if($img){$img.Dispose()}}
        $imageId=$images.Count+1;$relId="image$imageId"
        $images.Add([pscustomobject]@{id=$relId;path=$imagePath;name="image$imageId.png"})
        Page;Add (P ($b.name+' screenshot evidence') 'Heading1')
        Add (P ("Figure $imageId. $($reference.caption). Submitted file: $filename. Image supplied by the tester; authenticity and coverage require review.") 'Caption')
        Add ('<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+$cx+'" cy="'+$cy+'"/><wp:docPr id="'+$imageId+'" name="'+(X $filename)+'" descr="'+(X $reference.caption)+'"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="'+(X $filename)+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+$relId+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+$cx+'" cy="'+$cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>')
    }
}
Page
Add (P 'Testing limitations' 'Heading1')
foreach($text in @(
    'The scope is limited to the recorded Windows environment and the tested versions of Google Chrome, Microsoft Edge, Brave, and Opera. Results do not establish compatibility with other browsers, operating systems, profiles, or future releases.',
    'This kit automates inventory collection, page serving, browser launch requests, and report formatting. A human must install the actual extension and assess all 12 functional tests. No results are inferred from successful installation or launch.',
    'The controlled page contains a small set of English text samples. It does not measure dataset-level precision, recall, F1-score, general website coverage, multilingual performance, or performance under heavy workloads.',
    'The standard hybrid configuration uses fixed 60/40 weights and a 0.50 threshold. Runtime guards and custom-list overrides are separate behavior; selecting Hybrid alone is insufficient proof of the weighted calculation.',
    'Missing results are Not Tested. Missing, invalid, or unreadable screenshots are No evidence provided. Recorded passes are tester assertions and should be reviewed alongside evidence.',
    'Browser inventories describe executables found on disk. Auto-updates or an already running browser from another installation can differ from that record. Testers must verify the version in the running browser and refresh the inventory if it differs.',
    'Logs and statistics are local to a browser profile and can include other open eligible pages. Close unrelated tabs and reset records before assessing counters. Fixed exact counter totals are not assumed.',
    'The report does not establish statistical significance, universal compatibility, or end-to-end classification quality beyond the recorded checks.'
)){Add (P $text)}
Add (P 'Source traceability' 'Heading1')
Add (P 'Behavioral procedures were checked against EXTENSION/config.js, manifest.json, content.js, background.js, popup/popup.js, modules/detection_policy.js, and modules/result_display.js. The inventory JSON includes SHA256 hashes of the selected extension files when collected with this kit.')
Add (P ('Source file hash records in inventory: '+@($inventory.extensionHashes).Count))
Add '<w:sectPr><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1440" w:bottom="1080" w:left="1440" w:header="540" w:footer="540"/></w:sectPr>'
$document='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+$body.ToString()+'</w:body></w:document>'
$styles=@'
<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="17273B"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="180"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="52677D"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="30" w:line="240"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="TableText"/><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Small"><w:name w:val="Small"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Small"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
</w:styles>
'@
$relationships='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="footer" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
foreach($img in $images){$relationships+='<Relationship Id="'+$img.id+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+$img.name+'"/>'};$relationships+='</Relationships>'
$contentTypes='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'
$rootRels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
$footer='<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>CAD Shield compatibility report | Page </w:t></w:r><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>'
$OutputPath=[IO.Path]::GetFullPath($OutputPath)
$outputDirectory=[IO.Path]::GetDirectoryName($OutputPath)
if(-not(Test-Path -LiteralPath $outputDirectory)){[void][IO.Directory]::CreateDirectory($outputDirectory)}
$temporary=Join-Path $outputDirectory ([guid]::NewGuid().ToString()+'.docx')
$zip=[IO.Compression.ZipFile]::Open($temporary,[IO.Compression.ZipArchiveMode]::Create)
try{
    $parts=@{'[Content_Types].xml'=$contentTypes;'_rels/.rels'=$rootRels;'word/document.xml'=$document;'word/styles.xml'=$styles;'word/_rels/document.xml.rels'=$relationships;'word/footer1.xml'=$footer}
    foreach($name in $parts.Keys){
        [void][xml]$parts[$name]
        $entry=$zip.CreateEntry($name);$writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
        try{$writer.Write($parts[$name])}finally{$writer.Dispose()}
    }
    foreach($img in $images){[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$img.path,('word/media/'+$img.name))}
}finally{$zip.Dispose()}
Move-Item -LiteralPath $temporary -Destination $OutputPath -Force
$summary=[pscustomobject]@{runId=$inventory.runId;warnings=@($warnings);browsers=@($normalized | Select-Object id,name,passed,failed,notTested,overall)}
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath ([IO.Path]::ChangeExtension($OutputPath,'.summary.json')) -Encoding UTF8
Write-Host "Report generated: $OutputPath"
Write-Host 'Review the report layout in Word or LibreOffice before submission. No missing results were inferred.'
$summary.browsers | Format-Table -AutoSize
