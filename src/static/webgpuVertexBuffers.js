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
    struct Vertex {
        @location(0) position: vec2f,
        @location(1) color: vec4f,
        @location(2) offset: vec2f,
        @location(3) scale: vec2f,
    };
    struct VSOutput {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
    };

    @vertex fn vs(vert: Vertex) -> VSOutput {
        var vsOut: VSOutput;
        vsOut.position = vec4f(vert.position * vert.scale + vert.offset, 0.0, 1.0);
        vsOut.color = vert.color;
        return vsOut;
    }
    
    @fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
        return vsOut.color;
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
            buffers: [
                {
                    arrayStride: 2 * 4, // 2 floats, 4 bytes each
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
                },
                {
                    arrayStride: 6 * 4, // color 4 floats and offset 2 floats, 4 bytes each
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 1, offset: 0, format: 'float32x4' }, // color
                        { shaderLocation: 2, offset: 16, format: 'float32x2' }, // offset
                    ],
                },
                {
                    arrayStride: 2 * 4, // scale 2 floats, 4 bytes each
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 3, offset: 0, format: 'float32x2' }, // scale
                    ],
                },
            ],
        },
        fragment: {
            module,
            targets: [{ format: presentationFormat }],
        },
    });

    // Setup
    const kNumObjects = 100;
    const objectInfos = [];

    // two storage buffers
    const staticUnitSize =
        4 * 4 + // color is 4 32bit floats (4bytes each)
        2 * 4; // offset is 2 32bit floats (4bytes each) which determines triangles position on the screen

    const changingUnitSize = 2 * 4; // scale is 2 32bit floats (4bytes each)
    const staticVertexBufferSize = staticUnitSize * kNumObjects;
    const changingVertexBufferSize = changingUnitSize * kNumObjects;

    const staticVertexBuffer = device.createBuffer({
        label: `static vertex buffer`,
        size: staticVertexBufferSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const changingVertexBuffer = device.createBuffer({
        label: `changing vertex buffer`,
        size: changingVertexBufferSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const kColorOffset = 0;
    const kOffsetOffset = 4;
    const kScaleOffset = 0;

    // set only once
    {
        const staticStorageValues = new Float32Array(staticVertexBufferSize / 4);
        for (let i = 0; i < kNumObjects; ++i) {
            const staticOffset = (i * staticUnitSize) / 4;
            staticStorageValues.set(
                [getRandomNumber(), getRandomNumber(), getRandomNumber(), 1],
                staticOffset + kColorOffset,
            ); // set the color
            staticStorageValues.set(
                [getRandomNumber(-0.9, 0.9), getRandomNumber(-0.8, 0.8)],
                staticOffset + kOffsetOffset,
            ); // set the offset
            objectInfos.push({
                scale: getRandomNumber(0.2, 0.5),
            });
        }
        // copy these values to the GPU
        device.queue.writeBuffer(staticVertexBuffer, 0, staticStorageValues);
    }

    const changingStorageValues = new Float32Array(changingVertexBufferSize / 4);

    // setup storage buffer with vertex data
    const { vertexData, numVertices } = createCircleVertices({
        radius: 0.5,
        innerRadius: 0.25,
    });
    const vertexBuffer = device.createBuffer({
        label: 'vertex buffer vertices',
        size: vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);

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
        console.log('render webGPUVertexBuffers');
        // Get the current texture from the canvas context and
        // set it as the texture to render to.
        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        // Here the first parameter to setVertexBuffer corresponds to the elements of the buffers array in the pipeline we created above.
        pass.setVertexBuffer(0, vertexBuffer);
        pass.setVertexBuffer(1, staticVertexBuffer);
        pass.setVertexBuffer(2, changingVertexBuffer);

        // Set the uniform values in our JavaScript side Float32Array
        const aspect = canvas.width / canvas.height; // resizing with fixed height keeps the triangles size

        objectInfos.forEach(({ scale }, index) => {
            const offset = (index * changingUnitSize) / 4;
            changingStorageValues.set([scale / aspect, scale], offset + kScaleOffset);
        });
        device.queue.writeBuffer(changingVertexBuffer, 0, changingStorageValues);
        pass.draw(numVertices, kNumObjects);

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

// A random number between [min and max)
// With 1 argument it will be [0 to min)
// With no arguments it will be [0 to 1)
function getRandomNumber(min, max) {
    if (min === undefined) {
        min = 0;
        max = 1;
    } else if (max === undefined) {
        max = min;
        min = 0;
    }
    return min + Math.random() * (max - min);
}

function createCircleVertices({
    radius = 1,
    numSubdivisions = 24,
    innerRadius = 0,
    startAngle = 0,
    endAngle = Math.PI * 2,
} = {}) {
    // 2 triangles per subdivision, 3 verts per tri, 2 values (xy) each.
    const numVertices = numSubdivisions * 3 * 2;
    const vertexData = new Float32Array(numSubdivisions * 2 * 3 * 2);

    let offset = 0;
    const addVertex = (x, y) => {
        vertexData[offset++] = x;
        vertexData[offset++] = y;
    };

    // 2 triangles per subdivision
    //
    // 0--1 4
    // | / /|
    // |/ / |
    // 2 3--5
    for (let i = 0; i < numSubdivisions; ++i) {
        const angle1 = startAngle + ((i + 0) * (endAngle - startAngle)) / numSubdivisions;
        const angle2 = startAngle + ((i + 1) * (endAngle - startAngle)) / numSubdivisions;

        const c1 = Math.cos(angle1);
        const s1 = Math.sin(angle1);
        const c2 = Math.cos(angle2);
        const s2 = Math.sin(angle2);

        // first triangle
        addVertex(c1 * radius, s1 * radius);
        addVertex(c2 * radius, s2 * radius);
        addVertex(c1 * innerRadius, s1 * innerRadius);

        // second triangle
        addVertex(c1 * innerRadius, s1 * innerRadius);
        addVertex(c2 * radius, s2 * radius);
        addVertex(c2 * innerRadius, s2 * innerRadius);
    }

    return {
        vertexData,
        numVertices,
    };
}
