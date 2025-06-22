import { vec3, Vec3Like } from "gl-matrix";
import { getGlobalVFS, Path } from "../vfs";

class MtlTexture {
    constructor(
        public source: string,

        public blendu?: boolean,
        public blendv?: boolean,
        /** boost bump map values (mult by this factor) */
        public boost?: number,
    ) { }
};

export type BB = {
    x: {
        min: number;
        max: number;
    };
    y: {
        min: number;
        max: number;
    };
    z: {
        min: number;
        max: number;
    };
};

export class MtlMaterial {
    ambient?: Vec3Like;
    diffuse?: Vec3Like;
    specular?: Vec3Like;
    specularExponent?: number;
    transparency?: number;

    illuminationMode?: number;

    map_ambient?: MtlTexture;
    map_diffuse?: MtlTexture;
    map_specular?: MtlTexture;
    map_specularExponent?: MtlTexture;
}

class MtlFile {
    constructor(
        public path: string,
        public materials: {
            [mtlName: string]: MtlMaterial;
        },
    ) { }
};

// Helper function to parse texture map options
function parseTextureOptions(texture: MtlTexture, args: string[], startIndex: number = 1) {
    for (let i = startIndex; i < args.length; i++) {
        if (args[i] === "-blendu") {
            texture.blendu = args[i + 1] === "on";
            i++;
        } else if (args[i] === "-blendv") {
            texture.blendv = args[i + 1] === "on";
            i++;
        } else if (args[i] === "-boost") {
            texture.boost = parseFloat(args[i + 1]);
            i++;
        }
    }
}

// Helper function to create a texture with path and options
function createTexture(path: string, args: string[]): MtlTexture {
    const texture = new MtlTexture(
        path.substring(0, path.lastIndexOf("/") + 1) + args[args.length - 1],
    );
    parseTextureOptions(texture, args, 0);
    return texture;
}

// Helper for default material values
const DEFAULT_AMBIENT = [0.2, 0.2, 0.2];
const DEFAULT_DIFFUSE = [0.8, 0.8, 0.8];
const DEFAULT_SPECULAR = [0.8, 0.8, 0.8];
function parseVec(parts: string[], def: number[]): Vec3Like {
    if (parts.length === 0) return vec3.fromValues(def[0], def[1], def[2]);
    if (parts.length === 1) return vec3.fromValues(Number(parts[0]), Number(parts[0]), Number(parts[0]));
    if (parts.length === 2) return vec3.fromValues(Number(parts[0]), Number(parts[1]), def[2]);
    return vec3.fromValues(Number(parts[0]), Number(parts[1]), Number(parts[2]));
}

function parseMtl(path: string, s: string): MtlFile {
    s = s.replace(/\\\n/g, " ");
    const ret: MtlFile = { path, materials: {} };
    let lastMaterial = new MtlMaterial();
    const lines = s
        .replace(/\t/g, " ")
        .replace(/\r/g, "")
        .split("\n");
    for (const line of lines) {
        if (line == null) break;
        const line_segments = line.split(" ").filter(l => l.length);
        if (line_segments.length === 0) continue;
        const [directive, ...args] = line_segments;
        if (directive[0] === "#") continue;
        switch (directive) {
        case "newmtl": {
            const materialName = args[0];
            lastMaterial = new MtlMaterial();
            ret.materials[materialName] = lastMaterial;
            continue;
        }
        case "Ka": {
            const color = parseVec(args, DEFAULT_AMBIENT);
            lastMaterial.ambient = color;
            continue;
        }
        case "Kd": {
            const color = parseVec(args, DEFAULT_DIFFUSE);
            lastMaterial.diffuse = color;
            continue;
        }
        case "Ks": {
            const color = parseVec(args, DEFAULT_SPECULAR);
            lastMaterial.specular = color;
            continue;
        }
        case "Ns": {
            const exponent = parseFloat(args[0]);
            if (isNaN(exponent)) {
                console.warn(`Invalid specular exponent value in MTL file: ${args[0]}`);
                lastMaterial.specularExponent = 64.0; // Default value
            } else if (exponent < 0) {
                console.warn(`Negative specular exponent value in MTL file: ${exponent}`);
                lastMaterial.specularExponent = 64.0; // Default value
            } else {
                lastMaterial.specularExponent = exponent;
            }
            continue;
        }
        case "d":
            lastMaterial.transparency = parseFloat(args[0]);
            continue;
        case "Tr":
            lastMaterial.transparency = parseFloat(args[0]);
            continue;
        case "illum":
            lastMaterial.illuminationMode = Math.round(parseFloat(args[0]));
            continue;
        case "map_Ka":
            lastMaterial.map_ambient = createTexture(path, args);
            continue;
        case "map_Kd":
            lastMaterial.map_diffuse = createTexture(path, args);
            continue;
        case "map_Ks":
            lastMaterial.map_specular = createTexture(path, args);
            continue;
        case "map_Ns":
            lastMaterial.map_specularExponent = createTexture(path, args);
            continue;
        default:
            // Skip unknown directives instead of throwing
            continue;
        }
    }
    return ret;
}

export class ObjGroup {
    constructor(
        public vertexData: Float32Array,
        public indices: Uint32Array,
        public material: MtlMaterial | null,
    ) { }
}

export class ObjObject {
    constructor(
        public groups: {
            [groupName: string]: ObjGroup;
        } = {},
    ) { }
}

export class ObjFile {
    constructor(
        public objects: {
            [objectName: string]: ObjObject;
        },
        public boundingBox: BB,
    ) { }
}

function deepCloneMaterial(mat: MtlMaterial | null): MtlMaterial | null {
    if (!mat) return null;
    const clone = new MtlMaterial();
    clone.ambient = mat.ambient ? vec3.clone(mat.ambient) : undefined;
    clone.diffuse = mat.diffuse ? vec3.clone(mat.diffuse) : undefined;
    clone.specular = mat.specular ? vec3.clone(mat.specular) : undefined;
    clone.specularExponent = mat.specularExponent;
    clone.transparency = mat.transparency;
    clone.illuminationMode = mat.illuminationMode;
    clone.map_ambient = mat.map_ambient ? Object.assign(new MtlTexture(mat.map_ambient.source), mat.map_ambient) : undefined;
    clone.map_diffuse = mat.map_diffuse ? Object.assign(new MtlTexture(mat.map_diffuse.source), mat.map_diffuse) : undefined;
    clone.map_specular = mat.map_specular ? Object.assign(new MtlTexture(mat.map_specular.source), mat.map_specular) : undefined;
    clone.map_specularExponent = mat.map_specularExponent ? Object.assign(new MtlTexture(mat.map_specularExponent.source), mat.map_specularExponent) : undefined;
    return clone;
}

function flushVertexData(
    objects: { [key: string]: ObjObject },
    lastObject: string,
    lastGroupKey: string,
    vertexData: number[],
    indices: number[],
    lastMaterial: MtlMaterial | null,
): void {
    if (vertexData.length > 0) {
        if (!objects[lastObject]) objects[lastObject] = new ObjObject();
        // Deep clone the material to avoid shared references between groups
        const materialCopy = deepCloneMaterial(lastMaterial);
        const groupObj = new ObjGroup(
            new Float32Array(vertexData),
            new Uint32Array(indices),
            materialCopy,
        );
        objects[lastObject].groups[lastGroupKey] = groupObj;
    }
}

// Helper function to parse vertex indices from face data
function parseVertexIndices(faceVertex: string, vertexCount: number, uvCount: number, normalCount: number): {
    vertexIndex: number;
    uvIndex: number;
    normalIndex: number;
} {
    const face_segments = faceVertex.split("/");
    let vertexIndex = parseInt(face_segments[0] || "0");
    let uvIndex = parseInt(face_segments[1] || "0");
    let normalIndex = parseInt(face_segments[2] || "0");

    // Handle negative indices (relative to end of array)
    if (vertexIndex < 0) vertexIndex = (vertexCount / 4) + vertexIndex;
    else vertexIndex = vertexIndex - 1;

    if (uvIndex < 0) uvIndex = (uvCount / 3) + uvIndex;
    else uvIndex = uvIndex - 1;

    if (normalIndex < 0) normalIndex = (normalCount / 3) + normalIndex;
    else normalIndex = normalIndex - 1;

    return { vertexIndex, uvIndex, normalIndex };
}

// Helper function to calculate face normal using winding order
function calculateFaceNormal(
    facePositions: [number, number, number][],
    i: number,
    tempVec1: Vec3Like,
    tempVec2: Vec3Like,
): Vec3Like {
    const finalNormal = vec3.create();
    if (facePositions.length === 4) {
        // For quads, use different winding order based on which triangle we're calculating for
        if (i < 3) {
            vec3.sub(tempVec1, facePositions[1], facePositions[0]);
            vec3.sub(tempVec2, facePositions[2], facePositions[0]);
        } else {
            vec3.sub(tempVec1, facePositions[2], facePositions[0]);
            vec3.sub(tempVec2, facePositions[3], facePositions[0]);
        }
    } else {
        // For triangles, use consistent winding order
        vec3.sub(tempVec1, facePositions[1], facePositions[0]);
        vec3.sub(tempVec2, facePositions[2], facePositions[0]);
    }
    vec3.cross(finalNormal, tempVec1, tempVec2);
    vec3.normalize(finalNormal, finalNormal);
    return finalNormal;
}

export async function parseObj(filepath: string, options?: {
    normalizeSize?: boolean,
    mockContent?: string,
    mockMtlContent?: string,
}): Promise<ObjFile> {
    let filedata: string;
    if (options?.mockContent) {
        filedata = options.mockContent;
    } else {
        const vfs = getGlobalVFS();
        filedata = await vfs.readText(new Path(filepath));
    }
    filedata = filedata.replace(/\\\n/g, " ");

    // Initialize material file
    let materialFile: MtlFile | null = null;
    if (options?.mockMtlContent) {
        materialFile = parseMtl(filepath, options.mockMtlContent);
    } else {
        // Try to load material file if it exists
        const mtlPath = filepath.replace(/\.obj$/i, ".mtl");
        try {
            const vfs = getGlobalVFS();
            const mtlContent = await vfs.readText(new Path(mtlPath));
            materialFile = parseMtl(mtlPath, mtlContent);
        } catch {
            // Material file not found or invalid, continue without materials
            materialFile = null;
        }
    }

    // Initialize dynamic buffers with reasonable initial sizes
    const INITIAL_BUFFER_SIZE = 1024; // Start with 1K vertices
    const GROWTH_FACTOR = 2; // Double size when needed

    // Dynamic buffer for vertex positions (x,y,z,w)
    let vertexPositions: Float32Array = new Float32Array(INITIAL_BUFFER_SIZE * 4);
    let vertexPositionsLength = 0;

    // Dynamic buffer for vertex UVs (u,v,w)
    let vertexUVs: Float32Array = new Float32Array(INITIAL_BUFFER_SIZE * 3);
    let vertexUVsLength = 0;

    // Dynamic buffer for vertex normals (x,y,z)
    let vertexNormals: Float32Array = new Float32Array(INITIAL_BUFFER_SIZE * 3);
    let vertexNormalsLength = 0;

    // Helper function to grow a buffer
    function growBuffer(buffer: Float32Array): Float32Array {
        const newBuffer = new Float32Array(buffer.length * GROWTH_FACTOR);
        newBuffer.set(buffer);
        return newBuffer;
    }

    // Helper function to add vertex data
    function addVertexData(buffer: Float32Array, length: number, data: number[]): [Float32Array, number] {
        if (length + data.length > buffer.length) {
            buffer = growBuffer(buffer);
        }
        buffer.set(data, length);
        return [buffer, length + data.length];
    }

    const lines = filedata
        .replace(/\t/g, " ")
        .replace(/\r/g, "")
        .split("\n");

    // Single pass to process vertices
    for (const line of lines) {
        if (!line || line[0] === "#") continue;
        const [directive, ...args] = line.split(" ").filter(l => l.length);
        
        if (directive === "v") {
            const data = [
                parseFloat(args[0]),
                parseFloat(args[1]),
                parseFloat(args[2]),
                parseFloat(args[3] || "1.0"),
            ];
            [vertexPositions, vertexPositionsLength] = addVertexData(vertexPositions, vertexPositionsLength, data);
        } else if (directive === "vt") {
            const data = [
                parseFloat(args[0]),
                parseFloat(args[1]),
                parseFloat(args[2] || "0.0"),
            ];
            [vertexUVs, vertexUVsLength] = addVertexData(vertexUVs, vertexUVsLength, data);
        } else if (directive === "vn") {
            const data = [
                parseFloat(args[0]),
                parseFloat(args[1]),
                parseFloat(args[2]),
            ];
            [vertexNormals, vertexNormalsLength] = addVertexData(vertexNormals, vertexNormalsLength, data);
        }
    }

    // Trim buffers to actual size
    vertexPositions = vertexPositions.slice(0, vertexPositionsLength);
    vertexUVs = vertexUVs.slice(0, vertexUVsLength);
    vertexNormals = vertexNormals.slice(0, vertexNormalsLength);

    let material: MtlMaterial | null = null;
    const NUM_VERT_COMPONENTS = 8;
    const objects: { [key: string]: ObjObject } = {};
    let currentObject = "default";
    let currentGroup = "default";
    let vertexData: number[] = [];
    let indices: number[] = [];
    let currentSmoothingGroup: string | null = null;

    // Track vertices by position and smoothing group for normal calculation
    const smoothingAccum = new Map<string, { sum: Vec3Like, count: number }>();

    // Initialize default object
    objects["default"] = new ObjObject();

    // --- First pass for smoothing group normals: accumulate normals ---
    const tempVec1 = vec3.create();
    const tempVec2 = vec3.create();
    const tempNormal = vec3.create();
    currentSmoothingGroup = "off";

    for (const line of lines) {
        if (!line || line[0] === "#") continue;
        const [directive, ...args] = line.split(" ").filter(l => l.length);
        if (directive === "s") {
            currentSmoothingGroup = args[0] || "off";
        } else if (directive === "f") {
            const faceVertices: Vec3Like[] = [];
            const faceIndices: number[] = [];
            for (const faceVertex of args) {
                const face_segments = faceVertex.split("/");
                let vertexIndex = parseInt(face_segments[0] || "0");
                if (vertexIndex < 0) {
                    vertexIndex = (vertexPositions.length / 4) + vertexIndex;
                } else {
                    vertexIndex = vertexIndex - 1;
                }
                vec3.set(
                    tempVec1,
                    vertexPositions[vertexIndex * 4],
                    vertexPositions[vertexIndex * 4 + 1],
                    vertexPositions[vertexIndex * 4 + 2],
                );
                faceVertices.push(vec3.clone(tempVec1) as Vec3Like);
                faceIndices.push(vertexIndex);
            }
            // Calculate face normal using the first three vertices
            if (faceVertices.length >= 3) {
                vec3.sub(tempVec1, faceVertices[1], faceVertices[0]);
                vec3.sub(tempVec2, faceVertices[2], faceVertices[0]);
                vec3.cross(tempNormal, tempVec1, tempVec2);
                vec3.normalize(tempNormal, tempNormal);
                // Validate normal
                if (isNaN(tempNormal[0]) || isNaN(tempNormal[1]) || isNaN(tempNormal[2]) ||
                    (tempNormal[0] === 0 && tempNormal[1] === 0 && tempNormal[2] === 0)) {
                    console.warn(`Invalid face normal detected at vertex ${faceIndices[0]}`);
                    // If normal is invalid, use a default up vector
                    vec3.set(tempNormal, 0, 1, 0);
                }
                // For each vertex in the face, accumulate its normal if in a smoothing group
                if (currentSmoothingGroup !== "off") {
                    for (const idx of faceIndices) {
                        const accumKey = `${idx}|s:${currentSmoothingGroup}`;
                        if (!smoothingAccum.has(accumKey)) {
                            smoothingAccum.set(accumKey, { sum: vec3.clone(tempNormal) as Vec3Like, count: 1 });
                        } else {
                            const entry = smoothingAccum.get(accumKey)!;
                            if (false) {
                                // Check if the new normal is significantly different from existing ones
                                const dotProduct = vec3.dot(entry.sum, tempNormal);
                                if (Math.abs(dotProduct) < Math.cos(60 / 180 * Math.PI)) { // If angle > 60 degrees
                                    console.warn(`Large normal angle difference detected at vertex ${idx} in smoothing group ${currentSmoothingGroup}`);
                                }
                            }
                            vec3.add(entry.sum, entry.sum, tempNormal);
                            entry.count++;
                        }
                    }
                }
            }
        }
    }

    // Normalize all accumulated normals for smoothing groups
    for (const [accumKey, entry] of smoothingAccum.entries()) {
        if (entry.count > 0) {
            vec3.scale(entry.sum, entry.sum, 1 / entry.count);
            vec3.normalize(entry.sum, entry.sum);
            // Validate smoothed normal
            if (isNaN(entry.sum[0]) || isNaN(entry.sum[1]) || isNaN(entry.sum[2]) ||
                (entry.sum[0] === 0 && entry.sum[1] === 0 && entry.sum[2] === 0)) {
                const [vertexIndex] = accumKey.split("|");
                console.warn(`Invalid smoothed normal detected at vertex ${vertexIndex}`);
                // If normal is invalid, use a default up vector
                vec3.set(entry.sum, 0, 1, 0);
            }
        }
    }

    // --- Face parsing and group creation ---
    currentSmoothingGroup = "off";
    currentObject = "default";
    currentGroup = "default";
    // Set default material if only one material is defined in the MTL file
    if (materialFile && Object.keys(materialFile.materials).length === 1) {
        material = materialFile.materials[Object.keys(materialFile.materials)[0]];
    }
    vertexData = [];
    indices = [];
    let lastMaterial: MtlMaterial | null = material;
    let lastGroup = currentGroup;
    let lastObject = currentObject;
    let lastSmoothingGroup = currentSmoothingGroup;
    const getMaterialName = (mat: MtlMaterial | null): string => {
        if (!mat || !materialFile) return "";
        return Object.keys(materialFile.materials).find(k => materialFile!.materials[k] === mat) || "";
    };
    let lastGroupKey = `${lastGroup}|${getMaterialName(lastMaterial)}|${lastSmoothingGroup}`;
    const groupKey = () => `${currentGroup}|${getMaterialName(material)}|${currentSmoothingGroup}`;

    for (const line of lines) {
        if (!line || line[0] === "#") continue;
        const [directive, ...args] = line.split(" ").filter(l => l.length);
        if (directive === "o" || directive === "g" || directive === "usemtl" || directive === "s") {
            flushVertexData(objects, lastObject, lastGroupKey, vertexData, indices, lastMaterial);
            vertexData = [];
            indices = [];
            
            // Update state based on directive
            if (directive === "o") {
                currentObject = args[0] || "default";
                if (!objects[currentObject]) objects[currentObject] = new ObjObject();
                currentGroup = "default";
                currentSmoothingGroup = "off";
            } else if (directive === "g") {
                currentGroup = args[0] || "default";
            } else if (directive === "usemtl") {
                const mtlName = args[0];
                material = materialFile?.materials?.[mtlName] ?? null;
            } else if (directive === "s") {
                currentSmoothingGroup = args[0] || "off";
            }
            
            // Update tracking variables
            lastMaterial = material;
            lastGroup = currentGroup;
            lastObject = currentObject;
            lastSmoothingGroup = currentSmoothingGroup;
            lastGroupKey = groupKey();
        } else if (directive === "f") {
            const faceVertices: Vec3Like[] = [];
            const faceIndices: number[] = [];
            for (const faceVertex of args) {
                const { vertexIndex } = parseVertexIndices(
                    faceVertex,
                    vertexPositions.length,
                    vertexUVs.length,
                    vertexNormals.length,
                );
                vec3.set(
                    tempVec1,
                    vertexPositions[vertexIndex * 4],
                    vertexPositions[vertexIndex * 4 + 1],
                    vertexPositions[vertexIndex * 4 + 2],
                );
                faceVertices.push(vec3.clone(tempVec1) as Vec3Like);
                faceIndices.push(vertexIndex);
            }
            // Store all positions for this face
            const facePositions: [number, number, number][] = args.map(faceVertex => {
                const face_segments = faceVertex.split("/");
                let vertexIndex = parseInt(face_segments[0] || "0");
                if (vertexIndex < 0) {
                    vertexIndex = (vertexPositions.length / 4) + vertexIndex;
                } else {
                    vertexIndex = vertexIndex - 1;
                }
                return [
                    vertexPositions[vertexIndex * 4],
                    vertexPositions[vertexIndex * 4 + 1],
                    vertexPositions[vertexIndex * 4 + 2],
                ];
            });
            // Calculate centroid for this face
            const centroid = [0, 0, 0];
            for (const pos of facePositions) {
                centroid[0] += pos[0];
                centroid[1] += pos[1];
                centroid[2] += pos[2];
            }
            centroid[0] /= facePositions.length;
            centroid[1] /= facePositions.length;
            centroid[2] /= facePositions.length;
            const outIndices: number[] = [];
            for (let i = 0; i < args.length; i++) {
                const faceVertex = args[i];
                const { vertexIndex, normalIndex, uvIndex } = parseVertexIndices(
                    faceVertex,
                    vertexPositions.length,
                    vertexUVs.length,
                    vertexNormals.length,
                );
                let finalNormal: Vec3Like;
                if (currentSmoothingGroup !== "off") {
                    // Use smoothed normal from accumulated normals if available
                    const accumKey = `${vertexIndex}|s:${currentSmoothingGroup}`;
                    const smoothedNormal = smoothingAccum.get(accumKey);
                    if (smoothedNormal) {
                        finalNormal = vec3.clone(smoothedNormal.sum) as Vec3Like;
                    } else {
                        // Fallback to face normal if no smoothed normal available
                        finalNormal = calculateFaceNormal(facePositions, i, tempVec1, tempVec2);
                    }
                } else if (normalIndex >= 0 && normalIndex * 3 + 2 < vertexNormals.length) {
                    // Use explicit normal from file if available
                    finalNormal = vec3.fromValues(
                        vertexNormals[normalIndex * 3],
                        vertexNormals[normalIndex * 3 + 1],
                        vertexNormals[normalIndex * 3 + 2],
                    ) as Vec3Like;
                } else {
                    // Calculate face normal using winding order
                    finalNormal = calculateFaceNormal(facePositions, i, tempVec1, tempVec2);
                }
                // Ensure normal is normalized
                vec3.normalize(finalNormal, finalNormal);
                vertexData.push(
                    vertexPositions[vertexIndex * 4],
                    vertexPositions[vertexIndex * 4 + 1],
                    vertexPositions[vertexIndex * 4 + 2],
                    finalNormal[0], finalNormal[1], finalNormal[2],
                    vertexUVs[uvIndex * 3] || 0,
                    vertexUVs[uvIndex * 3 + 1] || 0,
                );
                outIndices.push(vertexData.length / NUM_VERT_COMPONENTS - 1);
            }
            // Add triangle indices
            if (args.length === 4) {
                indices.push(outIndices[0], outIndices[1], outIndices[2]);
                indices.push(outIndices[0], outIndices[2], outIndices[3]);
            } else {
                for (let i = 1; i < outIndices.length - 1; i++) {
                    indices.push(outIndices[0], outIndices[i], outIndices[i + 1]);
                }
            }
        }
    }

    // Finalize last group
    flushVertexData(objects, lastObject, lastGroupKey, vertexData, indices, lastMaterial);

    // Remap group names to match OBJ file group names, ensuring uniqueness within each object
    for (const obj of Object.values(objects)) {
        const groupKeys = Object.keys(obj.groups);
        const nameCount: { [name: string]: number } = {};
        for (const key of groupKeys) {
            const originalGroupName = key.split("|")[0];
            let groupName = originalGroupName;
            if (obj.groups[groupName]) {
                nameCount[groupName] = (nameCount[groupName] || 0) + 1;
                groupName = `${originalGroupName}_${nameCount[groupName]}`;
                // Keep incrementing until we find a unique name
                while (obj.groups[groupName]) {
                    nameCount[originalGroupName]++;
                    groupName = `${originalGroupName}_${nameCount[originalGroupName]}`;
                }
            } else {
                nameCount[groupName] = 0;
            }
            obj.groups[groupName] = obj.groups[key];
        }
        // Remove all composite keys
        for (const key of groupKeys) {
            if (key.includes("|")) {
                delete obj.groups[key];
            }
        }
    }

    // Remove empty objects and groups
    for (const [objName, obj] of Object.entries(objects)) {
        for (const [groupName, group] of Object.entries(obj.groups)) {
            if (group.indices.length === 0) {
                delete obj.groups[groupName];
            }
        }
        if (Object.keys(obj.groups).length === 0) {
            delete objects[objName];
        }
    }

    // Normalize size if requested
    if (options?.normalizeSize ?? false) {
        // Calculate bounding box
        const size: BB = {
            x: { min: Infinity, max: -Infinity },
            y: { min: Infinity, max: -Infinity },
            z: { min: Infinity, max: -Infinity },
        };

        // Calculate bounding box from all vertices
        for (const obj of Object.values(objects)) {
            for (const group of Object.values(obj.groups)) {
                for (let i = 0; i < group.vertexData.length; i += 8) {
                    const x = group.vertexData[i];
                    const y = group.vertexData[i + 1];
                    const z = group.vertexData[i + 2];
                    size.x.min = Math.min(size.x.min, x);
                    size.x.max = Math.max(size.x.max, x);
                    size.y.min = Math.min(size.y.min, y);
                    size.y.max = Math.max(size.y.max, y);
                    size.z.min = Math.min(size.z.min, z);
                    size.z.max = Math.max(size.z.max, z);
                }
            }
        }

        // Calculate normalization parameters
        const extent = {
            x: size.x.max - size.x.min,
            y: size.y.max - size.y.min,
            z: size.z.max - size.z.min,
        };
        const center = {
            x: size.x.min + extent.x / 2,
            y: size.y.min + extent.y / 2,
            z: size.z.min + extent.z / 2,
        };
        const max_extent = Math.max(extent.x, extent.y, extent.z);
        const scale = max_extent === 0 ? 1 : 0.5 / max_extent;

        // Normalize vertices
        for (const obj of Object.values(objects)) {
            for (const group of Object.values(obj.groups)) {
                for (let i = 0; i < group.vertexData.length; i += 8) {
                    group.vertexData[i + 0] = ((group.vertexData[i + 0] - center.x) * scale);
                    group.vertexData[i + 1] = ((group.vertexData[i + 1] - center.y) * scale);
                    group.vertexData[i + 2] = ((group.vertexData[i + 2] - center.z) * scale);
                }
            }
        }

        return new ObjFile(objects, size);
    }

    // Return empty bounding box if not normalizing
    return new ObjFile(objects, {
        x: { min: 0, max: 0 },
        y: { min: 0, max: 0 },
        z: { min: 0, max: 0 },
    });
}