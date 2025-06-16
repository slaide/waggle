#version 300 es

precision highp float;

in vec4 aVertexPosition;
in vec3 aVertexNormal;
in vec2 aVertexTexCoord;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;

out vec2 vTextureCoord;
out vec4 vGlobalPos;
out vec3 vNormal;

void main() {
    vec4 modelSpacePos = aVertexPosition;
    vec4 globalSpacePos = uModelMatrix * aVertexPosition;
    vec4 viewSpacePos = uViewMatrix * globalSpacePos;
    vec4 clipSpacePos = uProjectionMatrix * viewSpacePos;

    vGlobalPos = globalSpacePos;
    gl_Position = clipSpacePos;
    vTextureCoord = aVertexTexCoord;

    // would be good to calculate this on the cpu instead
    mat3 normalTransformMatrix = transpose(inverse(mat3(uModelMatrix)));
    vNormal = normalTransformMatrix * normalize(aVertexNormal);
} 