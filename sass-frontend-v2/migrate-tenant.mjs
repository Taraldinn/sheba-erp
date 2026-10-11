import fs from 'fs';
import path from 'path';

const sourceDir = 'src/routes/tenant';
const destDir = 'src/app/tenant/(dashboard)';

const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.tsx') && !['route.tsx', 'login.tsx'].includes(f));

for (const file of files) {
    let content = fs.readFileSync(path.join(sourceDir, file), 'utf-8');

    // Remove createFileRoute
    content = content.replace(/import \{.*?createFileRoute.*?\} from '@tanstack\/react-router';\n?/g, "");
    content = content.replace(/export const Route = createFileRoute.*?\n/g, "");
    
    // Replace imports
    let imports = [];
    if ('useNavigate' in content || 'useSearch' in content || 'useParams' in content) {
        imports.push("import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';");
    }
    if ('<Link' in content) {
        imports.push("import Link from 'next/link';");
    }
    
    if (imports.length > 0) {
        content = imports.join('\n') + '\n' + content;
    }

    content = "'use client';\n\n" + content;

    // Use useParams
    content = content.replace(/const \{ (.*?) \} = useParams\(\{.*?\}\);/g, "const { $1 } = useParams() as { $1: string };");

    // Replace useSearch and updateSearch
    if ('useSearch' in content) {
        const searchBlock = `const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const search = Object.fromEntries(searchParams.entries()) as any;
    if (search.page) search.page = parseInt(search.page, 10);
    if (search.page_size) search.page_size = parseInt(search.page_size, 10);
    if (search.customer) search.customer = parseInt(search.customer, 10);
`;
        content = content.replace(/const search = useSearch\(\{.*?\}\);/, searchBlock);
        
        // Remove useNavigate since we defined router
        content = content.replace(/const navigate = useNavigate\(\);\n?/g, "");

        const updateSearchBlock = `const updateSearch = (patch: Partial<typeof search>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(patch).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') params.delete(k);
            else params.set(k, String(v));
        });
        if (patch.page === undefined) params.set('page', '1');
        router.push(\`\${pathname}?\${params.toString()}\`);
    };`;
        
        content = content.replace(/const updateSearch = .*?;\n    \};\n/s, updateSearchBlock + '\n');
    }

    // Replace function name with export default
    const funcMatch = content.match(/function ([A-Za-z0-9_]+)\(/);
    if (funcMatch) {
        const funcName = funcMatch[1];
        content = content.replace(`function ${funcName}(`, `export default function ${funcName}(`);
    }

    // Link component fix for dynamic routes
    content = content.replace(/to=\{\`\/(.*?)\/\$\{(.*?)\}\`\}/g, "href={`/$1/${$2}`}");
    content = content.replace(/to="\/([^"]+)"/g, "href=\"/$1\"");
    content = content.replace(/to=\{([^}]+)\}/g, "href={$1}");

    // Compute route path
    let folder_name = file.replace('.tsx', '');
    if (folder_name.includes('.$')) {
        const parts = folder_name.split('.$');
        folder_name = `${parts[0]}/[${parts[1]}]`;
    } else if (folder_name === 'index') {
        folder_name = '';
    }
        
    const out_folder = path.join(destDir, folder_name);
    fs.mkdirSync(out_folder, { recursive: true });
    
    fs.writeFileSync(path.join(out_folder, 'page.tsx'), content);
        
    console.log(`Migrated ${file} to ${folder_name}/page.tsx`);
}
