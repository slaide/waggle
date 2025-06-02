import { vec3 } from "gl-matrix";

export type PointLight = {
    position: vec3;
    radius: number;
    color: vec3;
    intensity: number;
};
