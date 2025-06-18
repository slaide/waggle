import { describe, test, expect } from "bun:test";
import { GameObject } from "../../../../static/src/scene/gameobject";
import { Transform } from "../../../../static/src/scene/transform";
import { vec3, quat } from "gl-matrix";

// Simple mock GL context - just enough to create GameObjects
const mockGL = {} as WebGL2RenderingContext;

describe("Forward Rendering Nested Objects", () => {
    test("should correctly set and get forward rendering flag", () => {
        const transform = new Transform();
        const obj = new GameObject(mockGL, transform, true, true, "TestObject");
        
        // Default should be false
        expect(obj.forwardRendered).toBe(false);
        
        // Should be able to set to true
        obj.forwardRendered = true;
        expect(obj.forwardRendered).toBe(true);
        
        // Should be able to set back to false
        obj.forwardRendered = false;
        expect(obj.forwardRendered).toBe(false);
    });

    test("should serialize forward rendering flag in JSON", () => {
        const transform = new Transform();
        const obj = new GameObject(mockGL, transform, true, true, "TestObject");
        
        // Test with forwardRendered = false
        obj.forwardRendered = false;
        let json = obj.toJSON();
        expect(json.forwardRendered).toBe(false);
        
        // Test with forwardRendered = true
        obj.forwardRendered = true;
        json = obj.toJSON();
        expect(json.forwardRendered).toBe(true);
    });

    test("should handle forward shader paths", () => {
        const transform = new Transform();
        const obj = new GameObject(mockGL, transform, true, true, "TestObject");
        
        // Default should be undefined
        expect(obj.forwardShaderPaths).toBeUndefined();
        
        // Should be able to set custom paths
        const customPaths = { vs: "custom.vert", fs: "custom.frag" };
        obj.forwardShaderPaths = customPaths;
        expect(obj.forwardShaderPaths).toEqual(customPaths);
        
        // Should serialize in JSON
        const json = obj.toJSON();
        expect(json.forwardShaderPaths).toEqual(customPaths);
    });

    test("should maintain forward rendering flag in nested hierarchy", () => {
        // Create parent with forward rendering disabled
        const parentTransform = new Transform();
        const parent = new GameObject(mockGL, parentTransform, true, true, "Parent");
        parent.forwardRendered = false;
        
        // Create child with forward rendering enabled
        const childTransform = new Transform();
        const child = new GameObject(mockGL, childTransform, true, true, "Child");
        child.forwardRendered = true;
        
        // Add child to parent
        parent.addChild(child);
        
        // Verify flags are maintained independently
        expect(parent.forwardRendered).toBe(false);
        expect(child.forwardRendered).toBe(true);
        
        // Verify hierarchy is correct
        expect(parent.children).toHaveLength(1);
        expect(child.parent).toBe(parent);
    });

    test("should serialize nested forward rendering flags correctly", () => {
        // Create nested hierarchy with mixed forward rendering flags
        const parentTransform = new Transform();
        const parent = new GameObject(mockGL, parentTransform, true, true, "Parent");
        parent.forwardRendered = false;
        
        const childTransform = new Transform();
        const child = new GameObject(mockGL, childTransform, true, true, "Child");
        child.forwardRendered = true;
        
        const grandchildTransform = new Transform();
        const grandchild = new GameObject(mockGL, grandchildTransform, true, true, "Grandchild");
        grandchild.forwardRendered = false;
        
        // Build hierarchy
        parent.addChild(child);
        child.addChild(grandchild);
        
        // Serialize
        const json = parent.toJSON();
        
        // Verify serialization
        expect(json.forwardRendered).toBe(false);
        expect(json.children).toBeDefined();
        expect(json.children).toHaveLength(1);
        expect(json.children![0].forwardRendered).toBe(true);
        expect(json.children![0].children).toBeDefined();
        expect(json.children![0].children).toHaveLength(1);
        expect(json.children![0].children![0].forwardRendered).toBe(false);
    });
}); 