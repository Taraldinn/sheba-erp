document.addEventListener('DOMContentLoaded', function () {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
    });

    const mapEl = document.getElementById('map') 
               || document.getElementById('clientMap') 
               || document.getElementById('liveClientMap');

    if (typeof L === 'undefined' || !mapEl) {
        return;
    }

    const mapId = mapEl.id;

    const map = L.map(mapId, {
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true
    }).setView([22.3569, 91.7832], 12);
    
    window.liveMap = map;

    // Google Maps base layers only
    const googleStreetLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0','mt1','mt2','mt3'],
        attribution: '&copy; Google Maps'
    }).addTo(map);

    const googleSatelliteLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0','mt1','mt2','mt3'],
        attribution: '&copy; Google Maps'
    });

    const greenIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    const redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    const blueIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    // Initialize markersLayer as a L.featureGroup (inherits from L.layerGroup and implements getBounds())
    var markersLayer = L.featureGroup().addTo(map);

    const markerMap = {};
    let currentStatusFilter = 'online';
    let allClientsData = [];
    let selectedUsername = null;

    function loadMapMarkers(onComplete) {
        const managerVal = document.querySelector('.manager-filter-select')?.value || '';
        const url = '?ajax_map_clients=1&f_manager=' + encodeURIComponent(managerVal);

        fetch(url, {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(res => res.json())
        .then(data => {
            console.log('MAP CLIENT DATA:', data);
            if (Array.isArray(data)) {
                allClientsData = data;
                plotClients(allClientsData, currentStatusFilter);
            }
            if (typeof onComplete === 'function') onComplete();
        })
        .catch(err => {
            console.error('MAP CLIENT LOAD ERROR:', err);
            if (typeof onComplete === 'function') onComplete();
        });
    }

    function plotClients(data, selectedStatus = 'online') {
        markersLayer.clearLayers();
        for (const key in markerMap) {
            delete markerMap[key];
        }

        const activeMarkersList = [];
        const validClients = [];

        data.forEach(client => {
            let lat = parseFloat(client.latitude || client.lat || client.gps_lat);
            let lng = parseFloat(client.longitude || client.lng || client.gps_lng);

            console.log(client.client_name, lat, lng, client.status);

            if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                validClients.push(client);

                const status = String(client.status || '').toLowerCase().trim();
                if (selectedStatus !== 'all' && status !== selectedStatus) {
                    return;
                }

                const isSelected = (client.client_id === selectedUsername || client.id === selectedUsername);
                let icon = isSelected ? blueIcon : (status === 'online' ? greenIcon : redIcon);

                const marker = L.marker([lat, lng], { icon: icon })
                    .bindPopup(
                        '<b>' + (client.client_name || client.name) + '</b><br>' +
                        'ID: ' + (client.client_id || client.id) + '<br>' +
                        'Status: ' + client.status + '<br>' +
                        'IP: ' + (client.ip_address || client.ip)
                    );

                marker.clientId = client.client_id || client.id;
                marker.clientStatus = status;

                marker.addTo(markersLayer);
                
                markerMap[marker.clientId] = marker;
                activeMarkersList.push(marker);
            }
        });

        console.log('Valid GPS clients:', validClients.length);
        console.log('TOTAL MARKERS:', markersLayer.getLayers().length);

        if (!map.hasLayer(markersLayer)) {
            markersLayer.addTo(map);
        }

        const alertBox = document.getElementById('noGpsAlert');
        if (activeMarkersList.length === 0) {
            if (alertBox) {
                alertBox.innerHTML = `<i class="fas fa-exclamation-triangle me-2"></i> No valid GPS location found for ${selectedStatus} clients.`;
                alertBox.classList.remove('d-none');
            }
        } else {
            if (alertBox) alertBox.classList.add('d-none');
            
            if (!selectedUsername) {
                fitAllMarkers();
            }
        }
    }

    function fitAllMarkers() {
        const layers = markersLayer.getLayers();
        if (layers.length > 0) {
            map.fitBounds(markersLayer.getBounds(), { padding: [30, 30] });
        }
    }

    function selectClientByUsername(username) {
        if (selectedUsername && markerMap[selectedUsername]) {
            const prevMarker = markerMap[selectedUsername];
            const defaultIcon = (prevMarker.clientStatus === 'online') ? greenIcon : redIcon;
            prevMarker.setIcon(defaultIcon);
        }

        selectedUsername = username;

        if (username && markerMap[username]) {
            const marker = markerMap[username];
            marker.setIcon(blueIcon);
            map.setView(marker.getLatLng(), 16);
            marker.openPopup();
        }
    }

    // Google style base maps switch control
    L.Control.MapSatelliteSwitch = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function (map) {
            var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.style.backgroundColor = 'white';
            container.style.cursor = 'pointer';
            container.style.padding = '6px 12px';
            container.style.fontWeight = 'bold';
            container.style.fontSize = '12px';
            container.style.color = '#333';
            container.style.boxShadow = '0 1px 5px rgba(0,0,0,0.3)';
            container.style.borderRadius = '4px';
            container.style.border = '1px solid #ccc';
            container.innerHTML = '<i class="fas fa-globe"></i> Satellite';
            
            var isSatellite = false;
            
            L.DomEvent.on(container, 'click', function (e) {
                L.DomEvent.stop(e);
                if (!isSatellite) {
                    map.removeLayer(googleStreetLayer);
                    map.addLayer(googleSatelliteLayer);
                    container.innerHTML = '<i class="fas fa-map"></i> Map';
                    isSatellite = true;
                } else {
                    map.removeLayer(googleSatelliteLayer);
                    map.addLayer(googleStreetLayer);
                    container.innerHTML = '<i class="fas fa-globe"></i> Satellite';
                    isSatellite = false;
                }
            });
            return container;
        }
    });

    L.Control.Fullscreen = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            var button = L.DomUtil.create('a', '', container);
            button.href = '#';
            button.title = 'Toggle Fullscreen';
            button.innerHTML = '<i class="fas fa-expand"></i>';
            button.style.width = '30px';
            button.style.height = '30px';
            button.style.lineHeight = '30px';
            button.style.textAlign = 'center';
            button.style.display = 'block';
            button.style.backgroundColor = 'white';
            
            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.stop(e);
                var mapContainer = map.getContainer();
                if (!document.fullscreenElement) {
                    if (mapContainer.requestFullscreen) {
                        mapContainer.requestFullscreen();
                    } else if (mapContainer.mozRequestFullScreen) {
                        mapContainer.mozRequestFullScreen();
                    } else if (mapContainer.webkitRequestFullscreen) {
                        mapContainer.webkitRequestFullscreen();
                    } else if (mapContainer.msRequestFullscreen) {
                        mapContainer.msRequestFullscreen();
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    }
                }
            });
            
            document.addEventListener('fullscreenchange', function() {
                if (!document.fullscreenElement) {
                    button.innerHTML = '<i class="fas fa-expand"></i>';
                } else {
                    button.innerHTML = '<i class="fas fa-compress"></i>';
                }
            });
            
            return container;
        }
    });

    L.Control.CurrentLocation = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            var button = L.DomUtil.create('a', '', container);
            button.href = '#';
            button.title = 'Show My Location';
            button.innerHTML = '<i class="fas fa-crosshairs"></i>';
            button.style.width = '30px';
            button.style.height = '30px';
            button.style.lineHeight = '30px';
            button.style.textAlign = 'center';
            button.style.display = 'block';
            button.style.backgroundColor = 'white';
            
            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.stop(e);
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(function (position) {
                        var lat = position.coords.latitude;
                        var lng = position.coords.longitude;
                        map.setView([lat, lng], 16);
                        L.circle([lat, lng], { radius: position.coords.accuracy }).addTo(map)
                            .bindPopup("You are here").openPopup();
                    });
                }
            });
            return container;
        }
    });

    L.Control.AutoFit = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            var button = L.DomUtil.create('a', '', container);
            button.href = '#';
            button.title = 'Fit All Markers';
            button.innerHTML = '<i class="fas fa-arrows-alt"></i>';
            button.style.width = '30px';
            button.style.height = '30px';
            button.style.lineHeight = '30px';
            button.style.textAlign = 'center';
            button.style.display = 'block';
            button.style.backgroundColor = 'white';
            
            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.stop(e);
                fitAllMarkers();
            });
            return container;
        }
    });

    L.Control.Refresh = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            var container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            var button = L.DomUtil.create('a', '', container);
            button.href = '#';
            button.title = 'Refresh Map Data';
            button.innerHTML = '<i class="fas fa-sync-alt"></i>';
            button.style.width = '30px';
            button.style.height = '30px';
            button.style.lineHeight = '30px';
            button.style.textAlign = 'center';
            button.style.display = 'block';
            button.style.backgroundColor = 'white';
            
            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.stop(e);
                var icon = button.querySelector('i');
                icon.classList.add('fa-spin');
                loadMapMarkers(function() {
                    icon.classList.remove('fa-spin');
                });
            });
            return container;
        }
    });

    map.addControl(new L.Control.MapSatelliteSwitch());
    map.addControl(new L.Control.Fullscreen());
    map.addControl(new L.Control.CurrentLocation());
    map.addControl(new L.Control.AutoFit());
    map.addControl(new L.Control.Refresh());

    loadMapMarkers();

    setInterval(loadMapMarkers, 30000);

    const onlineTab = document.getElementById('online-tab');
    const offlineTab = document.getElementById('offline-tab');
    if (onlineTab) {
        onlineTab.addEventListener('shown.bs.tab', function () {
            currentStatusFilter = 'online';
            plotClients(allClientsData, currentStatusFilter);
        });
    }
    if (offlineTab) {
        offlineTab.addEventListener('shown.bs.tab', function () {
            currentStatusFilter = 'offline';
            plotClients(allClientsData, currentStatusFilter);
        });
    }

    document.addEventListener('click', function(e) {
        const row = e.target.closest('tr[data-username]');
        if (row) {
            const username = row.getAttribute('data-username');
            selectClientByUsername(username);
        }
    });

    const fManager = document.querySelector('.manager-filter-select');
    if (fManager) {
        fManager.addEventListener('change', function() {
            this.form.submit();
        });
    }
});
