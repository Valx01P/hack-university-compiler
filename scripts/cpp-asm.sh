#!/bin/sh
# Prints the assembly the sandbox's own g++ 10.2 makes for one C++ file, at
# -O2 with Intel syntax (pass other flags after the file, like -O0).
# Usage: scripts/cpp-asm.sh file.cpp [extra g++ flags]
# Only compiles, inside a throwaway folder in the hu-piston container.
f="$1"; shift
[ -f "$f" ] || { echo "usage: $0 file.cpp [flags]" >&2; exit 2; }
docker exec -i hu-piston sh -c 'd=$(mktemp -d) && cat > "$d/x.cpp" && cd "$d" && PATH=/piston/packages/gcc/10.2.0/bin:$PATH g++ -std=c++17 -O2 -S -masm=intel -fno-asynchronous-unwind-tables -fno-exceptions -o - x.cpp '"$*"' | grep -v -E "^\s*\.(file|ident|section|text|globl|type|size|p2align|align|cfi_|section)" ; rm -rf "$d"' < "$f"
