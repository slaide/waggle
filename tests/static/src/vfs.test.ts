import { describe, it, expect, beforeEach } from "bun:test";
import { 
    Path, 
    StaticVFS, 
    FetchVFS, 
    DirectoryListing, 
    FileNotFoundError, 
    ReadOnlyError,
    setGlobalVFS,
    getGlobalVFS,
    clearGlobalVFS,
    initializeStaticVFS,
    initializeFetchVFS
} from "../../../static/src/vfs";

describe("VFS - Path class", () => {
    it("should parse simple paths", () => {
        const path = new Path("file.txt");
        expect(path.toString()).toBe("file.txt");
        expect(path.filename()).toBe("file.txt");
        expect(path.extension()).toBe(".txt");
        expect(path.isAbsolute()).toBe(false);
    });

    it("should parse absolute paths", () => {
        const path = new Path("/absolute/path/file.txt");
        expect(path.toString()).toBe("absolute/path/file.txt");
        expect(path.isAbsolute()).toBe(true);
        expect(path.filename()).toBe("file.txt");
        expect(path.extension()).toBe(".txt");
    });

    it("should handle path joining", () => {
        const basePath = new Path("directory");
        const joined = basePath.join("file.txt");
        expect(joined.toString()).toBe("directory/file.txt");
    });

    it("should get parent directories", () => {
        const path = new Path("dir1/dir2/file.txt");
        const parent = path.parent();
        expect(parent.toString()).toBe("dir1/dir2");
    });

    it("should handle path segments", () => {
        const path = new Path("dir1/dir2/file.txt");
        const segments = path.getSegments();
        expect(segments).toEqual(["dir1", "dir2", "file.txt"]);
    });
});

describe("VFS - StaticVFS", () => {
    let vfs: StaticVFS;

    beforeEach(() => {
        vfs = new StaticVFS();
    });

    it("should read and write files", async () => {
        const path = new Path("test.txt");
        const content = "Hello, VFS!";
        
        await vfs.write(path, content);
        const result = await vfs.readText(path);
        
        expect(result).toBe(content);
    });

    it("should handle binary files", async () => {
        const path = new Path("binary.dat");
        const content = new ArrayBuffer(10);
        const view = new Uint8Array(content);
        for (let i = 0; i < view.length; i++) {
            view[i] = i;
        }
        
        await vfs.write(path, content);
        const result = await vfs.readBinary(path);
        
        expect(result.byteLength).toBe(10);
        const resultView = new Uint8Array(result);
        for (let i = 0; i < resultView.length; i++) {
            expect(resultView[i]).toBe(i);
        }
    });

    it("should handle JSON files", async () => {
        const path = new Path("data.json");
        const data = { name: "test", value: 42 };
        
        await vfs.write(path, JSON.stringify(data));
        const result = await vfs.readJSON(path);
        
        expect(result).toEqual(data);
    });

    it("should check file existence", async () => {
        const path = new Path("exists.txt");
        
        expect(await vfs.exists(path)).toBe(false);
        
        await vfs.write(path, "content");
        expect(await vfs.exists(path)).toBe(true);
    });

    it("should throw FileNotFoundError for missing files", async () => {
        const path = new Path("missing.txt");
        
        expect(async () => await vfs.read(path)).toThrow(FileNotFoundError);
    });

    it("should handle directory structure", async () => {
        // Create files in nested directories
        await vfs.write(new Path("dir1/file1.txt"), "content1");
        await vfs.write(new Path("dir1/file2.txt"), "content2");
        await vfs.write(new Path("dir1/subdir/file3.txt"), "content3");
        
        // List directory contents
        const dirListing = await vfs.listDirectory(new Path("dir1"));
        expect(dirListing.isDirectory).toBe(true);
        expect(dirListing.entries.length).toBe(3);
        
        const entryNames = dirListing.entries.map(entry => entry.filename());
        expect(entryNames).toContain("file1.txt");
        expect(entryNames).toContain("file2.txt");
        expect(entryNames).toContain("subdir");
        
        // Check subdirectory
        expect(await vfs.exists(new Path("dir1/subdir"))).toBe(true);
        const subDirListing = await vfs.listDirectory(new Path("dir1/subdir"));
        expect(subDirListing.entries.length).toBe(1);
        expect(subDirListing.entries[0].filename()).toBe("file3.txt");
    });

    it("should initialize with initial files", () => {
        const initialFiles = {
            "config.json": JSON.stringify({ version: "1.0" }),
            "readme.txt": "Welcome to VFS"
        };
        
        const vfs = new StaticVFS(initialFiles);
        
        expect(vfs.exists(new Path("config.json"))).resolves.toBe(true);
        expect(vfs.exists(new Path("readme.txt"))).resolves.toBe(true);
    });

    it("should support directory listing filtering", async () => {
        await vfs.write(new Path("dir/file1.txt"), "content1");
        await vfs.write(new Path("dir/file2.md"), "content2");
        await vfs.write(new Path("dir/file3.txt"), "content3");
        
        const listing = await vfs.listDirectory(new Path("dir"));
        const txtFiles = listing.filterByExtension(".txt");
        
        expect(txtFiles.length).toBe(2);
        expect(txtFiles.map(f => f.filename())).toEqual(["file1.txt", "file3.txt"]);
    });
});

describe("VFS - FetchVFS", () => {
    let vfs: FetchVFS;

    beforeEach(() => {
        vfs = new FetchVFS(".", {
            "static/resources": ["test.json", "font.ttf"]
        });
    });

    it("should be read-only", async () => {
        const path = new Path("test.txt");
        
        expect(async () => await vfs.write(path, "content")).toThrow(ReadOnlyError);
    });

    it("should support directory listings from manifest", async () => {
        const listing = await vfs.listDirectory(new Path("static/resources"));
        
        expect(listing.isDirectory).toBe(true);
        expect(listing.entries.length).toBe(2);
        expect(listing.contains("test.json")).toBe(true);
        expect(listing.contains("font.ttf")).toBe(true);
    });

    it("should support adding directory manifests", () => {
        vfs.addDirectoryManifest("new/dir", ["file1.txt", "file2.txt"]);
        
        const listing = vfs.listDirectory(new Path("new/dir"));
        expect(listing).resolves.toHaveProperty("isDirectory", true);
    });
});

describe("VFS - Global instance management", () => {
    it("should set and get global VFS instance", () => {
        const vfs = new StaticVFS();
        setGlobalVFS(vfs);
        
        const retrieved = getGlobalVFS();
        expect(retrieved).toBe(vfs);
    });

    it("should throw error when no global VFS is set", () => {
        // Clear any existing global VFS
        clearGlobalVFS();
        
        expect(() => getGlobalVFS()).toThrow("No global VFS instance set");
    });

    it("should initialize static VFS as global", () => {
        const initialFiles = { "test.txt": "content" };
        const vfs = initializeStaticVFS(initialFiles);
        
        const global = getGlobalVFS();
        expect(global).toBe(vfs);
    });

    it("should initialize fetch VFS as global", () => {
        const manifest = { "dir": ["file.txt"] };
        const vfs = initializeFetchVFS(".", manifest);
        
        const global = getGlobalVFS();
        expect(global).toBe(vfs);
    });
});

describe("VFS - Error handling", () => {
    let vfs: StaticVFS;

    beforeEach(() => {
        vfs = new StaticVFS();
    });

    it("should throw FileNotFoundError with proper message", async () => {
        const path = new Path("nonexistent.txt");
        
        try {
            await vfs.read(path);
            expect.unreachable("Should have thrown FileNotFoundError");
        } catch (error) {
            expect(error).toBeInstanceOf(FileNotFoundError);
            expect((error as FileNotFoundError).message).toContain("nonexistent.txt");
        }
    });

    it("should handle empty files", async () => {
        const path = new Path("empty.txt");
        await vfs.write(path, "");
        
        const content = await vfs.readText(path);
        expect(content).toBe("");
    });

    it("should handle paths with special characters", async () => {
        const path = new Path("special-file_name.test");
        await vfs.write(path, "content");
        
        const content = await vfs.readText(path);
        expect(content).toBe("content");
        expect(path.extension()).toBe(".test");
    });
});

describe("VFS - Real-world usage patterns", () => {
    it("should support configuration management pattern", async () => {
        const vfs = initializeStaticVFS({
            "config/app.json": JSON.stringify({
                name: "Test App",
                version: "1.0.0",
                features: ["vfs", "testing"]
            }),
            "config/database.json": JSON.stringify({
                host: "localhost",
                port: 5432
            })
        });
        
        // Read configuration
        const appConfig = await vfs.readJSON(new Path("config/app.json"));
        expect(appConfig.name).toBe("Test App");
        
        // List all configs
        const configDir = await vfs.listDirectory(new Path("config"));
        expect(configDir.entries.length).toBe(2);
        
        // Update configuration
        appConfig.version = "1.0.1";
        await vfs.write(new Path("config/app.json"), JSON.stringify(appConfig));
        
        const updatedConfig = await vfs.readJSON(new Path("config/app.json"));
        expect(updatedConfig.version).toBe("1.0.1");
    });

    it("should support resource loading pattern", async () => {
        const vfs = initializeStaticVFS({
            "resources/scene.json": JSON.stringify({
                objects: ["cube", "sphere"],
                lights: ["sun", "ambient"]
            }),
            "resources/textures/wood.png": "binary-texture-data",
            "resources/models/cube.obj": "obj-model-data"
        });
        
        // Load scene configuration
        const scene = await vfs.readJSON(new Path("resources/scene.json"));
        expect(scene.objects).toContain("cube");
        
        // Check resource existence before loading
        expect(await vfs.exists(new Path("resources/models/cube.obj"))).toBe(true);
        expect(await vfs.exists(new Path("resources/models/missing.obj"))).toBe(false);
        
        // List available textures
        const texturesDir = await vfs.listDirectory(new Path("resources/textures"));
        const pngTextures = texturesDir.filterByExtension(".png");
        expect(pngTextures.length).toBe(1);
    });
}); 