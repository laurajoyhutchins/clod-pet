# ClodPet PowerShell Utilities
# This file is intended to be dot-sourced by other scripts:
# . (Join-Path $PSScriptRoot "utils.ps1")

$ErrorActionPreference = "Stop"

function Write-Info($msg) {
    Write-Host "→ $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "✓ $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  • $msg" -ForegroundColor Yellow
}

function Write-Error($msg) {
    Write-Host "✗ $msg" -ForegroundColor Red
}

function Write-Header($title) {
    Write-Host ""
    Write-Host "══ $title ══" -ForegroundColor Blue
}

function Write-Section($title) {
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host $title -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Test-CommandExists($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Show-SuccessSheep {
    param(
        [string]$Message = "Task completed successfully!"
    )

    Write-Host ""
    Write-Host "  __________________________________" -ForegroundColor Yellow
    Write-Host " /                                  \" -ForegroundColor Yellow
    Write-Host ("|  {0,-32}|" -f $Message) -ForegroundColor Yellow
    Write-Host " \__________________________________/" -ForegroundColor Yellow

    $esc   = [char]27
    $reset = "$esc[0m"
    $NB    = [char]0x00A0
    $Upper = [char]0x2580   # upper half block
    $Lower = [char]0x2584   # lower half block

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

    function Get-Fg($ch) {
        $rgb = $colorIndex[[string]$ch]
        if ($null -eq $rgb) { return "" }
        return "$esc[38;2;$($rgb[0]);$($rgb[1]);$($rgb[2])m"
    }

    function Get-Bg($ch) {
        $rgb = $colorIndex[[string]$ch]
        if ($null -eq $rgb) { return "" }
        return "$esc[48;2;$($rgb[0]);$($rgb[1]);$($rgb[2])m"
    }

    $sheep = @'
........................................
..............###########...............
............##WWWWWWWWWWW##.............
........####WWWWWYYYYYYYWWW#............
......##WWWWWWWYY######YYYWW#...........
.....#WWWWWWWYY##MMDMMM##YYWW#..........
....#WWWWWWYYY#MDMMDMMDMM#YYWW#.........
...#WWWWWYYYYY#MMDMVVMVMVM#YW##.........
...#WWWWYYYYY#DVMM#####MDV###LL#........
...#WWWWYYYYY#MDV#VDDVD#DD#PPLL#........
..#WWWWYYYYY#MMV#DDVDVDD##PPPPLL#.......
..#WWWWYYYYY#MV#DDDD#####PPPP####.......
..#WWWWYYYYY#MD#DD###PPPPPPP#WW###......
..#WWWWYYYYY#MD#DD#PPP###PP#BW####......
.#WWWWYYYYYY#MD#DD#PPP###PP#BW####......
.#WWWYYYYYYY#MVV#DV###OOOPP#BW#W##......
#WWWYYYYYYYY-#DD#VDV###AAPP#BW#####.....
#WWYYYYYYYYY-#VDV#DDVV###AP#BBW###L#....
#WWYYYYYYYYYY-#VDD####DD##PP#BBW#PPL#...
#WYYYYYYYYYYYY#DDDVDDDD#--#PP###PPPPL#..
#WYYYYYYYYYYYY-##VDDV##--YY#PPPPPPPPPL#.
#YYYYYYYYYYYYYY--####--YYYY#PPPPPPPPPPL#
#YYYYYYYYYYYYYYYY----YYYYYY+#PPPPPPPPPA#
#YYYYYYYYYYYYYYYYYYYYYYYY+++#APPPPPPPAA#
#+YYYY++YYYY+YYYYYYYYY+++Y++#AAAPPPPAAA#
#+++YYYY++++YYYY+YY+YYYYY+++#OAAAAAAAAA#
.#++++YYY++YYYY+YYYY+++++++++#OAAAAAAAO#
.#YYYYY+YY+++++YYY+YYYY++++++-#OOAAAOO#.
..#YY++++YY+++YY++++++++++--+--#OOOOO#..
..#+++++++++++++++--+++----++++#OOOOO#..
...#-+++++--+++--++-------++---#OOO##...
....#--++-------++++-----------####.....
.....#----------+-------------#.........
......##--------------#------#..........
.......######------##########...........
.......#OAA#O######.#OOO#OAP#...........
.......#OAPP#OOO#..#OOO#OAPP#...........
........#APPP#OO#..#OO#OAPP#............
........#OAPP#O#....##OAPP#.............
.........#OA###......##AP#..............
..........##...........##...............
'@ -split "`n"

    for ($y = 0; $y -lt $sheep.Count; $y += 2) {
        $top = $sheep[$y].TrimEnd("`r")
        $bottom = if ($y + 1 -lt $sheep.Count) {
            $sheep[$y + 1].TrimEnd("`r")
        } else {
            "." * $top.Length
        }

        $out = ""

        for ($x = 0; $x -lt $top.Length; $x++) {
            $t = [string]$top[$x]
            $b = [string]$bottom[$x]

            if ($t -eq "." -and $b -eq ".") {
                $out += $NB
            }
            elseif ($t -ne "." -and $b -eq ".") {
                $out += "$(Get-Fg $t)$Upper$reset"
            }
            elseif ($t -eq "." -and $b -ne ".") {
                $out += "$(Get-Fg $b)$Lower$reset"
            }
            else {
                $out += "$(Get-Fg $t)$(Get-Bg $b)$Upper$reset"
            }
        }

        Write-Host $out
    }

    Write-Host $reset
}
