# Replicated VSCode extension

The Replicated VSCode extension allows to enable linting of your kubernetes manifest files directly within VSCode.

## Features

### Sidebar Panel

The extension adds a dedicated Replicated panel to the Activity Bar (left sidebar) with three main views:

#### 1. Manifests View

- **All manifest files** in your configured manifests folder
- **Intelligent sorting** of manifests:
  - Replicated/KOTS manifests first (Application, Config, Preflight, Analyzer, SupportBundle, HelmChart, Backup)
  - Kubernetes resources next (Services, Deployments, StatefulSets, etc.)
  - Alphabetical within each category
- **Visual kind badges** showing the resource type (📦 Application, ⚙️ Config, ✓ Preflight, 🚀 Deployment, 🌐 Service, etc.)
- **Lint status** for each file (errors, warnings, info)
- **Time since last check** with human-readable time ago (e.g., "5m ago")
- **Detailed tooltips** showing:
  - File path
  - Kubernetes/KOTS kind
  - Description of the resource type
  - API version
  - Last linted timestamp
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

For more details, see [CLUSTER_RESOURCES_FEATURE.md](CLUSTER_RESOURCES_FEATURE.md) and [CLUSTER_RESOURCES_QUICKSTART.md](CLUSTER_RESOURCES_QUICKSTART.md)

#### Supported Manifest Types

The extension recognizes and properly orders these manifest types:

**Replicated/KOTS Manifests:**
- Application (kots.io/v1beta1)
- Config (kots.io/v1beta1)
- Preflight (troubleshoot.sh/v1beta2)
- Analyzer (troubleshoot.sh/v1beta2)
- SupportBundle (troubleshoot.sh/v1beta2)
- HelmChart (kots.io/v1beta1)
- Backup (velero.io/v1)

**Kubernetes Resources:**
- Deployments, Services, StatefulSets, DaemonSets
- Jobs, CronJobs
- ConfigMaps, Secrets
- PersistentVolumes, PersistentVolumeClaims
- Ingress, NetworkPolicy
- ServiceAccounts, Roles, RoleBindings
- And all other standard Kubernetes resources

### Automatic Linting

Once the extension is installed, it can be enabled by using the command `Replicated Lint Enable`. Once enabled, on each save it will send the manifests to the Replicated Lint server and report results in the Diagnostics Problems view.

![Example](./img/example.png)

To disable the linting, you can run the command `Replicated Lint Disable`.

Manifests are expected to be located under the `manifests` folder (default), which can be changed in the extension settings.

## Extension Settings

This extension contributes the following settings:

* `config.manifestsFolder`: Location for the Replicated yaml manifests (default: manifests)
