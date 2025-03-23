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
        @location(4) perVertexColor: vec4f,
    };
    struct VSOutput {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
    };

    @vertex fn vs(
        @location(0) position: vec2f,
        @location(1) color: vec4f,
        @location(2) offset: vec2f,
        @location(3) scale: vec2f,
        @location(4) perVertexColor: vec4f,
    ) -> VSOutput {
        var vsOut: VSOutput;
        vsOut.position = vec4f(position * scale + offset, 0.0, 1.0);
        vsOut.color = color * perVertexColor;
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
                    arrayStride: 2 * 4 + 4, // 2 floats 4 bytes each + 4 bytes
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
                        { shaderLocation: 4, offset: 8, format: 'unorm8x4' }, // per vertex color
                    ],
                },
                {
                    arrayStride: 4 + 2 * 4, // color 4 bytes and offset 2 floats
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 1, offset: 0, format: 'unorm8x4' }, // color
                        { shaderLocation: 2, offset: 4, format: 'float32x2' }, // offset
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

    // 2 vertex buffers
    const staticUnitSize =
        4 + // color is 4 bytes
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
    const kOffsetOffset = 1;
    const kScaleOffset = 0;

    // set only once
    {
        const staticVertexValuesU8 = new Uint8Array(staticVertexBufferSize);
        const staticVertexValuesF32 = new Float32Array(staticVertexValuesU8.buffer);
        for (let i = 0; i < kNumObjects; ++i) {
            const staticOffsetU8 = i * staticUnitSize;
            const staticOffsetF32 = staticOffsetU8 / 4;
            staticVertexValuesU8.set(
                // set the color
                [getRandomNumber() * 255, getRandomNumber() * 255, getRandomNumber() * 255, 255],
                staticOffsetU8 + kColorOffset,
            );
            staticVertexValuesF32.set(
                // set the offset
                [getRandomNumber(-0.9, 0.9), getRandomNumber(-0.9, 0.9)],
                staticOffsetF32 + kOffsetOffset,
            );
            objectInfos.push({
                scale: getRandomNumber(0.2, 0.5),
            });
        }
        // copy these values to the GPU
        device.queue.writeBuffer(staticVertexBuffer, 0, staticVertexValuesF32); // staticVertexValuesU8 works too
    }

    const changingStorageValues = new Float32Array(changingVertexBufferSize / 4);

    // setup storage buffer with vertex data
    const { vertexData, numVertices, indexData } = createCircleVertices({
        radius: 0.5,
        innerRadius: 0.25,
    });
    const vertexBuffer = device.createBuffer({
        label: 'vertex buffer vertices',
        size: vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    const indexBuffer = device.createBuffer({
        label: 'index buffer',
        size: indexData.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, indexData);

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
        pass.setIndexBuffer(indexBuffer, 'uint32');

        // Set the uniform values in our JavaScript side Float32Array
        const aspect = canvas.width / canvas.height; // resizing with fixed height keeps the triangles size

        objectInfos.forEach(({ scale }, index) => {
            const offset = (index * changingUnitSize) / 4;
            changingStorageValues.set([scale / aspect, scale], offset + kScaleOffset);
        });
        device.queue.writeBuffer(changingVertexBuffer, 0, changingStorageValues);
        pass.drawIndexed(numVertices, kNumObjects);

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
    // 2 vertices at each subdivision, + 1 to wrap around the circle.
    const numVertices = (numSubdivisions + 1) * 2;
    // 2 32-bit values for position (xy) and 1 32-bit value for color (rgb_)
    // The 32-bit color value will be written/read as 4 8-bit values
    const vertexData = new Float32Array(numVertices * (2 + 1));
    const colorData = new Uint8Array(vertexData.buffer);

    let offset = 0;
    let colorOffset = 8;
    const addVertex = (x, y, r, g, b) => {
        vertexData[offset++] = x;
        vertexData[offset++] = y;
        offset += 1; // skip the color
        colorData[colorOffset++] = r * 255;
        colorData[colorOffset++] = g * 255;
        colorData[colorOffset++] = b * 255;
        colorOffset += 9; // skip extra byte and the position
    };

    const innerColor = [1, 1, 1];
    const outerColor = [0.1, 0.1, 0.1];

    // 2 triangles per subdivision
    //
    // 0  2  4  6  8 ...
    //
    // 1  3  5  7  9 ...
    for (let i = 0; i <= numSubdivisions; ++i) {
        const angle = startAngle + ((i + 0) * (endAngle - startAngle)) / numSubdivisions;

        const c1 = Math.cos(angle);
        const s1 = Math.sin(angle);

        addVertex(c1 * radius, s1 * radius, ...outerColor);
        addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
    }

    const indexData = new Uint32Array(numSubdivisions * 6);
    let ndx = 0;

    // 1st tri  2nd tri  3rd tri  4th tri
    // 0 1 2    2 1 3    2 3 4    4 3 5
    //
    // 0--2        2     2--4        4  .....
    // | /        /|     | /        /|
    // |/        / |     |/        / |
    // 1        1--3     3        3--5  .....
    for (let i = 0; i < numSubdivisions; ++i) {
        const ndxOffset = i * 2;

        // first triangle
        indexData[ndx++] = ndxOffset;
        indexData[ndx++] = ndxOffset + 1;
        indexData[ndx++] = ndxOffset + 2;

        // second triangle
        indexData[ndx++] = ndxOffset + 2;
        indexData[ndx++] = ndxOffset + 1;
        indexData[ndx++] = ndxOffset + 3;
    }

    return {
        vertexData,
        numVertices: indexData.length,
        indexData
    };
}
