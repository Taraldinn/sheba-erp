'use client';

import { useEffect, useRef, useState } from 'react';
import type { Olt } from '@/lib/api';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Network, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface NetworkMapProps {
    olts: Olt[];
}

interface MapNode {
    id: string;
    name: string;
    type: 'olt_primary' | 'olt_secondary' | 'tj_box' | 'onu';
    lat: number;
    lng: number;
    details: {
        ip?: string;
        brand?: string;
        status?: string;
        ports?: string | number;
        rx_power?: string;
        customer?: string;
    };
}

export function NetworkMap({ olts }: NetworkMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersLayerRef = useRef<any>(null);
    const polylinesLayerRef = useRef<any>(null);

    const [selectedOlt, setSelectedOlt] = useState<string>('all');
    const [isMapLoaded, setIsMapLoaded] = useState(false);

    // Build map nodes from actual OLTs and realistic network points in Dhaka
    const defaultNodes: MapNode[] = [
        {
            id: 'olt-1',
            name: olts[0]?.name || 'Core OLT 1 (Kurmitola)',
            type: 'olt_primary',
            lat: olts[0]?.latitude ? Number(olts[0].latitude) : 23.8103,
            lng: olts[0]?.longitude ? Number(olts[0].longitude) : 90.4125,
            details: {
                ip: olts[0]?.ip_address || '192.168.1.100',
                brand: olts[0]?.brand || 'BDCOM EPON',
                status: olts[0]?.status || 'Online',
                ports: olts[0]?.pon_ports_count || 8,
            },
        },
        {
            id: 'olt-2',
            name: olts[1]?.name || 'Backup OLT 2 (Banani POP)',
            type: 'olt_secondary',
            lat: olts[1]?.latitude ? Number(olts[1].latitude) : 23.7937,
            lng: olts[1]?.longitude ? Number(olts[1].longitude) : 90.4066,
            details: {
                ip: olts[1]?.ip_address || '192.168.1.101',
                brand: olts[1]?.brand || 'VSOL GPON',
                status: 'Online',
                ports: 16,
            },
        },
        // Zone TJ Boxes
        {
            id: 'tj-1',
            name: 'Kurmitola Multicare Specialized Hospital TJ-01',
            type: 'tj_box',
            lat: 23.8223,
            lng: 90.4219,
            details: {
                status: 'Active',
                ports: '1:8 Splitter',
            },
        },
        {
            id: 'tj-2',
            name: 'Yum Cha District Banani TJ-02',
            type: 'tj_box',
            lat: 23.7925,
            lng: 90.4078,
            details: {
                status: 'Active',
                ports: '1:16 Splitter',
            },
        },
        {
            id: 'tj-3',
            name: 'Mirpur 10 Bus Stand TJ-03',
            type: 'tj_box',
            lat: 23.8071,
            lng: 90.3687,
            details: {
                status: 'Active',
                ports: '1:8 Splitter',
            },
        },
        {
            id: 'tj-4',
            name: 'Jolshiri Central Park TJ-04',
            type: 'tj_box',
            lat: 23.8180,
            lng: 90.4780,
            details: {
                status: 'Active',
                ports: '1:8 Splitter',
            },
        },
        // Clients / ONUs
        {
            id: 'onu-1',
            name: 'ABG Sports City ONU',
            type: 'onu',
            lat: 23.8151,
            lng: 90.4320,
            details: {
                customer: 'Bashundhara Sports Complex',
                status: 'Online',
                rx_power: '-19.45 dBm',
            },
        },
        {
            id: 'onu-2',
            name: 'Mirpur Cantonment Public ONU',
            type: 'onu',
            lat: 23.8285,
            lng: 90.3750,
            details: {
                customer: 'College Campus Admin',
                status: 'Online',
                rx_power: '-21.10 dBm',
            },
        },
        {
            id: 'onu-3',
            name: 'United International University ONU',
            type: 'onu',
            lat: 23.7979,
            lng: 90.4497,
            details: {
                customer: 'UIU Campus Lab',
                status: 'Online',
                rx_power: '-18.80 dBm',
            },
        },
        {
            id: 'onu-4',
            name: 'Aminbazar Distribution Point',
            type: 'onu',
            lat: 23.7845,
            lng: 90.3340,
            details: {
                customer: 'West Zone Sub-station',
                status: 'Online',
                rx_power: '-20.30 dBm',
            },
        },
    ];

    // Initialize Leaflet Map
    useEffect(() => {
        let isMounted = true;

        const loadLeaflet = async () => {
            // 1. Add CSS
            if (!document.getElementById('leaflet-css')) {
                const link = document.createElement('link');
                link.id = 'leaflet-css';
                link.rel = 'stylesheet';
                link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(link);
            }

            // 2. Wait for L to be available
            const ensureLeafletScript = (): Promise<any> => {
                return new Promise((resolve) => {
                    if ((window as any).L) {
                        resolve((window as any).L);
                        return;
                    }
                    let script = document.getElementById('leaflet-script') as HTMLScriptElement;
                    if (!script) {
                        script = document.createElement('script');
                        script.id = 'leaflet-script';
                        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                        document.body.appendChild(script);
                    }
                    script.onload = () => resolve((window as any).L);
                });
            };

            const L = await ensureLeafletScript();
            if (!isMounted || !mapContainerRef.current) return;

            // Destroy previous map if any
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }

            // Default center: Dhaka
            const map = L.map(mapContainerRef.current, {
                center: [23.8103, 90.4125],
                zoom: 12,
                zoomControl: true,
            });
            mapInstanceRef.current = map;

            // Add OpenStreetMap Tile Layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© Leaflet | © OpenStreetMap contributors',
            }).addTo(map);

            const markersGroup = L.layerGroup().addTo(map);
            const polylinesGroup = L.layerGroup().addTo(map);
            markersLayerRef.current = markersGroup;
            polylinesLayerRef.current = polylinesGroup;

            renderLayers(L, map, markersGroup, polylinesGroup, defaultNodes);
            setIsMapLoaded(true);
        };

        loadLeaflet();

        return () => {
            isMounted = false;
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    const renderLayers = (L: any, map: any, markersGroup: any, polylinesGroup: any, nodes: MapNode[]) => {
        markersGroup.clearLayers();
        polylinesGroup.clearLayers();

        // Helper to generate marker icon
        const createColorIcon = (color: string, ringColor: string, size: number) => {
            return L.divIcon({
                className: 'custom-map-pin',
                html: `
                    <div style="
                        width: ${size}px;
                        height: ${size}px;
                        background-color: ${color};
                        border: 2px solid #ffffff;
                        box-shadow: 0 0 10px ${ringColor}, 0 2px 4px rgba(0,0,0,0.3);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: transform 0.2s;
                    ">
                        <div style="width: 4px; height: 4px; background: white; border-radius: 50%;"></div>
                    </div>
                `,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
            });
        };

        const primaryOlt = nodes.find(n => n.type === 'olt_primary');
        const secondaryOlt = nodes.find(n => n.type === 'olt_secondary');

        // Draw Nodes
        nodes.forEach((node) => {
            let icon;
            if (node.type === 'olt_primary') {
                icon = createColorIcon('#2563eb', 'rgba(37, 99, 235, 0.5)', 18); // Blue
            } else if (node.type === 'olt_secondary') {
                icon = createColorIcon('#8b5cf6', 'rgba(139, 92, 246, 0.5)', 16); // Purple
            } else if (node.type === 'tj_box') {
                icon = createColorIcon('#f97316', 'rgba(249, 115, 22, 0.5)', 13); // Orange
            } else {
                icon = createColorIcon('#10b981', 'rgba(16, 185, 129, 0.5)', 11); // Green
            }

            const marker = L.marker([node.lat, node.lng], { icon });

            const popupContent = `
                <div style="font-family: sans-serif; min-width: 170px; padding: 2px;">
                    <div style="font-weight: 700; font-size: 13px; color: #1e293b; margin-bottom: 4px;">
                        ${node.name}
                    </div>
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
                        LatLong: ${node.lat.toFixed(4)}, ${node.lng.toFixed(4)}
                    </div>
                    ${node.details.ip ? `<div style="font-size: 11px; color: #334155;"><strong>IP:</strong> ${node.details.ip}</div>` : ''}
                    ${node.details.brand ? `<div style="font-size: 11px; color: #334155;"><strong>Brand:</strong> ${node.details.brand}</div>` : ''}
                    ${node.details.ports ? `<div style="font-size: 11px; color: #334155;"><strong>Ports/Splitter:</strong> ${node.details.ports}</div>` : ''}
                    ${node.details.customer ? `<div style="font-size: 11px; color: #334155;"><strong>Client:</strong> ${node.details.customer}</div>` : ''}
                    ${node.details.rx_power ? `<div style="font-size: 11px; color: #10b981;"><strong>RX Power:</strong> ${node.details.rx_power}</div>` : ''}
                    <div style="margin-top: 6px; display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: ${node.details.status === 'Online' || node.details.status === 'Active' ? '#dcfce7' : '#fee2e2'}; color: ${node.details.status === 'Online' || node.details.status === 'Active' ? '#15803d' : '#b91c1c'};">
                        ● ${node.details.status || 'Active'}
                    </div>
                </div>
            `;

            marker.bindPopup(popupContent);
            markersGroup.addLayer(marker);
        });

        // Draw Fiber lines (polylines) connecting nodes
        if (primaryOlt) {
            // Connect primary OLT to TJ-1 and TJ-3
            const tj1 = nodes.find(n => n.id === 'tj-1');
            const tj3 = nodes.find(n => n.id === 'tj-3');
            if (tj1) {
                L.polyline([[primaryOlt.lat, primaryOlt.lng], [tj1.lat, tj1.lng]], {
                    color: '#2563eb',
                    weight: 2.5,
                    opacity: 0.75,
                    dashArray: '4, 4',
                }).addTo(polylinesGroup);
            }
            if (tj3) {
                L.polyline([[primaryOlt.lat, primaryOlt.lng], [tj3.lat, tj3.lng]], {
                    color: '#2563eb',
                    weight: 2.5,
                    opacity: 0.75,
                    dashArray: '4, 4',
                }).addTo(polylinesGroup);
            }
        }

        if (secondaryOlt) {
            // Connect secondary OLT to TJ-2 and TJ-4
            const tj2 = nodes.find(n => n.id === 'tj-2');
            const tj4 = nodes.find(n => n.id === 'tj-4');
            if (tj2) {
                L.polyline([[secondaryOlt.lat, secondaryOlt.lng], [tj2.lat, tj2.lng]], {
                    color: '#8b5cf6',
                    weight: 2.5,
                    opacity: 0.75,
                    dashArray: '4, 4',
                }).addTo(polylinesGroup);
            }
            if (tj4) {
                L.polyline([[secondaryOlt.lat, secondaryOlt.lng], [tj4.lat, tj4.lng]], {
                    color: '#8b5cf6',
                    weight: 2.5,
                    opacity: 0.75,
                    dashArray: '4, 4',
                }).addTo(polylinesGroup);
            }
        }

        // Connect TJ boxes to ONUs
        const tj1 = nodes.find(n => n.id === 'tj-1');
        const onu1 = nodes.find(n => n.id === 'onu-1');
        if (tj1 && onu1) {
            L.polyline([[tj1.lat, tj1.lng], [onu1.lat, onu1.lng]], {
                color: '#f97316',
                weight: 1.8,
                opacity: 0.8,
            }).addTo(polylinesGroup);
        }

        const tj3 = nodes.find(n => n.id === 'tj-3');
        const onu2 = nodes.find(n => n.id === 'onu-2');
        if (tj3 && onu2) {
            L.polyline([[tj3.lat, tj3.lng], [onu2.lat, onu2.lng]], {
                color: '#f97316',
                weight: 1.8,
                opacity: 0.8,
            }).addTo(polylinesGroup);
        }
    };

    const handleSelectOltChange = (value: string) => {
        setSelectedOlt(value);
        if (!mapInstanceRef.current) return;

        if (value === 'all') {
            mapInstanceRef.current.flyTo([23.8103, 90.4125], 12);
        } else {
            const found = olts.find(o => o.id === value);
            if (found && found.latitude && found.longitude) {
                mapInstanceRef.current.flyTo([Number(found.latitude), Number(found.longitude)], 14);
            } else {
                mapInstanceRef.current.flyTo([23.8103, 90.4125], 14);
            }
        }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {/* Top Toolbar matching Screenshot 4 */}
            <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 gap-3">
                {/* Left: Select OLT */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Network className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Select OLT:</span>
                    <Select value={selectedOlt} onValueChange={handleSelectOltChange}>
                        <SelectTrigger className="h-8.5 bg-white border-slate-200 text-xs min-w-[200px]">
                            <SelectValue placeholder="-- All OLTs --" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-xs">
                            <SelectItem value="all">-- All OLTs --</SelectItem>
                            {olts.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                    {o.name} ({o.ip_address || 'No IP'})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Right: Legend matching Screenshot 4 */}
                <div className="flex items-center gap-4 text-xs font-medium text-slate-600 flex-wrap justify-end">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb] inline-block shadow-xs"></span>
                        <span>OLT Node</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] inline-block shadow-xs"></span>
                        <span>OLT Node</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#f97316] inline-block shadow-xs"></span>
                        <span>Zone TJ Box</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] inline-block shadow-xs"></span>
                        <span>Client / ONU</span>
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div className="relative w-full h-[640px] bg-slate-100">
                <div ref={mapContainerRef} className="w-full h-full z-0" />
                {!isMapLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 z-10 text-xs text-slate-500 font-medium gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                        Loading GIS Network Map...
                    </div>
                )}
            </div>
        </div>
    );
}
