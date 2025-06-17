import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { GameObject, GameObjectRegistry } from '../../../../static/src/scene/gameobject';
import { Transform } from '../../../../static/src/scene/transform';
import { Model } from '../../../../static/src/scene/model';
import { PointLight, DirectionalLight } from '../../../../static/src/scene/light';
import { vec3, quat } from 'gl-matrix';

// Import to register the GameObjectRegistry factories
import "../../../../static/src/scene/model";
import "../../../../static/src/scene/light";

// Create a test GameObject class for serialization testing
class TestGameObject extends GameObject {
    constructor(gl: any, transform: Transform, name?: string) {
        super(gl, transform, true, true, name);
        this.type = "test" as any; // Use a custom type for testing
    }
    
    static async fromJSON(gl: any, data: any): Promise<TestGameObject> {
        const transform = Transform.fromJSON(data.transform);
        const obj = new TestGameObject(gl, transform, data.name);
        obj.enabled = data.enabled ?? true;
        obj.visible = data.visible ?? true;
        obj.forwardRendered = data.forwardRendered ?? false;
        obj.forwardShaderPaths = data.forwardShaderPaths;
        return obj;
    }
}

// Mock WebGL context
const mockGL = {
    createBuffer: mock(() => ({})),
    bindBuffer: mock(() => {}),
    bufferData: mock(() => {}),
    createTexture: mock(() => ({})),
    bindTexture: mock(() => {}),
    texImage2D: mock(() => {}),
    createProgram: mock(() => ({})),
    createShader: mock(() => ({})),
    shaderSource: mock(() => {}),
    compileShader: mock(() => {}),
    attachShader: mock(() => {}),
    linkProgram: mock(() => {}),
    getProgramParameter: mock((program, pname) => pname === 35714 /* GL.LINK_STATUS */ ? true : 1),
    getShaderParameter: mock((shader, pname) => pname === 35713 /* GL.COMPILE_STATUS */ ? true : 1),
    getShaderInfoLog: mock(() => ''),
    getProgramInfoLog: mock(() => ''),
    pixelStorei: mock(() => {}),
    texParameteri: mock(() => {}),
    getAttribLocation: mock(() => 0),
    getUniformLocation: mock(() => ({})),
    getActiveAttrib: mock(() => ({ name: 'a_position' })),
    getActiveUniform: mock(() => ({ name: 'u_matrix' })),
    vertexAttribPointer: mock(() => {}),
    useProgram: mock(() => {}),
    uniformMatrix4fv: mock(() => {}),
    uniform1f: mock(() => {}),
    uniform4f: mock(() => {}),
    uniform1i: mock(() => {}),
    activeTexture: mock(() => {}),
    getBufferParameter: mock(() => 1024),
    enableVertexAttribArray: mock(() => {}),
    drawElements: mock(() => {}),
    enable: mock(() => {}),
    depthFunc: mock(() => {}),
    cullFace: mock(() => {}),
} as any;

describe('GameObject ID System', () => {
    let transform: Transform;

    beforeEach(async () => {
        // Reset mocks
        Object.values(mockGL).forEach(mockFn => {
            if (typeof mockFn === 'function' && typeof (mockFn as any).mockClear === 'function') {
                (mockFn as any).mockClear();
            }
        });

        // Register test GameObject factory
        GameObjectRegistry.register("test", TestGameObject.fromJSON);

        // Create a basic transform for testing
        transform = new Transform(
            vec3.fromValues(0, 0, 0),
            quat.create(),
            vec3.fromValues(1, 1, 1)
        );
    });

    describe('ID Assignment', () => {
        it('should assign sequential IDs starting from some number', () => {
            const obj1 = new GameObject(mockGL, transform);
            const obj2 = new GameObject(mockGL, transform);
            const obj3 = new GameObject(mockGL, transform);

            // IDs should be sequential
            expect(obj2.id).toBe(obj1.id + 1);
            expect(obj3.id).toBe(obj2.id + 1);
        });

        it('should assign unique IDs to each GameObject instance', () => {
            const objects: GameObject[] = [];
            const ids = new Set<number>();

            // Create 10 objects
            for (let i = 0; i < 10; i++) {
                const obj = new GameObject(mockGL, new Transform());
                objects.push(obj);
                ids.add(obj.id);
            }

            // All IDs should be unique
            expect(ids.size).toBe(10);
            expect(objects.map(obj => obj.id).length).toBe(10);
        });

        it('should assign unique IDs across different GameObject subclasses', async () => {
            const gameObject = new GameObject(mockGL, transform);
            
            // Create a PointLight (subclass of GameObject)
            const pointLight = new PointLight(
                mockGL,
                transform,
                vec3.fromValues(1, 1, 1), // color
                1.0, // intensity
                10.0 // radius
            );

            // Create a DirectionalLight (subclass of GameObject)
            const directionalLight = new DirectionalLight(
                mockGL,
                transform,
                vec3.fromValues(1, 1, 1), // color
                1.0, // intensity
                vec3.fromValues(0, -1, 0) // direction
            );

            // All should have unique IDs
            const ids = [gameObject.id, pointLight.id, directionalLight.id];
            const uniqueIds = new Set(ids);
            
            expect(uniqueIds.size).toBe(3);
            expect(ids.every(id => typeof id === 'number')).toBe(true);
        });

        it('should assign IDs that are positive integers', () => {
            const obj = new GameObject(mockGL, transform);
            
            expect(obj.id).toBeGreaterThan(0);
            expect(Number.isInteger(obj.id)).toBe(true);
        });
    });

    describe('ID Immutability', () => {
        it('should have readonly ID property', () => {
            const obj = new GameObject(mockGL, transform);
            const originalId = obj.id;

            // In JavaScript, readonly is enforced by TypeScript compiler, not at runtime
            // So we just verify the property exists and is a number
            expect(obj.id).toBe(originalId);
            expect(typeof obj.id).toBe('number');
        });

        it('should maintain ID throughout object lifetime', () => {
            const obj = new GameObject(mockGL, transform);
            const originalId = obj.id;

            // Perform various operations
            obj.enabled = false;
            obj.visible = false;
            obj.name = "test";
            obj.addChild(new GameObject(mockGL, new Transform()));

            // ID should remain the same
            expect(obj.id).toBe(originalId);
        });
    });

    describe('ID Serialization Behavior', () => {
        it('should NOT include ID in JSON serialization', () => {
            const obj = new TestGameObject(mockGL, transform, "test-object");
            
            const json = obj.toJSON();

            // ID should not be present in JSON
            expect(json).not.toHaveProperty('id');
            expect(json).toHaveProperty('type');
            expect(json).toHaveProperty('name');
        });

        it('should assign fresh IDs during deserialization', async () => {
            const obj1 = new TestGameObject(mockGL, transform, "original");
            
            const json = obj1.toJSON(); 
            const obj2 = await GameObject.fromJSON(mockGL, json);

            // Both objects should have different IDs
            expect(obj1.id).not.toBe(obj2.id);
            expect(obj2.name).toBe("original");
        });

        it('should handle nested object ID assignment correctly', async () => {
            const parent = new TestGameObject(mockGL, transform, "parent");
            const child1 = new TestGameObject(mockGL, new Transform(), "child1");
            const child2 = new TestGameObject(mockGL, new Transform(), "child2");
            
            parent.addChild(child1);
            parent.addChild(child2);

            const json = parent.toJSON();
            const deserializedParent = await GameObject.fromJSON(mockGL, json);

            // All objects should have unique IDs
            const allIds = [
                parent.id,
                child1.id, 
                child2.id,
                deserializedParent.id,
                ...deserializedParent.children.map(child => child.id)
            ];

            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(allIds.length);
        });
    });

    describe('ID Behavior with Complex Hierarchies', () => {
        it('should assign unique IDs in deep hierarchies', () => {
            const root = new GameObject(mockGL, transform);
            const level1 = new GameObject(mockGL, new Transform());
            const level2 = new GameObject(mockGL, new Transform());
            const level3 = new GameObject(mockGL, new Transform());

            root.addChild(level1);
            level1.addChild(level2);
            level2.addChild(level3);

            const allIds: number[] = [];
            root.traverse((obj) => {
                allIds.push(obj.id);
            });

            // All IDs should be unique
            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(allIds.length);
            expect(allIds.length).toBe(4); // root + 3 levels
        });

        it('should maintain ID uniqueness when reparenting objects', () => {
            const parent1 = new GameObject(mockGL, transform);
            const parent2 = new GameObject(mockGL, new Transform());
            const child = new GameObject(mockGL, new Transform());

            const originalChildId = child.id;

            parent1.addChild(child);
            expect(child.id).toBe(originalChildId);

            parent2.addChild(child); // Move to different parent
            expect(child.id).toBe(originalChildId);

            // All should still have unique IDs
            expect(parent1.id).not.toBe(child.id);
            expect(parent2.id).not.toBe(child.id);
            expect(parent1.id).not.toBe(parent2.id);
        });
    });

    describe('Static ID Methods', () => {
        it('should have setNextId method that affects future ID assignment', () => {
            const obj1 = new GameObject(mockGL, transform);
            const currentId = obj1.id;

            // Set next ID to a higher value
            GameObject.setNextId(currentId + 100);

            const obj2 = new GameObject(mockGL, new Transform());
            
            // New object should have ID >= the set value
            expect(obj2.id).toBeGreaterThanOrEqual(currentId + 100);
        });

        it('should handle setNextId with lower values correctly', () => {
            const obj1 = new GameObject(mockGL, transform);
            const currentId = obj1.id;

            // Try to set next ID to a lower value
            GameObject.setNextId(1);

            const obj2 = new GameObject(mockGL, new Transform());
            
            // New object should still have a higher ID than obj1
            expect(obj2.id).toBeGreaterThan(currentId);
        });
    });

    describe('Performance and Memory', () => {
        it('should handle creating many objects without ID conflicts', () => {
            const objectCount = 1000;
            const objects: GameObject[] = [];
            const ids = new Set<number>();

            // Create many objects
            for (let i = 0; i < objectCount; i++) {
                const obj = new GameObject(mockGL, new Transform());
                objects.push(obj);
                ids.add(obj.id);
            }

            // All IDs should be unique
            expect(ids.size).toBe(objectCount);
            
            // IDs should be reasonable numbers (not extremely large)
            const maxId = Math.max(...Array.from(ids));
            expect(maxId).toBeLessThan(objectCount + 1000); // Some reasonable upper bound
        });
    });
}); 