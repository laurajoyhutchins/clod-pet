#!/usr/bin/env bash

# ClodPet Shell Utilities
# This file is intended to be sourced by other scripts:
# source "$(dirname "${BASH_SOURCE[0]}")/utils.sh"

# Color and style configuration
if [[ -t 1 ]]; then
  BOLD='\033[1m'
  DIM='\033[2m'
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  RESET='\033[0m'
else
  BOLD='' DIM='' RED='' GREEN='' YELLOW='' BLUE='' CYAN='' RESET=''
fi

# Visual elements
ARROW="→"
CHECK="✓"
CROSS="✗"
BULLET="•"

# Print functions
info()    { printf "${CYAN}${ARROW} %s${RESET}\n" "$*"; }
success() { printf "${GREEN}${CHECK} %s${RESET}\n" "$*"; }
warn()    { printf "${YELLOW}  ${BULLET} %s${RESET}\n" "$*"; }
error()   { printf "${RED}${CROSS} %s${RESET}\n" "$*" >&2; }
header() {
  echo ""
  printf "${BOLD}${BLUE}══ $* ══${RESET}\n"
}

section() {
  echo ""
  printf "${CYAN}============================================================${RESET}\n"
  printf "${CYAN}%s${RESET}\n" "$*"
  printf "${CYAN}============================================================${RESET}\n"
}

show_success_sheep() {
    local message="${1:-Task completed successfully!}"
    
    printf "\n"
    printf "${YELLOW}  __________________________________${RESET}\n"
    printf "${YELLOW} /                                  \\${RESET}\n"
    printf "${YELLOW}|  %-32s|${RESET}\n" "$message"
    printf "${YELLOW} \\__________________________________/${RESET}\n"

    local esc="\033"
    local reset="${esc}[0m"
    local upper="▀"
    local lower="▄"
    local nb=" "

    # Color index (R;G;B)
    declare -A colors
    colors['#']="0;0;0"
    colors['W']="255;255;255"
    colors['Y']="255;255;128"
    colors['+']="160;160;64"
    colors['-']="128;128;64"
    colors['P']="255;192;128"
    colors['A']="255;160;64"
    colors['O']="255;128;64"
    colors['D']="96;0;64"
    colors['M']="255;96;255"
    colors['V']="160;0;128"
    colors['L']="255;192;255"
    colors['B']="192;192;255"

    get_fg() {
        local ch="$1"
        if [[ -z "${colors[$ch]}" ]]; then echo ""; return; fi
        echo -e "${esc}[38;2;${colors[$ch]}m"
    }

    get_bg() {
        local ch="$1"
        if [[ -z "${colors[$ch]}" ]]; then echo ""; return; fi
        echo -e "${esc}[48;2;${colors[$ch]}m"
    }

    local sheep=(
"........................................"
"..............###########..............."
"............##WWWWWWWWWWW##............."
"........####WWWWWYYYYYYYWWW#............"
"......##WWWWWWWYY######YYYWW#..........."
".....#WWWWWWWYY##MMDMMM##YYWW#.........."
"....#WWWWWWYYY#MDMMDMMDMM#YYWW#........."
"...#WWWWWYYYYY#MMDMVVMVMVM#YW##........."
"...#WWWWYYYYY#DVMM#####MDV###LL#........"
"...#WWWWYYYYY#MDV#VDDVD#DD#PPLL#........"
"..#WWWWYYYYY#MMV#DDVDVDD##PPPPLL#......."
"..#WWWWYYYYY#MV#DDDD#####PPPP####......."
"..#WWWWYYYYY#MD#DD###PPPPPPP#WW###......"
"..#WWWWYYYYY#MD#DD#PPP###PP#BW####......"
".#WWWWYYYYYY#MD#DD#PPP###PP#BW####......"
".#WWWYYYYYYY#MVV#DV###OOOPP#BW#W##......"
"#WWWYYYYYYYY-#DD#VDV###AAPP#BW#####....."
"#WWYYYYYYYYY-#VDV#DDVV###AP#BBW###L#...."
"#WWYYYYYYYYYY-#VDD####DD##PP#BBW#PPL#..."
"#WYYYYYYYYYYYY#DDDVDDDD#--#PP###PPPPL#.."
"#WYYYYYYYYYYYY-##VDDV##--YY#PPPPPPPPPL#."
"#YYYYYYYYYYYYYY--####--YYYY#PPPPPPPPPPL#"
"#YYYYYYYYYYYYYYYY----YYYYYY+#PPPPPPPPPA#"
"#YYYYYYYYYYYYYYYYYYYYYYYY+++#APPPPPPPAA#"
"#+YYYY++YYYY+YYYYYYYYY+++Y++#AAAPPPPAAA#"
"#+++YYYY++++YYYY+YY+YYYYY+++#OAAAAAAAAA#"
".#++++YYY++YYYY+YYYY+++++++++#OAAAAAAAO#"
".#YYYYY+YY+++++YYY+YYYY++++++-#OOAAAOO#."
"..#YY++++YY+++YY++++++++++--+--#OOOOO#.."
"..#+++++++++++++++--+++----++++#OOOOO#.."
"...#-+++++--+++--++-------++---#OOO##..."
"....#--++-------++++-----------####....."
".....#----------+-------------#........."
"......##--------------#------#.........."
".......######------##########..........."
".......#OAA#O######.#OOO#OAP#..........."
".......#OAPP#OOO#..#OOO#OAPP#..........."
"........#APPP#OO#..#OO#OAPP#............"
"........#OAPP#O#....##OAPP#............."
".........#OA###......##AP#.............."
"..........##...........##..............."
    )

    for ((y=0; y<${#sheep[@]}; y+=2)); do
        local top="${sheep[$y]}"
        local bottom="${sheep[$((y+1))]}"
        if [[ -z "$bottom" ]]; then
            bottom=$(printf '%.0s.' $(seq 1 ${#top}))
        fi

        local out=""
        for ((x=0; x<${#top}; x++)); do
            local t="${top:$x:1}"
            local b="${bottom:$x:1}"

            if [[ "$t" == "." && "$b" == "." ]]; then
                out+="$nb"
            elif [[ "$t" != "." && "$b" == "." ]]; then
                out+="$(get_fg "$t")$upper$reset"
            elif [[ "$t" == "." && "$b" != "." ]]; then
                out+="$(get_fg "$b")$lower$reset"
            else
                out+="$(get_fg "$t")$(get_bg "$b")$upper$reset"
            fi
        done
        echo -e "$out"
    done
    echo -e "$reset"
}
