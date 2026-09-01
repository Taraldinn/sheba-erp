# Live Fiber Topology Fix — 24 AUG 2026

## Fixed
- Topology Save Mapping now includes the required CSRF token, so OLT/Master/Splitter parent changes persist.
- Removed Reseller/POP/Branch from the topology hierarchy.
- New hierarchy: MikroTik → OLT → Master Box → Splitter Box → User.
- Added Splitter Box as an available TJ Box category. Existing Zone/point Box records are treated as Splitter Box in topology for backward compatibility.
- Users attach automatically to their selected TJ/Splitter Box by `users.tj_box_name`.
- Mapping is tenant-local in `network_topology_links`.

## Mapping workflow
1. Configuration: create Master Box and Splitter Box records.
2. Client profile: choose the user's Splitter/TJ Box.
3. Live Topology → Edit Topology.
4. Choose OLT under MikroTik.
5. Choose Master Box under OLT.
6. Choose Splitter Box under Master Box.
7. Save Mapping.
