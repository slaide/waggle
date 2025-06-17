import {vec3,quat,mat4} from "gl-matrix";

export class Transform {
    private _worldMatrix?: mat4;
    private _isDirty: boolean = true;
    private _parent?: Transform;
    private _children: Transform[] = [];

    constructor(
        public position: vec3 = vec3.create(),
        public rotation: quat = quat.identity(quat.create()),
        public scale: vec3 = vec3.fromValues(1, 1, 1),
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
    get worldMatrix(): mat4 {
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
    setPosition(value: vec3) {
        vec3.copy(this.position, value);
        this.markDirty();
    }

    setRotation(value: quat) {
        quat.copy(this.rotation, value);
        this.markDirty();
    }

    setScale(value: vec3) {
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
    get worldPosition(): vec3 {
        const worldPos = vec3.create();
        mat4.getTranslation(worldPos, this.worldMatrix);
        return worldPos;
    }

    // Get world rotation (extracted from world matrix)
    get worldRotation(): quat {
        const worldRot = quat.create();
        mat4.getRotation(worldRot, this.worldMatrix);
        return worldRot;
    }

    // Get world scale (extracted from world matrix)
    get worldScale(): vec3 {
        const worldScale = vec3.create();
        mat4.getScaling(worldScale, this.worldMatrix);
        return worldScale;
    }

    toJSON() {
        return {
            position: Array.from(this.position) as [number, number, number],
            rotation: Array.from(this.rotation) as [number, number, number, number],
            scale: Array.from(this.scale) as [number, number, number]
        };
    }

    static fromJSON(data: any): Transform {
        // Type guard inline
        if (typeof data !== 'object' || data === null) {
            throw new Error("Invalid transform data format");
        }

        const transform = new Transform();
        if (data.position) {
            if (!Array.isArray(data.position) || data.position.length !== 3) {
                throw new Error("Invalid position format");
            }
            transform.position = vec3.fromValues(data.position[0], data.position[1], data.position[2]);
        }
        if (data.rotation) {
            if (!Array.isArray(data.rotation) || data.rotation.length !== 4) {
                throw new Error("Invalid rotation format");
            }
            transform.rotation = quat.fromValues(data.rotation[0], data.rotation[1], data.rotation[2], data.rotation[3]);
        }
        if (data.scale) {
            if (!Array.isArray(data.scale) || data.scale.length !== 3) {
                throw new Error("Invalid scale format");
            }
            transform.scale = vec3.fromValues(data.scale[0], data.scale[1], data.scale[2]);
        }
        return transform;
    }
}