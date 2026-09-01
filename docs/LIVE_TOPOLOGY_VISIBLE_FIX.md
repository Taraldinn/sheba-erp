Sheba-Fi Live Topology Visibility Fix
24 AUG 2026

Visible access points:
1. Main sidebar: Live Topology (below OLT)
2. Routers page: Live Network Topology button
3. OLT page: Live Network Topology button
4. Direct route: ?tab=network_topology

Required files:
- index.php
- views/layout/header.php
- views/networking/network_topology.php
- views/networking/routers.php
- views/networking/olt.php

Important:
Uploading only network_topology.php is not enough. index.php and header.php must also be updated.
If a later patch replaced index.php/header.php, the menu/route can disappear.
