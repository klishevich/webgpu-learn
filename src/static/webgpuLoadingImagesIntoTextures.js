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
        vsOutput.position = vec4f(xy, 0.0, 1.0);
        vsOutput.texcoord = xy;
        return vsOutput;
    }

    @group(0) @binding(0) var ourSampler: sampler;
    @group(0) @binding(1) var outTexture: texture_2d<f32>;
    
    @fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
        return textureSample(outTexture, ourSampler, fsInput.texcoord);
    }
    `;
    const module = device.createShaderModule({
        label: 'our_hardcoded_textured_quad_shaders', // is used for error output
        code: shaderSrc,
    });

    const pipeline = device.createRenderPipeline({
        label: 'hardcoded_texture_quad_pipeline',
        layout: 'auto',
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format: presentationFormat }],
        },
    });

    const loadImageBitmap = async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    }

    // CREATING A TEXTURE
    const url = '/f-texture.png';
    const source = await loadImageBitmap(url);
    const texture = device.createTexture({
        label: url,
        format: 'rgba8unorm',
        size: [source.width, source.height],
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST| GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
        { source, flipY: true },
        { texture },
        { width: source.width, height: source.height },
    );
    // END CREATING A TEXTURE

    // offsets to the various uniform values in float32 indices
    const kScaleOffset = 0;
    const kOffsetOffset = 2;

    const bindGroups = [];
    for (let i = 0; i < 16; ++i) {
        const sampler = device.createSampler({
            addressModeU: i & 1 ? 'repeat' : 'clamp-to-edge',
            addressModeV: i & 2 ? 'repeat' : 'clamp-to-edge',
            magFilter: i & 4 ? 'linear' : 'nearest',
        });
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: texture.createView() },
            ],
        });
        bindGroups.push(bindGroup);
    }

    const renderPassDescriptor = {
        label: 'my_canvas_rendenrPass',
        colorAttachments: [
            {
                // view: <- to be filled out when we render
                clearValue: [0.3, 0.3, 0.3, 1],
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
    };

    const settings = {
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        magFilter: 'linear',
    };

    function render() {
        const ndx =
            (settings.addressModeU === 'repeat' ? 1 : 0) +
            (settings.addressModeV === 'repeat' ? 2 : 0) +
            (settings.magFilter === 'linear' ? 4 : 0);
        const bindGroup = bindGroups[ndx];

        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
        const encoder = device.createCommandEncoder({ label: 'render quad encoder' });
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6); // call our vertex shader 3 times
        pass.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]); // rendering start here
    }

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const canvas = entry.target;
            const width = entry.contentBoxSize[0].inlineSize;
            const height = entry.contentBoxSize[0].blockSize;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        }
        render();
    });
    observer.observe(canvas);
}
main();
