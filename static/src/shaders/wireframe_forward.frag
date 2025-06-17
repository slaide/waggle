#version 300 es

precision highp float;

uniform sampler2D uDiffuseSampler;
uniform vec4 uDiffuseColor;
uniform int uUseDiffuseTexture;

in vec2 vTextureCoord;
in vec3 vBarycentric;

out vec4 fragColor;

float edgeFactor() {
    vec3 d = fwidth(vBarycentric);
    vec3 a3 = smoothstep(vec3(0.0), d * 1.5, vBarycentric);
    return min(min(a3.x, a3.y), a3.z);
}

void main() {
    vec3 baseColor;
    
    // Get base material color
    if (uUseDiffuseTexture != 0) {
        baseColor = texture(uDiffuseSampler, vTextureCoord).rgb;
    } else {
        baseColor = uDiffuseColor.rgb;
    }
    
    // Calculate wireframe effect
    float edge = 1.0 - edgeFactor();
    
    // Mix between wireframe and fill
    vec3 wireColor = vec3(0.0, 1.0, 0.0); // Green wireframe
    vec3 fillColor = baseColor * 0.3; // Dimmed fill
    
    vec3 finalColor = mix(fillColor, wireColor, edge);
    
    // Make wireframe more prominent
    float alpha = max(edge * 0.8 + 0.2, edge);
    
    fragColor = vec4(finalColor, alpha);
} 