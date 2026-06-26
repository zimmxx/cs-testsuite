# Changelog
# Version: v0.1.0

## Added

- Initial React/Vite application structure
- Dashboard-style wafer post-processing UI
- Sidebar navigation and tabbed analysis sections
- Upload support for text, CSV, and Excel files
- Shared normalization layer for different measurement sources
- Propagation loss calculation flow
- Insertion loss grouping flow
- Heater efficiency grouping flow
- Wafermap visualization panel
- Report preview panel
- CSV export for normalized rows
- GitHub Pages deployment workflow

## Changed

- Shifted the application direction away from a rigid MATLAB-only interface
- Moved deployment to a browser-accessible GitHub Pages site

## Infrastructure

- Added `pnpm`-based project setup
- Added GitHub Actions deployment workflow for Pages
- Configured production deployment through Vite build output

## Known Limitations

- Some dashboard areas are still preview-level rather than full production analytics tools
- Report output is not yet a final formatted engineering report
- Data persistence is not yet implemented
