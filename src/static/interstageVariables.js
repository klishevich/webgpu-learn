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
        @location(0) @interpolate(perspective, center) color: vec4f,
    };

    @vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> OurVertexShaderOutput {
        let pos = array(
            vec2f( 0.0,  0.5),  // top center
            vec2f(-0.5, -0.5),  // bottom left
            vec2f( 0.5, -0.5)   // bottom right
        );
        var color = array<vec4f, 3>(
            vec4f(1, 0, 0, 1), // red
            vec4f(0, 1, 0, 1), // green
            vec4f(0, 0, 1, 1), // blue
        );
    
        var vsOutput: OurVertexShaderOutput;
        vsOutput.position = vec4f(pos[vertexIndex], 0.0, 1.0);
        vsOutput.color = color[vertexIndex];
        return vsOutput;
    }
    
    @fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
        return fsInput.color;
    }
    `;
    // @fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
    //     return fsInput.color;
    // }
    const shaderCheckerBoardSrc = `
    struct OurVertexShaderOutput {
        @builtin(position) position: vec4f
    };

    @vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> OurVertexShaderOutput {
        let pos = array(
            vec2f(-1,  1),  // top center
            vec2f(-1, -1),  // bottom left
            vec2f( 0, 0)   // bottom right
        );
    
        var vsOutput: OurVertexShaderOutput;
        vsOutput.position = vec4f(pos[vertexIndex], 0.0, 1.0);
        return vsOutput;
    }
    
    @fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
        let red = vec4f(1, 0, 0, 1);
        let cyan = vec4f(0, 1, 1, 1);
 
        let grid = vec2u(fsInput.position.xy) / 20;
        let checker = (grid.x + grid.y) % 2 == 1;
 
        return select(red, cyan, checker);
    }
    `;
    // If condition is false return `a`, otherwise return `b`
    // select = (a, b, condition) => condition ? b : a;

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
        // The new size texture is created here
        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

        // make a command encoder to start encoding commands
        const encoder = device.createCommandEncoder({ label: 'our encoder' });

        // make a render pass encoder to encode render specific commands
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.draw(3); // call our vertex shader 3 times
        pass.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]); // rendering start here
    }

    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            console.log('interstageVariables.js');
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
