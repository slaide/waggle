/**
 * ByteReader - A wrapper around ArrayBuffer + DataView for efficient binary data reading
 * with automatic endianness handling and position tracking
 */
export class ByteReader {
    /** DataView for reading binary data */
    private dataView: DataView;
    
    /** Current read position in bytes */
    private position: number = 0;
    
    /** Whether the data is little-endian (false = big-endian) */
    private dataLittleEndian: boolean;

    /**
     * Create a new ByteReader
     * @param buffer - ArrayBuffer or SharedArrayBuffer containing the binary data
     * @param dataLittleEndian - Whether the data is stored in little-endian format
     * @param byteOffset - Optional starting offset in the buffer (default: 0)
     * @param byteLength - Optional length of the data view (default: buffer.byteLength)
     */
    constructor(
        buffer: ArrayBufferLike,
        dataLittleEndian: boolean = true,
        byteOffset: number = 0,
        byteLength?: number,
    ) {
        this.dataView = new DataView(buffer, byteOffset, byteLength);
        this.dataLittleEndian = dataLittleEndian;
        this.position = 0; // Position is relative to the start of the DataView

        // No validation needed here as the DataView constructor handles it
    }

    /**
     * Create a new ByteReader from the same buffer but at a different position
     * @param newOffset - New position in bytes
     * @returns New ByteReader instance
     */
    readerAt(newOffset: number): ByteReader {
        return new ByteReader(this.dataView.buffer, this.dataLittleEndian, this.dataView.byteOffset + newOffset);
    }

    /**
     * Skip ahead by n bytes
     * @param bytes - Number of bytes to skip
     * @returns This ByteReader for chaining
     */
    skip(bytes: number): ByteReader {
        this.checkBounds(bytes);
        this.position += bytes;
        return this;
    }

    /**
     * Get current position
     */
    getPosition(): number {
        return this.position;
    }

    /**
     * Set current position
     * @param position - New position in bytes
     */
    seek(position: number): void {
        if (position < 0 || position > this.dataView.byteLength) {
            throw new Error(`Invalid seek position: ${position}`);
        }
        this.position = position;
    }

    /**
     * Get total buffer size
     */
    getSize(): number {
        return this.dataView.byteLength;
    }

    /**
     * Get remaining bytes from current position
     */
    getRemainingBytes(): number {
        return this.dataView.byteLength - this.position;
    }

    /**
     * Check if we have enough bytes remaining for a read operation
     */
    private checkBounds(bytesNeeded: number): void {
        if (bytesNeeded > this.getRemainingBytes()) {
            throw new Error(
                `Not enough bytes: need ${bytesNeeded} at position ${this.position}, ` +
                `but only ${this.getRemainingBytes()} bytes remaining`,
            );
        }
    }

    /**
     * Read an 8-bit unsigned integer
     */
    readUint8(): number {
        this.checkBounds(1);
        const value = this.dataView.getUint8(this.position);
        this.position += 1;
        return value;
    }

    /**
     * Read a 16-bit unsigned integer
     */
    readUint16(): number {
        this.checkBounds(2);
        const value = this.dataView.getUint16(this.position, this.dataLittleEndian);
        this.position += 2;
        return value;
    }

    /**
     * Read a 32-bit unsigned integer
     */
    readUint32(): number {
        this.checkBounds(4);
        const value = this.dataView.getUint32(this.position, this.dataLittleEndian);
        this.position += 4;
        return value;
    }

    /**
     * Read an 8-bit signed integer
     */
    readInt8(): number {
        this.checkBounds(1);
        const value = this.dataView.getInt8(this.position);
        this.position += 1;
        return value;
    }

    /**
     * Read a 16-bit signed integer
     */
    readInt16(): number {
        this.checkBounds(2);
        const value = this.dataView.getInt16(this.position, this.dataLittleEndian);
        this.position += 2;
        return value;
    }

    /**
     * Read a 32-bit signed integer
     */
    readInt32(): number {
        this.checkBounds(4);
        const value = this.dataView.getInt32(this.position, this.dataLittleEndian);
        this.position += 4;
        return value;
    }

    /**
     * Read a 32-bit floating point number
     */
    readFloat32(): number {
        this.checkBounds(4);
        const value = this.dataView.getFloat32(this.position, this.dataLittleEndian);
        this.position += 4;
        return value;
    }

    /**
     * Read a 64-bit floating point number
     */
    readFloat64(): number {
        this.checkBounds(8);
        const value = this.dataView.getFloat64(this.position, this.dataLittleEndian);
        this.position += 8;
        return value;
    }

    /**
     * Read a sequence of bytes as a Uint8Array
     * @param length - Number of bytes to read
     */
    readBytes(length: number): Uint8Array {
        this.checkBounds(length);
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            bytes[i] = this.dataView.getUint8(this.position + i);
        }
        this.position += length;
        return bytes;
    }

    /**
     * Read a null-terminated string or string of fixed length
     * @param maxLength - Maximum length to read (if null-terminated string is longer)
     * @param encoding - Text encoding (default: 'utf-8')
     */
    readString(maxLength?: number, encoding: string = "utf-8"): string {
        let endPosition = this.position;
        const maxPos = maxLength ? Math.min(this.position + maxLength, this.dataView.byteLength) : this.dataView.byteLength;
        
        // Find null terminator
        while (endPosition < maxPos && this.dataView.getUint8(endPosition) !== 0) {
            endPosition++;
        }
        
        const length = endPosition - this.position;
        this.checkBounds(length);
        
        const bytes = new Uint8Array(this.dataView.buffer, this.position, length);
        this.position = endPosition + (endPosition < maxPos && this.dataView.getUint8(endPosition) === 0 ? 1 : 0);
        
        // Convert bytes to string
        const decoder = new TextDecoder(encoding);
        return decoder.decode(bytes);
    }

    /**
     * Read a fixed-length string (useful for TTF table tags)
     * @param length - Exact number of bytes to read
     * @param encoding - Text encoding used for TextDecoder (default: 'ascii')
     */
    readFixedString(length: number, encoding: string = "ascii"): string {
        this.checkBounds(length);
        const bytes = new Uint8Array(this.dataView.buffer, this.position, length);
        this.position += length;
        
        const decoder = new TextDecoder(encoding);
        return decoder.decode(bytes);
    }

    /**
     * Peek at data without advancing position
     * @param type - Data type to peek ('uint8', 'uint16', 'uint32', etc.)
     * @param offset - Optional offset from current position
     */
    peek(type: "uint8" | "uint16" | "uint32" | "int8" | "int16" | "int32", offset: number = 0): number {
        const savedPosition = this.position;
        this.position += offset;
        
        let value: number;
        switch (type) {
        case "uint8": value = this.readUint8(); break;
        case "uint16": value = this.readUint16(); break;
        case "uint32": value = this.readUint32(); break;
        case "int8": value = this.readInt8(); break;
        case "int16": value = this.readInt16(); break;
        case "int32": value = this.readInt32(); break;
        default: throw new Error(`Unknown peek type: ${type}`);
        }
        
        this.position = savedPosition;
        return value;
    }

    /**
     * Create a sub-reader for a specific range of bytes
     * @param offset - Start offset relative to current position 
     * @param length - Length of the sub-buffer
     */
    slice(offset: number, length: number): ByteReader {
        const absoluteOffset = this.position + offset;
        if (absoluteOffset < 0 || absoluteOffset + length > this.dataView.byteLength) {
            throw new Error(`Slice out of bounds: offset=${absoluteOffset}, length=${length}, buffer size=${this.dataView.byteLength}`);
        }
        
        const slicedBuffer = this.dataView.buffer.slice(absoluteOffset, absoluteOffset + length) as ArrayBuffer;
        return new ByteReader(slicedBuffer, this.dataLittleEndian, 0);
    }
} 