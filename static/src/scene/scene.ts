"use strict";

import { GL, GLC } from "../gl";
import { GameObject } from "./gameobject";

function glCheckError(gl: GLC, msg: string = "") {
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
        console.error("WebGL error: 0x" + err.toString(16), "at", msg);
    }
}

import { GBuffer } from "./gbuffer.js";

export class Scene {
    constructor(
        public gl: GLC,
        public gbuffer: GBuffer,
        public children: GameObject[] = [],
        public shouldDraw: boolean = true,
    ) {}

    static async make(gl: GLC, size: { width: number; height: number }) {
        return new Scene(gl, await GBuffer.make(gl, size));
    }

    draw() {
        const { gl } = this;

        if (!this.shouldDraw) {
            return;
        }

        // draw (into gbuffer)
        for (const object of this.children) {
            object.draw();
        }
    }
}
