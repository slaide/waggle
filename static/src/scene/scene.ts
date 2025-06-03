"use strict";

import { GL, GLC } from "../gl";
import { GameObject } from "./gameobject";

function glCheckError(gl: GLC, msg: string = "") {
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
        console.error("WebGL error: 0x" + err.toString(16), "at", msg);
    }
}

export class Scene {
    constructor(
        public gl: GLC,
        public children: GameObject[] = [],
        public shouldDraw: boolean = true,
    ) {}

    static async make(gl: GLC) {
        return new Scene(gl);
    }

    draw() {
        if (!this.shouldDraw) {
            return;
        }

        // draw (into gbuffer)
        for (const object of this.children) {
            object.draw();
        }
    }
}
