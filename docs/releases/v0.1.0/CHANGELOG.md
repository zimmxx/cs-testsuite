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
- Manual measurement conversion workspace for `WG*.xlsx` propagation traces
- GitHub-backed measurement dataset library workflow
- Comparison library for multi-dataset wafer review
- Filename conversion workspace for standardized dataset naming
- Dataset and filename standard documentation

## Changed

- Shifted the application direction away from a rigid MATLAB-only interface
- Moved deployment to a browser-accessible GitHub Pages site
- Standardized converted archive naming for manual measurement exports
- Expanded the library section to support dataset comparison and naming preparation for GitHub storage

## Infrastructure

- Added `pnpm`-based project setup
- Added GitHub Actions deployment workflow for Pages
- Configured production deployment through Vite build output
- Added shared filename-standardization helpers for conversion and dataset workflows

## Known Limitations

- Some dashboard areas are still preview-level rather than full production analytics tools
- Report output is not yet a final formatted engineering report
- GitHub dataset publishing still depends on the correct fine-grained PAT permissions
- Filename conversion still needs user review when source folders do not expose enough metadata
