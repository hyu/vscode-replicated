/**
 * Brand colors - Primary palette
 */
export const BRAND_COLORS = {
    /** Slate Noir */
    slateNoir: {
        full: '#161616',
        p75: 'rgba(22, 22, 22, 0.75)',
        p50: 'rgba(22, 22, 22, 0.5)',
        p25: 'rgba(22, 22, 22, 0.25)',
        p10: 'rgba(22, 22, 22, 0.1)',
    },
    /** Graphite Gray */
    graphiteGray: {
        full: '#585858',
        p75: 'rgba(88, 88, 88, 0.75)',
        p50: 'rgba(88, 88, 88, 0.5)',
        p25: 'rgba(88, 88, 88, 0.25)',
        p10: 'rgba(88, 88, 88, 0.1)',
    },
    /** Replicated Red */
    replicatedRed: {
        full: '#FF4856',
        p75: 'rgba(255, 72, 86, 0.75)',
        p50: 'rgba(255, 72, 86, 0.5)',
    },
    /** Nebula Purple */
    nebulaPurple: {
        full: '#6977FB',
        p75: 'rgba(105, 119, 251, 0.75)',
        p50: 'rgba(105, 119, 251, 0.5)',
        p25: 'rgba(105, 119, 251, 0.25)',
    },
    /** Cyber Mint */
    cyberMint: {
        full: '#51E9F0',
        p75: 'rgba(81, 233, 240, 0.75)',
        p50: 'rgba(81, 233, 240, 0.5)',
        p25: 'rgba(81, 233, 240, 0.25)',
    },
} as const;

/**
 * Status colors for webview badges
 */
export const STATUS_COLORS = {
    /** Running/active status */
    running: BRAND_COLORS.cyberMint.full,
    /** Ready status */
    ready: BRAND_COLORS.nebulaPurple.full,
    /** Running/active background */
    runningBackground: BRAND_COLORS.cyberMint.p25,
    /** Ready background */
    readyBackground: BRAND_COLORS.nebulaPurple.p25,
} as const;


