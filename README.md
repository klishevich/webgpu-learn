# webgpu-learn

## learning notes

### Inter-stage variables

https://webgpufundamentals.org/webgpu/lessons/webgpu-inter-stage-variables.html (March 03 - done)

### WebGPU memory layout

https://webgpufundamentals.org/webgpu/lessons/webgpu-memory-layout.html

In WGSL v1, there are 4 base types

* f32 (a 32bit floating point number)
* i32 (a 32bit integer)
* u32 (a 32bit unsigned integer)
* f16 (a 16bit floating point number)

Here’s one: webgpu-utils library to help computing offsets.
https://webgpufundamentals.org/webgpu/lessons/resources/wgsl-offset-computer.html#

#### TypedArrays: Float32Array, Uint32Array

```js
const kOurStructSizeBytes =
  4 + // velocity
  4 + // acceleration
  4 ; // frameCount
const ourStructData = new ArrayBuffer(kOurStructSizeBytes);
const velocityView = new Float32Array(ourStructData, 0, 1);
const accelerationView = new Float32Array(ourStructData, 4, 1);
const frameCountView = new Uint32Array(ourStructData, 8, 1);
 
velocityView[0] = 1.2;
accelerationView[0] = 3.4;
frameCountView[0] = 56;
```

#### Multiple views of the same ArrayBuffer

```js
const v1 = new Float32Array(5);
const v2 = v1.subarray(3, 5);  // view the last 2 floats of v1
v2[0] = 123;
v2[1] = 456;
console.log(v1);  // shows 0, 0, 0, 123, 456
```

#### Map issues

```js
const f32a = new Float32Array(1, 2, 3);
const f32b = f32a.map(v => v * 2);                    // Ok
const f32c = f32a.map(v => `${v} doubled = ${v *2}`); // BAD!
                    //  you can't put a string in a Float32Array
```

#### Converting TypedArray into JS array

```js
const f32d = Array.from(f32a).map(v => `${v} doubled = ${v *2}`); // Ok
```

### WebGPU Uniforms (global variables for your shader)

https://webgpufundamentals.org/webgpu/lessons/webgpu-uniforms.html (March 06 done)

### WebGPU Storage Buffers

https://webgpufundamentals.org/webgpu/lessons/webgpu-storage-buffers.html (March 16 done)

#### Differences between uniform buffers and storage buffers

Depends on the use case

1. Uniform buffers can be faster for their typical use-case. For example 3D game.
2. Storage buffers (128MiB) are much larger than uniform buffers (64 KiB)
3. Storage buffers can be read/write, uniform buffers are read-only.

### WebGPU Vertex Buffers

https://webgpufundamentals.org/webgpu/lessons/webgpu-vertex-buffers.html (March 23 done)

Continue here "Just for fun, let’s add another attribute for a per vertex color. First let’s change the shader"

#### Attributes in WGSL do not have to match attributes in JavaScript

Attributes always have 4 values available in the shader. They default to 0, 0, 0, 1 so any values we don’t supply get these defaults.

#### Using normalized values to save space

#### Index buffers

### WebGPU Textures

Textures most often represent a 2d image. A 2d image is just an array of color values so you might wonder, why do we need textures for 2d arrays? We could just use storage buffers as 2d arrays. What makes textures special is that they can be accessed by special hardware called sampler. A sample can read up to 16 different values in a texture and blend them together in a way that is useful for many common use cases.

Once we've flipped the data, what used to be the top is now at the bottom and now the bottom left pixel of the original image is the first data in the texture and becomes what texture coordinate 0,0 refers to. This is why often texture coordinates are considered to go from 0 at the bottom to 1 at the top.

#### minFilter

Textures offer a solution to the flickering problem. It’s called mip-mapping. I think (but could be wrong) that “mipmap” stands for “multi-image-pyramid-map”.

### WebGPU Loading Images into Textures

https://webgpufundamentals.org/webgpu/lessons/webgpu-importing-textures.html

#### Generating mips on GPU

#### Texture Atlas 

A texture with multiple images in it.
