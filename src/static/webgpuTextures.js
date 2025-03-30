// https://webgpufundamentals.org/webgpu/lessons/webgpu-fundamentals.html
async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
        fail('need a browser that supports WebGPU');
        return;
    }

    // Get a WebGPU context from the canvas and configure it
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('webgpu');
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: presentationFormat,
    });

    // SHADER CODE IS HERE
    const shaderSrc = `
    struct OurVertexShaderOutput {
        @builtin(position) position: vec4f,
        @location(0) texcoord: vec2f,
    };

    struct Uniforms {
        scale: vec2f,
        offset: vec2f,
    };
    @group(0) @binding(2) var<uniform> uni: Uniforms;

    @vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> OurVertexShaderOutput {
        let pos = array(
            // 1st triangle
            vec2f(0.0, 0.0), // center
            vec2f(1.0, 0.0), // right, center
            vec2f(0.0, 1.0), // center, top
            // 2nd triangle
            vec2f(0.0, 1.0), // center, top
            vec2f(1.0, 0.0), // right, center
            vec2f(1.0, 1.0), // right, top
        );
    
        var vsOutput: OurVertexShaderOutput;
        let xy = pos[vertexIndex];
        // vsOutput.position = vec4f(xy, 0.0, 1.0);
        vsOutput.position = vec4f(xy * uni.scale + uni.offset, 0.0, 1.0);
        vsOutput.texcoord = xy;
        // vsOutput.texcoord = vec2f(xy.x, 1 - xy.y); flipping the coordinates
        return vsOutput;
    }

    @group(0) @binding(0) var ourSampler: sampler;
    @group(0) @binding(1) var outTexture: texture_2d<f32>;
    
    @fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
        return textureSample(outTexture, ourSampler, fsInput.texcoord);
    }
    `;

    // CREATING A TEXTURE
    const kTextureWidth = 5;
    const kTextureHeight = 7;
    const _ = [255,   0,   0, 255];  // red
    const y = [255, 255,   0, 255];  // yellow
    const b = [  0,   0, 255, 255];  // blue
    const textureData = new Uint8Array([
      b, _, _, _, _,
      _, y, y, y, _,
      _, y, _, _, _,
      _, y, y, _, _,
      _, y, _, _, _,
      _, y, _, _, _,
      _, _, _, _, _,
    ].flat());
    // const textureData = new Uint8Array([
    //     _, _, _, _, _,
    //     _, y, _, _, _,
    //     _, y, _, _, _,
    //     _, y, y, _, _,
    //     _, y, _, _, _,
    //     _, y, y, y, _,
    //     b, _, _, _, _,
    //   ].flat());
    const texture = device.createTexture({
        size: [kTextureWidth, kTextureHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
    device.queue.writeTexture(
        { texture },
        textureData,
        { bytesPerRow: kTextureWidth * 4 },
        { width: kTextureWidth, height: kTextureHeight },
    );
    // const sampler = device.createSampler();
    // END CREATING A TEXTURE

    const module = device.createShaderModule({
        label: 'our hardcoded rgb triangle shaders', // is used for error output
        code: shaderSrc,
    });

    const pipeline = device.createRenderPipeline({
        label: 'my_triangle_pipeline',
        layout: 'auto',
        vertex: {
            // entryPoint: 'vs', // not needed if there is only one of the type
            module,
        },
        fragment: {
            // entryPoint: 'fs',
            module,
            targets: [{ format: presentationFormat }],
        },
    });

    // const bindGroup = device.createBindGroup({
    //     layout: pipeline.getBindGroupLayout(0),
    //     entries: [
    //       { binding: 0, resource: sampler },
    //       { binding: 1, resource: texture.createView() },
    //     ],
    //   });

    // create a buffer for the uniform values
    const uniformBufferSize =
        2 * 4 + // scale is 2 32bit floats (4bytes each)
        2 * 4;  // offset is 2 32bit floats (4bytes each)
    const uniformBuffer = device.createBuffer({
        label: 'uniforms for quad',
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // create a typedarray to hold the values for the uniforms in JavaScript
    const uniformValues = new Float32Array(uniformBufferSize / 4);

    // offsets to the various uniform values in float32 indices
    const kScaleOffset = 0;
    const kOffsetOffset = 2;

    const bindGroups = [];
    for (let i = 0; i < 16; ++i) {
        const sampler = device.createSampler({
            addressModeU: (i & 1) ? 'repeat' : 'clamp-to-edge',
            addressModeV: (i & 2) ? 'repeat' : 'clamp-to-edge',
            magFilter: (i & 4) ? 'linear' : 'nearest',
            minFilter: (i & 8) ? 'linear' : 'nearest',
        });
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: texture.createView() },
                { binding: 2, resource: { buffer: uniformBuffer }},
            ],
        });
        bindGroups.push(bindGroup);
    }

    const settings = {
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        magFilter: 'linear',
        minFilter: 'linear',
    };

    const renderPassDescriptor = {
        label: 'my_canvas_renderPass',
        colorAttachments: [
            {
                // view: <- to be filled out when we render
                clearValue: [0.3, 0.3, 0.3, 1],
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
    };

    function render(time) {
        time *= 0.001;
        const ndx =
            (settings.addressModeU === 'repeat' ? 1 : 0) +
            (settings.addressModeV === 'repeat' ? 2 : 0) +
            (settings.magFilter === 'linear' ? 4 : 0) +
            (settings.minFilter === 'linear' ? 8 : 0);
        const bindGroup = bindGroups[ndx];

        // compute a scale that will draw our 0 to 1 clip space quad
        // 2x2 pixels in the canvas
        console.log('canvas.width', canvas.width);
        console.log('canvas.height', canvas.height);
        const scaleX = 4 / canvas.width;
        const scaleY = 4 / canvas.height;
        uniformValues.set([scaleX, scaleY], kScaleOffset); // set the scale
        uniformValues.set([Math.sin(time * 0.25) * 0.8, -0.8], kOffsetOffset); // set the offset
        // copy the values from JavaScript to the GPU
        device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

        // make a command encoder to start encoding commands
        const encoder = device.createCommandEncoder({ label: 'our encoder' });

        // make a render pass encoder to encode render specific commands
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6); // call our vertex shader 3 times
        pass.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]); // rendering start here
        requestAnimationFrame(render);
    }

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            console.log('interstageVariables.js');
            const canvas = entry.target;
            const width = entry.contentBoxSize[0].inlineSize / 64;
            const height = entry.contentBoxSize[0].blockSize / 64;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        }
        // re-render
        requestAnimationFrame(render);
    });
    observer.observe(canvas);
}
main();
