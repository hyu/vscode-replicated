# Replicated VSCode extension

The Replicated VSCode extension allows to enable linting of your kubernetes manifest files directly within VSCode.

## Features

### Sidebar Panel

The extension adds a dedicated Replicated panel to the Activity Bar (left sidebar) with three main views:

#### 1. Manifests View

- **All manifest files** organized by installation method
- **Intelligent categorization** of manifests:
  - **Shared Install Config** - Files used across all install methods (Helm, KOTS, Embedded Cluster)
  - **Helm Install** - Files specific to native Helm installations
  - **KOTS Install** - Files specific to KOTS and Embedded Cluster installations
  - Alphabetical sorting within each category
- **Visual kind badges** showing the resource type and install context
- **Lint status** for each file (errors, warnings, info)
- **Detailed tooltips** showing:
  - Installation method context (Shared, Helm, KOTS)
  - Resource kind and description
  - API version
  - File path
- **Quick actions**:
  - **Lint All** button (▶️) to manually lint all manifests
  - **Refresh** button (🔄) to update the view
  - Click any file to open it in the editor

Files are shown with color-coded icons:
- 🔴 Red error icon for files with errors
- 🟡 Yellow warning icon for files with warnings  
- 🔵 Blue info icon for files with information messages
- ✅ Green check for files with no issues

#### 2. Actions View

Development workflow tools for testing and deployment:

- **Auto-lint on save** toggle for automatic linting
- **Test in Environment** dropdown to deploy to Development, Staging, or Production
- **CLI Status** showing installed Replicated CLI version with quick refresh
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

**KOTS Install** (Embedded Cluster & existing cluster):
- HelmChart (kots.io/v1beta1) - HelmChart custom resource telling KOTS how to deploy
- Config (embedded-cluster.io) - Embedded Cluster configuration
- Standard Kubernetes resources (Deployments, Services, ConfigMaps, Secrets, etc.)

### Automatic Linting

Once the extension is installed, it can be enabled by using the command `Replicated Lint Enable`. Once enabled, on each save it will send the manifests to the Replicated Lint server and report results in the Diagnostics Problems view.

![Example](./img/example.png)

To disable the linting, you can run the command `Replicated Lint Disable`.

Manifests are expected to be located under the `manifests` folder (default), which can be changed in the extension settings.

## Extension Settings

This extension contributes the following settings:

* `config.manifestsFolder`: Location for the Replicated yaml manifests (default: manifests)
