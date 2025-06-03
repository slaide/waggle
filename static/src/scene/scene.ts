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

        // bind gbuffer
        gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.gbuffer.gbuffer);
        gl.drawBuffers(this.gbuffer.layerAttachments);
        console.assert(
            gl.checkFramebufferStatus(GL.FRAMEBUFFER) ===
                GL.FRAMEBUFFER_COMPLETE,
            "G-buffer incomplete:",
            gl.checkFramebufferStatus(GL.FRAMEBUFFER),
        );

        // clear gbuffer to draw over
        gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);

        // draw (into gbuffer)
        for (const object of this.children) {
            object.draw();
        }
    }
}
