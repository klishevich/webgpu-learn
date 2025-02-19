// see https://webgpufundamentals.org/webgpu/lessons/webgpu-utils.html#wgpu-matrix
import {vec3, mat4} from 'https://webgpufundamentals.org/3rdparty/wgpu-matrix.module.js';

async function main() {
  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();
  if (!device) {
    fail('need a browser that supports WebGPU');
    return;
  }

  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('webgpu');

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat(adapter);
  context.configure({
    device,
    format: presentationFormat,
  });

  const canvasInfo = {
    canvas,
    context,
    presentationFormat,
    // these are filled out in resizeToDisplaySize
    renderTarget: undefined,
    renderTargetView: undefined,
    depthTexture: undefined,
    depthTextureView: undefined,
    sampleCount: 4,  // can be 1 or 4
  };

  const shaderSrc = `
  struct VSUniforms {
    worldViewProjection: mat4x4f,
    worldInverseTranspose: mat4x4f,
  };
  @group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

  struct MyVSInput {
      @location(0) position: vec4f,
      @location(1) normal: vec3f,
      @location(2) texcoord: vec2f,
  };

  struct MyVSOutput {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
    @location(1) texcoord: vec2f,
  };

  @vertex
  fn myVSMain(v: MyVSInput) -> MyVSOutput {
    var vsOut: MyVSOutput;
    vsOut.position = vsUniforms.worldViewProjection * v.position;
    vsOut.normal = (vsUniforms.worldInverseTranspose * vec4f(v.normal, 0.0)).xyz;
    vsOut.texcoord = v.texcoord;
    return vsOut;
  }

  struct FSUniforms {
    lightDirection: vec3f,
  };

  @group(0) @binding(1) var<uniform> fsUniforms: FSUniforms;
  @group(0) @binding(2) var diffuseSampler: sampler;
  @group(0) @binding(3) var diffuseTexture: texture_2d<f32>;

  @fragment
  fn myFSMain(v: MyVSOutput) -> @location(0) vec4f {
    var diffuseColor = textureSample(diffuseTexture, diffuseSampler, v.texcoord);
    var a_normal = normalize(v.normal);
    var l = dot(a_normal, fsUniforms.lightDirection) * 0.5 + 0.5;
    return vec4f(diffuseColor.rgb * l, diffuseColor.a);
  }
  `;

  function createBuffer(device, data, usage) {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true,
    });
    const dst = new data.constructor(buffer.getMappedRange());
    dst.set(data);
    buffer.unmap();
    return buffer;
  }
  const posArr = [
    1,1,-1, 1,1,1, 1,-1,1, 1,-1,-1, // square x = 1
    -1,1,1, -1,1,-1, -1,-1,-1, -1,-1,1, // square x = -1 
    -1,1,1, 1,1,1, 1,1,-1, -1,1,-1, // y = 1
    -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, -1, -1, -1, -1, -1];
  console.log('posArr.length', posArr.length); 
  // 72 = 6 flat squares * 4 vertices * 3 coordinates
  const positions = new Float32Array(posArr);
  const normArr = [
    1,0,0, 1,0,0, 1,0,0, 1,0,0, // normal x
    -1,0,0, -1,0,0, -1,0,0, -1,0,0, // normal -x 
    0,1,0, 0,1,0, 0,1,0, 0,1,0, // normal y
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  console.log('normArr.length', normArr.length); 
  // 72 - each vertex has normal
  const normals   = new Float32Array(normArr);
  const texcoordArr = [
    0,0, 0,1, 1,1, 1,0,
    1,0, 0,0, 0,1, 1,1, 
    1,0, 0,0, 0,1, 1,1, 
    1,0, 0,0, 0,1, 1,1, 
    1,0, 0,0, 0,1, 1,1, 
    1,0, 0,0, 0,1, 1,1];
  console.log('texcoordArr.length', texcoordArr.length); 
  // 48
  const texcoords = new Float32Array(texcoordArr);
  const indicesArr = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23];
  console.log('indicesArr.length', indicesArr.length); 
  // 36
  const indices   = new Uint16Array(indicesArr);

  const positionBuffer = createBuffer(device, positions, GPUBufferUsage.VERTEX);
  const normalBuffer = createBuffer(device, normals, GPUBufferUsage.VERTEX);
  const texcoordBuffer = createBuffer(device, texcoords, GPUBufferUsage.VERTEX);
  const indicesBuffer = createBuffer(device, indices, GPUBufferUsage.INDEX);

  const tex = device.createTexture({
    size: [2, 2],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
      { texture: tex },
      new Uint8Array([
        200, 0, 0, 255, // red, green, blue, ignored
        0, 200, 0, 255,
        0, 0, 255, 255,
        128, 128, 128, 255,
      ]),
      { bytesPerRow: 8, rowsPerImage: 2 },
      { width: 2, height: 2 },
  );

  const sampler = device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
  });

  const shaderModule = device.createShaderModule({code: shaderSrc});

  const pipeline = device.createRenderPipeline({
    label: 'fake lighting',
    layout: 'auto',
    vertex: {
      module: shaderModule,
      buffers: [
        // position 72 Floats = 3 * 24
        {
          arrayStride: 3 * 4, // 3 floats, 4 bytes each
          attributes: [
            {shaderLocation: 0, offset: 0, format: 'float32x3'},
          ],
        },
        // normals 72 floats = 3 * 24
        {
          arrayStride: 3 * 4, // 3 floats, 4 bytes each
          attributes: [
            {shaderLocation: 1, offset: 0, format: 'float32x3'},
          ],
        },
        // texcoords 48 floats = 2 * 24
        {
          arrayStride: 2 * 4, // 2 floats, 4 bytes each
          attributes: [
            {shaderLocation: 2, offset: 0, format: 'float32x2',},
          ],
        },
      ],
    },
    fragment: {
      module: shaderModule,
      targets: [
        {format: presentationFormat},
      ],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
    ...(canvasInfo.sampleCount > 1 && {
        multisample: {
          count: canvasInfo.sampleCount,
        },
    }),
  });

  const vUniformBufferSize = 2 * 16 * 4; // 2 mat4s * 16 floats per mat * 4 bytes per float
  const fUniformBufferSize = 3 * 4;      // 1 vec3 * 3 floats per vec3 * 4 bytes per float

  const vsUniformBuffer = device.createBuffer({
    size: Math.max(16, vUniformBufferSize),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const fsUniformBuffer = device.createBuffer({
    size: Math.max(16, fUniformBufferSize),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const vsUniformValues = new Float32Array(2 * 16); // 2 mat4s
  const worldViewProjection = vsUniformValues.subarray(0, 16);
  const worldInverseTranspose = vsUniformValues.subarray(16, 32);
  const fsUniformValues = new Float32Array(3);  // 1 vec3
  const lightDirection = fsUniformValues.subarray(0, 3);

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: vsUniformBuffer } },
      { binding: 1, resource: { buffer: fsUniformBuffer } },
      { binding: 2, resource: sampler },
      { binding: 3, resource: tex.createView() },
    ],
  });

  const renderPassDescriptor = {
    colorAttachments: [
      {
        // view: undefined, // Assigned later
        // resolveTarget: undefined, // Assigned Later
        clearValue: [0.5, 0.5, 0.5, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      // view: undefined,  // Assigned later
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };

  function resizeToDisplaySize(device, canvasInfo) {
    const {
      canvas,
      renderTarget,
      presentationFormat,
      depthTexture,
      sampleCount,
    } = canvasInfo;
    const width = Math.max(1, Math.min(device.limits.maxTextureDimension2D, canvas.clientWidth));
    const height = Math.max(1, Math.min(device.limits.maxTextureDimension2D, canvas.clientHeight));

    const needResize = !canvasInfo.renderTarget ||
                       width !== canvas.width ||
                       height !== canvas.height;
    if (needResize) {
      if (renderTarget) {
        renderTarget.destroy();
      }
      if (depthTexture) {
        depthTexture.destroy();
      }

      canvas.width = width;
      canvas.height = height;

      if (sampleCount > 1) {
        const newRenderTarget = device.createTexture({
          size: [canvas.width, canvas.height],
          format: presentationFormat,
          sampleCount,
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        canvasInfo.renderTarget = newRenderTarget;
        canvasInfo.renderTargetView = newRenderTarget.createView();
      }

      const newDepthTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      canvasInfo.depthTexture = newDepthTexture;
      canvasInfo.depthTextureView = newDepthTexture.createView();
    }
    return needResize;
  }

  function render(time) {
    time *= 0.001;
    resizeToDisplaySize(device, canvasInfo);

    const projection = mat4.perspective(30 * Math.PI / 180, canvas.clientWidth / canvas.clientHeight, 0.5, 10);
    const eye = [1, 4, -6];
    const target = [0, 0, 0];
    const up = [0, 1, 0];

    const view = mat4.lookAt(eye, target, up);
    const viewProjection = mat4.multiply(projection, view);
    const world = mat4.rotationY(time);
    mat4.transpose(mat4.inverse(world), worldInverseTranspose);
    mat4.multiply(viewProjection, world, worldViewProjection);

    vec3.normalize([1, 8, -10], lightDirection);

    device.queue.writeBuffer(vsUniformBuffer, 0, vsUniformValues);
    device.queue.writeBuffer(fsUniformBuffer, 0, fsUniformValues);

    if (canvasInfo.sampleCount === 1) {
        const colorTexture = context.getCurrentTexture();
        renderPassDescriptor.colorAttachments[0].view = colorTexture.createView();
    } else {
      renderPassDescriptor.colorAttachments[0].view = canvasInfo.renderTargetView;
      renderPassDescriptor.colorAttachments[0].resolveTarget = context.getCurrentTexture().createView();
    }
    renderPassDescriptor.depthStencilAttachment.view = canvasInfo.depthTextureView;

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, positionBuffer);
    passEncoder.setVertexBuffer(1, normalBuffer);
    passEncoder.setVertexBuffer(2, texcoordBuffer);
    passEncoder.setIndexBuffer(indicesBuffer, 'uint16');
    passEncoder.drawIndexed(indices.length);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

function fail(msg) {
  const elem = document.querySelector('#fail');
  const contentElem = elem.querySelector('.content');
  elem.style.display = '';
  contentElem.textContent = msg;
}

main();
  