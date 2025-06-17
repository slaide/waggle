#version 300 es

precision highp float;

in vec4 aVertexPosition;
in vec3 aVertexNormal;
in vec2 aVertexTexCoord;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;

out vec2 vTextureCoord;
out vec3 vBarycentric;

void main() {
    vec4 worldPos = uModelMatrix * aVertexPosition;
    gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
    
    vTextureCoord = aVertexTexCoord;
    
    // Generate barycentric coordinates based on vertex ID
    // This is a simple approximation - proper wireframe would need geometry shader
    // or pre-computed barycentric coordinates
    int vertexID = gl_VertexID % 3;
    if (vertexID == 0) {
        vBarycentric = vec3(1.0, 0.0, 0.0);
    } else if (vertexID == 1) {
        vBarycentric = vec3(0.0, 1.0, 0.0);
    } else {
        vBarycentric = vec3(0.0, 0.0, 1.0);
    }
} 