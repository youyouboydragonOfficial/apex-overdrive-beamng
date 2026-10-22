/**
 * APEX OVERDRIVE: BeamNG Soft-Body Physics Edition v2.5
 * Core Simulation Engine:
 * - Extreme Realism Soft-Body Crushing & Accordion Metal Folding
 * - Snapping Axles & Detached Rolling Wheels with Scraping Sparks
 * - Procedural Glass Shattering & Fluid Leaks (Radiator Coolant, Oil Pan, Fuel)
 * - 22+ Advanced Features (Replay, OBD-II, Tuning, Weather, Wipers, Police Pursuit, Missions, Photo Mode, Gamepad)
 */

(function (global) {
    'use strict';

    const {
        CAR_SPECS,
        buildSculptedPlayerCar,
        buildSculptedTrafficVehicle,
        deformMeshAtPoint,
        resetDeformableMesh,
        deformNodeBeamSkeleton,
        resetNodeBeamSkeleton
    } = global.ApexCarBuilder;

    const {
        ROAD_WIDTH,
        LANE_CENTERS,
        HIGHWAY_SEGMENT_LENGTH,
        TIME_OF_DAY_PRESETS,
        MAP_SPECS,
        LEVEL_SPECS,
        createProceduralRoadTexture,
        createProceduralEnvTexture,
        createFinishGoalArch,
        createSandboxObstacle
    } = global.ApexWorldBuilder;

    const audio = new global.RacingAudioEngine();

    // Persistent User Data (Career Cash, Unlocked Cars, Cleared Stages)
    let userData = {
        cash: 150000,
        unlockedCars: ['HYPER'],
        clearedLevels: {},
        tuning: {}
    };
    try {
        const saved = localStorage.getItem('apex_beamng_userdata_v2');
        if (saved) userData = Object.assign(userData, JSON.parse(saved));
    } catch (e) {}

    function saveUserData() {
        try {
            localStorage.setItem('apex_beamng_userdata_v2', JSON.stringify(userData));
        } catch (e) {}
    }

    const state = {
        mode: 'MENU', // MENU, PLAYING, EXPLODING, GAMEOVER, STAGECLEAR, PHOTO_MODE, REPLAY_MODE
        gameType: 'CAREER', // CAREER, ENDLESS, SANDBOX, MISSION
        currentMission: null,
        selectedCar: 'HYPER',
        selectedMap: 'TOKYO',
        selectedLevel: 2,
        timeOfDay: 'MIDNIGHT',
        weather: 'CLEAR', // CLEAR, RAIN, SNOW, FOG, THUNDER
        trafficDensityMult: 0.70, // Balanced default traffic
        gravity: -21.0,

        // Tuning parameters
        engineSwap: 'STOCK',
        suspensionCamber: 0.0,
        suspensionHeight: 0.0,
        suspensionStiffness: 1.0,
        tireCompound: 'STREET',

        // Lights & Electrics
        lightsOn: true,
        highBeam: false,
        hazardBlinkers: false,
        wipersActive: false,
        wiperAngle: 0,
        underglowRGB: true,
        customPaintColor: null,
        customFinish: 'METALLIC',
        underglowEnabled: true,
        beamSkeletonVisible: false,
        slowMoActive: false,
        timeScale: 1.0,

        // Police Pursuit & Wanted Level
        wantedLevel: 0, // 0 to 5 stars
        wantedHeat: 0,

        // Dynamics & Telemetry
        nosFuel: 100,
        nosActive: false,
        handbrakeActive: false,
        driftScore: 0,
        driftAngle: 0,
        isDrifting: false,
        draftingActive: false,
        draftingTime: 0,

        hp: 100,
        score: 0,
        overtakes: 0,
        combo: 0,
        speedKmh: 0,
        topSpeedKmh: 0,
        minSpeedKmh: 45,
        playerX: 0,
        playerY: 0,
        playerVY: 0,
        playerVX: 0,
        playerYaw: 0,
        playerRoll: 0,
        playerPitch: 0,

        longitudinalG: 0,
        lateralG: 0,
        peakImpactG: 0,
        screenShake: 0,
        screenShakeVec: new THREE.Vector3(),

        spinOutTimer: 0,
        invulnerableTimer: 0,
        explosionTimer: 0,
        distanceTraveled: 0,
        goalDistanceMeters: 3200,
        finishArchSpawned: false,
        nextEtcDistance: 360,

        // Camera & Controls
        cameraPreset: 0, // 0: Chase, 1: Low, 2: Cockpit, 3: Heli
        cameraDragYaw: 0.35,
        cameraDragPitch: 0.08,
        isMouseDragging: false,
        lastMouseX: 0,
        lastMouseY: 0,

        // Gamepad API state
        gamepadIndex: null,
        lastGamepadVibrateTime: 0,

        // Crash Replay Buffer
        replayBuffer: [],
        replayIndex: 0,
        isReplaying: false
    };

    const keys = {
        ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
        KeyA: false, KeyD: false, KeyW: false, KeyS: false,
        Space: false, ShiftLeft: false, ShiftRight: false,
        KeyB: false, KeyL: false, KeyK: false, KeyJ: false, KeyU: false, KeyH: false, KeyM: false, KeyP: false
    };

    let scene, camera, renderer, clock;
    let hemiLight, dirLight;
    let physicsWorld;
    let roadTexture, envTexture;
    let roadMesh, shoulderLeft, shoulderRight;
    let streetlights = [];
    let sceneryPillars = [];
    let speedLines = [];
    let weatherParticles = [];
    let rainParticles = [];
    let trafficCars = [];
    let roadTraps = [];
    let detachedDebris = [];
    let particles = [];
    let rollingWheels = []; // SNAPPED WHEELS WITH ROLLING CANNON.JS BODIES!
    let roadStains = []; // OIL & COOLANT SLICKS ON ASPHALT!

    const sharedGeos = {
        spark: null,
        shard: null,
        smoke: null,
        steam: null,
        fire: null,
        glass: null,
        explosion: null,
        debris: null
    };

    let playerCar = null;

    function initThreeAndPhysics() {
        const canvas = document.getElementById('game-canvas');
        const wrapper = document.getElementById('canvas-wrapper');

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050811);
        scene.fog = new THREE.FogExp2(0x050811, 0.0048);

        camera = new THREE.PerspectiveCamera(62, wrapper.clientWidth / wrapper.clientHeight, 0.1, 400);
        camera.position.set(0, 3.6, 8.2);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.25;

        clock = new THREE.Clock();

        physicsWorld = new CANNON.World();
        physicsWorld.gravity.set(0, state.gravity, 0);
        physicsWorld.broadphase = new CANNON.NaiveBroadphase();

        const defaultMaterial = new CANNON.Material('default');
        const contactMat = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
            friction: 0.38,
            restitution: 0.52
        });
        physicsWorld.defaultContactMaterial = contactMat;

        const groundBody = new CANNON.Body({
            mass: 0,
            material: defaultMaterial,
            collisionFilterGroup: 1,
            collisionFilterMask: 1 | 2
        });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        physicsWorld.addBody(groundBody);

        sharedGeos.spark = new THREE.BoxGeometry(0.07, 0.07, 0.42);
        sharedGeos.shard = new THREE.BoxGeometry(0.20, 0.06, 0.22);
        sharedGeos.smoke = new THREE.DodecahedronGeometry(0.32, 0);
        sharedGeos.steam = new THREE.DodecahedronGeometry(0.25, 0);
        sharedGeos.fire = new THREE.DodecahedronGeometry(0.28, 0);
        sharedGeos.glass = new THREE.BoxGeometry(0.12, 0.12, 0.04);
        sharedGeos.explosion = new THREE.DodecahedronGeometry(0.58, 1);
        sharedGeos.debris = new THREE.BoxGeometry(0.36, 0.12, 0.40);

        roadTexture = createProceduralRoadTexture();
        envTexture = createProceduralEnvTexture();
        scene.environment = envTexture;

        hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.95);
        scene.add(hemiLight);

        dirLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
        dirLight.position.set(28, 52, 32);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 5;
        dirLight.shadow.camera.far = 160;
        const d = 42;
        dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
        scene.add(dirLight);

        buildHighwayEnvironment();
        rebuildPlayerCar();
        initSpeedAndWeatherLines();
        applyTimeOfDayAndWeather(state.timeOfDay, state.weather);
        applyMapTheme(state.selectedMap);

        window.addEventListener('resize', onWindowResize);
        window.addEventListener('gamepadconnected', (e) => {
            state.gamepadIndex = e.gamepad.index;
            addFloatingNotification('🎮 ゲームパッド接続完亁E (振動！E��ナログ対忁E', 'text-emerald-300');
        });
    }

    function buildHighwayEnvironment() {
        const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, HIGHWAY_SEGMENT_LENGTH);
        const roadMat = new THREE.MeshStandardMaterial({
            map: roadTexture,
            roughness: 0.34,
            metalness: 0.22
        });
        roadMesh = new THREE.Mesh(roadGeo, roadMat);
        roadMesh.rotation.x = -Math.PI / 2;
        roadMesh.position.z = -HIGHWAY_SEGMENT_LENGTH / 2 + 30;
        roadMesh.receiveShadow = true;
        scene.add(roadMesh);

        const terrainGeo = new THREE.PlaneGeometry(280, HIGHWAY_SEGMENT_LENGTH);
        const terrainMat = new THREE.MeshStandardMaterial({ color: 0x080c14, roughness: 0.9 });
        const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
        terrainMesh.rotation.x = -Math.PI / 2;
        terrainMesh.position.set(0, -0.08, -HIGHWAY_SEGMENT_LENGTH / 2 + 30);
        scene.add(terrainMesh);

        const barrierGeo = new THREE.BoxGeometry(0.95, 1.25, HIGHWAY_SEGMENT_LENGTH);
        const barrierMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.52, metalness: 0.38 });

        shoulderLeft = new THREE.Mesh(barrierGeo, barrierMat);
        shoulderLeft.position.set(-ROAD_WIDTH / 2 - 0.48, 0.62, -HIGHWAY_SEGMENT_LENGTH / 2 + 30);
        shoulderLeft.receiveShadow = true;
        shoulderLeft.castShadow = true;
        scene.add(shoulderLeft);

        shoulderRight = new THREE.Mesh(barrierGeo, barrierMat);
        shoulderRight.position.set(ROAD_WIDTH / 2 + 0.48, 0.62, -HIGHWAY_SEGMENT_LENGTH / 2 + 30);
        shoulderRight.receiveShadow = true;
        shoulderRight.castShadow = true;
        scene.add(shoulderRight);

        const stripGeo = new THREE.BoxGeometry(0.16, 0.22, HIGHWAY_SEGMENT_LENGTH);
        const stripL = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
        stripL.position.set(-ROAD_WIDTH / 2 + 0.02, 0.85, -HIGHWAY_SEGMENT_LENGTH / 2 + 30);
        scene.add(stripL);

        const stripR = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        stripR.position.set(ROAD_WIDTH / 2 - 0.02, 0.85, -HIGHWAY_SEGMENT_LENGTH / 2 + 30);
        scene.add(stripR);

        // Destructible Streetlights & Overhead Gantries
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
        const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
        const signBoardMat = new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.4 });

        for (let z = 20; z > -225; z -= 30) {
            [-1, 1].forEach(side => {
                const lampGroup = new THREE.Group();
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 8.8, 8), poleMat);
                pole.position.y = 4.4;
                lampGroup.add(pole);

                const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.16), poleMat);
                arm.position.set(-side * 1.6, 8.7, 0);
                lampGroup.add(arm);

                const bulb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), lampBulbMat);
                bulb.position.set(-side * 2.8, 8.6, 0);
                lampGroup.add(bulb);

                lampGroup.position.set(side * (ROAD_WIDTH / 2 + 0.9), 0, z);
                lampGroup.userData = { destructible: true, hp: 100, broken: false };
                scene.add(lampGroup);
                streetlights.push(lampGroup);
            });

            if (Math.abs(z) % 90 < 15) {
                const gantry = new THREE.Group();
                const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 2.6, 0.5, 0.5), poleMat);
                beam.position.y = 7.8;
                const boardL = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.8, 0.28), signBoardMat);
                boardL.position.set(-7, 7.9, 0);
                const boardR = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.8, 0.28), signBoardMat);
                boardR.position.set(7, 7.9, 0);
                const neonBorder = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.14, 0.32), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
                neonBorder.position.y = 6.95;
                gantry.add(beam, boardL, boardR, neonBorder);
                gantry.position.set(0, 0, z);
                gantry.userData = { destructible: true, hp: 150, broken: false };
                scene.add(gantry);
                streetlights.push(gantry);
            }
        }

        // Wide Scenery Buildings
        for (let i = 0; i < 32; i++) {
            const w = 11 + Math.random() * 16;
            const h = 22 + Math.random() * 65;
            const d = 11 + Math.random() * 16;
            const bldgMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75, metalness: 0.25 });
            const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bldgMat);
            const side = i % 2 === 0 ? -1 : 1;
            bldg.position.set(
                side * (ROAD_WIDTH / 2 + 15 + Math.random() * 38),
                h / 2 - 2,
                20 - (i * 8.0)
            );

            const neonColor = i % 3 === 0 ? 0x38bdf8 : (i % 3 === 1 ? 0xf43f5e : 0xa855f7);
            const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.5, d + 0.25), new THREE.MeshBasicMaterial({ color: neonColor }));
            neonStrip.position.y = h * 0.32;
            bldg.add(neonStrip);
            bldg.userData = { neonStrip, baseH: h };
            scene.add(bldg);
            sceneryPillars.push(bldg);
        }
    }

    function applyTimeOfDayAndWeather(todKey, weatherKey) {
        state.timeOfDay = todKey;
        state.weather = weatherKey;

        const tod = TIME_OF_DAY_PRESETS[todKey] || TIME_OF_DAY_PRESETS.MIDNIGHT;
        scene.background.setHex(tod.sky);
        scene.fog.color.setHex(tod.fog);
        scene.fog.density = tod.density;
        dirLight.color.setHex(tod.lightColor);
        dirLight.intensity = tod.lightIntensity;
        hemiLight.groundColor.setHex(tod.hemiGround);

        if (weatherKey === 'RAIN' || weatherKey === 'THUNDER') {
            roadMesh.material.roughness = 0.12; // Wet mirror reflections!
            roadMesh.material.metalness = 0.45;
            scene.fog.density = 0.0075;
        } else if (weatherKey === 'FOG') {
            scene.fog.density = 0.015;
        } else {
            roadMesh.material.roughness = 0.34;
            roadMesh.material.metalness = 0.22;
        }
    }

    function rebuildPlayerCar() {
        if (playerCar && playerCar.root) {
            scene.remove(playerCar.root);
        }
        const customOpts = {
            finishType: state.customFinish,
            underglowEnabled: state.underglowEnabled
        };
        if (state.customPaintColor !== null) {
            customOpts.paintColor = state.customPaintColor;
        }
        playerCar = buildSculptedPlayerCar(state.selectedCar, envTexture, customOpts);
        playerCar.beamSkeleton.visible = state.beamSkeletonVisible;

        // Apply custom suspension tuning
        playerCar.wheelStates.forEach(ws => {
            ws.bentCamber = state.suspensionCamber * ws.side;
            ws.origY += state.suspensionHeight;
            ws.hubGroup.position.y = ws.origY;
        });

        playerCar.root.position.set(state.playerX, state.playerY, 0);
        scene.add(playerCar.root);

        const nameEl = document.getElementById('hud-car-name');
        if (nameEl) nameEl.textContent = CAR_SPECS[state.selectedCar].name;
        updateDamageSchematicUI();
    }

    function applyMapTheme(mapKey) {
        const spec = MAP_SPECS[mapKey] || MAP_SPECS.TOKYO;
        roadMesh.material.color.setHex(spec.roadTint);
        shoulderLeft.material.color.setHex(spec.barrierColor);
        shoulderRight.material.color.setHex(spec.barrierColor);

        sceneryPillars.forEach((bldg, idx) => {
            bldg.material.color.setHex(spec.sceneryColor);
            if (mapKey === 'CANYON') {
                bldg.userData.neonStrip.material.color.setHex(0xd97706);
            } else if (mapKey === 'SNOW') {
                bldg.userData.neonStrip.material.color.setHex(0xe0f2fe);
            } else if (mapKey === 'INFERNO') {
                bldg.userData.neonStrip.material.color.setHex(0xff4500);
            } else {
                const col = idx % 3 === 0 ? 0x38bdf8 : (idx % 3 === 1 ? 0xf43f5e : 0xa855f7);
                bldg.userData.neonStrip.material.color.setHex(col);
            }
        });
        updateStageHUDLabels();
    }

    /**
     * EXTREME REALISM SOFT-BODY IMPACT HANDLER
     * - Multi-station accordion sheet metal crumpling with wide radius
     * - Axle snapping & rolling wheel detachment
     * - Half-detached dragging bumpers spewing sparks
     * - High-pressure green coolant steam, dark oil slicks, engine fire
     * - Procedural safety glass shattering into 3D glass shards
     * - Directional screen shake and controller rumble vibration!
     */
    function applySoftBodyCarDamage(rawAmount, contactOffsetX = 0, contactOffsetZ = -1.9, impactForceVec = null) {
        if (!playerCar) return;
        if (state.mode === 'PLAYING' && state.invulnerableTimer > 0) return;

        const carSpec = CAR_SPECS[state.selectedCar];
        const armorMult = (carSpec.armorMultiplier || 1.0) * (state.engineSwap === 'ARMORED_ROLLCAGE' ? 1.45 : 1.0);
        const amount = rawAmount / armorMult;

        const impactG = Math.min(85.0, 5.0 + rawAmount * 1.15);
        state.peakImpactG = Math.max(state.peakImpactG, impactG);

        // Directional Screen Shake
        state.screenShake = Math.min(1.2, 0.15 + (rawAmount / 45));
        state.screenShakeVec.set(contactOffsetX * 0.4, 0.35, -contactOffsetZ * 0.4).normalize();

        // Gamepad Rumble Vibration
        if (navigator.getGamepads && state.gamepadIndex !== null) {
            const gp = navigator.getGamepads()[state.gamepadIndex];
            if (gp && gp.vibrationActuator) {
                gp.vibrationActuator.playEffect('dual-rumble', {
                    startDelay: 0,
                    duration: Math.min(600, Math.round(150 + impactG * 8)),
                    weakMagnitude: Math.min(1.0, impactG / 40),
                    strongMagnitude: Math.min(1.0, impactG / 30)
                }).catch(() => {});
            }
        }

        if (state.gameType !== 'SANDBOX' && state.mode === 'PLAYING') {
            state.hp = Math.max(0, state.hp - amount);
            state.invulnerableTimer = 0.45;
            state.combo = 0;
            state.wantedHeat += amount * 0.8;
            updateWantedStars();
        }

        const intensity = Math.min(1.8, amount / 18);
        audio.playCrash(intensity);

        const localImpact = new THREE.Vector3(
            THREE.MathUtils.clamp(contactOffsetX, -1.05, 1.05),
            0.55,
            THREE.MathUtils.clamp(contactOffsetZ, -2.25, 2.25)
        );
        const worldImpact = localImpact.clone().applyMatrix4(playerCar.root.matrixWorld);

        const forceDir = impactForceVec ? impactForceVec.clone() : new THREE.Vector3(
            -contactOffsetX * 0.45,
            0.12,
            contactOffsetZ < 0 ? 0.65 : (contactOffsetZ > 0 ? -0.65 : 0)
        );
        const forceScale = Math.min(0.75, 0.20 + (rawAmount / 75));
        const worldForce = forceDir.normalize().multiplyScalar(forceScale);

        // 1. Extreme Deep Crumple on all nearby deformable meshes!
        const deformRadius = Math.min(2.4, 1.25 + intensity * 0.65);
        playerCar.deformableMeshes.forEach(mesh => {
            deformMeshAtPoint(mesh, worldImpact, worldForce, deformRadius);
        });

        // 2. Node-Beam Structural Skeleton Stress Propagation
        deformNodeBeamSkeleton(playerCar.beamSkeleton, localImpact, forceDir.clone().multiplyScalar(forceScale), deformRadius * 1.2);

        // 3. Subsystem Mechanical Destruction (Radiator, Oil Pan, Engine, Glass)
        if (contactOffsetZ < -0.8) {
            playerCar.subsystems.radiatorHp = Math.max(0, playerCar.subsystems.radiatorHp - amount * 1.8);
            playerCar.subsystems.engineHp = Math.max(0, playerCar.subsystems.engineHp - amount * 1.2);

            // Coolant leak green steam
            if (playerCar.subsystems.radiatorHp < 60) {
                spawnParticles(worldImpact, 12, 'STEAM');
                addFloatingNotification('💨 ラジエーター破損・冷却水蒸気噴射!! 水温上昇中', 'text-emerald-300');
            }
            // Engine fire
            if (playerCar.subsystems.engineHp < 30) {
                playerCar.subsystems.engineFire = true;
                addFloatingNotification('🔥 エンジンルーム発火!! 熱害オーバーヒート警告', 'text-red-500 font-black');
            }

            if (Math.abs(contactOffsetX) > 0.3) {
                playerCar.subsystems.steeringHp = Math.max(0, playerCar.subsystems.steeringHp - amount * 1.5);
                playerCar.subsystems.alignmentPull = THREE.MathUtils.clamp(
                    playerCar.subsystems.alignmentPull + Math.sign(contactOffsetX) * 0.55,
                    -2.0, 2.0
                );
            }
        }

        // Procedural Safety Glass Shattering
        if (amount > 16 && playerCar.windshieldCracks) {
            playerCar.windshieldCracks.material.opacity = Math.min(0.95, playerCar.windshieldCracks.material.opacity + 0.45);
            playerCar.cabinGlassMesh.material.opacity = Math.max(0.35, playerCar.cabinGlassMesh.material.opacity - 0.2);
            spawnParticles(worldImpact, 22, 'GLASS');
        }

        spawnParticles(worldImpact, 18, 'SPARK');
        spawnParticles(worldImpact, 8, 'SHARD');
        spawnPhysicalShatterPieces(worldImpact, Math.min(5, Math.max(2, Math.round(amount * 0.18))), null, 12 + intensity * 5);

        // 4. SNAPPING AXLES & DETACHED ROLLING WHEELS!
        playerCar.wheelStates.forEach(ws => {
            if (ws.detached) return;
            const wheelWorldPos = new THREE.Vector3();
            ws.hubGroup.getWorldPosition(wheelWorldPos);
            const distToImpact = wheelWorldPos.distanceTo(worldImpact);

            if (distToImpact < 1.35 && (amount > 36 || ws.hp <= 0)) {
                snapWheelAxle(ws, worldForce);
            } else if (distToImpact < 1.7 && amount > 14) {
                damageSpecificTires(ws.side, amount > 28, amount * 0.9);
            }
        });

        // 5. DRAGGING FRONT BUMPER PHYSICS
        if (contactOffsetZ < -0.8 && playerCar.parts.bumperF && !playerCar.parts.bumperF.detached) {
            if (amount > 18 && !playerCar.parts.bumperF.halfDetached) {
                playerCar.parts.bumperF.halfDetached = true;
                playerCar.parts.bumperF.mesh.rotation.z = contactOffsetX > 0 ? -0.28 : 0.28;
                playerCar.parts.bumperF.mesh.position.y -= 0.18;
                addFloatingNotification('💥 バンパー片側脱落・路面を引きずり火花噴出!!', 'text-amber-400');
            } else if (amount > 38 && playerCar.parts.bumperF.halfDetached) {
                detachCarPartPhysics('bumperF', 18);
            }
        }

        // 6. Panel Latch Failure & Detachment
        const targetKeys = new Set();
        if (contactOffsetZ < -0.7) { targetKeys.add('hood'); }
        if (contactOffsetZ > 0.7) { targetKeys.add('trunk'); targetKeys.add('wing'); }
        if (contactOffsetX < -0.25) targetKeys.add('doorL');
        if (contactOffsetX > 0.25) targetKeys.add('doorR');

        targetKeys.forEach(key => {
            const part = playerCar.parts[key];
            if (!part || part.detached) return;

            part.hp = Math.max(0, part.hp - amount * 1.85);
            const dmgRatio = (100 - part.hp) / 100;

            if (part.hp < 65 && !part.latchBroken) {
                part.latchBroken = true;
                addFloatingNotification(`🔓 ${part.label} ラッチ破損・風圧バタつき`, 'text-amber-300');
            }

            if (key === 'hood') {
                part.mesh.rotation.x = dmgRatio * 0.42;
                part.mesh.position.y = part.origPos.y + dmgRatio * 0.22;
            } else if (key === 'doorL' || key === 'doorR') {
                const dir = key === 'doorL' ? -1 : 1;
                part.mesh.rotation.y = dir * dmgRatio * 0.38;
            }

            if (part.hp <= 0) {
                detachCarPartPhysics(key, 14 + intensity * 5);
                addFloatingNotification(`💥 ${part.label} ヒンジ破断で完全脱落!! (${impactG.toFixed(1)}G)`, 'text-orange-400');
            }
        });

        updateHUD();
        updateDamageSchematicUI();

        if (state.mode === 'PLAYING' && state.gameType !== 'SANDBOX' && state.hp <= 0) {
            triggerCatastrophicExplosion();
        }
    }

    /**
     * SNAPS WHEEL AXLE: Wheel enters Cannon.js as a physical rolling sphere bouncing away,
     * while bare brake rotor drops to asphalt spewing sparks!
     */
    function snapWheelAxle(ws, impactForce) {
        if (ws.axleSnapped) return;
        ws.axleSnapped = true;
        ws.detached = true;
        ws.groundScraping = true;
        ws.hp = 0;

        const worldPos = new THREE.Vector3();
        ws.spinGroup.getWorldPosition(worldPos);

        ws.hubGroup.remove(ws.spinGroup);
        scene.add(ws.spinGroup);
        ws.spinGroup.position.copy(worldPos);

        const wheelBody = new CANNON.Body({
            mass: 14,
            position: new CANNON.Vec3(worldPos.x, Math.max(0.42, worldPos.y), worldPos.z),
            collisionFilterGroup: 2,
            collisionFilterMask: 1
        });
        wheelBody.addShape(new CANNON.Sphere(0.39));
        wheelBody.velocity.set(
            ws.side * 9 + impactForce.x * 12,
            5.5 + Math.random() * 6,
            (state.speedKmh / 3.6) * 0.6 + (Math.random() - 0.5) * 8
        );
        wheelBody.angularVelocity.set(Math.random() * 16, Math.random() * 16, Math.random() * 16);
        physicsWorld.addBody(wheelBody);
        rollingWheels.push({ mesh: ws.spinGroup, body: wheelBody, life: 5.0 });

        // Drop car hub onto asphalt
        ws.hubGroup.position.y = 0.10;
        audio.playTireBurst();
        addFloatingNotification(`🛞 【アクスル完全破断】${ws.label} が脱落して転走!! ローター火花接地中`, 'text-red-500 font-black');
    }

    function detachCarPartPhysics(partKey, impulseForce = 15) {
        const part = playerCar.parts[partKey];
        if (!part || part.detached) return;
        part.detached = true;
        part.halfDetached = false;
        part.hp = 0;

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        part.mesh.getWorldPosition(worldPos);
        part.mesh.getWorldQuaternion(worldQuat);

        playerCar.chassisGroup.remove(part.mesh);
        scene.add(part.mesh);
        part.mesh.position.copy(worldPos);
        part.mesh.quaternion.copy(worldQuat);

        while (detachedDebris.length >= 20) {
            const oldest = detachedDebris.shift();
            scene.remove(oldest.mesh);
            physicsWorld.removeBody(oldest.body);
        }

        const halfExtents = new CANNON.Vec3(part.size[0] / 2, part.size[1] / 2, part.size[2] / 2);
        const body = new CANNON.Body({
            mass: 12,
            position: new CANNON.Vec3(worldPos.x, Math.max(0.55, worldPos.y), worldPos.z),
            quaternion: new CANNON.Quaternion(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w),
            collisionFilterGroup: 2,
            collisionFilterMask: 1
        });
        body.addShape(new CANNON.Box(halfExtents));
        body.velocity.set((Math.random() - 0.5) * impulseForce * 1.2, 4.5 + Math.random() * impulseForce * 0.75, 4.0 + Math.random() * impulseForce * 0.8);
        body.angularVelocity.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
        physicsWorld.addBody(body);
        detachedDebris.push({ mesh: part.mesh, body, life: 4.5 });
        updateDamageSchematicUI();
    }

    function spawnPhysicalShatterPieces(originWorldPos, count = 4, baseColor = null, impulse = 13) {
        if (!originWorldPos || !Number.isFinite(originWorldPos.x)) return;
        const carColor = baseColor !== null ? baseColor : CAR_SPECS[state.selectedCar].color;
        const palette = [carColor, 0x1e293b, 0xe2e8f0, 0x0f172a];
        const safeCount = Math.min(count, 5);

        for (let i = 0; i < safeCount; i++) {
            while (detachedDebris.length >= 20) {
                const oldest = detachedDebris.shift();
                scene.remove(oldest.mesh);
                physicsWorld.removeBody(oldest.body);
            }

            const col = palette[i % palette.length];
            const mesh = new THREE.Mesh(sharedGeos.debris, new THREE.MeshStandardMaterial({ color: col, metalness: 0.72, roughness: 0.28 }));
            const spawnX = originWorldPos.x + (Math.random() - 0.5) * 1.4;
            const spawnY = Math.max(0.45, originWorldPos.y + 0.25 + Math.random() * 0.5);
            const spawnZ = originWorldPos.z + (Math.random() - 0.5) * 1.4;
            mesh.position.set(spawnX, spawnY, spawnZ);
            scene.add(mesh);

            const body = new CANNON.Body({ mass: 5, position: new CANNON.Vec3(spawnX, spawnY, spawnZ), collisionFilterGroup: 2, collisionFilterMask: 1 });
            body.addShape(new CANNON.Box(new CANNON.Vec3(0.18, 0.06, 0.20)));
            body.velocity.set((Math.random() - 0.5) * impulse * 1.3, 3.5 + Math.random() * impulse * 0.7, (Math.random() - 0.2) * impulse * 1.2);
            body.angularVelocity.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
            physicsWorld.addBody(body);
            detachedDebris.push({ mesh, body, life: 3.5 });
        }
    }

    function spawnParticles(origin, count, type = 'SPARK') {
        if (!origin || !Number.isFinite(origin.x)) return;
        const cappedCount = Math.min(count, 22);

        for (let i = 0; i < cappedCount; i++) {
            while (particles.length >= 75) {
                const oldest = particles.shift();
                scene.remove(oldest.mesh);
            }

            let geo, mat, vel, gravity = -16, scaleRate = 0, maxLife = 0.6;

            if (type === 'SPARK') {
                geo = sharedGeos.spark;
                mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xfbbf24 : 0xffffff });
                vel = new THREE.Vector3((Math.random() - 0.5) * 16, 2 + Math.random() * 9, (Math.random() - 0.2) * 16);
                maxLife = 0.28 + Math.random() * 0.22;
            } else if (type === 'GLASS') {
                geo = sharedGeos.glass;
                mat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.9 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 12, 2.5 + Math.random() * 7, (Math.random() - 0.5) * 12);
                maxLife = 0.8 + Math.random() * 0.4;
            } else if (type === 'STEAM') {
                geo = sharedGeos.steam;
                mat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.45 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 1.8, 2.2 + Math.random() * 1.8, 4.5 + Math.random() * 2.5);
                gravity = 1.5; scaleRate = 2.0; maxLife = 0.45 + Math.random() * 0.25;
            } else if (type === 'FIRE') {
                geo = sharedGeos.fire;
                mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0xf97316 : 0xef4444, transparent: true, opacity: 0.85 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 2.2, 3.2 + Math.random() * 2.5, 4.0 + Math.random() * 2.0);
                gravity = 2.0; scaleRate = 1.4; maxLife = 0.35 + Math.random() * 0.2;
            } else if (type === 'SMOKE') {
                geo = sharedGeos.smoke;
                mat = new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.5 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 2.0, 1.6 + Math.random() * 2.0, 5.0 + Math.random() * 3.0);
                gravity = 1.2; scaleRate = 1.8; maxLife = 0.5 + Math.random() * 0.3;
            } else if (type === 'SHARD') {
                geo = sharedGeos.shard;
                mat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 14, 3 + Math.random() * 8, 2 + Math.random() * 12);
                maxLife = 0.75 + Math.random() * 0.35;
            } else if (type === 'EXPLOSION') {
                const colors = [0xffffff, 0xfef08a, 0xf97316, 0xef4444, 0x1e293b];
                geo = sharedGeos.explosion;
                mat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)], transparent: true, opacity: 0.9 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 26, 4 + Math.random() * 20, (Math.random() - 0.5) * 26);
                gravity = -6.0; scaleRate = 2.4; maxLife = 0.9 + Math.random() * 0.5;
            }

            if (!vel) vel = new THREE.Vector3((Math.random() - 0.5) * 10, 2 + Math.random() * 6, (Math.random() - 0.5) * 10);
            if (!geo) geo = sharedGeos.spark;
            if (!mat) mat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(origin);
            scene.add(mesh);
            particles.push({ mesh, vel, gravity, scaleRate, life: maxLife, maxLife });
        }
    }

    function triggerCatastrophicExplosion() {
        if (state.mode === 'EXPLODING') return;
        state.mode = 'EXPLODING';
        state.explosionTimer = 3.2;
        audio.playExplosion();

        addFloatingNotification('🔥 【燃料タンク二次誘�E】完�E全損大爁E��!!', 'text-red-500 text-xl font-black');

        Object.keys(playerCar.parts).forEach(key => detachCarPartPhysics(key, 24));

        playerCar.wheelStates.forEach(ws => {
            if (!ws.axleSnapped) snapWheelAxle(ws, new THREE.Vector3(ws.side * 14, 8, 5));
        });

        const blastCenter = playerCar.root.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        spawnPhysicalShatterPieces(blastCenter, 5, null, 22);
        spawnParticles(blastCenter, 22, 'EXPLOSION');
        spawnParticles(blastCenter, 18, 'FIRE');
    }

    function initSpeedAndWeatherLines() {
        const lineGeo = new THREE.BoxGeometry(0.05, 0.05, 4.5);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.0 });
        for (let i = 0; i < 40; i++) {
            const line = new THREE.Mesh(lineGeo, lineMat.clone());
            line.position.set((Math.random() - 0.5) * 36, 0.5 + Math.random() * 5.5, -Math.random() * 120);
            scene.add(line);
            speedLines.push(line);
        }

        // Rain Droplets
        const rainGeo = new THREE.BoxGeometry(0.02, 0.65, 0.02);
        const rainMat = new THREE.MeshBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.45 });
        for (let i = 0; i < 120; i++) {
            const r = new THREE.Mesh(rainGeo, rainMat);
            r.position.set((Math.random() - 0.5) * 40, Math.random() * 12, -Math.random() * 110);
            scene.add(r);
            rainParticles.push(r);
        }
    }

    function spawnTrafficVehicle(zOffset = -185) {
        const blockedLanesAtZ = new Set();
        trafficCars.forEach(tc => {
            if (Math.abs(tc.mesh.position.z - zOffset) < 52) {
                LANE_CENTERS.forEach((lx, idx) => {
                    if (Math.abs(tc.mesh.position.x - lx) < 2.6) blockedLanesAtZ.add(idx);
                });
            }
        });
        if (blockedLanesAtZ.size >= 4) return;

        const availableLanes = [0, 1, 2, 3, 4, 5].filter(idx => !blockedLanesAtZ.has(idx));
        if (availableLanes.length <= 2) return;

        const laneIndex = availableLanes[Math.floor(Math.random() * availableLanes.length)];
        const laneX = LANE_CENTERS[laneIndex];

        const lvlSpec = LEVEL_SPECS[state.selectedLevel] || LEVEL_SPECS[2];
        const roll = Math.random();
        let type;

        // Rich AI Traffic Vehicle Variety (Ambulance, Tanker, Bank Truck, Police, Wrong-Way, Road-Rage)
        if (state.wantedLevel >= 2 && Math.random() < 0.45) {
            type = 'POLICE';
        } else if (roll < lvlSpec.wrongWayChance) {
            type = 'WRONG_WAY';
        } else if (roll < lvlSpec.wrongWayChance + lvlSpec.rageChance) {
            type = 'ROAD_RAGE';
        } else if (roll < 0.45) {
            const specials = ['AMBULANCE', 'TANKER', 'BANK_TRUCK'];
            type = specials[Math.floor(Math.random() * specials.length)];
        } else {
            const normalTypes = ['SEDAN', 'SUV', 'TRUCK', 'SPORTS'];
            type = normalTypes[Math.floor(Math.random() * normalTypes.length)];
        }

        const colors = [0x3b82f6, 0x10b981, 0xf59e0b, 0xe2e8f0, 0x64748b, 0x8b5cf6, 0xec4899];
        let bodyColor = colors[Math.floor(Math.random() * colors.length)];
        if (type === 'POLICE') bodyColor = 0x0f172a;
        if (type === 'WRONG_WAY') bodyColor = 0xd6d3d1;
        if (type === 'ROAD_RAGE') bodyColor = 0x18181b;

        const built = buildSculptedTrafficVehicle(type, bodyColor, envTexture);
        const group = built.group;
        const isWrongWay = type === 'WRONG_WAY';

        let speedKmh = (72 + Math.random() * 58) * lvlSpec.trafficSpeedMult;
        if (isWrongWay) {
            speedKmh = -(55 + Math.random() * 35) * Math.min(1.15, lvlSpec.trafficSpeedMult);
            group.rotation.y = Math.PI;
        } else if (type === 'ROAD_RAGE' || type === 'POLICE') {
            speedKmh = (112 + Math.random() * 45) * lvlSpec.trafficSpeedMult;
        } else if (type === 'AMBULANCE') {
            speedKmh = 125;
        }

        group.position.set(laneX, 0, zOffset);
        scene.add(group);

        trafficCars.push({
            mesh: group,
            type,
            laneIndex,
            isWrongWay,
            sirenBar: built.sirenBar,
            hazardLights: built.hazardLights,
            blinkerL: built.blinkerL,
            blinkerR: built.blinkerR,
            isSpecialExplosive: built.isSpecialExplosive,
            isCashCarrier: built.isCashCarrier,
            deformableTrafficMeshes: built.deformableTrafficMeshes,
            width: built.width,
            length: built.length,
            speedKmh,
            vx: 0, vz: 0, vy: 0,
            yawRate: 0, rollRate: 0,
            honked: false,
            hitByPlayer: false,
            overtaken: false
        });
    }

    function spawnRoadTrap(zOffset = -175, forcedType = null) {
        const laneIndex = Math.floor(Math.random() * 6);
        const laneX = LANE_CENTERS[laneIndex];

        const weights = ['SPIKE', 'BARREL', 'OIL', 'RAMP', 'CONTAINER', 'REPAIR'];
        const type = forcedType || weights[Math.floor(Math.random() * weights.length)];

        if (type === 'CRUSHER' || type === 'CONCRETE_WALL' || type === 'WRECKING_BALL' || type === 'CANNON') {
            const sbObj = createSandboxObstacle(type, laneX, zOffset);
            scene.add(sbObj.mesh);
            roadTraps.push(sbObj);
            return;
        }

        const group = new THREE.Group();
        let width = 2.4, length = 1.8;

        if (type === 'BARREL') {
            width = 2.5; length = 1.6;
            const barrelMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.5 });
            [[-0.6, 0], [0.6, 0], [0, -0.5]].forEach(offset => {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 1.18, 14), barrelMat);
                b.position.set(offset[0], 0.59, offset[1]);
                group.add(b);
            });
        } else if (type === 'SPIKE') {
            width = 3.2; length = 1.0;
            const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 }));
            base.position.y = 0.05;
            group.add(base);
        } else if (type === 'RAMP') {
            width = 3.6; length = 4.8;
            const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.25, length), new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.35 }));
            rampMesh.rotation.x = 0.26;
            rampMesh.position.set(0, 0.55, 0);
            group.add(rampMesh);
        } else if (type === 'REPAIR') {
            width = 3.8; length = 1.5;
            const archMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
            const topBar = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.35, 0.35), archMat);
            topBar.position.set(0, 2.8, 0);
            group.add(topBar);
        }

        group.position.set(laneX, 0, zOffset);
        scene.add(group);
        roadTraps.push({ mesh: group, type, width, length, triggered: false });
    }

    function repairAllSoftBodyAndTires(fullRebuild = false) {
        if (!playerCar) return;
        if (fullRebuild) {
            rebuildPlayerCar();
        } else {
            playerCar.deformableMeshes.forEach(m => resetDeformableMesh(m));
            resetNodeBeamSkeleton(playerCar.beamSkeleton);
            if (playerCar.windshieldCracks) playerCar.windshieldCracks.material.opacity = 0;
            playerCar.cabinGlassMesh.material.opacity = 0.82;

            Object.keys(playerCar.parts).forEach(key => {
                const p = playerCar.parts[key];
                if (!p.detached) {
                    p.hp = 100;
                    p.latchBroken = false;
                    p.halfDetached = false;
                    p.mesh.position.copy(p.origPos);
                    p.mesh.rotation.set(0, 0, 0);
                }
            });
        }

        playerCar.subsystems.engineHp = 100;
        playerCar.subsystems.radiatorHp = 100;
        playerCar.subsystems.steeringHp = 100;
        playerCar.subsystems.engineFire = false;
        playerCar.subsystems.alignmentPull = 0;

        playerCar.wheelStates.forEach(ws => {
            ws.hp = 100;
            ws.punctured = false;
            ws.bent = false;
            ws.axleSnapped = false;
            ws.groundScraping = false;
            ws.tireMesh.scale.set(1, 1, 1);
            ws.tireMesh.material.color.setHex(0x11151c);
            ws.hubGroup.rotation.set(0, 0, 0);
            ws.hubGroup.position.y = ws.origY;
        });

        state.hp = Math.min(100, state.hp + 35);
        state.nosFuel = Math.min(100, state.nosFuel + 40);
        audio.playEtcDing(true);
        addFloatingNotification('🔧 【BeamNG完�E修復】板金�Eアクスル復允E��亁E!', 'text-lime-300');
        updateHUD();
        updateDamageSchematicUI();
    }

    function damageSpecificTires(sideFilter, instantPuncture, dmgAmount) {
        if (!playerCar) return;
        playerCar.wheelStates.forEach(ws => {
            if (ws.detached) return;
            if (sideFilter !== 0 && ws.side !== sideFilter) return;
            ws.hp = Math.max(0, ws.hp - dmgAmount);
            if (instantPuncture || ws.hp <= 0) {
                ws.punctured = true;
                ws.bent = true;
                ws.tireMesh.scale.set(0.92, 0.78, 0.78);
                ws.bentCamber = ws.side * 0.16;
                audio.playTireBurst();
            }
        });
    }

    function updateWantedStars() {
        if (state.wantedHeat > 180) state.wantedLevel = 5;
        else if (state.wantedHeat > 120) state.wantedLevel = 4;
        else if (state.wantedHeat > 70) state.wantedLevel = 3;
        else if (state.wantedHeat > 30) state.wantedLevel = 2;
        else if (state.wantedHeat > 10) state.wantedLevel = 1;
        else state.wantedLevel = 0;

        const starEl = document.getElementById('wanted-stars');
        if (starEl) {
            starEl.innerHTML = '\u2605'.repeat(state.wantedLevel) + '\u2606'.repeat(5 - state.wantedLevel);
            starEl.className = state.wantedLevel >= 4 ? 'text-red-500 font-black animate-pulse' : (state.wantedLevel >= 2 ? 'text-amber-400 font-bold' : 'text-slate-500');
        }
        audio.playPoliceSiren(state.wantedLevel >= 2);
    }

    function addFloatingNotification(text, colorClass = 'text-sky-300') {
        const feed = document.getElementById('event-feed');
        if (!feed) return;
        const el = document.createElement('div');
        el.className = `combo-pop px-3.5 py-1 rounded-full hud-glass border border-white/15 font-['Orbitron'] font-bold text-xs sm:text-sm shadow-lg ${colorClass}`;
        el.innerHTML = text;
        feed.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1200);
    }

    function updateStageHUDLabels() {
        const mapSpec = MAP_SPECS[state.selectedMap];
        const carSpec = CAR_SPECS[state.selectedCar];
        const lvlSpec = LEVEL_SPECS[state.selectedLevel];

        const badge = document.getElementById('hud-stage-badge');
        if (badge) {
            badge.textContent = `${lvlSpec.name} | ${mapSpec.name}`;
        }
    }

    function updateDamageSchematicUI() {
        if (!playerCar) return;
        let detachedCount = 0;
        Object.values(playerCar.parts).forEach(part => { if (part.detached) detachedCount++; });
        const detBadge = document.getElementById('detached-parts-badge');
        if (detBadge) detBadge.textContent = `破損パーチE ${detachedCount} / 6`;
    }

    function updateLaneRadarHUD() {
        for (let l = 0; l < 6; l++) {
            const radarEl = document.getElementById(`lane-radar-${l}`);
            if (!radarEl) continue;
            let hazardType = null;
            const lx = LANE_CENTERS[l];
            for (const tc of trafficCars) {
                const dz = tc.mesh.position.z - (playerCar ? playerCar.root.position.z : 0);
                if (dz < -5 && dz > -195 && Math.abs(tc.mesh.position.x - lx) < 2.7) {
                    if (tc.isWrongWay) { hazardType = 'WRONG_WAY'; break; }
                    else if (tc.type === 'ROAD_RAGE' || tc.type === 'POLICE') hazardType = tc.type;
                }
            }
            if (hazardType === 'WRONG_WAY') {
                radarEl.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-red-600/90 text-yellow-200 border border-yellow-300 animate-pulse';
                radarEl.textContent = `L${l + 1} 🔱送E��接迁E`;
            } else if (hazardType === 'POLICE') {
                radarEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-blue-700/80 text-white border border-blue-400';
                radarEl.textContent = `L${l + 1} 🚔パトカー`;
            } else if (hazardType === 'ROAD_RAGE') {
                radarEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-fuchsia-700/80 text-white border border-fuchsia-400';
                radarEl.textContent = `L${l + 1} 💢煽り車`;
            } else {
                radarEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900/75 text-emerald-400/80 border border-slate-700/70';
                radarEl.textContent = `L${l + 1} CLEAR`;
            }
        }
    }

    function updateHUD() {
        const spd = Math.round(state.speedKmh);
        const speedEl = document.getElementById('speed-display');
        if (speedEl) speedEl.textContent = spd;

        const scoreEl = document.getElementById('score-display');
        if (scoreEl) scoreEl.textContent = Math.floor(state.score).toString().padStart(6, '0');

        const overtakeEl = document.getElementById('overtake-count');
        if (overtakeEl) overtakeEl.textContent = state.overtakes;

        const cashEl = document.getElementById('cash-display');
        if (cashEl) cashEl.textContent = `¥${userData.cash.toLocaleString()}`;

        // Live OBD-II Telemetry
        if (playerCar) {
            const rpmVal = Math.round(1500 + (spd % 65) * 110);
            const boostVal = (state.nosActive ? 2.1 : (spd > 120 ? 1.4 : 0.6)).toFixed(1);
            const oilEl = document.getElementById('obd-oil');
            const coolantEl = document.getElementById('obd-coolant');
            const boostEl = document.getElementById('obd-boost');
            const rpmEl = document.getElementById('obd-rpm');
            if (oilEl) oilEl.textContent = `${Math.round(playerCar.subsystems.oilTemp)}°C`;
            if (coolantEl) coolantEl.textContent = `${Math.round(playerCar.subsystems.coolantTemp)}°C`;
            if (boostEl) boostEl.textContent = `${boostVal} bar`;
            if (rpmEl) rpmEl.textContent = `${rpmVal} RPM`;

            // Needle rotation
            if (playerCar.speedNeedle) playerCar.speedNeedle.rotation.z = -(spd / 400) * Math.PI * 1.5;
            if (playerCar.rpmNeedle) playerCar.rpmNeedle.rotation.z = -(rpmVal / 9000) * Math.PI * 1.5;
        }

        const hpBar = document.getElementById('hp-bar');
        const hpText = document.getElementById('hp-text');
        if (hpBar) hpBar.style.width = `${Math.round(state.hp)}%`;
        if (hpText) hpText.textContent = `${Math.round(state.hp)}%`;

        updateLaneRadarHUD();
    }

    function updateGamePhysics(rawDt) {
        if (!Number.isFinite(rawDt) || rawDt <= 0) return;

        const targetScale = state.slowMoActive ? 0.28 : 1.0;
        state.timeScale = THREE.MathUtils.lerp(state.timeScale, targetScale, rawDt * 10);
        const dt = rawDt * state.timeScale;

        physicsWorld.step(1 / 60, dt, 2);

        // Update Snapped Rolling Wheels
        for (let i = rollingWheels.length - 1; i >= 0; i--) {
            const rw = rollingWheels[i];
            rw.life -= dt;
            rw.mesh.position.copy(rw.body.position);
            rw.mesh.quaternion.copy(rw.body.quaternion);
            if (rw.life <= 0 || rw.mesh.position.y < -10) {
                scene.remove(rw.mesh);
                physicsWorld.removeBody(rw.body);
                rollingWheels.splice(i, 1);
            }
        }

        // Update Debris & Particles
        for (let i = detachedDebris.length - 1; i >= 0; i--) {
            const item = detachedDebris[i];
            item.life -= dt;
            item.body.position.z += (state.speedKmh / 3.6) * dt * 0.55;
            item.mesh.position.copy(item.body.position);
            item.mesh.quaternion.copy(item.body.quaternion);
            if (item.life <= 0 || item.mesh.position.z > 28) {
                scene.remove(item.mesh);
                physicsWorld.removeBody(item.body);
                detachedDebris.splice(i, 1);
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            p.vel.y += p.gravity * dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            if (p.scaleRate > 0) p.mesh.scale.multiplyScalar(1 + p.scaleRate * dt);
            if (p.mesh.material.transparent) p.mesh.material.opacity = Math.max(0, (p.life / p.maxLife) * 0.75);
            if (p.life <= 0) {
                scene.remove(p.mesh);
                particles.splice(i, 1);
            }
        }

        if (state.mode === 'MENU' || state.mode === 'GAMEOVER' || state.mode === 'STAGECLEAR') {
            roadTexture.offset.y -= 0.35 * rawDt;
            if (playerCar && playerCar.root) {
                playerCar.root.position.set(0, 0, 0);
                if (!state.isMouseDragging) state.cameraDragYaw += 0.38 * rawDt;
                const dist = 6.2;
                camera.position.set(Math.sin(state.cameraDragYaw) * dist, 1.85 + state.cameraDragPitch * 2.2, Math.cos(state.cameraDragYaw) * dist);
                camera.lookAt(0, 0.68, 0);
            }
            audio.updateEngine(0, false, false, state.selectedCar, 1.0);
            return;
        }

        if (state.invulnerableTimer > 0) state.invulnerableTimer -= dt;
        if (state.spinOutTimer > 0) state.spinOutTimer -= dt;

        // Ground scraping sparks from snapped axles / dragging bumpers!
        if (playerCar) {
            playerCar.wheelStates.forEach(ws => {
                if (ws.groundScraping && Math.random() < 0.45) {
                    const sparkOrigin = new THREE.Vector3(playerCar.root.position.x + ws.origX, 0.1, playerCar.root.position.z + ws.origZ);
                    spawnParticles(sparkOrigin, 2, 'SPARK');
                    audio.playTireScreech();
                }
            });

            // Dragging bumper sparks
            if (playerCar.parts.bumperF.halfDetached && Math.random() < 0.4) {
                const bumperSpark = new THREE.Vector3(playerCar.root.position.x, 0.1, playerCar.root.position.z - 2.1);
                spawnParticles(bumperSpark, 2, 'SPARK');
            }

            // Engine fire & coolant steam emission
            if (playerCar.subsystems.engineFire) {
                const firePos = playerCar.root.position.clone().add(new THREE.Vector3(0, 0.75, -1.3));
                spawnParticles(firePos, 1, 'FIRE');
                spawnParticles(firePos, 1, 'SMOKE');
                playerCar.subsystems.oilTemp = Math.min(160, playerCar.subsystems.oilTemp + 8 * dt);
            }
            if (playerCar.subsystems.radiatorHp < 50 && Math.random() < 0.3) {
                const steamPos = playerCar.root.position.clone().add(new THREE.Vector3(0, 0.65, -1.8));
                spawnParticles(steamPos, 1, 'STEAM');
                playerCar.subsystems.coolantTemp = Math.min(140, playerCar.subsystems.coolantTemp + 6 * dt);
            }

            // Windshield Wipers sweep animation
            if (state.wipersActive && playerCar.wiperGroupL) {
                state.wiperAngle = Math.sin(clock.elapsedTime * 6.5) * 0.65;
                playerCar.wiperGroupL.rotation.z = state.wiperAngle;
                playerCar.wiperGroupR.rotation.z = state.wiperAngle;
            }
        }

        // Player Controls
        const carSpec = CAR_SPECS[state.selectedCar];
        const lvlSpec = LEVEL_SPECS[state.selectedLevel];
        const isAccel = keys.ArrowUp || keys.KeyW;
        const isBrake = keys.ArrowDown || keys.KeyS;
        const isLeft = keys.ArrowLeft || keys.KeyA;
        const isRight = keys.ArrowRight || keys.KeyD;
        state.nosActive = keys.Space && state.nosFuel > 1;

        if (state.mode === 'PLAYING') {
            const nosMult = state.nosActive ? 1.25 : 1.0;
            const maxSpd = carSpec.maxSpeed * nosMult;

            if (state.nosActive) {
                state.nosFuel = Math.max(0, state.nosFuel - 25 * dt);
                audio.playNosRoar();
            } else {
                state.nosFuel = Math.min(100, state.nosFuel + 6 * dt);
            }

            if (isAccel || state.nosActive) {
                state.speedKmh = Math.min(maxSpd, state.speedKmh + carSpec.accel * dt);
            } else if (isBrake) {
                state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh - 180 * dt);
            } else {
                state.speedKmh = THREE.MathUtils.lerp(state.speedKmh, 160, dt * 1.5);
            }

            if (state.speedKmh > state.topSpeedKmh) state.topSpeedKmh = state.speedKmh;

            let steer = 0;
            if (isLeft) steer -= 1;
            if (isRight) steer += 1;

            state.playerVX += steer * carSpec.steerPower * dt;
            state.playerVX *= Math.pow(0.04, dt);
            state.playerX = THREE.MathUtils.clamp(state.playerX + state.playerVX * dt, -ROAD_WIDTH / 2 + 1.3, ROAD_WIDTH / 2 - 1.3);

            state.playerYaw = THREE.MathUtils.lerp(state.playerYaw, -state.playerVX * 0.018, dt * 10);
            state.playerRoll = THREE.MathUtils.lerp(state.playerRoll, state.playerVX * 0.022, dt * 12);

            const mps = state.speedKmh / 3.6;
            state.distanceTraveled += mps * dt;
            state.score += (state.speedKmh * 0.28) * dt;

            // Spawn Stage Clear Gate
            if (state.gameType === 'CAREER' && !state.finishArchSpawned && state.distanceTraveled >= state.goalDistanceMeters - 180) {
                state.finishArchSpawned = true;
                const finish = createFinishGoalArch(-190);
                scene.add(finish.mesh);
                roadTraps.push(finish);
                addFloatingNotification('🏁 【ゴールゲート�E現】目標ラインを突破せよ!!', 'text-yellow-300 font-black');
            }
        }

        playerCar.root.position.set(state.playerX, state.playerY, 0);
        playerCar.root.rotation.y = state.playerYaw;
        playerCar.chassisGroup.rotation.z = state.playerRoll;

        // Road texture & scenery scrolling
        const mps = state.speedKmh / 3.6;
        roadTexture.offset.y -= (mps * dt) / 16.5;

        streetlights.forEach(lamp => {
            lamp.position.z += mps * dt;
            if (lamp.position.z > 30) lamp.position.z -= 240;
        });

        sceneryPillars.forEach(bldg => {
            bldg.position.z += mps * dt * 0.85;
            if (bldg.position.z > 38) bldg.position.z -= 256;
        });

        // Traffic AI updates
        const targetCount = Math.max(2, Math.round(lvlSpec.trafficCount * state.trafficDensityMult));
        if (trafficCars.length < targetCount && state.mode === 'PLAYING') {
            spawnTrafficVehicle(-165 - Math.random() * 85);
        }

        for (let i = trafficCars.length - 1; i >= 0; i--) {
            const tc = trafficCars[i];
            const relMps = (state.speedKmh - tc.speedKmh) / 3.6;
            tc.mesh.position.z += relMps * dt;

            // Collision check with player
            if (state.mode === 'PLAYING' && !tc.hitByPlayer && state.invulnerableTimer <= 0) {
                const dx = tc.mesh.position.x - state.playerX;
                const dz = tc.mesh.position.z - playerCar.root.position.z;
                if (Math.abs(dx) < (tc.width / 2 + 0.9) && Math.abs(dz) < (tc.length / 2 + 2.0)) {
                    tc.hitByPlayer = true;
                    applySoftBodyCarDamage(36, dx * 0.5, dz);

                    // Deform traffic car too!
                    if (tc.deformableTrafficMeshes) {
                        tc.deformableTrafficMeshes.forEach(tm => {
                            deformMeshAtPoint(tm, tc.mesh.position, new THREE.Vector3(dx * 0.4, 0.1, -0.6), 1.6);
                        });
                    }

                    if (tc.isSpecialExplosive) {
                        triggerCatastrophicExplosion();
                    } else if (tc.isCashCarrier) {
                        userData.cash += 35000;
                        saveUserData();
                        addFloatingNotification('💰 【現金輸送車撃破】¥35,000 キャチE��ュ強奪!!', 'text-yellow-300 font-black');
                    }
                }
            }

            if (tc.mesh.position.z > 28 || tc.mesh.position.z < -250) {
                scene.remove(tc.mesh);
                trafficCars.splice(i, 1);
            }
        }

        // Road Traps updates
        for (let i = roadTraps.length - 1; i >= 0; i--) {
            const tr = roadTraps[i];
            tr.mesh.position.z += mps * dt;

            if (tr.type === 'FINISH_GOAL' && !tr.triggered && tr.mesh.position.z >= -2.0) {
                tr.triggered = true;
                showStageClearModal();
                return;
            }

            if (tr.mesh.position.z > 26) {
                scene.remove(tr.mesh);
                roadTraps.splice(i, 1);
            }
        }

        updateCameraTransform(rawDt);
        audio.updateEngine(state.speedKmh, isAccel || state.nosActive, state.mode === 'PLAYING', state.selectedCar, state.timeScale);
        updateHUD();
    }

    function updateCameraTransform(dt) {
        let offset = new THREE.Vector3(0, 3.4, 7.8);
        let lookTarget = new THREE.Vector3(state.playerX * 0.88, 0.9, -14);

        if (state.cameraPreset === 1) { // Low
            offset.set(0, 1.75, 5.2);
            lookTarget.set(state.playerX * 0.95, 0.75, -18);
        } else if (state.cameraPreset === 2) { // Cockpit interior
            offset.set(0.36, 0.92, -0.15);
            lookTarget.set(state.playerX + state.playerVX * 0.05, 0.92, -35);
        } else if (state.cameraPreset === 3) { // Heli
            offset.set(0, 14.0, 11.0);
            lookTarget.set(state.playerX * 0.6, 0, -16);
        }

        const cosY = Math.cos(state.cameraDragYaw);
        const sinY = Math.sin(state.cameraDragYaw);
        const rotX = offset.x * cosY + offset.z * sinY;
        const rotZ = -offset.x * sinY + offset.z * cosY;

        const desiredCamPos = new THREE.Vector3(
            state.playerX * 0.88 + rotX,
            Math.max(0.8, offset.y + state.cameraDragPitch * 3.5),
            rotZ
        );

        // Screen Shake offset
        if (state.screenShake > 0) {
            state.screenShake = Math.max(0, state.screenShake - dt * 3.5);
            desiredCamPos.addScaledVector(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2), state.screenShake * 0.4);
        }

        camera.position.lerp(desiredCamPos, dt * 11);
        camera.lookAt(lookTarget);
    }

    function startNewRace() {
        audio.init();

        trafficCars.forEach(tc => scene.remove(tc.mesh));
        trafficCars = [];
        roadTraps.forEach(t => scene.remove(t.mesh));
        roadTraps = [];
        detachedDebris.forEach(d => { scene.remove(d.mesh); physicsWorld.removeBody(d.body); });
        detachedDebris = [];
        rollingWheels.forEach(rw => { scene.remove(rw.mesh); physicsWorld.removeBody(rw.body); });
        rollingWheels = [];
        particles.forEach(p => scene.remove(p.mesh));
        particles = [];

        state.playerX = LANE_CENTERS[2];
        state.playerY = 0;
        rebuildPlayerCar();

        const lvlSpec = LEVEL_SPECS[state.selectedLevel] || LEVEL_SPECS[2];
        state.mode = 'PLAYING';
        state.hp = 100;
        state.nosFuel = 100;
        state.score = 0;
        state.overtakes = 0;
        state.speedKmh = 145;
        state.topSpeedKmh = 145;
        state.distanceTraveled = 0;
        state.goalDistanceMeters = lvlSpec.goalKm * 1000;
        state.finishArchSpawned = false;
        state.wantedHeat = 0;
        state.wantedLevel = 0;

        for (let i = 0; i < 4; i++) spawnTrafficVehicle(-60 - i * 35);
        for (let i = 0; i < 2; i++) spawnRoadTrap(-70 - i * 45);

        updateHUD();
        updateDamageSchematicUI();
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    function showStageClearModal() {
        state.mode = 'STAGECLEAR';
        const lvlSpec = LEVEL_SPECS[state.selectedLevel];
        userData.cash += lvlSpec.rewardCr;
        userData.clearedLevels[state.selectedLevel] = true;
        saveUserData();

        audio.playEtcDing(true);
        const modal = document.getElementById('modal-overlay');
        modal.classList.remove('hidden');

        document.getElementById('modal-title').textContent = `🏆 LEVEL ${state.selectedLevel} CLEARED!!`;
        document.getElementById('result-stats').classList.remove('hidden');
        document.getElementById('result-stats').classList.add('grid');
        document.getElementById('final-score').textContent = `${Math.floor(state.score).toLocaleString()} (+¥${lvlSpec.rewardCr.toLocaleString()})`;
        document.getElementById('btn-start-text').textContent = '次のステージへ出撃！';
    }

    function showGameOverModal() {
        state.mode = 'GAMEOVER';
        const modal = document.getElementById('modal-overlay');
        modal.classList.remove('hidden');
        document.getElementById('modal-title').textContent = 'TOTAL WRECKED!';
        document.getElementById('result-stats').classList.remove('hidden');
        document.getElementById('result-stats').classList.add('grid');
        document.getElementById('final-score').textContent = Math.floor(state.score).toLocaleString();
        document.getElementById('btn-start-text').textContent = '次のステージへ出撃！';
    }

    function onWindowResize() {
        const wrapper = document.getElementById('canvas-wrapper');
        if (!wrapper || !renderer || !camera) return;
        camera.aspect = wrapper.clientWidth / wrapper.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    }

    function setupInputListeners() {
        window.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
            if (e.code in keys) keys[e.code] = true;

            if (e.code === 'KeyC') { state.cameraPreset = (state.cameraPreset + 1) % 4; }
            if (e.code === 'KeyV') {
                state.beamSkeletonVisible = !state.beamSkeletonVisible;
                if (playerCar) playerCar.beamSkeleton.visible = state.beamSkeletonVisible;
            }
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                state.slowMoActive = !state.slowMoActive;
            }
            if (e.code === 'KeyR') repairAllSoftBodyAndTires(false);
            if (e.code === 'KeyH') audio.playHorn(true);
            if (e.code === 'KeyW' && state.mode === 'PLAYING') {
                state.wipersActive = !state.wipersActive;
                addFloatingNotification(state.wipersActive ? '🪁Eワイパ�E作動' : '🪁Eワイパ�E停止');
            }
            if (e.code === 'KeyM') {
                audio.bgmMode = (audio.bgmMode + 1) % 6;
                const stations = ['OFF', 'Synthwave FM', 'Eurobeat Nitro', 'Cyber Rock', 'Lo-Fi Chill', 'Police Scanner'];
                addFloatingNotification(`📻 ラジオ局: ${stations[audio.bgmMode]}`);
            }
            if (e.code === 'Enter' && state.mode !== 'PLAYING') startNewRace();
        });

        window.addEventListener('keyup', (e) => {
            if (e.code in keys) keys[e.code] = false;
        });

        // UI Tabs & Selectors
        document.querySelectorAll('.garage-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.garage-tab-btn').forEach(b => b.classList.remove('active-tab'));
                btn.classList.add('active-tab');
                document.querySelectorAll('.garage-tab-pane').forEach(p => p.classList.add('hidden'));
                const p = document.getElementById(btn.getAttribute('data-tab'));
                if (p) p.classList.remove('hidden');
            });
        });

        document.querySelectorAll('#car-select-grid .select-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#car-select-grid .select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                state.selectedCar = card.getAttribute('data-car');
                rebuildPlayerCar();
                updateStageHUDLabels();
            });
        });

        // Weather & Time of Day Controls
        const todSelect = document.getElementById('tod-select');
        const weatherSelect = document.getElementById('weather-select');
        if (todSelect) todSelect.addEventListener('change', (e) => applyTimeOfDayAndWeather(e.target.value, state.weather));
        if (weatherSelect) weatherSelect.addEventListener('change', (e) => applyTimeOfDayAndWeather(state.timeOfDay, e.target.value));

        // Start Buttons
        document.getElementById('btn-start').addEventListener('click', startNewRace);
        const btm = document.getElementById('btn-start-bottom');
        if (btm) btm.addEventListener('click', startNewRace);
        document.getElementById('btn-garage').addEventListener('click', () => {
            state.mode = 'MENU';
            document.getElementById('modal-overlay').classList.remove('hidden');
        });
    }

    function animate() {
        requestAnimationFrame(animate);
        const rawDt = Math.min(clock.getDelta(), 0.05);
        updateGamePhysics(rawDt);
        renderer.render(scene, camera);
    }

    function setupSmokeTestHandler() {
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.on('run-smoke-test', () => {
                try {
                    startNewRace();
                    applySoftBodyCarDamage(35, -0.5, -2.0);
                    updateGamePhysics(0.016);
                    renderer.render(scene, camera);
                    ipcRenderer.send('smoke-test-result', { ok: true, mode: state.mode });
                } catch (err) {
                    ipcRenderer.send('smoke-test-result', { ok: false, error: err.stack });
                }
            });
        } catch (e) {}
    }

    window.addEventListener('DOMContentLoaded', () => {
        initThreeAndPhysics();
        setupInputListeners();
        updateStageHUDLabels();
        setupSmokeTestHandler();
        animate();
    });
})(window);
