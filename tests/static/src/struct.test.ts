import { describe, test, expect } from 'bun:test';
import { makeStruct, makeUnion, TYPE_REGISTRY, asObj, StructInstance, isPrimitiveInstance, makeArrayType, toPlainObject, ArrayInstance, UnionInstance } from "../../../static/src/struct";

describe('Struct', () => {
    describe('primitive types', () => {
        test('primitive type sizes', () => {
            expect(TYPE_REGISTRY.i8.size).toBe(1);
            expect(TYPE_REGISTRY.i16.size).toBe(2);
            expect(TYPE_REGISTRY.i32.size).toBe(4);
            expect(TYPE_REGISTRY.i64.size).toBe(8);
        });
    });

    describe('raw TypeInstance API', () => {
        describe('struct field access', () => {
            test('assign and read primitive fields', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.i32 },
                    { name: 'y', type: TYPE_REGISTRY.i32 }
                ]);
                const point = new Point();
                const x = point.getField('x');
                const y = point.getField('y');
                if (!x || !y || !isPrimitiveInstance(x) || !isPrimitiveInstance(y)) {
                    throw new Error('Expected primitive instances');
                }
                x.set(42);
                y.set(43);
                expect(x.get()).toBe(42);
                expect(y.get()).toBe(43);
            });

            test('struct size and alignment', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.i32 },
                    { name: 'y', type: TYPE_REGISTRY.i32 }
                ]);
                expect(Point.size).toBe(8);
                expect(Point.alignment).toBe(4);
            });

            test('field offsets', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.i32 },
                    { name: 'y', type: TYPE_REGISTRY.i32 }
                ]);
                expect(Point.fields.x.offset).toBe(0);
                expect(Point.fields.y.offset).toBe(4);
            });

            test('non-existent field throws error', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.i32 },
                    { name: 'y', type: TYPE_REGISTRY.i32 }
                ]);
                const point = new Point();
                expect(() => point.getField('z')).toThrow('Field z not found in struct');
            });
        });

        describe('nested structs', () => {
            test('nested struct field access', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.i32 },
                    { name: 'y', type: TYPE_REGISTRY.i32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const start = line.getField('start');
                const end = line.getField('end');
                if (!start || !end) throw new Error('Expected struct instances');
                const startX = (start as StructInstance).getField('x');
                const startY = (start as StructInstance).getField('y');
                if (!startX || !startY || !isPrimitiveInstance(startX) || !isPrimitiveInstance(startY)) {
                    throw new Error('Expected primitive instances');
                }
                startX.set(42);
                startY.set(43);
                expect(startX.get()).toBe(42);
                expect(startY.get()).toBe(43);
            });
        });

        describe('arrays', () => {
            test('array element access', () => {
                const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
                const points = new Points();
                const item0 = points.getItem(0);
                const item1 = points.getItem(1);
                if (!item0 || !item1 || !isPrimitiveInstance(item0) || !isPrimitiveInstance(item1)) {
                    throw new Error('Expected primitive instances');
                }
                item0.set(42);
                item1.set(43);
                expect(item0.get()).toBe(42);
                expect(item1.get()).toBe(43);
            });

            test('out of bounds array access throws error', () => {
                const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
                const points = new Points();
                expect(() => points.getItem(-1)).toThrow('Index -1 out of bounds for array of length 2');
                expect(() => points.getItem(2)).toThrow('Index 2 out of bounds for array of length 2');
            });
        });
    });

    describe('asObj wrapper API', () => {
        describe('primitive field access', () => {
            test('get primitive field returns number', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.i32 },
                    { name: 'y', type: TYPE_REGISTRY.i32 }
                ]);
                const point = new Point();
                const x = point.getField('x');
                if (!x || !isPrimitiveInstance(x)) throw new Error('Expected primitive instance');
                x.set(42);
                const pointObj = asObj<{ x: number, y: number }>(point);
                expect(pointObj.x).toBe(42);
            });

            test('set primitive field with number', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.i32 },
                    { name: 'y', type: TYPE_REGISTRY.i32 }
                ]);
                const point = new Point();
                const pointObj = asObj<{ x: number, y: number }>(point);
                pointObj.x = 42;
                const x = point.getField('x');
                if (!x || !isPrimitiveInstance(x)) throw new Error('Expected primitive instance');
                expect(x.get()).toBe(42);
            });
        });

        describe('nested struct field access', () => {
            test('get nested struct field returns object', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const start = line.getField('start');
                const end = line.getField('end');
                if (!start || !end) throw new Error('Expected struct instances');
                expect(toPlainObject(start)).toEqual({ x: 0, y: 0 });
                expect(toPlainObject(end)).toEqual({ x: 0, y: 0 });
            });

            test('set nested struct field with object', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const start = line.getField('start');
                if (!start) throw new Error('Expected struct instance');
                const x = (start as StructInstance).getField('x');
                const y = (start as StructInstance).getField('y');
                if (!x || !y || !isPrimitiveInstance(x) || !isPrimitiveInstance(y)) {
                    throw new Error('Expected primitive instances');
                }
                x.set(42.0);
                y.set(43.0);
                expect(toPlainObject(start)).toEqual({ x: 42.0, y: 43.0 });
            });

            test('nested struct field access - step by step', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const start = line.getField('start');
                const end = line.getField('end');
                if (!start || !end) throw new Error('Expected struct instances');
                const startX = (start as StructInstance).getField('x');
                const startY = (start as StructInstance).getField('y');
                const endX = (end as StructInstance).getField('x');
                const endY = (end as StructInstance).getField('y');
                if (!startX || !startY || !endX || !endY || 
                    !isPrimitiveInstance(startX) || !isPrimitiveInstance(startY) ||
                    !isPrimitiveInstance(endX) || !isPrimitiveInstance(endY)) {
                    throw new Error('Expected primitive instances');
                }

                // Test initial state
                expect(toPlainObject(start)).toEqual({ x: 0, y: 0 });
                expect(toPlainObject(end)).toEqual({ x: 0, y: 0 });

                // Test setting individual fields
                startX.set(1.0);
                expect(startX.get()).toBe(1.0);
                expect(startY.get()).toBe(0.0);
                expect(endX.get()).toBe(0.0);
                expect(endY.get()).toBe(0.0);

                // Test setting both nested structs individually
                startX.set(2.0);
                startY.set(3.0);
                expect(toPlainObject(start)).toEqual({ x: 2.0, y: 3.0 });
                expect(toPlainObject(end)).toEqual({ x: 0.0, y: 0.0 });

                endX.set(4.0);
                endY.set(5.0);
                expect(toPlainObject(start)).toEqual({ x: 2.0, y: 3.0 });
                expect(toPlainObject(end)).toEqual({ x: 4.0, y: 5.0 });
            });
        });

        describe('array element access', () => {
            test('get array element returns number', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const points = new Points();
                const point0 = points.getItem(0);
                const point1 = points.getItem(1);
                if (!point0 || !point1) throw new Error('Expected struct instances');
                expect(toPlainObject(point0)).toEqual({ x: 0, y: 0 });
                expect(toPlainObject(point1)).toEqual({ x: 0, y: 0 });
            });

            test('set array element with object', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const points = new Points();
                const point0 = points.getItem(0);
                if (!point0) throw new Error('Expected struct instance');
                const x = (point0 as StructInstance).getField('x');
                const y = (point0 as StructInstance).getField('y');
                if (!x || !y || !isPrimitiveInstance(x) || !isPrimitiveInstance(y)) {
                    throw new Error('Expected primitive instances');
                }
                x.set(42.0);
                y.set(43.0);
                expect(toPlainObject(point0)).toEqual({ x: 42.0, y: 43.0 });
            });

            test('array element access - step by step', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const points = new Points();
                const point0 = points.getItem(0);
                const point1 = points.getItem(1);
                if (!point0 || !point1) throw new Error('Expected struct instances');
                const x0 = (point0 as StructInstance).getField('x');
                const y0 = (point0 as StructInstance).getField('y');
                const x1 = (point1 as StructInstance).getField('x');
                const y1 = (point1 as StructInstance).getField('y');
                if (!x0 || !y0 || !x1 || !y1 || 
                    !isPrimitiveInstance(x0) || !isPrimitiveInstance(y0) ||
                    !isPrimitiveInstance(x1) || !isPrimitiveInstance(y1)) {
                    throw new Error('Expected primitive instances');
                }

                // Test initial state
                expect(toPlainObject(point0)).toEqual({ x: 0, y: 0 });
                expect(toPlainObject(point1)).toEqual({ x: 0, y: 0 });

                // Test setting individual fields
                x0.set(1.0);
                expect(x0.get()).toBe(1.0);
                expect(y0.get()).toBe(0.0);
                expect(x1.get()).toBe(0.0);
                expect(y1.get()).toBe(0.0);

                // Test setting both elements individually
                x0.set(2.0);
                y0.set(3.0);
                expect(toPlainObject(point0)).toEqual({ x: 2.0, y: 3.0 });
                expect(toPlainObject(point1)).toEqual({ x: 0.0, y: 0.0 });

                x1.set(4.0);
                y1.set(5.0);
                expect(toPlainObject(point0)).toEqual({ x: 2.0, y: 3.0 });
                expect(toPlainObject(point1)).toEqual({ x: 4.0, y: 5.0 });
            });
        });
    });

    describe('API interoperability', () => {
        test('raw API and asObj wrapper work together', () => {
            const Vec3 = makeStruct([
                {name:"x", type:TYPE_REGISTRY["f32"]},
                {name:"y", type:TYPE_REGISTRY["f32"]},
                {name:"z", type:TYPE_REGISTRY["f32"]},
            ]);
            type Vec3Type = {x:number, y:number, z:number};
            
            const vec = new Vec3();
            const wrappedVec = asObj<Vec3Type>(vec);

            // Verify fields exist and are primitive instances
            const x = vec.getField('x');
            const y = vec.getField('y');
            const z = vec.getField('z');
            expect(x).toBeDefined();
            expect(y).toBeDefined();
            expect(z).toBeDefined();
            expect(isPrimitiveInstance(x)).toBe(true);
            expect(isPrimitiveInstance(y)).toBe(true);
            expect(isPrimitiveInstance(z)).toBe(true);

            // Set using raw API
            if (!x || !y || !z) throw new Error('Fields must exist');
            if (!isPrimitiveInstance(x) || !isPrimitiveInstance(y) || !isPrimitiveInstance(z)) {
                throw new Error('Fields must be primitive instances');
            }
            x.set(2.0);
            y.set(3.0);
            z.set(0.1);

            // Read using asObj wrapper
            expect(wrappedVec.x).toBeCloseTo(2.0, 5);
            expect(wrappedVec.y).toBeCloseTo(3.0, 5);
            expect(wrappedVec.z).toBeCloseTo(0.1, 5);

            // Set using asObj wrapper
            wrappedVec.x = 4.0;
            wrappedVec.y = 5.0;
            wrappedVec.z = 0.2;

            // Read using raw API
            expect(x.get()).toBeCloseTo(4.0, 5);
            expect(y.get()).toBeCloseTo(5.0, 5);
            expect(z.get()).toBeCloseTo(0.2, 5);
        });
    });

    describe('complex asObj cases', () => {
        describe('nested struct assignment', () => {
            test('assign entire nested struct object', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const lineObj = asObj<{ start: { x: number, y: number }, end: { x: number, y: number } }>(line);

                // Assign entire nested struct
                lineObj.start = { x: 1.0, y: 2.0 };
                lineObj.end = { x: 3.0, y: 4.0 };

                // Verify through raw API
                const start = line.getField('start');
                const end = line.getField('end');
                if (!start || !end) throw new Error('Expected struct instances');
                const startX = (start as StructInstance).getField('x');
                const startY = (start as StructInstance).getField('y');
                const endX = (end as StructInstance).getField('x');
                const endY = (end as StructInstance).getField('y');
                if (!startX || !startY || !endX || !endY || 
                    !isPrimitiveInstance(startX) || !isPrimitiveInstance(startY) ||
                    !isPrimitiveInstance(endX) || !isPrimitiveInstance(endY)) {
                    throw new Error('Expected primitive instances');
                }

                expect(startX.get()).toBeCloseTo(1.0, 5);
                expect(startY.get()).toBeCloseTo(2.0, 5);
                expect(endX.get()).toBeCloseTo(3.0, 5);
                expect(endY.get()).toBeCloseTo(4.0, 5);
            });
        });

        describe('array of structs', () => {
            test('assign entire struct element in array', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const points = new Points();
                const pointsObj = asObj<{ x: number, y: number }[]>(points);

                // Assign entire struct elements
                pointsObj[0] = { x: 1.0, y: 2.0 };
                pointsObj[1] = { x: 3.0, y: 4.0 };

                // Verify through raw API
                const point0 = points.getItem(0);
                const point1 = points.getItem(1);
                if (!point0 || !point1) throw new Error('Expected struct instances');
                const x0 = (point0 as StructInstance).getField('x');
                const y0 = (point0 as StructInstance).getField('y');
                const x1 = (point1 as StructInstance).getField('x');
                const y1 = (point1 as StructInstance).getField('y');
                if (!x0 || !y0 || !x1 || !y1 || 
                    !isPrimitiveInstance(x0) || !isPrimitiveInstance(y0) ||
                    !isPrimitiveInstance(x1) || !isPrimitiveInstance(y1)) {
                    throw new Error('Expected primitive instances');
                }

                expect(x0.get()).toBeCloseTo(1.0, 5);
                expect(y0.get()).toBeCloseTo(2.0, 5);
                expect(x1.get()).toBeCloseTo(3.0, 5);
                expect(y1.get()).toBeCloseTo(4.0, 5);
            });
        });

        describe('union types', () => {
            test('assign values to union fields', () => {
                const Number = makeUnion([
                    { name: 'i', type: TYPE_REGISTRY.i32 },
                    { name: 'f', type: TYPE_REGISTRY.f64 }
                ]);
                const num = new Number();
                type NumberType = { i: number } | { f: number };
                const numObj = asObj<NumberType>(num);

                // Assign to integer field
                (numObj as { i: number }).i = 42;
                const i = num.getField('i');
                if (!i || !isPrimitiveInstance(i)) throw new Error('Expected primitive instance');
                expect(i.get()).toBe(42);

                // Assign to float field
                (numObj as { f: number }).f = 3.14;
                const f = num.getField('f');
                if (!f || !isPrimitiveInstance(f)) throw new Error('Expected primitive instance');
                expect(f.get()).toBeCloseTo(3.14, 5);
            });
        });

        describe('nested arrays', () => {
            test('assign to nested array elements', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const Lines = makeArrayType(Points, 2);
                const lines = new Lines();
                const linesObj = asObj<{ x: number, y: number }[][]>(lines);

                // Assign to nested array elements
                linesObj[0][0] = { x: 1.0, y: 2.0 };
                linesObj[0][1] = { x: 3.0, y: 4.0 };
                linesObj[1][0] = { x: 5.0, y: 6.0 };
                linesObj[1][1] = { x: 7.0, y: 8.0 };

                // Verify through raw API
                for (let i = 0; i < 2; i++) {
                    const line = lines.getItem(i);
                    if (!line) throw new Error('Expected array instance');
                    for (let j = 0; j < 2; j++) {
                        const point = (line as ArrayInstance).getItem(j);
                        if (!point) throw new Error('Expected struct instance');
                        const x = (point as StructInstance).getField('x');
                        const y = (point as StructInstance).getField('y');
                        if (!x || !y || !isPrimitiveInstance(x) || !isPrimitiveInstance(y)) {
                            throw new Error('Expected primitive instances');
                        }
                        expect(x.get()).toBeCloseTo(1.0 + (i * 2 + j) * 2, 5);
                        expect(y.get()).toBeCloseTo(2.0 + (i * 2 + j) * 2, 5);
                    }
                }
            });
        });

        describe('complex mixed types', () => {
            test('assign to complex mixed type structure', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Number = makeUnion([
                    { name: 'i', type: TYPE_REGISTRY.i32 },
                    { name: 'f', type: TYPE_REGISTRY.f64 }
                ]);
                const Complex = makeStruct([
                    { name: 'points', type: makeArrayType(Point, 2) },
                    { name: 'value', type: Number }
                ]);
                const complex = new Complex();
                const complexObj = asObj<{ 
                    points: { x: number, y: number }[], 
                    value: { i: number } | { f: number } 
                }>(complex);

                // Assign to complex structure
                complexObj.points[0] = { x: 1.0, y: 2.0 };
                complexObj.points[1] = { x: 3.0, y: 4.0 };
                complexObj.value = { i: 42 };

                // Verify through raw API
                const points = complex.getField('points');
                const value = complex.getField('value');
                if (!points || !value) throw new Error('Expected instances');

                // Check points array
                const point0 = (points as ArrayInstance).getItem(0);
                const point1 = (points as ArrayInstance).getItem(1);
                if (!point0 || !point1) throw new Error('Expected struct instances');
                const x0 = (point0 as StructInstance).getField('x');
                const y0 = (point0 as StructInstance).getField('y');
                const x1 = (point1 as StructInstance).getField('x');
                const y1 = (point1 as StructInstance).getField('y');
                if (!x0 || !y0 || !x1 || !y1 || 
                    !isPrimitiveInstance(x0) || !isPrimitiveInstance(y0) ||
                    !isPrimitiveInstance(x1) || !isPrimitiveInstance(y1)) {
                    throw new Error('Expected primitive instances');
                }
                expect(x0.get()).toBeCloseTo(1.0, 5);
                expect(y0.get()).toBeCloseTo(2.0, 5);
                expect(x1.get()).toBeCloseTo(3.0, 5);
                expect(y1.get()).toBeCloseTo(4.0, 5);

                // Check union value
                const i = (value as UnionInstance).getField('i');
                if (!i || !isPrimitiveInstance(i)) throw new Error('Expected primitive instance');
                expect(i.get()).toBe(42);
            });
        });

        describe('error cases', () => {
            test('assign wrong type to nested struct', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const lineObj = asObj<{ start: { x: number, y: number }, end: { x: number, y: number } }>(line);

                expect(() => {
                    // @ts-expect-error
                    lineObj.start = { x: 'invalid', y: 2.0 };
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    lineObj.start = { x: 1.0 }; // Missing required field
                }).toThrow();
            });

            test('assign wrong type to union field', () => {
                const Number = makeUnion([
                    { name: 'i', type: TYPE_REGISTRY.i32 },
                    { name: 'f', type: TYPE_REGISTRY.f64 }
                ]);
                const num = new Number();
                const numObj = asObj<{ i: number } | { f: number }>(num);

                expect(() => {
                    // @ts-expect-error
                    numObj.i = 'invalid';
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    numObj.f = 'invalid';
                }).toThrow();
            });

            test('assign out of bounds array index', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const points = new Points();
                const pointsObj = asObj<{ x: number, y: number }[]>(points);

                expect(() => {
                    pointsObj[-1] = { x: 1.0, y: 2.0 };
                }).toThrow();
                expect(() => {
                    pointsObj[2] = { x: 1.0, y: 2.0 };
                }).toThrow();
            });

            test('assign null/undefined to fields', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const point = new Point();
                const pointObj = asObj<{ x: number, y: number }>(point);

                expect(() => {
                    // @ts-expect-error
                    pointObj.x = null;
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    pointObj.y = undefined;
                }).toThrow();
            });

            test('assign object with missing required fields', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const lineObj = asObj<{ start: { x: number, y: number }, end: { x: number, y: number } }>(line);

                expect(() => {
                    // @ts-expect-error
                    lineObj.start = { x: 1.0 }; // Missing y field
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    lineObj.end = { y: 2.0 }; // Missing x field
                }).toThrow();
            });
        });

        describe('deeply nested structures', () => {
            test('deeply nested structs (3+ levels)', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const Polygon = makeStruct([
                    { name: 'lines', type: makeArrayType(Line, 2) },
                    { name: 'center', type: Point }
                ]);
                const Scene = makeStruct([
                    { name: 'polygons', type: makeArrayType(Polygon, 2) },
                    { name: 'origin', type: Point }
                ]);

                const scene = new Scene();
                const sceneObj = asObj<{
                    polygons: {
                        lines: { start: { x: number, y: number }, end: { x: number, y: number } }[],
                        center: { x: number, y: number }
                    }[],
                    origin: { x: number, y: number }
                }>(scene);

                // Set deeply nested values
                sceneObj.polygons[0].lines[0].start.x = 1.0;
                sceneObj.polygons[0].lines[0].start.y = 2.0;
                sceneObj.polygons[0].lines[0].end.x = 3.0;
                sceneObj.polygons[0].lines[0].end.y = 4.0;
                sceneObj.polygons[0].center.x = 5.0;
                sceneObj.polygons[0].center.y = 6.0;
                sceneObj.origin.x = 7.0;
                sceneObj.origin.y = 8.0;

                // Verify through raw API
                const polygons = scene.getField('polygons');
                const origin = scene.getField('origin');
                if (!polygons || !origin) throw new Error('Expected instances');

                const polygon0 = (polygons as ArrayInstance).getItem(0);
                if (!polygon0) throw new Error('Expected struct instance');
                const lines = (polygon0 as StructInstance).getField('lines');
                const center = (polygon0 as StructInstance).getField('center');
                if (!lines || !center) throw new Error('Expected instances');

                const line0 = (lines as ArrayInstance).getItem(0);
                if (!line0) throw new Error('Expected struct instance');
                const start = (line0 as StructInstance).getField('start');
                const end = (line0 as StructInstance).getField('end');
                if (!start || !end) throw new Error('Expected struct instances');

                const startX = (start as StructInstance).getField('x');
                const startY = (start as StructInstance).getField('y');
                const endX = (end as StructInstance).getField('x');
                const endY = (end as StructInstance).getField('y');
                const centerX = (center as StructInstance).getField('x');
                const centerY = (center as StructInstance).getField('y');
                const originX = (origin as StructInstance).getField('x');
                const originY = (origin as StructInstance).getField('y');

                if (!startX || !startY || !endX || !endY || !centerX || !centerY || !originX || !originY ||
                    !isPrimitiveInstance(startX) || !isPrimitiveInstance(startY) ||
                    !isPrimitiveInstance(endX) || !isPrimitiveInstance(endY) ||
                    !isPrimitiveInstance(centerX) || !isPrimitiveInstance(centerY) ||
                    !isPrimitiveInstance(originX) || !isPrimitiveInstance(originY)) {
                    throw new Error('Expected primitive instances');
                }

                expect(startX.get()).toBeCloseTo(1.0, 5);
                expect(startY.get()).toBeCloseTo(2.0, 5);
                expect(endX.get()).toBeCloseTo(3.0, 5);
                expect(endY.get()).toBeCloseTo(4.0, 5);
                expect(centerX.get()).toBeCloseTo(5.0, 5);
                expect(centerY.get()).toBeCloseTo(6.0, 5);
                expect(originX.get()).toBeCloseTo(7.0, 5);
                expect(originY.get()).toBeCloseTo(8.0, 5);
            });

            test('arrays of arrays of structs', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const Grid = makeArrayType(Points, 2);
                const grid = new Grid();
                const gridObj = asObj<{ x: number, y: number }[][]>(grid);

                // Set values in nested arrays
                gridObj[0][0] = { x: 1.0, y: 2.0 };
                gridObj[0][1] = { x: 3.0, y: 4.0 };
                gridObj[1][0] = { x: 5.0, y: 6.0 };
                gridObj[1][1] = { x: 7.0, y: 8.0 };

                // Verify through raw API
                for (let i = 0; i < 2; i++) {
                    const row = grid.getItem(i);
                    if (!row) throw new Error('Expected array instance');
                    for (let j = 0; j < 2; j++) {
                        const point = (row as ArrayInstance).getItem(j);
                        if (!point) throw new Error('Expected struct instance');
                        const x = (point as StructInstance).getField('x');
                        const y = (point as StructInstance).getField('y');
                        if (!x || !y || !isPrimitiveInstance(x) || !isPrimitiveInstance(y)) {
                            throw new Error('Expected primitive instances');
                        }
                        expect(x.get()).toBeCloseTo(1.0 + (i * 2 + j) * 2, 5);
                        expect(y.get()).toBeCloseTo(2.0 + (i * 2 + j) * 2, 5);
                    }
                }
            });
        });

        describe('unions with structs', () => {
            test('union containing structs', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const Shape = makeUnion([
                    { name: 'point', type: Point },
                    { name: 'line', type: Line }
                ]);
                const shape = new Shape();
                type ShapeType = { point: { x: number, y: number } } | { line: { start: { x: number, y: number }, end: { x: number, y: number } } };
                const shapeObj = asObj<ShapeType>(shape);

                // Test point variant
                (shapeObj as { point: { x: number, y: number } }).point = { x: 1.0, y: 2.0 };
                const point = shape.getField('point');
                if (!point) throw new Error('Expected struct instance');
                const x = (point as StructInstance).getField('x');
                const y = (point as StructInstance).getField('y');
                if (!x || !y || !isPrimitiveInstance(x) || !isPrimitiveInstance(y)) {
                    throw new Error('Expected primitive instances');
                }
                expect(x.get()).toBeCloseTo(1.0, 5);
                expect(y.get()).toBeCloseTo(2.0, 5);

                // Test line variant
                (shapeObj as { line: { start: { x: number, y: number }, end: { x: number, y: number } } }).line = {
                    start: { x: 3.0, y: 4.0 },
                    end: { x: 5.0, y: 6.0 }
                };
                const line = shape.getField('line');
                if (!line) throw new Error('Expected struct instance');
                const start = (line as StructInstance).getField('start');
                const end = (line as StructInstance).getField('end');
                if (!start || !end) throw new Error('Expected struct instances');
                const startX = (start as StructInstance).getField('x');
                const startY = (start as StructInstance).getField('y');
                const endX = (end as StructInstance).getField('x');
                const endY = (end as StructInstance).getField('y');
                if (!startX || !startY || !endX || !endY ||
                    !isPrimitiveInstance(startX) || !isPrimitiveInstance(startY) ||
                    !isPrimitiveInstance(endX) || !isPrimitiveInstance(endY)) {
                    throw new Error('Expected primitive instances');
                }
                expect(startX.get()).toBeCloseTo(3.0, 5);
                expect(startY.get()).toBeCloseTo(4.0, 5);
                expect(endX.get()).toBeCloseTo(5.0, 5);
                expect(endY.get()).toBeCloseTo(6.0, 5);
            });

            test('struct containing union containing array', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const Shape = makeUnion([
                    { name: 'points', type: Points },
                    { name: 'center', type: Point }
                ]);
                const Container = makeStruct([
                    { name: 'shape', type: Shape },
                    { name: 'id', type: TYPE_REGISTRY.i32 }
                ]);
                const container = new Container();
                type ContainerType = {
                    shape: { points: { x: number, y: number }[] } | { center: { x: number, y: number } },
                    id: number
                };
                const containerObj = asObj<ContainerType>(container);

                // Test points variant
                (containerObj.shape as { points: { x: number, y: number }[] }).points = [
                    { x: 1.0, y: 2.0 },
                    { x: 3.0, y: 4.0 }
                ];
                containerObj.id = 42;

                const shape = container.getField('shape');
                const id = container.getField('id');
                if (!shape || !id) throw new Error('Expected instances');
                const points = (shape as UnionInstance).getField('points');
                if (!points) throw new Error('Expected array instance');
                const point0 = (points as ArrayInstance).getItem(0);
                const point1 = (points as ArrayInstance).getItem(1);
                if (!point0 || !point1) throw new Error('Expected struct instances');
                const x0 = (point0 as StructInstance).getField('x');
                const y0 = (point0 as StructInstance).getField('y');
                const x1 = (point1 as StructInstance).getField('x');
                const y1 = (point1 as StructInstance).getField('y');
                if (!x0 || !y0 || !x1 || !y1 || !isPrimitiveInstance(id) ||
                    !isPrimitiveInstance(x0) || !isPrimitiveInstance(y0) ||
                    !isPrimitiveInstance(x1) || !isPrimitiveInstance(y1)) {
                    throw new Error('Expected primitive instances');
                }
                expect(x0.get()).toBeCloseTo(1.0, 5);
                expect(y0.get()).toBeCloseTo(2.0, 5);
                expect(x1.get()).toBeCloseTo(3.0, 5);
                expect(y1.get()).toBeCloseTo(4.0, 5);
                expect(id.get()).toBe(42);

                // Test center variant
                (containerObj.shape as { center: { x: number, y: number } }).center = { x: 5.0, y: 6.0 };
                const center = (shape as UnionInstance).getField('center');
                if (!center) throw new Error('Expected struct instance');
                const centerX = (center as StructInstance).getField('x');
                const centerY = (center as StructInstance).getField('y');
                if (!centerX || !centerY ||
                    !isPrimitiveInstance(centerX) || !isPrimitiveInstance(centerY)) {
                    throw new Error('Expected primitive instances');
                }
                expect(centerX.get()).toBeCloseTo(5.0, 5);
                expect(centerY.get()).toBeCloseTo(6.0, 5);
            });
        });

        describe('edge cases', () => {
            test('empty array of structs', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 0);
                const points = new Points();
                const pointsObj = asObj<{ x: number, y: number }[]>(points);

                expect(pointsObj.length).toBe(0);
                expect(() => pointsObj[0]).toThrow();
            });

            test('struct with empty array field', () => {
                const EmptyArray = makeArrayType(TYPE_REGISTRY.i32, 0);
                const Container = makeStruct([
                    { name: 'values', type: EmptyArray },
                    { name: 'id', type: TYPE_REGISTRY.i32 }
                ]);
                const container = new Container();
                const containerObj = asObj<{ values: number[], id: number }>(container);

                expect(containerObj.values.length).toBe(0);
                expect(() => containerObj.values[0]).toThrow();
                containerObj.id = 42;
                const id = container.getField('id');
                if (!id || !isPrimitiveInstance(id)) throw new Error('Expected primitive instance');
                expect(id.get()).toBe(42);
            });

            test('type coercion for nested structures', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.i32 },
                    { name: 'y', type: TYPE_REGISTRY.i32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const lineObj = asObj<{ start: { x: number, y: number }, end: { x: number, y: number } }>(line);

                // Test integer coercion
                lineObj.start.x = 1.5; // Should be coerced to 1
                lineObj.start.y = 2.7; // Should be coerced to 2
                const start = line.getField('start');
                if (!start) throw new Error('Expected struct instance');
                const x = (start as StructInstance).getField('x');
                const y = (start as StructInstance).getField('y');
                if (!x || !y || !isPrimitiveInstance(x) || !isPrimitiveInstance(y)) {
                    throw new Error('Expected primitive instances');
                }
                expect(x.get()).toBe(1);
                expect(y.get()).toBe(2);
            });
        });

        describe('error handling', () => {
            test('invalid nested struct assignment', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Line = makeStruct([
                    { name: 'start', type: Point },
                    { name: 'end', type: Point }
                ]);
                const line = new Line();
                const lineObj = asObj<{ start: { x: number, y: number }, end: { x: number, y: number } }>(line);

                expect(() => {
                    // @ts-expect-error
                    lineObj.start = { x: 'invalid', y: 2.0 };
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    lineObj.start = { x: 1.0 }; // Missing required field
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    lineObj.start = { x: 1.0, y: 2.0, z: 3.0 }; // Extra field
                }).toThrow();
            });

            test('invalid union variant assignment', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Shape = makeUnion([
                    { name: 'point', type: Point },
                    { name: 'radius', type: TYPE_REGISTRY.f32 }
                ]);
                const shape = new Shape();
                type ShapeType = { point: { x: number, y: number } } | { radius: number };
                const shapeObj = asObj<ShapeType>(shape);

                expect(() => {
                    // @ts-expect-error
                    (shapeObj as { point: { x: number, y: number } }).point = { x: 'invalid', y: 2.0 };
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    (shapeObj as { radius: number }).radius = 'invalid';
                }).toThrow();
            });

            test('invalid array element assignment', () => {
                const Point = makeStruct([
                    { name: 'x', type: TYPE_REGISTRY.f32 },
                    { name: 'y', type: TYPE_REGISTRY.f32 }
                ]);
                const Points = makeArrayType(Point, 2);
                const points = new Points();
                const pointsObj = asObj<{ x: number, y: number }[]>(points);

                expect(() => {
                    // @ts-expect-error
                    pointsObj[0] = { x: 'invalid', y: 2.0 };
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    pointsObj[0] = { x: 1.0 }; // Missing required field
                }).toThrow();
                expect(() => {
                    // @ts-expect-error
                    pointsObj[0] = { x: 1.0, y: 2.0, z: 3.0 }; // Extra field
                }).toThrow();
            });
        });
    });

    describe('type validation', () => {
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
                ], {name:''});
            }).toThrow('Struct name cannot be empty');
        });

        test('throw error on duplicate type name', () => {
            const structName = 'DuplicateStruct';
            makeStruct([
                { name: 'field1', type: TYPE_REGISTRY['f32'] }
            ], {name:structName});

            expect(() => {
                makeStruct([
                    { name: 'field1', type: TYPE_REGISTRY['i32'] }
                ], {name:structName});
            }).toThrow('Type name already exists in TYPE_REGISTRY');
        });
    });
});
