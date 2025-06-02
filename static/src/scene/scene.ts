"use strict";

import { GL, GLC } from "../gl.js";
import { vec3, quat } from "gl-matrix";

import { GameObject } from "./gameobject.js";

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

    async draw() {
        const { gl } = this;

        // this is used as part of game logic
        let rotation = 0;

        const camera = this.gbuffer.camera;
        const cameraSpeedFactor = {
            move: 2,
            rotate: 0.8,
        };
        const cameraSpeed = {
            x: 0,
            y: 0,
            z: 0,
            rotx: 0,
            roty: 0,
        };
        window.addEventListener("keydown", (ev) => {
            ev.preventDefault();

            if (ev.key.toLowerCase() == "w") {
                cameraSpeed.z = -cameraSpeedFactor.move;
            }
            if (ev.key.toLowerCase() == "s") {
                cameraSpeed.z = cameraSpeedFactor.move;
            }
            if (ev.key.toLowerCase() == "a") {
                cameraSpeed.x = -cameraSpeedFactor.move;
            }
            if (ev.key.toLowerCase() == "d") {
                cameraSpeed.x = cameraSpeedFactor.move;
            }
            if (ev.key.toLowerCase() == "e") {
                cameraSpeed.y = cameraSpeedFactor.move;
            }
            if (ev.key.toLowerCase() == "q") {
                cameraSpeed.y = -cameraSpeedFactor.move;
            }
            if (ev.key == " ") {
                cameraSpeed.y = cameraSpeedFactor.move;
            }
            if (ev.key == "ArrowRight") {
                cameraSpeed.roty = -cameraSpeedFactor.rotate;
            }
            if (ev.key == "ArrowLeft") {
                cameraSpeed.roty = cameraSpeedFactor.rotate;
            }
            if (ev.key == "ArrowUp") {
                cameraSpeed.rotx = cameraSpeedFactor.rotate;
            }
            if (ev.key == "ArrowDown") {
                cameraSpeed.rotx = -cameraSpeedFactor.rotate;
            }
        });
        window.addEventListener("keyup", (ev) => {
            ev.preventDefault();

            if (ev.key.toLowerCase() == "w") {
                cameraSpeed.z = 0;
            }
            if (ev.key.toLowerCase() == "s") {
                cameraSpeed.z = 0;
            }
            if (ev.key.toLowerCase() == "a") {
                cameraSpeed.x = 0;
            }
            if (ev.key.toLowerCase() == "d") {
                cameraSpeed.x = 0;
            }
            if (ev.key.toLowerCase() == "e") {
                cameraSpeed.y = 0;
            }
            if (ev.key.toLowerCase() == "q") {
                cameraSpeed.y = 0;
            }
            if (ev.key == " ") {
                cameraSpeed.y = 0;
            }
            if (ev.key == "ArrowRight") {
                cameraSpeed.roty = 0;
            }
            if (ev.key == "ArrowLeft") {
                cameraSpeed.roty = 0;
            }
            if (ev.key == "ArrowUp") {
                cameraSpeed.rotx = 0;
            }
            if (ev.key == "ArrowDown") {
                cameraSpeed.rotx = 0;
            }
        });

        const onFrameLogic: (deltatime_ms: number) => void = (
            deltatime_ms: number,
        ) => {
            const xStep = -cameraSpeed.x * deltatime_ms;
            vec3.add(
                camera.position,
                camera.position,
                vec3.multiply(
                    vec3.create(),
                    camera.right,
                    vec3.fromValues(xStep, xStep, xStep),
                ),
            );
            const yStep = cameraSpeed.y * deltatime_ms;
            vec3.add(
                camera.position,
                camera.position,
                vec3.multiply(
                    vec3.create(),
                    vec3.fromValues(0, 1, 0),
                    vec3.fromValues(yStep, yStep, yStep),
                ),
            );
            const zStep = cameraSpeed.z * deltatime_ms;
            vec3.add(
                camera.position,
                camera.position,
                vec3.multiply(
                    vec3.create(),
                    camera.forward,
                    vec3.fromValues(zStep, zStep, zStep),
                ),
            );

            quat.multiply(
                camera.rotation,
                quat.setAxisAngle(
                    quat.create(),
                    /// @ts-ignore
                    camera.right,
                    -cameraSpeed.rotx * deltatime_ms,
                ),
                camera.rotation,
            );
            quat.multiply(
                camera.rotation,
                quat.setAxisAngle(
                    quat.create(),
                    [0, 1, 0],
                    cameraSpeed.roty * deltatime_ms,
                ),
                camera.rotation,
            );

            // set up camera
            const projectionMatrix = camera.projectionMatrix;

            for (const object of this.children) {
                const { programInfo } = object;

                // animate quad rotation
                rotation += 40 * deltatime_ms;
                object.transform.rotation = quat.fromEuler(
                    quat.create(),
                    rotation * 0.3,
                    rotation * 0.7,
                    rotation,
                );

                gl.useProgram(programInfo.program);
                // ensure transform is up to date
                gl.uniformMatrix4fv(
                    programInfo.uniformLocations.uModelMatrix,
                    false,
                    object.transform.matrix,
                );
                // ensure transform is up to date
                gl.uniformMatrix4fv(
                    programInfo.uniformLocations.uViewMatrix,
                    false,
                    camera.viewMatrix,
                );
                // also update camera projection matrix (TODO optimize to share this between draws)
                gl.uniformMatrix4fv(
                    programInfo.uniformLocations.uProjectionMatrix,
                    false,
                    projectionMatrix,
                );
            }
        };

        this.gbuffer.updatePointlights([
            {
                position: vec3.fromValues(0, 1, -6),
                radius: 50,
                color: vec3.fromValues(1.0, 1.0, 1.0),
                intensity: 0.3,
            },
        ]);

        // cleanup
        gl.bindTexture(GL.TEXTURE_2D, null);
        gl.bindFramebuffer(GL.FRAMEBUFFER, null);

        const frametimes = new Float32Array(30);
        let framenum = 0;
        const original_title = document.title;

        let last_frametime = performance.now();
        const draw = () => {
            const deltatime_ms = (performance.now() - last_frametime) * 1e-3;
            last_frametime = performance.now();

            // run logic step
            onFrameLogic(deltatime_ms);

            if (!this.shouldDraw) {
                return;
            }

            frametimes[framenum++ % frametimes.length] = deltatime_ms;

            const average_fps =
                frametimes.length / frametimes.reduce((o, n) => o + n, 0);
            const min_fps = 1 / frametimes.reduce((o, n) => Math.max(o, n));
            const max_fps = 1 / frametimes.reduce((o, n) => Math.min(o, n));
            document.title = `${original_title} | fps ${average_fps.toFixed(1)} (${min_fps.toFixed(1)}, ${max_fps.toFixed(1)})`;

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

            // render full screen quad

            this.gbuffer.draw();
        };

        const drawLoop = () => {
            draw();
            requestAnimationFrame(drawLoop);
        };
        drawLoop();
    }
}
