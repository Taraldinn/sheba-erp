#!/usr/bin/env python3
"""
Transforms usages of @tanstack/react-table to the local DataTable API.
"""
import os, re, sys

files = sys.argv[1:]
for f in files:
    with open(f, 'r', encoding='utf-8') as fh:
        src = fh.read()
    new = src

    # Replace import
    new = re.sub(
        r"import\s+type\s*\{\s*ColumnDef[^}]*\}\s*from\s*['\"]@tanstack/react-table['\"];?",
        "import type { DataTableColumn } from '@/components/data-table/data-table';",
        new,
    )
    new = re.sub(
        r"import\s*\{\s*ColumnDef[^}]*\}\s*from\s*['\"]@tanstack/react-table['\"];?",
        "import type { DataTableColumn } from '@/components/data-table/data-table';",
        new,
    )

    new = re.sub(r"ColumnDef<([A-Za-z0-9_]+)\s*,\s*unknown>", r"DataTableColumn<\1>", new)
    new = re.sub(r"ColumnDef<([A-Za-z0-9_]+)>", r"DataTableColumn<\1>", new)

    def transform_column_array(text):
        out = []
        i = 0
        while i < len(text):
            m = re.search(r"=\s*\[", text[i:])
            if not m:
                out.append(text[i:])
                break
            start = i + m.start()
            depth = 0
            j = start + 1
            while j < len(text):
                ch = text[j]
                if ch == '[':
                    depth += 1
                elif ch == ']':
                    if depth == 0:
                        break
                    depth -= 1
                j += 1
            end = j
            arr_text = text[start:end + 1]
            transformed = transform_columns_inside(arr_text)
            out.append(text[i:start])
            out.append(transformed)
            i = end + 1
        return ''.join(out)

    def transform_columns_inside(arr_text):
        out = []
        i = 0
        n = len(arr_text)
        while i < n:
            k = arr_text.find('{', i)
            if k < 0:
                out.append(arr_text[i:])
                break
            depth = 0
            j = k
            while j < n:
                ch = arr_text[j]
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            obj_text = arr_text[k:j + 1]
            out.append(arr_text[i:k])
            out.append(transform_column_object(obj_text))
            i = j + 1
        return ''.join(out)

    def transform_column_object(obj_text):
        m = re.search(r"accessorKey:\s*'([^']+)'", obj_text)
        id_name = m.group(1) if m else None
        obj_text = re.sub(r"accessorKey:\s*'([^']+)'", r"id: '\1'", obj_text)
        if id_name is not None:
            obj_text = re.sub(r"getValue\(\)", f"(row as any).{id_name}", obj_text)
        return obj_text

    new = transform_column_array(new)
    new = re.sub(r"row\.original\.", "row.", new)

    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(new)
    print(f"Updated {f}")
