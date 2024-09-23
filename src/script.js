import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * Base
 */
// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

// Loaders
const textureLoader = new THREE.TextureLoader();

/**
 * Sizes
 */
const sizes = {
	width: window.innerWidth,
	height: window.innerHeight,
	pixelRatio: Math.min(window.devicePixelRatio, 2),
};

// User input for image upload
const createImageInput = () => {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "image/*"; // Only allow image files
	input.style.position = "fixed";
	input.style.top = "20px";
	input.style.left = "20px";
	input.style.padding = "10px";
	input.style.borderRadius = "10px";
	input.style.border = "none";
	input.style.backgroundColor = "#f0f0f0";
	input.style.boxShadow = "5px 5px 10px #d1d1d1, -5px -5px 10px #ffffff";
	input.style.outline = "none";
	input.style.transition = "all 0.3s ease";

	input.addEventListener("change", (event) => {
		const file = event.target.files[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				updateTexture(e.target.result);
			};
			reader.readAsDataURL(file);
		}
	});

	document.body.appendChild(input);
};

const updateTexture = (imageSrc) => {
	textureLoader.load(imageSrc, (texture) => {
		particlesMaterial.uniforms.uPic.value = texture;
	});
};

createImageInput();

const displacement = {};
displacement.canvas = document.createElement("canvas");
displacement.canvas.width = 128;
displacement.canvas.height = 128;
displacement.canvas.style.position = "fixed";
displacement.canvas.style.width = "128px";
displacement.canvas.style.height = "128px";
displacement.canvas.style.top = "0";
displacement.canvas.style.right = "0";
displacement.canvas.style.zIndex = "10";
displacement.context = displacement.canvas.getContext("2d");
displacement.context.fillStyle = "#181818";
displacement.context.fillRect(
	0,
	0,
	displacement.canvas.width,
	displacement.canvas.height
);
displacement.canvas.style.display = "none";
document.body.appendChild(displacement.canvas);
document.addEventListener("keydown", (e) => {
	// console.log(e);
	if (e.key === "h") {
		displacement.canvas.style.display === "none"
			? (displacement.canvas.style.display = "block")
			: (displacement.canvas.style.display = "none");
	}
});

displacement.glowImg = new Image();
displacement.glowImg.src = "./glow.png";

displacement.interactivePlane = new THREE.Mesh(
	new THREE.PlaneGeometry(10, 10),
	new THREE.MeshBasicMaterial({ color: "red", side: THREE.DoubleSide })
);
scene.add(displacement.interactivePlane);

displacement.raycaster = new THREE.Raycaster();
displacement.coord = new THREE.Vector2(9999, 9999);
displacement.canvasCoord = new THREE.Vector2(9999, 9999);
displacement.cursorPrev = new THREE.Vector2(9999, 9999);

let displacementStrength = 0.0; // Starts at 0, gets stronger with mouse movement
const decayRate = 0.01; // Decay rate for the displacement effect
window.addEventListener("pointermove", (event) => {
	displacement.coord.x = (event.clientX / sizes.width) * 2 - 1;
	displacement.coord.y = -(event.clientY / sizes.height) * 2 + 1;
	// Raycasting to detect mouse interaction
	displacement.raycaster.setFromCamera(displacement.coord, camera);
	const intersections = displacement.raycaster.intersectObject(
		displacement.interactivePlane
	);

	if (intersections.length > 0) {
		const uv = intersections[0].uv;
		displacement.canvasCoord.x = uv.x * displacement.canvas.width;
		displacement.canvasCoord.y = (1 - uv.y) * displacement.canvas.height;

		// Only apply the displacement effect if the cursor is over the image
		displacementStrength = 0.8;
	} else {
		// Reset the displacement strength when the cursor is not over the image
		displacementStrength = Math.max(displacementStrength - decayRate, 0);
	}
});

displacement.texture = new THREE.CanvasTexture(displacement.canvas);
window.addEventListener("resize", () => {
	// Update sizes
	sizes.width = window.innerWidth;
	sizes.height = window.innerHeight;
	sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

	// Materials
	particlesMaterial.uniforms.uResolution.value.set(
		sizes.width * sizes.pixelRatio,
		sizes.height * sizes.pixelRatio
	);

	// Update camera
	camera.aspect = sizes.width / sizes.height;
	camera.updateProjectionMatrix();

	// Update renderer
	renderer.setSize(sizes.width, sizes.height);
	renderer.setPixelRatio(sizes.pixelRatio);
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
	35,
	sizes.width / sizes.height,
	0.1,
	100
);
camera.position.set(0, 0, 18);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
	canvas: canvas,
	antialias: true,
});
renderer.setClearColor("#181818");
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);

/**
 * Particles
 */
const particlesGeometry = new THREE.PlaneGeometry(10, 10, 128, 128);
particlesGeometry.setIndex(null);
particlesGeometry.deleteAttribute("normal");

const initialPosition = particlesGeometry.attributes.position.array.slice();
particlesGeometry.setAttribute(
	"initialPosition",
	new THREE.BufferAttribute(new Float32Array(initialPosition), 3)
);

const intensityArray = new Float32Array(
	particlesGeometry.attributes.position.count
);
const anglesArray = new Float32Array(
	particlesGeometry.attributes.position.count
);
for (let i = 0; i < particlesGeometry.attributes.position.count; i++) {
	intensityArray[i] = Math.random();
	anglesArray[i] = Math.random() * Math.PI * 2;
}

particlesGeometry.setAttribute(
	"intensity",
	new THREE.BufferAttribute(intensityArray, 1)
);
particlesGeometry.setAttribute(
	"angles",
	new THREE.BufferAttribute(anglesArray, 1)
);
const particlesMaterial = new THREE.ShaderMaterial({
	vertexShader: `
        uniform vec2 uResolution;
        uniform sampler2D uPic;
        uniform sampler2D uDisplacement;
        uniform float uDisplacementStrength;
        attribute vec3 initialPosition;
        attribute float intensity;
        attribute float angles;
        varying vec3 vColor;

        void main()
        {
            // Displacement
            vec3 displacedPosition = initialPosition;
            float displacementIntensity = texture(uDisplacement, uv).r;
            displacementIntensity = smoothstep(0.1, 0.3, displacementIntensity);

            vec3 displacement = vec3(
                cos(angles) * 0.2,
                sin(angles) * 0.2,
                1.0
            );
            displacement = normalize(displacement);
            displacement *= displacementIntensity;
            displacement *= 3.0;
            displacement *= intensity;

            // Blend between initial position and displaced position
            displacedPosition += displacement * uDisplacementStrength;

            // Final position
            vec4 modelPosition = modelMatrix * vec4(displacedPosition, 1.0);
            vec4 viewPosition = viewMatrix * modelPosition;
            vec4 projectedPosition = projectionMatrix * viewPosition;
            gl_Position = projectedPosition;

            float pictureI = texture(uPic, uv).r;
            // Point size
            gl_PointSize = 0.15 * pictureI * uResolution.y;
            gl_PointSize *= (1.0 / - viewPosition.z);

            vColor = vec3(pow(pictureI, 2.0));
        }
    `,
	fragmentShader: `
        varying vec3 vColor;

        void main()
        {
            vec2 uv = gl_PointCoord;
            float distanceToCenter = length(uv - vec2(0.5));
            if(distanceToCenter > 0.5)
                discard;
            gl_FragColor = vec4(vColor, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `,
	uniforms: {
		uResolution: new THREE.Uniform(
			new THREE.Vector2(
				sizes.width * sizes.pixelRatio,
				sizes.height * sizes.pixelRatio
			)
		),
		uPic: new THREE.Uniform(textureLoader.load("./picture-2.png")),
		uDisplacement: new THREE.Uniform(displacement.texture),
		uDisplacementStrength: new THREE.Uniform(1.0), // New uniform to control displacement
	},
	blending: THREE.AdditiveBlending,
});

const particles = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particles);
/**
 * Animate
 */
const tick = () => {
	// Update controls
	controls.update();
	displacement.context.globalCompositeOperation = "source-over";
	displacement.context.globalAlpha = 0.1;

	displacement.context.fillRect(
		0,
		0,
		displacement.canvas.width,
		displacement.canvas.height
	);

	displacement.cursorPrev.copy(displacement.coord);

	if (displacementStrength > 0) {
		displacementStrength = Math.max(displacementStrength - decayRate, 0);
	}

	particlesMaterial.uniforms.uDisplacementStrength.value = displacementStrength;

	// Raycasting to detect mouse interaction
	displacement.interactivePlane.visible = false;
	displacement.raycaster.setFromCamera(displacement.coord, camera);
	const intersections = displacement.raycaster.intersectObject(
		displacement.interactivePlane
	);

	if (intersections.length) {
		const uv = intersections[0].uv;
		displacement.canvasCoord.x = uv.x * displacement.canvas.width;
		displacement.canvasCoord.y = (1 - uv.y) * displacement.canvas.height;
	}

	// Draw the glow image on the displacement canvas
	const glowSize = displacement.canvas.width * 0.25;
	displacement.context.globalAlpha = 1.0;
	displacement.context.globalCompositeOperation = "lighten";
	displacement.context.drawImage(
		displacement.glowImg,
		displacement.canvasCoord.x - glowSize / 2,
		displacement.canvasCoord.y - glowSize / 2,
		glowSize,
		glowSize
	);

	displacement.texture.needsUpdate = true;
	// Render
	renderer.render(scene, camera);

	// Call tick again on the next frame
	window.requestAnimationFrame(tick);
};

tick();
