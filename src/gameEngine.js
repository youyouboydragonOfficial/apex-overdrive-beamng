/**
 * APEX OVERDRIVE: BeamNG Soft-Body Physics Edition
 * Core Physics Simulation, Soft-Body Crash Handler, Smart Escape-Corridor Spawner & UI Controller
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
        MAP_SPECS,
        LEVEL_SPECS,
        createProceduralRoadTexture,
        createProceduralEnvTexture,
        createFinishGoalArch,
        createSandboxObstacle
    } = global.ApexWorldBuilder;

    const audio = new global.RacingAudioEngine();

    // Load cleared levels from localStorage
    let clearedLevels = {};
    try {
        clearedLevels = JSON.parse(localStorage.getItem('apex_beamng_cleared') || '{}');
    } catch (e) {
        clearedLevels = {};
    }

    const state = {
        mode: 'MENU', // MENU, PLAYING, EXPLODING, GAMEOVER, STAGECLEAR
        gameType: 'CAREER', // CAREER (Stage Clear Goal), ENDLESS, SANDBOX (BeamNG Crash Lab)
        selectedCar: 'HYPER',
        selectedMap: 'TOKYO',
        selectedLevel: 2,
        trafficDensityMult: 0.75, // Default 75% traffic volume so high levels are fair & clearable!
        customPaintColor: null,
        customFinish: 'METALLIC',
        underglowEnabled: true,
        beamSkeletonVisible: false,
        slowMoActive: false,
        timeScale: 1.0,
        nosFuel: 100,
        nosActive: false,
        hp: 100,
        score: 0,
        overtakes: 0,
        combo: 0,
        speedKmh: 0,
        topSpeedKmh: 0,
        minSpeedKmh: 50,
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
        spinOutTimer: 0,
        invulnerableTimer: 0,
        explosionTimer: 0,
        distanceTraveled: 0, // in meters
        goalDistanceMeters: 3200,
        finishArchSpawned: false,
        nextEtcDistance: 360,
        cameraPreset: 0,
        cameraDragYaw: 0.35,
        cameraDragPitch: 0.08,
        isMouseDragging: false,
        lastMouseX: 0,
        lastMouseY: 0
    };

    const keys = {
        ArrowLeft: false,
        ArrowRight: false,
        ArrowUp: false,
        ArrowDown: false,
        KeyA: false,
        KeyD: false,
        KeyW: false,
        KeyS: false,
        Space: false
    };

    let scene, camera, renderer, clock;
    let physicsWorld;
    let roadTexture, envTexture;
    let roadMesh, shoulderLeft, shoulderRight;
    let streetlights = [];
    let sceneryPillars = [];
    let speedLines = [];
    let weatherParticles = [];
    let trafficCars = [];
    let roadTraps = [];
    let detachedDebris = [];
    let particles = [];

    const sharedGeos = {
        spark: null,
        shard: null,
        smoke: null,
        steam: null,
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

        camera = new THREE.PerspectiveCamera(62, wrapper.clientWidth / wrapper.clientHeight, 0.1, 380);
        camera.position.set(0, 3.6, 8.2);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.22;

        clock = new THREE.Clock();

        physicsWorld = new CANNON.World();
        physicsWorld.gravity.set(0, -21.0, 0);
        physicsWorld.broadphase = new CANNON.NaiveBroadphase();

        const defaultMaterial = new CANNON.Material('default');
        const contactMat = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
            friction: 0.35,
            restitution: 0.48
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
        sharedGeos.steam = new THREE.DodecahedronGeometry(0.24, 0);
        sharedGeos.explosion = new THREE.DodecahedronGeometry(0.58, 1);
        sharedGeos.debris = new THREE.BoxGeometry(0.36, 0.12, 0.40);

        roadTexture = createProceduralRoadTexture();
        envTexture = createProceduralEnvTexture();
        scene.environment = envTexture;

        const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.95);
        scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
        dirLight.position.set(28, 52, 32);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 5;
        dirLight.shadow.camera.far = 160;
        const d = 42;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        scene.add(dirLight);

        buildHighwayEnvironment();
        rebuildPlayerCar();
        initSpeedAndWeatherLines();
        applyMapTheme(state.selectedMap);

        window.addEventListener('resize', onWindowResize);
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
        const barrierMat = new THREE.MeshStandardMaterial({
            color: 0x334155,
            roughness: 0.52,
            metalness: 0.38
        });

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
                scene.add(gantry);
                streetlights.push(gantry);
            }
        }

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
            const neonStrip = new THREE.Mesh(
                new THREE.BoxGeometry(w + 0.25, 0.5, d + 0.25),
                new THREE.MeshBasicMaterial({ color: neonColor })
            );
            neonStrip.position.y = h * 0.32;
            bldg.add(neonStrip);
            bldg.userData = { neonStrip, baseH: h };

            scene.add(bldg);
            sceneryPillars.push(bldg);
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
        playerCar.root.position.set(state.playerX, state.playerY, 0);
        scene.add(playerCar.root);

        const nameEl = document.getElementById('hud-car-name');
        if (nameEl) nameEl.textContent = CAR_SPECS[state.selectedCar].name;
        updateDamageSchematicUI();
    }

    function applyMapTheme(mapKey) {
        const spec = MAP_SPECS[mapKey] || MAP_SPECS.TOKYO;
        scene.background.setHex(spec.skyColor);
        scene.fog.color.setHex(spec.fogColor);
        scene.fog.density = spec.fogDensity;

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
     * BeamNG-style Soft-Body Impact & Subsystem Deformation Handler!
     * Deforms actual 3D vertices of the car body & panels around the 3D collision point,
     * updates the Node-Beam structural stress skeleton, damages mechanical subsystems,
     * unlatches/flaps hinged panels, or detaches torn panels into Cannon.js physics bodies!
     */
    function applySoftBodyCarDamage(rawAmount, contactOffsetX = 0, contactOffsetZ = -1.9, impactForceVec = null) {
        if (!playerCar) return;
        if (state.mode === 'PLAYING' && state.invulnerableTimer > 0) return;

        const carSpec = CAR_SPECS[state.selectedCar];
        const armorMult = carSpec.armorMultiplier || 1.0;
        const amount = rawAmount / armorMult;

        // Calculate realistic G-Force spike from impact severity
        const impactG = Math.min(68.0, 4.5 + rawAmount * 0.85);
        state.peakImpactG = Math.max(state.peakImpactG, impactG);

        if (state.gameType !== 'SANDBOX' && state.mode === 'PLAYING') {
            state.hp = Math.max(0, state.hp - amount);
            state.invulnerableTimer = 0.52;
            state.combo = 0;
        }

        const intensity = Math.min(1.5, amount / 20);
        audio.playCrash(intensity);

        // Local impact coordinates on the car
        const localImpact = new THREE.Vector3(
            THREE.MathUtils.clamp(contactOffsetX, -1.05, 1.05),
            0.55,
            THREE.MathUtils.clamp(contactOffsetZ, -2.25, 2.25)
        );
        const worldImpact = localImpact.clone().applyMatrix4(playerCar.root.matrixWorld);

        // Compute plastic deformation force vector pointing INTO the car body from the contact point
        const forceDir = impactForceVec ? impactForceVec.clone() : new THREE.Vector3(
            -contactOffsetX * 0.38,
            0.08,
            contactOffsetZ < 0 ? 0.42 : (contactOffsetZ > 0 ? -0.42 : 0)
        );
        const forceScale = Math.min(0.55, 0.14 + (rawAmount / 95));
        const worldForce = forceDir.normalize().multiplyScalar(forceScale);

        // 1. Deform all nearby sculpted soft-body meshes vertex-by-vertex!
        const deformRadius = Math.min(2.1, 1.05 + intensity * 0.55);
        playerCar.deformableMeshes.forEach(mesh => {
            deformMeshAtPoint(mesh, worldImpact, worldForce, deformRadius);
        });

        // 2. Deform the BeamNG Node-Beam structural skeleton & update strain colors
        deformNodeBeamSkeleton(playerCar.beamSkeleton, localImpact, forceDir.clone().multiplyScalar(forceScale), deformRadius * 1.15);

        // 3. Subsystem mechanical damage (Radiator, Engine, Steering Rack, Windshield Cracks)
        if (contactOffsetZ < -0.8) {
            playerCar.subsystems.radiatorHp = Math.max(0, playerCar.subsystems.radiatorHp - amount * 1.6);
            playerCar.subsystems.engineHp = Math.max(0, playerCar.subsystems.engineHp - amount * 1.1);
            if (Math.abs(contactOffsetX) > 0.3) {
                playerCar.subsystems.steeringHp = Math.max(0, playerCar.subsystems.steeringHp - amount * 1.4);
                playerCar.subsystems.alignmentPull = THREE.MathUtils.clamp(
                    playerCar.subsystems.alignmentPull + Math.sign(contactOffsetX) * 0.45,
                    -1.8,
                    1.8
                );
            }
        }
        if (amount > 14 && playerCar.windshieldCracks) {
            playerCar.windshieldCracks.material.opacity = Math.min(0.88, playerCar.windshieldCracks.material.opacity + 0.32);
        }

        // 4. Spawn sparks, glass/carbon shards, and physics shatter fragments
        spawnParticles(worldImpact, 14, 'SPARK');
        spawnParticles(worldImpact, 6, 'SHARD');
        spawnPhysicalShatterPieces(worldImpact, Math.min(4, Math.max(2, Math.round(amount * 0.16))), null, 11 + intensity * 4);

        // 5. Side/Corner Wheel & Suspension Tie-Rod Damage
        if (contactOffsetX < -0.35 && amount > 15) {
            damageSpecificTires(-1, amount > 32, amount * 0.9);
        } else if (contactOffsetX > 0.35 && amount > 15) {
            damageSpecificTires(1, amount > 32, amount * 0.9);
        }

        // 6. Panel Latch Failure (Hood / Doors flapping in the wind) & Hinge Detachment
        const targetKeys = new Set();
        if (contactOffsetZ < -0.7) {
            targetKeys.add('bumperF');
            targetKeys.add('hood');
        } else if (contactOffsetZ > 0.7) {
            targetKeys.add('trunk');
            targetKeys.add('wing');
        }
        if (contactOffsetX < -0.25) targetKeys.add('doorL');
        if (contactOffsetX > 0.25) targetKeys.add('doorR');

        targetKeys.forEach(key => {
            const part = playerCar.parts[key];
            if (!part || part.detached) return;

            part.hp = Math.max(0, part.hp - amount * 1.85);
            const dmgRatio = (100 - part.hp) / 100;

            if (part.hp < 65 && !part.latchBroken) {
                part.latchBroken = true;
                addFloatingNotification(`🔓 ${part.label} のラッチ破損（風圧でバタつき発生）`, 'text-amber-300');
            }

            // Hinge misalignment & ajar angle
            if (key === 'hood') {
                part.mesh.rotation.x = dmgRatio * 0.35;
                part.mesh.rotation.z = (Math.random() - 0.5) * dmgRatio * 0.16;
            } else if (key === 'bumperF') {
                part.mesh.rotation.z = (contactOffsetX >= 0 ? -1 : 1) * dmgRatio * 0.22;
                part.mesh.position.y = part.origPos.y - dmgRatio * 0.10;
            } else if (key === 'doorL' || key === 'doorR') {
                const dir = key === 'doorL' ? -1 : 1;
                part.mesh.rotation.y = dir * dmgRatio * 0.34;
            }

            if (part.hp <= 0) {
                detachCarPartPhysics(key, 13 + intensity * 5);
                addFloatingNotification(`💥 ${part.label} がヒンジ破断で脱落!! (${impactG.toFixed(1)}G)`, 'text-orange-400');
            }
        });

        updateHUD();
        updateDamageSchematicUI();

        if (state.mode === 'PLAYING' && state.gameType !== 'SANDBOX' && state.hp <= 0) {
            triggerCatastrophicExplosion();
        }
    }

    /**
     * Full BeamNG-style Instant Vehicle Reconstruction ('R' key or Repair Gate!)
     * Restores all deformed mesh vertices, resets the Node-Beam skeleton, re-attaches panels, and heals tires!
     */
    function repairAllSoftBodyAndTires(fullRebuild = false) {
        if (!playerCar) return;

        if (fullRebuild) {
            rebuildPlayerCar();
        } else {
            playerCar.deformableMeshes.forEach(m => resetDeformableMesh(m));
            resetNodeBeamSkeleton(playerCar.beamSkeleton);
            if (playerCar.windshieldCracks) playerCar.windshieldCracks.material.opacity = 0;

            Object.keys(playerCar.parts).forEach(key => {
                const p = playerCar.parts[key];
                if (!p.detached) {
                    p.hp = 100;
                    p.latchBroken = false;
                    p.mesh.position.copy(p.origPos);
                    p.mesh.rotation.set(0, 0, 0);
                }
            });
        }

        playerCar.subsystems.engineHp = 100;
        playerCar.subsystems.radiatorHp = 100;
        playerCar.subsystems.steeringHp = 100;
        playerCar.subsystems.alignmentPull = 0;

        playerCar.wheelStates.forEach(ws => {
            if (!ws.detached) {
                ws.hp = 100;
                ws.punctured = false;
                ws.bent = false;
                ws.bentToe = 0;
                ws.bentCamber = 0;
                ws.tireMesh.scale.set(1, 1, 1);
                ws.tireMesh.material.color.setHex(0x11151c);
                ws.hubGroup.rotation.set(0, 0, 0);
                ws.hubGroup.position.y = ws.origY;
            }
        });

        state.hp = Math.min(100, state.hp + 35);
        state.nosFuel = Math.min(100, state.nosFuel + 40);
        audio.playEtcDing(true);
        addFloatingNotification('🔧 BeamNG 板金・シャシー完全修復 ＆ 耐久度+35% 回復!!', 'text-lime-300');
        updateHUD();
        updateDamageSchematicUI();
    }

    function damageSpecificTires(sideFilter = 0, instantPuncture = false, dmgAmount = 55) {
        if (!playerCar || !playerCar.wheelStates) return;
        const armorMult = CAR_SPECS[state.selectedCar].armorMultiplier || 1.0;
        let anyPuncturedNow = false;

        playerCar.wheelStates.forEach(ws => {
            if (ws.detached) return;
            if (sideFilter !== 0 && ws.side !== sideFilter) return;

            ws.hp = Math.max(0, ws.hp - (dmgAmount / armorMult));

            if (instantPuncture || ws.hp <= 0) {
                if (!ws.punctured) {
                    ws.punctured = true;
                    ws.bent = true;
                    ws.hp = 0;
                    anyPuncturedNow = true;

                    ws.tireMesh.scale.set(0.92, 0.78, 0.78);
                    ws.tireMesh.material.color.setHex(0x1e293b);
                    ws.bentCamber = ws.side * 0.16;
                    ws.bentToe = ws.side * 0.05;
                    ws.hubGroup.position.y = ws.origY - 0.08;

                    const worldPos = new THREE.Vector3();
                    ws.hubGroup.getWorldPosition(worldPos);
                    spawnPhysicalShatterPieces(worldPos, 3, 0x111827, 11);
                    spawnParticles(worldPos, 12, 'SPARK');

                    addFloatingNotification(`🛞 ${ws.label} がバースト!! ([R]キーまたはリペアゲートで修復可)`, 'text-amber-300');
                }
            } else if (ws.hp < 65 && !ws.bent) {
                ws.bent = true;
                ws.bentCamber = ws.side * 0.08;
                ws.bentToe = ws.side * 0.03;
            }
        });

        if (anyPuncturedNow) {
            audio.playTireBurst();
            state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh * 0.88);
        }
        updateDamageSchematicUI();
    }

    function spawnPhysicalShatterPieces(originWorldPos, count = 4, baseColor = null, impulse = 13) {
        if (!originWorldPos || !Number.isFinite(originWorldPos.x)) return;
        const carColor = baseColor !== null ? baseColor : CAR_SPECS[state.selectedCar].color;
        const palette = [carColor, 0x1e293b, 0xe2e8f0, 0x0f172a];
        const safeCount = Math.min(count, 4);

        for (let i = 0; i < safeCount; i++) {
            while (detachedDebris.length >= 16) {
                const oldest = detachedDebris.shift();
                scene.remove(oldest.mesh);
                physicsWorld.removeBody(oldest.body);
            }

            const col = palette[i % palette.length];
            const mat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.72, roughness: 0.28 });
            const mesh = new THREE.Mesh(sharedGeos.debris, mat);

            const spawnX = originWorldPos.x + (Math.random() - 0.5) * 1.4;
            const spawnY = Math.max(0.45, originWorldPos.y + 0.25 + Math.random() * 0.5);
            const spawnZ = originWorldPos.z + (Math.random() - 0.5) * 1.4;

            mesh.position.set(spawnX, spawnY, spawnZ);
            scene.add(mesh);

            const body = new CANNON.Body({
                mass: 5,
                position: new CANNON.Vec3(spawnX, spawnY, spawnZ),
                collisionFilterGroup: 2,
                collisionFilterMask: 1
            });
            body.addShape(new CANNON.Box(new CANNON.Vec3(0.18, 0.06, 0.20)));

            body.velocity.set(
                (Math.random() - 0.5) * impulse * 1.3,
                3.5 + Math.random() * impulse * 0.7,
                (Math.random() - 0.2) * impulse * 1.2
            );
            body.angularVelocity.set(
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 16,
                (Math.random() - 0.5) * 16
            );

            physicsWorld.addBody(body);
            detachedDebris.push({ mesh, body, life: 3.2 + Math.random() * 1.2 });
        }
    }

    function detachCarPartPhysics(partKey, impulseForce = 15) {
        const part = playerCar.parts[partKey];
        if (!part || part.detached) return;
        part.detached = true;
        part.hp = 0;

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        part.mesh.getWorldPosition(worldPos);
        part.mesh.getWorldQuaternion(worldQuat);

        playerCar.chassisGroup.remove(part.mesh);
        scene.add(part.mesh);
        part.mesh.position.copy(worldPos);
        part.mesh.quaternion.copy(worldQuat);

        while (detachedDebris.length >= 16) {
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

        body.velocity.set(
            (Math.random() - 0.5) * impulseForce * 1.2,
            4.5 + Math.random() * impulseForce * 0.75,
            4.0 + Math.random() * impulseForce * 0.8
        );
        body.angularVelocity.set(
            (Math.random() - 0.5) * 16,
            (Math.random() - 0.5) * 16,
            (Math.random() - 0.5) * 16
        );

        physicsWorld.addBody(body);
        detachedDebris.push({ mesh: part.mesh, body, life: 4.0 });
        updateDamageSchematicUI();
    }

    function spawnParticles(origin, count, type = 'SPARK') {
        if (!origin || !Number.isFinite(origin.x)) return;
        const cappedCount = Math.min(count, 16);

        for (let i = 0; i < cappedCount; i++) {
            while (particles.length >= 55) {
                const oldest = particles.shift();
                scene.remove(oldest.mesh);
            }

            let geo, mat, vel, gravity = -16, scaleRate = 0, maxLife = 0.6;

            if (type === 'SPARK') {
                geo = sharedGeos.spark;
                mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0xfbbf24 : 0xffffff });
                vel = new THREE.Vector3((Math.random() - 0.5) * 16, 2 + Math.random() * 9, (Math.random() - 0.2) * 16);
                maxLife = 0.28 + Math.random() * 0.22;
            } else if (type === 'SHARD') {
                geo = sharedGeos.shard;
                const carCol = CAR_SPECS[state.selectedCar].color;
                mat = new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? carCol : 0x38bdf8, metalness: 0.8, roughness: 0.2 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 14, 3 + Math.random() * 8, 2 + Math.random() * 12);
                maxLife = 0.75 + Math.random() * 0.35;
            } else if (type === 'STEAM') {
                geo = sharedGeos.steam;
                mat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.42 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.8 + Math.random() * 1.5, 4.5 + Math.random() * 2.5);
                gravity = 1.5;
                scaleRate = 2.0;
                maxLife = 0.40 + Math.random() * 0.20;
            } else if (type === 'SMOKE') {
                geo = sharedGeos.smoke;
                mat = new THREE.MeshBasicMaterial({ color: state.hp < 35 ? 0x1e293b : 0x94a3b8, transparent: true, opacity: 0.45 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 1.8, 1.4 + Math.random() * 1.8, 5.0 + Math.random() * 3.0);
                gravity = 1.2;
                scaleRate = 1.8;
                maxLife = 0.45 + Math.random() * 0.25;
            } else if (type === 'EXPLOSION') {
                const colors = [0xffffff, 0xfef08a, 0xf97316, 0xef4444, 0x1e293b];
                const col = colors[Math.floor(Math.random() * colors.length)];
                geo = sharedGeos.explosion;
                mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 });
                vel = new THREE.Vector3((Math.random() - 0.5) * 24, 3 + Math.random() * 18, (Math.random() - 0.5) * 24);
                gravity = -6.0;
                scaleRate = 2.4;
                maxLife = 0.85 + Math.random() * 0.5;
            }

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(origin);
            scene.add(mesh);
            particles.push({ mesh, vel, gravity, scaleRate, life: maxLife, maxLife });
        }
    }

    function triggerCatastrophicExplosion() {
        if (state.mode === 'EXPLODING') return;
        state.mode = 'EXPLODING';
        state.explosionTimer = 2.8;
        audio.playExplosion();

        addFloatingNotification('🔥 CRITICAL STRUCTURAL FAILURE - 大爆発!!', 'text-red-500 text-lg font-black');

        Object.keys(playerCar.parts).forEach(key => detachCarPartPhysics(key, 20));

        playerCar.wheelStates.forEach(ws => {
            if (ws.detached) return;
            ws.detached = true;
            const worldPos = new THREE.Vector3();
            ws.hubGroup.getWorldPosition(worldPos);
            playerCar.root.remove(ws.hubGroup);
            scene.add(ws.hubGroup);
            ws.hubGroup.position.copy(worldPos);

            const body = new CANNON.Body({
                mass: 10,
                position: new CANNON.Vec3(worldPos.x, Math.max(0.5, worldPos.y + 0.3), worldPos.z),
                collisionFilterGroup: 2,
                collisionFilterMask: 1
            });
            body.addShape(new CANNON.Sphere(0.39));
            body.velocity.set(ws.side * 12 + (Math.random() - 0.5) * 8, 7 + Math.random() * 10, (Math.random() - 0.5) * 14);
            body.angularVelocity.set(Math.random() * 15, Math.random() * 15, Math.random() * 15);
            physicsWorld.addBody(body);
            detachedDebris.push({ mesh: ws.hubGroup, body, life: 4.5 });
        });
        playerCar.wheels = [];

        playerCar.coreMesh.material.color.setHex(0x18181b);
        playerCar.headlightL.intensity = 0;
        playerCar.headlightR.intensity = 0;

        const blastCenter = playerCar.root.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        spawnPhysicalShatterPieces(blastCenter, 4, null, 18);
        spawnParticles(blastCenter, 16, 'EXPLOSION');
        spawnParticles(blastCenter, 14, 'SPARK');
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

        const wpGeo = new THREE.DodecahedronGeometry(0.12, 0);
        const wpMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
        for (let i = 0; i < 65; i++) {
            const wp = new THREE.Mesh(wpGeo, wpMat.clone());
            wp.position.set((Math.random() - 0.5) * 40, Math.random() * 10, -Math.random() * 115);
            scene.add(wp);
            weatherParticles.push(wp);
        }
    }

    /**
     * SMART ESCAPE-CORRIDOR TRAFFIC SPAWNER
     * Guarantees at least 2 lanes remain completely clear in any 52m Z-slice so high levels (Lv.4/Lv.5)
     * never create an unavoidable wall of cars!
     */
    function spawnTrafficVehicle(zOffset = -185) {
        // Count how many lanes are already occupied within 52 meters of zOffset
        const blockedLanesAtZ = new Set();
        trafficCars.forEach(tc => {
            if (Math.abs(tc.mesh.position.z - zOffset) < 52) {
                LANE_CENTERS.forEach((lx, idx) => {
                    if (Math.abs(tc.mesh.position.x - lx) < 2.6) blockedLanesAtZ.add(idx);
                });
            }
        });
        roadTraps.forEach(tr => {
            if (Math.abs(tr.mesh.position.z - zOffset) < 42) {
                LANE_CENTERS.forEach((lx, idx) => {
                    if (Math.abs(tr.mesh.position.x - lx) < 2.8) blockedLanesAtZ.add(idx);
                });
            }
        });

        // Never block more than 4 of the 6 lanes in any longitudinal slice! (Leaves at least 2 escape lanes!)
        if (blockedLanesAtZ.size >= 4) return;

        const availableLanes = [0, 1, 2, 3, 4, 5].filter(idx => !blockedLanesAtZ.has(idx));
        if (availableLanes.length <= 2) return;

        const laneIndex = availableLanes[Math.floor(Math.random() * availableLanes.length)];
        const laneX = LANE_CENTERS[laneIndex];

        const lvlSpec = LEVEL_SPECS[state.selectedLevel] || LEVEL_SPECS[2];
        const roll = Math.random();
        let type;
        if (roll < lvlSpec.wrongWayChance) {
            type = 'WRONG_WAY';
        } else if (roll < lvlSpec.wrongWayChance + lvlSpec.rageChance) {
            type = 'ROAD_RAGE';
        } else {
            const normalTypes = ['SEDAN', 'SUV', 'TRUCK', 'POLICE', 'SPORTS'];
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

        // Moderated speeds for Wrong-Way Elderly Cars so players have ample time to spot & dodge them!
        let speedKmh = (72 + Math.random() * 58) * lvlSpec.trafficSpeedMult;
        if (isWrongWay) {
            speedKmh = -(55 + Math.random() * 35) * Math.min(1.15, lvlSpec.trafficSpeedMult);
            group.rotation.y = Math.PI;
        } else if (type === 'ROAD_RAGE') {
            speedKmh = (108 + Math.random() * 40) * lvlSpec.trafficSpeedMult;
        } else if (type === 'TRUCK') {
            speedKmh = (58 + Math.random() * 25) * lvlSpec.trafficSpeedMult;
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
            deformableTrafficMeshes: built.deformableTrafficMeshes,
            width: built.width,
            length: built.length,
            speedKmh,
            vx: 0,
            vz: 0,
            vy: 0,
            yawRate: 0,
            rollRate: 0,
            honked: false,
            hitByPlayer: false,
            overtaken: false
        });
    }

    function spawnEtcTollPlaza(zOffset = -195) {
        const plazaGroup = new THREE.Group();
        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.2 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.6 });
        const yellowStripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        const etcSignMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const closedSignMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

        const canopy = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 2, 1.4, 5.2), roofMat);
        canopy.position.set(0, 6.2, 0);
        plazaGroup.add(canopy);

        const canopyTrim = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 2.2, 0.24, 5.3), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        canopyTrim.position.set(0, 5.45, 0);
        plazaGroup.add(canopyTrim);

        const islandPositions = [-16.2, -10.8, -5.4, 0.0, 5.4, 10.8, 16.2];
        islandPositions.forEach(ix => {
            const island = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.35, 6.0), concreteMat);
            island.position.set(ix, 0.68, 0);
            plazaGroup.add(island);

            const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.50, 1.3, 12), yellowStripeMat);
            cushion.position.set(ix, 0.65, 3.0);
            plazaGroup.add(cushion);

            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.60, 5.6, 1.8), roofMat);
            pillar.position.set(ix, 2.8, 0);
            plazaGroup.add(pillar);
        });

        const laneConfigs = [];
        const closedCount = state.selectedLevel >= 4 ? 2 : 1; // Keep 4 to 5 ETC lanes open so it's fair!
        const closedIndices = new Set();
        while (closedIndices.size < closedCount) {
            closedIndices.add(Math.floor(Math.random() * 6));
        }

        for (let l = 0; l < 6; l++) {
            const lx = LANE_CENTERS[l];
            const isClosed = closedIndices.has(l);

            const signBox = new THREE.Mesh(
                new THREE.BoxGeometry(3.4, 1.1, 0.3),
                isClosed ? closedSignMat : etcSignMat
            );
            signBox.position.set(lx, 5.5, 2.65);
            plazaGroup.add(signBox);

            let barPivot = null;
            if (isClosed) {
                const blockWall = new THREE.Mesh(
                    new THREE.BoxGeometry(3.4, 1.2, 0.8),
                    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 })
                );
                blockWall.position.set(lx, 0.6, 1.2);
                plazaGroup.add(blockWall);
            } else {
                barPivot = new THREE.Group();
                barPivot.position.set(lx - 1.9, 1.15, 1.6);
                const barArm = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
                barArm.position.set(1.8, 0, 0);
                const barStripe = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0x0284c7 }));
                barStripe.position.set(2.2, 0, 0);
                barPivot.add(barArm, barStripe);
                plazaGroup.add(barPivot);
            }

            laneConfigs.push({ laneIndex: l, centerX: lx, isClosed, barPivot, barBroken: false });
        }

        plazaGroup.position.set(0, 0, zOffset);
        scene.add(plazaGroup);

        roadTraps.push({
            mesh: plazaGroup,
            type: 'ETC_PLAZA',
            width: ROAD_WIDTH,
            length: 6.0,
            islandPositions,
            laneConfigs,
            triggered: false
        });

        addFloatingNotification('🛂 前方に【ETC料金所ゲート】出現!! 緑のETCレーンへ進入せよ!', 'text-emerald-300');
    }

    function spawnRoadTrap(zOffset = -175, forcedType = null) {
        const laneIndex = Math.floor(Math.random() * 6);
        const laneX = LANE_CENTERS[laneIndex];

        if (!forcedType) {
            const tooClose = roadTraps.some(t => Math.abs(t.mesh.position.z - zOffset) < 28) ||
                             trafficCars.some(c => Math.abs(c.mesh.position.x - laneX) < 2.8 && Math.abs(c.mesh.position.z - zOffset) < 24);
            if (tooClose) return;
        }

        const weights = ['SPIKE', 'BARREL', 'OIL', 'RAMP', 'RAMP', 'CONTAINER', 'REPAIR', 'REPAIR'];
        const type = forcedType || weights[Math.floor(Math.random() * weights.length)];

        if (type === 'CRUSHER' || type === 'CONCRETE_WALL') {
            const sbObj = createSandboxObstacle(type, laneX, zOffset);
            scene.add(sbObj.mesh);
            roadTraps.push(sbObj);
            return;
        }

        const group = new THREE.Group();
        let width = 2.4, length = 1.8;

        if (type === 'BARREL') {
            width = 2.5; length = 1.6;
            const barrelGeo = new THREE.CylinderGeometry(0.44, 0.44, 1.18, 14);
            const barrelMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.5 });
            const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
            [[-0.6, 0], [0.6, 0], [0, -0.5]].forEach(offset => {
                const b = new THREE.Mesh(barrelGeo, barrelMat);
                b.position.set(offset[0], 0.59, offset[1]);
                b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.22, 14), stripeMat));
                group.add(b);
            });
        } else if (type === 'SPIKE') {
            width = 3.2; length = 1.0;
            const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 }));
            base.position.y = 0.05;
            group.add(base);
            const spikeGeo = new THREE.ConeGeometry(0.09, 0.36, 6);
            const spikeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
            for (let x = -1.4; x <= 1.4; x += 0.28) {
                const s = new THREE.Mesh(spikeGeo, spikeMat);
                s.position.set(x, 0.23, 0);
                group.add(s);
            }
        } else if (type === 'OIL') {
            width = 3.5; length = 3.8;
            const puddle = new THREE.Mesh(
                new THREE.CylinderGeometry(1.75, 1.75, 0.03, 18),
                new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.98, roughness: 0.02, envMap: envTexture })
            );
            puddle.scale.set(1.0, 1.0, 1.25);
            puddle.position.y = 0.02;
            group.add(puddle);
        } else if (type === 'RAMP') {
            width = 3.6; length = 4.8;
            const rampMesh = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.25, length),
                new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.35 })
            );
            rampMesh.rotation.x = 0.26;
            rampMesh.position.set(0, 0.55, 0);
            const arrowStrip = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 0.28, length * 0.85),
                new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
            );
            arrowStrip.rotation.x = 0.26;
            arrowStrip.position.set(0, 0.57, 0);
            group.add(rampMesh, arrowStrip);
        } else if (type === 'CONTAINER') {
            width = 2.7; length = 6.0;
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(width, 2.5, length),
                new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.5, metalness: 0.4 })
            );
            box.position.y = 1.25;
            const hazardStripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, 0.35, 0.2), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
            hazardStripe.position.set(0, 1.0, length / 2);
            group.add(box, hazardStripe);
        } else if (type === 'REPAIR') {
            width = 3.8; length = 1.5;
            const archMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
            const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), archMat);
            pillarL.position.set(-1.7, 1.4, 0);
            const pillarR = pillarL.clone();
            pillarR.position.x = 1.7;
            const topBar = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.35, 0.35), archMat);
            topBar.position.set(0, 2.8, 0);
            const pad = new THREE.Mesh(
                new THREE.PlaneGeometry(3.4, 2.4),
                new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
            );
            pad.rotation.x = Math.PI / 2;
            pad.position.y = 0.04;
            group.add(pillarL, pillarR, topBar, pad);
        }

        group.position.set(laneX, 0, zOffset);
        scene.add(group);
        roadTraps.push({ mesh: group, type, width, length, triggered: false });
    }

    /**
     * Honk Horn & High-Beam Flash ('H' key):
     * Makes normal traffic cars and even road-rage cars ahead panic and swerve out of the player's lane!
     */
    function triggerPlayerHornAndFlash() {
        audio.init();
        audio.playHorn(false);
        if (!playerCar) return;

        playerCar.headlightL.intensity = 5.5;
        playerCar.headlightR.intensity = 5.5;
        setTimeout(() => {
            if (playerCar && playerCar.headlightL) {
                playerCar.headlightL.intensity = 2.8;
                playerCar.headlightR.intensity = 2.8;
            }
        }, 280);

        trafficCars.forEach(tc => {
            const dz = tc.mesh.position.z - playerCar.root.position.z;
            const dx = tc.mesh.position.x - state.playerX;
            if (!tc.isWrongWay && dz < -5 && dz > -85 && Math.abs(dx) < 3.2) {
                const escapeDir = tc.mesh.position.x > 0 ? -1 : 1;
                tc.vx += escapeDir * 9.5;
            }
        });
    }

    function addFloatingNotification(text, colorClass = 'text-sky-300') {
        const feed = document.getElementById('event-feed');
        if (!feed) return;
        const el = document.createElement('div');
        el.className = `combo-pop px-3.5 py-1 rounded-full hud-glass border border-white/15 font-['Orbitron'] font-bold text-xs sm:text-sm shadow-lg ${colorClass}`;
        el.innerHTML = text;
        feed.appendChild(el);
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 1200);
    }

    function updateStageHUDLabels() {
        const mapSpec = MAP_SPECS[state.selectedMap];
        const carSpec = CAR_SPECS[state.selectedCar];
        const lvlSpec = LEVEL_SPECS[state.selectedLevel];

        const badge = document.getElementById('hud-stage-badge');
        if (badge) {
            const modeLabel = state.gameType === 'SANDBOX' ? '🧪 CRASH LAB' : (state.gameType === 'ENDLESS' ? '♾️ ENDLESS' : `Lv.${state.selectedLevel}`);
            badge.textContent = `${modeLabel} | ${mapSpec.name}`;
        }

        // Update Showroom / Garage stat bars if elements exist
        const setBar = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.style.width = `${val}%`;
        };
        if (carSpec && carSpec.stats) {
            setBar('stat-bar-speed', carSpec.stats.speed);
            setBar('stat-bar-accel', carSpec.stats.accel);
            setBar('stat-bar-handling', carSpec.stats.handling);
            setBar('stat-bar-armor', carSpec.stats.armor);
            setBar('stat-bar-mass', carSpec.stats.mass);
        }

        const specName = document.getElementById('garage-car-title');
        if (specName) specName.textContent = carSpec.name;
        const specCat = document.getElementById('garage-car-category');
        if (specCat) specCat.textContent = `${carSpec.category} | 車重: ${carSpec.massKg}kg | 最高速: ${carSpec.maxSpeed}km/h`;
        const specDesc = document.getElementById('garage-car-desc');
        if (specDesc) specDesc.textContent = carSpec.desc;

        const mapLabel = document.getElementById('map-hazard-label');
        if (mapLabel) mapLabel.textContent = mapSpec.info;
        const lvlLabel = document.getElementById('level-desc-label');
        if (lvlLabel) lvlLabel.textContent = lvlSpec.desc;

        // Highlight cleared level badges
        document.querySelectorAll('#level-select-grid .select-card').forEach(card => {
            const lv = card.getAttribute('data-level');
            const badgeSpan = card.querySelector('.clear-badge');
            if (badgeSpan) {
                if (clearedLevels[lv]) {
                    badgeSpan.classList.remove('hidden');
                } else {
                    badgeSpan.classList.add('hidden');
                }
            }
        });
    }

    function updateDamageSchematicUI() {
        if (!playerCar) return;
        let detachedCount = 0;
        Object.values(playerCar.parts).forEach(part => {
            if (part.detached) detachedCount++;
        });
        const detBadge = document.getElementById('detached-parts-badge');
        if (detBadge) detBadge.textContent = `破損パーツ: ${detachedCount} / 6`;

        const setPartClass = (id, baseClass, hp, detached) => {
            const el = document.getElementById(id);
            if (!el) return;
            let colorClass = 'bg-emerald-500/80';
            if (detached || hp <= 0) colorClass = 'bg-red-600/90';
            else if (hp < 65) colorClass = 'bg-amber-400/90';
            el.className = `${baseClass} ${colorClass}`;
        };

        setPartClass('schem-hood', 'w-8 h-4 rounded-t-md border border-white/20 transition-colors', Math.min(playerCar.parts.hood.hp, playerCar.parts.bumperF.hp), playerCar.parts.hood.detached);
        setPartClass('schem-doorL', 'w-1.5 h-9 rounded-l transition-colors', playerCar.parts.doorL.hp, playerCar.parts.doorL.detached);
        setPartClass('schem-doorR', 'w-1.5 h-9 rounded-r transition-colors', playerCar.parts.doorR.hp, playerCar.parts.doorR.detached);
        setPartClass('schem-trunk', 'w-8 h-3.5 rounded-b-md border border-white/20 transition-colors', Math.min(playerCar.parts.trunk.hp, playerCar.parts.wing.hp), playerCar.parts.wing.detached);

        const tirePosClasses = {
            'schem-tire-FL': 'absolute -left-1.5 top-2.5 w-2 h-5 rounded-sm border border-white/30 transition-colors',
            'schem-tire-FR': 'absolute -right-1.5 top-2.5 w-2 h-5 rounded-sm border border-white/30 transition-colors',
            'schem-tire-RL': 'absolute -left-1.5 bottom-2.5 w-2 h-5 rounded-sm border border-white/30 transition-colors',
            'schem-tire-RR': 'absolute -right-1.5 bottom-2.5 w-2 h-5 rounded-sm border border-white/30 transition-colors'
        };

        let leftPunctures = 0, rightPunctures = 0, bentCount = 0;
        playerCar.wheelStates.forEach(ws => {
            const el = document.getElementById(ws.schemId);
            if (!el) return;
            const baseCls = tirePosClasses[ws.schemId] || '';
            if (ws.punctured || ws.detached) {
                el.className = `${baseCls} bg-red-500`;
                if (ws.side < 0) leftPunctures++;
                else rightPunctures++;
            } else if (ws.bent || ws.hp < 65) {
                el.className = `${baseCls} bg-amber-400`;
                bentCount++;
            } else {
                el.className = `${baseCls} bg-emerald-400`;
            }
        });

        const pullEl = document.getElementById('tire-pull-status');
        if (pullEl) {
            if (leftPunctures > rightPunctures) {
                pullEl.className = 'text-[11px] font-bold text-amber-300';
                pullEl.innerHTML = `<i class="fa-solid fa-arrow-left mr-1"></i>左輪バースト ([R]で修復可)`;
            } else if (rightPunctures > leftPunctures) {
                pullEl.className = 'text-[11px] font-bold text-amber-300';
                pullEl.innerHTML = `<i class="fa-solid fa-arrow-right mr-1"></i>右輪バースト ([R]で修復可)`;
            } else if (leftPunctures > 0 && rightPunctures > 0) {
                pullEl.className = 'text-[11px] font-bold text-rose-400';
                pullEl.innerHTML = `<i class="fa-solid fa-burst mr-1"></i>両輪バースト ([R]で修復可)`;
            } else if (bentCount > 0 || Math.abs(playerCar.subsystems.alignmentPull) > 0.2) {
                pullEl.className = 'text-[11px] font-bold text-amber-300';
                pullEl.innerHTML = `<i class="fa-solid fa-wrench mr-1"></i>足回り・タイロッド歪み発生`;
            } else {
                pullEl.className = 'text-[11px] font-bold text-emerald-400';
                pullEl.innerHTML = `<i class="fa-solid fa-circle-check mr-1"></i>4輪サス・アライメント正常`;
            }
        }
    }

    /**
     * Updates 6-Lane Oncoming Hazard Radar at the top of the screen so the player can clearly see
     * which lanes have Wrong-Way Elderly Cars or Road-Rage Cars approaching!
     */
    function updateLaneRadarHUD() {
        for (let l = 0; l < 6; l++) {
            const radarEl = document.getElementById(`lane-radar-${l}`);
            if (!radarEl) continue;

            let hazardType = null;
            const lx = LANE_CENTERS[l];
            for (const tc of trafficCars) {
                const dz = tc.mesh.position.z - (playerCar ? playerCar.root.position.z : 0);
                if (dz < -5 && dz > -195 && Math.abs(tc.mesh.position.x - lx) < 2.7) {
                    if (tc.isWrongWay) {
                        hazardType = 'WRONG_WAY';
                        break;
                    } else if (tc.type === 'ROAD_RAGE' && dz > -110) {
                        hazardType = 'ROAD_RAGE';
                    }
                }
            }

            if (hazardType === 'WRONG_WAY') {
                radarEl.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-red-600/90 text-yellow-200 border border-yellow-300 animate-pulse';
                radarEl.textContent = `L${l + 1} 🔱逆走接近!`;
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
        document.getElementById('speed-display').textContent = spd;
        document.getElementById('score-display').textContent = Math.floor(state.score).toString().padStart(6, '0');
        document.getElementById('overtake-count').textContent = state.overtakes;

        const gear = Math.min(6, Math.max(1, Math.ceil(spd / 62)));
        document.getElementById('gear-display').textContent = state.mode === 'EXPLODING' ? 'X' : gear;
        const rpmPct = Math.min(100, Math.max(18, ((spd % 62) / 62) * 100));
        document.getElementById('rpm-bar').style.width = `${rpmPct}%`;

        // NOS Bar
        const nosBar = document.getElementById('nos-bar');
        if (nosBar) nosBar.style.width = `${Math.round(state.nosFuel)}%`;

        // Stage Clear Goal Progress Bar
        const goalBar = document.getElementById('goal-progress-bar');
        const goalText = document.getElementById('goal-progress-text');
        if (goalBar && goalText) {
            if (state.gameType === 'CAREER') {
                const pct = Math.min(100, (state.distanceTraveled / state.goalDistanceMeters) * 100);
                goalBar.style.width = `${pct.toFixed(1)}%`;
                const remainKm = Math.max(0, (state.goalDistanceMeters - state.distanceTraveled) / 1000);
                goalText.textContent = `GOAL残り: ${remainKm.toFixed(2)} km (${Math.round(pct)}%)`;
            } else if (state.gameType === 'SANDBOX') {
                goalBar.style.width = '100%';
                goalText.textContent = `🧪 BeamNG 物理クラッシュ実験場 (走行 ${(state.distanceTraveled / 1000).toFixed(2)} km)`;
            } else {
                goalBar.style.width = '100%';
                goalText.textContent = `♾️ エンドレス走行距離: ${(state.distanceTraveled / 1000).toFixed(2)} km`;
            }
        }

        // G-Force Telemetry Indicator
        const gDot = document.getElementById('gforce-dot');
        const gText = document.getElementById('gforce-text');
        if (gDot && gText) {
            const gx = THREE.MathUtils.clamp(state.lateralG * 8, -14, 14);
            const gy = THREE.MathUtils.clamp(state.longitudinalG * 8, -14, 14);
            gDot.style.transform = `translate(${gx}px, ${gy}px)`;
            gText.textContent = `MAX: ${state.peakImpactG.toFixed(1)}G`;
        }

        const hpPct = Math.max(0, Math.round(state.hp));
        const hpBar = document.getElementById('hp-bar');
        const hpText = document.getElementById('hp-text');
        const warnText = document.getElementById('damage-warning');
        const critOverlay = document.getElementById('critical-overlay');

        hpBar.style.width = `${hpPct}%`;
        hpText.textContent = state.gameType === 'SANDBOX' ? '∞ LAB' : `${hpPct}%`;

        if (hpPct > 60 || state.gameType === 'SANDBOX') {
            hpBar.className = 'h-full rounded-full transition-all duration-150 bg-gradient-to-r from-emerald-500 via-lime-400 to-emerald-300';
            hpText.className = "font-['Orbitron'] font-bold text-emerald-400 text-sm";
            warnText.className = 'text-[11px] text-emerald-400 font-bold mt-1';
            warnText.innerHTML = '<i class="fa-solid fa-shield-halved mr-1"></i>SOFT-BODY CHASSIS OK';
            critOverlay.classList.add('hidden');
        } else if (hpPct > 25) {
            hpBar.className = 'h-full rounded-full transition-all duration-150 bg-gradient-to-r from-amber-500 to-yellow-400';
            hpText.className = "font-['Orbitron'] font-bold text-amber-400 text-sm";
            warnText.className = 'text-[11px] text-amber-400 font-bold mt-1';
            warnText.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i>CRUMPLE ZONE DEFORMED';
            critOverlay.classList.add('hidden');
        } else {
            hpBar.className = 'h-full rounded-full transition-all duration-150 bg-gradient-to-r from-red-600 to-orange-500';
            hpText.className = "font-['Orbitron'] font-bold text-red-500 text-sm";
            warnText.className = 'text-[11px] text-red-400 font-bold mt-1';
            warnText.innerHTML = '<i class="fa-solid fa-fire-flame-curved mr-1"></i>CRITICAL FRAME DAMAGE!';
            critOverlay.classList.remove('hidden');
        }

        updateLaneRadarHUD();
    }

    function updateGamePhysics(rawDt) {
        if (!Number.isFinite(rawDt) || rawDt <= 0) return;

        // Smooth Bullet-Time Slow-Motion scaling
        const targetScale = state.slowMoActive ? 0.28 : 1.0;
        state.timeScale = THREE.MathUtils.lerp(state.timeScale, targetScale, rawDt * 10);
        const dt = rawDt * state.timeScale;

        physicsWorld.step(1 / 60, dt, 2);

        for (let i = detachedDebris.length - 1; i >= 0; i--) {
            const item = detachedDebris[i];
            item.life -= dt;
            if (Number.isFinite(item.body.position.x) && Number.isFinite(item.body.position.y) && Number.isFinite(item.body.position.z)) {
                item.body.position.z += (state.speedKmh / 3.6) * dt * 0.55;
                item.mesh.position.copy(item.body.position);
                item.mesh.quaternion.copy(item.body.quaternion);
            } else {
                item.life = 0;
            }

            if (item.life <= 0 || item.mesh.position.z > 28 || item.mesh.position.y < -10) {
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
            p.mesh.rotation.x += 5 * dt;
            p.mesh.rotation.y += 5 * dt;

            if (p.scaleRate > 0) p.mesh.scale.multiplyScalar(1 + p.scaleRate * dt);
            if (p.mesh.material.transparent) p.mesh.material.opacity = Math.max(0, (p.life / p.maxLife) * 0.75);
            if (p.life <= 0) {
                scene.remove(p.mesh);
                particles.splice(i, 1);
            }
        }

        // Interactive 3D Showroom Turntable when in MENU / GAMEOVER / STAGECLEAR
        if (state.mode === 'MENU' || state.mode === 'GAMEOVER' || state.mode === 'STAGECLEAR') {
            roadTexture.offset.y -= 0.35 * rawDt;
            if (playerCar && playerCar.root) {
                playerCar.root.position.set(0, 0, 0);
                if (!state.isMouseDragging) {
                    state.cameraDragYaw += 0.38 * rawDt;
                }
                const dist = 6.2;
                camera.position.set(
                    Math.sin(state.cameraDragYaw) * dist,
                    1.85 + state.cameraDragPitch * 2.2,
                    Math.cos(state.cameraDragYaw) * dist
                );
                camera.lookAt(0, 0.68, 0);
            }
            audio.updateEngine(0, false, false, state.selectedCar, 1.0);
            return;
        }

        if (state.invulnerableTimer > 0) state.invulnerableTimer -= dt;
        if (state.spinOutTimer > 0) state.spinOutTimer -= dt;

        const carSpec = CAR_SPECS[state.selectedCar];
        const mapSpec = MAP_SPECS[state.selectedMap];
        const lvlSpec = LEVEL_SPECS[state.selectedLevel];

        let puncturedCount = 0;
        let tireDriftBias = playerCar.subsystems.alignmentPull || 0;
        let chassisTiltBias = 0;

        playerCar.wheelStates.forEach(ws => {
            if (ws.detached) return;
            if (ws.punctured) {
                puncturedCount++;
                tireDriftBias += ws.side * 1.15;
                chassisTiltBias += ws.side * 0.022;

                if (state.playerY <= 0.05 && Math.random() < 0.14 && particles.length < 35) {
                    const wPos = new THREE.Vector3();
                    ws.hubGroup.getWorldPosition(wPos);
                    wPos.y = 0.15;
                    spawnParticles(wPos, 1, 'SPARK');
                }
            }
        });

        tireDriftBias = THREE.MathUtils.clamp(tireDriftBias, -2.0, 2.0);

        const engineHealthFactor = Math.max(0.75, 0.75 + 0.25 * (playerCar.subsystems.engineHp / 100));
        const speedPenaltyFactor = Math.max(0.78, 1.0 - puncturedCount * 0.055) * engineHealthFactor;
        const nosMultiplier = (state.nosActive && state.nosFuel > 0) ? 1.24 : 1.0;
        const effectiveMaxSpeed = carSpec.maxSpeed * speedPenaltyFactor * nosMultiplier;
        const effectiveAccel = carSpec.accel * speedPenaltyFactor * ((state.nosActive && state.nosFuel > 0) ? 1.85 : 1.0);

        const isAccelPressed = keys.ArrowUp || keys.KeyW;
        const isBrakePressed = keys.ArrowDown || keys.KeyS;
        const isLeftPressed = keys.ArrowLeft || keys.KeyA;
        const isRightPressed = keys.ArrowRight || keys.KeyD;

        if (state.mode === 'PLAYING') {
            const prevSpeed = state.speedKmh;

            // NOS activation check
            state.nosActive = keys.Space && state.nosFuel > 1;
            if (state.nosActive) {
                state.nosFuel = Math.max(0, state.nosFuel - 26 * dt);
                audio.playNosRoar();
            } else {
                state.nosFuel = Math.min(100, state.nosFuel + 5.5 * dt);
            }

            // Animate twin blue NOS exhaust flames
            playerCar.nosFlames.forEach(f => {
                if (state.nosActive) {
                    f.material.opacity = 0.75 + Math.random() * 0.25;
                    f.scale.set(1, 1, 0.8 + Math.random() * 0.7);
                } else {
                    f.material.opacity = 0.0;
                }
            });

            if (isAccelPressed || state.nosActive) {
                state.speedKmh = Math.min(effectiveMaxSpeed, state.speedKmh + effectiveAccel * dt);
                state.playerPitch = THREE.MathUtils.lerp(state.playerPitch, 0.032, dt * 8);
                playerCar.tailBar.scale.y = 1.0;
            } else if (isBrakePressed) {
                state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh - 175 * dt);
                state.playerPitch = THREE.MathUtils.lerp(state.playerPitch, -0.045, dt * 10);
                playerCar.tailBar.scale.y = 2.0;
            } else {
                const baseCruise = Math.min(225, 138 + state.selectedLevel * 10 + state.overtakes * 0.8);
                const targetCruise = Math.min(effectiveMaxSpeed, Math.max(95, baseCruise * speedPenaltyFactor));
                state.speedKmh = THREE.MathUtils.lerp(state.speedKmh, targetCruise, dt * 1.5);
                state.playerPitch = THREE.MathUtils.lerp(state.playerPitch, 0, dt * 6);
                playerCar.tailBar.scale.y = 1.0;
            }

            // Glow brake rotors orange-red under heavy braking!
            playerCar.wheelStates.forEach(ws => {
                if (ws.rotorMat) {
                    const targetGlow = (isBrakePressed && state.speedKmh > 100) ? 0.85 : 0.0;
                    ws.rotorMat.emissiveIntensity = THREE.MathUtils.lerp(ws.rotorMat.emissiveIntensity, targetGlow, dt * 6);
                }
            });

            state.longitudinalG = ((state.speedKmh - prevSpeed) / 3.6) / Math.max(0.01, dt * 9.81);
            if (state.speedKmh > state.topSpeedKmh) state.topSpeedKmh = state.speedKmh;

            // Vertical Jump & 4-Wheel Suspension Spring Physics
            if (state.playerY > 0 || state.playerVY !== 0) {
                state.playerY += state.playerVY * dt;
                state.playerVY -= 25.0 * dt;
                state.playerPitch = THREE.MathUtils.clamp(state.playerVY * 0.02, -0.15, 0.22);

                if (state.playerY <= 0) {
                    const landingVel = state.playerVY;
                    state.playerY = 0;
                    state.playerVY = 0;
                    if (landingVel < -6) {
                        spawnParticles(playerCar.root.position.clone(), 8, 'SPARK');
                        audio.playCrash(0.35);
                        playerCar.wheelStates.forEach(ws => { ws.suspVelY = -2.2; });
                    }
                }
            }

            let steerInput = 0;
            if (isLeftPressed) steerInput -= 1;
            if (isRightPressed) steerInput += 1;

            const airControlFactor = state.playerY > 0.2 ? 0.45 : 1.0;
            const prevVX = state.playerVX;

            if (steerInput !== 0) {
                state.playerVX += steerInput * carSpec.steerPower * mapSpec.grip * airControlFactor * dt;
            } else {
                const damping = mapSpec.grip < 0.8 ? 0.14 : 0.035;
                state.playerVX *= Math.pow(damping, dt);
            }

            state.playerVX = THREE.MathUtils.clamp(state.playerVX, -17.0, 17.0);
            state.lateralG = ((state.playerVX - prevVX) / Math.max(0.01, dt * 9.81));
            state.playerX += (state.playerVX + tireDriftBias) * dt;

            // Steering wheel & Front wheel steering angle animation
            if (playerCar.steeringWheel) {
                playerCar.steeringWheel.rotation.z = THREE.MathUtils.lerp(playerCar.steeringWheel.rotation.z, -steerInput * 0.65, dt * 12);
            }
            playerCar.wheelStates.forEach(ws => {
                if (ws.detached) return;
                // Spring-damper vertical suspension oscillation
                const roadRipple = Math.sin(clock.elapsedTime * 24 + ws.origX) * 0.008 * (state.speedKmh / 200);
                const rollComp = -ws.side * state.playerRoll * 0.35;
                ws.suspVelY += (-ws.suspOffsetY * 65 - ws.suspVelY * 10) * dt;
                ws.suspOffsetY += ws.suspVelY * dt;
                ws.hubGroup.position.y = ws.origY + (ws.punctured ? -0.08 : 0) + ws.suspOffsetY + roadRipple + rollComp;
                ws.hubGroup.rotation.z = ws.bentCamber;
                ws.hubGroup.rotation.y = (ws.isFront ? -steerInput * 0.28 : 0) + ws.bentToe;
            });

            // Animate unlatched hood & doors flapping in the high-speed wind!
            const windFactor = Math.pow(state.speedKmh / 250, 1.5);
            if (playerCar.parts.hood.latchBroken && !playerCar.parts.hood.detached) {
                playerCar.parts.hood.mesh.rotation.x = 0.25 + Math.abs(Math.sin(clock.elapsedTime * 18)) * 0.42 * windFactor;
            }
            if (playerCar.parts.doorL.latchBroken && !playerCar.parts.doorL.detached) {
                playerCar.parts.doorL.mesh.rotation.y = -0.18 - Math.max(0, state.playerVX * 0.03);
            }
            if (playerCar.parts.doorR.latchBroken && !playerCar.parts.doorR.detached) {
                playerCar.parts.doorR.mesh.rotation.y = 0.18 + Math.max(0, -state.playerVX * 0.03);
            }

            if (state.spinOutTimer > 0) {
                state.playerYaw = Math.sin(clock.elapsedTime * 16) * 0.32;
                state.playerRoll = Math.cos(clock.elapsedTime * 16) * 0.08;
            } else {
                const driftBonus = state.selectedCar === 'DRIFT' ? 1.35 : 1.0;
                state.playerYaw = THREE.MathUtils.lerp(state.playerYaw, -state.playerVX * 0.019 * driftBonus - tireDriftBias * 0.015, dt * 10);
                state.playerRoll = THREE.MathUtils.lerp(state.playerRoll, state.playerVX * 0.022 + chassisTiltBias, dt * 12);
            }

            // Guardrail collision check
            const roadLimit = ROAD_WIDTH / 2 - 1.3;
            if (Math.abs(state.playerX) > roadLimit) {
                const sideSign = Math.sign(state.playerX);
                state.playerX = sideSign * roadLimit;
                const wallImpact = Math.abs(state.playerVX);
                state.playerVX = -sideSign * Math.min(5.5, Math.max(2.0, wallImpact * 0.4));
                if (wallImpact > 3.5 && state.invulnerableTimer <= 0) {
                    state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh - 14);
                    applySoftBodyCarDamage(5 + wallImpact * 0.75, sideSign * 0.95, 0);
                }
            }

            const playerMetersPerSec = state.speedKmh / 3.6;
            state.distanceTraveled += playerMetersPerSec * dt;
            state.score += (state.speedKmh * 0.28 * lvlSpec.scoreMult) * dt;

            // Spawn Checkered Flag Finish Gate in CAREER mode when approaching Goal Distance!
            if (state.gameType === 'CAREER' && !state.finishArchSpawned && state.distanceTraveled >= state.goalDistanceMeters - 185) {
                state.finishArchSpawned = true;
                const finishObj = createFinishGoalArch(-190);
                scene.add(finishObj.mesh);
                roadTraps.push(finishObj);
                addFloatingNotification('🏁 前方に【ゴールゲート】出現!! そのまま駆け抜けろ!!', 'text-yellow-300 text-base');
            }

            if (state.distanceTraveled >= state.nextEtcDistance && !state.finishArchSpawned) {
                state.nextEtcDistance = state.distanceTraveled + lvlSpec.etcInterval + Math.random() * 140;
                spawnEtcTollPlaza(-205);
            }
        } else if (state.mode === 'EXPLODING') {
            state.speedKmh = Math.max(0, state.speedKmh - 95 * dt);
            state.playerVX *= 0.92;
            state.playerX = THREE.MathUtils.clamp(state.playerX + state.playerVX * dt, -ROAD_WIDTH / 2 + 1.5, ROAD_WIDTH / 2 - 1.5);
            playerCar.root.rotation.y += 1.5 * dt;
            state.explosionTimer -= rawDt;

            if (Math.random() < 0.25 && particles.length < 40) {
                spawnParticles(playerCar.root.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 1, 'SMOKE');
            }
            if (state.explosionTimer <= 0) {
                showGameOverModal();
            }
        }

        playerCar.root.position.set(state.playerX, state.playerY, 0);
        if (state.mode === 'PLAYING') {
            playerCar.root.rotation.y = state.playerYaw;
            playerCar.chassisGroup.rotation.z = state.playerRoll;
            playerCar.chassisGroup.rotation.x = state.playerPitch;
        }

        const playerMetersPerSec = state.speedKmh / 3.6;
        playerCar.wheels.forEach(w => {
            w.rotation.x -= playerMetersPerSec * dt * 2.2;
        });

        // Radiator white coolant steam & engine black smoke when damaged
        if (state.mode === 'PLAYING' && particles.length < 38) {
            if (playerCar.subsystems.radiatorHp < 65 && Math.random() < 0.25) {
                const radPos = playerCar.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.65, -1.9));
                spawnParticles(radPos, 1, 'STEAM');
            }
            if (state.hp < 55 && Math.random() < 0.22) {
                const hoodPos = playerCar.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.75, -1.3));
                spawnParticles(hoodPos, 1, 'SMOKE');
            }
        }

        roadTexture.offset.y -= (playerMetersPerSec * dt) / 16.5;

        streetlights.forEach(lamp => {
            lamp.position.z += playerMetersPerSec * dt;
            if (lamp.position.z > 30) lamp.position.z -= 240;
        });

        sceneryPillars.forEach(bldg => {
            bldg.position.z += playerMetersPerSec * dt * 0.85;
            if (bldg.position.z > 38) bldg.position.z -= 256;
        });

        const speedRatio = Math.max(0, (state.speedKmh - 140) / (carSpec.maxSpeed - 140));
        speedLines.forEach(line => {
            line.position.z += playerMetersPerSec * dt * 1.45;
            line.material.opacity = speedRatio * 0.55;
            if (line.position.z > 18) {
                line.position.z = -95 - Math.random() * 40;
                line.position.x = (Math.random() - 0.5) * 36;
            }
        });

        weatherParticles.forEach(wp => {
            if (mapSpec.weatherType === 'NONE') {
                wp.material.opacity = 0;
                return;
            }
            wp.material.opacity = 0.75;
            wp.material.color.setHex(mapSpec.weatherType === 'SNOW' ? 0xffffff : (mapSpec.weatherType === 'EMBER' ? 0xff5500 : 0xfde68a));
            wp.position.z += playerMetersPerSec * dt * 0.9;
            wp.position.y += (mapSpec.weatherType === 'EMBER' ? 2.5 : -3.5) * dt;
            if (wp.position.z > 18 || wp.position.y < 0 || wp.position.y > 12) {
                wp.position.z = -95 - Math.random() * 35;
                wp.position.x = (Math.random() - 0.5) * 38;
                wp.position.y = mapSpec.weatherType === 'EMBER' ? 0.5 : 8 + Math.random() * 4;
            }
        });

        const maxTraps = Math.max(1, Math.round(lvlSpec.trapCount * state.trafficDensityMult));
        if (roadTraps.length < maxTraps && state.mode === 'PLAYING' && !state.finishArchSpawned) {
            spawnRoadTrap(-155 - Math.random() * 80);
        }

        for (let i = roadTraps.length - 1; i >= 0; i--) {
            const trap = roadTraps[i];
            trap.mesh.position.z += playerMetersPerSec * dt;

            if (trap.mesh.userData && trap.mesh.userData.spinner) {
                trap.mesh.userData.spinner.rotation.x += 9.0 * dt;
            }

            // Checkered Finish Goal Arch Trigger!
            if (trap.type === 'FINISH_GOAL') {
                const dz = trap.mesh.position.z - playerCar.root.position.z;
                if (state.mode === 'PLAYING' && !trap.triggered && dz >= -2.0) {
                    trap.triggered = true;
                    showStageClearModal();
                    return;
                }
                if (trap.mesh.position.z > 28) {
                    scene.remove(trap.mesh);
                    roadTraps.splice(i, 1);
                }
                continue;
            }

            if (trap.type === 'ETC_PLAZA') {
                const dz = trap.mesh.position.z - playerCar.root.position.z;
                trap.laneConfigs.forEach(lc => {
                    if (lc.barPivot && !lc.barBroken && dz > -45 && dz < 8) {
                        const openSpeed = state.speedKmh <= 285 ? 7.0 : 1.1;
                        const targetAngle = state.speedKmh <= 285 ? 1.42 : 0.32;
                        lc.barPivot.rotation.z = THREE.MathUtils.lerp(lc.barPivot.rotation.z, targetAngle, dt * openSpeed);
                    }
                });

                if (state.mode === 'PLAYING' && !trap.triggered && Math.abs(dz) < 3.2) {
                    trap.triggered = true;
                    let hitIsland = false;
                    for (const ix of trap.islandPositions) {
                        const offsetFromIsland = state.playerX - ix;
                        if (Math.abs(offsetFromIsland) < 1.28) {
                            hitIsland = true;
                            audio.playEtcDing(false);
                            applySoftBodyCarDamage(38, -Math.sign(offsetFromIsland) * 0.8, -2.0);
                            state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh * 0.5);
                            state.playerVX = Math.sign(offsetFromIsland || 1) * 11;
                            addFloatingNotification('💥 ETC料金所の分離帯に激突!! 軟体フレーム変形!', 'text-red-500');
                            break;
                        }
                    }

                    if (!hitIsland) {
                        let closestLane = trap.laneConfigs[0];
                        let minDist = 999;
                        trap.laneConfigs.forEach(lc => {
                            const d = Math.abs(state.playerX - lc.centerX);
                            if (d < minDist) { minDist = d; closestLane = lc; }
                        });

                        if (closestLane.isClosed) {
                            audio.playEtcDing(false);
                            applySoftBodyCarDamage(30, 0, -2.0);
                            state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh * 0.6);
                            addFloatingNotification('🚫 閉鎖中のETCレーンに突入!!', 'text-red-400');
                        } else if (state.speedKmh > 285) {
                            closestLane.barBroken = true;
                            if (closestLane.barPivot) closestLane.barPivot.visible = false;
                            audio.playEtcDing(false);
                            spawnPhysicalShatterPieces(playerCar.root.position.clone().add(new THREE.Vector3(0, 1.1, -1.8)), 4, 0x38bdf8, 16);
                            applySoftBodyCarDamage(9, 0, -2.0);
                            addFloatingNotification('⚠️ ETC速度超過!! 開閉バーを粉砕突破!', 'text-amber-300');
                        } else {
                            audio.playEtcDing(true);
                            const bonus = Math.round(1000 * lvlSpec.scoreMult);
                            state.score += bonus;
                            addFloatingNotification(`🛂 ETCゲート通過! +${bonus} PTS`, 'text-emerald-300');
                        }
                    }
                }

                if (trap.mesh.position.z > 28) {
                    scene.remove(trap.mesh);
                    roadTraps.splice(i, 1);
                }
                continue;
            }

            const isLowTrap = ['SPIKE', 'OIL', 'RAMP'].includes(trap.type);
            const heightClear = isLowTrap && state.playerY > 0.65;

            if (state.mode === 'PLAYING' && !trap.triggered && !heightClear) {
                const dx = trap.mesh.position.x - state.playerX;
                const dz = trap.mesh.position.z - playerCar.root.position.z;
                const minX = (trap.width / 2) + 0.88;
                const minZ = (trap.length / 2) + 1.95;

                if (Math.abs(dx) < minX && Math.abs(dz) < minZ) {
                    trap.triggered = true;

                    if (trap.type === 'BARREL') {
                        audio.playExplosion();
                        spawnParticles(trap.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 16, 'EXPLOSION');
                        applySoftBodyCarDamage(26, dx * 0.5, -2.0);
                        state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh - 45);
                        addFloatingNotification('🛢️ 爆発ドラム缶に激突!! フロントパネル変形!', 'text-red-400');
                        scene.remove(trap.mesh);
                        roadTraps.splice(i, 1);
                        continue;
                    } else if (trap.type === 'SPIKE') {
                        let sideHit = 0;
                        if (dx < -0.42) sideHit = -1;
                        else if (dx > 0.42) sideHit = 1;
                        audio.playTireScreech();
                        damageSpecificTires(sideHit, true, 100);
                        applySoftBodyCarDamage(8, dx * 0.5, -1.4);
                    } else if (trap.type === 'OIL') {
                        audio.playTireScreech();
                        state.spinOutTimer = 1.15;
                        state.playerVX += (Math.random() > 0.5 ? 1 : -1) * 13.5;
                        addFloatingNotification('💧 オイル罠でスリップ!!', 'text-purple-300');
                    } else if (trap.type === 'RAMP') {
                        state.playerVY = Math.min(16.0, 9.0 + (state.speedKmh / 38));
                        state.playerY = 0.25;
                        const jumpBonus = Math.round(700 * lvlSpec.scoreMult);
                        state.score += jumpBonus;
                        state.nosFuel = Math.min(100, state.nosFuel + 25);
                        audio.playOvertake();
                        addFloatingNotification(`🚀 BIG AIR JUMP!! +${jumpBonus} PTS & NOS回復!`, 'text-sky-300');
                    } else if (trap.type === 'CONTAINER' || trap.type === 'CONCRETE_WALL') {
                        applySoftBodyCarDamage(34, dx * 0.6, -2.0);
                        state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh * 0.52);
                        state.playerVX += (dx >= 0 ? -1 : 1) * 11;
                        addFloatingNotification('🧱 衝突バリアに激突!! クランプルゾーン圧縮変形!', 'text-orange-400');
                    } else if (trap.type === 'CRUSHER') {
                        // Top-down roof & hood crushing deformation!
                        applySoftBodyCarDamage(38, dx * 0.4, -0.5, new THREE.Vector3(0, -0.85, 0.35));
                        state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh * 0.65);
                        addFloatingNotification('⚙️ 巨大油圧クラッシャーでルーフ＆ボンネット圧壊!!', 'text-fuchsia-400');
                    } else if (trap.type === 'REPAIR') {
                        repairAllSoftBodyAndTires(false);
                        scene.remove(trap.mesh);
                        roadTraps.splice(i, 1);
                        continue;
                    }
                }
            }

            if (trap.mesh.position.z > 26) {
                scene.remove(trap.mesh);
                roadTraps.splice(i, 1);
            }
        }

        // Traffic spawning scaled by user-adjustable trafficDensityMult!
        const targetTrafficCount = Math.max(2, Math.round(lvlSpec.trafficCount * state.trafficDensityMult));
        if (trafficCars.length < targetTrafficCount && state.mode === 'PLAYING') {
            spawnTrafficVehicle(-160 - Math.random() * 85);
        }

        for (let i = trafficCars.length - 1; i >= 0; i--) {
            const tc = trafficCars[i];
            const relativeSpeedMs = (state.speedKmh - tc.speedKmh) / 3.6;

            if (state.mode === 'PLAYING' && !tc.hitByPlayer) {
                const dz = tc.mesh.position.z - playerCar.root.position.z;
                const dx = state.playerX - tc.mesh.position.x;

                if (tc.type === 'ROAD_RAGE') {
                    if (tc.hazardLights) tc.hazardLights.visible = Math.floor(clock.elapsedTime * 10) % 2 === 0;
                    // Moderated Road-Rage swerve so player can outmaneuver or ram them!
                    if (dz > -65 && dz < -8 && Math.abs(dx) < 7.5) {
                        const swerveDir = Math.sign(dx);
                        tc.vx += swerveDir * 11.5 * dt;
                        tc.vx = THREE.MathUtils.clamp(tc.vx, -5.8, 5.8);
                        tc.mesh.rotation.y = -tc.vx * 0.025;

                        if (!tc.honked && dz > -45) {
                            tc.honked = true;
                            audio.playHorn(true);
                            addFloatingNotification('💢 煽り運転車が幅寄せ中! ([H]クラクションで威嚇または追い越せ)', 'text-fuchsia-400');
                        }
                    }
                } else if (tc.type === 'WRONG_WAY') {
                    if (tc.hazardLights) tc.hazardLights.visible = Math.floor(clock.elapsedTime * 12) % 2 === 0;
                    // Keep wrong-way car mostly in its lane so the top radar warning is 100% reliable!
                    tc.vx += Math.sin(clock.elapsedTime * 2.5 + i) * 1.4 * dt;

                    if (!tc.honked && dz > -110 && dz < -15 && Math.abs(dx) < 5.5) {
                        tc.honked = true;
                        audio.playHorn(false);
                        addFloatingNotification(`🔱 警告!! 第${tc.laneIndex + 1}レーンから【高齢者逆走車】接近中!!`, 'text-yellow-300');
                    }
                }
            }

            tc.mesh.position.z += (relativeSpeedMs + tc.vz) * dt;
            tc.mesh.position.x += tc.vx * dt;
            if (tc.vy !== 0 || tc.mesh.position.y > 0) {
                tc.mesh.position.y += tc.vy * dt;
                tc.vy -= 22.0 * dt;
                if (tc.mesh.position.y <= 0) {
                    tc.mesh.position.y = 0;
                    tc.vy = 0;
                }
            }
            tc.mesh.rotation.y += tc.yawRate * dt;
            tc.mesh.rotation.z += tc.rollRate * dt;
            tc.vx *= Math.pow(0.15, dt);
            tc.vz *= Math.pow(0.2, dt);

            if (tc.sirenBar) tc.sirenBar.rotation.y += 12 * dt;

            const limit = ROAD_WIDTH / 2 - tc.width / 2;
            if (Math.abs(tc.mesh.position.x) > limit) {
                tc.mesh.position.x = Math.sign(tc.mesh.position.x) * limit;
                tc.vx = -tc.vx * 0.6;
            }

            if (state.mode === 'PLAYING' && state.playerY < 1.5) {
                const dx = tc.mesh.position.x - state.playerX;
                const dz = tc.mesh.position.z - playerCar.root.position.z;
                const minX = (tc.width / 2) + 0.86;
                const minZ = (tc.length / 2) + 2.02;

                if (!tc.hitByPlayer && state.invulnerableTimer <= 0 && Math.abs(dx) < minX && Math.abs(dz) < minZ) {
                    const overlapX = minX - Math.abs(dx);
                    const overlapZ = minZ - Math.abs(dz);
                    const relKmh = Math.max(20, Math.abs(state.speedKmh - tc.speedKmh));

                    tc.hitByPlayer = true;
                    const crashWorldPos = tc.mesh.position.clone().add(new THREE.Vector3(-dx * 0.4, 0.7, dz > 0 ? -tc.length * 0.4 : tc.length * 0.4));
                    spawnPhysicalShatterPieces(crashWorldPos, 3, 0x94a3b8, 13);

                    // Deform the traffic vehicle's own 3D mesh at the impact point!
                    if (tc.deformableTrafficMeshes) {
                        const trafficForce = new THREE.Vector3(dx * 0.25, 0.12, -0.45);
                        tc.deformableTrafficMeshes.forEach(tm => {
                            deformMeshAtPoint(tm, crashWorldPos, trafficForce, 1.5);
                        });
                    }

                    // Mass ratio between player car and traffic car determines momentum transfer!
                    const playerMass = CAR_SPECS[state.selectedCar].massKg || 1500;
                    const trafficMass = tc.type === 'TRUCK' ? 4200 : 1400;
                    const massAdvantage = playerMass / trafficMass;

                    if (overlapZ < overlapX && dz < 0) {
                        const baseImpact = tc.isWrongWay ? 19 : 10;
                        const dmg = Math.min(36, (baseImpact + relKmh * 0.09) / Math.sqrt(massAdvantage));
                        applySoftBodyCarDamage(dmg, dx * 0.5, -2.0);

                        if (tc.isWrongWay) {
                            addFloatingNotification('💥 逆走車と正面衝突!! 両車のフロントが軟体圧壊!', 'text-red-500');
                        } else if (tc.type === 'ROAD_RAGE') {
                            addFloatingNotification('💥 煽り運転車を後方からプッシュ撃破!! +500 PTS', 'text-fuchsia-300');
                            state.score += 500;
                        }

                        tc.vz = (-20 - (relKmh * 0.09)) * massAdvantage;
                        tc.vx = (dx >= 0 ? 1 : -1) * (9 + Math.random() * 6) * massAdvantage;
                        tc.vy = Math.min(6.5, relKmh * 0.025 * massAdvantage);
                        tc.yawRate = (Math.random() - 0.5) * 4.5;

                        state.speedKmh = Math.max(state.minSpeedKmh, state.speedKmh * (0.62 + 0.15 * Math.min(1.5, massAdvantage)));
                        state.playerVX += (dx >= 0 ? -1 : 1) * 4.0;
                    } else {
                        const pushSign = dx >= 0 ? -1 : 1;
                        const dmg = Math.min(20, (7 + Math.abs(state.playerVX) * 0.75) / Math.sqrt(massAdvantage));
                        applySoftBodyCarDamage(dmg, -pushSign * 0.85, 0);

                        if (tc.type === 'ROAD_RAGE') {
                            addFloatingNotification('💢 煽り運転車とサイドボディ激突!!', 'text-fuchsia-400');
                        }

                        const roadLimit = ROAD_WIDTH / 2 - 1.35;
                        state.playerX = THREE.MathUtils.clamp(tc.mesh.position.x + pushSign * (minX + 0.15), -roadLimit, roadLimit);
                        state.playerVX = pushSign * 5.0;
                        tc.vx = -pushSign * 12 * massAdvantage;
                        tc.yawRate = -pushSign * 2.2;
                    }
                }

                if (!tc.overtaken && tc.mesh.position.z > 3.2) {
                    tc.overtaken = true;
                    state.overtakes++;
                    state.combo++;
                    state.nosFuel = Math.min(100, state.nosFuel + 8);

                    const lateralGap = Math.abs(tc.mesh.position.x - state.playerX) - (tc.width / 2 + 0.95);
                    if (!tc.hitByPlayer && (tc.isWrongWay || tc.type === 'ROAD_RAGE')) {
                        const hazardBonus = Math.round(900 * lvlSpec.scoreMult);
                        state.score += hazardBonus;
                        audio.playOvertake();
                        const label = tc.isWrongWay ? '🔱 逆走車を華麗に回避!' : '💢 煽り運転車を振り切った!';
                        addFloatingNotification(`${label} +${hazardBonus} PTS`, 'text-fuchsia-300');
                    } else if (!tc.hitByPlayer && lateralGap < 1.6 && state.speedKmh > 160) {
                        const bonus = Math.round(500 * Math.min(6, state.combo) * lvlSpec.scoreMult);
                        state.score += bonus;
                        audio.playOvertake();
                        addFloatingNotification(`⚡ NEAR MISS OVERTAKE! +${bonus} (${state.combo}x)`, 'text-amber-300');
                    } else {
                        state.score += Math.round(160 * lvlSpec.scoreMult);
                        audio.playOvertake();
                    }
                }
            }

            if (tc.mesh.position.z > 28 || tc.mesh.position.z < -250) {
                scene.remove(tc.mesh);
                trafficCars.splice(i, 1);
            }
        }

        updateCameraTransform(rawDt, speedRatio);
        audio.updateEngine(state.speedKmh, isAccelPressed || state.nosActive, state.mode === 'PLAYING', state.selectedCar, state.timeScale);
        updateHUD();
    }

    function updateCameraTransform(dt, speedRatio) {
        const nosFovBoost = state.nosActive ? 10 : 0;
        const targetFov = 60 + speedRatio * 16 + nosFovBoost;
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 6);
        camera.updateProjectionMatrix();

        let offset = new THREE.Vector3(0, 3.2 + state.playerY * 0.6, 7.6);
        let lookTarget = new THREE.Vector3(state.playerX * 0.88, 0.9 + state.playerY * 0.8, -14);

        if (state.cameraPreset === 1) {
            offset.set(0, 1.75 + state.playerY * 0.5, 5.2);
            lookTarget.set(state.playerX * 0.95, 0.75 + state.playerY * 0.8, -18);
        } else if (state.cameraPreset === 2) {
            offset.set(0, 1.32 + state.playerY, -0.35);
            lookTarget.set(state.playerX, 1.1 + state.playerY, -35);
        } else if (state.cameraPreset === 3) {
            offset.set(0, 13.5, 10.5);
            lookTarget.set(state.playerX * 0.6, 0, -16);
        }

        const cosY = Math.cos(state.cameraDragYaw);
        const sinY = Math.sin(state.cameraDragYaw);
        const rotatedX = offset.x * cosY + offset.z * sinY;
        const rotatedZ = -offset.x * sinY + offset.z * cosY;

        const desiredCamPos = new THREE.Vector3(
            state.playerX * 0.88 + rotatedX,
            Math.max(0.8, offset.y + state.cameraDragPitch * 3.5),
            rotatedZ
        );

        if (state.mode === 'EXPLODING' && state.explosionTimer > 1.2) {
            desiredCamPos.x += (Math.random() - 0.5) * 0.25;
            desiredCamPos.y += (Math.random() - 0.5) * 0.25;
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
        detachedDebris.forEach(d => {
            scene.remove(d.mesh);
            physicsWorld.removeBody(d.body);
        });
        detachedDebris = [];
        particles.forEach(p => scene.remove(p.mesh));
        particles = [];

        state.playerX = LANE_CENTERS[2];
        state.playerY = 0;
        state.playerVY = 0;
        rebuildPlayerCar();
        applyMapTheme(state.selectedMap);

        const lvlSpec = LEVEL_SPECS[state.selectedLevel] || LEVEL_SPECS[2];
        state.mode = 'PLAYING';
        state.hp = 100;
        state.nosFuel = 100;
        state.score = 0;
        state.overtakes = 0;
        state.combo = 0;
        state.speedKmh = 145;
        state.topSpeedKmh = 145;
        state.playerVX = 0;
        state.playerYaw = 0;
        state.playerRoll = 0;
        state.playerPitch = 0;
        state.peakImpactG = 0;
        state.spinOutTimer = 0;
        state.distanceTraveled = 0;
        state.goalDistanceMeters = lvlSpec.goalKm * 1000;
        state.finishArchSpawned = false;
        state.nextEtcDistance = 280;
        state.cameraDragYaw = 0;
        state.cameraDragPitch = 0;

        // Show sandbox toolbar only in SANDBOX mode
        const sbBar = document.getElementById('sandbox-toolbar');
        if (sbBar) {
            sbBar.classList.toggle('hidden', state.gameType !== 'SANDBOX');
        }

        const initTraffic = Math.max(2, Math.round(lvlSpec.trafficCount * state.trafficDensityMult));
        for (let i = 0; i < initTraffic; i++) {
            spawnTrafficVehicle(-55 - i * (150 / initTraffic));
        }

        const initTraps = Math.max(1, Math.round(lvlSpec.trapCount * state.trafficDensityMult));
        for (let i = 0; i < initTraps; i++) {
            spawnRoadTrap(-65 - i * 42);
        }

        updateHUD();
        updateDamageSchematicUI();
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    function openGarageModal() {
        state.mode = 'MENU';
        state.cameraDragYaw = 0.45;
        state.cameraDragPitch = 0.08;
        const modal = document.getElementById('modal-overlay');
        modal.classList.remove('hidden');
        document.getElementById('result-stats').classList.add('hidden');
        document.getElementById('modal-badge').innerHTML = '<i class="fa-solid fa-bolt"></i> BEAMNG SOFT-BODY VERTEX PHYSICS & 3D SHOWROOM';
        document.getElementById('modal-badge').className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-[10px] font-bold';
        document.getElementById('modal-title').textContent = 'SHOWROOM & STAGE SELECT';
        document.getElementById('btn-start-text').textContent = 'エンジン始動・出撃！';
    }

    function showStageClearModal() {
        state.mode = 'STAGECLEAR';
        clearedLevels[state.selectedLevel] = true;
        try {
            localStorage.setItem('apex_beamng_cleared', JSON.stringify(clearedLevels));
        } catch (e) {}

        audio.playEtcDing(true);
        const modal = document.getElementById('modal-overlay');
        modal.classList.remove('hidden');

        document.getElementById('modal-badge').innerHTML = '<i class="fa-solid fa-trophy"></i> STAGE CLEAR!! 目標距離達成・完全制覇！';
        document.getElementById('modal-badge').className = 'inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 text-xs font-bold';
        document.getElementById('modal-title').textContent = `🏆 LEVEL ${state.selectedLevel} CLEARED!!`;

        const statsBox = document.getElementById('result-stats');
        statsBox.classList.remove('hidden');
        statsBox.classList.add('grid');

        const rank = state.hp >= 75 ? 'S' : (state.hp >= 40 ? 'A' : 'B');
        document.getElementById('final-score').textContent = `${Math.floor(state.score).toLocaleString()} (RANK ${rank})`;
        document.getElementById('final-overtakes').textContent = `${state.overtakes}台`;
        document.getElementById('final-topspeed').textContent = `${Math.round(state.topSpeedKmh)} km/h`;
        document.getElementById('btn-start-text').textContent = '次のステージへ出撃！';
        updateStageHUDLabels();
    }

    function showGameOverModal() {
        state.mode = 'GAMEOVER';
        const modal = document.getElementById('modal-overlay');
        modal.classList.remove('hidden');

        document.getElementById('modal-badge').innerHTML = '<i class="fa-solid fa-skull-crossbones"></i> VEHICLE DESTROYED - 耐久度 0% 大爆発';
        document.getElementById('modal-badge').className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/20 border border-red-400/40 text-red-300 text-[10px] font-bold';
        document.getElementById('modal-title').textContent = 'TOTAL WRECKED!';

        const statsBox = document.getElementById('result-stats');
        statsBox.classList.remove('hidden');
        statsBox.classList.add('grid');

        document.getElementById('final-score').textContent = Math.floor(state.score).toLocaleString();
        document.getElementById('final-overtakes').textContent = `${state.overtakes}台`;
        document.getElementById('final-topspeed').textContent = `${Math.round(state.topSpeedKmh)} km/h`;
        document.getElementById('btn-start-text').textContent = 'リトライ (RETRY)';
    }

    function onWindowResize() {
        const wrapper = document.getElementById('canvas-wrapper');
        if (!wrapper || !renderer || !camera) return;
        camera.aspect = wrapper.clientWidth / wrapper.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    }

    function toggleBeamSkeleton() {
        state.beamSkeletonVisible = !state.beamSkeletonVisible;
        if (playerCar && playerCar.beamSkeleton) {
            playerCar.beamSkeleton.visible = state.beamSkeletonVisible;
        }
        const btn = document.getElementById('btn-beam-view');
        if (btn) {
            btn.classList.toggle('border-emerald-400', state.beamSkeletonVisible);
            btn.classList.toggle('text-emerald-300', state.beamSkeletonVisible);
        }
        addFloatingNotification(
            state.beamSkeletonVisible ? '🟢 BeamNG 構造ノード・応力スケルトン表示: ON' : '⚪ BeamNG 構造ノード表示: OFF',
            'text-emerald-300'
        );
    }

    function toggleSlowMotion() {
        state.slowMoActive = !state.slowMoActive;
        const btn = document.getElementById('btn-slowmo');
        if (btn) {
            btn.classList.toggle('border-fuchsia-400', state.slowMoActive);
            btn.classList.toggle('text-fuchsia-300', state.slowMoActive);
        }
        addFloatingNotification(
            state.slowMoActive ? '⏱️ BULLET-TIME スローモーション (0.28x): ON' : '▶️ 通常速度 (1.0x)',
            'text-fuchsia-300'
        );
    }

    function cycleCameraView() {
        state.cameraPreset = (state.cameraPreset + 1) % 4;
        state.cameraDragYaw = 0;
        state.cameraDragPitch = 0;
        const labels = ['チェイス', 'ローアングル', 'コックピット', 'ヘリ俯瞰'];
        const el = document.getElementById('camera-label');
        if (el) el.textContent = labels[state.cameraPreset];
    }

    function setupInputListeners() {
        const setKeyState = (code, isPressed) => {
            if (code in keys) {
                keys[code] = isPressed;
                const btnMap = {
                    ArrowLeft: 'ctrl-left',
                    KeyA: 'ctrl-left',
                    ArrowRight: 'ctrl-right',
                    KeyD: 'ctrl-right',
                    ArrowUp: 'ctrl-up',
                    KeyW: 'ctrl-up',
                    ArrowDown: 'ctrl-down',
                    KeyS: 'ctrl-down',
                    Space: 'ctrl-nos'
                };
                const btn = document.getElementById(btnMap[code]);
                if (btn) btn.classList.toggle('active-key', isPressed);
            }
        };

        window.addEventListener('keydown', (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
            setKeyState(e.code, true);

            if (e.code === 'KeyC') cycleCameraView();
            if (e.code === 'KeyV') toggleBeamSkeleton();
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') toggleSlowMotion();
            if (e.code === 'KeyR') repairAllSoftBodyAndTires(false);
            if (e.code === 'KeyH') triggerPlayerHornAndFlash();
            if (e.code === 'F11') {
                try {
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('toggle-fullscreen');
                } catch (err) {}
            }
            if (e.code === 'Enter' && state.mode !== 'PLAYING' && state.mode !== 'EXPLODING') {
                startNewRace();
            }
        });

        window.addEventListener('keyup', (e) => {
            setKeyState(e.code, false);
        });

        const bindControlBtn = (btnId, keyCode) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const press = (e) => { e.preventDefault(); setKeyState(keyCode, true); };
            const release = (e) => { e.preventDefault(); setKeyState(keyCode, false); };

            btn.addEventListener('mousedown', press);
            btn.addEventListener('mouseup', release);
            btn.addEventListener('mouseleave', release);
            btn.addEventListener('touchstart', press, { passive: false });
            btn.addEventListener('touchend', release, { passive: false });
        };

        bindControlBtn('ctrl-left', 'ArrowLeft');
        bindControlBtn('ctrl-right', 'ArrowRight');
        bindControlBtn('ctrl-up', 'ArrowUp');
        bindControlBtn('ctrl-down', 'ArrowDown');
        bindControlBtn('ctrl-nos', 'Space');

        // Home / Garage Tab Switching
        document.querySelectorAll('.garage-tab-btn').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                document.querySelectorAll('.garage-tab-btn').forEach(b => b.classList.remove('active-tab'));
                tabBtn.classList.add('active-tab');
                const targetId = tabBtn.getAttribute('data-tab');
                document.querySelectorAll('.garage-tab-pane').forEach(p => p.classList.add('hidden'));
                const targetPane = document.getElementById(targetId);
                if (targetPane) targetPane.classList.remove('hidden');
            });
        });

        // Car Selection Cards
        document.querySelectorAll('#car-select-grid .select-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#car-select-grid .select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                state.selectedCar = card.getAttribute('data-car');
                state.customPaintColor = null;
                rebuildPlayerCar();
                updateStageHUDLabels();
            });
        });

        // Custom Paint Swatches
        document.querySelectorAll('.paint-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                const hex = parseInt(sw.getAttribute('data-color'), 16);
                state.customPaintColor = hex;
                rebuildPlayerCar();
            });
        });

        // Finish Selector (Metallic / Matte / Chrome)
        document.querySelectorAll('.finish-btn').forEach(fb => {
            fb.addEventListener('click', () => {
                document.querySelectorAll('.finish-btn').forEach(b => b.classList.remove('selected'));
                fb.classList.add('selected');
                state.customFinish = fb.getAttribute('data-finish');
                rebuildPlayerCar();
            });
        });

        // Showroom Live Soft-Body Crash Test Preview Button!
        const btnTestDent = document.getElementById('btn-showroom-dent');
        if (btnTestDent) {
            btnTestDent.addEventListener('click', () => {
                audio.init();
                const randX = (Math.random() - 0.5) * 1.3;
                const randZ = Math.random() > 0.35 ? -2.0 : (Math.random() > 0.5 ? 0 : 1.9);
                applySoftBodyCarDamage(28, randX, randZ);
            });
        }

        const btnTestRepair = document.getElementById('btn-showroom-repair');
        if (btnTestRepair) {
            btnTestRepair.addEventListener('click', () => {
                audio.init();
                repairAllSoftBodyAndTires(true);
            });
        }

        const btnShowroomBeam = document.getElementById('btn-showroom-beam');
        if (btnShowroomBeam) {
            btnShowroomBeam.addEventListener('click', toggleBeamSkeleton);
        }

        // Game Mode Selection (Career / Endless / Sandbox)
        document.querySelectorAll('#mode-select-grid .select-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#mode-select-grid .select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                state.gameType = card.getAttribute('data-mode');
                updateStageHUDLabels();
            });
        });

        // Map Selection
        document.querySelectorAll('#map-select-grid .select-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#map-select-grid .select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                state.selectedMap = card.getAttribute('data-map');
                applyMapTheme(state.selectedMap);
            });
        });

        // Level Selection
        document.querySelectorAll('#level-select-grid .select-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('#level-select-grid .select-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                state.selectedLevel = parseInt(card.getAttribute('data-level'), 10);
                updateStageHUDLabels();
            });
        });

        // Traffic Density Slider
        const densitySlider = document.getElementById('traffic-density-slider');
        const densityValLabel = document.getElementById('traffic-density-label');
        if (densitySlider) {
            densitySlider.addEventListener('input', (e) => {
                const pct = parseInt(e.target.value, 10);
                state.trafficDensityMult = pct / 100;
                if (densityValLabel) densityValLabel.textContent = `${pct}%`;
            });
        }

        // Sandbox Toolbar Spawn Buttons
        const bindSandboxSpawn = (btnId, trapType) => {
            const b = document.getElementById(btnId);
            if (b) {
                b.addEventListener('click', () => {
                    spawnRoadTrap(-95, trapType);
                    addFloatingNotification(`🧪 前方に【${trapType}】を配置しました!`, 'text-cyan-300');
                });
            }
        };
        bindSandboxSpawn('sb-spawn-crusher', 'CRUSHER');
        bindSandboxSpawn('sb-spawn-wall', 'CONCRETE_WALL');
        bindSandboxSpawn('sb-spawn-ramp', 'RAMP');
        bindSandboxSpawn('sb-spawn-barrel', 'BARREL');

        const sbRepairBtn = document.getElementById('sb-btn-repair');
        if (sbRepairBtn) sbRepairBtn.addEventListener('click', () => repairAllSoftBodyAndTires(true));

        // Mouse Orbit Camera Control
        const canvas = document.getElementById('game-canvas');
        canvas.addEventListener('mousedown', (e) => {
            state.isMouseDragging = true;
            state.lastMouseX = e.clientX;
            state.lastMouseY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!state.isMouseDragging) return;
            const dx = e.clientX - state.lastMouseX;
            const dy = e.clientY - state.lastMouseY;
            state.lastMouseX = e.clientX;
            state.lastMouseY = e.clientY;

            state.cameraDragYaw = state.mode === 'MENU'
                ? state.cameraDragYaw - dx * 0.008
                : THREE.MathUtils.clamp(state.cameraDragYaw - dx * 0.007, -1.3, 1.3);
            state.cameraDragPitch = THREE.MathUtils.clamp(state.cameraDragPitch + dy * 0.005, -0.35, 0.85);
        });

        window.addEventListener('mouseup', () => {
            state.isMouseDragging = false;
        });

        document.getElementById('btn-garage').addEventListener('click', openGarageModal);
        document.getElementById('btn-camera').addEventListener('click', cycleCameraView);
        const btnBeam = document.getElementById('btn-beam-view');
        if (btnBeam) btnBeam.addEventListener('click', toggleBeamSkeleton);
        const btnSlow = document.getElementById('btn-slowmo');
        if (btnSlow) btnSlow.addEventListener('click', toggleSlowMotion);
        const btnRepairHud = document.getElementById('btn-repair-hud');
        if (btnRepairHud) btnRepairHud.addEventListener('click', () => repairAllSoftBodyAndTires(false));

        document.getElementById('btn-bgm').addEventListener('click', () => {
            audio.init();
            audio.bgmMode = (audio.bgmMode + 1) % 4;
            const labels = ['BGM OFF', 'BGM 1: SYNTH', 'BGM 2: EURO', 'BGM 3: DARK'];
            document.getElementById('bgm-label').textContent = labels[audio.bgmMode];
            document.getElementById('bgm-icon').className = audio.bgmMode === 0
                ? 'fa-solid fa-music text-slate-500'
                : 'fa-solid fa-music text-pink-400 animate-pulse';
        });

        document.getElementById('btn-sound').addEventListener('click', () => {
            audio.init();
            audio.sfxEnabled = !audio.sfxEnabled;
            const icon = document.getElementById('sound-icon');
            icon.className = audio.sfxEnabled
                ? 'fa-solid fa-volume-high text-emerald-400'
                : 'fa-solid fa-volume-xmark text-slate-400';
        });

        document.getElementById('btn-start').addEventListener('click', startNewRace);
        const btnStartBottom = document.getElementById('btn-start-bottom');
        if (btnStartBottom) btnStartBottom.addEventListener('click', startNewRace);
    }

    function animate() {
        requestAnimationFrame(animate);
        const rawDt = Math.min(clock.getDelta(), 0.05);
        updateGamePhysics(rawDt);
        renderer.render(scene, camera);
    }

    // Automated Electron Smoke Test Verification
    function setupSmokeTestHandler() {
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.on('run-smoke-test', () => {
                try {
                    startNewRace();
                    applySoftBodyCarDamage(25, -0.5, -2.0);
                    toggleBeamSkeleton();
                    updateGamePhysics(0.016);
                    renderer.render(scene, camera);
                    ipcRenderer.send('smoke-test-result', {
                        ok: true,
                        carVerticesDeformed: playerCar.deformableMeshes.length,
                        trafficCount: trafficCars.length,
                        mode: state.mode
                    });
                } catch (err) {
                    ipcRenderer.send('smoke-test-result', { ok: false, error: err.message });
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
