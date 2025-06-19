import { parseObj } from '../../../../static/src/bits/obj';
import { describe, it, expect, beforeEach, mock } from 'bun:test';

describe('OBJ Parser', () => {
    beforeEach(() => {
        // Reset fetch mock before each test
        // Bun doesn't have a direct equivalent to vi.clearAllMocks()
    });

    describe('parseObj', () => {
        it('should parse a simple cube OBJ file', async () => {
            const mockContent = `
v 0 0 0
v 1 0 0
v 0 1 0
f 1 2 3
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.vertexData).toBeInstanceOf(Float32Array);
            expect(defaultGroup.indices).toBeInstanceOf(Uint32Array);
            expect(defaultGroup.material).toBeNull();
        });

        it('should handle MTL files with texture maps', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl test
f 1 2 3
`;
            const mockMtlContent = `
newmtl test
Ka 0.1 0.1 0.1
Kd 0.5 0.5 0.5
Ks 0.8 0.8 0.8
Ns 96.0
d 0
illum 2
map_Kd texture.png
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.material).toBeDefined();
            expect(defaultGroup.material?.ambient).toBeDefined();
            expect(defaultGroup.material?.diffuse).toBeDefined();
            expect(defaultGroup.material?.specular).toBeDefined();
            expect(defaultGroup.material?.specularExponent).toBe(96.0);
            expect(defaultGroup.material?.transparency).toBe(0);
            expect(defaultGroup.material?.illuminationMode).toBe(2);
            expect(defaultGroup.material?.map_diffuse?.source).toContain('texture.png');
        });

        it('should handle multiple materials in a single OBJ file', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl material1
f 1 2 3
usemtl material2
f 1 3 2
`;
            const mockMtlContent = `
newmtl material1
Kd 1 0 0
newmtl material2
Kd 0 0 1
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const groups = Object.values(defaultObj.groups);
            expect(groups.length).toBe(2);
            expect(groups[0].material?.diffuse).toEqual(expect.any(Object));
            expect(Array.from(groups[0].material!.diffuse!)).toEqual([1, 0, 0]);
            expect(Array.from(groups[1].material!.diffuse!)).toEqual([0, 0, 1]);
        });

        it('should handle scientific notation in material properties', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl test
f 1 2 3
`;
            const mockMtlContent = `
newmtl test
Ka 1.0e-1 1.0e-1 1.0e-1
Kd 5.0e-1 5.0e-1 5.0e-1
Ks 8.0e-1 8.0e-1 8.0e-1
Ns 4.8e1
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.material).toBeDefined();
            expect(defaultGroup.material?.ambient).toBeDefined();
            expect(defaultGroup.material?.diffuse).toBeDefined();
            expect(defaultGroup.material?.specular).toBeDefined();
            expect(defaultGroup.material?.specularExponent).toBe(48.0);
        });

        it('should handle missing values in material properties', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl test
f 1 2 3
`;
            const mockMtlContent = `
newmtl test
Ka
Kd 0.5
Ks 0.8 0.8
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.material).toBeDefined();
                        expect(Array.from(defaultGroup.material!.ambient!)).toEqual(expect.arrayContaining([
                expect.closeTo(0.2, 2),
                expect.closeTo(0.2, 2),
                expect.closeTo(0.2, 2)
            ])); // Default values
            expect(Array.from(defaultGroup.material!.diffuse!)).toEqual([0.5, 0.5, 0.5]); // Single value expanded
            expect(Array.from(defaultGroup.material!.specular!)).toEqual(expect.arrayContaining([
                expect.closeTo(0.8, 2),
                expect.closeTo(0.8, 2),
                expect.closeTo(0.8, 2)
            ])); // Two values, third defaulted
        });

        it('should handle transparency with d directive', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl test
f 1 2 3
`;
            const mockMtlContent = `
newmtl test
d 0.5
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.material).toBeDefined();
            expect(defaultGroup.material?.transparency).toBe(0.5);
        });

        it('should handle multiple texture maps', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl test
f 1 2 3
`;
            const mockMtlContent = `
newmtl test
map_Ka ambient.png
map_Kd diffuse.png
map_Ks specular.png
map_Ns specular_exponent.png
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.material).toBeDefined();
            expect(defaultGroup.material?.map_ambient?.source).toContain('ambient.png');
            expect(defaultGroup.material?.map_diffuse?.source).toContain('diffuse.png');
            expect(defaultGroup.material?.map_specular?.source).toContain('specular.png');
            expect(defaultGroup.material?.map_specularExponent?.source).toContain('specular_exponent.png');
        });

        it('should handle negative indices in face definitions', async () => {
            const mockContent = `
v 0 0 0
v 1 0 0
v 0 1 0
f -3 -2 -1
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.indices.length).toBe(3);
            expect(defaultGroup.indices[0]).toBe(0);
            expect(defaultGroup.indices[1]).toBe(1);
            expect(defaultGroup.indices[2]).toBe(2);
        });

        it('should handle relative indices in face definitions', async () => {
            const mockContent = `
v 0 0 0
v 1 0 0
v 0 1 0
f -3 -2 -1
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.indices.length).toBe(3);
            expect(defaultGroup.indices[0]).toBe(0);
            expect(defaultGroup.indices[1]).toBe(1);
            expect(defaultGroup.indices[2]).toBe(2);
        });

        it('should handle multiple triangle faces', async () => {
            const mockContent = `
v 0 0 0
v 1 0 0
v 0 1 0
v 1 1 0
f 1 2 3
f 2 4 3
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.indices.length).toBe(6); // 6 indices for two triangles
        });

        it('should handle object size normalization', async () => {
            const mockContent = `
v -10 0 0
v 10 0 0
v 0 10 0
f 1 2 3
`;
            const result = await parseObj('test.obj', { mockContent, normalizeSize: true });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            const vertexData = defaultGroup.vertexData;
            // Check that vertices are normalized to fit in a unit cube
            for (let i = 0; i < vertexData.length; i += 8) {
                expect(vertexData[i]).toBeGreaterThanOrEqual(-0.5);
                expect(vertexData[i]).toBeLessThanOrEqual(0.5);
                expect(vertexData[i + 1]).toBeGreaterThanOrEqual(-0.5);
                expect(vertexData[i + 1]).toBeLessThanOrEqual(0.5);
                expect(vertexData[i + 2]).toBeGreaterThanOrEqual(-0.5);
                expect(vertexData[i + 2]).toBeLessThanOrEqual(0.5);
            }
        });

        it('should handle line continuations in OBJ files', async () => {
            const mockContent = `
v 0 0 0 \
1 0 0 \
0 1 0
f 1 2 3
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.indices.length).toBe(3); // One triangle
        });

        it('should handle missing vertex components', async () => {
            const mockContent = `
v 0
v 1 0
v 0 1 0
f 1 2 3
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.indices.length).toBe(3);
            expect(defaultGroup.indices[0]).toBe(0);
            expect(defaultGroup.indices[1]).toBe(1);
            expect(defaultGroup.indices[2]).toBe(2);
        });

        it('should handle material texture maps with options', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl test
f 1 2 3
`;
            const mockMtlContent = `
newmtl test
map_Kd -blendu on -blendv off -boost 2.0 texture.png
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.material).not.toBeNull();
            expect(defaultGroup.material?.map_diffuse).toBeDefined();
            expect(defaultGroup.material?.map_diffuse?.blendu).toBe(true);
            expect(defaultGroup.material?.map_diffuse?.blendv).toBe(false);
            expect(defaultGroup.material?.map_diffuse?.boost).toBe(2.0);
        });

        it('should handle illumination modes', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl test
f 1 2 3
`;
            const mockMtlContent = `
newmtl test
illum 2
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.material).not.toBeNull();
            expect(defaultGroup.material?.illuminationMode).toBe(2);
        });

        it('should handle transparency with Tr directive', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl test
f 1 2 3
`;
            const mockMtlContent = `
newmtl test
d 0.3
Tr 0.7
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const defaultGroup = defaultObj.groups['default'];
            expect(defaultGroup).toBeDefined();
            expect(defaultGroup.material).not.toBeNull();
            expect(defaultGroup.material?.transparency).toBe(0.7); // Tr should override d
        });

        it('should handle materials per object and group', async () => {
            const mockObjContent = `
v 0 0 0
v 1 0 0
v 0 1 0
mtllib test.mtl
usemtl red
o cube1
g front
f 1 2 3
g back
usemtl blue
f 1 3 2
o cube2
usemtl green
g top
f 1 2 3
g bottom
usemtl yellow
f 1 3 2
`;
            const mockMtlContent = `
newmtl red
Kd 1 0 0
newmtl blue
Kd 0 0 1
newmtl green
Kd 0 1 0
newmtl yellow
Kd 1 1 0
`;
            const result = await parseObj('test.obj', { 
                mockContent: mockObjContent,
                mockMtlContent: mockMtlContent 
            });

            // Check that we have the correct number of objects
            expect(Object.keys(result.objects).length).toBe(2); // cube1, cube2

            // Check cube1
            const cube1 = result.objects['cube1'];
            expect(cube1).toBeDefined();
            expect(Object.keys(cube1.groups).length).toBe(2); // front, back
            expect(Array.from(cube1.groups['front'].material!.diffuse!)).toEqual([1, 0, 0]);
            expect(Array.from(cube1.groups['back'].material!.diffuse!)).toEqual([0, 0, 1]);
            expect(cube1.groups['front'].indices.length).toBe(3);
            expect(cube1.groups['back'].indices.length).toBe(3);

            // Check cube2
            const cube2 = result.objects['cube2'];
            expect(cube2).toBeDefined();
            expect(Object.keys(cube2.groups).length).toBe(2); // top, bottom
            expect(Array.from(cube2.groups['top'].material!.diffuse!)).toEqual([0, 1, 0]);
            expect(Array.from(cube2.groups['bottom'].material!.diffuse!)).toEqual([1, 1, 0]);
            expect(cube2.groups['top'].indices.length).toBe(3);
            expect(cube2.groups['bottom'].indices.length).toBe(3);
        });

        it('should handle smoothing groups', async () => {
            const mockContent = `
v 0 0 0
v 1 0 0
v 0 1 0
v 1 1 0
# First triangle with smoothing group 1
s 1
f 1 2 3
# Second triangle with smoothing group 2
s 2
f 2 4 3
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const groups = Object.values(defaultObj.groups);
            expect(groups.length).toBe(2);
            
            // First group should have vertices from first triangle
            expect(groups[0].vertexData.length).toBe(24); // 3 vertices * 8 components
            expect(groups[0].indices.length).toBe(3);
            
            // Second group should have vertices from second triangle
            expect(groups[1].vertexData.length).toBe(24); // 3 vertices * 8 components
            expect(groups[1].indices.length).toBe(3);
            
            // Verify that normals are calculated correctly for each group
            // First triangle should have normals pointing up
            expect(groups[0].vertexData[3]).toBeCloseTo(0, 5); // nx
            expect(groups[0].vertexData[4]).toBeCloseTo(0, 5); // ny
            expect(groups[0].vertexData[5]).toBeCloseTo(1, 5); // nz
            
            // Second triangle should have normals pointing up
            expect(groups[1].vertexData[3]).toBeCloseTo(0, 5); // nx
            expect(groups[1].vertexData[4]).toBeCloseTo(0, 5); // ny
            expect(groups[1].vertexData[5]).toBeCloseTo(1, 5); // nz
        });

        it('should handle off smoothing group', async () => {
            const mockContent = `
v 0 0 0
v 1 0 0
v 0 1 0
v 1 1 0
# First triangle with smoothing
s 1
f 1 2 3
# Second triangle without smoothing
s off
f 2 4 3
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const groups = Object.values(defaultObj.groups);
            expect(groups.length).toBe(2);
            
            // First group should have vertices from first triangle
            expect(groups[0].vertexData.length).toBe(24); // 3 vertices * 8 components
            expect(groups[0].indices.length).toBe(3);
            
            // Second group should have vertices from second triangle
            expect(groups[1].vertexData.length).toBe(24); // 3 vertices * 8 components
            expect(groups[1].indices.length).toBe(3);
            
            // Verify that normals are calculated correctly for each group
            // First triangle should have normals pointing up (smoothed)
            expect(groups[0].vertexData[3]).toBeCloseTo(0, 5); // nx
            expect(groups[0].vertexData[4]).toBeCloseTo(0, 5); // ny
            expect(groups[0].vertexData[5]).toBeCloseTo(1, 5); // nz
            
            // Second triangle should have face normals (not smoothed)
            expect(groups[1].vertexData[3]).toBeCloseTo(0, 5); // nx
            expect(groups[1].vertexData[4]).toBeCloseTo(0, 5); // ny
            expect(groups[1].vertexData[5]).toBeCloseTo(1, 5); // nz
        });

        it('should calculate shared vertex normals for smoothing groups', async () => {
            const mockContent = `
# A cube with shared vertices and smoothing
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 1.0 1.0 0.0
v 0.0 1.0 0.0
v 0.0 0.0 1.0
v 1.0 0.0 1.0
v 1.0 1.0 1.0
v 0.0 1.0 1.0
s 1
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const groups = Object.values(defaultObj.groups);
            
            // Should have one group since all faces are in the same smoothing group
            expect(groups.length).toBe(1);
            const group = groups[0];
            
            // Get all vertices that share position (0,0,0)
            const sharedVertices: { normal: number[] }[] = [];
            for (let i = 0; i < group.vertexData.length; i += 8) {
                if (Math.abs(group.vertexData[i]) < 0.001 && 
                    Math.abs(group.vertexData[i+1]) < 0.001 && 
                    Math.abs(group.vertexData[i+2]) < 0.001) {
                    sharedVertices.push({
                        normal: [
                            group.vertexData[i+3],
                            group.vertexData[i+4],
                            group.vertexData[i+5]
                        ]
                    });
                }
            }
            
            // Should have multiple vertices at (0,0,0)
            expect(sharedVertices.length).toBeGreaterThan(1);
            
            // All normals should be approximately equal (averaged)
            const firstNormal = sharedVertices[0].normal;
            for (let i = 1; i < sharedVertices.length; i++) {
                expect(sharedVertices[i].normal[0]).toBeCloseTo(firstNormal[0], 5);
                expect(sharedVertices[i].normal[1]).toBeCloseTo(firstNormal[1], 5);
                expect(sharedVertices[i].normal[2]).toBeCloseTo(firstNormal[2], 5);
            }
            
            // The normal should be normalized
            const length = Math.sqrt(
                firstNormal[0] * firstNormal[0] +
                firstNormal[1] * firstNormal[1] +
                firstNormal[2] * firstNormal[2]
            );
            expect(length).toBeCloseTo(1.0, 5);
        });

        it('should handle mixed smoothing groups correctly', async () => {
            const mockContent = `
# A cube with mixed smoothing
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 1.0 1.0 0.0
v 0.0 1.0 0.0
v 0.0 0.0 1.0
v 1.0 0.0 1.0
v 1.0 1.0 1.0
v 0.0 1.0 1.0
s 1
f 1 2 3
f 1 3 4
s off
f 5 6 7
f 5 7 8
s 1
f 1 2 6
f 1 6 5
f 2 3 7
f 2 7 6
f 3 4 8
f 3 8 7
f 4 1 5
f 4 5 8
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const group = defaultObj.groups['default'];
            expect(group.vertexData.length).toBe(24 * 8); // 24 vertices (8 faces * 3 vertices) * 8 components per vertex
            expect(group.indices.length).toBe(24); // 8 faces * 3 indices per triangle

            // Check if vertices in the same smoothing group and at the same position share the same normal
            const vertexNormals = new Map<string, number[]>();
            for (let i = 0; i < group.vertexData.length; i += 8) {
                const pos = [
                    group.vertexData[i],
                    group.vertexData[i + 1],
                    group.vertexData[i + 2]
                ];
                const normal = [
                    group.vertexData[i + 3],
                    group.vertexData[i + 4],
                    group.vertexData[i + 5]
                ];
                const posKey = pos.map(v => v.toFixed(5)).join(',');
                if (!vertexNormals.has(posKey)) {
                    vertexNormals.set(posKey, normal);
                } else {
                    const existingNormal = vertexNormals.get(posKey)!;
                    expect(normal[0]).toBeCloseTo(existingNormal[0], 5);
                    expect(normal[1]).toBeCloseTo(existingNormal[1], 5);
                    expect(normal[2]).toBeCloseTo(existingNormal[2], 5);
                }
            }
            // Verify all normals are normalized
            for (const normal of vertexNormals.values()) {
                const length = Math.sqrt(
                    normal[0] * normal[0] +
                    normal[1] * normal[1] +
                    normal[2] * normal[2]
                );
                expect(length).toBeCloseTo(1.0, 5);
            }
        });

        it('should handle shared vertices and smoothed normals correctly', async () => {
            const mockContent = `
# A cube with shared vertices and smoothing
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 1.0 1.0 0.0
v 0.0 1.0 0.0
v 0.0 0.0 1.0
v 1.0 0.0 1.0
v 1.0 1.0 1.0
v 0.0 1.0 1.0
s 1
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;
            const result = await parseObj('test.obj', { mockContent });
            const defaultObj = result.objects['default'];
            expect(defaultObj).toBeDefined();
            const group = defaultObj.groups['default'];
            expect(group.vertexData.length).toBe(24 * 8); // 24 vertices (6 faces * 4 vertices) * 8 components per vertex
            expect(group.indices.length).toBe(36); // 6 faces * 2 triangles * 3 indices per triangle

            // Check if vertices at the same position share the same normal
            const vertexNormals = new Map<string, number[]>();
            for (let i = 0; i < group.vertexData.length; i += 8) {
                const pos = [
                    group.vertexData[i],
                    group.vertexData[i + 1],
                    group.vertexData[i + 2]
                ];
                const normal = [
                    group.vertexData[i + 3],
                    group.vertexData[i + 4],
                    group.vertexData[i + 5]
                ];
                const posKey = pos.map(v => v.toFixed(5)).join(',');
                if (!vertexNormals.has(posKey)) {
                    vertexNormals.set(posKey, normal);
                } else {
                    const existingNormal = vertexNormals.get(posKey)!;
                    expect(normal[0]).toBeCloseTo(existingNormal[0], 5);
                    expect(normal[1]).toBeCloseTo(existingNormal[1], 5);
                    expect(normal[2]).toBeCloseTo(existingNormal[2], 5);
                }
            }

            // Verify all normals are normalized
            for (const normal of vertexNormals.values()) {
                const length = Math.sqrt(
                    normal[0] * normal[0] +
                    normal[1] * normal[1] +
                    normal[2] * normal[2]
                );
                expect(length).toBeCloseTo(1.0, 5);
            }
        });

        it('should parse vertex positions correctly', async () => {
            const mockContent = `
v 1.0 2.0 3.0
v 4.0 5.0 6.0
v 7.0 8.0 9.0
v 10.0 11.0 12.0
f 1 2 3 4
`;

            const result = await parseObj('test.obj', { mockContent });

            // Check that we have one object with one group
            expect(Object.keys(result.objects)).toHaveLength(1);
            const obj = result.objects['default'];
            expect(Object.keys(obj.groups)).toHaveLength(1);
            const group = obj.groups['default'];

            // Check vertex data structure (8 components per vertex: x,y,z,nx,ny,nz,u,v)
            expect(group.vertexData.length).toBe(4 * 8); // 4 vertices * 8 components

            // Check position values for each vertex
            const checkVertex = (index: number, expectedX: number, expectedY: number, expectedZ: number) => {
                const baseIndex = index * 8; // Each vertex has 8 components
                expect(group.vertexData[baseIndex]).toBeCloseTo(expectedX, 5);     // x
                expect(group.vertexData[baseIndex + 1]).toBeCloseTo(expectedY, 5); // y
                expect(group.vertexData[baseIndex + 2]).toBeCloseTo(expectedZ, 5); // z
            };

            // Verify each vertex position matches the input
            checkVertex(0, 1.0, 2.0, 3.0);  // First vertex
            checkVertex(1, 4.0, 5.0, 6.0);  // Second vertex
            checkVertex(2, 7.0, 8.0, 9.0);  // Third vertex
            checkVertex(3, 10.0, 11.0, 12.0); // Fourth vertex

            // Verify indices form a quad
            expect(Array.from(group.indices)).toEqual([0, 1, 2, 0, 2, 3]);
        });

        it('should handle specular exponent (Ns) values correctly', async () => {
            const mockMtl = `
newmtl test_material
Ns 96.0
Kd 1.0 0.0 0.0
            `;

            const result = await parseObj('test.obj', {
                mockContent: 'v 0 0 0\nf 1 1 1',
                mockMtlContent: mockMtl
            });

            const defaultGroup = Object.values(Object.values(result.objects)[0].groups)[0];
            expect(defaultGroup.material?.specularExponent).toBe(96.0);
        });

        it('should handle invalid specular exponent values', async () => {
            const mockMtl = `
newmtl test_material
Ns invalid
Kd 1.0 0.0 0.0
            `;

            const result = await parseObj('test.obj', {
                mockContent: 'v 0 0 0\nf 1 1 1',
                mockMtlContent: mockMtl
            });

            const defaultGroup = Object.values(Object.values(result.objects)[0].groups)[0];
            expect(defaultGroup.material?.specularExponent).toBe(64.0); // Default value
        });

        it('should handle negative specular exponent values', async () => {
            const mockMtl = `
newmtl test_material
Ns -48.0
Kd 1.0 0.0 0.0
            `;

            const result = await parseObj('test.obj', {
                mockContent: 'v 0 0 0\nf 1 1 1',
                mockMtlContent: mockMtl
            });

            const defaultGroup = Object.values(Object.values(result.objects)[0].groups)[0];
            expect(defaultGroup.material?.specularExponent).toBe(64.0); // Default value
        });

        it('should handle missing specular exponent', async () => {
            const mockMtl = `
newmtl test_material
Kd 1.0 0.0 0.0
            `;

            const result = await parseObj('test.obj', {
                mockContent: 'v 0 0 0\nf 1 1 1',
                mockMtlContent: mockMtl
            });

            const defaultGroup = Object.values(Object.values(result.objects)[0].groups)[0];
            expect(defaultGroup.material?.specularExponent).toBeUndefined();
        });
    });
}); 