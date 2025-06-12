import { describe, test, expect } from 'vitest';
import {makeStruct, makeUnion, TYPE_REGISTRY, Field} from "./struct";

describe('Struct', () => {
    describe('primitive types', () => {
        test('primitive type size f32',()=>{
            expect(TYPE_REGISTRY["f32"].sizeof).toBe(4);
        });
        test('primitive type size f64',()=>{
            expect(TYPE_REGISTRY["f64"].sizeof).toBe(8);
        });
        test('primitive type size i8',()=>{
            expect(TYPE_REGISTRY["i8"].sizeof).toBe(1);
        });
        test('primitive type size i16',()=>{
            expect(TYPE_REGISTRY["i16"].sizeof).toBe(2);
        });
        test('primitive type size i32',()=>{
            expect(TYPE_REGISTRY["i32"].sizeof).toBe(4);
        });
        test('primitive type size u8',()=>{
            expect(TYPE_REGISTRY["u8"].sizeof).toBe(1);
        });
        test('primitive type size u16',()=>{
            expect(TYPE_REGISTRY["u16"].sizeof).toBe(2);
        });
        test('primitive type size u32',()=>{
            expect(TYPE_REGISTRY["u32"].sizeof).toBe(4);
        });
    });

    describe('structs', () => {
        test('assign to fields', () => {
            const Vec3=makeStruct([
                {name:"x",type:TYPE_REGISTRY["f32"]},
                {name:"y",type:TYPE_REGISTRY["f32"]},
                {name:"z",type:TYPE_REGISTRY["f32"]},
            ]);
            const myvec=Vec3();
            myvec.x=2.0;
            myvec.y=3.0;
            myvec.z=0.1;
        });

        test('read value written to fields', () => {
            const Vec3=makeStruct([
                {name:"x",type:TYPE_REGISTRY["f32"]},
                {name:"y",type:TYPE_REGISTRY["f32"]},
                {name:"z",type:TYPE_REGISTRY["f32"]},
            ]);
            const myvec=Vec3();
            myvec.x=2.0;
            myvec.y=3.0;
            myvec.z=0.1;

            expect(myvec.x).toBeCloseTo(2.0,5);
            expect(myvec.y).toBeCloseTo(3.0,5);
            expect(myvec.z).toBeCloseTo(0.1,5);
        });

        test('struct size should match', () => {
            const Vec3=makeStruct([
                {name:"x",type:TYPE_REGISTRY["f32"]},
                {name:"y",type:TYPE_REGISTRY["f32"]},
                {name:"z",type:TYPE_REGISTRY["f32"]},
            ]);
            const myvec=Vec3();
            expect(Vec3.sizeof).toBe(3*4);
        });

        test('nested struct types', () => {
            // Create Point type with x,y coordinates
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            // Create Line type with two points
            const Line = makeStruct([
                {name: "start", type: Point},
                {name: "end", type: Point}
            ]);

            // Create a line and set values
            const line = Line();
            line.start.x = 1.0;
            line.start.y = 2.0;
            line.end.x = 3.0;
            line.end.y = 4.0;

            // Verify all values are set correctly
            expect(line.start.x).toBeCloseTo(1.0, 5);
            expect(line.start.y).toBeCloseTo(2.0, 5);
            expect(line.end.x).toBeCloseTo(3.0, 5);
            expect(line.end.y).toBeCloseTo(4.0, 5);
        });

        test('nested struct assignment with arrays', () => {
            // Create Point type
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            // Create Polygon type with array of points
            const Polygon = makeStruct([
                {name: "points", type: Point.array(3)}
            ]);

            // Create a polygon and set values
            const polygon = Polygon();
            polygon.points[0].x = 1.0;
            polygon.points[0].y = 2.0;
            polygon.points[1].x = 3.0;
            polygon.points[1].y = 4.0;
            polygon.points[2].x = 5.0;
            polygon.points[2].y = 6.0;

            // Create a new point and assign it to the first point in the array
            const newPoint = Point();
            newPoint.x = 7.0;
            newPoint.y = 8.0;
            polygon.points[0] = newPoint;

            // Verify the new point was assigned correctly
            expect(polygon.points[0].x).toBeCloseTo(7.0, 5);
            expect(polygon.points[0].y).toBeCloseTo(8.0, 5);
            // Other points should be unchanged
            expect(polygon.points[1].x).toBeCloseTo(3.0, 5);
            expect(polygon.points[1].y).toBeCloseTo(4.0, 5);
            expect(polygon.points[2].x).toBeCloseTo(5.0, 5);
            expect(polygon.points[2].y).toBeCloseTo(6.0, 5);
        });

        test('union assignment with complex types', () => {
            // Create Point type
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            // Create a union that can hold either a Point or a float
            const PointOrFloat = makeUnion([
                { name: 'point', type: Point },
                { name: 'value', type: TYPE_REGISTRY['f32'] }
            ]);

            // Create a struct that contains the union
            const Shape = makeStruct([
                { name: 'type', type: TYPE_REGISTRY['u8'] },
                { name: 'data', type: PointOrFloat }
            ]);

            // Create a shape and set a point
            const shape = Shape();
            shape.type = 1;
            const point = Point();
            point.x = 1.0;
            point.y = 2.0;
            shape.data.point = point;

            // Verify the point was set correctly
            expect(shape.data.point.x).toBeCloseTo(1.0, 5);
            expect(shape.data.point.y).toBeCloseTo(2.0, 5);

            // Create a new point and assign it
            const newPoint = Point();
            newPoint.x = 3.0;
            newPoint.y = 4.0;
            shape.data.point = newPoint;

            // Verify the new point was assigned correctly
            expect(shape.data.point.x).toBeCloseTo(3.0, 5);
            expect(shape.data.point.y).toBeCloseTo(4.0, 5);

            // Now set it to a float value
            shape.data.value = 5.0;
            expect(shape.data.value).toBeCloseTo(5.0, 5);
        });

        test('deep nested struct assignment', () => {
            // Create Point type
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            // Create Line type
            const Line = makeStruct([
                {name: "start", type: Point},
                {name: "end", type: Point}
            ]);

            // Create Polygon type with array of lines
            const Polygon = makeStruct([
                {name: "lines", type: Line.array(2)}
            ]);

            // Create a polygon and set values
            const polygon = Polygon();
            polygon.lines[0].start.x = 1.0;
            polygon.lines[0].start.y = 2.0;
            polygon.lines[0].end.x = 3.0;
            polygon.lines[0].end.y = 4.0;
            polygon.lines[1].start.x = 5.0;
            polygon.lines[1].start.y = 6.0;
            polygon.lines[1].end.x = 7.0;
            polygon.lines[1].end.y = 8.0;

            // Create a new line and assign it to the first line
            const newLine = Line();
            newLine.start.x = 9.0;
            newLine.start.y = 10.0;
            newLine.end.x = 11.0;
            newLine.end.y = 12.0;
            polygon.lines[0] = newLine;

            // Verify the new line was assigned correctly
            expect(polygon.lines[0].start.x).toBeCloseTo(9.0, 5);
            expect(polygon.lines[0].start.y).toBeCloseTo(10.0, 5);
            expect(polygon.lines[0].end.x).toBeCloseTo(11.0, 5);
            expect(polygon.lines[0].end.y).toBeCloseTo(12.0, 5);

            // Second line should be unchanged
            expect(polygon.lines[1].start.x).toBeCloseTo(5.0, 5);
            expect(polygon.lines[1].start.y).toBeCloseTo(6.0, 5);
            expect(polygon.lines[1].end.x).toBeCloseTo(7.0, 5);
            expect(polygon.lines[1].end.y).toBeCloseTo(8.0, 5);
        });

        test('struct sizes', () => {
            // Create Point type with x,y coordinates
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            // Create Line type with two points
            const Line = makeStruct([
                {name: "start", type: Point},
                {name: "end", type: Point}
            ]);

            // Point should be 8 bytes (2 f32s)
            expect(Point.sizeof).toBe(8);
            // Line should be 16 bytes (2 Points)
            expect(Line.sizeof).toBe(16);
        });

        test('struct type caching in TYPE_REGISTRY', () => {
            const structName = 'CachedStruct';
            const CachedStruct = makeStruct([
                { name: 'field1', type: TYPE_REGISTRY['f32'] },
                { name: 'field2', type: TYPE_REGISTRY['i32'] }
            ], structName);

            // Verify the struct is cached in TYPE_REGISTRY
            expect(TYPE_REGISTRY[structName]).toBe(CachedStruct);
        });

        test('throw error on duplicate type name', () => {
            const structName = 'DuplicateStruct';
            makeStruct([
                { name: 'field1', type: TYPE_REGISTRY['f32'] }
            ], structName);

            // Attempting to create another struct with the same name should throw an error
            expect(() => {
                makeStruct([
                    { name: 'field1', type: TYPE_REGISTRY['i32'] }
                ], structName);
            }).toThrow('Type name already exists in TYPE_REGISTRY');
        });

        test('throw error on empty field name', () => {
            expect(() => {
                makeStruct([
                    { name: '', type: TYPE_REGISTRY['f32'] }
                ]);
            }).toThrow('Field name cannot be empty');
        });

        test('throw error on empty struct name', () => {
            expect(() => {
                makeStruct([
                    { name: 'field1', type: TYPE_REGISTRY['f32'] }
                ], '');
            }).toThrow('Struct name cannot be empty');
        });

        describe('alignment', () => {
            test('default alignment follows largest field type', () => {
                const MixedStruct = makeStruct([
                    { name: 'a', type: TYPE_REGISTRY['u8'] },  // 1 byte
                    { name: 'b', type: TYPE_REGISTRY['f64'] }, // 8 bytes
                    { name: 'c', type: TYPE_REGISTRY['u16'] }  // 2 bytes
                ]);
                
                // Struct should be aligned to 8 bytes (largest field)
                expect(MixedStruct.alignment).toBe(8);
                
                // Total size should be padded to maintain alignment
                // u8 (1) + padding(7) + f64(8) + u16(2) + padding(6) = 24 bytes
                expect(MixedStruct.sizeof).toBe(24);
            });

            test('custom field alignment', () => {
                const AlignedStruct = makeStruct([
                    { name: 'a', type: TYPE_REGISTRY['u8'], alignment: 4 },  // Force 4-byte alignment
                    { name: 'b', type: TYPE_REGISTRY['u16'] },               // 2-byte alignment
                    { name: 'c', type: TYPE_REGISTRY['u8'] }                 // 1-byte alignment
                ]);
                
                // Struct should be aligned to 4 bytes (largest alignment)
                expect(AlignedStruct.alignment).toBe(4);
                
                // Total size should be padded to maintain alignment
                // u8 (1) + padding(3) + u16(2) + u8(1) + padding(1) = 8 bytes
                expect(AlignedStruct.sizeof).toBe(8);
            });

            test('custom struct alignment', () => {
                const AlignedStruct = makeStruct([
                    { name: 'a', type: TYPE_REGISTRY['u8'] },
                    { name: 'b', type: TYPE_REGISTRY['u16'] }
                ], undefined, 8); // Force 8-byte alignment
                
                // Struct should be aligned to 8 bytes (custom alignment)
                expect(AlignedStruct.alignment).toBe(8);
                
                // Total size should be padded to maintain alignment
                // u8 (1) + padding(1) + u16(2) + padding(4) = 8 bytes
                expect(AlignedStruct.sizeof).toBe(8);
            });

            test('nested struct alignment', () => {
                const InnerStruct = makeStruct([
                    { name: 'a', type: TYPE_REGISTRY['u8'] },
                    { name: 'b', type: TYPE_REGISTRY['f64'] }
                ]);
                
                const OuterStruct = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY['u16'] },
                    { name: 'inner', type: InnerStruct },
                    { name: 'y', type: TYPE_REGISTRY['u8'] }
                ]);
                
                // Outer struct should be aligned to 8 bytes (largest field)
                expect(OuterStruct.alignment).toBe(8);
                
                // Total size should be padded to maintain alignment
                // u16(2) + padding(6) + InnerStruct(16) + u8(1) + padding(7) = 32 bytes
                expect(OuterStruct.sizeof).toBe(32);
            });

            test('array alignment', () => {
                const ArrayStruct = makeStruct([
                    { name: 'a', type: TYPE_REGISTRY['u8'].array(3) },  // 3 bytes
                    { name: 'b', type: TYPE_REGISTRY['f64'] }           // 8 bytes
                ]);
                
                // Struct should be aligned to 8 bytes (largest field)
                expect(ArrayStruct.alignment).toBe(8);
                
                // Total size should be padded to maintain alignment
                // u8[3](3) + padding(5) + f64(8) = 16 bytes
                expect(ArrayStruct.sizeof).toBe(16);
            });

            test('custom alignment overrides field alignment', () => {
                const AlignedStruct = makeStruct([
                    { name: 'a', type: TYPE_REGISTRY['u8'], alignment: 16 },  // Try to force 16-byte alignment
                    { name: 'b', type: TYPE_REGISTRY['f64'] }                 // 8-byte alignment
                ], undefined, 4); // Force 4-byte alignment
                
                // Struct should be aligned to 4 bytes (custom alignment)
                expect(AlignedStruct.alignment).toBe(4);
                
                // Total size should be padded to maintain alignment
                // u8 (1) + padding(3) + f64(8) = 12 bytes
                expect(AlignedStruct.sizeof).toBe(12);
            });
        });

        test('struct field offsets', () => {
            // Create a struct with different sized fields to test alignment
            const TestStruct = makeStruct([
                { name: 'a', type: TYPE_REGISTRY['u8'] },  // 1 byte
                { name: 'b', type: TYPE_REGISTRY['u32'] }, // 4 bytes, should be aligned to 4
                { name: 'c', type: TYPE_REGISTRY['u16'] }, // 2 bytes
                { name: 'd', type: TYPE_REGISTRY['u32'] }, // 4 bytes, should be aligned to 4
            ]);

            // Get the fields from the struct definition
            const fields = TestStruct.fields;

            // Verify offsets
            expect(fields[0].offset).toBe(0);  // a: starts at 0
            expect(fields[1].offset).toBe(4);  // b: aligned to 4
            expect(fields[2].offset).toBe(8);  // c: starts at 8
            expect(fields[3].offset).toBe(12); // d: aligned to 4

            // Verify total size (should be 16 bytes with padding)
            expect(TestStruct.sizeof).toBe(16);
        });

        test('struct field offsets with custom alignment', () => {
            // Create a struct with custom alignment
            const TestStruct = makeStruct([
                { name: 'a', type: TYPE_REGISTRY['u8'] },  // 1 byte
                { name: 'b', type: TYPE_REGISTRY['u32'] }, // 4 bytes
                { name: 'c', type: TYPE_REGISTRY['u16'] }, // 2 bytes
                { name: 'd', type: TYPE_REGISTRY['u32'] }, // 4 bytes
            ], undefined, 8); // Force 8-byte alignment

            // Get the fields from the struct definition
            const fields = TestStruct.fields;

            // Verify offsets
            expect(fields[0].offset).toBe(0);  // a: starts at 0
            expect(fields[1].offset).toBe(4);  // b: starts at 4 (u32 is 4 bytes)
            expect(fields[2].offset).toBe(8);  // c: starts at 8 (aligned to 8)
            expect(fields[3].offset).toBe(12); // d: starts at 12 (u32 is 4 bytes)

            // Verify total size (should be 16 bytes with padding)
            expect(TestStruct.sizeof).toBe(16);
        });
    });

    describe('arrays', () => {
        test('array type sizes', () => {
            // Create a struct with arrays of different types
            const ArrayStruct = makeStruct([
                {name: "f32array", type: TYPE_REGISTRY["f32"].array(3)},
                {name: "i16array", type: TYPE_REGISTRY["i16"].array(2)},
                {name: "u8array", type: TYPE_REGISTRY["u8"].array(4)}
            ]);

            // f32[3] should be 12 bytes (3 * 4)
            expect(TYPE_REGISTRY["f32"].array(3).sizeof).toBe(12);
            // i16[2] should be 4 bytes (2 * 2)
            expect(TYPE_REGISTRY["i16"].array(2).sizeof).toBe(4);
            // u8[4] should be 4 bytes (4 * 1)
            expect(TYPE_REGISTRY["u8"].array(4).sizeof).toBe(4);
            // Total struct size should be 20 bytes (12 + 4 + 4)
            expect(ArrayStruct.sizeof).toBe(20);
        });

        test('array type read/write', () => {
            // Create a struct with arrays
            const ArrayStruct = makeStruct([
                {name: "f32array", type: TYPE_REGISTRY["f32"].array(3)},
                {name: "i16array", type: TYPE_REGISTRY["i16"].array(2)},
                {name: "u8array", type: TYPE_REGISTRY["u8"].array(4)}
            ]);

            const instance = ArrayStruct();
            
            // Set array values
            instance.f32array[0] = 1.0;
            instance.f32array[1] = 2.0;
            instance.f32array[2] = 3.0;
            
            instance.i16array[0] = 4;
            instance.i16array[1] = 5;
            
            instance.u8array[0] = 6;
            instance.u8array[1] = 7;
            instance.u8array[2] = 8;
            instance.u8array[3] = 9;

            // Verify array values
            expect(instance.f32array[0]).toBeCloseTo(1.0, 5);
            expect(instance.f32array[1]).toBeCloseTo(2.0, 5);
            expect(instance.f32array[2]).toBeCloseTo(3.0, 5);
            
            expect(instance.i16array[0]).toBe(4);
            expect(instance.i16array[1]).toBe(5);
            
            expect(instance.u8array[0]).toBe(6);
            expect(instance.u8array[1]).toBe(7);
            expect(instance.u8array[2]).toBe(8);
            expect(instance.u8array[3]).toBe(9);
        });

        test('array of struct types', () => {
            // Create a Point type
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            // Create a struct with an array of Points
            const Polygon = makeStruct([
                {name: "points", type: Point.array(3)}
            ]);

            // Verify array size (3 points * 8 bytes per point)
            expect(Point.array(3).sizeof).toBe(24);
            expect(Polygon.sizeof).toBe(24);

            // Create instance and set values
            const polygon = Polygon();
            polygon.points[0].x = 1.0;
            polygon.points[0].y = 2.0;
            polygon.points[1].x = 3.0;
            polygon.points[1].y = 4.0;
            polygon.points[2].x = 5.0;
            polygon.points[2].y = 6.0;

            // Verify values
            expect(polygon.points[0].x).toBeCloseTo(1.0, 5);
            expect(polygon.points[0].y).toBeCloseTo(2.0, 5);
            expect(polygon.points[1].x).toBeCloseTo(3.0, 5);
            expect(polygon.points[1].y).toBeCloseTo(4.0, 5);
            expect(polygon.points[2].x).toBeCloseTo(5.0, 5);
            expect(polygon.points[2].y).toBeCloseTo(6.0, 5);
        });
    });

    describe('unions', () => {
        test('basic union creation and field access', () => {
            const NumberUnion = makeUnion([
                { name: 'i32', type: TYPE_REGISTRY['i32'] },
                { name: 'f32', type: TYPE_REGISTRY['f32'] }
            ]);

            const union = NumberUnion();
            union.i32 = 42;
            expect(union.i32).toBe(42);
            expect(union.f32).toBeCloseTo(5.877471754111438e-39); // IEEE 754 representation of 42

            union.f32 = 3.14;
            expect(union.f32).toBeCloseTo(3.14, 5);
            expect(union.i32).toBe(1078523331); // IEEE 754 representation of 3.14
        });

        test('union size matches largest member', () => {
            const MixedUnion = makeUnion([
                { name: 'u8', type: TYPE_REGISTRY['u8'] },    // 1 byte
                { name: 'u16', type: TYPE_REGISTRY['u16'] },  // 2 bytes
                { name: 'f64', type: TYPE_REGISTRY['f64'] }   // 8 bytes
            ]);

            // Union size should be size of largest member (f64 = 8 bytes)
            expect(MixedUnion.sizeof).toBe(8);
        });

        test('union alignment matches largest member', () => {
            const MixedUnion = makeUnion([
                { name: 'u8', type: TYPE_REGISTRY['u8'] },    // 1 byte alignment
                { name: 'u16', type: TYPE_REGISTRY['u16'] },  // 2 byte alignment
                { name: 'f64', type: TYPE_REGISTRY['f64'] }   // 8 byte alignment
            ]);

            // Union alignment should be alignment of largest member (f64 = 8)
            expect(MixedUnion.alignment).toBe(8);
        });

        test('nested unions', () => {
            const InnerUnion = makeUnion([
                { name: 'u8', type: TYPE_REGISTRY['u8'] },
                { name: 'u16', type: TYPE_REGISTRY['u16'] }
            ]);

            const OuterUnion = makeUnion([
                { name: 'inner', type: InnerUnion },
                { name: 'f32', type: TYPE_REGISTRY['f32'] }
            ]);

            // Outer union size should be max of InnerUnion (2) and f32 (4)
            expect(OuterUnion.sizeof).toBe(4);
            expect(OuterUnion.alignment).toBe(4);

            const union = OuterUnion();
            union.inner.u8 = 42;
            expect(union.inner.u8).toBe(42);
            expect(union.inner.u16).toBe(42);

            union.f32 = 3.14;
            expect(union.f32).toBeCloseTo(3.14, 5);
        });

        test('union within struct', () => {
            const NumberUnion = makeUnion([
                { name: 'i32', type: TYPE_REGISTRY['i32'] },
                { name: 'f32', type: TYPE_REGISTRY['f32'] }
            ]);

            const StructWithUnion = makeStruct([
                { name: 'tag', type: TYPE_REGISTRY['u8'] },
                { name: 'value', type: NumberUnion }
            ]);

            // Struct size should account for union alignment
            // u8 (1) + padding(3) + union(4) = 8 bytes
            expect(StructWithUnion.sizeof).toBe(8);
            expect(StructWithUnion.alignment).toBe(4);

            const instance = StructWithUnion();
            instance.tag = 1;
            instance.value.i32 = 42;
            expect(instance.value.i32).toBe(42);
            expect(instance.value.f32).toBeCloseTo(5.877471754111438e-39);
        });

        test('array of unions', () => {
            const NumberUnion = makeUnion([
                { name: 'i32', type: TYPE_REGISTRY['i32'] },
                { name: 'f32', type: TYPE_REGISTRY['f32'] }
            ]);

            const UnionArray = NumberUnion.array(3);
            expect(UnionArray.sizeof).toBe(12); // 3 * 4 bytes per union

            const array = UnionArray();
            array[0].i32 = 1;
            array[1].f32 = 2.0;
            array[2].i32 = 3;

            expect(array[0].i32).toBe(1);
            expect(array[1].f32).toBeCloseTo(2.0);
            expect(array[2].i32).toBe(3);
        });

        test('throw error on empty field name', () => {
            expect(() => {
                makeUnion([
                    { name: '', type: TYPE_REGISTRY['f32'] }
                ]);
            }).toThrow('Field name cannot be empty');
        });

        test('union type caching in TYPE_REGISTRY', () => {
            const unionName = 'CachedUnion';
            const CachedUnion = makeUnion([
                { name: 'i32', type: TYPE_REGISTRY['i32'] },
                { name: 'f32', type: TYPE_REGISTRY['f32'] }
            ], unionName);

            // Verify the union is cached in TYPE_REGISTRY
            expect(TYPE_REGISTRY[unionName]).toBe(CachedUnion);

            // Verify we can create instances using the cached type
            const instance = TYPE_REGISTRY[unionName]();
            instance.i32 = 42;
            expect(instance.i32).toBe(42);
            expect(instance.f32).toBeCloseTo(5.877471754111438e-39);
        });

        test('throw error on duplicate union name', () => {
            const unionName = 'DuplicateUnion';
            makeUnion([
                { name: 'i32', type: TYPE_REGISTRY['i32'] }
            ], unionName);

            // Attempting to create another union with the same name should throw an error
            expect(() => {
                makeUnion([
                    { name: 'f32', type: TYPE_REGISTRY['f32'] }
                ], unionName);
            }).toThrow('Type name already exists in TYPE_REGISTRY');
        });

        test('union field offsets', () => {
            // Create a union with different sized fields
            const TestUnion = makeUnion([
                { name: 'a', type: TYPE_REGISTRY['u8'] },  // 1 byte
                { name: 'b', type: TYPE_REGISTRY['u32'] }, // 4 bytes
                { name: 'c', type: TYPE_REGISTRY['u16'] }, // 2 bytes
                { name: 'd', type: TYPE_REGISTRY['u32'] }, // 4 bytes
            ]);

            // Get the fields from the union definition
            const fields = TestUnion.fields;

            // Verify all fields have offset 0 in a union
            fields.forEach((field: Field) => {
                expect(field.offset).toBe(0);
            });

            // Verify total size (should be 4 bytes, the size of the largest field)
            expect(TestUnion.sizeof).toBe(4);
        });

        test('nested struct field offsets', () => {
            // Create Point type
            const Point = makeStruct([
                { name: 'x', type: TYPE_REGISTRY['f32'] },
                { name: 'y', type: TYPE_REGISTRY['f32'] }
            ]);

            // Create Line type with two points
            const Line = makeStruct([
                { name: 'start', type: Point },
                { name: 'end', type: Point }
            ]);

            // Get the fields from the Line struct
            const fields = Line.fields;

            // Verify offsets
            expect(fields[0].offset).toBe(0);   // start: starts at 0
            expect(fields[1].offset).toBe(8);   // end: starts at 8 (after start's 8 bytes)

            // Verify total size
            expect(Line.sizeof).toBe(16); // 2 points * 8 bytes each
        });
    });

    describe('complex type assignments', () => {
        test('struct assignment performs memory copy', () => {
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            const Line = makeStruct([
                {name: "start", type: Point},
                {name: "end", type: Point}
            ]);

            const line = Line();
            const newPoint = Point();
            newPoint.x = 5.0;
            newPoint.y = 6.0;
            
            // Assign the new point to start
            line.start = newPoint;
            
            // Verify the assignment
            expect(line.start.x).toBeCloseTo(5.0, 5);
            expect(line.start.y).toBeCloseTo(6.0, 5);
            
            // Modify the original point - should not affect the line
            newPoint.x = 7.0;
            expect(line.start.x).toBeCloseTo(5.0, 5);
        });

        test('union assignment performs memory copy', () => {
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            const PointOrFloat = makeUnion([
                { name: 'point', type: Point },
                { name: 'value', type: TYPE_REGISTRY['f32'] }
            ]);

            const Shape = makeStruct([
                { name: 'type', type: TYPE_REGISTRY['u8'] },
                { name: 'data', type: PointOrFloat }
            ]);

            const shape = Shape();
            const newPoint = Point();
            newPoint.x = 3.0;
            newPoint.y = 4.0;
            
            // Assign the new point to the union field
            shape.data.point = newPoint;
            
            // Verify the assignment
            expect(shape.data.point.x).toBeCloseTo(3.0, 5);
            expect(shape.data.point.y).toBeCloseTo(4.0, 5);
            
            // Modify the original point - should not affect the union
            newPoint.x = 5.0;
            expect(shape.data.point.x).toBeCloseTo(3.0, 5);
        });

        test('array element assignment performs memory copy', () => {
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            const Polygon = makeStruct([
                {name: "points", type: Point.array(3)}
            ]);

            const polygon = Polygon();
            const newPoint = Point();
            newPoint.x = 7.0;
            newPoint.y = 8.0;
            
            // Assign the new point to the first array element
            polygon.points[0] = newPoint;
            
            // Verify the assignment
            expect(polygon.points[0].x).toBeCloseTo(7.0, 5);
            expect(polygon.points[0].y).toBeCloseTo(8.0, 5);
            
            // Modify the original point - should not affect the array
            newPoint.x = 9.0;
            expect(polygon.points[0].x).toBeCloseTo(7.0, 5);
        });

        test('deep nested assignment performs memory copy', () => {
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            const Line = makeStruct([
                {name: "start", type: Point},
                {name: "end", type: Point}
            ]);

            const Polygon = makeStruct([
                {name: "lines", type: Line.array(2)}
            ]);

            const polygon = Polygon();
            const newLine = Line();
            newLine.start.x = 9.0;
            newLine.start.y = 10.0;
            newLine.end.x = 11.0;
            newLine.end.y = 12.0;
            
            // Assign the new line to the first array element
            polygon.lines[0] = newLine;
            
            // Verify the assignment
            expect(polygon.lines[0].start.x).toBeCloseTo(9.0, 5);
            expect(polygon.lines[0].start.y).toBeCloseTo(10.0, 5);
            expect(polygon.lines[0].end.x).toBeCloseTo(11.0, 5);
            expect(polygon.lines[0].end.y).toBeCloseTo(12.0, 5);
            
            // Modify the original line - should not affect the array
            newLine.start.x = 13.0;
            expect(polygon.lines[0].start.x).toBeCloseTo(9.0, 5);
        });

        test('nested union array assignment performs memory copy', () => {
            const Point = makeStruct([
                {name: "x", type: TYPE_REGISTRY["f32"]},
                {name: "y", type: TYPE_REGISTRY["f32"]}
            ]);

            const PointOrFloat = makeUnion([
                { name: 'point', type: Point },
                { name: 'value', type: TYPE_REGISTRY['f32'] }
            ]);

            const Shape = makeStruct([
                { name: 'type', type: TYPE_REGISTRY['u8'] },
                { name: 'data', type: PointOrFloat.array(2) }
            ]);

            const shape = Shape();
            const newPoint = Point();
            newPoint.x = 3.0;
            newPoint.y = 4.0;
            
            // Assign the new point to the first union in the array
            shape.data[0].point = newPoint;
            
            // Verify the assignment
            expect(shape.data[0].point.x).toBeCloseTo(3.0, 5);
            expect(shape.data[0].point.y).toBeCloseTo(4.0, 5);
            
            // Modify the original point - should not affect the array
            newPoint.x = 5.0;
            expect(shape.data[0].point.x).toBeCloseTo(3.0, 5);
        });
    });

    describe('array type information', () => {
        test('array of struct exposes fields on array and elements', () => {
            const Point = makeStruct([
                { name: 'x', type: TYPE_REGISTRY['f32'] },
                { name: 'y', type: TYPE_REGISTRY['f32'] }
            ]);
            const PointArray = Point.array(3);
            const arr = PointArray();
            // Array type exposes fields
            expect(PointArray.fields).toBeDefined();
            expect(PointArray.fields.length).toBe(2);
            expect(PointArray.fields[0].name).toBe('x');
            // Array instance exposes fields
            expect(arr.fields).toBeDefined();
            expect(arr.fields[0].name).toBe('x');
            // Each element exposes fields
            expect(arr[0].fields).toBeDefined();
            expect(arr[0].fields[0].name).toBe('x');
            expect(arr[1].fields[1].name).toBe('y');
        });
        test('array of union exposes fields on array and elements', () => {
            const NumberUnion = makeUnion([
                { name: 'i32', type: TYPE_REGISTRY['i32'] },
                { name: 'f32', type: TYPE_REGISTRY['f32'] }
            ]);
            const UnionArray = NumberUnion.array(2);
            const arr = UnionArray();
            // Array type exposes fields
            expect(UnionArray.fields).toBeDefined();
            expect(UnionArray.fields.length).toBe(2);
            expect(UnionArray.fields[0].name).toBe('i32');
            // Array instance exposes fields
            expect(arr.fields).toBeDefined();
            expect(arr.fields[1].name).toBe('f32');
            // Each element exposes fields
            expect(arr[0].fields).toBeDefined();
            expect(arr[0].fields[0].name).toBe('i32');
            expect(arr[1].fields[1].name).toBe('f32');
        });
        test('array of primitive does not expose fields', () => {
            const U8Array = TYPE_REGISTRY['u8'].array(4);
            const arr = U8Array();
            expect(U8Array.fields).toBeUndefined();
            expect(arr.fields).toBeUndefined();
            expect(arr[0].fields).toBeUndefined();
        });
    });
});
