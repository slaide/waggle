/**
 * Common interface for type descriptors.
 * Defines the size, alignment, and methods for reading/writing values.
 */
export interface TypeDescriptor {
    /** Size in bytes */
    sizeof: number;
    /** Alignment in bytes */
    alignment: number;
    /** Read value from DataView */
    get: (view: DataView, offset: number) => any;
    /** Write value to DataView */
    set: (view: DataView, offset: number, value: any) => void;
    /** Create array type */
    array: (size: number) => TypeDescriptor;
}

/**
 * Error class for struct/union operations.
 */
class StructError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StructError';
    }
}

/**
 * Validates a field's name.
 * @param field - The field to validate.
 * @param context - The context (e.g., 'Field' or 'Union') for error messages.
 * @throws {StructError} If the field name is empty.
 */
function validateFieldName(field: Field, context: string): void {
    if (field.name === '') {
        throw new StructError(`${context} name cannot be empty`);
    }
}

/**
 * Calculates the alignment for a set of fields.
 * @param fields - The fields to calculate alignment for.
 * @param customAlignment - Optional custom alignment to override field alignments.
 * @returns The calculated alignment in bytes.
 */
function calculateAlignment(fields: Field[], customAlignment?: number): number {
    if (customAlignment) return customAlignment;
    return Math.max(...fields.map(f => f.alignment || f.type.alignment));
}

/**
 * Creates a Proxy for array-like access to struct/union arrays.
 * @param arr - The array to proxy.
 * @param size - The size of the array.
 * @param view - The DataView backing the array.
 * @param offset - The offset into the DataView.
 * @param elementType - The type descriptor for array elements.
 * @param ctor - Optional constructor for complex types.
 * @returns A proxied array with get/set traps.
 */
function createArrayProxy(arr: any[], size: number, view: DataView, offset: number, elementType: TypeDescriptor, ctor?: Function): any {
    return new Proxy(arr, {
        get(target, prop) {
            if (typeof prop === "string" && /^\d+$/.test(prop)) {
                return target[Number(prop)];
            }
            if (prop === 'length') return size;
            return target[prop as any];
        },
        set(target, prop, value) {
            if (typeof prop === "string" && /^\d+$/.test(prop)) {
                const idx = Number(prop);
                if (idx < 0 || idx >= size) return false;
                if (ctor) {
                    // For complex types, copy fields
                    Object.assign(target[idx], value);
                } else {
                    target[idx] = value;
                    elementType.set(view, offset + idx * elementType.sizeof, value);
                }
                return true;
            }
            return false;
        }
    });
}

/**
 * Helper to create array type descriptor for primitives and complex types.
 * @param elementType - The type descriptor for array elements.
 * @param size - The size of the array.
 * @param ctor - Optional constructor for complex types.
 * @returns A callable array constructor with TypeDescriptor properties.
 */
function createArrayType(elementType: TypeDescriptor, size: number, ctor?: Function): TypeDescriptor & Function {
    // Callable array constructor
    const ArrayCtor = function() {
        const buffer = new ArrayBuffer(elementType.sizeof * size);
        const view = new DataView(buffer);
        const arr = [];
        for (let i = 0; i < size; i++) {
            const offset = i * elementType.sizeof;
            if (ctor) {
                arr[i] = ctor(view, offset);
            } else {
                arr[i] = elementType.get(view, offset);
            }
        }
        return createArrayProxy(arr, size, view, 0, elementType, ctor);
    };

    // Attach TypeDescriptor properties
    Object.assign(ArrayCtor, {
        sizeof: elementType.sizeof * size,
        alignment: elementType.alignment,
        get: (view: DataView, offset: number) => {
            const arr = [];
            for (let i = 0; i < size; i++) {
                const elementOffset = offset + (i * elementType.sizeof);
                if (ctor) {
                    arr[i] = ctor(view, elementOffset);
                } else {
                    arr[i] = elementType.get(view, elementOffset);
                }
            }
            return createArrayProxy(arr, size, view, offset, elementType, ctor);
        },
        set: (view: DataView, offset: number, value: any[]) => {
            if (!Array.isArray(value)) {
                throw new StructError("Expected array value");
            }
            if (value.length !== size) {
                throw new StructError(`Expected array of length ${size}, got ${value.length}`);
            }
            for (let i = 0; i < size; i++) {
                const elementOffset = offset + (i * elementType.sizeof);
                if (ctor) {
                    Object.assign(ctor(view, elementOffset), value[i]);
                } else {
                    elementType.set(view, elementOffset, value[i]);
                }
            }
        },
        array: (newSize: number) => createArrayType(elementType, newSize, ctor)
    });
    return ArrayCtor as any;
}

/**
 * Registry of primitive types.
 */
export const TYPE_REGISTRY: { [key: string]: any } = {
    f32: {
        sizeof: 4,
        alignment: 4,
        get: (view: DataView, offset: number) => view.getFloat32(offset, true),
        set: (view: DataView, offset: number, value: number) => view.setFloat32(offset, value, true),
        array: (size: number) => createArrayType(TYPE_REGISTRY["f32"], size)
    },
    f64: {
        sizeof: 8,
        alignment: 8,
        get: (view: DataView, offset: number) => view.getFloat64(offset, true),
        set: (view: DataView, offset: number, value: number) => view.setFloat64(offset, value, true),
        array: (size: number) => createArrayType(TYPE_REGISTRY["f64"], size)
    },
    i8: {
        sizeof: 1,
        alignment: 1,
        get: (view: DataView, offset: number) => view.getInt8(offset),
        set: (view: DataView, offset: number, value: number) => view.setInt8(offset, value),
        array: (size: number) => createArrayType(TYPE_REGISTRY["i8"], size)
    },
    i16: {
        sizeof: 2,
        alignment: 2,
        get: (view: DataView, offset: number) => view.getInt16(offset, true),
        set: (view: DataView, offset: number, value: number) => view.setInt16(offset, value, true),
        array: (size: number) => createArrayType(TYPE_REGISTRY["i16"], size)
    },
    i32: {
        sizeof: 4,
        alignment: 4,
        get: (view: DataView, offset: number) => view.getInt32(offset, true),
        set: (view: DataView, offset: number, value: number) => view.setInt32(offset, value, true),
        array: (size: number) => createArrayType(TYPE_REGISTRY["i32"], size)
    },
    u8: {
        sizeof: 1,
        alignment: 1,
        get: (view: DataView, offset: number) => view.getUint8(offset),
        set: (view: DataView, offset: number, value: number) => view.setUint8(offset, value),
        array: (size: number) => createArrayType(TYPE_REGISTRY["u8"], size)
    },
    u16: {
        sizeof: 2,
        alignment: 2,
        get: (view: DataView, offset: number) => view.getUint16(offset, true),
        set: (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true),
        array: (size: number) => createArrayType(TYPE_REGISTRY["u16"], size)
    },
    u32: {
        sizeof: 4,
        alignment: 4,
        get: (view: DataView, offset: number) => view.getUint32(offset, true),
        set: (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true),
        array: (size: number) => createArrayType(TYPE_REGISTRY["u32"], size)
    }
};

/**
 * Represents a field in a struct or union.
 */
type Field = {
    /** Field name */
    name: string;
    /** Field type descriptor */
    type: TypeDescriptor;
    /** Optional custom alignment */
    alignment?: number;
};

/**
 * Represents an instance of a struct.
 */
export interface StructInstance extends Record<string, any> {}

/**
 * Represents a struct constructor with static properties.
 */
export interface StructConstructor extends TypeDescriptor {
    /** Creates a new struct instance */
    (): StructInstance;
    /** Creates an array type of this struct */
    array: (size: number) => any;
}

/**
 * Creates a struct type with the given fields.
 * Handles alignment and offset calculation according to C rules.
 * @param fields - The fields of the struct.
 * @param name - Optional name to cache the struct in TYPE_REGISTRY.
 * @param alignment - Optional custom alignment.
 * @returns A constructor for struct instances, with static sizeof/alignment/get/set/array.
 * @throws {StructError} If the name is empty or already exists in TYPE_REGISTRY.
 */
export function makeStruct(fields: Field[], name?: string, alignment?: number): StructConstructor {
    // Validate name
    if (name === '') {
        throw new StructError('Struct name cannot be empty');
    }
    if (name && TYPE_REGISTRY[name]) {
        throw new StructError('Type name already exists in TYPE_REGISTRY');
    }

    // Validate fields
    fields.forEach(field => validateFieldName(field, 'Field'));

    // Calculate alignment for the struct
    const maxAlignment = calculateAlignment(fields, alignment);

    // Calculate total size with alignment and field offsets
    let totalSize = 0;
    for (const field of fields) {
        let fieldAlignment = field.alignment || field.type.alignment;
        if (alignment && fieldAlignment > alignment) {
            fieldAlignment = alignment;
        }
        // Align current offset to field's alignment
        if (totalSize % fieldAlignment !== 0) {
            totalSize += fieldAlignment - (totalSize % fieldAlignment);
        }
        totalSize += field.type.sizeof;
    }
    // Final struct alignment
    if (totalSize % maxAlignment !== 0) {
        totalSize += maxAlignment - (totalSize % maxAlignment);
    }

    // Struct constructor: creates a new instance backed by a DataView
    const StructConstructor = Object.assign(
        function() {
            const buffer = new ArrayBuffer(totalSize);
            const view = new DataView(buffer);
            const instance: StructInstance = {};
            let currentOffset = 0;
            // Define properties for each field
            fields.forEach(field => {
                let fieldAlignment = field.alignment || field.type.alignment;
                if (alignment && fieldAlignment > alignment) {
                    fieldAlignment = alignment;
                }
                if (currentOffset % fieldAlignment !== 0) {
                    currentOffset += fieldAlignment - (currentOffset % fieldAlignment);
                }
                const offset = currentOffset;
                Object.defineProperty(instance, field.name, {
                    get: () => field.type.get(view, offset),
                    set: (value: any) => field.type.set(view, offset, value),
                    enumerable: true
                });
                currentOffset += field.type.sizeof;
            });
            return instance;
        },
        {
            sizeof: totalSize,
            alignment: maxAlignment,
            /**
             * Get a struct instance from a DataView and offset
             */
            get: (view: DataView, offset: number) => {
                const instance: StructInstance = {};
                let currentOffset = offset;
                fields.forEach(field => {
                    let fieldAlignment = field.alignment || field.type.alignment;
                    if (alignment && fieldAlignment > alignment) {
                        fieldAlignment = alignment;
                    }
                    if (currentOffset % fieldAlignment !== 0) {
                        currentOffset += fieldAlignment - (currentOffset % fieldAlignment);
                    }
                    const fieldOffset = currentOffset;
                    Object.defineProperty(instance, field.name, {
                        get: () => field.type.get(view, fieldOffset),
                        set: (value: any) => field.type.set(view, fieldOffset, value),
                        enumerable: true
                    });
                    currentOffset += field.type.sizeof;
                });
                return instance;
            },
            /**
             * Set a struct instance's fields from a value object
             */
            set: (view: DataView, offset: number, value: StructInstance) => {
                let currentOffset = offset;
                fields.forEach(field => {
                    let fieldAlignment = field.alignment || field.type.alignment;
                    if (alignment && fieldAlignment > alignment) {
                        fieldAlignment = alignment;
                    }
                    if (currentOffset % fieldAlignment !== 0) {
                        currentOffset += fieldAlignment - (currentOffset % fieldAlignment);
                    }
                    const fieldOffset = currentOffset;
                    field.type.set(view, fieldOffset, value[field.name]);
                    currentOffset += field.type.sizeof;
                });
            },
            /**
             * Create an array type of this struct
             */
            array: (size: number) => createArrayType(StructConstructor, size, (view: DataView, offset: number) => StructConstructor.get(view, offset))
        }
    );

    // Cache in TYPE_REGISTRY if name is provided
    if (name) {
        TYPE_REGISTRY[name] = StructConstructor as any;
    }
    return StructConstructor as StructConstructor;
}

/**
 * Represents an instance of a union.
 */
export type UnionInstance = {
    [key: string]: any;
};

/**
 * Represents a union constructor with static properties.
 */
export type UnionConstructor = {
    /** Creates a new union instance */
    (): UnionInstance;
    /** Size in bytes */
    sizeof: number;
    /** Alignment in bytes */
    alignment: number;
    /** Get a union instance from a DataView and offset */
    get: (view: DataView, offset: number) => UnionInstance;
    /** Set a union instance's field from a value object */
    set: (view: DataView, offset: number, value: UnionInstance) => void;
    /** Create an array type of this union */
    array: (size: number) => any;
};

/**
 * Creates a union type with the given fields.
 * Handles alignment and size according to C rules.
 * @param fields - The fields of the union.
 * @param name - Optional name to cache the union in TYPE_REGISTRY.
 * @param alignment - Optional custom alignment.
 * @returns A constructor for union instances, with static sizeof/alignment/get/set/array.
 * @throws {StructError} If the name is empty or already exists in TYPE_REGISTRY.
 */
export function makeUnion(fields: Field[], name?: string, alignment?: number): UnionConstructor {
    // Validate name
    if (name === '') {
        throw new StructError('Union name cannot be empty');
    }
    if (name && TYPE_REGISTRY[name]) {
        throw new StructError('Type name already exists in TYPE_REGISTRY');
    }
    // Validate fields
    fields.forEach(field => validateFieldName(field, 'Field'));
    // Calculate alignment and size
    const maxAlignment = calculateAlignment(fields, alignment);
    const totalSize = Math.max(...fields.map(f => f.type.sizeof));
    // Union constructor: creates a new instance backed by a DataView
    const UnionConstructor = Object.assign(
        function() {
            const buffer = new ArrayBuffer(totalSize);
            const view = new DataView(buffer);
            const instance: UnionInstance = {};
            // Define properties for each field (all at offset 0)
            fields.forEach(field => {
                Object.defineProperty(instance, field.name, {
                    get: () => field.type.get(view, 0),
                    set: (value: any) => field.type.set(view, 0, value),
                    enumerable: true
                });
            });
            return instance;
        },
        {
            sizeof: totalSize,
            alignment: maxAlignment,
            /**
             * Get a union instance from a DataView and offset
             */
            get: (view: DataView, offset: number) => {
                const instance: UnionInstance = {};
                fields.forEach(field => {
                    Object.defineProperty(instance, field.name, {
                        get: () => field.type.get(view, offset),
                        set: (value: any) => field.type.set(view, offset, value),
                        enumerable: true
                    });
                });
                return instance;
            },
            /**
             * Set a union instance's field from a value object
             */
            set: (view: DataView, offset: number, value: UnionInstance) => {
                fields.forEach(field => {
                    if (field.name in value) {
                        field.type.set(view, offset, value[field.name]);
                    }
                });
            },
            /**
             * Create an array type of this union
             */
            array: (size: number) => createArrayType(UnionConstructor, size, (view: DataView, offset: number) => UnionConstructor.get(view, offset))
        }
    );
    // Cache in TYPE_REGISTRY if name is provided
    if (name) {
        TYPE_REGISTRY[name] = UnionConstructor as any;
    }
    return UnionConstructor as UnionConstructor;
}

/**
 * Creates a type-punned version of a struct that maintains the same binary layout
 * but with a different TypeScript interface.
 * 
 * @param structCtor - The original struct constructor
 * @param name - Optional name to cache the punned type in TYPE_REGISTRY
 * @returns A new constructor that maintains the same binary layout but with the new type interface
 * 
 * @example
 * ```typescript
 * // Original struct
 * const Vec3 = makeStruct([
 *   { name: 'x', type: TYPE_REGISTRY.f32 },
 *   { name: 'y', type: TYPE_REGISTRY.f32 },
 *   { name: 'z', type: TYPE_REGISTRY.f32 }
 * ]);
 * 
 * // Type-punned version with a different interface
 * interface Point3D {
 *   position: { x: number, y: number, z: number };
 * }
 * const Point3D = typePun<Point3D>(Vec3);
 * ```
 */
export function typePun<T>(structCtor: StructConstructor, name?: string): StructConstructor & (() => T) {
    // Validate name
    if (name === '') {
        throw new StructError('Type-punned struct name cannot be empty');
    }
    if (name && TYPE_REGISTRY[name]) {
        throw new StructError('Type name already exists in TYPE_REGISTRY');
    }

    // Create a new constructor that maintains the same binary layout
    const PunnedConstructor = Object.assign(
        function() {
            return structCtor() as unknown as T;
        },
        {
            sizeof: structCtor.sizeof,
            alignment: structCtor.alignment,
            get: (view: DataView, offset: number) => {
                return structCtor.get(view, offset) as unknown as T;
            },
            set: (view: DataView, offset: number, value: T) => {
                structCtor.set(view, offset, value as unknown as StructInstance);
            },
            array: (size: number) => {
                const arrayType = structCtor.array(size);
                return Object.assign(
                    function() {
                        return arrayType() as unknown as T[];
                    },
                    {
                        sizeof: arrayType.sizeof,
                        alignment: arrayType.alignment,
                        get: (view: DataView, offset: number) => {
                            return arrayType.get(view, offset) as unknown as T[];
                        },
                        set: (view: DataView, offset: number, value: T[]) => {
                            arrayType.set(view, offset, value as unknown as StructInstance[]);
                        },
                        array: (newSize: number) => arrayType.array(newSize)
                    }
                );
            }
        }
    );

    // Cache in TYPE_REGISTRY if name is provided
    if (name) {
        TYPE_REGISTRY[name] = PunnedConstructor as any;
    }

    return PunnedConstructor as StructConstructor & (() => T);
}
