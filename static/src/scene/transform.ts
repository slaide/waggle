import {vec3, quat, mat4, Vec3, Quat, Mat4} from "gl-matrix";

export class Transform {
    private _worldMatrix?: Mat4;
    private _isDirty: boolean = true;
    private _parent?: Transform;
    private _children: Transform[] = [];

    constructor(
        public position: Vec3 = vec3.create(),
        public rotation: Quat = quat.create(),
        public scale: Vec3 = vec3.fromValues(1, 1, 1),
    ) {}

    // Get the local transform matrix
    get matrix() {
        const localMatrix = mat4.fromRotationTranslationScale(
            mat4.create(),
            this.rotation,
            this.position,
            this.scale,
        );
        
        return localMatrix;
    }

    // Get the world transform matrix (includes parent transforms)
    get worldMatrix(): Mat4 {
        if (this._isDirty || !this._worldMatrix) {
            this._updateWorldMatrix();
        }
        
        return this._worldMatrix!;
    }
    
    // Private method to update world matrix
    private _updateWorldMatrix() {
        this._worldMatrix = mat4.create();
        
        if (this._parent) {
            // Multiply parent's world matrix with our local matrix
            mat4.multiply(this._worldMatrix, this._parent.worldMatrix, this.matrix);
        } else {
            // No parent, world matrix is same as local matrix
            mat4.copy(this._worldMatrix, this.matrix);
        }
        
        this._isDirty = false;
    }

    // Set parent transform (for relative transforms)
    set parent(parent: Transform | undefined) {
        // Remove from old parent's children list
        if (this._parent) {
            const index = this._parent._children.indexOf(this);
            if (index !== -1) {
                this._parent._children.splice(index, 1);
            }
        }
        
        this._parent = parent;
        
        // Add to new parent's children list
        if (parent) {
            parent._children.push(this);
        }
        
        // Mark dirty and propagate to children
        this._markDirtyAndPropagate();
    }

    get parent(): Transform | undefined {
        return this._parent;
    }
    
    get children(): readonly Transform[] {
        return this._children;
    }

    // Mark this transform and all its children as dirty
    private _markDirtyAndPropagate() {
        this._isDirty = true;
        
        // Recursively mark all children as dirty
        for (const child of this._children) {
            child._markDirtyAndPropagate();
        }
    }

    // Public method to mark dirty (called when transform properties change)
    markDirty() {
        this._markDirtyAndPropagate();
    }

    // Methods to update transforms and mark dirty
    setPosition(value: Vec3) {
        vec3.copy(this.position, value);
        this.markDirty();
    }

    setRotation(value: Quat) {
        quat.copy(this.rotation, value);
        this.markDirty();
    }

    setScale(value: Vec3) {
        vec3.copy(this.scale, value);
        this.markDirty();
    }
    
    // Force update of world matrix and all children (useful for ensuring consistency)
    updateWorldMatrix() {
        if (this._isDirty) {
            this._updateWorldMatrix();
        }
        
        // Update all children
        for (const child of this._children) {
            child.updateWorldMatrix();
        }
    }

    // Get world position (extracted from world matrix)
    get worldPosition(): Vec3 {
        const worldPos = vec3.create();
        mat4.getTranslation(worldPos, this.worldMatrix);
        return worldPos;
    }

    // Get world rotation (extracted from world matrix)
    get worldRotation(): Quat {
        const worldRot = quat.create();
        mat4.getRotation(worldRot, this.worldMatrix);
        return worldRot;
    }

    // Get world scale (extracted from world matrix)
    get worldScale(): Vec3 {
        const worldScale = vec3.create();
        mat4.getScaling(worldScale, this.worldMatrix);
        return worldScale;
    }

    toJSON() {
        return {
            position: Array.from(this.position) as [number, number, number],
            rotation: Array.from(this.rotation) as [number, number, number, number],
            scale: Array.from(this.scale) as [number, number, number],
        };
    }

    static fromJSON(data: unknown): Transform {
        // Type guard inline
        if (typeof data !== "object" || data === null) {
            throw new Error("Invalid transform data format");
        }

        const transformData = data as any; // Type assertion after validation
        const transform = new Transform();
        
        if (transformData.position) {
            if (!Array.isArray(transformData.position) || transformData.position.length !== 3) {
                throw new Error("Invalid position format");
            }
            transform.position = vec3.fromValues(transformData.position[0], transformData.position[1], transformData.position[2]);
        }
        if (transformData.rotation) {
            if (!Array.isArray(transformData.rotation) || transformData.rotation.length !== 4) {
                throw new Error("Invalid rotation format");
            }
            transform.rotation = quat.fromValues(transformData.rotation[0], transformData.rotation[1], transformData.rotation[2], transformData.rotation[3]);
        }
        if (transformData.scale) {
            if (!Array.isArray(transformData.scale) || transformData.scale.length !== 3) {
                throw new Error("Invalid scale format");
            }
            transform.scale = vec3.fromValues(transformData.scale[0], transformData.scale[1], transformData.scale[2]);
        }
        return transform;
    }
}