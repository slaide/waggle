import { describe, test, expect, beforeAll } from "bun:test";
import { GameObject, GameObjectRegistry } from "../../../../static/src/scene/gameobject";
import { Model } from "../../../../static/src/scene/model";
import { Transform } from "../../../../static/src/scene/transform";
import { Scene } from "../../../../static/src/scene/scene";
import { vec3, quat } from "gl-matrix";

// Mock WebGL context for testing
const mockGL = {
    createBuffer: () => ({} as WebGLBuffer),
    createTexture: () => ({} as WebGLTexture),
    createProgram: () => ({} as WebGLProgram),
    createShader: () => ({} as WebGLShader),
    bindBuffer: () => {},
    bufferData: () => {},
    bindTexture: () => {},
    texImage2D: () => {},
    texParameteri: () => {},
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    getAttribLocation: () => 0,
    getUniformLocation: () => ({} as WebGLUniformLocation),
    getActiveAttrib: () => ({ name: "test" }),
    getActiveUniform: () => ({ name: "test" }),
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    ACTIVE_ATTRIBUTES: 35721,
    ACTIVE_UNIFORMS: 35718,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    CLAMP_TO_EDGE: 33071,
    LINEAR: 9729,
} as any;

describe("Forward Rendering Nested Objects", () => {
    beforeAll(() => {
        // Register Model type for testing
        GameObjectRegistry.register("mesh", Model.fromJSON);
    });

    test("should correctly identify rendering mode in nested hierarchy", async () => {
        // Create nested structure: Deferred > Forward > Deferred
        const parentData = {
            type: "mesh",
            name: "Deferred Parent",
            forwardRendered: false,
            enabled: true,
            visible: true,
            transform: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1]
            },
            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            rawIndices: [0, 1, 2],
            children: [
                {
                    type: "mesh",
                    name: "Forward Child",
                    forwardRendered: true,
                    enabled: true,
                    visible: true,
                    transform: {
                        position: [1, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1]
                    },
                    rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                    rawIndices: [0, 1, 2],
                    children: [
                        {
                            type: "mesh",
                            name: "Deferred Grandchild",
                            forwardRendered: false,
                            enabled: true,
                            visible: true,
                            transform: {
                                position: [0, 1, 0],
                                rotation: [0, 0, 0, 1],
                                scale: [1, 1, 1]
                            },
                            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                            rawIndices: [0, 1, 2]
                        }
                    ]
                }
            ]
        };

        const parentObject = await GameObject.fromJSON(mockGL, parentData);
        
        // Verify parent is deferred
        expect(parentObject.forwardRendered).toBe(false);
        expect(parentObject.name).toBe("Deferred Parent");
        
        // Verify child is forward rendered
        expect(parentObject.children.length).toBe(1);
        const child = parentObject.children[0];
        expect(child.forwardRendered).toBe(true);
        expect(child.name).toBe("Forward Child");
        
        // Verify grandchild is deferred
        expect(child.children.length).toBe(1);
        const grandchild = child.children[0];
        expect(grandchild.forwardRendered).toBe(false);
        expect(grandchild.name).toBe("Deferred Grandchild");
    });

    test("should serialize and deserialize nested forward/deferred objects correctly", async () => {
        // Create a mixed hierarchy
        const transform = new Transform();
        transform.position = vec3.fromValues(0, 0, 0);
        
        const parent = new Model(
            mockGL,
            transform,
            {
                vertexData: {} as WebGLBuffer,
                indices: {} as WebGLBuffer,
                texture: {} as WebGLTexture
            },
            {
                program: {} as WebGLProgram,
                attributeLocations: {},
                uniformLocations: {},
                shaderSources: { vs: "", fs: "" }
            },
            1,
            undefined,
            true,
            true,
            "Parent"
        );
        parent.forwardRendered = false; // Deferred parent

        const child = new Model(
            mockGL,
            new Transform(),
            {
                vertexData: {} as WebGLBuffer,
                indices: {} as WebGLBuffer,
                texture: {} as WebGLTexture
            },
            {
                program: {} as WebGLProgram,
                attributeLocations: {},
                uniformLocations: {},
                shaderSources: { vs: "", fs: "" }
            },
            1,
            undefined,
            true,
            true,
            "Child"
        );
        child.forwardRendered = true; // Forward child

        parent.addChild(child);

        // Serialize
        const serialized = parent.toJSON();
        
        // Add required model data for deserialization
        serialized.rawVertexData = [0, 0, 0, 1, 0, 0, 0, 1, 0];
        serialized.rawIndices = [0, 1, 2];
        serialized.children[0].rawVertexData = [0, 0, 0, 1, 0, 0, 0, 1, 0];
        serialized.children[0].rawIndices = [0, 1, 2];
        
        // Check serialization includes forward rendering flags
        expect(serialized.forwardRendered).toBe(false);
        expect(serialized.children[0].forwardRendered).toBe(true);
        
        // Deserialize
        const deserialized = await GameObject.fromJSON(mockGL, serialized);
        
        // Verify deserialization preserved forward rendering flags
        expect(deserialized.forwardRendered).toBe(false);
        expect(deserialized.children[0].forwardRendered).toBe(true);
    });

    test("should handle scene with mixed forward/deferred objects", async () => {
        const scene = new Scene(mockGL);
        
        // Add deferred object
        const deferredData = {
            type: "mesh",
            name: "Deferred Object",
            forwardRendered: false,
            enabled: true,
            visible: true,
            transform: {
                position: [-1, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1]
            },
            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            rawIndices: [0, 1, 2]
        };
        
        // Add forward object
        const forwardData = {
            type: "mesh",
            name: "Forward Object",
            forwardRendered: true,
            enabled: true,
            visible: true,
            transform: {
                position: [1, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1]
            },
            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            rawIndices: [0, 1, 2]
        };

        const deferredObj = await GameObject.fromJSON(mockGL, deferredData);
        const forwardObj = await GameObject.fromJSON(mockGL, forwardData);
        
        scene.objects.push(deferredObj, forwardObj);

        // Verify scene contains both types
        expect(scene.objects.length).toBe(2);
        expect(scene.objects[0].forwardRendered).toBe(false);
        expect(scene.objects[1].forwardRendered).toBe(true);

        // Test scene serialization/deserialization
        const sceneData = scene.toJSON();
        const deserializedScene = await Scene.fromJSON(mockGL, sceneData);
        
        expect(deserializedScene.objects.length).toBe(2);
        expect(deserializedScene.objects[0].forwardRendered).toBe(false);
        expect(deserializedScene.objects[1].forwardRendered).toBe(true);
    });

    test("should maintain transform hierarchy integrity with mixed rendering modes", async () => {
        // Create complex nested structure with mixed rendering modes
        const rootData = {
            type: "mesh",
            name: "Root (Deferred)",
            forwardRendered: false,
            transform: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [2, 2, 2]
            },
            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            rawIndices: [0, 1, 2],
            children: [
                {
                    type: "mesh",
                    name: "Child1 (Forward)",
                    forwardRendered: true,
                    transform: {
                        position: [1, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: [0.5, 0.5, 0.5]
                    },
                    rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                    rawIndices: [0, 1, 2],
                    children: [
                        {
                            type: "mesh",
                            name: "Grandchild1 (Deferred)",
                            forwardRendered: false,
                            transform: {
                                position: [0, 1, 0],
                                rotation: [0, 0, 0, 1],
                                scale: [1, 1, 1]
                            },
                            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                            rawIndices: [0, 1, 2]
                        }
                    ]
                },
                {
                    type: "mesh",
                    name: "Child2 (Deferred)",
                    forwardRendered: false,
                    transform: {
                        position: [-1, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1]
                    },
                    rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                    rawIndices: [0, 1, 2]
                }
            ]
        };

        const root = await GameObject.fromJSON(mockGL, rootData);
        
        // Verify hierarchy structure
        expect(root.children.length).toBe(2);
        expect(root.children[0].children.length).toBe(1);
        
        // Verify rendering modes are preserved in hierarchy
        expect(root.forwardRendered).toBe(false);
        expect(root.children[0].forwardRendered).toBe(true);
        expect(root.children[0].children[0].forwardRendered).toBe(false);
        expect(root.children[1].forwardRendered).toBe(false);
        
        // Verify parent-child relationships are intact
        expect(root.children[0].parent).toBe(root);
        expect(root.children[1].parent).toBe(root);
        expect(root.children[0].children[0].parent).toBe(root.children[0]);
        
        // Test transform updates propagate correctly
        let transformUpdateCount = 0;
        root.traverse((obj) => {
            // Each object should have a transform
            expect(obj.transform).toBeDefined();
            transformUpdateCount++;
        });
        
        expect(transformUpdateCount).toBe(4); // root + 2 children + 1 grandchild
    });

    test("should handle edge cases in nested forward rendering", async () => {
        // Test case: All objects are forward rendered
        const allForwardData = {
            type: "mesh",
            name: "Forward Root",
            forwardRendered: true,
            transform: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1]
            },
            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            rawIndices: [0, 1, 2],
            children: [
                {
                    type: "mesh",
                    name: "Forward Child",
                    forwardRendered: true,
                    transform: {
                        position: [1, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1]
                    },
                    rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                    rawIndices: [0, 1, 2]
                }
            ]
        };

        const allForward = await GameObject.fromJSON(mockGL, allForwardData);
        expect(allForward.forwardRendered).toBe(true);
        expect(allForward.children[0].forwardRendered).toBe(true);

        // Test case: All objects are deferred (default behavior)
        const allDeferredData = {
            type: "mesh",
            name: "Deferred Root",
            transform: {
                position: [0, 0, 0],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1]
            },
            rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            rawIndices: [0, 1, 2],
            children: [
                {
                    type: "mesh",
                    name: "Deferred Child",
                    transform: {
                        position: [1, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: [1, 1, 1]
                    },
                    rawVertexData: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                    rawIndices: [0, 1, 2]
                }
            ]
        };

        const allDeferred = await GameObject.fromJSON(mockGL, allDeferredData);
        expect(allDeferred.forwardRendered).toBe(false);
        expect(allDeferred.children[0].forwardRendered).toBe(false);
    });
}); 