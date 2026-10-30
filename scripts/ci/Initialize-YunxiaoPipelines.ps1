# Copyright The Open Forge contributors.
param(
    [string]$GeneratedDirectory = 'C:\Users\xquan\Tools\AliyunCLI\allstar-flow',
    [switch]$SelfTest,
    [switch]$Probe,
    [switch]$Update
)
$ErrorActionPreference = 'Stop'
$organization = '621301e6c5006adb19febbd6'
$baseUrl = "https://openapi-rdc.aliyuncs.com/oapi/v1/flow/organizations/$organization"
$repository = 'https://codeup.aliyun.com/621301e6c5006adb19febbd6/Allstar_AI/ALLSTAR-AI.git'
$githubRepository = 'https://github.com/hxquan-q/open-forge.git'

function Get-PipelineListItems($Response) {
    # The list endpoint has returned flat arrays, nested arrays and envelope objects
    # across Flow versions. Normalize one level of each without trusting any shape.
    $items = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in @($Response)) {
        if ($null -eq $entry) { continue }
        if ($entry -is [System.Array]) {
            foreach ($child in $entry) { $items.Add($child) }
            continue
        }
        $envelope = $null
        foreach ($candidate in @('data', 'items', 'pipelines', 'pipelineList')) {
            $property = $entry.PSObject.Properties[$candidate]
            if ($null -ne $property -and $property.Value -is [System.Array]) { $envelope = $property; break }
        }
        if ($null -ne $envelope) {
            foreach ($child in $envelope.Value) { $items.Add($child) }
            continue
        }
        $items.Add($entry)
    }
    $items.ToArray()
}

function Get-PipelineIdentity($Item) {
    if ($null -eq $Item) { throw 'Pipeline list contains an empty entry.' }
    $id = [string]$Item.pipelineId
    if ([string]::IsNullOrWhiteSpace($id)) { $id = [string]$Item.id }
    $name = [string]$Item.pipelineName
    if ([string]::IsNullOrWhiteSpace($name)) { $name = [string]$Item.name }
    if ($id -notmatch '^\d+$' -or [string]::IsNullOrWhiteSpace($name)) {
        throw 'Pipeline list entry has no numeric pipelineId and pipelineName; re-run with -Probe and review the safe shape report.'
    }
    [pscustomobject]@{Id=$id;Name=$name}
}

function Assert-PipelineId([string]$Value) {
    if ($Value -notmatch '^\d+$') { throw 'Pipeline ID is not a single numeric value; no request was sent.' }
    $Value
}

function Get-CreatedPipelineId($Response) {
    if ($Response -is [string]) { return (Assert-PipelineId $Response.Trim()) }
    $values = @(Get-PipelineListItems $Response)
    if ($values.Count -ne 1) { throw 'Unexpected pipeline creation response; no further mutation attempted.' }
    $id = [string]$values[0].pipelineId
    if ([string]::IsNullOrWhiteSpace($id)) { $id = [string]$values[0].id }
    Assert-PipelineId $id
}

function Get-SourceLocations($Pipeline) {
    @($Pipeline.pipelineConfig.sources | ForEach-Object {
        foreach ($field in @('repo', 'endpoint', 'cloneUrl', 'url')) {
            $value = [string]$_.data.$field
            if (-not [string]::IsNullOrWhiteSpace($value)) { $value }
        }
    })
}

function Test-SameRepository([string[]]$Locations, [string]$Expected) {
    $normalize = {
        param([string]$Value)
        ($Value.Trim().TrimEnd('/') -replace '\.git$', '').ToLowerInvariant()
    }
    $target = & $normalize $Expected
    @($Locations | ForEach-Object { & $normalize $_ }) -contains $target
}

function Get-SafeSummary($Pipeline, [string]$Id, [string]$Status = 'created_or_reused') {
    $sources = @($Pipeline.pipelineConfig.sources | Where-Object { $null -ne $_ } | ForEach-Object {
        [pscustomobject]@{
            Type = $_.type
            Branch = $_.data.branch
            Trigger = $_.data.isTrigger
            Events = @($_.data.events)
            HasWebhook = -not [string]::IsNullOrWhiteSpace([string]$_.data.webhook)
        }
    })
    [pscustomobject]@{PipelineId=$Id;Name=$Pipeline.name;Sources=$sources;Status=$Status}
}

if ($SelfTest) {
    $sample = [pscustomobject]@{name='fixture';pipelineConfig=@{sources=@(@{type='git';data=@{webhook='SECRET';password='SECRET';isTrigger=$true;branch='dev';events=@('push')}})}}
    $summary = Get-SafeSummary $sample '1'
    $json = $summary | ConvertTo-Json -Depth 8
    if ($json.Contains('SECRET') -or -not $summary.Sources[0].HasWebhook) {throw 'Summary self-test failed'}

    $alpha = [pscustomobject]@{pipelineId=11;pipelineName='alpha'}
    $beta = [pscustomobject]@{id=22;name='beta'}
    if (@(Get-PipelineListItems @(,$alpha + $beta)).Count -ne 2) {throw 'Nested list normalization self-test failed.'}
    if (@(Get-PipelineListItems @($alpha, $beta)).Count -ne 2) {throw 'Flat list normalization self-test failed.'}
    if (@(Get-PipelineListItems ([pscustomobject]@{data=@($alpha, $beta)})).Count -ne 2) {throw 'Envelope list normalization self-test failed.'}
    if ((Get-PipelineIdentity $alpha).Id -ne '11' -or (Get-PipelineIdentity $beta).Name -ne 'beta') {throw 'Pipeline identity self-test failed.'}
    if ((Get-CreatedPipelineId '123') -ne '123') {throw 'Scalar creation response self-test failed.'}
    if ((Get-CreatedPipelineId ([pscustomobject]@{pipelineId=456})) -ne '456') {throw 'Object creation response self-test failed.'}
    if (-not (Test-SameRepository @('https://codeup.aliyun.com/x/y/Z.git/') 'https://codeup.aliyun.com/x/y/Z')) {throw 'Repository comparison self-test failed.'}
    $rejected = $false
    try { Assert-PipelineId '11 22' | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Invalid ID rejection self-test failed.' }
    Write-Output 'SelfTestPassed; no network requests'
    return
}

if (-not $env:ALIBABA_CLOUD_YUNXIAO_ACCESS_TOKEN) {throw 'Run in the existing PowerShell window containing your Yunxiao token.'}

function Invoke-Flow([string]$Method, [string]$Path, $Payload) {
    # Invoke-RestMethod under Windows PowerShell decodes UTF-8 responses as Latin-1
    # when the server omits charset, which silently breaks pipeline-name matching.
    if (-not ('System.Net.Http.HttpClient' -as [type])) { Add-Type -AssemblyName System.Net.Http }
    $client = [System.Net.Http.HttpClient]::new()
    try {
        $client.Timeout = [TimeSpan]::FromSeconds(60)
        $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method.ToUpperInvariant()), "$baseUrl/$Path")
        $request.Headers.Add('x-yunxiao-token', $env:ALIBABA_CLOUD_YUNXIAO_ACCESS_TOKEN)
        $request.Headers.Add('Accept', 'application/json')
        if ($null -ne $Payload) {
            $json = $Payload | ConvertTo-Json -Depth 30 -Compress
            $request.Content = [System.Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        $text = [Text.Encoding]::UTF8.GetString($bytes)
        if (-not $response.IsSuccessStatusCode) {
            $status = [int]$response.StatusCode
            $errorCode = 'unavailable'
            $safeMessage = ''
            try {
                $details = $text | ConvertFrom-Json
                $candidate = if ($details.errorCode) {$details.errorCode} else {$details.code}
                if ($candidate -match '^[A-Za-z0-9._-]+$') {$errorCode=$candidate}
                # These requests contain no secrets in their payload. Retain bounded validation
                # diagnostics, strip URLs and token-like strings, never dump full API objects.
                $safeMessage = [string]$(if ($details.errorMessage) {$details.errorMessage} else {$details.message})
                $safeMessage = $safeMessage -replace 'https?://\S+', '[URL omitted]' -replace 'pt-[A-Za-z0-9_-]+', '[token omitted]'
                if ($safeMessage.Length -gt 500) {$safeMessage=$safeMessage.Substring(0,500)}
            } catch {}
            throw "Flow request failed: HTTP $status; code=$errorCode; validation=$safeMessage"
        }
        if ([string]::IsNullOrWhiteSpace($text)) { return $null }
        return ($text | ConvertFrom-Json)
    } finally {
        $client.Dispose()
    }
}

if ($Probe) {
    # Read-only: report the safe shape of the list response without pipeline config values.
    $raw = Invoke-Flow 'GET' 'pipelines?page=1&perPage=30' $null
    $top = @($raw)
    $entries = @(
        for ($index = 0; $index -lt [Math]::Min($top.Count, 5); $index++) {
            $entry = $top[$index]
            if ($null -eq $entry) {
                [pscustomobject]@{Index=$index;Kind='null'}
                continue
            }
            if ($entry -is [System.Array]) {
                $children = @(
                    for ($childIndex = 0; $childIndex -lt [Math]::Min($entry.Count, 5); $childIndex++) {
                        $child = $entry[$childIndex]
                        [pscustomobject]@{
                            Index=$childIndex
                            Type=if ($null -eq $child) {'null'} else {$child.GetType().Name}
                            Properties=if ($null -eq $child -or $child -is [string]) {@()} else {@($child.PSObject.Properties.Name)}
                            PipelineId=[string]$child.pipelineId
                            PipelineName=[string]$child.pipelineName
                            Id=[string]$child.id
                            Name=[string]$child.name
                        }
                    }
                )
                [pscustomobject]@{Index=$index;Kind='array';Count=$entry.Count;Children=$children}
                continue
            }
            [pscustomobject]@{
                Index=$index
                Kind='object'
                Type=$entry.GetType().Name
                Properties=@($entry.PSObject.Properties.Name)
                PipelineId=[string]$entry.pipelineId
                PipelineName=[string]$entry.pipelineName
                Id=[string]$entry.id
                Name=[string]$entry.name
            }
        }
    )
    $probeReport = [ordered]@{
        OrganizationId=$organization
        Operation='probe:list'
        RawType=if ($null -eq $raw) {'null'} else {$raw.GetType().FullName}
        TopLevelCount=$top.Count
        NormalizedCount=@(Get-PipelineListItems $raw).Count
        Entries=$entries
    }
    $probeJson = $probeReport | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText((Join-Path $GeneratedDirectory 'flow-list-probe.json'), $probeJson, [Text.UTF8Encoding]::new($false))
    Write-Output $probeJson
    return
}

$definitions = Get-Content -LiteralPath (Join-Path $GeneratedDirectory 'pipelines.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($definitions).Count -ne 2) {throw 'Expected exactly two reviewed pipeline definitions.'}

$report = [ordered]@{OrganizationId=$organization;Pipelines=@();Complete=$false;Operation='list';Failure=$null;Update=$Update.IsPresent}
try {
    $existing = @()
    for ($page=1; $page -le 100; $page++) {
        $pageItems = @(Get-PipelineListItems (Invoke-Flow 'GET' "pipelines?page=$page&perPage=30" $null))
        $existing += $pageItems
        if ($pageItems.Count -lt 30) {break}
        if ($page -eq 100) {throw 'Pipeline list exceeds safe pagination limit.'}
    }
    $existing = @($existing | ForEach-Object { Get-PipelineIdentity $_ })
    foreach ($definition in $definitions) {
        $name = [string]$definition.name
        $content = [string]$definition.content
        if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($content)) {throw 'Pipeline definition is incomplete.'}
        # Refuse a name collision with an unrelated source; never update old pipelines.
        $nameMatches = @($existing | Where-Object {$_.Name -eq $name})
        if ($nameMatches.Count -gt 1) {throw 'Duplicate pipeline names require manual review.'}
        $status = 'created_or_reused'
        if ($nameMatches.Count -eq 1) {
            $id = Assert-PipelineId $nameMatches[0].Id
            $report.Operation = "read:$id"
            $pipeline = Invoke-Flow 'GET' "pipelines/$id" $null
            $expected = $content | ConvertFrom-Json
            $expectedEndpoint = if ($expected.sources.codeup) {$repository} else {$githubRepository}
            $locations = @(Get-SourceLocations $pipeline)
            if ($locations.Count -eq 0 -or -not (Test-SameRepository $locations $expectedEndpoint)) {throw 'Existing pipeline name belongs to a different repository.'}
            if ($Update) {
                $report.Operation = "update:$id"
                Invoke-Flow 'PUT' "pipelines/$id" @{name=$name;content=$content} | Out-Null
                $pipeline = Invoke-Flow 'GET' "pipelines/$id" $null
                $status = 'updated'
            }
        } else {
            $report.Operation = "create:$name"
            $id = Get-CreatedPipelineId (Invoke-Flow 'POST' 'pipelines' @{name=$name;content=$content})
            $pipeline = Invoke-Flow 'GET' "pipelines/$id" $null
            $status = 'created'
        }
        $report.Pipelines += Get-SafeSummary $pipeline $id $status
    }
    $report.Complete = $true
    $report.Operation = 'complete'
} catch {
    # Only controlled errors reach this report; never serialize API objects or exception details.
    $message = [string]$_.Exception.Message
    $report.Failure = if ($message.StartsWith('Flow request failed:')) {$message} else {'Setup stopped. Check pipeline names, definitions and source permissions.'}
} finally {
    $json = $report | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText((Join-Path $GeneratedDirectory 'setup-result.json'), $json, [Text.UTF8Encoding]::new($false))
    Write-Output $json
}
if (-not $report.Complete) {throw 'Setup incomplete; see the safe setup-result.json report.'}
Write-Host 'Created/read back two pipelines. Sync credentials, GitHub webhook, timer and first-run acceptance are still pending.'
