# Land Info Application Blueprint

## Overview
The "Land Info" application is a framework-less web tool designed for querying and visualizing land parcel information using the VWorld API (v2.0/3.0) and OpenLayers 3. It provides users with detailed cadastral data, environmental evaluations, and community features.

## Architectural State (as of March 5, 2026)

### Core Features
- **Cadastral Map Inquiry:** Users can click on the map to retrieve detailed land parcel info (PNU, address, land use, area, official land price, ownership, etc.).
- **Thematic Map Layers:**
  - Continuous Cadastral Map (`LP_PA_CBND_BUBUN`)
  - Land Use Zones (Urban, Rural, etc.)
  - ECVAM Environmental Grade (`nem_ecvam`)
  - Eco-Natural Map (`eco_2015_g` via WMS)
- **Unified Legend System:** 
  - All active thematic map legends (Eco-Natural Map, ECVAM) are consolidated into a single container at the **bottom-left** of the map.
  - Mobile UI transitions legends into a **compact, single-line horizontal row** at the bottom of the map area to avoid obstructing user interaction.
- **PWA Support:** Service worker (`sw.js`) and manifest (`manifest.json`) for offline capabilities and homescreen installation.
- **Community Module:** A basic community bulletin board for sharing land-related information.

### Tech Stack
- **Frontend:** Vanilla HTML, CSS (Modern Baseline), JavaScript (ES Modules).
- **Mapping:** OpenLayers 3, VWorld JS API v2.0 (2D) & v3.0 (3D).
- **Data APIs:** VWorld WFS/WMS, NED (National Enterprise Data) API.
- **Environment:** Firebase Studio (Code OSS based).

### Design & UX
- **Responsive Layout:** 
  - Desktop: Sidebar on the right for results and controls.
  - Mobile: Map fixed at top 55dvh, information panel as a bottom sheet (45dvh).
- **Aesthetics:** Clean layout with multi-layered drop shadows, readable typography, and interactive icons.

## Recent Changes (March 5, 2026)
- **Removal of Forest Age Map:** Eliminated all traces of the Forest Age Map (`LT_L_FRSTCL_AGE`) from UI, JS logic, and CSS.
- **Legend Consolidation:** Refactored the legend system to use a unified container (`.legend-container-bottom`) positioned at the bottom-left.
- **Mobile Optimization:** Implemented horizontal flex layout for legends on mobile to maximize map visibility during parcel inquiries.
- **Code Cleanup:** Removed unused functions like `toggleForestAgeDirect` and corrected escaped strings in `themeData`.

## Future Roadmap
- Implement advanced data visualization for land price trends.
- Enhance community features with image uploads and commenting.
- Integrate user-specific saved locations.
