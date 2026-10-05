import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
    SearchLg,
    Users01,
    CreditCard01,
    File06,
    Server01,
    LifeBuoy01,
    Building01,
    Package,
    Settings01,
    HomeLine,
    XClose,
} from '@untitledui/icons';
import { searchApi, type SearchResultItem } from '@/api/client';

interface CommandMenuProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CommandMenu({ isOpen, onClose }: CommandMenuProps) {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Global keyboard shortcut (Ctrl/Cmd + K & Escape)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Search query with debounce
    useEffect(() => {
        if (!query.trim() || query.trim().length < 2) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const timer = setTimeout(async () => {
            try {
                const res = await searchApi.global(query);
                setResults(res.results || []);
                setSelectedIndex(0);
            } catch (err) {
                console.error('Search error:', err);
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        }, 180);

        return () => clearTimeout(timer);
    }, [query]);

    // Quick navigation fallback suggestions when empty
    const quickLinks = [
        { title: 'Dashboard', subtitle: 'Overview & Analytics', url: '/', icon: HomeLine },
        { title: 'Customers', subtitle: 'Subscriber accounts & profiles', url: '/customers', icon: Users01 },
        { title: 'Billing & Invoices', subtitle: 'Recharges, collections & receipts', url: '/billing', icon: CreditCard01 },
        { title: 'Network Infrastructure', subtitle: 'Routers, MikroTik & OLT', url: '/network', icon: Server01 },
        { title: 'Support Tickets', subtitle: 'Customer inquiries & NOC tasks', url: '/tickets', icon: LifeBuoy01 },
        { title: 'System Settings', subtitle: 'Portal configuration & profile', url: '/settings', icon: Settings01 },
    ];

    const currentItems = query.trim().length >= 2 ? results : [];

    const handleSelect = (url: string) => {
        onClose();
        navigate(url);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const total = currentItems.length || quickLinks.length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % total);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + total) % total);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentItems.length > 0 && currentItems[selectedIndex]) {
                handleSelect(currentItems[selectedIndex].url);
            } else if (quickLinks[selectedIndex]) {
                handleSelect(quickLinks[selectedIndex].url);
            }
        }
    };

    const getItemIcon = (type: string) => {
        switch (type) {
            case 'customer': return Users01;
            case 'invoice': return CreditCard01;
            case 'ticket': return LifeBuoy01;
            case 'router': return Server01;
            case 'tenant': return Building01;
            case 'package': return Package;
            default: return File06;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150">
            <div
                className="relative w-full max-w-xl rounded-2xl border border-secondary bg-primary shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Search bar */}
                <div className="flex items-center gap-3 border-b border-secondary px-4 py-3.5 bg-secondary/30">
                    <SearchLg className="size-5 text-quaternary shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="flex-1 bg-transparent text-sm text-primary placeholder:text-quaternary focus:outline-none"
                        placeholder="Search customers, invoices, routers, tickets, or pages... (Esc to close)"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    {query && (
                        <button
                            type="button"
                            className="text-quaternary hover:text-primary"
                            onClick={() => setQuery('')}
                        >
                            <XClose className="size-4" />
                        </button>
                    )}
                    <kbd className="hidden sm:inline-block rounded border border-secondary px-1.5 py-0.5 text-[10px] font-semibold text-tertiary bg-secondary">
                        ESC
                    </kbd>
                </div>

                {/* Results List */}
                <div className="max-h-80 overflow-y-auto p-2">
                    {isLoading ? (
                        <div className="py-8 text-center text-xs text-tertiary">
                            Searching backend records...
                        </div>
                    ) : query.trim().length >= 2 ? (
                        results.length === 0 ? (
                            <div className="py-8 text-center text-sm text-tertiary">
                                No matching records found for &quot;{query}&quot;
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-quaternary">
                                    Search Results ({results.length})
                                </div>
                                {results.map((item, idx) => {
                                    const IconComponent = getItemIcon(item.type);
                                    return (
                                        <div
                                            key={item.id}
                                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                                                selectedIndex === idx
                                                    ? 'bg-brand-primary text-white'
                                                    : 'hover:bg-secondary/60 text-primary'
                                            }`}
                                            onClick={() => handleSelect(item.url)}
                                        >
                                            <IconComponent
                                                className={`size-4 shrink-0 ${
                                                    selectedIndex === idx ? 'text-white' : 'text-brand-primary'
                                                }`}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium truncate">{item.title}</p>
                                                <p
                                                    className={`text-[11px] truncate ${
                                                        selectedIndex === idx ? 'text-white/80' : 'text-tertiary'
                                                    }`}
                                                >
                                                    {item.subtitle}
                                                </p>
                                            </div>
                                            <span
                                                className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                                                    selectedIndex === idx
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-secondary text-quaternary'
                                                }`}
                                            >
                                                {item.type}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        <div className="space-y-1">
                            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-quaternary">
                                Quick Navigation
                            </div>
                            {quickLinks.map((item, idx) => {
                                const IconComponent = item.icon;
                                return (
                                    <div
                                        key={item.url}
                                        className={`flex items-center gap-3 rounded-xl px-3 py-2 cursor-pointer transition-colors ${
                                            selectedIndex === idx
                                                ? 'bg-brand-primary text-white'
                                                : 'hover:bg-secondary/60 text-primary'
                                        }`}
                                        onClick={() => handleSelect(item.url)}
                                    >
                                        <IconComponent
                                            className={`size-4 shrink-0 ${
                                                selectedIndex === idx ? 'text-white' : 'text-brand-primary'
                                            }`}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate">{item.title}</p>
                                            <p
                                                className={`text-[11px] truncate ${
                                                    selectedIndex === idx ? 'text-white/80' : 'text-tertiary'
                                                }`}
                                            >
                                                {item.subtitle}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hints */}
                <div className="flex items-center justify-between border-t border-secondary bg-secondary/30 px-4 py-2 text-[11px] text-quaternary">
                    <span>Navigation: ↑ ↓ to navigate</span>
                    <span>Enter to select · Esc to close</span>
                </div>
            </div>
        </div>
    );
}
