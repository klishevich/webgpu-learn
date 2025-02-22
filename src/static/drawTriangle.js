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

    const shaderSrc = `
    @vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
        let pos = array(
            vec2f( 0.0,  0.5),  // top center
            vec2f(-0.5, -0.5),  // bottom left
            vec2f( 0.5, -0.5)   // bottom right
        );
    
        return vec4f(pos[vertexIndex], 0.0, 1.0);
    }
    
    @fragment fn fs() -> @location(0) vec4f {
        return vec4f(1.0, 0.0, 0.0, 1.0);
    }
    `;

    const module = device.createShaderModule({
        label: 'my_triangle_shader', // is used for error output
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
        // Get the current texture from the canvas context and
        // set it as the texture to render to.
        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

        // make a command encoder to start encoding commands
        const encoder = device.createCommandEncoder({ label: 'our encoder' });

        // make a render pass encoder to encode render specific commands
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.draw(3); // call our vertex shader 3 times
        pass.end();
        console.log('end');
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }

    render();
}
main();
