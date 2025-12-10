/**
 * Utilities for categorizing and identifying manifest files
 */

export type InstallMethod = 'unidentified' | 'shared' | 'embedded-cluster' | 'kots' | 'helm';

export interface CategoryConfig {
    id: InstallMethod;
    title: string;
    icon: string;
    tooltip: string;
    separator?: boolean;
}

/**
 * Category configurations for different install methods
 */
export const CATEGORY_CONFIGS: CategoryConfig[] = [
    {
        id: 'shared',
        title: 'Replicated Platform',
        icon: 'settings-gear',
        tooltip: 'Core configuration files for Replicated deployments. [Learn more](https://docs.replicated.com/intro-replicated)'
    },
    {
        id: 'embedded-cluster',
        title: 'Embedded Cluster',
        icon: 'package',
        tooltip: 'Embedded Cluster (EC) is an install method that installs an embedded cluster, then installs your application.\nFor customer environments with NO existing Kubernetes, like Linux VM. [Learn more](https://docs.replicated.com/vendor/embedded-overview)',
        separator: true
    },
    {
        id: 'kots',
        title: 'KOTS',
        icon: 'server-environment',
        tooltip: 'KOTS (Kubernetes Off-The-Shelf) is an install method that installs your application in an existing Kubernetes cluster.\nProvides an Admin Console for managing installations. [Learn more](https://docs.replicated.com/intro-kots)',
        separator: true
    },
    {
        id: 'helm',
        title: 'Helm CLI',
        icon: 'symbol-method',
        tooltip: 'Helm CLI is a popular install method for customers with existing Kubernetes clusters. [Learn more](https://docs.replicated.com/vendor/helm-install-overview)',
        separator: true
    }
];

/**
 * Known Replicated manifest kinds
 */
const REPLICATED_KINDS = [
    'Application',
    'Config',
    'Preflight',
    'Analyzer',
    'SupportBundle',
    'HelmChart',
    'Backup',
    'Troubleshoot',
    'Redactor'
];

/**
 * Determines if a kind is a known Replicated type
 */
export function isKnownReplicatedKind(kind: string | undefined): boolean {
    return kind ? REPLICATED_KINDS.includes(kind) : false;
}

/**
 * Categorizes a manifest by its install method based on kind and filename
 */
export function categorizeByInstallMethod(
    kind: string | undefined,
    apiVersion: string | undefined,
    fileName: string
): InstallMethod {
    const lowerFileName = fileName.toLowerCase();
    
    // Embedded Cluster (check first - most specific)
    if (lowerFileName.includes('embedded-cluster') || 
        apiVersion === 'embeddedcluster.replicated.com/v1beta1') {
        return 'embedded-cluster';
    }
    
    // Shared config files (used across multiple install methods)
    if (kind === 'Config' || lowerFileName === 'config.yaml' || lowerFileName === 'config.yml') {
        return 'shared';
    }
    
    if (kind === 'Application' && lowerFileName.includes('replicated-app')) {
        return 'shared';
    }
    
    if (lowerFileName.includes('k8s-app')) {
        return 'shared';
    }
    
    if (kind === 'SupportBundle' || lowerFileName.includes('support-bundle')) {
        return 'shared';
    }
    
    // Helm-specific files
    if (lowerFileName.includes('chart') && !lowerFileName.includes('helmchart') && kind !== 'HelmChart') {
        return 'helm';
    }
    
    if (kind === 'Chart') {
        return 'helm';
    }
    
    // KOTS-specific files
    if (kind === 'HelmChart') {
        return 'kots';
    }
    
    // Default categorization
    if (isKnownReplicatedKind(kind)) {
        return 'shared';
    }
    
    // All other Kubernetes resources go to KOTS
    return 'kots';
}

/**
 * Kind descriptions for tooltips
 */
export const KIND_DESCRIPTIONS = new Map<string, string>([
    // Replicated KOTS Resources
    ['kots.io/v1beta1/Config', 'Define the config screen for your customers to set their org\'s unique install values.\ne.g., database URLs, API keys, feature flags…'],
    ['kots.io/v1beta1/Application', 'Customize Admin Console for your customers with your custom branding, app status indicators, port forwarding, release notes…'],
    ['kots.io/v1beta2/HelmChart', 'Specify how KOTS deploys Helm charts to your customer\'s cluster (KOTS), or define your chart specification (Helm)'],
    ['kots.io/v1beta1/ConfigValues', 'Set default config values for customers doing automated / headless installs without Admin Console UI. e.g., for CI/CD pipelines'],
    ['kots.io/v1beta1/LintConfig', 'Customize release linter rules to validate manifests before deploying new releases to your customers'],
    
    // Embedded Cluster
    ['embeddedcluster.replicated.com/v1beta1/Config', 'Configure the embedded Kubernetes cluster your customers will run in their infrastructure.\ne.g., cluster version, node settings, requirements…'],
    
    // Kubernetes Application
    ['app.k8s.io/v1beta1/Application', 'Adds buttons and links to the Replicated Admin Console dashboard'],
    
    // Troubleshoot Resources
    ['troubleshoot.sh/v1beta2/Preflight', 'Define validation checks to run in your customer\'s environment before actual installation, to verify their system meets requirements.\ne.g., memory, disk, permissions…'],
    ['troubleshoot.sh/v1beta2/SupportBundle', 'Specify the diagnostic data to collect from your customer\'s environment when they need support.\ne.g., application logs, pod status, resource states, custom collectors…'],
    ['troubleshoot.sh/v1beta2/Redactor', 'Define patterns to automatically remove your customer\'s sensitive info from support bundles they send you.\ne.g., passwords, API tokens, encryption keys'],
    ['troubleshoot.sh/v1beta2/Analyzer', 'Define custom analysis rules for support bundles to automatically diagnose common issues in your customer\'s environment'],
    
    // Standard Kubernetes Resources
    ['apps/v1/Deployment', 'Manage your application pods in your customer\'s cluster\ne.g., define rolling updates, scaling behavior, ensure desired replicas run…'],
    ['v1/Service', 'Provide a stable network endpoint for your app in your customer\'s cluster. Works like a load balancer routing traffic to your pods.'],
    ['v1/ConfigMap', 'Store non-sensitive configuration data your app needs at runtime in your customer\'s cluster.\ne.g., settings, feature flags, config files for pods…)'],
    ['v1/Secret', 'Store sensitive data your application needs in your customer\'s cluster. Secrets are base64 encoded with restricted access controls.\ne.g., passwords, API keys, certificates…'],
    ['apps/v1/StatefulSet', 'Manage stateful applications in your customer\'s cluster.\ne.g., databases and queues that need persistent identity, stable network IDs, ordered deployment…'],
    ['networking.k8s.io/v1/Ingress', 'Define how external HTTP/HTTPS traffic reaches your application in your customer\'s cluster\ne.g., URL paths, domains, TLS certificates…'],
    ['v1/PersistentVolumeClaim', 'Request persistent storage for your app in your customer\'s cluster. Ensure your data survives pod restarts and rescheduling.']
]);

/**
 * Gets description for a manifest kind
 */
export function getKindDescription(
    apiVersion: string | undefined,
    kind: string,
    fileName: string
): string | undefined {
    const key = apiVersion && kind ? `${apiVersion}/${kind}` : undefined;
    
    if (key) {
        const description = KIND_DESCRIPTIONS.get(key);
        if (description) {
            return description;
        }
    }
    
    // Fallback to filename patterns
    if (fileName.includes('embedded-cluster') && kind === 'Config') {
        return 'Configure the embedded Kubernetes cluster your customers will run in their infrastructure - cluster version, node settings, and requirements';
    }
    
    if (fileName.includes('k8s-app') && kind === 'Application') {
        return 'Add custom buttons and links to your customer\'s Kubernetes dashboard (typically excluded from KOTS installations with kots.io/exclude annotation)';
    }
    
    return undefined;
}

/**
 * Returns icon name based on manifest kind
 */
export function getIconForKind(kind: string | undefined): string {
    if (!kind) {
        return 'code';
    }
    
    const applicationKinds = [
        'Deployment',
        'Service',
        'ConfigMap',
        'Secret',
        'StatefulSet',
        'Ingress',
        'PersistentVolumeClaim',
        'Chart',
        'HelmChart'
    ];
    
    return applicationKinds.includes(kind) ? 'package' : 'code';
}

