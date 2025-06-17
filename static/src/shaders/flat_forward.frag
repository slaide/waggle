#version 300 es

precision highp float;

uniform sampler2D uDiffuseSampler;
uniform vec4 uDiffuseColor;
uniform int uUseDiffuseTexture;

in vec2 vTextureCoord;

out vec4 fragColor;

void main() {
    vec3 albedo;
    
    // Get material color - either from texture or uniform
    if (uUseDiffuseTexture != 0) {
        albedo = texture(uDiffuseSampler, vTextureCoord).rgb;
    } else {
        albedo = uDiffuseColor.rgb;
    }
    
    // Output flat albedo color with no lighting calculations
    fragColor = vec4(albedo, 1.0);
} 