'use client';

import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <Input {...props} type={visible ? 'text' : 'password'} className={`pr-10 ${props.className ?? ''}`} />
            <button
                type="button"
                onClick={() => setVisible(v => !v)}
                aria-pressed={visible}
                title={visible ? 'Hide characters' : 'Show characters'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            >
                {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                <span className="sr-only">{visible ? 'Hide characters' : 'Reveal characters'}</span>
            </button>
        </div>
    );
}
