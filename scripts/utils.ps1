# ClodPet PowerShell Utilities
# This file is intended to be dot-sourced by other scripts:
# . (Join-Path $PSScriptRoot "utils.ps1")

$ErrorActionPreference = "Stop"

function Write-Info($msg) {
    Write-Host ("INFO: " + ${msg}) -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host ("SUCCESS: " + ${msg}) -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host ("WARN: " + ${msg}) -ForegroundColor Yellow
}

function Write-Error($msg) {
    Write-Host ("ERROR: " + ${msg}) -ForegroundColor Red
}

function Write-Fail($msg) {
    Write-Error ${msg}
}

function Write-Header($title) {
    Write-Host ""
    Write-Host ("== " + ${title} + " ==") -ForegroundColor Blue
}

function Write-Section($title) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host ${title} -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Test-CommandExists($cmd) {
    return [bool](Get-Command ${cmd} -ErrorAction SilentlyContinue)
}

function Show-SuccessSheep {
    param(
        [string]$Message = "Task completed successfully!"
    )

    $supportsAnsi = $false
    if (-not [Console]::IsOutputRedirected) {
        try {
            $supportsAnsi = [bool]$Host.UI.SupportsVirtualTerminal
        } catch {
            $supportsAnsi = $false
        }
    }

    Write-Host ""
    Write-Host "Build successful!" -ForegroundColor Yellow
    Write-Host ""

    if (-not $supportsAnsi) {
        Write-Host "      (__)"
        Write-Host "      (oo)"
        Write-Host " /------\/ "
        Write-Host "/ |    ||  "
        Write-Host "*  /----\\  "
        Write-Host "   ~~    ~~ "
        return
    }

    $escChar = [char]27
    $resetSeq = "$(${escChar})[0m"
    $NBChar = " "
    $UpperChar = [char]0x2580   # upper half block
    $LowerChar = [char]0x2584   # lower half block

    $colorIndex = @{
        '.' = $null                # transparent (no pixel)

        '#' = @(0,0,0)            # outline + eye + hoof definition
        'W' = @(255,255,255)      # wool highlight
        'Y' = @(255,255,128)      # wool midtone
        '+' = @(160,160,64)       # wool shadow
        '-' = @(128,128,64)       # deeper wool shadow

        'P' = @(255,192,128)      # face base
        'A' = @(255,160,64)       # face highlight
        'O' = @(255,128,64)       # face shadow

        'D' = @(96,0,64)          # inner ear / mouth / dark accents
        'M' = @(255,96,255)       # ear highlight
        'V' = @(160,0,128)        # ear shadow

        'L' = @(255,192,255)      # leg highlight
        'B' = @(192,192,255)      # leg midtone
    }

    function Get-FgSeq($ch) {
        $rgb = $colorIndex[[string]${ch}]
        if ($null -eq $rgb) { return "" }
        $r = $rgb[0]; $g = $rgb[1]; $b = $rgb[2]
        return "$(${escChar})[38;2;$(${r});$(${g});$(${b})m"
    }

    function Get-BgSeq($ch) {
        $rgb = $colorIndex[[string]${ch}]
        if ($null -eq $rgb) { return "" }
        $r = $rgb[0]; $g = $rgb[1]; $b = $rgb[2]
        return "$(${escChar})[48;2;$(${r});$(${g});$(${b})m"
    }

    $sheepData = @(
"........................................",
"..............###########...............",
"............##WWWWWWWWWWW##.............",
"........####WWWWWYYYYYYYWWW#............",
"......##WWWWWWWYY######YYYWW#...........",
".....#WWWWWWWYY##MMDMMM##YYWW#..........",
"....#WWWWWWYYY#MDMMDMMDMM#YYWW#.........",
"...#WWWWWYYYYY#MMDMVVMVMVM#YW##.........",
"...#WWWWYYYYY#DVMM#####MDV###LL#........",
"...#WWWWYYYYY#MDV#VDDVD#DD#PPLL#........",
"..#WWWWYYYYY#MMV#DDVDVDD##PPPPLL#.......",
"..#WWWWYYYYY#MV#DDDD#####PPPP####.......",
"..#WWWWYYYYY#MD#DD###PPPPPPP#WW###......",
"..#WWWWYYYYY#MD#DD#PPP###PP#BW####......",
".#WWWWYYYYYY#MD#DD#PPP###PP#BW####......",
".#WWWYYYYYYY#MVV#DV###OOOPP#BW#W##......",
"#WWWYYYYYYYY-#DD#VDV###AAPP#BW#####.....",
"#WWYYYYYYYYY-#VDV#DDVV###AP#BBW###L#....",
"#WWYYYYYYYYYY-#VDD####DD##PP#BBW#PPL#...",
"#WYYYYYYYYYYYY#DDDVDDDD#--#PP###PPPPL#..",
"#WYYYYYYYYYYYY-##VDDV##--YY#PPPPPPPPPL#.",
"#YYYYYYYYYYYYYY--####--YYYY#PPPPPPPPPPL#",
"#YYYYYYYYYYYYYYYY----YYYYYY+#PPPPPPPPPA#",
"#YYYYYYYYYYYYYYYYYYYYYYYY+++#APPPPPPPAA#",
"#+YYYY++YYYY+YYYYYYYYY+++Y++#AAAPPPPAAA#",
"#+++YYYY++++YYYY+YY+YYYYY+++#OAAAAAAAAA#",
".#++++YYY++YYYY+YYYY+++++++++#OAAAAAAAO#",
".#YYYYY+YY+++++YYY+YYYY++++++-#OOAAAOO#.",
"..#YY++++YY+++YY++++++++++--+--#OOOOO#..",
"..#+++++++++++++++--+++----++++#OOOOO#..",
"...#-+++++--+++--++-------++---#OOO##...",
"....#--++-------++++-----------####.....",
".....#----------+-------------#.........",
"......##--------------#------#..........",
".......######------##########...........",
".......#OAA#O######.#OOO#OAP#...........",
".......#OAPP#OOO#..#OOO#OAPP#...........",
"........#APPP#OO#..#OO#OAPP#............",
"........#OAPP#O#....##OAPP#.............",
".........#OA###......##AP#..............",
"..........##...........##..............."
)

    for ($y = 0; $y -lt $sheepData.Count; $y += 2) {
        $topLine = $sheepData[$y]
        $bottomLine = if ($y + 1 -lt $sheepData.Count) { $sheepData[$y + 1] } else { "." * $topLine.Length }

        $outStr = ""
        for ($x = 0; $x -lt $topLine.Length; $x++) {
            $tChar = [string]$topLine[$x]
            $bChar = [string]$bottomLine[$x]

            if ($tChar -eq "." -and $bChar -eq ".") {
                $outStr += ${NBChar}
            }
            elseif ($tChar -ne "." -and $bChar -eq ".") {
                $fgSeq = Get-FgSeq ${tChar}
                $outStr += (${fgSeq} + ${UpperChar} + ${resetSeq})
            }
            elseif ($tChar -eq "." -and $bChar -ne ".") {
                $fgSeq = Get-FgSeq ${bChar}
                $outStr += (${fgSeq} + ${LowerChar} + ${resetSeq})
            }
            else {
                $fgSeq = Get-FgSeq ${tChar}
                $bgSeq = Get-BgSeq ${bChar}
                $outStr += (${fgSeq} + ${bgSeq} + ${UpperChar} + ${resetSeq})
            }
        }
        Write-Host ${outStr}
    }

    Write-Host ${resetSeq}
}

function Show-FailureSheep {
    param(
        [string]$Message = "Task failed!"
    )

    $supportsAnsi = $false
    if (-not [Console]::IsOutputRedirected) {
        try {
            $supportsAnsi = [bool]$Host.UI.SupportsVirtualTerminal
        } catch {
            $supportsAnsi = $false
        }
    }

    Write-Host ""
    Write-Host "Task failed!" -ForegroundColor Red
    Write-Host ""

    if (-not $supportsAnsi) {
        Write-Host "      (xx)"
        Write-Host "      (oo)"
        Write-Host " /------\/ "
        Write-Host "/ |    ||  "
        Write-Host "*  /----\\  "
        Write-Host "   ~~    ~~ "
        return
    }

    $escChar = [char]27
    $resetSeq = "$(${escChar})[0m"
    $NBChar = " "
    $UpperChar = [char]0x2580   # upper half block
    $LowerChar = [char]0x2584   # lower half block

    $colorIndex = @{
        '.' = $null                # transparent (no pixel)

        '#' = @(0,0,0)             # outline + eye + hoof definition
        'W' = @(96,96,96)          # wool highlight, muted for failure
        'Y' = @(192,64,64)         # wool midtone
        '+' = @(160,32,32)         # wool shadow
        '-' = @(96,16,16)          # deeper wool shadow

        'P' = @(160,96,96)         # face base
        'A' = @(224,64,64)         # face highlight
        'O' = @(128,0,0)           # face shadow

        'D' = @(64,0,0)            # inner ear / mouth / dark accents
        'M' = @(255,96,96)         # ear highlight
        'V' = @(160,0,0)           # ear shadow

        'L' = @(255,160,160)       # leg highlight
        'B' = @(192,192,192)       # leg midtone
    }

    function Get-FgSeq($ch) {
        $rgb = $colorIndex[[string]${ch}]
        if ($null -eq $rgb) { return "" }
        $r = $rgb[0]; $g = $rgb[1]; $b = $rgb[2]
        return "$(${escChar})[38;2;$(${r});$(${g});$(${b})m"
    }

    function Get-BgSeq($ch) {
        $rgb = $colorIndex[[string]${ch}]
        if ($null -eq $rgb) { return "" }
        $r = $rgb[0]; $g = $rgb[1]; $b = $rgb[2]
        return "$(${escChar})[48;2;$(${r});$(${g});$(${b})m"
    }

    $sheepData = @(
"........................................",
"..............###########...............",
"............##WWWWWWWWWWW##.............",
"........####WWWWWYYYYYYYWWW#............",
"......##WWWWWWWYY######YYYWW#...........",
".....#WWWWWWWYY##MMDMMM##YYWW#..........",
"....#WWWWWWYYY#MDMMDMMDMM#YYWW#.........",
"...#WWWWWYYYYY#MMDMVVMVMVM#YW##.........",
"...#WWWWYYYYY#DVMM#####MDV###LL#........",
"...#WWWWYYYYY#MDV#VDDVD#DD#PPLL#........",
"..#WWWWYYYYY#MMV#DDVDVDD##PPPPLL#.......",
"..#WWWWYYYYY#MV#DDDD#####PPPP####.......",
"..#WWWWYYYYY#MD#DD###PPPPPPP#WW###......",
"..#WWWWYYYYY#MD#DD#PPP###PP#BW####......",
".#WWWWYYYYYY#MD#DD#PPP###PP#BW####......",
".#WWWYYYYYYY#MVV#DV###OOOPP#BW#W##......",
"#WWWYYYYYYYY-#DD#VDV###AAPP#BW#####.....",
"#WWYYYYYYYYY-#VDV#DDVV###AP#BBW###L#....",
"#WWYYYYYYYYYY-#VDD####DD##PP#BBW#PPL#...",
"#WYYYYYYYYYYYY#DDDVDDDD#--#PP###PPPPL#..",
"#WYYYYYYYYYYYY-##VDDV##--YY#PPPPPPPPPL#.",
"#YYYYYYYYYYYYYY--####--YYYY#PPPPPPPPPPL#",
"#YYYYYYYYYYYYYYYY----YYYYYY+#PPPPPPPPPA#",
"#YYYYYYYYYYYYYYYYYYYYYYYY+++#APPPPPPPAA#",
"#+YYYY++YYYY+YYYYYYYYY+++Y++#AAAPPPPAAA#",
"#+++YYYY++++YYYY+YY+YYYYY+++#OAAAAAAAAA#",
".#++++YYY++YYYY+YYYY+++++++++#OAAAAAAAO#",
".#YYYYY+YY+++++YYY+YYYY++++++-#OOAAAOO#.",
"..#YY++++YY+++YY++++++++++--+--#OOOOO#..",
"..#+++++++++++++++--+++----++++#OOOOO#..",
"...#-+++++--+++--++-------++---#OOO##...",
"....#--++-------++++-----------####.....",
".....#----------+-------------#.........",
"......##--------------#------#..........",
".......######------##########...........",
".......#OAA#O######.#OOO#OAP#...........",
".......#OAPP#OOO#..#OOO#OAPP#...........",
"........#APPP#OO#..#OO#OAPP#............",
"........#OAPP#O#....##OAPP#.............",
".........#OA###......##AP#..............",
"..........##...........##..............."
    )

    for ($y = 0; $y -lt $sheepData.Count; $y += 2) {
        $topLine = $sheepData[$y]
        $bottomLine = if ($y + 1 -lt $sheepData.Count) { $sheepData[$y + 1] } else { "." * $topLine.Length }

        $outStr = ""
        for ($x = 0; $x -lt $topLine.Length; $x++) {
            $tChar = [string]$topLine[$x]
            $bChar = [string]$bottomLine[$x]

            if ($tChar -eq "." -and $bChar -eq ".") {
                $outStr += ${NBChar}
            }
            elseif ($tChar -ne "." -and $bChar -eq ".") {
                $fgSeq = Get-FgSeq ${tChar}
                $outStr += (${fgSeq} + ${UpperChar} + ${resetSeq})
            }
            elseif ($tChar -eq "." -and $bChar -ne ".") {
                $fgSeq = Get-FgSeq ${bChar}
                $outStr += (${fgSeq} + ${LowerChar} + ${resetSeq})
            }
            else {
                $fgSeq = Get-FgSeq ${tChar}
                $bgSeq = Get-BgSeq ${bChar}
                $outStr += (${fgSeq} + ${bgSeq} + ${UpperChar} + ${resetSeq})
            }
        }
        Write-Host ${outStr}
    }

    Write-Host ${resetSeq}
}
