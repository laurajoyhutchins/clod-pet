# Quick build script - rebuilds backend and app
# Run with: powershell -ExecutionPolicy Bypass -File scripts/build.ps1

$ErrorActionPreference = "Stop"

function Write-Info($msg) {
    Write-Host "-> $msg" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host "OK $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "!! $msg" -ForegroundColor Yellow
}

function Write-Fail($msg) {
    Write-Host "ERROR $msg" -ForegroundColor Red
}

function Write-Header($title) {
    Write-Host ""
    Write-Host "== $title ==" -ForegroundColor Blue
}

function Test-CommandExists($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Show-SuccessSheep {
    param(
        [string]$Message
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

    function Fg($ch) {
        $rgb = $colorIndex[[string]$ch]
        if ($null -eq $rgb) { return "" }
        return "$esc[38;2;$($rgb[0]);$($rgb[1]);$($rgb[2])m"
    }

    function Bg($ch) {
        $rgb = $colorIndex[[string]$ch]
        if ($null -eq $rgb) { return "" }
        return "$esc[48;2;$($rgb[0]);$($rgb[1]);$($rgb[2])m"
    }

    $script:esc = $esc
    $script:colorIndex = $colorIndex

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
                $out += "$(Fg $t)$Upper$reset"
            }
            elseif ($t -eq "." -and $b -ne ".") {
                $out += "$(Fg $b)$Lower$reset"
            }
            else {
                $out += "$(Fg $t)$(Bg $b)$Upper$reset"
            }
        }

        Write-Host $out
    }

    Write-Host $reset
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "backend"
$backendBuildScript = Join-Path $backendDir "build.ps1"
$appDir = Join-Path $repoRoot "app"
$backendOutput = if ($env:CLOD_PET_BACKEND_OUTPUT) { $env:CLOD_PET_BACKEND_OUTPUT } else { "clod-pet-backend" }

Write-Header "Building ClodPet"

Write-Info "Checking required tools..."
if (-not (Test-CommandExists "go")) {
    Write-Fail "Go is not installed or not in PATH"
    exit 1
}
if (-not (Test-CommandExists "npm")) {
    Write-Fail "npm is not installed or not in PATH"
    exit 1
}
Write-Success "Required tools found"

Write-Info "Building Go backend..."
if (Test-Path $backendBuildScript) {
    & $backendBuildScript
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Backend build failed"
        exit 1
    }
} else {
    Push-Location $backendDir
    try {
        go build -o $backendOutput .
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Backend build failed"
            exit 1
        }
    } finally {
        Pop-Location
    }
}
Write-Success "Backend built: $backendDir\$backendOutput"

Write-Info "Building app..."
Push-Location $appDir
try {
    if (-not (Test-Path "node_modules")) {
        Write-Info "Installing app dependencies..."
        if (Test-Path "package-lock.json") {
            npm ci --loglevel=error
        } else {
            npm install --loglevel=error
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Failed to install app dependencies"
            exit 1
        }
        Write-Success "Dependencies installed"
    } else {
        Write-Warn "Skipping dependency install (node_modules exists)"
    }

    Write-Info "Compiling TypeScript..."
    npm run build:ts
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "TypeScript build failed"
        exit 1
    }
    Write-Success "TypeScript build complete"
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "===============================" -ForegroundColor Green
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Show-SuccessSheep "build completed successfully!"
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Warn "Backend:  $backendDir\$backendOutput"
Write-Warn "App:      $appDir"
