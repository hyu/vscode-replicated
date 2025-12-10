# Replicated VSCode extension

The Replicated VSCode extension allows to enable linting of your kubernetes manifest files directly within VSCode.

## Features

### Sidebar Panel

The extension adds a dedicated Replicated panel to the Activity Bar (left sidebar) that displays:

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
  - API version
  - Lint status
- **Quick actions**:
  - **Test in Environment** button (🚀) to deploy and test your manifests in a selected environment
  - **Lint All** button (▶️) to manually lint all manifests
  - **Refresh** button (🔄) to update the view
  - Click any file to open it in the editor

Files are shown with color-coded icons:
- 🔴 Red error icon for files with errors
- 🟡 Yellow warning icon for files with warnings  
- 🔵 Blue info icon for files with information messages
- ✅ Green check for files with no issues

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
