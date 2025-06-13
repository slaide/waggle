/**
 * Base interface for all types in the system. Types represent memory layouts
 * with specific alignment and size requirements, and can be instantiated to
 * create DataViews over ArrayBuffers.
 */
export interface Type {
    /**
     * Creates a new instance of this type, optionally using an existing buffer.
     * If no buffer is provided, a new one will be allocated with the appropriate size.
     * @param buffer - Optional ArrayBuffer to use for this instance
     * @param offset - Optional byte offset into the buffer (defaults to 0)
     */
    new(buffer?: ArrayBuffer, offset?: number): TypeInstance;
    /**
     * The alignment requirement of this type in bytes. This determines how the type
     * should be positioned in memory relative to other types. For example, a type
     * with alignment 4 must be placed at addresses that are multiples of 4.
     * 
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 }, // alignment: 4
     *   { name: 'y', type: TYPE_REGISTRY.i32 }  // alignment: 4
     * ]);
     * console.log(Point.alignment); // 4 (bytes)
     * ```
     */
    readonly alignment: number;
    /**
     * The total size of this type in bytes, including any padding needed to satisfy
     * alignment requirements.
     * 
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 }, // size: 4
     *   { name: 'y', type: TYPE_REGISTRY.i32 }  // size: 4
     * ]);
     * console.log(Point.size); // 8 (bytes)
     * ```
     */
    readonly size: number;
    /**
     * Creates a new array type with this type as its element type.
     * The resulting array type will have the same alignment as this type,
     * and its size will be elementSize * length (with appropriate padding).
     * 
     * @param n - The number of elements in the array
     * @returns A new ArrayType with this type as its element type
     * 
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * const Points = Point.array(2);
     * console.log(Points.size); // 16 (8 bytes per point * 2 points)
     * console.log(Points.alignment); // 4 (same as Point)
     * ```
     */
    array(n: number): ArrayType;
}

/**
 * Enum representing different kinds of primitive types.
 */
export enum PrimitiveKind {
    Int8,
    Uint8,
    Int16,
    Uint16,
    Int32,
    Uint32,
    Int64,
    Uint64,
    Float32,
    Float64,
    Boolean
}

/**
 * Represents a basic primitive type like Int32 or Float64. These are the
 * building blocks for more complex types and have no internal structure.
 */
export interface PrimitiveType extends Type {
    /**
     * Creates a new instance of this primitive type, optionally using an existing buffer.
     * If no buffer is provided, a new one will be allocated with the appropriate size.
     * @param buffer - Optional ArrayBuffer to use for this instance
     * @param offset - Optional byte offset into the buffer (defaults to 0)
     */
    new(buffer?: ArrayBuffer, offset?: number): PrimitiveInstance;
    /**
     * The kind of primitive type this is (e.g., Int32, Float64, etc.)
     * This determines how the value is interpreted in memory.
     */
    readonly kind: PrimitiveKind;
    /**
     * The alignment requirement of this primitive type in bytes.
     * This is typically equal to the size of the type.
     * 
     * @example
     * ```ts
     * console.log(TYPE_REGISTRY.i32.alignment); // 4 (bytes)
     * console.log(TYPE_REGISTRY.f64.alignment); // 8 (bytes)
     * ```
     */
    readonly alignment: number;
    /**
     * The size of this primitive type in bytes.
     * 
     * @example
     * ```ts
     * console.log(TYPE_REGISTRY.i32.size); // 4 (bytes)
     * console.log(TYPE_REGISTRY.f64.size); // 8 (bytes)
     * ```
     */
    readonly size: number;
}

/**
 * Base interface for all type instances. Contains a DataView field
 * that provides the underlying buffer access functionality.
 */
export interface TypeInstance {
    /** The underlying ArrayBuffer that stores the data */
    buffer: ArrayBuffer;
    /**
     * Gets a field by name from a struct or union instance.
     * @throws {Error} If the field name does not exist in the struct/union
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * const point = new Point();
     * const x = point.getField('x'); // Returns TypeInstance for x field
     * point.getField('z'); // Throws: Field z not found in struct
     * ```
     */
    getField?(name: string): TypeInstance;
    /**
     * Sets a field by name in a struct or union instance.
     * @throws {Error} If the field name does not exist in the struct/union
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * const point = new Point();
     * const x = new TYPE_REGISTRY.i32();
     * x.set(42);
     * point.setField('x', x); // Sets x field to 42
     * point.setField('z', x); // Throws: Field z not found in struct
     * ```
     */
    setField?(name: string, value: TypeInstance): void;
    /**
     * Gets an element by index from an array instance.
     * @throws {Error} If the index is out of bounds (negative or >= array length)
     * @example
     * ```ts
     * const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
     * const points = new Points();
     * const item0 = points.getItem(0); // Returns TypeInstance for first element
     * points.getItem(-1); // Throws: Index -1 out of bounds for array of length 2
     * points.getItem(2);  // Throws: Index 2 out of bounds for array of length 2
     * ```
     */
    getItem?(index: number): TypeInstance;
    /**
     * Sets an element by index in an array instance.
     * @throws {Error} If the index is out of bounds (negative or >= array length)
     * @example
     * ```ts
     * const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
     * const points = new Points();
     * const value = new TYPE_REGISTRY.i32();
     * value.set(42);
     * points.setItem(0, value); // Sets first element to 42
     * points.setItem(-1, value); // Throws: Index -1 out of bounds for array of length 2
     * points.setItem(2, value);  // Throws: Index 2 out of bounds for array of length 2
     * ```
     */
    setItem?(index: number, value: TypeInstance): void;
    /**
     * Sets the entire value of this instance to match another instance.
     * This is useful for copying values between instances of the same type.
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * const point1 = new Point();
     * const point2 = new Point();
     * const x = new TYPE_REGISTRY.i32();
     * const y = new TYPE_REGISTRY.i32();
     * x.set(42);
     * y.set(43);
     * point1.setField('x', x);
     * point1.setField('y', y);
     * point2.set(point1); // Copies all values from point1 to point2
     * ```
     */
    set?(value: TypeInstance): void;
}

/**
 * Represents an instance of a primitive type. The instance contains a DataView
 * and provides get/set methods to access the underlying value.
 */
export interface PrimitiveInstance extends Omit<TypeInstance, "set"> {
    /**
     * Gets the current value of the primitive instance.
     * @returns The current value as a number or boolean
     * @example
     * ```ts
     * const num = new TYPE_REGISTRY.i32();
     * num.set(42);
     * console.log(num.get()); // 42
     * ```
     */
    get(): number;
    /**
     * Sets the value of the primitive instance.
     * @throws {Error} If the value is out of range for the primitive type
     * @example
     * ```ts
     * const num = new TYPE_REGISTRY.i32();
     * num.set(42); // Sets value to 42
     * num.set(Number.MAX_SAFE_INTEGER + 1); // Throws: Value out of range for Int32
     * ```
     */
    set(value: number): void;
    /** The underlying ArrayBuffer that stores the data */
    buffer: ArrayBuffer;
}

/**
 * Represents an instance of a struct type. The instance contains a DataView
 * and provides field access through getField/setField methods.
 */
export interface StructInstance extends TypeInstance {
    /**
     * Gets a field by name from the struct instance.
     * @throws {Error} If the field name does not exist in the struct
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * const point = new Point();
     * const x = point.getField('x'); // Returns TypeInstance for x field
     * point.getField('z'); // Throws: Field z not found in struct
     * ```
     */
    getField(name: string): TypeInstance;
    /**
     * Sets a field by name in the struct instance.
     * @throws {Error} If the field name does not exist in the struct
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * const point = new Point();
     * const x = new TYPE_REGISTRY.i32();
     * x.set(42);
     * point.setField('x', x); // Sets x field to 42
     * point.setField('z', x); // Throws: Field z not found in struct
     * ```
     */
    setField(name: string, value: TypeInstance): void;
    /**
     * Sets the entire struct instance to match another struct instance.
     * This copies all field values from the source to this instance.
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * const point1 = new Point();
     * const point2 = new Point();
     * const x = new TYPE_REGISTRY.i32();
     * const y = new TYPE_REGISTRY.i32();
     * x.set(42);
     * y.set(43);
     * point1.setField('x', x);
     * point1.setField('y', y);
     * point2.set(point1); // Copies all values from point1 to point2
     * ```
     */
    set(value: TypeInstance): void;
}

/**
 * Represents an instance of a union type. The instance contains a DataView
 * and provides field access through getField/setField methods.
 */
export interface UnionInstance extends TypeInstance {
    /**
     * Gets a field by name from the union instance.
     * @throws {Error} If the field name does not exist in the union
     * @example
     * ```ts
     * const Number = makeUnion([
     *   { name: 'i', type: TYPE_REGISTRY.i32 },
     *   { name: 'f', type: TYPE_REGISTRY.f64 }
     * ]);
     * const num = new Number();
     * const i = num.getField('i'); // Returns TypeInstance for i field
     * num.getField('z'); // Throws: Field z not found in union
     * ```
     */
    getField(name: string): TypeInstance;
    /**
     * Sets a field by name in the union instance.
     * @throws {Error} If the field name does not exist in the union
     * @example
     * ```ts
     * const Number = makeUnion([
     *   { name: 'i', type: TYPE_REGISTRY.i32 },
     *   { name: 'f', type: TYPE_REGISTRY.f64 }
     * ]);
     * const num = new Number();
     * const i = new TYPE_REGISTRY.i32();
     * i.set(42);
     * num.setField('i', i); // Sets i field to 42
     * num.setField('z', i); // Throws: Field z not found in union
     * ```
     */
    setField(name: string, value: TypeInstance): void;
    /**
     * Sets the entire union instance to match another union instance.
     * This copies all field values from the source to this instance.
     * @example
     * ```ts
     * const Number = makeUnion([
     *   { name: 'i', type: TYPE_REGISTRY.i32 },
     *   { name: 'f', type: TYPE_REGISTRY.f64 }
     * ]);
     * const num1 = new Number();
     * const num2 = new Number();
     * const i = new TYPE_REGISTRY.i32();
     * i.set(42);
     * num1.setField('i', i);
     * num2.set(num1); // Copies all values from num1 to num2
     * ```
     */
    set(value: TypeInstance | object): void;
}

/**
 * Represents an instance of an array type. The instance contains a DataView
 * and provides element access through getItem/setItem methods.
 */
export interface ArrayInstance extends TypeInstance {
    /**
     * Gets an element by index from the array instance.
     * @throws {Error} If the index is out of bounds (negative or >= array length)
     * @example
     * ```ts
     * const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
     * const points = new Points();
     * const item0 = points.getItem(0); // Returns TypeInstance for first element
     * points.getItem(-1); // Throws: Index -1 out of bounds for array of length 2
     * points.getItem(2);  // Throws: Index 2 out of bounds for array of length 2
     * ```
     */
    getItem(index: number): TypeInstance;
    /**
     * Sets an element by index in the array instance.
     * @throws {Error} If the index is out of bounds (negative or >= array length)
     * @example
     * ```ts
     * const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
     * const points = new Points();
     * const value = new TYPE_REGISTRY.i32();
     * value.set(42);
     * points.setItem(0, value); // Sets first element to 42
     * points.setItem(-1, value); // Throws: Index -1 out of bounds for array of length 2
     * points.setItem(2, value);  // Throws: Index 2 out of bounds for array of length 2
     * ```
     */
    setItem(index: number, value: TypeInstance): void;
    /**
     * Sets the entire array instance to match another array instance.
     * This copies all element values from the source to this instance.
     * @example
     * ```ts
     * const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
     * const points1 = new Points();
     * const points2 = new Points();
     * const value = new TYPE_REGISTRY.i32();
     * value.set(42);
     * points1.setItem(0, value);
     * points2.set(points1); // Copies all values from points1 to points2
     * ```
     */
    set(value: TypeInstance): void;
    /** The number of elements in the array */
    length: number;
}

/**
 * Represents a struct type with named fields that are laid out sequentially
 * in memory. Each field has its own offset and can be accessed by name
 * through the static fields property.
 */
export interface StructType extends Type {
    /**
     * A map of field names to their definitions, containing information about
     * each field's type, offset, and alignment requirements.
     * 
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * console.log(Point.fields.x.offset); // 0 (bytes)
     * console.log(Point.fields.y.offset); // 4 (bytes)
     * ```
     */
    readonly fields: { [key: string]: FieldDefinition };
    /**
     * Creates a new instance of this struct type, optionally using an existing buffer.
     * If no buffer is provided, a new one will be allocated with the appropriate size.
     * @param buffer - Optional ArrayBuffer to use for this instance
     * @param offset - Optional byte offset into the buffer (defaults to 0)
     */
    new(buffer?: ArrayBuffer, offset?: number): StructInstance;
    /**
     * Creates a new array type with this struct type as its element type.
     * The resulting array type will have the same alignment as this struct type,
     * and its size will be structSize * length (with appropriate padding).
     * 
     * @param n - The number of elements in the array
     * @returns A new ArrayType with this struct type as its element type
     * 
     * @example
     * ```ts
     * const Point = makeStruct([
     *   { name: 'x', type: TYPE_REGISTRY.i32 },
     *   { name: 'y', type: TYPE_REGISTRY.i32 }
     * ]);
     * const Points = Point.array(2);
     * console.log(Points.size); // 16 (8 bytes per point * 2 points)
     * ```
     */
    array(n: number): ArrayType;
}

/**
 * Represents a union type where all fields share the same memory location.
 * Each field has an offset of 0 and can be accessed by name through the
 * static fields property.
 */
export interface UnionType extends Type {
    /**
     * A map of field names to their definitions, containing information about
     * each field's type and alignment requirements. All fields have offset 0
     * since they share the same memory location.
     * 
     * @example
     * ```ts
     * const Number = makeUnion([
     *   { name: 'i', type: TYPE_REGISTRY.i32 },
     *   { name: 'f', type: TYPE_REGISTRY.f64 }
     * ]);
     * console.log(Number.fields.i.offset); // 0 (bytes)
     * console.log(Number.fields.f.offset); // 0 (bytes)
     * ```
     */
    readonly fields: { [key: string]: FieldDefinition };
    /**
     * Creates a new instance of this union type, optionally using an existing buffer.
     * If no buffer is provided, a new one will be allocated with the appropriate size.
     * @param buffer - Optional ArrayBuffer to use for this instance
     * @param offset - Optional byte offset into the buffer (defaults to 0)
     */
    new(buffer?: ArrayBuffer, offset?: number): UnionInstance;
}

/**
 * Represents an array type with a fixed number of elements of the same type.
 * Elements are laid out sequentially in memory and can be accessed by index
 * through the static fields property.
 */
export interface ArrayType extends Type {
    /**
     * A map of array indices to field definitions, containing information about
     * each element's type, offset, and alignment requirements.
     * 
     * @example
     * ```ts
     * const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
     * console.log(Points.fields[0].offset); // 0 (bytes)
     * console.log(Points.fields[1].offset); // 4 (bytes)
     * ```
     */
    readonly fields: { [key: number]: FieldDefinition };
    /**
     * The type of each element in the array.
     * 
     * @example
     * ```ts
     * const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
     * console.log(Points.elementType === TYPE_REGISTRY.i32); // true
     * ```
     */
    readonly elementType: Type;
    /**
     * The number of elements in the array. This is fixed at creation time and cannot be changed.
     * 
     * @example
     * ```ts
     * const Points = makeArrayType(TYPE_REGISTRY.i32, 2);
     * console.log(Points.length); // 2
     * ```
     */
    readonly length: number;
    /**
     * Creates a new instance of this array type, optionally using an existing buffer.
     * If no buffer is provided, a new one will be allocated with the appropriate size.
     * @param buffer - Optional ArrayBuffer to use for this instance
     * @param offset - Optional byte offset into the buffer (defaults to 0)
     */
    new(buffer?: ArrayBuffer, offset?: number): ArrayInstance;
}

/**
 * Defines a field in a struct or union type.
 */
export type FieldDefinition = {
    /** The name of the field */
    readonly name: string;
    /** The type of the field */
    readonly type: Type;
    /** The byte offset of the field from the start of the struct/union */
    offset?: number;
    /** Optional alignment override for the field */
    alignment?: number;
};

/**
 * Options for creating a new type.
 */
export interface TypeOptions {
    /** Optional name to register the type in TYPE_REGISTRY */
    name?: string;
    /** Optional alignment override for the type */
    alignment?: number;
}

/**
 * Creates a new primitive type with the specified alignment and size.
 * The type will be registered in TYPE_REGISTRY if a name is provided.
 * 
 * @example
 * ```ts
 * const Int32 = makePrimitive(4, 4, PrimitiveKind.Int32, { name: "i32" });
 * const num = new Int32();
 * num.set(42);
 * console.log(num.get()); // 42
 * console.log(TYPE_REGISTRY.i32); // The primitive type
 * ```
 */
export function makePrimitive(alignment: number, size: number, kind: PrimitiveKind, options?: TypeOptions): PrimitiveType {
    const primitiveType = class {
        static readonly alignment = options?.alignment ?? alignment;
        static readonly size = size;
        static readonly kind = kind;

        static array(n: number): ArrayType {
            return makeArrayType((this as unknown) as Type, n);
        }

        static {
            Object.freeze(this);
        }

        #view: DataView;
        readonly buffer: ArrayBuffer;

        constructor(buffer?: ArrayBuffer, offset: number = 0) {
            if (!buffer) {
                buffer = new ArrayBuffer(size);
            }
            this.buffer = buffer;
            this.#view = new DataView(buffer, offset, size);
            return new Proxy(this, {
                get: (target, prop) => {
                    if (prop === "buffer") {
                        return target.buffer;
                    }
                    if (prop === "get") {
                        return () => {
                            switch (kind) {
                            case PrimitiveKind.Int8: return target.#view.getInt8(0);
                            case PrimitiveKind.Uint8: return target.#view.getUint8(0);
                            case PrimitiveKind.Int16: return target.#view.getInt16(0);
                            case PrimitiveKind.Uint16: return target.#view.getUint16(0);
                            case PrimitiveKind.Int32: return target.#view.getInt32(0);
                            case PrimitiveKind.Uint32: return target.#view.getUint32(0);
                            case PrimitiveKind.Int64: return Number(target.#view.getBigInt64(0));
                            case PrimitiveKind.Uint64: return Number(target.#view.getBigUint64(0));
                            case PrimitiveKind.Float32: return target.#view.getFloat32(0);
                            case PrimitiveKind.Float64: return target.#view.getFloat64(0);
                            case PrimitiveKind.Boolean: return target.#view.getUint8(0) !== 0;
                            default: throw new Error(`Unsupported primitive kind: ${kind}`);
                            }
                        };
                    }
                    if (prop === "set") {
                        return (value: number) => {
                            // Check value range based on kind
                            switch (kind) {
                            case PrimitiveKind.Int8:
                                if (value < -128 || value > 127) throw new Error(`Value ${value} out of range for Int8`);
                                target.#view.setInt8(0, value);
                                break;
                            case PrimitiveKind.Uint8:
                                if (value < 0 || value > 255) throw new Error(`Value ${value} out of range for Uint8`);
                                target.#view.setUint8(0, value);
                                break;
                            case PrimitiveKind.Int16:
                                if (value < -32768 || value > 32767) throw new Error(`Value ${value} out of range for Int16`);
                                target.#view.setInt16(0, value);
                                break;
                            case PrimitiveKind.Uint16:
                                if (value < 0 || value > 65535) throw new Error(`Value ${value} out of range for Uint16`);
                                target.#view.setUint16(0, value);
                                break;
                            case PrimitiveKind.Int32:
                                if (value < -2147483648 || value > 2147483647) throw new Error(`Value ${value} out of range for Int32`);
                                target.#view.setInt32(0, value);
                                break;
                            case PrimitiveKind.Uint32:
                                if (value < 0 || value > 4294967295) throw new Error(`Value ${value} out of range for Uint32`);
                                target.#view.setUint32(0, value);
                                break;
                            case PrimitiveKind.Int64:
                                target.#view.setBigInt64(0, BigInt(value));
                                break;
                            case PrimitiveKind.Uint64:
                                if (value < 0) throw new Error(`Value ${value} out of range for Uint64`);
                                target.#view.setBigUint64(0, BigInt(value));
                                break;
                            case PrimitiveKind.Float32:
                                target.#view.setFloat32(0, value);
                                break;
                            case PrimitiveKind.Float64:
                                target.#view.setFloat64(0, value);
                                break;
                            case PrimitiveKind.Boolean:
                                target.#view.setUint8(0, value ? 1 : 0);
                                break;
                            default:
                                throw new Error(`Unsupported primitive kind: ${kind}`);
                            }
                        };
                    }
                    return undefined;
                },
            });
        }
    } as unknown as PrimitiveType;

    if (options?.name) {
        TYPE_REGISTRY[options.name] = primitiveType;
    }

    return primitiveType;
}

/**
 * Registry of all types in the system. Initially empty, populated with basic primitive types
 * through the initializeTypeRegistry function. New types can be registered by adding them
 * to this object.
 */
export const TYPE_REGISTRY: { [key: string]: Type } = {};

/**
 * Initializes the TYPE_REGISTRY with all basic primitive types.
 * This function should be called once at startup.
 */
function initializeTypeRegistry() {
    // Signed integers
    TYPE_REGISTRY.i8 = makePrimitive(1, 1, PrimitiveKind.Int8, { name: "i8" });
    TYPE_REGISTRY.i16 = makePrimitive(2, 2, PrimitiveKind.Int16, { name: "i16" });
    TYPE_REGISTRY.i32 = makePrimitive(4, 4, PrimitiveKind.Int32, { name: "i32" });
    TYPE_REGISTRY.i64 = makePrimitive(8, 8, PrimitiveKind.Int64, { name: "i64" });

    // Unsigned integers
    TYPE_REGISTRY.u8 = makePrimitive(1, 1, PrimitiveKind.Uint8, { name: "u8" });
    TYPE_REGISTRY.u16 = makePrimitive(2, 2, PrimitiveKind.Uint16, { name: "u16" });
    TYPE_REGISTRY.u32 = makePrimitive(4, 4, PrimitiveKind.Uint32, { name: "u32" });
    TYPE_REGISTRY.u64 = makePrimitive(8, 8, PrimitiveKind.Uint64, { name: "u64" });

    // Floating point
    TYPE_REGISTRY.f32 = makePrimitive(4, 4, PrimitiveKind.Float32, { name: "f32" });
    TYPE_REGISTRY.f64 = makePrimitive(8, 8, PrimitiveKind.Float64, { name: "f64" });

    // Boolean
    TYPE_REGISTRY.bool = makePrimitive(1, 1, PrimitiveKind.Boolean, { name: "bool" });
}

// Initialize the type registry
initializeTypeRegistry();

/**
 * Creates a new array type with the specified element type and length.
 * The array type will have the same alignment as its element type, and
 * its size will be elementSize * length (with appropriate padding).
 * 
 * @example
 * ```ts
 * const Int32Array = makeArrayType(TYPE_REGISTRY.i32, 5, { name: "Int32Array" });
 * const arr = new Int32Array();
 * arr[0] = 42;  // Sets the first element to 42
 * console.log(arr[0]);  // 42
 * console.log(arr.buffer.byteLength); // 20 (4 * 5)
 * console.log(TYPE_REGISTRY.Int32Array); // The array type
 * ```
 */
export function makeArrayType(elementType: Type, n: number, options?: TypeOptions): ArrayType {
    // Calculate size first since we need it for initialization
    const elementSize = elementType.size;
    const totalSize = elementSize * n;
    const alignment = options?.alignment ?? elementType.alignment;
    const padding = (alignment - (totalSize % alignment)) % alignment;
    const size = totalSize + padding;

    const arrayType = class {
        static readonly alignment = alignment;
        static readonly size = size;
        static readonly elementType = elementType;
        static readonly length = n;
        static readonly fields = new Proxy({}, {
            get: (target, prop) => {
                const index = Number(prop);
                if (isNaN(index) || index < 0 || index >= n) {
                    return undefined;
                }
                return {
                    name: `[${index}]`,
                    type: elementType,
                    offset: index * elementSize,
                    alignment: elementType.alignment,
                };
            },
        });

        static array(n: number): ArrayType {
            return makeArrayType((this as unknown) as Type, n);
        }

        static {
            Object.freeze(this);
        }

        #view: DataView;
        readonly length = n;
        readonly buffer: ArrayBuffer;

        constructor(buffer?: ArrayBuffer, offset: number = 0) {
            if (!buffer) {
                buffer = new ArrayBuffer(size);
            }
            this.buffer = buffer;
            this.#view = new DataView(buffer, offset, size);
        }

        getItem(index: number): TypeInstance {
            if (index < 0 || index >= n) {
                throw new Error(`Index ${index} out of bounds for array of length ${n}`);
            }
            const ElementType = elementType as { new(buffer?: ArrayBuffer, offset?: number): TypeInstance };
            return new ElementType(this.buffer, this.#view.byteOffset + (index * elementSize));
        }

        setItem(index: number, value: TypeInstance): void {
            if (index < 0 || index >= n) {
                throw new Error(`Index ${index} out of bounds`);
            }
            if (!value || typeof value !== "object" || !("buffer" in value)) {
                throw new Error("Value must be a TypeInstance");
            }
            const elementOffset = this.#view.byteOffset + (index * elementSize);
            const targetView = new Uint8Array(this.buffer, elementOffset, elementType.size);
            targetView.set(new Uint8Array(value.buffer));
        }

        set(value: TypeInstance): void {
            if (!value || typeof value !== "object" || !("buffer" in value)) {
                throw new Error("Value must be a TypeInstance");
            }
            const targetView = new Uint8Array(this.buffer, this.#view.byteOffset, size);
            targetView.set(new Uint8Array(value.buffer));
        }
    } as unknown as ArrayType;

    if (options?.name) {
        TYPE_REGISTRY[options.name] = arrayType;
    }

    return arrayType;
}

/**
 * Creates a new struct type with the specified fields. Fields are laid out
 * sequentially in memory, with appropriate padding to maintain alignment
 * requirements.
 * 
 * @example
 * ```ts
 * const Point = makeStruct([
 *   { name: 'x', type: TYPE_REGISTRY.i32 },
 *   { name: 'y', type: TYPE_REGISTRY.i32 }
 * ], { name: "Point" });
 * const point = new Point();
 * console.log(point.buffer.byteLength); // 8
 * console.log(Point.fields.x.offset);   // 0
 * console.log(Point.fields.y.offset);   // 4
 * console.log(TYPE_REGISTRY.Point);     // The struct type
 * 
 * // Access fields through dot notation
 * const x = point.x;  // Returns a TypeInstance for the x field
 * const y = point.y;  // Returns a TypeInstance for the y field
 * ```
 */
export function makeStruct(fields: FieldDefinition[], options?: TypeOptions): StructType {
    // Validate field names
    for (const field of fields) {
        if (!field.name) {
            throw new Error("Field name cannot be empty");
        }
    }

    // Validate struct name
    if (options?.name === "") {
        throw new Error("Struct name cannot be empty");
    }

    // Check for duplicate type name
    if (options?.name && TYPE_REGISTRY[options.name]) {
        throw new Error("Type name already exists in TYPE_REGISTRY");
    }

    // Calculate alignment and size first since we need them for initialization
    const alignment = options?.alignment ?? Math.max(...fields.map(f => f.alignment ?? f.type.alignment));
    let currentOffset = 0;
    fields.forEach(field => {
        const fieldAlignment = field.alignment ?? field.type.alignment;
        // Align the current offset to the field's alignment
        const padding = (fieldAlignment - (currentOffset % fieldAlignment)) % fieldAlignment;
        currentOffset += padding;
        field.offset = currentOffset;
        currentOffset += field.type.size;
    });
    // If a custom alignment is provided, use it for the final size padding
    const finalAlign = options?.alignment ?? alignment;
    const finalPadding = (finalAlign - (currentOffset % finalAlign)) % finalAlign;
    const size = currentOffset + finalPadding;

    const structType = class {
        static readonly alignment = alignment;
        static readonly size = size;
        static readonly fields = Object.fromEntries(fields.map(f => [f.name, f]));

        static array(n: number): ArrayType {
            return makeArrayType((this as unknown) as Type, n);
        }

        static {
            Object.freeze(this);
        }

        #view: DataView;
        readonly buffer: ArrayBuffer;

        constructor(buffer?: ArrayBuffer, offset: number = 0) {
            if (!buffer) {
                buffer = new ArrayBuffer(size);
            }
            this.buffer = buffer;
            this.#view = new DataView(buffer, offset, size);
        }

        getField(name: string): TypeInstance {
            const field = (this.constructor as unknown as { fields: { [key: string]: FieldDefinition } }).fields[name];
            if (!field) {
                throw new Error(`Field ${name} not found in struct`);
            }
            const FieldType = field.type as { new(buffer?: ArrayBuffer, offset?: number): TypeInstance };
            return new FieldType(this.buffer, this.#view.byteOffset + (field.offset ?? 0));
        }

        setField(name: string, value: TypeInstance): void {
            const field = (this.constructor as unknown as { fields: { [key: string]: FieldDefinition } }).fields[name];
            if (!field) {
                throw new Error(`Field ${name} not found`);
            }
            if (!value || typeof value !== "object" || !("buffer" in value)) {
                throw new Error("Value must be a TypeInstance");
            }
            const fieldOffset = this.#view.byteOffset + (field.offset ?? 0);
            const targetView = new Uint8Array(this.buffer, fieldOffset, field.type.size);
            targetView.set(new Uint8Array(value.buffer));
        }

        set(value: TypeInstance | object): void {
            // Accept plain JS object and box it
            if (typeof value === "object" && value !== null && !("buffer" in value)) {
                value = boxToTypeInstance(this.constructor as any, value);
            }
            if (!value || typeof value !== "object" || !("buffer" in value)) {
                throw new Error("Value must be a TypeInstance");
            }
            const targetView = new Uint8Array(this.buffer, this.#view.byteOffset, size);
            targetView.set(new Uint8Array(value.buffer));
        }
    } as unknown as StructType;

    if (options?.name) {
        TYPE_REGISTRY[options.name] = structType;
    }

    return structType;
}

/**
 * Creates a new union type with the specified fields. All fields share the
 * same memory location (offset 0), and the union's size is the maximum size
 * of all fields (with appropriate padding).
 * 
 * @example
 * ```ts
 * const Number = makeUnion([
 *   { name: 'i', type: TYPE_REGISTRY.i32 },
 *   { name: 'f', type: TYPE_REGISTRY.f64 }
 * ], { name: "Number" });
 * const num = new Number();
 * console.log(num.buffer.byteLength); // 8
 * console.log(Number.fields.i.offset); // 0
 * console.log(Number.fields.f.offset); // 0
 * console.log(TYPE_REGISTRY.Number);   // The union type
 * 
 * // Access fields through dot notation
 * const i = num.i;  // Returns a TypeInstance for the i field
 * const f = num.f;  // Returns a TypeInstance for the f field
 * ```
 */
export function makeUnion(fields: FieldDefinition[], options?: TypeOptions): UnionType {
    // Validate field names
    for (const field of fields) {
        if (!field.name) {
            throw new Error("Field name cannot be empty");
        }
    }

    // Validate union name
    if (options?.name === "") {
        throw new Error("Union name cannot be empty");
    }

    // Check for duplicate type name
    if (options?.name && TYPE_REGISTRY[options.name]) {
        throw new Error("Type name already exists in TYPE_REGISTRY");
    }

    // Calculate alignment and size first since we need them for initialization
    const alignment = options?.alignment ?? Math.max(...fields.map(f => f.alignment ?? f.type.alignment));
    const maxFieldSize = Math.max(...fields.map(f => f.type.size));
    const padding = (alignment - (maxFieldSize % alignment)) % alignment;
    const size = maxFieldSize + padding;
    
    // Set all field offsets to 0 since they all start at the beginning in a union
    fields.forEach(field => {
        field.offset = 0;
    });

    const unionType = class {
        static readonly alignment = alignment;
        static readonly size = size;
        static readonly fields = Object.fromEntries(fields.map(f => [f.name, f]));
        static readonly kind = 2; // Set kind to 2 for unions

        static array(n: number): ArrayType {
            return makeArrayType((this as unknown) as Type, n);
        }

        static {
            Object.freeze(this);
        }

        #view: DataView;
        readonly buffer: ArrayBuffer;

        constructor(buffer?: ArrayBuffer, offset: number = 0) {
            if (!buffer) {
                buffer = new ArrayBuffer(size);
            }
            this.buffer = buffer;
            this.#view = new DataView(buffer, offset, size);
        }

        getField(name: string): TypeInstance {
            const field = (this.constructor as unknown as { fields: { [key: string]: FieldDefinition } }).fields[name];
            if (!field) {
                throw new Error(`Field ${name} not found in union`);
            }
            const FieldType = field.type as { new(buffer?: ArrayBuffer, offset?: number): TypeInstance };
            return new FieldType(this.buffer, this.#view.byteOffset + (field.offset ?? 0));
        }

        setField(name: string, value: TypeInstance): void {
            const field = (this.constructor as unknown as { fields: { [key: string]: FieldDefinition } }).fields[name];
            if (!field) {
                throw new Error(`Field ${name} not found`);
            }
            if (!value || typeof value !== "object" || !("buffer" in value)) {
                throw new Error("Value must be a TypeInstance");
            }
            const fieldOffset = this.#view.byteOffset + (field.offset ?? 0);
            const targetView = new Uint8Array(this.buffer, fieldOffset, field.type.size);
            targetView.set(new Uint8Array(value.buffer));
        }

        set(value: TypeInstance | object): void {
            if (typeof value === "object" && value !== null && !("buffer" in value)) {
                const isUnion = "kind" in this && (this as any).kind === 2;
                if (isUnion) {
                    // Use the static fields object from the constructor
                    const fieldsRecord = ((this.constructor as unknown) as { fields: Record<string, FieldDefinition> }).fields;
                    const presentFields = Object.keys(fieldsRecord).filter(field => (value as Record<string, unknown>)[field] !== undefined);
                    if (presentFields.length === 1) {
                        const assignedField = presentFields[0];
                        if (!assignedField || !(assignedField in fieldsRecord)) {
                            throw new Error(`Invalid field '${assignedField}' in union assignment`);
                        }
                        // Box the value for the assigned field
                        const fieldType = fieldsRecord[assignedField].type;
                        const boxedField = boxToTypeInstance(fieldType, (value as Record<string, unknown>)[assignedField]);
                        if (typeof (this as any).setField === "function") {
                            (this as any).setField(assignedField, boxedField);
                        }
                        // Return the union instance after setting the field
                        return;
                    } else {
                        throw new Error("Union assignment must have exactly one present field");
                    }
                }
            }
            if (!value || typeof value !== "object" || !("buffer" in value)) {
                throw new Error("Value must be a TypeInstance");
            }
            const targetView = new Uint8Array(this.buffer, this.#view.byteOffset, size);
            targetView.set(new Uint8Array((value as TypeInstance).buffer));
        }
    } as unknown as UnionType;

    if (options?.name) {
        TYPE_REGISTRY[options.name] = unionType;
    }

    return unionType;
}

// Helper to recursively box a JS object into a TypeInstance of the given type
function boxToTypeInstance(TypeCtor: { new(buffer?: ArrayBuffer, offset?: number): TypeInstance } & { kind?: number, fields?: Record<string, any> }, value: any): TypeInstance {
    const instance = new TypeCtor();

    // Handle primitive types
    if (isPrimitiveTypeInstance(instance)) {
        if (typeof value === "number") {
            instance.set(value);
            return instance;
        }
        if (typeof value === "boolean" && TypeCtor.kind === PrimitiveKind.Boolean) {
            instance.set(value ? 1 : 0);
            return instance;
        }
        throw new Error(`Expected number for primitive type, got ${typeof value}`);
    }

    // Handle structs
    if ("getField" in instance && typeof instance.getField === "function" && TypeCtor.fields) {
        // For unions, we need to handle the case where the value is an object with a single field
        if (TypeCtor.kind === 2) { // Union type
            // Use the static fields object from the type constructor
            const fieldsRecord = TypeCtor.fields as Record<string, FieldDefinition>;
            const fields = Object.keys(fieldsRecord);
            if (typeof value === "object" && value !== null) {
                const valueFields = Object.keys(value);
                if (valueFields.length !== 1) {
                    throw new Error(`Union value must have exactly one field, got ${valueFields.length}`);
                }
                const fieldName = valueFields[0];
                if (!fields.includes(fieldName)) {
                    throw new Error(`Field ${fieldName} not found in union`);
                }
                const fieldValue = value[fieldName];
                const fieldType = fieldsRecord[fieldName].type;
                if (typeof (instance as any).setField === "function") {
                    const boxedValue = boxToTypeInstance(fieldType, fieldValue);
                    (instance as any).setField(fieldName, boxedValue);
                }
                return instance;
            }
            throw new Error(`Expected object for union type, got ${typeof value}`);
        }

        // For structs, copy all fields
        if (typeof value === "object" && value !== null) {
            // Use the static fields object from the constructor
            const fieldsRecord = TypeCtor.fields as Record<string, FieldDefinition>;
            const fields = Object.keys(fieldsRecord);
            const valueFields = Object.keys(value);
            
            // Check for extra fields
            const extraFields = valueFields.filter(f => !fields.includes(f));
            if (extraFields.length > 0) {
                throw new Error(`Extra fields found in struct: ${extraFields.join(", ")}`);
            }

            // Check for missing required fields
            const missingFields = fields.filter(f => !valueFields.includes(f));
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields in struct: ${missingFields.join(", ")}`);
            }

            for (const fieldName of fields) {
                if (fieldName in value) {
                    const fieldValue = value[fieldName];
                    const fieldType = fieldsRecord[fieldName].type;
                    if (typeof (instance as any).setField === "function") {
                        const boxedValue = boxToTypeInstance(fieldType, fieldValue);
                        (instance as any).setField(fieldName, boxedValue);
                    }
                }
            }
            return instance;
        }
        throw new Error(`Expected object for struct type, got ${typeof value}`);
    }

    // Handle arrays
    if ("getItem" in instance && typeof instance.getItem === "function") {
        const elementType = (TypeCtor as any).elementType;
        if (!elementType) {
            throw new Error("Array type missing elementType");
        }

        if (Array.isArray(value)) {
            const length = (TypeCtor as any).length;
            if (value.length !== length) {
                throw new Error(`Expected array of length ${length}, got ${value.length}`);
            }
            for (let i = 0; i < length; ++i) {
                if (i in value) {
                    const boxedElem = boxToTypeInstance(elementType, value[i]);
                    if (typeof (instance as any).setItem === "function") {
                        (instance as any).setItem(i, boxedElem);
                    }
                }
            }
            return instance;
        }
        throw new Error(`Expected array, got ${typeof value}`);
    }

    // If we get here, we couldn't handle the value
    throw new Error(`Cannot box value of type ${typeof value} to ${TypeCtor.name}`);
}

function isPrimitiveTypeInstance(instance: any): instance is PrimitiveInstance {
    if (!instance || typeof instance !== "object") return false;
    if (typeof instance.get !== "function" || typeof instance.set !== "function") return false;
    try {
        const v = instance.get();
        if (typeof v === "number" || typeof v === "boolean") return true;
    } catch {}
    return false;
}

function wrapTypeInstance(instance: TypeInstance): any {
    if (isPrimitiveTypeInstance(instance)) {
        const primitiveType = (instance as any).constructor;
        if (primitiveType.kind === PrimitiveKind.Boolean) {
            return instance.get() !== 0;
        }
        return instance.get();
    }
    return new Proxy({}, {
        get: (_target, prop) => {
            if (typeof prop !== "string") return undefined;
            // Handle array length
            if (prop === "length" && "getItem" in instance && typeof instance.getItem === "function") {
                return (instance as ArrayInstance).length;
            }
            // Struct/union
            if ("getField" in instance && typeof instance.getField === "function") {
                const field = instance.getField(prop);
                if (isPrimitiveTypeInstance(field)) {
                    return field.get();
                }
                return wrapTypeInstance(field);
            }
            // Array
            if ("getItem" in instance && typeof instance.getItem === "function") {
                const index = Number(prop);
                if (isNaN(index)) return undefined;
                const arrayInstance = instance as ArrayInstance;
                if (index < 0 || index >= arrayInstance.length) {
                    throw new Error(`Index ${index} out of bounds for array of length ${arrayInstance.length}`);
                }
                const item = instance.getItem(index);
                if (isPrimitiveTypeInstance(item)) {
                    return item.get();
                }
                return wrapTypeInstance(item);
            }
            return undefined;
        },
        set: (_target, prop, value) => {
            if (typeof prop !== "string") return false;
            // Struct/union
            if ("setField" in instance && typeof instance.setField === "function") {
                const ctor = instance.constructor as { fields?: Record<string, FieldDefinition> };
                const fieldDef = ctor.fields?.[prop];
                if (!fieldDef) {
                    throw new Error(`Field ${prop} not found in struct/union`);
                }
                const FieldType = fieldDef.type as { new(buffer?: ArrayBuffer, offset?: number): TypeInstance } & { kind?: PrimitiveKind };
                if (typeof value === "number") {
                    const boxed = new FieldType();
                    (boxed as unknown as PrimitiveInstance).set(value);
                    instance.setField(prop, boxed);
                    return true;
                }
                if (typeof value === "boolean" && FieldType.kind === PrimitiveKind.Boolean) {
                    const boxed = new FieldType();
                    (boxed as unknown as PrimitiveInstance).set(value ? 1 : 0);
                    instance.setField(prop, boxed);
                    return true;
                }
                if (typeof value === "object" && value !== null) {
                    const boxed = boxToTypeInstance(FieldType, value);
                    instance.setField(prop, boxed);
                    return true;
                }
                throw new Error(`Invalid value type for field ${prop}`);
            }
            // Array
            if ("setItem" in instance && typeof instance.setItem === "function") {
                const index = Number(prop);
                if (isNaN(index)) return false;
                const arrayInstance = instance as ArrayInstance;
                if (index < 0 || index >= arrayInstance.length) {
                    throw new Error(`Index ${index} out of bounds for array of length ${arrayInstance.length}`);
                }
                const ctor = instance.constructor as { elementType?: Type };
                const ItemType = ctor.elementType as { new(buffer?: ArrayBuffer, offset?: number): TypeInstance } & { kind?: PrimitiveKind };
                if (!ItemType) return false;
                if (typeof value === "number") {
                    const boxed = new ItemType();
                    (boxed as unknown as PrimitiveInstance).set(value);
                    instance.setItem(index, boxed);
                    return true;
                }
                if (typeof value === "boolean" && ItemType.kind === PrimitiveKind.Boolean) {
                    const boxed = new ItemType();
                    (boxed as unknown as PrimitiveInstance).set(value ? 1 : 0);
                    instance.setItem(index, boxed);
                    return true;
                }
                if (typeof value === "object" && value !== null) {
                    const boxed = boxToTypeInstance(ItemType, value);
                    instance.setItem(index, boxed);
                    return true;
                }
                throw new Error(`Invalid value type for array element at index ${index}`);
            }
            return false;
        },
    });
}

/**
 * Creates a JavaScript-like interface for a TypeInstance. The returned object
 * will have properties that match the fields of the type, and setting these
 * properties will automatically call the appropriate set methods on the
 * underlying TypeInstance.
 */
export function asObj<T extends object>(instance: TypeInstance): T {
    return wrapTypeInstance(instance) as T;
}

// Helper function to check if a value is a TypeInstance
export function isTypeInstance(value: unknown): value is TypeInstance {
    return value !== null && 
           typeof value === "object" && 
           "buffer" in value;
}

// Helper function to check if a value is a PrimitiveInstance
export function isPrimitiveInstance(value: unknown): value is PrimitiveInstance {
    return isTypeInstance(value) && 
           typeof (value as any).get === "function" && 
           typeof (value as any).set === "function";
}

/**
 * Recursively convert a TypeInstance (struct, array, primitive) into a plain JS object or array.
 */
export function toPlainObject(instance: TypeInstance): any {
    if (isPrimitiveTypeInstance(instance)) {
        return instance.get();
    }
    // Struct or union
    if ("getField" in instance && typeof instance.getField === "function") {
        const ctor = instance.constructor as { fields?: Record<string, FieldDefinition> };
        const fields = ctor.fields || {};
        const obj: Record<string, any> = {};
        for (const key of Object.keys(fields)) {
            const field = instance.getField(key);
            obj[key] = toPlainObject(field);
        }
        return obj;
    }
    // Array
    if ("getItem" in instance && typeof instance.getItem === "function" && "length" in instance) {
        const arr = [];
        for (let i = 0; i < (instance as any).length; ++i) {
            const item = instance.getItem(i);
            arr.push(toPlainObject(item));
        }
        return arr;
    }
    return undefined;
}
