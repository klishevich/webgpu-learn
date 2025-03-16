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
