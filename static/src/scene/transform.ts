import {vec3,quat,mat4} from "gl-matrix";

export class Transform {
    private _worldMatrix?: mat4;
    private _isDirty: boolean = true;
    private _parent?: Transform;

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
        
        return this._worldMatrix;
    }

    // Set parent transform (for relative transforms)
    set parent(parent: Transform | undefined) {
        this._parent = parent;
        this._isDirty = true;
    }

    get parent(): Transform | undefined {
        return this._parent;
    }

    // Mark this transform and all its children as dirty
    markDirty() {
        this._isDirty = true;
        // Note: Children will be marked dirty through their GameObject's updateWorldTransforms method
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