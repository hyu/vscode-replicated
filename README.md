# Replicated VSCode Extension

The Replicated VSCode extension provides comprehensive tooling for developing and testing Replicated applications directly within VSCode. It includes intelligent manifest management, automatic linting, and cluster resource visualization.

## Features

### Sidebar Panel

The extension adds a dedicated Replicated panel to the Activity Bar (left sidebar) with three main views:

#### 1. Manifests View

Intelligent manifest file management organized by installation method:

- **Smart categorization** of manifests:
  - **Shared Install Config** - Files used across all install methods (Helm, KOTS, Embedded Cluster)
  - **Helm Install** - Files specific to native Helm installations
  - **KOTS Install** - Files specific to KOTS and Embedded Cluster installations
  - Alphabetical sorting within each category
  
- **Visual indicators**:
  - 🔴 Red error icon for files with errors
  - 🟡 Yellow warning icon for files with warnings  
  - 🔵 Blue info icon for files with information messages
  - ✅ Green check for files with no issues
  - Git status indicators (M, A, D, U) integrated seamlessly

- **Detailed tooltips** on hover showing:
  - Installation method context (Shared, Helm, KOTS)
  - Resource kind and description
  - API version
  - File path
  - Last linted timestamp

- **Hover actions** (inline buttons appear on hover):
  - **Info Button** (ℹ️) - Opens documentation when available
  - **Lint Button** ($(pass)) - Runs linting on the file

- **Quick actions**:
  - **Lint All** button (▶️) to manually lint all manifests
  - **Refresh** button (🔄) to update the view
  - Click any file to open it in the editor

#### 2. Actions View

Development workflow tools for testing and deployment:

- **Auto-lint on save** toggle for automatic linting
- **Test in Environment** dropdown to deploy to Development, Staging, or Production
  - Shows loading spinner during provisioning
  - Button displays "Provisioning..." state
- **CLI Status** showing installed Replicated CLI version with quick refresh
  - Visual indicators (● installed, ⚠ update available)
  - Quick install/upgrade button
  - Copy command button
- **Cluster Resources** - After deployment, view a compact list of Kubernetes resources:
  - Deployments, Pods, Services, ConfigMaps, and Secrets
  - One-line display with status indicators (● healthy, ⚠ warnings)
  - Quick access to detailed Dashboard view

#### 3. Cluster Dashboard View

Access via the **"📊 Dashboard"** button in the Actions panel or command palette:

- **Cluster information** with health status
- **Summary statistics** for all resource types
- **Detailed resource cards** showing:
  - Deployments with replica counts and images
  - Pods with status, node placement, and restart counts
  - Services with type and endpoint information
  - ConfigMaps and Secrets with data key counts
- **Beautiful, responsive UI** that adapts to VS Code themes
- **Hover effects** and visual status indicators
- **GPU-accelerated animations** for smooth 60fps performance

#### Supported Manifest Types

The extension recognizes and categorizes these manifest types by installation method:

**Shared Install Config** (used across multiple install methods):
- Config (kots.io/v1beta1) - Customer configuration screen
- Application (kots.io/v1beta1) - Replicated Application custom resource
- Application (app.k8s.io/v1beta1) - Kubernetes SIG Application
- SupportBundle (troubleshoot.sh/v1beta2) - Troubleshooting data collection
- Preflight (troubleshoot.sh/v1beta2) - Pre-installation checks
- Analyzer (troubleshoot.sh/v1beta2) - Analysis rules

**Helm Install:**
- Chart - HelmChart specification for native Helm deployments
- Helm Chart Archives (.tgz) - Packaged Helm charts ready for distribution
  - Created with `helm package` command
  - Uploaded with `replicated release create --chart`

**KOTS Install** (Embedded Cluster & existing cluster):
- HelmChart (kots.io/v1beta1) - HelmChart custom resource telling KOTS how to deploy
- Config (embedded-cluster.io) - Embedded Cluster configuration
- Standard Kubernetes resources (Deployments, Services, ConfigMaps, Secrets, etc.)

### Automatic Linting

The extension provides automatic linting capabilities:

1. **Enable**: Use the command `Replicated Lint Enable`
2. **Automatic**: On each save, manifests are sent to the Replicated Lint server
3. **Results**: Diagnostics appear in the Problems view
4. **Disable**: Use the command `Replicated Lint Disable`

![Example](./img/example.png)

Manifests are expected to be located under the `manifests` folder (default), which can be changed in the extension settings.

## Extension Settings

This extension contributes the following settings:

* `config.manifestsFolder`: Location for the Replicated yaml manifests (default: manifests)

## Architecture

The extension is built with clean architecture principles:

### Code Organization

- **`src/models/`** - Data models and TypeScript interfaces
  - `manifestItem.ts` - Manifest file tree items
  - `clusterResourceItem.ts` - Cluster resource tree items
  - `types.ts` - Shared type definitions

- **`src/views/`** - VS Code view providers
  - `manifestsView.ts` - Manifests tree view with categorization
  - `devActionsView.ts` - Actions panel webview
  - `clusterResourcesView.ts` - Cluster resources tree view
  - `clusterDashboardView.ts` - Cluster dashboard webview

- **`src/services/`** - Business logic services
  - `lintService.ts` - Manifest linting service
  - `cliService.ts` - Replicated CLI integration

- **`src/utils/`** - Reusable utilities
  - `manifestUtils.ts` - Manifest categorization and identification
  - `diagnosticUtils.ts` - VS Code diagnostic creation
  - `webviewUtils.ts` - Shared webview HTML/CSS utilities
  - `commandUtils.ts` - Command registration helpers
  - `colorConstants.ts` - Color scheme definitions

### Key Features

- **DRY Principle**: Shared utilities eliminate code duplication
- **Separation of Concerns**: Clear boundaries between views, services, and utilities
- **Type Safety**: Comprehensive TypeScript interfaces throughout
- **Performance**: DOM caching, GPU-accelerated animations
- **CSP Compliance**: No inline scripts or styles in webviews
- **VS Code Integration**: Uses theme variables and follows design guidelines

## Development

### Building

```bash
npm install
npm run compile
```

### Testing

Press `F5` in VS Code to open an Extension Development Host window.

### Project Structure

```
vscode-replicated/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── models/               # Data models
│   ├── views/                # View providers
│   ├── services/             # Business logic
│   └── utils/                # Reusable utilities
├── img/                      # Icons and images
├── manifests/                # Example manifests
└── out/                      # Compiled JavaScript
```

## Change Log

See [CHANGELOG.md](./CHANGELOG.md) for detailed release notes.
