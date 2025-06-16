#version 300 es

out vec2 vUV;

// These three points form a triangle that covers the entire clipspace:
const vec2 pos[3] = vec2[](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
);

void main() {
    gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
    vUV=pos[gl_VertexID]*0.5+0.5;
} 