// A random number between [min and max)
// With 1 argument it will be [0 to min)
// With no arguments it will be [0 to 1)
const randFn = (min, max) => {
    if (min === undefined) {
        min = 0;
        max = 1;
    } else if (max === undefined) {
        max = min;
        min = 0;
    }
    return min + Math.random() * (max - min);
};

async function main() {
    // SETUP
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

    const shaderSrc = `
    struct OurStruct {
        color: vec4f,
        offset: vec2f,
    };
    struct OtherStruct {
        scale: vec2f,
    };

    @group(0) @binding(0) var<uniform> ourStruct: OurStruct;
    @group(0) @binding(1) var<uniform> otherStruct: OtherStruct;

    @vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {        
        let pos = array(
            vec2f( 0.0,  0.5),  // top center
            vec2f(-0.5, -0.5),  // bottom left
            vec2f( 0.5, -0.5)   // bottom right
        );
    
        return vec4f(pos[vertexIndex] * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
    }
    
    @fragment fn fs() -> @location(0) vec4f {
        return ourStruct.color;
    }
    `;

    const module = device.createShaderModule({
        label: 'triangle_shaders_with_uniforms',
        code: shaderSrc,
    });

    const pipeline = device.createRenderPipeline({
        label: 'multiple_uniforms_pipeline',
        layout: 'auto',
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format: presentationFormat }],
        },
    });

    // CREATING UNIFORM BUFFERS
    // create 2 buffers for the uniform values
    const staticUniformBufferSize =
        4 * 4 + // color is 4 32bit floats (4bytes each)
        2 * 4 + // offset is 2 32bit floats (4bytes each)
        2 * 4; // padding
    const scaleUniformBufferSize = 2 * 4; // scale is 2 32bit floats (4bytes each)

    const kColorOffset = 0;
    const kOffsetOffset = 4;
    const kScaleOffset = 0;

    const kNumObjects = 100;
    const objectInfos = [];

    for (let i = 0; i < kNumObjects; ++i) {
        const staticUniformBuffer = device.createBuffer({
            label: `static uniforms for obj: ${i}`,
            size: staticUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });

        // only set once
        {
            const staticUniformValues = new Float32Array(staticUniformBufferSize  / 4);
            staticUniformValues.set([randFn(), randFn(), randFn(), 1], kColorOffset); // set the color
            staticUniformValues.set([randFn(-0.9, 0.9), randFn(-0.9, 0.9)], kOffsetOffset); // set the offset
            // copy these values to the GPU
            device.queue.writeBuffer(staticUniformBuffer, 0, staticUniformValues);
        }

        const scaleUniformBuffer = device.createBuffer({
            label: `scale uniforms for obj: ${i}`,
            size: scaleUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const scaleUniformValues = new Float32Array(scaleUniformBufferSize / 4);

        const bindGroup = device.createBindGroup({
            label: `bind group for obj: ${i}`,
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: staticUniformBuffer } },
                { binding: 1, resource: { buffer: scaleUniformBuffer } },
            ],
        });

        objectInfos.push({
            scale: randFn(0.2, 0.5),
            scaleUniformBuffer,
            scaleUniformValues,
            bindGroup,
        });
    }

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

    function render() {
        console.log('render');
        // Get the current texture from the canvas context and
        // set it as the texture to render to.
        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);

        // Set the uniform values in our JavaScript side Float32Array
        const aspect = canvas.width / canvas.height;

        for (const { scale, scaleUniformBuffer, scaleUniformValues, bindGroup } of objectInfos) {
            scaleUniformValues.set([scale / aspect, scale], kScaleOffset); // set the scale
            device.queue.writeBuffer(scaleUniformBuffer, 0, scaleUniformValues);

            pass.setBindGroup(0, bindGroup);
            pass.draw(3); // call our vertex shader 3 times
        }
        pass.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            console.log('resized');
            const canvas = entry.target;
            const width = entry.contentBoxSize[0].inlineSize;
            const height = entry.contentBoxSize[0].blockSize;
            canvas.width = Math.max(1, Math.min(width, device.limits.maxTextureDimension2D));
            canvas.height = Math.max(1, Math.min(height, device.limits.maxTextureDimension2D));
        }
        // re-render
        render();
    });
    observer.observe(canvas);
}
main();
