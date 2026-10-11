import os
import re

source_dir = 'src/routes/isp'
dest_dir = 'src/app/isp/(dashboard)'

files = [f for f in os.listdir(source_dir) if f.endswith('.tsx') and f not in ['route.tsx', 'login.tsx']]

for file in files:
    with open(os.path.join(source_dir, file), 'r') as f:
        content = f.read()

    # Remove createFileRoute
    content = re.sub(r"import \{.*?createFileRoute.*?\} from '@tanstack/react-router';\n?", "", content)
    content = re.sub(r"export const Route = createFileRoute.*?\n", "", content)
    
    # Replace imports
    imports = []
    if 'useNavigate' in content or 'useSearch' in content or 'useParams' in content:
        imports.append("import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';")
    if '<Link' in content:
        imports.append("import Link from 'next/link';")
    
    if imports:
        content = "\n".join(imports) + "\n" + content

    content = "'use client';\n\n" + content

    # Use useParams
    content = re.sub(r"const \{ (.*?) \} = useParams\(\{.*?\}\);", r"const { \1 } = useParams() as { \1: string };", content)

    # Replace useSearch and updateSearch
    if 'useSearch' in content:
        searchBlock = """const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const search: any = Object.fromEntries(searchParams.entries());
    if (search.page) search.page = parseInt(search.page, 10);
    if (search.page_size) search.page_size = parseInt(search.page_size, 10);
    if (search.customer) search.customer = parseInt(search.customer, 10);
"""
        content = re.sub(r"const search = useSearch\(\{.*?\}\);", searchBlock, content)
        
        # Remove useNavigate since we defined router
        content = re.sub(r"const navigate = useNavigate\(\);\n?", "", content)

        updateSearchBlock = """const updateSearch = (patch: Partial<typeof search>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(patch).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') params.delete(k);
            else params.set(k, String(v));
        });
        if (patch.page === undefined) params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };"""
        
        content = re.sub(r"const updateSearch = .*?;\n    \};\n", updateSearchBlock + '\n', content, flags=re.DOTALL)

    # Replace navigate(...) -> router.push(...)
    if "navigate({" in content:
        content = re.sub(r"navigate\(\{\s*to:\s*'([^']+)',\s*params:\s*\{\s*id:\s*([^}]+)\s*\}\s*\}\)", r"router.push(`\1`.replace('$id', \2))", content)

    # Replace function name with export default
    func_match = re.search(r"function ([A-Za-z0-9_]+)\(", content)
    if func_match:
        func_name = func_match.group(1)
        content = content.replace(f"function {func_name}(", f"export default function {func_name}(")

    # Link component fix for dynamic routes
    content = re.sub(r"to=\{\`\/(.*?)/\$\{(.*?)\}\`\}", r"href={`/\1/${\2}`}", content)
    content = re.sub(r'to="\/([^"]+)"', r'href="/\1"', content)
    content = re.sub(r"to=\{([^}]+)\}", r"href={\1}", content)

    # Compute route path
    folder_name = file.replace('.tsx', '')
    if '.$' in folder_name:
        parts = folder_name.split('.$')
        folder_name = f"{parts[0]}/[{parts[1]}]"
    elif folder_name == 'index':
        folder_name = ''
        
    out_folder = os.path.join(dest_dir, folder_name)
    os.makedirs(out_folder, exist_ok=True)
    
    with open(os.path.join(out_folder, 'page.tsx'), 'w') as f:
        f.write(content)
        
    print(f"Migrated {file} to {folder_name}/page.tsx")
