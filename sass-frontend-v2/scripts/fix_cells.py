#!/usr/bin/env python3
"""
Fix the remaining react-table artifacts in column cell signatures and
add rowKey props where DataTable is used.
"""
import os, re, sys

files = sys.argv[1:]
for f in files:
    with open(f, 'r', encoding='utf-8') as fh:
        src = fh.read()
    new = src

    # Replace any cell: ({ getValue, row }) => ... or cell: ({ getValue }) => ... or
    # cell: ({ row }) => ... with cell: (row, idx) => ...
    # We need to be careful — the body may contain the word 'row' so we just strip the destructure.
    new = re.sub(r"cell:\s*\(\{\s*getValue\s*,\s*row\s*\}\)\s*=>\s*", "cell: (row, idx) => ", new)
    new = re.sub(r"cell:\s*\(\{\s*row\s*,\s*getValue\s*\}\)\s*=>\s*", "cell: (row, idx) => ", new)
    new = re.sub(r"cell:\s*\(\{\s*getValue\s*\}\)\s*=>\s*", "cell: (row, idx) => ", new)
    new = re.sub(r"cell:\s*\(\{\s*row\s*\}\)\s*=>\s*", "cell: (row, idx) => ", new)
    new = re.sub(r"cell:\s*\(\)\s*=>\s*", "cell: (row, idx) => ", new)

    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(new)
    print(f"Updated {f}")
