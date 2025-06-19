/**
 * Virtual File System (VFS) implementation for flexible file operations
 * Supports different backends: fetch, filesystem API, static lookup for tests
 */

/**
 * Represents a file system path with utilities for manipulation
 */
export class Path {
    private segments: string[];
    private _isAbsolute: boolean;

    constructor(path: string) {
        this._isAbsolute = path.startsWith("/");
        this.segments = path.split("/").filter(segment => segment.length > 0);
    }

    /**
     * Convert path back to string representation
     */
    toString(): string {
        return this.segments.join("/");
    }

    /**
     * Join this path with another path or string
     */
    join(other: string | Path): Path {
        const otherPath = other instanceof Path ? other.toString() : other;
        const combined = this.toString() + "/" + otherPath;
        return new Path(combined);
    }

    /**
     * Get the parent directory path
     */
    parent(): Path {
        if (this.segments.length <= 1) {
            return new Path(this._isAbsolute ? "/" : ".");
        }
        const parentSegments = this.segments.slice(0, -1);
        const parentPath = parentSegments.join("/");
        return new Path(this._isAbsolute ? "/" + parentPath : parentPath);
    }

    /**
     * Get the filename (last segment)
     */
    filename(): string {
        return this.segments[this.segments.length - 1] || "";
    }

    /**
     * Get the file extension (including the dot)
     */
    extension(): string {
        const filename = this.filename();
        const lastDot = filename.lastIndexOf(".");
        return lastDot > 0 ? filename.substring(lastDot) : "";
    }

    /**
     * Check if this is an absolute path
     */
    isAbsolute(): boolean {
        return this._isAbsolute;
    }

    /**
     * Get all path segments
     */
    getSegments(): string[] {
        return [...this.segments];
    }
}

/**
 * Represents the contents of a directory
 */
export class DirectoryListing {
    public readonly isDirectory = true;

    constructor(
        public readonly entries: Path[],
        public readonly path: Path,
    ) {}

    /**
     * Filter entries by extension
     */
    filterByExtension(extension: string): Path[] {
        return this.entries.filter(entry => entry.extension() === extension);
    }

    /**
     * Check if directory contains a specific file
     */
    contains(filename: string): boolean {
        return this.entries.some(entry => entry.filename() === filename);
    }
}

/**
 * Represents the result of a file read operation
 */
export type FileContent = string | ArrayBuffer;
export type ReadResult = FileContent | DirectoryListing;

/**
 * Error thrown when a file or directory is not found
 */
export class FileNotFoundError extends Error {
    constructor(path: Path) {
        super(`File not found: ${path.toString()}`);
        this.name = "FileNotFoundError";
    }
}

/**
 * Error thrown when trying to write to a read-only file system
 */
export class ReadOnlyError extends Error {
    constructor(path: Path) {
        super(`Cannot write to read-only file system: ${path.toString()}`);
        this.name = "ReadOnlyError";
    }
}

/**
 * Abstract Virtual File System interface
 */
export abstract class VFS {
    /**
     * Read a file or directory listing
     * @param path Path to read
     * @returns File content (string/ArrayBuffer) or DirectoryListing
     */
    abstract read(path: Path): Promise<ReadResult>;

    /**
     * Write content to a file
     * @param path Path to write to
     * @param content Content to write (string or ArrayBuffer)
     */
    abstract write(path: Path, content: FileContent): Promise<void>;

    /**
     * Check if a path exists
     * @param path Path to check
     */
    abstract exists(path: Path): Promise<boolean>;

    /**
     * List directory contents (convenience method)
     * @param path Directory path to list
     */
    async listDirectory(path: Path): Promise<DirectoryListing> {
        const result = await this.read(path);
        if (result instanceof DirectoryListing) {
            return result;
        }
        throw new Error(`Path is not a directory: ${path.toString()}`);
    }

    /**
     * Read a file as text (convenience method)
     * @param path File path to read
     */
    async readText(path: Path): Promise<string> {
        const result = await this.read(path);
        if (typeof result === "string") {
            return result;
        }
        if (result instanceof ArrayBuffer) {
            return new TextDecoder().decode(result);
        }
        throw new Error(`Path is not a file: ${path.toString()}`);
    }

    /**
      * Read a file as ArrayBuffer (convenience method)  
      * @param path File path to read
      */
    async readBinary(path: Path): Promise<ArrayBuffer> {
        const result = await this.read(path);
        if (result instanceof ArrayBuffer) {
            return result;
        }
        if (typeof result === "string") {
            const encoded = new TextEncoder().encode(result);
            const buffer = new ArrayBuffer(encoded.byteLength);
            new Uint8Array(buffer).set(encoded);
            return buffer;
        }
        throw new Error(`Path is not a file: ${path.toString()}`);
    }

    /**
     * Read and parse JSON file (convenience method)
     * @param path JSON file path to read
     */
    async readJSON<T = any>(path: Path): Promise<T> {
        const text = await this.readText(path);
        return JSON.parse(text);
    }
}

/**
 * Fetch-based VFS implementation for web environments
 * Uses fetch() to retrieve files, no-op for writes
 */
export class FetchVFS extends VFS {
    private baseUrl: string;
    private directoryManifest: Map<string, string[]>;

    constructor(baseUrl: string = ".", directoryManifest?: Record<string, string[]>) {
        super();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        this.directoryManifest = new Map();
        
        // Populate directory manifest if provided
        if (directoryManifest) {
            for (const [dir, files] of Object.entries(directoryManifest)) {
                this.directoryManifest.set(dir, files);
            }
        }
    }

    async read(path: Path): Promise<ReadResult> {
        const pathStr = path.toString();
        
        // Check if this path is in our directory manifest
        if (this.directoryManifest.has(pathStr)) {
            const files = this.directoryManifest.get(pathStr)!;
            const entries = files.map(file => new Path(pathStr).join(file));
            return new DirectoryListing(entries, path);
        }

        // Try to fetch as a file
        try {
            const url = `${this.baseUrl}/${pathStr}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new FileNotFoundError(path);
            }

            // Determine content type and return appropriate format
            const contentType = response.headers.get("content-type") || "";
            
            if (contentType.includes("application/json") || 
                contentType.includes("text/") || 
                pathStr.endsWith(".json") || 
                pathStr.endsWith(".txt") ||
                pathStr.endsWith(".md")) {
                return await response.text();
            } else {
                return await response.arrayBuffer();
            }
        } catch (error) {
            if (error instanceof FileNotFoundError) {
                throw error;
            }
            throw new FileNotFoundError(path);
        }
    }

    async write(path: Path, _content: FileContent): Promise<void> {
        // No-op for fetch-based VFS - it's read-only
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _content; // Explicitly acknowledge the unused parameter
        throw new ReadOnlyError(path);
    }

    async exists(path: Path): Promise<boolean> {
        try {
            await this.read(path);
            return true;
        } catch (error) {
            if (error instanceof FileNotFoundError) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Add a directory to the manifest for directory listing support
     * @param directoryPath Directory path
     * @param files Array of filenames in that directory
     */
    addDirectoryManifest(directoryPath: string, files: string[]): void {
        this.directoryManifest.set(directoryPath, files);
    }
}

/**
 * Static/in-memory VFS implementation for testing
 * All files are stored in memory as a simple key-value map
 */
export class StaticVFS extends VFS {
    private files: Map<string, FileContent>;
    private directories: Map<string, string[]>;

    constructor(initialFiles?: Record<string, FileContent>) {
        super();
        this.files = new Map();
        this.directories = new Map();

        if (initialFiles) {
            for (const [path, content] of Object.entries(initialFiles)) {
                this.files.set(path, content);
            }
        }

        // Build directory structure from file paths
        this.rebuildDirectoryStructure();
    }

    private rebuildDirectoryStructure(): void {
        this.directories.clear();
        
        for (const filePath of this.files.keys()) {
            const path = new Path(filePath);
            let currentPath = "";
            
            // Build directory entries for each segment
            for (let i = 0; i < path.getSegments().length - 1; i++) {
                const segment = path.getSegments()[i];
                const parentPath = currentPath;
                currentPath = currentPath ? `${currentPath}/${segment}` : segment;
                
                if (!this.directories.has(currentPath)) {
                    this.directories.set(currentPath, []);
                }
                
                // Add to parent directory if it exists
                if (parentPath && this.directories.has(parentPath)) {
                    const parentEntries = this.directories.get(parentPath)!;
                    if (!parentEntries.includes(segment)) {
                        parentEntries.push(segment);
                    }
                }
            }
            
            // Add file to its parent directory
            const parentPath = path.parent().toString();
            if (parentPath !== "." && !this.directories.has(parentPath)) {
                this.directories.set(parentPath, []);
            }
            if (parentPath !== ".") {
                const parentEntries = this.directories.get(parentPath)!;
                const filename = path.filename();
                if (!parentEntries.includes(filename)) {
                    parentEntries.push(filename);
                }
            }
        }
    }

    async read(path: Path): Promise<ReadResult> {
        const pathStr = path.toString();
        
        // Check if it's a directory
        if (this.directories.has(pathStr)) {
            const files = this.directories.get(pathStr)!;
            const entries = files.map(file => new Path(pathStr).join(file));
            return new DirectoryListing(entries, path);
        }
        
        // Check if it's a file
        if (this.files.has(pathStr)) {
            return this.files.get(pathStr)!;
        }
        
        throw new FileNotFoundError(path);
    }

    async write(path: Path, content: FileContent): Promise<void> {
        this.files.set(path.toString(), content);
        this.rebuildDirectoryStructure();
    }

    async exists(path: Path): Promise<boolean> {
        const pathStr = path.toString();
        return this.files.has(pathStr) || this.directories.has(pathStr);
    }

    /**
     * Add a file to the static VFS
     * @param path File path
     * @param content File content
     */
    addFile(path: string, content: FileContent): void {
        this.files.set(path, content);
        this.rebuildDirectoryStructure();
    }

    /**
     * Remove a file from the static VFS
     * @param path File path
     */
    removeFile(path: string): void {
        this.files.delete(path);
        this.rebuildDirectoryStructure();
    }

    /**
     * Clear all files
     */
    clear(): void {
        this.files.clear();
        this.directories.clear();
    }
}

// Global VFS instance that can be swapped
let globalVFS: VFS | null = null;

/**
 * Set the global VFS instance
 * @param vfs VFS instance to use globally
 */
export function setGlobalVFS(vfs: VFS): void {
    globalVFS = vfs;
}

/**
 * Get the global VFS instance
 * @returns Current global VFS instance
 */
export function getGlobalVFS(): VFS {
    if (!globalVFS) {
        throw new Error("No global VFS instance set. Call setGlobalVFS() first.");
    }
    return globalVFS;
}

/**
 * Clear the global VFS instance (mainly for testing)
 */
export function clearGlobalVFS(): void {
    globalVFS = null;
}

/**
 * Initialize the default fetch-based VFS for web environments
 * @param baseUrl Base URL for fetch requests
 * @param directoryManifest Optional directory manifest for directory listings
 */
export function initializeFetchVFS(baseUrl: string = ".", directoryManifest?: Record<string, string[]>): FetchVFS {
    const vfs = new FetchVFS(baseUrl, directoryManifest);
    setGlobalVFS(vfs);
    return vfs;
}

/**
 * Initialize a static VFS for testing
 * @param initialFiles Optional initial files to populate
 */
export function initializeStaticVFS(initialFiles?: Record<string, FileContent>): StaticVFS {
    const vfs = new StaticVFS(initialFiles);
    setGlobalVFS(vfs);
    return vfs;
} 