/**
 * Environment detection utilities
 * Provides centralized functions to determine the runtime environment
 */

/**
 * Check if the code is running in a browser environment
 * Modern browsers that support WebGL2 will have fetch, so we include that check here
 * @returns true if running in a browser, false otherwise
 */
export function isBrowser(): boolean {
    return typeof window !== "undefined" && 
           typeof document !== "undefined" && 
           typeof fetch !== "undefined";
}

/**
 * Check if the code is running in Node.js or Bun environment
 * @returns true if running in Node.js/Bun, false otherwise
 */
export function isNode(): boolean {
    return typeof process !== "undefined" && 
           process.versions != null && 
           process.versions.node != null;
}

/**
 * Check if the code is running in Bun specifically
 * @returns true if running in Bun, false otherwise
 */
export function isBun(): boolean {
    return typeof process !== "undefined" && 
           process.versions != null && 
           process.versions.bun != null;
}

/**
 * Check if the code is running in a test environment
 * This checks for common test environment indicators
 * @returns true if running in a test environment, false otherwise
 */
export function isTestEnvironment(): boolean {
    // Check for common test environment variables and globals
    return typeof process !== "undefined" && (
        process.env.NODE_ENV === "test" ||
        process.env.JEST_WORKER_ID !== undefined ||
        process.env.VITEST !== undefined ||
        typeof global !== "undefined" && (global as any).__TEST__ === true ||
        // Bun test detection
        typeof Bun !== "undefined" && typeof (Bun as any).jest !== "undefined"
    );
}

/**
 * Check if fetch is available in the current environment
 * Note: This is mainly for completeness - modern browsers that support WebGL2 will have fetch
 * @returns true if fetch is available, false otherwise
 */
export function hasFetch(): boolean {
    return typeof fetch !== "undefined";
}

/**
 * Check if we're in a mock/test WebGL environment
 * This is useful for detecting when WebGL context is mocked for testing
 * @param gl Optional WebGL context to check
 * @returns true if in a mock WebGL environment, false otherwise
 */
export function isMockWebGL(gl?: any): boolean {
    if (!gl) return false;
    
    // Check if the WebGL context appears to be mocked
    return gl.constructor.name === "Object" || 
           typeof gl.getParameter !== "function" ||
           // Check for common mock indicators
           gl._isMock === true;
}

/**
 * Get a human-readable description of the current environment
 * @returns string describing the current runtime environment
 */
export function getEnvironmentDescription(): string {
    if (isTestEnvironment()) {
        if (isBun()) return "Bun Test Environment";
        if (isNode()) return "Node.js Test Environment";
        return "Test Environment";
    }
    
    if (isBrowser()) return "Browser";
    if (isBun()) return "Bun Runtime";
    if (isNode()) return "Node.js Runtime";
    
    return "Unknown Environment";
}

/**
 * Environment information object
 */
export interface EnvironmentInfo {
    isBrowser: boolean;
    isNode: boolean;
    isBun: boolean;
    isTest: boolean;
    description: string;
}

/**
 * Get comprehensive environment information
 * @returns object with all environment detection results
 */
export function getEnvironmentInfo(): EnvironmentInfo {
    return {
        isBrowser: isBrowser(),
        isNode: isNode(),
        isBun: isBun(),
        isTest: isTestEnvironment(),
        description: getEnvironmentDescription(),
    };
} 