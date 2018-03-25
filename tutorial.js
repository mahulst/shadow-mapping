/**
 * Section 1 - Getting set up
 */

// gl-mat4 helps us to matrix math
var glMat4 = require('gl-mat4')

// We insert our canvas into the page
var canvas = document.createElement('canvas')
canvas.width = 500
canvas.height = 500
var mountLocation = document.getElementById('webgl-shadow-map-tutorial')
mountLocation.appendChild(canvas)

// We get our WebGL context and enable depth testing so that we can tell when an object
// is behind another object
var gl = canvas.getContext('webgl')
gl.enable(gl.DEPTH_TEST)


/**
 * Section 2 - Shaders
 */

// We create a vertex shader from the light's point of view. You never see this in the
// demo. It is used behind the scenes to create a texture that we can use to test testing whether
// or not a point is inside of our outside of the shadow
var shadowDepthTextureSize = 1024
var lightVertexGLSL = `
attribute vec3 aVertexPosition;

uniform mat4 uPMatrix;
uniform mat4 uMVMatrix;

void main (void) {
  gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
}
`

var lightFragmentGLSL = `
precision mediump float;

vec4 encodeFloat (float depth) {
  const vec4 bitShift = vec4(
    256 * 256 * 256,
    256 * 256,
    256,
    1.0
  );
  const vec4 bitMask = vec4(
    0,
    1.0 / 256.0,
    1.0 / 256.0,
    1.0 / 256.0
  );
  vec4 comp = fract(depth * bitShift);
  comp -= comp.xxyz * bitMask;
  return comp;
}

void main (void) {
  // Encode the distance into the scene of this fragment.
  // We'll later decode this when rendering from our camera's
  // perspective and use this number to know whether the fragment
  // that our camera is seeing is inside of our outside of the shadow
  gl_FragColor = encodeFloat(gl_FragCoord.z);
}
`

// We create a vertex shader that renders the scene from the camera's point of view.
// This is what you see when you view the demo
var cameraVertexGLSL = `
attribute vec3 aVertexPosition;

uniform mat4 uPMatrix;
uniform mat4 uMVMatrix;
uniform mat4 lightMViewMatrix;
uniform mat4 lightProjectionMatrix;

// Used to normalize our coordinates from clip space to (0 - 1)
// so that we can access the corresponding point in our depth color texture
const mat4 texUnitConverter = mat4(0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 0.5, 1.0);

varying vec2 vDepthUv;
varying vec4 shadowPos;

void main (void) {
  gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);

  shadowPos = texUnitConverter * lightProjectionMatrix * lightMViewMatrix * vec4(aVertexPosition, 1.0);
}
`
var cameraFragmentGLSL = `
precision mediump float;

varying vec2 vDepthUv;
varying vec4 shadowPos;

uniform sampler2D depthColorTexture;
uniform vec3 uColor;

float decodeFloat (vec4 color) {
  const vec4 bitShift = vec4(
    1.0 / (256.0 * 256.0 * 256.0),
    1.0 / (256.0 * 256.0),
    1.0 / 256.0,
    1
  );
  return dot(color, bitShift);
}

void main(void) {
  vec3 fragmentDepth = shadowPos.xyz;
  float shadowAcneRemover = 0.007;
  fragmentDepth.z -= shadowAcneRemover;

  float texelSize = 1.0 / ${shadowDepthTextureSize}.0;
  float amountInLight = 0.0;

  // Check whether or not the current fragment and the 8 fragments surrounding
  // the current fragment are in the shadow. We then average out whether or not
  // all of these fragments are in the shadow to determine the shadow contribution
  // of the current fragment.
  // So if 4 out of 9 fragments that we check are in the shadow then we'll say that
  // this fragment is 4/9ths in the shadow so it'll be a little brighter than something
  // that is 9/9ths in the shadow.
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float texelDepth = decodeFloat(texture2D(depthColorTexture, fragmentDepth.xy + vec2(x, y) * texelSize));
      if (fragmentDepth.z < texelDepth) {
        amountInLight += 1.0;
      }
    }
  }
  amountInLight /= 9.0;

  gl_FragColor = vec4(amountInLight * uColor, 1.0);
}
`

// Link our light and camera shader programs
var cameraVertexShader = gl.createShader(gl.VERTEX_SHADER)
gl.shaderSource(cameraVertexShader, cameraVertexGLSL)
gl.compileShader(cameraVertexShader)

var cameraFragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
gl.shaderSource(cameraFragmentShader, cameraFragmentGLSL)
gl.compileShader(cameraFragmentShader)

var cameraShaderProgram = gl.createProgram()
gl.attachShader(cameraShaderProgram, cameraVertexShader)
gl.attachShader(cameraShaderProgram, cameraFragmentShader)
gl.linkProgram(cameraShaderProgram)

var lightVertexShader = gl.createShader(gl.VERTEX_SHADER)
gl.shaderSource(lightVertexShader, lightVertexGLSL)
gl.compileShader(lightVertexShader)

var lightFragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
gl.shaderSource(lightFragmentShader, lightFragmentGLSL)
gl.compileShader(lightFragmentShader)

var lightShaderProgram = gl.createProgram()
gl.attachShader(lightShaderProgram, lightVertexShader)
gl.attachShader(lightShaderProgram, lightFragmentShader)
gl.linkProgram(lightShaderProgram)

var floorPositions = [
  // Bottom Left (0)
  -40.0, 0.0, 40.0,
  // Bottom Right (1)
  40.0, 0.0, 40.0,
  // Top Right (2)
  40.0, 0.0, -40.0,
  // Top Left (3)
  -40.0, 0.0, -40.0
]

var floorIndices = [
  // Front face
  0, 1, 2, 0, 2, 3
]

var createCube = require('primitive-cube');
var cube = createCube(10, 10, 10);

var cubePositions = cube.positions
var cubeIndices = cube.cells

cubePositions = cubePositions.reduce(function (all, vertex) {
  all.push(vertex[0])
  all.push(vertex[1]+ 10) // move the cube up
  all.push(vertex[2])
  return all
}, [])

cubeIndices = cubeIndices.reduce(function (all, vertex) {
  all.push(vertex[0])
  all.push(vertex[1])
  all.push(vertex[2])
  return all
}, [])

/**
 * Camera shader setup
 */

// We enable our vertex attributes for our camera's shader.
var vertexPositionAttrib = gl.getAttribLocation(lightShaderProgram, 'aVertexPosition')
gl.enableVertexAttribArray(vertexPositionAttrib)

var cubePositionBuffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubePositions), gl.STATIC_DRAW)
gl.vertexAttribPointer(vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0)

var cubeIndexBuffer = gl.createBuffer()
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer)
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndices), gl.STATIC_DRAW)

var floorPositionBuffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, floorPositionBuffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(floorPositions), gl.STATIC_DRAW)
gl.vertexAttribPointer(vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0)

var floorIndexBuffer = gl.createBuffer()
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floorIndexBuffer)
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(floorIndices), gl.STATIC_DRAW)

/**
 * Light shader setup
 */

gl.useProgram(lightShaderProgram)

// This section is the meat of things. We create an off screen frame buffer that we'll render
// our scene onto from our light's viewpoint. We output that to a color texture `shadowDepthTexture`.
// Then later our camera shader will use `shadowDepthTexture` to determine whether or not fragments
// are in the shadow.
var shadowFramebuffer = gl.createFramebuffer()
gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer)

var shadowDepthTexture = gl.createTexture()
gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shadowDepthTextureSize, shadowDepthTextureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

var renderBuffer = gl.createRenderbuffer()
gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer)
gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, shadowDepthTextureSize, shadowDepthTextureSize)

gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowDepthTexture, 0)
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderBuffer)

gl.bindTexture(gl.TEXTURE_2D, null)
gl.bindRenderbuffer(gl.RENDERBUFFER, null)

// We create an orthographic projection and view matrix from which our light
// will vie the scene
var lightProjectionMatrix = glMat4.ortho([], -40, 40, -40, 40, -40.0, 80)
var lightViewMatrix = glMat4.lookAt([], [0, 2, -3], [0, 0, 0], [0, 1, 0])

var shadowPMatrix = gl.getUniformLocation(lightShaderProgram, 'uPMatrix')
var shadowMVMatrix = gl.getUniformLocation(lightShaderProgram, 'uMVMatrix')

gl.uniformMatrix4fv(shadowPMatrix, false, lightProjectionMatrix)
gl.uniformMatrix4fv(shadowMVMatrix, false, lightViewMatrix)

gl.bindBuffer(gl.ARRAY_BUFFER, floorPositionBuffer)
gl.vertexAttribPointer(vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0)

gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floorIndexBuffer)
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(floorIndices), gl.STATIC_DRAW)

gl.bindFramebuffer(gl.FRAMEBUFFER, null)

/**
 * Scene uniforms
 */
gl.useProgram(cameraShaderProgram)

var samplerUniform = gl.getUniformLocation(cameraShaderProgram, 'depthColorTexture')

gl.activeTexture(gl.TEXTURE0)
gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture)
gl.uniform1i(samplerUniform, 0)

var uMVMatrix = gl.getUniformLocation(cameraShaderProgram, 'uMVMatrix')
var uPMatrix = gl.getUniformLocation(cameraShaderProgram, 'uPMatrix')
var uLightMatrix = gl.getUniformLocation(cameraShaderProgram, 'lightMViewMatrix')
var uLightProjection = gl.getUniformLocation(cameraShaderProgram, 'lightProjectionMatrix')
var uColor = gl.getUniformLocation(cameraShaderProgram, 'uColor')

gl.uniformMatrix4fv(uLightMatrix, false, lightViewMatrix)
gl.uniformMatrix4fv(uLightProjection, false, lightProjectionMatrix)
gl.uniformMatrix4fv(uPMatrix, false, glMat4.perspective([], Math.PI / 3, 1, 0.01, 900))

// We rotate the cube about the y axis every frame
var cubeRotateY = 0

// Draw our cube onto the shadow map
function drawShadowMap () {
  cubeRotateY += 0.01

  gl.useProgram(lightShaderProgram)

  // Draw to our off screen drawing buffer
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer)

  // Set the viewport to our shadow texture's size
  gl.viewport(0, 0, shadowDepthTextureSize, shadowDepthTextureSize)
  gl.clearColor(0, 0, 0, 1)
  gl.clearDepth(1.0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

  gl.bindBuffer(gl.ARRAY_BUFFER, cubePositionBuffer)
  gl.vertexAttribPointer(vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer)

  // We draw our cube onto our shadow map texture
  var lightCubeMVMatrix = glMat4.create()
  glMat4.rotateY(lightCubeMVMatrix, lightCubeMVMatrix, cubeRotateY)
  glMat4.translate(lightCubeMVMatrix, lightCubeMVMatrix, [0, 0, -3])
  glMat4.multiply(lightCubeMVMatrix, lightViewMatrix, lightCubeMVMatrix)
  gl.uniformMatrix4fv(shadowMVMatrix, false, lightCubeMVMatrix)

  gl.drawElements(gl.TRIANGLES, cubeIndices.length, gl.UNSIGNED_SHORT, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

// Draw our cube and floor onto the scene
function drawModels () {
  gl.useProgram(cameraShaderProgram)
  gl.viewport(0, 0, 500, 500)
  gl.clearColor(0.98, 0.98, 0.98, 1)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

  // Create our camera view matrix
  var camera = glMat4.create()
  glMat4.translate(camera, camera, [40, 30, 30])
  camera = glMat4.lookAt(camera, [camera[12], camera[13], camera[14]], [0, 0, 0], [0, 1, 0])

  var cubeModelMatrix = glMat4.create()
  glMat4.rotateY(cubeModelMatrix, cubeModelMatrix, cubeRotateY)
  glMat4.translate(cubeModelMatrix, cubeModelMatrix, [0, 0, -3])

  // We use the light's model view matrix of our cube so that our camera knows if
  // parts of the cube are in the shadow
  var lightCubeMVMatrix = glMat4.create()
  glMat4.multiply(lightCubeMVMatrix, lightViewMatrix, cubeModelMatrix)
  gl.uniformMatrix4fv(uLightMatrix, false, lightCubeMVMatrix)

  gl.uniformMatrix4fv(
    uMVMatrix,
    false,
    glMat4.multiply(cubeModelMatrix, camera, cubeModelMatrix)
  )

  gl.uniform3fv(uColor, [0.36, 0.66, 0.8])

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture)
  gl.uniform1i(samplerUniform, 0)

  gl.drawElements(gl.TRIANGLES, cubeIndices.length, gl.UNSIGNED_SHORT, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, floorPositionBuffer)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floorIndexBuffer)
  gl.vertexAttribPointer(vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0)

  gl.uniformMatrix4fv(uLightMatrix, false, lightViewMatrix)
  gl.uniformMatrix4fv(uMVMatrix, false, camera)
  gl.uniform3fv(uColor, [0.6, 0.6, 0.6])

  gl.drawElements(gl.TRIANGLES, floorIndices.length, gl.UNSIGNED_SHORT, 0)
}

// Draw our shadow map and light map every request animation frame
function draw () {
  drawShadowMap()
  drawModels()

  window.requestAnimationFrame(draw)
}
draw()